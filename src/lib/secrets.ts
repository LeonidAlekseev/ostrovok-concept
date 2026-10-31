import 'server-only'

/**
 * Server-side API key. The standalone demo calls no external API and keeps no keys: always `undefined`, so every
 * caller runs in its keyless mode (the search by words, the rules). The full version (branches `dev`, `main`) reads
 * `process.env` and `secrets.app.env.age`.
 */
export async function getSecret(name: string): Promise<string | undefined> {
  void name
  return undefined
}
