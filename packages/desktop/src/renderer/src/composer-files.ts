import { useLayoutEffect, useRef, type DragEvent, type RefObject } from 'react'
import type { EditorView } from '@codemirror/view'
import { IMAGE_MIME_TYPES } from '@antumi/protocol'
import { pathTarget, placeTargets, type MentionedText, type MentionTarget } from './chat-mentions'
import { pathForFile } from './desktop-bridge'

const isImage = (file: File) => IMAGE_MIME_TYPES.some((type) => type === file.type)

// Files dropped on the composer. Images go to `addImages` where the agent takes them; any other
// file or folder becomes a mention of its path, where the drop landed.
export function useComposerFiles({ cwd, input, setValue, addImages, images, mentions, readOnly }: {
  cwd: string | null
  input: RefObject<EditorView | null>
  setValue: (change: (current: MentionedText) => MentionedText) => void
  addImages: (files: File[]) => void
  images: boolean
  mentions: boolean
  readOnly: boolean
}) {
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

  return { onDragOver, onDropCapture }
}
