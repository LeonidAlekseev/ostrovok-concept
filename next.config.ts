import type { NextConfig } from 'next'
import { mergedHotelRedirects } from './src/lib/ota/merged'

const nextConfig: NextConfig = {
  // The Docker image (Dockerfile) builds a self-contained server; Vercel and `npm run build` keep the default output.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  reactStrictMode: true,
  // Inlined into the client bundle; see src/lib/env.ts. A local build takes APP_ENV of its shell.
  env: { APP_ENV: process.env.VERCEL_ENV ?? process.env.APP_ENV ?? '' },
  // src/lib/secrets.ts decrypts the API keys at runtime; the file is read by path, so tracing needs a hint.
  // src/lib/standalone/server.ts reads the snapshot of the database the same way (data/standalone).
  outputFileTracingIncludes: { '/*': ['./data/standalone/**/*'] },
  turbopack: {
    rules: {
      // Keeps Turbopack from copying every maplibre-gl/dist .mjs into the build; see the loader.
      'maplibre-gl.mjs': {
        loaders: [{ loader: './config/maplibre-no-asset-glob.cjs' }],
      },
    },
  },
  // The old links of the Ostrovok duplicates folded into one hotel; see src/lib/ota/merged.ts.
  redirects: async () => mergedHotelRedirects(),
  async headers() {
    return [
      {
        // Images are rebuilt only by scripts/build-images.py; let the CDN cache them for a day.
        source: '/images/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
    ]
  },
}

export default nextConfig
