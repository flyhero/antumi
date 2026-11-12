import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { PREVIEW_MEDIA_SCRIPT, previewHtml } from './preview-html'

function preview() {
  class Element {
    querySelectorAll(): Media[] { return [] }
  }
  class Media extends Element {
    autoplay = true
    paused = true
    play() { this.paused = false; return Promise.resolve() }
    pause() { this.paused = true }
  }
  type PreviewEvent = { isTrusted: boolean; target?: Media }
  type Mutation = { target: Element; addedNodes: Element[] }
  const listeners = new Map<string, (event: PreviewEvent) => void>()
  let mutation: (records: Mutation[]) => void = () => {}
  const disconnected = vi.fn()
  class Observer {
    constructor(callback: (records: Mutation[]) => void) { mutation = callback }
    observe() {}
    disconnect = disconnected
  }
  const activation = { hasBeenActive: false }
  runInNewContext(PREVIEW_MEDIA_SCRIPT, {
    document: { addEventListener: (name: string, listener: (event: PreviewEvent) => void) => listeners.set(name, listener) },
    navigator: { userActivation: activation }, HTMLMediaElement: Media, Element, MutationObserver: Observer, DOMException, Promise
  })
  return { Media, activation, listeners, mutate: (records: Mutation[]) => mutation(records), disconnected }
}

describe('HTML preview media', () => {
  it('blocks scripted playback and strips autoplay from inserted media before interaction', async () => {
    const page = preview()
    const media = new page.Media()
    await expect(media.play()).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(media.paused).toBe(true)
    media.autoplay = true
    page.mutate([{ target: media, addedNodes: [media] }])
    expect(media.autoplay).toBe(false)
    media.autoplay = true
    page.mutate([{ target: media, addedNodes: [] }])
    expect(media.autoplay).toBe(false)
  })

  it('pauses native autoplay and ignores synthetic interaction events', async () => {
    const page = preview()
    const media = new page.Media()
    media.paused = false
    page.listeners.get('play')?.({ isTrusted: true, target: media })
    expect(media.paused).toBe(true)
    page.listeners.get('pointerdown')?.({ isTrusted: false })
    await expect(media.play()).rejects.toMatchObject({ name: 'NotAllowedError' })
  })

  it.each(['pointerdown', 'keydown'])('allows playback after a genuine %s inside the preview', async (event) => {
    const page = preview()
    const media = new page.Media()
    page.listeners.get(event)?.({ isTrusted: true })
    await media.play()
    expect(media.paused).toBe(false)
    page.mutate([])
    expect(page.disconnected).toHaveBeenCalledOnce()
  })

  it('accepts activation by native media controls and requires interaction again in a new document', async () => {
    const page = preview()
    page.activation.hasBeenActive = true
    const media = new page.Media()
    await media.play()
    expect(media.paused).toBe(false)
    const reopened = preview()
    await expect(new reopened.Media().play()).rejects.toMatchObject({ name: 'NotAllowedError' })
  })

  it.each(['<!doctype html>', '\uFEFF\n<!-- generated -->\n<!DOCTYPE html>'])('preserves standards mode with %s', (prefix) => {
    const original = `${prefix}<html><head><script>window.started = true</script></head><body><video autoplay controls></video></body></html>`
    const rendered = previewHtml(original)
    expect(rendered.startsWith(`${prefix}<html><head><script>`)).toBe(true)
    expect(rendered.indexOf(PREVIEW_MEDIA_SCRIPT)).toBeLessThan(rendered.indexOf('window.started'))
    expect(rendered.endsWith('<script>window.started = true</script></head><body><video autoplay controls></video></body></html>')).toBe(true)
  })

  it('keeps fragments intact after installing the media gate', () => {
    const original = '<video autoplay controls src="movie.mp4"></video>'
    expect(previewHtml(original)).toBe(`<script>${PREVIEW_MEDIA_SCRIPT}</script>${original}`)
  })

  it('keeps attributes on the original html and head elements', () => {
    const original = '<!doctype html>\n<html lang="zh">\n<head data-player="video"><title>Preview</title></head><body></body></html>'
    expect(previewHtml(original)).toContain(`<html lang="zh">\n<head data-player="video"><script>${PREVIEW_MEDIA_SCRIPT}</script><title>`)
  })
})
