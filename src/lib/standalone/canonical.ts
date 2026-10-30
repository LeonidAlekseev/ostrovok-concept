/**
 * The key of a database function's call: its name and its arguments with sorted keys (the undefined ones left out, as
 * JSON leaves them out). scripts/export-standalone.ts records the answers by it, and the standalone client finds them.
 */
export const callKey = (name: string, args: unknown) => `${name} ${canonical(args ?? {})}`

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonical(v))).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
