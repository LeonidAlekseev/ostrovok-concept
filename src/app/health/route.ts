import type { HealthResponse } from './schema'

// Liveness for the Docker healthcheck and the organizers' probe: no database, no keys, always `{ "status": "ok" }`.
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ status: 'ok' } satisfies HealthResponse, { headers: { 'Cache-Control': 'no-store' } })
}
