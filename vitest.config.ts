import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * The tests of the full version only (branches `dev` and `main`): they check the readers and routes against a mocked
 * Supabase client, which the standalone demo does not create (its data layer is src/lib/standalone, tested there).
 */
const FULL_VERSION_ONLY = [
  'src/app/api/hotelier/hotels/route.test.ts',
  'src/app/api/hotelier/routes.test.ts',
  'src/app/api/hotels/[[]hotelId]/hotelier/facts/route.test.ts',
  'src/lib/ai/photoSearch.test.ts',
  'src/lib/ai/rateLimit.test.ts',
  'src/lib/ai/semantic.test.ts',
  'src/lib/db/catalog.test.ts',
  'src/lib/db/claims.test.ts',
  'src/lib/db/hotelierKnowledgeRetry.test.ts',
  'src/lib/db/knowledge.index.test.ts',
  'src/lib/db/knowledge.test.ts',
  'src/lib/db/noise.test.ts',
  'src/lib/db/serviceClient.test.ts',
]

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Next resolves `server-only` in its compiler; tests run outside it.
      'server-only': fileURLToPath(new URL('./node_modules/next/dist/compiled/server-only/empty.js', import.meta.url)),
      // next/font is a compiler transform too: in tests a font is a name without files.
      'next/font/google': fileURLToPath(new URL('./src/test/nextFont.ts', import.meta.url)),
    },
  },
  test: {
    // Hooks run in declaration order, so the setup file's `afterEach(cleanup)` (declared first) unmounts before a test
    // file clears its storage. The default 'stack' runs `afterEach` in reverse: an unmount would save into the cleared
    // storage and leak the chat into the next test (see #304).
    sequence: { hooks: 'list' },
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts'], exclude: FULL_VERSION_ONLY },
      },
      {
        extends: true,
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
    ],
  },
})
