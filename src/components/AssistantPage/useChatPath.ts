import { useSyncExternalStore } from 'react'

/**
 * The open chat lives in the address: `/assistant` is the list (on phones) or a new chat, `/assistant/<id>` a chat.
 * Switching chats changes the address through the History API, which the router of Next follows without
 * rendering the page again (src/app/assistant/(chats)/layout.tsx keeps the chats), so the chats stay loaded.
 */

const CHANGE = 'assistant:path'
export const ASSISTANT_PATH = '/assistant'

const subscribe = (onChange: () => void) => {
  window.addEventListener('popstate', onChange)
  window.addEventListener(CHANGE, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(CHANGE, onChange)
  }
}

/** The chat of a path: `/assistant/<id>`; `null` for the list and for the shared chats. */
export function chatIdOf(pathname: string): string | null {
  const match = /^\/assistant\/([^/]+)\/?$/.exec(pathname)
  if (!match || match[1] === 'shared') return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

/** The id of the open chat; `null` on the server and at `/assistant`. */
export const useChatPath = (): string | null =>
  useSyncExternalStore(
    subscribe,
    () => chatIdOf(window.location.pathname),
    () => null,
  )

interface HistoryState {
  /** The entry was opened from the list: «назад» goes back to it. */
  assistantBack?: boolean
}

/** Opens the chat (or the list, `null`): a new history entry, or the same one with `replace`. */
export function goToChat(id: string | null, { replace = false } = {}) {
  const url = id ? `${ASSISTANT_PATH}/${encodeURIComponent(id)}` : ASSISTANT_PATH
  if (window.location.pathname === url) return
  const fromList = window.location.pathname === ASSISTANT_PATH
  if (replace) window.history.replaceState(window.history.state, '', url)
  else window.history.pushState({ assistantBack: fromList } satisfies HistoryState, '', url)
  window.dispatchEvent(new Event(CHANGE))
}

/** «Назад» of a chat on a phone: to the list it was opened from, or to the list in its place. */
export function backToList() {
  if ((window.history.state as HistoryState | null)?.assistantBack) window.history.back()
  else goToChat(null, { replace: true })
}
