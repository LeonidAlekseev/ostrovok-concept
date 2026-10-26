import { vi } from 'vitest'

/**
 * A Storage bucket in memory, as the Storage API shows it: `list(prefix)` gives the files right under the prefix and
 * its folders (no id), `remove(paths)` the files removed.
 */
export function storageBucket(files: Record<string, string> = {}) {
  const stored = new Map(Object.entries(files))
  const list = vi.fn(async (prefix: string, { limit = 100, offset = 0 }: { limit?: number; offset?: number } = {}) => {
    const under = prefix ? `${prefix}/` : ''
    const entries = new Map<string, { name: string; id: string | null; created_at: string | null }>()
    for (const [path, createdAt] of [...stored].sort(([a], [b]) => a.localeCompare(b))) {
      if (!path.startsWith(under)) continue
      const [name, ...rest] = path.slice(under.length).split('/')
      if (!entries.has(name))
        entries.set(
          name,
          rest.length ? { name, id: null, created_at: null } : { name, id: path, created_at: createdAt },
        )
    }
    return { data: [...entries.values()].slice(offset, offset + limit), error: null }
  })
  const remove = vi.fn(async (paths: string[]) => ({
    data: paths.filter((p) => stored.delete(p)).map((name) => ({ name })),
    error: null,
  }))
  return { list, remove, stored }
}
