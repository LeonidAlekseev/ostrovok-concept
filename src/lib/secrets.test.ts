import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generateIdentity, identityToRecipient } from 'age-encryption'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SECRET_FILE, checkEnvFormat, decryptEnv, encryptEnv, findIdentity } from './secretsFile.mjs'

const dotenv = `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NVIDIA_API_KEY=nvapi-test
DEMO_USER_PASSWORD=
`

let secretKey: string
let encrypted: Uint8Array

beforeAll(async () => {
  secretKey = await generateIdentity()
  encrypted = await encryptEnv(await identityToRecipient(secretKey), dotenv)
})

describe('decryptEnv', () => {
  it('decrypts and parses dotenv: empty values too', async () => {
    const { text, env } = await decryptEnv(secretKey, encrypted)
    expect(text).toBe(dotenv)
    expect(env).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NVIDIA_API_KEY: 'nvapi-test',
      DEMO_USER_PASSWORD: '',
    })
  })

  it('accepts the whole key file of age-keygen with its comments', async () => {
    const keyFile = `# created: 2026-10-28T00:00:00Z\n# public key: age1xxx\n${secretKey}\n`
    expect(findIdentity(keyFile)).toBe(secretKey)
    expect((await decryptEnv(keyFile, encrypted)).env.NVIDIA_API_KEY).toBe('nvapi-test')
  })

  it('writes the binary age format, not armor', () => {
    expect(new TextDecoder().decode(encrypted.slice(0, 22))).toBe('age-encryption.org/v1\n')
  })

  it('rejects a foreign key and text without a key', async () => {
    await expect(decryptEnv(await generateIdentity(), encrypted)).rejects.toThrow()
    await expect(decryptEnv('not a key', encrypted)).rejects.toThrow('AGE-SECRET-KEY-1')
  })
})

describe('checkEnvFormat', () => {
  it('counts KEY=value lines, empty values allowed', () => {
    expect(checkEnvFormat(dotenv)).toBe(3)
  })

  it.each([
    ['a BOM', '﻿KEY=value\n'],
    ['CRLF', 'KEY=value\r\n'],
    ['quotes', 'KEY="value"\n'],
    ['spaces', 'KEY = value\n'],
    ['a comment', '# note\nKEY=value\n'],
  ])('rejects %s', (_, text) => {
    expect(() => checkEnvFormat(text)).toThrow()
  })
})

describe('getSecret', () => {
  let dir: string

  beforeEach(async () => {
    vi.resetModules()
    dir = await mkdtemp(path.join(tmpdir(), 'secrets-'))
    await writeFile(path.join(dir, SECRET_FILE), encrypted)
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
    vi.stubEnv('NVIDIA_API_KEY', '')
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    await rm(dir, { recursive: true, force: true })
  })

  const load = async () => (await import('./secrets')).getSecret

  it('returns undefined without AGE_SECRET_KEY', async () => {
    vi.stubEnv('AGE_SECRET_KEY', '')
    expect(await (await load())('NVIDIA_API_KEY')).toBeUndefined()
  })

  it('prefers process.env', async () => {
    vi.stubEnv('AGE_SECRET_KEY', secretKey)
    vi.stubEnv('NVIDIA_API_KEY', 'from-env')
    expect(await (await load())('NVIDIA_API_KEY')).toBe('from-env')
  })

  it('decrypts the file once and caches it', async () => {
    vi.stubEnv('AGE_SECRET_KEY', secretKey)
    const getSecret = await load()
    expect(await getSecret('NVIDIA_API_KEY')).toBe('nvapi-test')
    await rm(path.join(dir, SECRET_FILE))
    expect(await getSecret('NEXT_PUBLIC_SUPABASE_URL')).toBe('https://example.supabase.co')
    expect(await getSecret('DEMO_USER_PASSWORD')).toBeUndefined()
    expect(await getSecret('MISSING')).toBeUndefined()
  })

  it('retries after a failed read', async () => {
    vi.stubEnv('AGE_SECRET_KEY', secretKey)
    await rm(path.join(dir, SECRET_FILE))
    const getSecret = await load()
    await expect(getSecret('NVIDIA_API_KEY')).rejects.toThrow()
    await writeFile(path.join(dir, SECRET_FILE), encrypted)
    expect(await getSecret('NVIDIA_API_KEY')).toBe('nvapi-test')
  })
})
