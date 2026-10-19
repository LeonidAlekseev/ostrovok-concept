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
})
