// API keys live encrypted in .env.local.secret (git-secret); see README, «Ключи API».
//   node scripts/secrets.mjs reveal  .env.local from GIT_SECRET_PRIVATE_KEY, otherwise `git secret reveal -f`
//   node scripts/secrets.mjs build   .env.production.local from GIT_SECRET_PRIVATE_KEY (prebuild, Vercel)
//   node scripts/secrets.mjs hide    `git secret hide` after editing .env.local
// Without the key (CI, builds without secrets) reveal and build do nothing and exit 0.
import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { SECRET_FILE, decryptEnv } from '../src/lib/secretsFile.mjs'

const root = new URL('../', import.meta.url)
const armoredKey = process.env.GIT_SECRET_PRIVATE_KEY

function gitSecret(...args) {
  return spawnSync('git', ['secret', ...args], { cwd: root, stdio: 'inherit' }).status ?? 1
}

async function writeDecrypted(target) {
  const { text, env } = await decryptEnv(armoredKey, await readFile(new URL(SECRET_FILE, root)))
  await writeFile(new URL(target, root), text, { mode: 0o600 })
  console.log(`secrets: ${target} written, ${Object.keys(env).length} variables`)
}

const command = process.argv[2]
if (command === 'build') {
  // A separate file so a local build never overwrites hand edits in .env.local.
  if (armoredKey) await writeDecrypted('.env.production.local')
} else if (command === 'reveal') {
  if (armoredKey) await writeDecrypted('.env.local')
  else if (spawnSync('git', ['secret', '--version'], { stdio: 'ignore' }).status === 0)
    process.exit(gitSecret('reveal', '-f'))
  else console.log('secrets: no GIT_SECRET_PRIVATE_KEY and no git-secret, nothing to reveal')
} else if (command === 'hide') {
  process.exit(gitSecret('hide'))
} else {
  console.error('usage: node scripts/secrets.mjs reveal|build|hide')
  process.exit(1)
}
