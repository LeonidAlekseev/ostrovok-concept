import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

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
        test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts'] },
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
