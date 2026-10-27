'use client'

import { useMemo } from 'react'
import { ApiReferenceReact } from '@scalar/api-reference-react'
import '@scalar/api-reference-react/style.css'
import { DOCUMENTS } from './documents'

/**
 * Scalar's reference of the documents with its «Try it»: the requests go to the environment the page is opened in
 * (the document's server is `/`), straight from the browser. `onResponse` gets a copy of every answer for the map.
 * Scalar's own extras that call its services — the agent, telemetry — are off.
 */
export default function Reference({ onResponse }: { onResponse: (url: string, response: Response) => void }) {
  const configuration = useMemo(
    () => ({
      sources: DOCUMENTS,
      localization: { locale: 'ru' },
      layout: 'modern' as const,
      theme: 'default' as const,
      forceDarkModeState: 'light' as const,
      hideDarkModeToggle: true,
      withDefaultFonts: false,
      telemetry: false,
      agent: { disabled: true },
      mcp: { disabled: true },
      showDeveloperTools: 'never' as const,
      persistAuth: false,
      documentDownloadType: 'json' as const,
      customCss: '.scalar-app { --scalar-font: var(--font-sans); }',
      onResponseReceived: ({ response, request }: { response: Response; request: Request }) => {
        onResponse(request.url, response)
      },
    }),
    [onResponse],
  )
  return <ApiReferenceReact configuration={configuration} />
}
