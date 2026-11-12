// This runs in the preview's sandbox before any of the file's own scripts.
export const PREVIEW_MEDIA_SCRIPT = String.raw`(() => {
  let activated = false
  const allowed = () => activated || navigator.userActivation?.hasBeenActive === true
  const activate = (event) => { if (event.isTrusted) activated = true }
  document.addEventListener('pointerdown', activate, true)
  document.addEventListener('keydown', activate, true)

  const quiet = (media) => {
    if (allowed()) return
    if (media.autoplay) media.autoplay = false
    if (!media.paused) media.pause()
  }
  document.addEventListener('play', (event) => {
    if (event.target instanceof HTMLMediaElement) quiet(event.target)
  }, true)

  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function () {
    if (allowed()) return play.call(this)
    quiet(this)
    return Promise.reject(new DOMException('Interact with this preview before playing media.', 'NotAllowedError'))
  }

  // Muted autoplay bypasses the browser's usual gesture policy, including inside iframes.
  const observer = new MutationObserver((records) => {
    if (allowed()) { observer.disconnect(); return }
    for (const record of records) {
      if (record.target instanceof HTMLMediaElement) quiet(record.target)
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue
        if (node instanceof HTMLMediaElement) quiet(node)
        node.querySelectorAll('video, audio').forEach(quiet)
      }
    }
  })
  observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['autoplay'] })
})();`

export function previewHtml(html: string): string {
  // Keep the doctype first: inserting a script before it would change standards mode to quirks.
  const prefix = /^(?:\uFEFF)?(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>/i.exec(html)?.[0] ?? ''
  const head = /^(?:\s|<!--[\s\S]*?-->)*(?:<html\b[^>]*>(?:\s|<!--[\s\S]*?-->)*)?<head\b[^>]*>/i.exec(html.slice(prefix.length))?.[0] ?? ''
  const at = prefix.length + head.length
  return `${html.slice(0, at)}<script>${PREVIEW_MEDIA_SCRIPT}</script>${html.slice(at)}`
}
