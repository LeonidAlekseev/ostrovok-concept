import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

/**
 * The Supabase part of the docs (`/api/openapi/supabase.json`) from src/lib/db/database.types.ts: the tables, views
 * and functions the code of `src` calls (`.from('…')`, `.rpc('…')`), as PostgREST serves them. Supabase gives its own
 * OpenAPI only to the service role key, so it is generated from the types offline: `npm run docs:supabase` writes
 * supabase.gen.json, and a test checks the file against the types and the code. Not a part of the app's bundle: the
 * script and the test import it.
 */

type JsonSchema = Record<string, unknown>

/** JSON of any shape: `Json` of the types. */
const ANY_JSON: JsonSchema = { description: 'JSON' }

const NOT_NULL_JSON: JsonSchema = { type: ['object', 'array', 'string', 'number', 'boolean'], description: 'JSON' }

/** The members of a type literal by their names. */
function members(node: ts.TypeNode | undefined): Map<string, ts.PropertySignature> {
  const result = new Map<string, ts.PropertySignature>()
  if (!node || !ts.isTypeLiteralNode(node)) return result
  for (const member of node.members)
    if (
      ts.isPropertySignature(member) &&
      member.name &&
      (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
    )
      result.set(member.name.text, member)
  return result
}

/** The type of `Database[path[0]][path[1]]…`, or `undefined`. */
function at(root: ts.TypeNode, path: readonly string[]): ts.TypeNode | undefined {
  let node: ts.TypeNode | undefined = root
  for (const key of path) node = members(node).get(key)?.type
  return node
}

/** JSON Schema of a type of the generated file: what `supabase gen types` writes, and nothing else. */
function toSchema(node: ts.TypeNode, database: ts.TypeNode, source: ts.SourceFile): JsonSchema {
  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
      return { type: 'string' }
    case ts.SyntaxKind.NumberKeyword:
      return { type: 'number' }
    case ts.SyntaxKind.BooleanKeyword:
      return { type: 'boolean' }
    case ts.SyntaxKind.UnknownKeyword:
      return {}
    case ts.SyntaxKind.UndefinedKeyword:
      return { type: 'null' }
    case ts.SyntaxKind.NeverKeyword:
      return { not: {} }
  }
  if (ts.isLiteralTypeNode(node)) {
    const { literal } = node
    if (literal.kind === ts.SyntaxKind.NullKeyword) return { type: 'null' }
    if (ts.isStringLiteral(literal)) return { type: 'string', const: literal.text }
    if (ts.isNumericLiteral(literal)) return { type: 'number', const: Number(literal.text) }
    if (literal.kind === ts.SyntaxKind.TrueKeyword || literal.kind === ts.SyntaxKind.FalseKeyword)
      return { type: 'boolean', const: literal.kind === ts.SyntaxKind.TrueKeyword }
  }
  if (ts.isParenthesizedTypeNode(node)) return toSchema(node.type, database, source)
  if (ts.isArrayTypeNode(node)) return { type: 'array', items: toSchema(node.elementType, database, source) }
  if (ts.isTypeLiteralNode(node)) {
    const properties: Record<string, JsonSchema> = {}
    const required: string[] = []
    for (const [name, member] of members(node)) {
      properties[name] = member.type ? toSchema(member.type, database, source) : {}
      if (!member.questionToken) required.push(name)
    }
    return { type: 'object', properties, ...(required.length > 0 && { required }) }
  }
  if (ts.isUnionTypeNode(node)) {
    const parts = node.types.map((part) => toSchema(part, database, source))
    // `string | null` → `type: ['string', 'null']`; anything richer stays `anyOf`.
    const bare = parts.every((part) => Object.keys(part).length === 1 && typeof part.type === 'string')
    return bare ? { type: [...new Set(parts.map((part) => part.type as string))] } : { anyOf: parts }
  }
  if (ts.isIndexedAccessTypeNode(node)) {
    // `Database["public"]["Enums"]["x"]`: the type it names.
    const path: string[] = []
    let current: ts.TypeNode = node
    while (ts.isIndexedAccessTypeNode(current)) {
      const index = current.indexType
      if (!ts.isLiteralTypeNode(index) || !ts.isStringLiteral(index.literal)) break
      path.unshift(index.literal.text)
      current = current.objectType
    }
    const target =
      ts.isTypeReferenceNode(current) && current.typeName.getText(source) === 'Database' && at(database, path)
    if (target) return toSchema(target, database, source)
  }
  if (ts.isTypeReferenceNode(node)) {
    const name = node.typeName.getText(source)
    const args = node.typeArguments?.map((arg) => arg.getText(source)) ?? []
    if (name === 'Json') return ANY_JSON
    if (name === 'NonNullable' && args[0] === 'Json') return NOT_NULL_JSON
    if (name === 'Record' && args[1] === 'never') return { type: 'object', additionalProperties: false }
  }
  return { description: `TypeScript: ${node.getText(source)}` }
}

/** Every `.ts`/`.tsx` file of `dir` but the tests and the generated types, by path. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith('.types.ts')
      ? [path]
      : []
  })
}

/** The tables and views (`from`) and the functions (`rpc`) the code calls, with the files that call each. */
export function supabaseCalls(root: string): { from: Map<string, string[]>; rpc: Map<string, string[]> } {
  const calls = { from: new Map<string, string[]>(), rpc: new Map<string, string[]>() }
  for (const file of sourceFiles(join(root, 'src')).sort()) {
    const text = readFileSync(file, 'utf8')
    for (const [, kind, name] of text.matchAll(/\.(from|rpc)\(\s*'([a-z_][a-z0-9_]*)'/g)) {
      const files = calls[kind as 'from' | 'rpc'].get(name) ?? []
      const path = relative(root, file)
      if (!files.includes(path)) files.push(path)
      calls[kind as 'from' | 'rpc'].set(name, files)
    }
  }
  return calls
}

const SECURITY_DESCRIPTION =
  'Публичный anon-ключ проекта (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) в `apikey` и, для данных пользователя, его сессия в `Authorization: Bearer`. Что можно читать и вызывать, решают RLS и права базы; ключ service role приложению в браузере не нужен и здесь не публикуется.'

/** The OpenAPI 3.1 document of the Supabase calls of the code, without `servers`: the route adds the project's URL. */
export function supabaseDocument(root: string): Record<string, unknown> {
  const path = join(root, 'src/lib/db/database.types.ts')
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const alias = source.statements.find(
    (statement): statement is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(statement) && statement.name.text === 'Database',
  )
  if (!alias) throw new Error('database.types.ts has no Database type')
  const database = alias.type
  const calls = supabaseCalls(root)
  const schemas: Record<string, JsonSchema> = {}
  const paths: Record<string, unknown> = {}
  const security = [{ anonKey: [] }, { anonKey: [], session: [] }]

  for (const [name, files] of [...calls.from].sort(([a], [b]) => a.localeCompare(b))) {
    const kind = members(at(database, ['public', 'Tables'])).has(name) ? 'Tables' : 'Views'
    const row = at(database, ['public', kind, name, 'Row'])
    if (!row) throw new Error(`${files[0]} reads ${name}, which database.types.ts does not have: npm run db:types`)
    schemas[name] = toSchema(row, database, source)
    paths[`/${name}`] = {
      get: {
        operationId: `select_${name}`,
        tags: [kind === 'Tables' ? 'Таблицы' : 'Представления'],
        summary: name,
        description: `Строки \`${name}\` через PostgREST: \`select\` — столбцы, фильтры — \`столбец=eq.значение\`.`,
        'x-used-in': files,
        parameters: [
          {
            name: 'select',
            in: 'query',
            description: 'Столбцы через запятую',
            schema: { type: 'string', default: '*' },
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Не больше строк',
            schema: { type: 'integer', minimum: 1 },
          },
        ],
        responses: {
          200: {
            description: 'Строки',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: `#/components/schemas/${name}` } },
              },
            },
          },
        },
      },
    }
  }

  for (const [name, files] of [...calls.rpc].sort(([a], [b]) => a.localeCompare(b))) {
    const fn = at(database, ['public', 'Functions', name])
    const args = at(database, ['public', 'Functions', name, 'Args'])
    const returns = at(database, ['public', 'Functions', name, 'Returns'])
    if (!fn || !args || !returns)
      throw new Error(`${files[0]} calls ${name}, which database.types.ts does not have: npm run db:types`)
    paths[`/rpc/${name}`] = {
      post: {
        operationId: `rpc_${name}`,
        tags: ['Функции'],
        summary: name,
        description: `Функция \`${name}\` базы через PostgREST.`,
        'x-used-in': files,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: toSchema(args, database, source) } },
        },
        responses: {
          200: {
            description: 'Результат функции',
            content: { 'application/json': { schema: toSchema(returns, database, source) } },
          },
        },
      },
    }
  }

  return {
    openapi: '3.1.1',
    info: {
      title: 'О!бъективно — Supabase',
      version: '1',
      description:
        'Таблицы, представления и функции Supabase, которые вызывает код сайта (`x-used-in` — где). Сгенерировано из `src/lib/db/database.types.ts` командой `npm run docs:supabase`.',
    },
    tags: [
      { name: 'Таблицы', description: 'Чтение строк' },
      { name: 'Представления', description: 'Чтение строк представлений' },
      { name: 'Функции', description: 'RPC' },
    ],
    security,
    paths,
    components: {
      schemas,
      securitySchemes: {
        anonKey: { type: 'apiKey', in: 'header', name: 'apikey', description: SECURITY_DESCRIPTION },
        session: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Сессия пользователя Supabase' },
      },
    },
  }
}
