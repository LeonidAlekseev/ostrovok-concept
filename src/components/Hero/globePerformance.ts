/**
 * Canvas pixels per CSS pixel, from sharpest to cheapest. Thin lines and dots stay crisp up to 2;
 * beyond that the fill cost grows with no visible gain.
 */
const PIXEL_RATIOS = [2, 1.5, 1, 0.75]
const WINDOW_MS = 500
/** A gap this long between frames means the loop was paused (tab hidden, hero off screen), not slow. */
const PAUSE_MS = 1000
/** Two slow windows in a row lower the resolution; eight smooth ones raise it back. */
const SLOW_FPS = 45
const SLOW_WINDOWS = 2
const SMOOTH_FPS = 55
const SMOOTH_WINDOWS = 8

export interface FrameWindow {
  fps: number
  /** Longest frame of the window, ms. */
  worstMs: number
  /** Average main-thread time of the animation loop per frame, ms. */
  cpuMs: number
  /** Globe redraws per second; 0 while it stands still. */
  draws: number
}

/** Sums frames into half-second windows and reports each finished one. */
export function createFrameMeter(onWindow: (frames: FrameWindow) => void) {
  let start = 0
  let prev = -Infinity
  let frames = 0
  let worst = 0
  let cpu = 0
  let draws = 0
  const reset = (now: number) => {
    start = prev = now
    frames = worst = cpu = draws = 0
  }
  return {
    frame(now: number, cpuMs: number, drew: boolean) {
      if (now - prev > PAUSE_MS) return reset(now)
      worst = Math.max(worst, now - prev)
      prev = now
      frames++
      cpu += cpuMs
      if (drew) draws++
      if (now - start < WINDOW_MS) return
      const seconds = (now - start) / 1000
      onWindow({ fps: frames / seconds, worstMs: worst, cpuMs: cpu / frames, draws: draws / seconds })
      reset(now)
    },
  }
}

/**
 * Adapts the globe's render resolution to the frame rate the device actually holds.
 * A level that once proved too slow is not tried again, so the quality does not oscillate.
 */
export function createGlobeQuality(devicePixelRatio: number) {
  const ratios = [...new Set(PIXEL_RATIOS.map((r) => Math.min(r, devicePixelRatio)))]
  const cheapest = ratios.length - 1
  // Every device starts sharp; a slow one steps down within a second or two.
  let level = 0
  let best = 0
  let slow = 0
  let smooth = 0
  return {
    get pixelRatio() {
      return ratios[level]
    },
    get level() {
      return `${level + 1}/${ratios.length}`
    },
    /** Feeds one window's frame rate; true when the level changed. */
    update(fps: number) {
      slow = fps < SLOW_FPS ? slow + 1 : 0
      smooth = fps >= SMOOTH_FPS ? smooth + 1 : 0
      const next =
        slow >= SLOW_WINDOWS && level < cheapest
          ? level + 1
          : smooth >= SMOOTH_WINDOWS && level > best
            ? level - 1
            : level
      if (next === level) return false
      if (next > level) best = Math.max(best, next)
      level = next
      slow = smooth = 0
      return true
    },
  }
}
