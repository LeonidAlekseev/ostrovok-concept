import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Inlined into the client bundle; see src/lib/env.ts.
  env: { APP_ENV: process.env.VERCEL_ENV ?? '' },
  turbopack: {
    rules: {
      // Keeps Turbopack from copying every maplibre-gl/dist .mjs into the build; see the loader.
      'maplibre-gl.mjs': {
        loaders: [{ loader: './config/maplibre-no-asset-glob.cjs' }],
      },
    },
  },
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
