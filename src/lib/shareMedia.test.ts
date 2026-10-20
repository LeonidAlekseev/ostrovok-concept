// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canShareFile, downloadFile, extensionOf, recordCanvas, shareFile, shareText, videoType } from './shareMedia'

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

// star-search, Requirement: Видео результата
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
