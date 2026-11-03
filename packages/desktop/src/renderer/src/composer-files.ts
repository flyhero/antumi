import { useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type RefObject } from 'react'
import type { EditorView } from '@codemirror/view'
import { ATTACHMENT_CHUNK_BYTES, IMAGE_MIME_TYPES, MAX_ATTACHMENT_BYTES } from '@antumi/protocol'
import { bytesToBase64 } from './base64'
import { CLIPBOARD_TYPE, pathTarget, placeTargets, type MentionedText, type MentionTarget } from './chat-mentions'
import { useCore } from './core-store'
import { pathForFile } from './desktop-bridge'
import { t } from './i18n'

// Past this many characters a paste goes to the agent as a file it reads rather than in the
// message: an agent takes only so much in one message, and the input stays readable.
export const PASTE_AS_FILE_CHARS = 4000

export function pastedLines(text: string): number {
  return text.replace(/\r?\n$/, '').split(/\r\n|\r|\n/).length
}

// The text kept by core as a file of the conversation's, as the input shows it; null where it was not.
async function keepPastedText(conversationId: string, text: string): Promise<MentionTarget | null> {
  const bytes = new TextEncoder().encode(text)
  const { rpc } = useCore.getState()
  if (!rpc || bytes.byteLength > MAX_ATTACHMENT_BYTES) return null
  try {
    const { uploadId } = await rpc.call('attachments.begin', { size: bytes.byteLength })
    for (let offset = 0; offset < bytes.byteLength; offset += ATTACHMENT_CHUNK_BYTES) {
      await rpc.call('attachments.append', { uploadId, offset, data: bytesToBase64(bytes.subarray(offset, offset + ATTACHMENT_CHUNK_BYTES)) })
    }
    const { path } = await rpc.call('attachments.commitText', { uploadId, conversationId })
    return { kind: 'file', path, relative: null, pasted: { lines: pastedLines(text) } }
  } catch {
    return null
  }
}

const isImage = (file: File) => IMAGE_MIME_TYPES.some((type) => type === file.type)

// Files dropped on the composer and long pastes. Images go to `addImages` where the agent takes
// them; any other file or folder becomes a mention of its path, where the drop landed. A long paste
// becomes a mention of the file core keeps it in; the message waits for it (`pasting`).
export function useComposerFiles({ conversationId, cwd, input, setValue, addImages, images, mentions, pastes, readOnly }: {
  conversationId: string
  cwd: string | null
  input: RefObject<EditorView | null>
  setValue: (change: (current: MentionedText) => MentionedText) => void
  addImages: (files: File[]) => void
  images: boolean
  mentions: boolean
  pastes: boolean
  readOnly: boolean
}) {
  const [pasting, setPasting] = useState(0)
  const caret = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (caret.current === null || !input.current) return
    input.current.dispatch({ selection: { anchor: Math.min(caret.current, input.current.state.doc.length) } })
    caret.current = null
  })

  const place = (targets: readonly MentionTarget[], at: number | null) => {
    const selection = input.current?.state.selection.main
    setValue((current) => {
      const from = Math.min(at ?? selection?.from ?? current.text.length, current.text.length)
      const to = at === null ? Math.min(selection?.to ?? from, current.text.length) : from
      const placed = placeTargets(current, from, to, targets)
      caret.current = placed.caret
      return placed.value
    })
    input.current?.focus()
  }

  const onPasteCapture = (event: ClipboardEvent) => {
    const data = event.clipboardData
    if (!pastes || readOnly || event.defaultPrevented || data.types.includes(CLIPBOARD_TYPE)) return
    const text = data.getData('text/plain')
    if (text.length <= PASTE_AS_FILE_CHARS) return
    event.preventDefault()
    setPasting((count) => count + 1)
    void keepPastedText(conversationId, text).then((target) => {
      setPasting((count) => count - 1)
      if (target) return place([target], null)
      // Nothing pasted is lost: it goes in as the text it was.
      useCore.setState({ error: t('composerFiles.pasteKeptAsText') })
      const view = input.current
      if (!view) return
      const { from, to } = view.state.selection.main
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: 'input.paste' })
    })
  }

  const onDragOver = (event: DragEvent) => {
    if ((images || mentions) && event.dataTransfer.types.includes('Files')) event.preventDefault()
  }

  // In capture, before the input's own drop, which would put a file's text in.
  const onDropCapture = (event: DragEvent) => {
    if (readOnly) return
    const dropped = [...event.dataTransfer.items].flatMap((item) => {
      const file = item.kind === 'file' ? item.getAsFile() : null
      return file ? [{ file, directory: item.webkitGetAsEntry()?.isDirectory ?? false }] : []
    })
    const pictures = images ? dropped.filter((entry) => !entry.directory && isImage(entry.file)).map((entry) => entry.file) : []
    const targets = mentions ? dropped.flatMap((entry) => {
      if (pictures.includes(entry.file)) return []
      const path = pathForFile(entry.file)
      return path ? [pathTarget(path, entry.directory ? 'directory' : 'file', cwd)] : []
    }) : []
    if (pictures.length === 0 && targets.length === 0) return
    event.preventDefault()
    if (pictures.length > 0) addImages(pictures)
    if (targets.length > 0) place(targets, input.current?.posAtCoords({ x: event.clientX, y: event.clientY }, false) ?? null)
  }

  return { pasting, onPasteCapture, onDragOver, onDropCapture }
}
