import { useEffect, useMemo, useState } from 'react'
import { useToday } from '../../hooks/useToday'
import { bestRoute, type RouteCardData } from '../../lib/routes'
import { DEFAULT_GUESTS, withStartDates, type Stay } from '../../lib/search'
import { axisShares, vibeArchetype, vibePersona, type Answer, type Vibe } from '../../lib/vibe'
import { vibeHotelsAction } from './actions'

/**
 * The vibe of the `answers`, `null` until they are given: the server picks the hotels and the route by meaning
 * at once; the archetype, the shares and the route by the rules are read here. Shared by the vibe search and
 * the drawing, whose colours give the answers.
 */
export function useVibeReading(answers: Answer[] | null, routes: readonly RouteCardData[]) {
  const today = useToday()
  // The reading belongs to the answers it was asked for.
  const [reading, setReading] = useState<{ answers: Answer[]; vibe: Vibe | null; routeId?: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!answers) return
    let current = true
    vibeHotelsAction(answers).then(
      ({ hotels, routeId }) =>
        current &&
        setReading({
          answers,
          vibe: { archetype: vibeArchetype(answers), shares: axisShares(answers), hotels },
          routeId,
        }),
      () => current && setReading({ answers, vibe: null }),
    )
    return () => {
      current = false
    }
  }, [answers, attempt])
  const read = answers && reading?.answers === answers ? reading : null
  const vibe = read?.vibe ?? null
  // The search by meaning's route, or the rules: the persona of the answers in the first hotel's city.
  const route =
    vibe && answers
      ? bestRoute(routes, {
          semanticId: read?.routeId,
          persona: vibePersona(answers),
          destinationId: vibe.hotels[0]?.destinationId,
        })
      : null
  // The links start tomorrow and the day after.
  const stay = useMemo<Stay | null>(() => {
    if (!today) return null
    const { checkIn, checkOut, guests } = withStartDates(
      { destination: '', checkIn: '', checkOut: '', guests: DEFAULT_GUESTS },
      today,
    )
    return { checkIn, checkOut, guests }
  }, [today])

  return {
    vibe,
    route,
    stay,
    /** The server could not pick the hotels. */
    failed: Boolean(read && !vibe),
    retry: () => {
      setReading(null)
      setAttempt(attempt + 1)
    },
  }
}
