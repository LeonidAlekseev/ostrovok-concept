import { useSyncExternalStore } from 'react'
import { todayIso, type IsoDate } from '../lib/dates'

const subscribeNever = () => () => {}

/** Today's date; empty on the server and during hydration, so prerendered and hydrated markup match. */
export const useToday = (): IsoDate => useSyncExternalStore(subscribeNever, todayIso, () => '')
