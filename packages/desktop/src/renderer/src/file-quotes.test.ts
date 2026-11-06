import { EditorState } from '@codemirror/state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { composeMessage, parseQuotes, setQuotes } from './chat-quotes'
import { fileQuoteText, quoteFileInChat, selectedFilePassage } from './file-quotes'
import { useCore } from './core-store'

vi.mock('./helper-conversations', () => ({ focusChatInput: vi.fn() }))
const { addQuote } = vi.hoisted(() => ({ addQuote: vi.fn() }))
vi.mock('./chat-quotes', async (original) => ({ ...await original<typeof import('./chat-quotes')>(), addQuote }))

beforeEach(() => {
  vi.stubGlobal('location', { hash: '' })
  vi.stubGlobal('window', { antumi: undefined })
  addQuote.mockReset().mockReturnValue('q1')
  useCore.setState({ error: null })
})
afterEach(() => { setQuotes('chat', []); vi.unstubAllGlobals() })

describe('file passages', () => {
  it('keeps the exact selected text and source lines, including reversed selections', () => {
    const state = EditorState.create({ doc: 'first\n  second\nthird\nfourth', selection: { anchor: 20, head: 6 } })
    expect(selectedFilePassage(state)).toEqual({ text: '  second\nthird', line: 2, endLine: 3 })
    expect(fileQuoteText('/repo/a.ts', selectedFilePassage(state) ?? undefined)).toBe('/repo/a.ts:2-3\n  second\nthird')
  })

  it('excludes an unselected next line when the selection ends at its start', () => {
    const state = EditorState.create({ doc: 'first\nsecond\nthird', selection: { anchor: 6, head: 13 } })
    expect(selectedFilePassage(state)).toEqual({ text: 'second\n', line: 2, endLine: 2 })
  })

  it('reads very long selections from the document and preserves CRLF', () => {
    const doc = Array.from({ length: 1000 }, (_, index) => `line ${index}`).join('\r\n')
    const state = EditorState.create({ doc, extensions: EditorState.lineSeparator.of('\r\n') })
    const selected = state.update({ selection: { anchor: 0, head: state.doc.length } }).state
    expect(selectedFilePassage(selected)).toEqual({ text: doc, line: 1, endLine: 1000 })
  })

  it('ignores empty or whitespace selections', () => {
    expect(selectedFilePassage(EditorState.create({ doc: 'test' }))).toBeNull()
    expect(selectedFilePassage(EditorState.create({ doc: ' \n\t', selection: { anchor: 0, head: 3 } }))).toBeNull()
  })

  it('carries absolute paths for whole files and rendered Markdown without inventing line numbers', () => {
    expect(fileQuoteText('C:\\project\\a file.md')).toBe('C:\\project\\a file.md')
    const text = fileQuoteText('/other/guide.md', { text: 'A rendered passage' })
    const message = composeMessage([{ source: null, text, note: 'Please clarify this' }], 'Continue')
    expect(parseQuotes(message)).toEqual({ quotes: [{ source: null, text, note: 'Please clarify this' }], body: 'Continue' })
  })
})

describe('delivering files to the conversation', () => {
  it('appends a file quote with its comment to the requested conversation', async () => {
    expect(await quoteFileInChat('chat', '/repo/a.ts:2\nconst x = 1', 'Rename x')).toBe(true)
    expect(addQuote).toHaveBeenCalledWith('chat', null, '/repo/a.ts:2\nconst x = 1', 'Rename x')
  })

  it('delivers a detached window selection and comment to the main window instead of its local store', async () => {
    const sendPanelQuote = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('location', { hash: '#panel-files' })
    vi.stubGlobal('window', { antumi: { sendPanelQuote } })
    expect(await quoteFileInChat('chat', '/repo/a.ts:1\ncode', 'Explain')).toBe(true)
    expect(sendPanelQuote).toHaveBeenCalledWith({ conversationId: 'chat', text: '/repo/a.ts:1\ncode', note: 'Explain' })
    expect(addQuote).not.toHaveBeenCalled()
  })

  it('reports failed delivery so the selection and comment can be retried', async () => {
    vi.stubGlobal('location', { hash: '#panel-files' })
    vi.stubGlobal('window', { antumi: { sendPanelQuote: vi.fn().mockResolvedValue(false) } })
    expect(await quoteFileInChat('chat', '/repo/a.ts', 'Keep this')).toBe(false)
    expect(useCore.getState().error).toBeTruthy()
    expect(addQuote).not.toHaveBeenCalled()
  })
})
