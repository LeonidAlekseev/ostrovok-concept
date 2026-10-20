// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canShareFile,
  canvasToFile,
  downloadFile,
  extensionOf,
  recordCanvas,
  shareFile,
  shareText,
  videoType,
  wrapText,
} from './shareMedia'

const file = new File(['video'], 'ostrovok.mp4', { type: 'video/mp4' })

/** A MediaRecorder that records nothing: stop() hands one chunk and fires onstop. */
class FakeRecorder {
  static supported: string[] = []
  static isTypeSupported = (type: string) => FakeRecorder.supported.includes(type)
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(
    public stream: unknown,
    public options: { mimeType: string },
  ) {}
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['frame']) })
    this.onstop?.()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  FakeRecorder.supported = []
})

// star-search, Requirement: Запись видео результата
describe('videoType', () => {
  it('is null without MediaRecorder', () => {
    vi.stubGlobal('MediaRecorder', undefined)
    expect(videoType()).toBeNull()
  })

  it('prefers MP4', () => {
    FakeRecorder.supported = ['video/webm', 'video/mp4']
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    expect(videoType()).toBe('video/mp4')
  })

  it('falls back to WebM', () => {
    FakeRecorder.supported = ['video/webm']
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    expect(videoType()).toBe('video/webm')
  })

  it('names the file by the container', () => {
    expect(extensionOf('video/mp4')).toBe('mp4')
    expect(extensionOf('video/webm;codecs=vp9')).toBe('webm')
  })
})

describe('recordCanvas', () => {
  const track = { stop: vi.fn() }
  const canvas = { captureStream: vi.fn(() => ({ getTracks: () => [track] })) } as unknown as HTMLCanvasElement

  it('draws every frame up to the end and resolves with the video', async () => {
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    const draw = vi.fn()
    const onProgress = vi.fn()
    const blob = await recordCanvas(canvas, { type: 'video/webm', durationMs: 50, draw, onProgress })
    expect(blob.type).toBe('video/webm')
    expect(draw).toHaveBeenCalledWith(0)
    expect(draw).toHaveBeenLastCalledWith(50)
    expect(onProgress).toHaveBeenLastCalledWith(1)
    expect(track.stop).toHaveBeenCalled()
  })

  describe('in a hidden tab', () => {
    const setVisibility = (state: 'hidden' | 'visible') => {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
      document.dispatchEvent(new Event('visibilitychange'))
    }

    it('drops the recording and starts over from zero when the tab returns', async () => {
      vi.useFakeTimers()
      try {
        vi.stubGlobal('MediaRecorder', FakeRecorder)
        const draw = vi.fn()
        const onProgress = vi.fn()
        const onRestart = vi.fn()
        const stop = vi.spyOn(FakeRecorder.prototype, 'stop')
        const recording = recordCanvas(canvas, { type: 'video/webm', durationMs: 1000, draw, onProgress, onRestart })

        await vi.advanceTimersByTimeAsync(400)
        setVisibility('hidden')
        expect(stop).toHaveBeenCalledOnce()
        expect(onRestart).not.toHaveBeenCalled()
        draw.mockClear()
        // Nothing is drawn while hidden.
        await vi.advanceTimersByTimeAsync(60_000)
        expect(draw).not.toHaveBeenCalled()

        setVisibility('visible')
        expect(onRestart).toHaveBeenCalledOnce()
        expect(draw).toHaveBeenCalledWith(0)
        expect(onProgress).toHaveBeenLastCalledWith(0)
        await vi.advanceTimersByTimeAsync(32)
        expect(draw.mock.calls.at(-1)![0]).toBeLessThan(100)

        await vi.advanceTimersByTimeAsync(1000)
        const blob = await recording
        expect(blob).toBeInstanceOf(Blob)
        // Only the second recording is the result: the first one's chunk was thrown away.
        expect(blob.size).toBe('frame'.length)
        expect(draw).toHaveBeenLastCalledWith(1000)
      } finally {
        vi.useRealTimers()
      }
    })

    it('restarts again on every new hide', async () => {
      vi.useFakeTimers()
      try {
        vi.stubGlobal('MediaRecorder', FakeRecorder)
        const onRestart = vi.fn()
        const recording = recordCanvas(canvas, { type: 'video/webm', durationMs: 1000, draw: () => {}, onRestart })
        for (let i = 0; i < 3; i++) {
          await vi.advanceTimersByTimeAsync(300)
          setVisibility('hidden')
          setVisibility('visible')
        }
        expect(onRestart).toHaveBeenCalledTimes(3)
        await vi.advanceTimersByTimeAsync(1100)
        await expect(recording).resolves.toBeInstanceOf(Blob)
      } finally {
        vi.useRealTimers()
      }
    })

    it('waits for the tab when it is hidden at the start, without a restart notice', async () => {
      vi.useFakeTimers()
      try {
        vi.stubGlobal('MediaRecorder', FakeRecorder)
        setVisibility('hidden')
        const draw = vi.fn()
        const onRestart = vi.fn()
        const recording = recordCanvas(canvas, { type: 'video/webm', durationMs: 500, draw, onRestart })
        await vi.advanceTimersByTimeAsync(5000)
        expect(draw).not.toHaveBeenCalled()
        setVisibility('visible')
        await vi.advanceTimersByTimeAsync(600)
        await expect(recording).resolves.toBeInstanceOf(Blob)
        expect(onRestart).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('rejects when aborted while hidden', async () => {
      vi.stubGlobal('MediaRecorder', FakeRecorder)
      const controller = new AbortController()
      const recording = recordCanvas(canvas, {
        type: 'video/webm',
        durationMs: 10_000,
        draw: () => {},
        signal: controller.signal,
      })
      setVisibility('hidden')
      controller.abort()
      await expect(recording).rejects.toThrow()
    })
  })

  it('rejects when aborted', async () => {
    vi.stubGlobal('MediaRecorder', FakeRecorder)
    const controller = new AbortController()
    const recording = recordCanvas(canvas, {
      type: 'video/webm',
      durationMs: 10_000,
      draw: () => {},
      signal: controller.signal,
    })
    controller.abort()
    await expect(recording).rejects.toThrow()
  })
})

// star-search, Requirement: Отправка видео
describe('sharing', () => {
  it('shares the file when the share sheet takes files', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { canShare: () => true, share })
    expect(canShareFile(file)).toBe(true)
    await expect(shareFile(file, { title: 'T', text: 'X' })).resolves.toBe(true)
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'T', text: 'X' })
  })

  it('cannot share files without canShare or when it says no', () => {
    vi.stubGlobal('navigator', {})
    expect(canShareFile(file)).toBe(false)
    vi.stubGlobal('navigator', { canShare: () => false })
    expect(canShareFile(file)).toBe(false)
  })

  it('does not treat a closed share sheet as an error', async () => {
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError')) })
    await expect(shareFile(file, { title: 'T', text: 'X' })).resolves.toBe(false)
    await expect(shareText({ title: 'T', text: 'X', url: 'https://x' })).resolves.toBeNull()
  })

  it('downloads the file through a link', () => {
    // jsdom has no object URLs.
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:video', revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('ostrovok.mp4')
      expect(this.href).toBe('blob:video')
    })
    downloadFile(file)
    expect(click).toHaveBeenCalled()
  })

  it('shares text through the share sheet, otherwise copies it with the link', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })
    await expect(shareText({ title: 'T', text: 'X', url: 'https://x' })).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({ title: 'T', text: 'X', url: 'https://x' })

    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await expect(shareText({ title: 'T', text: 'X', url: 'https://x' })).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('X https://x')
  })
})

describe('wrapText', () => {
  // Every character is 10px wide.
  const ctx = { measureText: (text: string) => ({ width: text.length * 10 }) } as unknown as CanvasRenderingContext2D

  it('breaks between words at the width', () => {
    expect(wrapText(ctx, 'Тихий вечер у моря', 110)).toEqual(['Тихий вечер', 'у моря'])
  })

  it('keeps a word longer than the width on its own line', () => {
    expect(wrapText(ctx, 'Достопримечательность рядом', 50)).toEqual(['Достопримечательность', 'рядом'])
  })
})

describe('canvasToFile', () => {
  const canvasWith = (blob: Blob | null) =>
    ({
      toBlob: (done: (blob: Blob | null) => void, type: string) => done(blob && new Blob([blob], { type })),
    }) as unknown as HTMLCanvasElement

  it('makes a PNG file of the canvas', async () => {
    const file = await canvasToFile(canvasWith(new Blob(['png'])), 'ostrovok-vibe.png')
    expect(file.name).toBe('ostrovok-vibe.png')
    expect(file.type).toBe('image/png')
  })

  it('rejects when the canvas gives no image', async () => {
    await expect(canvasToFile(canvasWith(null), 'x.png')).rejects.toThrow()
  })
})
