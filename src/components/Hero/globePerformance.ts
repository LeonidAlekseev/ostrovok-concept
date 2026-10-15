const WINDOW_MS = 500
/** A gap this long between frames means the loop was paused (tab hidden, hero off screen), not slow. */
const PAUSE_MS = 1000

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
