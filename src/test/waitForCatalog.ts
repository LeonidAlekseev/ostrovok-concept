import { screen, waitFor } from '@testing-library/react'
import { expect } from 'vitest'

/** Waits until the page has its hotels from `GET /api/hotels`: every loading note starts with «Загружаем». */
export const waitForCatalog = () => waitFor(() => expect(screen.queryByText(/^Загружаем/)).toBeNull())
