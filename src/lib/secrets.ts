import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { SECRET_FILE, decryptEnv } from './secretsFile.mjs'

let decrypted: Promise<Record<string, string>> | undefined

async function readSecretFile(armoredKey: string) {
  // next.config.ts traces the file into every server function, so it sits next to the app on Vercel.
  const encrypted = await readFile(path.join(process.cwd(), SECRET_FILE))
  return (await decryptEnv(armoredKey, encrypted)).env
}

/**
 * Server-side API key: `process.env[name]`, otherwise the value from `.env.local.secret`, decrypted once per
 * cold start with `GIT_SECRET_PRIVATE_KEY`. `undefined` when the key is unset anywhere, so callers fall back
 * to their keyless mode.
 */
export async function getSecret(name: string): Promise<string | undefined> {
  if (process.env[name]) return process.env[name]
  const armoredKey = process.env.GIT_SECRET_PRIVATE_KEY
  if (!armoredKey) return undefined
  decrypted ??= readSecretFile(armoredKey).catch((error: unknown) => {
    decrypted = undefined
    throw error
  })
  return (await decrypted)[name] || undefined
}
