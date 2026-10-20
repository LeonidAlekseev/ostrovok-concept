import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

// The globe needs WebGL, which jsdom does not have; the test only checks the order of sections.
vi.mock('./Hero/Hero', () => ({ Hero: () => <h1>Найди свой уголок</h1> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('HomePage', () => {
  it('renders the sections in order: search, ideas, vibe, stars, collections, banner', () => {
    const { container } = render(<HomePage />)
    const ids = Array.from(container.querySelectorAll('section[id]')).map((s) => s.id)
    expect(ids).toEqual(['search', 'ideas', 'vibe', 'stars', 'collections', 'explore'])
  })
})
