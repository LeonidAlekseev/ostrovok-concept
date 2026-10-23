// Shared by scripts/secrets.mjs (Node, before `next build`) and src/lib/secrets.ts (server runtime).
import { parseEnv } from 'node:util'
import { decrypt, readMessage, readPrivateKey } from 'openpgp'

/** File hidden by git-secret; the only copy of the API keys in git. */
export const SECRET_FILE = '.env.local.secret'

/**
 * Decrypts the git-secret file and parses it as dotenv.
 * `armoredKey` is the project's private key; a key pasted on one line with escaped `\n` also works.
 */
export async function decryptEnv(armoredKey, encrypted) {
  const decryptionKeys = await readPrivateKey({ armoredKey: armoredKey.trim().replace(/\\n/g, '\n') })
  const message = await readMessage({ binaryMessage: encrypted })
  const { data } = await decrypt({ message, decryptionKeys, format: 'utf8' })
  return { text: data, env: parseEnv(data) }
}
