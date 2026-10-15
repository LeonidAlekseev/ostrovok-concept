/**
 * Deployment environment: Vercel's own (production / preview / development) on Vercel builds,
 * otherwise the Next.js build mode, so `next dev` is development and `next build` is production.
 */
export const appEnv = process.env.APP_ENV || process.env.NODE_ENV

export const isProduction = appEnv === 'production'
