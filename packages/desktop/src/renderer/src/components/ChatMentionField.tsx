import { useCallback, useLayoutEffect, useRef, useState, type HTMLAttributes, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Annotation, Compartment, EditorState, StateEffect, StateField, type ChangeDesc, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, drawSelection, keymap, placeholder, type DecorationSet } from '@codemirror/view'
import { invertedEffects } from '@codemirror/commands'
import { ChatReference, validChatReferences } from '@antumi/protocol'
import { LinkMark, ReferenceMark, useOpenReference } from './ChatReference'
import { textLinks } from '../text-links'
import { shiftMentions, type Mention, type MentionedText, type MentionTarget } from '../chat-mentions'

const EMPTY: MentionedText = { text: '', mentions: [] }
// How many of the texts the input held are kept with their mentions, for undo to find again.
const RECALLED = 100

// `caret`: where the caret is after the change, when the user made it by typing.
export type SetText = (next: string | ((current: string) => string), caret?: number | null) => void
type SetMentionedText = (next: MentionedText | ((current: MentionedText) => MentionedText)) => void

// What the input holds: its text and the mentions in it, kept in step however the text changes
// (typing, a pick, a queued message put back). Undo and redo bring back a text the input held, so
// a text met before gets back the mentions it had.
export function useMentionedText(initial: MentionedText = EMPTY): { value: MentionedText; setText: SetText; setValue: SetMentionedText } {
  const [value, setState] = useState<MentionedText>(initial)
  const latest = useRef(value)
  const held = useRef(new Map<string, readonly Mention[]>([[initial.text, initial.mentions]]))
  const setValue = useCallback<SetMentionedText>((change) => {
    const next = typeof change === 'function' ? change(latest.current) : change
    latest.current = next
    held.current.delete(next.text)
    held.current.set(next.text, next.mentions)
    const oldest = held.current.keys().next().value
    if (held.current.size > RECALLED && oldest !== undefined) held.current.delete(oldest)
    setState(next)
  }, [])
  const setText = useCallback<SetText>((next, caret = null) => {
    const current = latest.current
    const text = typeof next === 'function' ? next(current.text) : next
    if (text === current.text) return
    setValue({ text, mentions: held.current.get(text) ?? shiftMentions(current.mentions, current.text, text, caret) })
  }, [setValue])
  return { value, setText, setValue }
}

const setMentions = StateEffect.define<readonly Mention[]>()
const external = Annotation.define<boolean>()
const CLIPBOARD_TYPE = 'application/x-antumi-references'

function mapMentions(mentions: readonly Mention[], changes: ChangeDesc): Mention[] {
  return mentions.flatMap((mention) => {
    let touched = false
    changes.iterChangedRanges((from, to) => {
      if (from < mention.end && to > mention.start) touched = true
    })
    return touched ? [] : [{ ...mention, start: changes.mapPos(mention.start, 1), end: changes.mapPos(mention.end, -1) }]
  })
}

const referenceState = StateField.define<readonly Mention[]>({
  create: () => [],
  update: (mentions, transaction) => {
    const replacement = transaction.effects.find((effect) => effect.is(setMentions))
    return replacement?.value ?? (transaction.docChanged ? mapMentions(mentions, transaction.changes) : mentions)
  }
})

const widgetRoots = new WeakMap<HTMLElement, Root>()
function WidgetContent({ target, view, open }: { target: MentionTarget; view: EditorView; open: (target: MentionTarget) => void }) {
  useLayoutEffect(() => { view.requestMeasure() }, [view])
  return <ReferenceMark target={target} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => open(target)} />
}

class ReferenceWidget extends WidgetType {
  constructor(readonly target: MentionTarget, readonly open: (target: MentionTarget) => void) { super() }
  override eq(other: ReferenceWidget): boolean { return JSON.stringify(this.target) === JSON.stringify(other.target) }
  override toDOM(view: EditorView): HTMLElement {
    const element = document.createElement('span')
    element.className = 'cm-reference'
    const root = createRoot(element)
    widgetRoots.set(element, root)
    root.render(<WidgetContent target={this.target} view={view} open={this.open} />)
    return element
  }
  override destroy(element: HTMLElement): void {
    const root = widgetRoots.get(element)
    queueMicrotask(() => root?.unmount())
  }
}

function LinkContent({ href, view }: { href: string; view: EditorView }) {
  useLayoutEffect(() => { view.requestMeasure() }, [view])
  return <LinkMark href={href} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} />
}

class LinkWidget extends WidgetType {
  constructor(readonly href: string) { super() }
  override eq(other: LinkWidget): boolean { return this.href === other.href }
  override toDOM(view: EditorView): HTMLElement {
    const element = document.createElement('span')
    element.className = 'cm-reference'
    const root = createRoot(element)
    widgetRoots.set(element, root)
    root.render(<LinkContent href={this.href} view={view} />)
    return element
  }
  override destroy(element: HTMLElement): void {
    const root = widgetRoots.get(element)
    queueMicrotask(() => root?.unmount())
  }
}

// Whether the input last changed by the user typing: an address still being typed at the caret
// stays text, so it is not cut short into a chip, until the caret leaves its end.
const typing = StateField.define<boolean>({
  create: () => false,
  update: (value, transaction) => transaction.isUserEvent('input.type') ? true : transaction.docChanged || transaction.selection ? false : value
})

// The web addresses in the text, outside any mention, as chips; the text stays the address.
function linkRanges(state: EditorState, mentions: readonly Mention[]): Range<Decoration>[] {
  const caret = state.selection.main.head
  const ranges: Range<Decoration>[] = []
  let at = 0
  for (const part of textLinks(state.doc.toString())) {
    const start = at
    at += part.kind === 'text' ? part.text.length : part.href.length
    if (part.kind === 'text' || (state.field(typing) && at === caret) || mentions.some((mention) => mention.start < at && mention.end > start)) continue
    ranges.push(Decoration.replace({ widget: new LinkWidget(part.href) }).range(start, at))
  }
  return ranges
}

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'onInput' | 'onSelect' | 'children'> & {
  value: MentionedText
  setValue: (value: MentionedText) => void
  input: RefObject<EditorView | null>
  onSelectionChange?: () => void
  placeholder?: string
  readOnly?: boolean
  autoFocus?: boolean
}

// Atomic widgets keep the native paths and web addresses out of the editing surface without changing its text.
export function MentionField({ value, setValue, input, onSelectionChange, placeholder: hint = '', readOnly = false, autoFocus, ...props }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const open = useOpenReference()
  const handlers = useRef({ setValue, onSelectionChange, open })
  handlers.current = { setValue, onSelectionChange, open }
  const wording = useRef(new Compartment())
  const initial = useRef(value)
  const label = props['aria-label'] ?? ''

  useLayoutEffect(() => {
    if (!host.current) return
    const decorations = StateField.define<DecorationSet>({
      create: () => Decoration.none,
      update: (_, transaction) => {
        const mentions = transaction.state.field(referenceState)
        return Decoration.set([...mentions.map((mention) =>
          Decoration.replace({ widget: new ReferenceWidget(mention.target, (target) => handlers.current.open(target)) }).range(mention.start, mention.end)),
        ...linkRanges(transaction.state, mentions)], true)
      },
      provide: (field) => [EditorView.decorations.from(field), EditorView.atomicRanges.of((view) => view.state.field(field))]
    })
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial.current.text,
        extensions: [
          referenceState, typing, decorations, history(), drawSelection(),
          invertedEffects.of((transaction) => transaction.docChanged || transaction.effects.some((effect) => effect.is(setMentions))
            ? [setMentions.of(transaction.startState.field(referenceState))] : []),
          keymap.of([...defaultKeymap, ...historyKeymap]), EditorView.lineWrapping,
          wording.current.of([]),
          EditorView.contentAttributes.of({ class: 'chat-input', role: 'textbox', 'aria-multiline': 'true' }),
          EditorView.domEventHandlers({
            copy: (event) => copy(event, view, false),
            cut: (event) => copy(event, view, true),
            paste: (event) => {
              if (event.defaultPrevented) return true
              const raw = event.clipboardData?.getData(CLIPBOARD_TYPE)
              if (!raw) return false
              try {
                const text = event.clipboardData?.getData('text/plain') ?? ''
                const parsed = ChatReference.array().safeParse(JSON.parse(raw))
                if (!parsed.success || parsed.data.some((mention) => mention.end > text.length) || view.state.readOnly) return false
                const { from, to } = view.state.selection.main
                const kept = mapMentions(view.state.field(referenceState), view.state.changes({ from, to, insert: text }))
                view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length },
                  effects: setMentions.of([...kept, ...validChatReferences(text, parsed.data).map((mention) => ({ ...mention, start: mention.start + from, end: mention.end + from }))].sort((a, b) => a.start - b.start)), userEvent: 'input.paste' })
                event.preventDefault()
                return true
              } catch { return false }
            }
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged || update.startState.field(referenceState) !== update.state.field(referenceState)) {
              if (!update.transactions.some((transaction) => transaction.annotation(external))) handlers.current.setValue({ text: update.state.doc.toString(), mentions: update.state.field(referenceState) })
            }
            if (update.selectionSet || update.docChanged) handlers.current.onSelectionChange?.()
          })
        ]
      })
    })
    input.current = view
    view.dispatch({ effects: setMentions.of(initial.current.mentions), annotations: external.of(true) })
    if (autoFocus) view.focus()
    return () => { input.current = null; view.destroy() }
  }, [input])

  useLayoutEffect(() => {
    const view = input.current
    if (!view) return
    const before = view.state.doc.toString()
    if (before === value.text && JSON.stringify(view.state.field(referenceState)) === JSON.stringify(value.mentions)) return
    // A narrow edit preserves the caret when a menu inserts a pick in the middle of a message.
    let from = 0
    while (from < before.length && from < value.text.length && before[from] === value.text[from]) from++
    let suffix = 0
    while (suffix < before.length - from && suffix < value.text.length - from && before.at(-1 - suffix) === value.text.at(-1 - suffix)) suffix++
    view.dispatch({ changes: { from, to: before.length - suffix, insert: value.text.slice(from, value.text.length - suffix) }, effects: setMentions.of(value.mentions), annotations: external.of(true) })
  }, [input, value])

  useLayoutEffect(() => {
    input.current?.dispatch({ effects: wording.current.reconfigure([
      placeholder(hint), EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
      EditorView.contentAttributes.of({ 'aria-label': label, 'aria-readonly': String(readOnly),
        ...Object.fromEntries(Object.entries(props).filter(([name, val]) => name.startsWith('aria-') && val !== undefined).map(([name, val]) => [name, String(val)])) })
    ]), annotations: external.of(true) })
  }, [input, hint, label, readOnly, props['aria-expanded'], props['aria-controls'], props['aria-activedescendant']])

  return <div {...props} className="chat-input-field" ref={host} />
}

function copy(event: ClipboardEvent, view: EditorView, cut: boolean): boolean {
  const { from, to } = view.state.selection.main
  if (from === to || !event.clipboardData) return false
  const text = view.state.sliceDoc(from, to)
  const mentions = view.state.field(referenceState).filter((mention) => mention.start >= from && mention.end <= to)
    .map((mention) => ({ ...mention, start: mention.start - from, end: mention.end - from }))
  event.clipboardData.setData('text/plain', text)
  event.clipboardData.setData(CLIPBOARD_TYPE, JSON.stringify(mentions))
  event.preventDefault()
  if (cut && !view.state.readOnly) view.dispatch({ changes: { from, to }, selection: { anchor: from }, userEvent: 'delete.cut' })
  return true
}
