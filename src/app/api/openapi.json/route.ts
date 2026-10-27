import { apiDocument } from '@/lib/openapi/document'

// The same document for every request: built once, at the build, in every environment.
export const dynamic = 'force-static'

/** The OpenAPI 3.1 document of the site's routes, for `/api/docs`; the schema: ./schema.ts. */
export function GET() {
  return Response.json(apiDocument())
}
