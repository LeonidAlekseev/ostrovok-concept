import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createMessage, encrypt, generateKey, readKey } from 'openpgp'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SECRET_FILE, decryptEnv } from './secretsFile.mjs'

const dotenv = `# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NVIDIA_API_KEY="nvapi-test"
DEMO_USER_PASSWORD=
`

let privateKey: string
let encrypted: Uint8Array

beforeAll(async () => {
  const keys = await generateKey({ type: 'ecc', userIDs: [{ email: 'test@opognali.local' }], format: 'armored' })
  privateKey = keys.privateKey
  const encryptionKeys = await readKey({ armoredKey: keys.publicKey })
  encrypted = await encrypt({ message: await createMessage({ text: dotenv }), encryptionKeys, format: 'binary' })
})

describe('decryptEnv', () => {
  it('decrypts and parses dotenv: comments, quotes, empty values', async () => {
    const { text, env } = await decryptEnv(privateKey, encrypted)
    expect(text).toBe(dotenv)
    expect(env).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NVIDIA_API_KEY: 'nvapi-test',
      DEMO_USER_PASSWORD: '',
    })
  })

  it('accepts a key pasted on one line with escaped newlines', async () => {
    const { env } = await decryptEnv(privateKey.replace(/\n/g, '\\n'), encrypted)
    expect(env.NVIDIA_API_KEY).toBe('nvapi-test')
  })

  it('rejects a foreign key', async () => {
    const other = await generateKey({ type: 'ecc', userIDs: [{ email: 'other@opognali.local' }], format: 'armored' })
    await expect(decryptEnv(other.privateKey, encrypted)).rejects.toThrow()
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

  it('returns undefined without GIT_SECRET_PRIVATE_KEY', async () => {
    vi.stubEnv('GIT_SECRET_PRIVATE_KEY', '')
    expect(await (await load())('NVIDIA_API_KEY')).toBeUndefined()
  })

  it('prefers process.env', async () => {
    vi.stubEnv('GIT_SECRET_PRIVATE_KEY', privateKey)
    vi.stubEnv('NVIDIA_API_KEY', 'from-env')
    expect(await (await load())('NVIDIA_API_KEY')).toBe('from-env')
  })

  it('decrypts the file once and caches it', async () => {
    vi.stubEnv('GIT_SECRET_PRIVATE_KEY', privateKey)
    const getSecret = await load()
    expect(await getSecret('NVIDIA_API_KEY')).toBe('nvapi-test')
    await rm(path.join(dir, SECRET_FILE))
    expect(await getSecret('NEXT_PUBLIC_SUPABASE_URL')).toBe('https://example.supabase.co')
    expect(await getSecret('DEMO_USER_PASSWORD')).toBeUndefined()
    expect(await getSecret('MISSING')).toBeUndefined()
  })

  it('retries after a failed read', async () => {
    vi.stubEnv('GIT_SECRET_PRIVATE_KEY', privateKey)
    await rm(path.join(dir, SECRET_FILE))
    const getSecret = await load()
    await expect(getSecret('NVIDIA_API_KEY')).rejects.toThrow()
    await writeFile(path.join(dir, SECRET_FILE), encrypted)
    expect(await getSecret('NVIDIA_API_KEY')).toBe('nvapi-test')
  })
})
