import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { SECRET_FILE, decryptEnv } from './secretsFile.mjs'

let decrypted: Promise<Record<string, string>> | undefined

async function readSecretFile(secretKey: string) {
  // next.config.ts traces the file into every server function and the standalone output, so it sits next to the
  // app. The ignore comment keeps Turbopack from tracing the whole project for this dynamic path.
  const encrypted = await readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), SECRET_FILE))
  return (await decryptEnv(secretKey, encrypted)).env
}

/**
 * Server-side API key: `process.env[name]`, otherwise the value from `secrets.app.env.age`, decrypted once per
 * cold start with `AGE_SECRET_KEY`. `undefined` when the key is unset anywhere, so callers fall back
 * to their keyless mode.
 */
export async function getSecret(name: string): Promise<string | undefined> {
  if (process.env[name]) return process.env[name]
  const secretKey = process.env.AGE_SECRET_KEY
  if (!secretKey) return undefined
  decrypted ??= readSecretFile(secretKey).catch((error: unknown) => {
    decrypted = undefined
    throw error
  })
  return (await decrypted)[name] || undefined
}
