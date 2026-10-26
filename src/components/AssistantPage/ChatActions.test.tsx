import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newChat, type Chat } from '../../lib/assistantChats'
import { UNSHARE_ERROR, deleteShare, shareChat } from '../../lib/assistantShare'
import { getBrowserClient } from '../../lib/supabase/client'
import { ShareDialog } from './ChatActions'

vi.mock('../../lib/supabase/client', () => ({ getBrowserClient: vi.fn(() => ({ client: true })) }))
vi.mock('../../lib/assistantShare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/assistantShare')>()),
  shareChat: vi.fn(async () => '6f1c2a3e-1b2c-4d5e-8f90-123456789abc'),
  deleteShare: vi.fn(async () => {}),
}))

afterEach(() => {
  vi.clearAllMocks()
})

const chat: Chat = { ...newChat('2026-10-26T10:00:00.000Z'), title: 'Тихий отель' }

const renderShared = () => {
  render(<ShareDialog chat={chat} signedIn open onOpenChange={() => {}} />)
  return screen.findByRole('textbox', { name: 'Ссылка на чат' })
}

// assistant-search, Requirement: Поделиться чатом, Scenario: Удаление ссылки
describe('ShareDialog deletes the link', () => {
  it('deletes the snapshot after the confirmation and says so', async () => {
    const user = userEvent.setup()
    await renderShared()

    await user.click(screen.getByRole('button', { name: 'Удалить ссылку' }))
    expect(deleteShare).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Удалить ссылку' }))

    expect(deleteShare).toHaveBeenCalledWith({ client: true }, '6f1c2a3e-1b2c-4d5e-8f90-123456789abc')
    expect(await screen.findByText('Ссылка удалена')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Ссылка на чат' })).toBeNull()
  })

  it('keeps the link and tells the failure when the deletion fails', async () => {
    vi.mocked(deleteShare).mockRejectedValueOnce(new Error(UNSHARE_ERROR))
    const user = userEvent.setup()
    await renderShared()

    await user.click(screen.getByRole('button', { name: 'Удалить ссылку' }))
    await user.click(screen.getByRole('button', { name: 'Удалить ссылку' }))

    expect((await screen.findByRole('alert')).textContent).toBe(UNSHARE_ERROR)
    expect(screen.getByRole('textbox', { name: 'Ссылка на чат' })).toBeTruthy()
    expect(screen.queryByText('Ссылка удалена')).toBeNull()
  })

  it('keeps the link when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    await renderShared()

    await user.click(screen.getByRole('button', { name: 'Удалить ссылку' }))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Удалить ссылку' })).toBeTruthy())
    expect(deleteShare).not.toHaveBeenCalled()
    expect(shareChat).toHaveBeenCalledTimes(1)
    expect(getBrowserClient).toHaveBeenCalled()
  })
})
