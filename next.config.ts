import { withCn } from 'cn/next'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Inlined into the client bundle; see src/lib/env.ts.
  env: { APP_ENV: process.env.VERCEL_ENV ?? '' },
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

// Compiles cn merge tables to the classes used in src; keep options in sync with the cn:build script.
export default withCn(nextConfig, { out: 'src/lib/cn-tables.ts' })
