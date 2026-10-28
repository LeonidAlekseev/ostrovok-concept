// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HotelierConversation } from '../../lib/hotelierChat'
import { ChatList } from './ChatList'
import { hotelierChatId, hotelierHotelOf } from './useChatPath'

afterEach(cleanup)

const conversation = (over: Partial<HotelierConversation> = {}): HotelierConversation => ({
  id: 'c1',
  hotelId: 'ota-1',
  hotelName: 'Hotel Reina',
  kind: 'user',
  status: 'open',
  lastMessageAt: new Date().toISOString(),
  lastMessageText: 'Есть ли балкон?',
  lastSender: 'hotelier',
  userUnread: 1,
  hotelierUnread: 0,
  demo: false,
  createdAt: new Date().toISOString(),
  ...over,
})

function renderList(hotelier: HotelierConversation[], onChooseHotelier = vi.fn()) {
  render(
    <ChatList
      chats={[]}
      activeId={null}
      ready
      signedIn
      onChoose={vi.fn()}
      onNew={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      hotelier={hotelier}
      hotelierActive={null}
      onChooseHotelier={onChooseHotelier}
    />,
  )
  return onChooseHotelier
}

describe('ChatList: chats with hoteliers', () => {
  it('lists them under «С отельерами» and opens one by its hotel', async () => {
    const choose = renderList([conversation()])
    const section = screen.getByRole('region', { name: 'С отельерами' })
    expect(within(section).getByText('Hotel Reina')).toBeTruthy()
    expect(within(section).getByText('новое')).toBeTruthy()
    expect(screen.queryByText(/Здесь будут ваши чаты/)).toBeNull()
    await userEvent.click(within(section).getByRole('button', { name: /Hotel Reina/ }))
    expect(choose).toHaveBeenCalledWith('ota-1')
  })

  it('has no section without such chats', () => {
    renderList([])
    expect(screen.queryByRole('region', { name: 'С отельерами' })).toBeNull()
  })

  it('searches them by the hotel and the last message', async () => {
    renderList([
      conversation(),
      conversation({ id: 'c2', hotelId: 'ota-2', hotelName: 'Casa Mar', lastMessageText: 'Парковка' }),
    ])
    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск чатов' }), 'парков')
    const section = screen.getByRole('region', { name: 'С отельерами' })
    expect(within(section).queryByText('Hotel Reina')).toBeNull()
    expect(within(section).getByText('Casa Mar')).toBeTruthy()
  })
})

describe('chat id of a hotelier chat', () => {
  it('round-trips the hotel and leaves Эвал’s ids alone', () => {
    expect(hotelierHotelOf(hotelierChatId('ota-1'))).toBe('ota-1')
    expect(hotelierHotelOf('3f2b8a52-0c1e-4c7a-9d0b-1a2b3c4d5e6f')).toBeNull()
    expect(hotelierHotelOf(null)).toBeNull()
  })
})
