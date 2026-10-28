// Shared by scripts/secrets.mjs (Node, before `next build`) and src/lib/secrets.ts (server runtime).
import { parseEnv } from 'node:util'
import { Decrypter, Encrypter } from 'age-encryption'

/** The app's copy of the API keys in git: age file for `APP_RECIPIENT`, opened with AGE_SECRET_KEY. */
export const SECRET_FILE = 'secrets.app.env.age'
/** The same `.env` for the organizers; only they can read it, the app never does. */
export const ORGANIZERS_FILE = 'secrets.env.age'
/** Public key of the organizers (given by them); `age -r <this> -o secrets.env.age .env`. */
export const ORGANIZERS_RECIPIENT = 'age1932fu7f70rwyfhaxflyfszz4gf6avxwc95wc0yjwm6zns9tspycqpgdnc0'
/** Public key of the app's private key (AGE_SECRET_KEY on Vercel and in Docker). */
export const APP_RECIPIENT = 'age1r0g77nfftvy2pc7taq5rzu8achvylulttze8vjxru4z406ezwees7m5q4u'

/**
 * The `AGE-SECRET-KEY-1…` line out of `value`: a bare key, or the whole key file of `age-keygen` with its
 * comments (`AGE_SECRET_KEY="$(cat age-app.key)"`).
 */
export function findIdentity(value) {
  const identity = /AGE-SECRET-KEY-1[A-Z0-9]+/.exec(value)?.[0]
  if (!identity) throw new Error('AGE_SECRET_KEY has no AGE-SECRET-KEY-1… line')
  return identity
}

/** Decrypts an age file with the private key and parses the plaintext as dotenv. */
export async function decryptEnv(secretKey, encrypted) {
  const decrypter = new Decrypter()
  decrypter.addIdentity(findIdentity(secretKey))
  const text = await decrypter.decrypt(encrypted, 'text')
  return { text, env: parseEnv(text) }
}

/** Encrypts `text` for one recipient into the binary age format, as `age -r <recipient> -o file`. */
export async function encryptEnv(recipient, text) {
  const encrypter = new Encrypter()
  encrypter.addRecipient(recipient)
  return encrypter.encrypt(text)
}

const LINE = /^[A-Z_][A-Z0-9_]*=[^\s"']*$/

/** Checks the organizers' format of `.env`: UTF-8 without BOM, `KEY=value` lines, no quotes or spaces. */
export function checkEnvFormat(text) {
  if (text.charCodeAt(0) === 0xfeff) throw new Error('.env starts with a BOM')
  if (text.includes('\r')) throw new Error('.env has CRLF line endings')
  const lines = text.split('\n').filter(Boolean)
  const bad = lines.findIndex((line) => !LINE.test(line))
  if (bad >= 0) throw new Error(`.env line ${bad + 1} is not KEY=value without quotes and spaces`)
  return lines.length
}
