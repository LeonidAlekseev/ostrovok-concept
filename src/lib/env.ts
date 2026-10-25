/**
 * Deployment environment: Vercel's own (production / preview / development) on Vercel builds, `APP_ENV` of
 * a local build (`APP_ENV=preview npm run build`), otherwise the Next.js build mode, so `next dev` is
 * development and `next build` is production. Production shows only the real hotels: see `isVisibleHotel`.
 */
export const appEnv = process.env.APP_ENV || process.env.NODE_ENV

export const isProduction = appEnv === 'production'
