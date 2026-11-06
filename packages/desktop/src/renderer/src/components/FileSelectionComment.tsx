import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { EditorView } from '@codemirror/view'
import { useOccludesBrowser } from '../browser-occlusion'
import { fileQuoteText, quoteFileInChat, selectedFilePassage } from '../file-quotes'
import { placeCommentBox, type Bounds } from '../plan-comment-place'
import { selectedTextIn } from '../text-selection'
import { t } from '../i18n'
import { ChatIcon } from './icons'

type Passage = { text: string; line?: number; endLine?: number; bounds: Bounds }

export function FileSelectionComment({ conversationId, path, source, editor, preview, rendered, hidden }: {
  conversationId: string; path: string; source: RefObject<HTMLElement | null>; editor: RefObject<EditorView | null>
  preview: boolean; rendered: RefObject<HTMLElement | null>; hidden: boolean
}) {
  const [draft, setDraft] = useState<Passage | null>(null)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const box = useRef<HTMLFormElement>(null)
  const container = preview ? rendered : source

  useEffect(() => {
    setDraft(null)
    const element = container.current
    if (!element) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const pick = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof MouseEvent && event.button !== 0) return
      if (event instanceof KeyboardEvent && (event.key === 'Escape' || event.isComposing)) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (box.current?.contains(document.activeElement)) return
        let passage: Passage | null = null
        if (preview) {
          const picked = selectedTextIn(element, '.file-markdown')
          if (picked) passage = { text: picked.text, bounds: picked.range.getBoundingClientRect() }
        } else {
          const view = editor.current
          const picked = view && selectedFilePassage(view.state)
          const cursor = view && view.coordsAtPos(view.state.selection.main.head)
          if (picked && cursor) passage = { ...picked, bounds: cursor }
        }
        setDraft(passage)
        setComment('')
      }, 0)
    }
    element.addEventListener('mouseup', pick)
    element.addEventListener('keyup', pick)
    return () => {
      clearTimeout(timer)
      element.removeEventListener('mouseup', pick)
      element.removeEventListener('keyup', pick)
    }
  }, [container, editor, preview, conversationId, path])

  useEffect(() => {
    if (!draft) return
    const close = () => setDraft(null)
    const outside = (event: PointerEvent) => { if (!(event.target instanceof Node && box.current?.contains(event.target))) close() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.isComposing) close() }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('scroll', close, true)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('scroll', close, true)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', close)
    }
  }, [draft])

  useOccludesBrowser(Boolean(draft && !hidden))
  if (!draft || hidden) return null
  const bounds = container.current?.closest('.side-panel')?.getBoundingClientRect()
  const place = placeCommentBox({ passage: draft.bounds, anchorX: (draft.bounds.left + draft.bounds.right) / 2, panel: bounds ?? null, viewport: { width: window.innerWidth, height: window.innerHeight } })
  const add = async () => {
    if (sending) return
    setSending(true)
    const accepted = await quoteFileInChat(conversationId, fileQuoteText(path, draft), comment)
    setSending(false)
    if (accepted) { setDraft(null); document.getSelection()?.removeAllRanges() }
  }
  return createPortal(<form ref={box} className="selection-comment-box file-selection-comment" style={place} aria-label={t('FileQuotes.commentOnSelection')} onSubmit={(event) => { event.preventDefault(); void add() }}>
    <ChatIcon />
    <input className="selection-comment-input" value={comment} disabled={sending} placeholder={t('FileQuotes.optionalComment')} aria-label={t('FileQuotes.commentOnSelection')} onChange={(event) => setComment(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault() }} />
    <button type="submit" className="file-selection-send" disabled={sending} onMouseDown={(event) => event.preventDefault()}>{t('FileQuotes.addToConversation')}</button>
  </form>, document.body)
}
