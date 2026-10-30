import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { GET } from './route'

const open = async (query: string) => {
  const response = await GET(new NextRequest(`https://opognali.test/auth/callback?${query}`))
  return response.headers.get('location')
}

// The standalone demo sends no sign-in emails: an old link opens the form with the link's error.
describe('GET /auth/callback', () => {
  it('opens the sign-in form with the error and keeps an internal `next`', async () => {
    expect(await open('code=abc&next=%2Ftrips')).toBe('https://opognali.test/login?error=link&next=%2Ftrips')
  })

  it('sends an external `next` to /', async () => {
    expect(await open(`token_hash=t&type=email&next=${encodeURIComponent('//evil.com')}`)).toBe(
      'https://opognali.test/login?error=link&next=%2F',
    )
  })
})
