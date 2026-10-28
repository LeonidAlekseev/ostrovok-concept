// Liveness for the Docker healthcheck and the organizers' probe: no database, no keys, always `{ "status": "ok" }`.
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
}
