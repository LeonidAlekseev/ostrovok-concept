import { describe, expect, it } from 'vitest'
import { chatIdOf } from './useChatPath'

// assistant-search, Requirement: Раскладка страницы Эвала
describe('the address of a chat', () => {
  it('reads the chat of /assistant/<id>, not the list or a shared chat', () => {
    expect(chatIdOf('/assistant/0b0c7a1e-6f2b')).toBe('0b0c7a1e-6f2b')
    expect(chatIdOf('/assistant/abc/')).toBe('abc')
    expect(chatIdOf('/assistant')).toBeNull()
    expect(chatIdOf('/assistant/shared')).toBeNull()
    expect(chatIdOf('/assistant/shared/abc')).toBeNull()
    expect(chatIdOf('/assistant/%E0%A4%A')).toBeNull()
  })
})
