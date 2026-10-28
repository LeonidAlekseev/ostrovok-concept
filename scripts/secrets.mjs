// API keys live in .env (not in git) and, encrypted with age, in secrets.env.age and secrets.app.env.age; see README, «Ключи API».
//   node scripts/secrets.mjs reveal   .env from secrets.app.env.age and AGE_SECRET_KEY
//   node scripts/secrets.mjs build    .env.production.local from AGE_SECRET_KEY (prebuild, Vercel)
//   node scripts/secrets.mjs encrypt  secrets.env.age (organizers) and secrets.app.env.age (app) from .env
// Without the key (CI, builds without secrets) build does nothing and exits 0.
import { readFile, writeFile } from 'node:fs/promises'
import {
  APP_RECIPIENT,
  ORGANIZERS_FILE,
  ORGANIZERS_RECIPIENT,
  SECRET_FILE,
  checkEnvFormat,
  decryptEnv,
  encryptEnv,
} from '../src/lib/secretsFile.mjs'

const root = new URL('../', import.meta.url)
const secretKey = process.env.AGE_SECRET_KEY

async function writeDecrypted(target) {
  const { text, env } = await decryptEnv(secretKey, await readFile(new URL(SECRET_FILE, root)))
  await writeFile(new URL(target, root), text, { mode: 0o600 })
  console.log(`secrets: ${target} written, ${Object.keys(env).length} variables`)
}

const command = process.argv[2]
if (command === 'build') {
  // A separate file so a local build never overwrites hand edits in .env.
  if (secretKey) await writeDecrypted('.env.production.local')
  else if (process.env.VERCEL) {
    // Without the key the catalogue pages cannot be prerendered; fail here with the cause, not in next build.
    console.error(`secrets: AGE_SECRET_KEY is not set for the Vercel ${process.env.VERCEL_ENV} environment`)
    process.exit(1)
  }
} else if (command === 'reveal') {
  if (!secretKey) {
    console.error('secrets: set AGE_SECRET_KEY (the key from age-keygen, see README)')
    process.exit(1)
  }
  await writeDecrypted('.env')
} else if (command === 'encrypt') {
  const text = await readFile(new URL('.env', root), 'utf8')
  const count = checkEnvFormat(text)
  await writeFile(new URL(ORGANIZERS_FILE, root), await encryptEnv(ORGANIZERS_RECIPIENT, text))
  await writeFile(new URL(SECRET_FILE, root), await encryptEnv(APP_RECIPIENT, text))
  console.log(`secrets: ${ORGANIZERS_FILE} and ${SECRET_FILE} written, ${count} variables`)
} else {
  console.error('usage: node scripts/secrets.mjs reveal|build|encrypt')
  process.exit(1)
}
