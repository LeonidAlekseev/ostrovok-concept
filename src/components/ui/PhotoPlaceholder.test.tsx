import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getHotel } from '@/lib/catalog'
import { PhotoPlaceholder } from './PhotoPlaceholder'

describe('PhotoPlaceholder', () => {
  it('stands in for a catalogue photo with its caption', () => {
    const photo = getHotel('prague-old-town-lantern')!.photos[0]
    render(<PhotoPlaceholder photo={photo} />)
    expect(screen.getByRole('img', { name: photo.caption })).toBeTruthy()
  })

  it('keeps the caption to one truncated line that hides in a narrow tile', () => {
    const photo = getHotel('prague-old-town-lantern')!.photos[0]
    render(<PhotoPlaceholder photo={photo} />)
    const caption = screen.getByRole('img', { name: photo.caption }).lastElementChild
    expect(caption?.className).toContain('truncate')
    expect(caption?.className).toContain('@[4rem]:block')
  })
})
