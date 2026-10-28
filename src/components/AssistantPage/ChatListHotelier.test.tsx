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

function renderList(
  hotelier: HotelierConversation[],
  onChooseHotelier = vi.fn(),
  onDeleteHotelier = vi.fn().mockResolvedValue(undefined),
) {
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
      onDeleteHotelier={onDeleteHotelier}
    />,
  )
  return { onChooseHotelier, onDeleteHotelier }
}

describe('ChatList: chats with hoteliers', () => {
  it('lists them under «С отельерами» and opens one by its hotel', async () => {
    const { onChooseHotelier: choose } = renderList([conversation()])
    const section = screen.getByRole('region', { name: 'С отельерами' })
    expect(within(section).getByText('Hotel Reina')).toBeTruthy()
    expect(within(section).getByText('новое')).toBeTruthy()
    expect(screen.queryByText(/Здесь будут ваши чаты/)).toBeNull()
    await userEvent.click(within(section).getByRole('button', { name: /Hotel Reina.*Есть ли/ }))
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

describe('ChatList: actions of a chat with a hotelier', () => {
  it('has «Поделиться» and «Удалить» in its menu, like Эвал’s chats', async () => {
    renderList([conversation()])
    await userEvent.click(screen.getByRole('button', { name: 'Действия с чатом «Hotel Reina»' }))
    expect(await screen.findByRole('menuitem', { name: 'Поделиться' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Удалить' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Переименовать' })).toBeNull()
  })

  it('«Удалить» asks first, then hides the chat', async () => {
    const { onDeleteHotelier } = renderList([conversation()])
    await userEvent.click(screen.getByRole('button', { name: 'Действия с чатом «Hotel Reina»' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Удалить' }))
    expect(onDeleteHotelier).not.toHaveBeenCalled()
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Удалить' }))
    expect(onDeleteHotelier).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
  })
})

describe('chat id of a hotelier chat', () => {
  it('round-trips the hotel and leaves Эвал’s ids alone', () => {
    expect(hotelierHotelOf(hotelierChatId('ota-1'))).toBe('ota-1')
    expect(hotelierHotelOf('3f2b8a52-0c1e-4c7a-9d0b-1a2b3c4d5e6f')).toBeNull()
    expect(hotelierHotelOf(null)).toBeNull()
  })
})
