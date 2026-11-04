import { getLocale, t, tr } from '../i18n'
import { createContext, Fragment, useEffect, useMemo, useState } from 'react'
import { addQuote, removeQuote, useQuotes, type ChatQuote } from '../chat-quotes'
import { diffQuoteText, diffRowId } from '../unified-diff'
import { useDiffHighlight, type HighlightedDiffRow } from '../diff-highlight'
import { splitRows, type SplitCell } from '../split-diff'
import { DiffCode } from './DiffCode'
import { CloseIcon } from './icons'

// The chat a diff's comments go to, from the inspector that shows it; null where there is none
// (a terminal task), and the diff stays read-only.
export const DiffCommentConversation = createContext<string | null>(null)

// The rows picked to comment on: where the pick began and where it reaches, in one hunk.
type LinePick = { hunk: number; origin: number; reach: number }

// A diff whose lines take comments: a line's number picks it, Shift picks on to another in its hunk,
// and what the user says joins the chat's quotes, to go with their next message. diffKey names the
// diff across reloads, so the lines a waiting comment is on stay marked.
// split: side by side (splitRows), the old file's numbers on the left and the new file's on the right.
export function CommentableDiff({ patch, path, conversationId, diffKey, split = false }: {
  patch: string
  path: string
  conversationId: string
  diffKey: string
  split?: boolean
}) {
  const rows = useDiffHighlight(patch, path)
  const ids = useMemo(() => rows.map(diffRowId), [rows, getLocale()])
  const quotes = useQuotes(conversationId)
  const comments = quotes.filter((quote) => quote.anchor?.diff === diffKey)
  const [pick, setPick] = useState<LinePick | null>(null)
  const [note, setNote] = useState('')
  useEffect(() => setPick(null), [patch])

  const commented = new Set(comments.flatMap((quote) => quote.anchor?.rows ?? []))
  // Each comment shows under the last line it is on, while that line is still in the diff.
  const below = new Map<number, ChatQuote[]>()
  for (const quote of comments) {
    const last = quote.anchor?.rows.at(-1)
    const at = last === undefined ? -1 : ids.indexOf(last)
    if (at >= 0) below.set(at, [...below.get(at) ?? [], quote])
  }
  const from = pick ? Math.min(pick.origin, pick.reach) : -1
  const to = pick ? Math.max(pick.origin, pick.reach) : -1

  const choose = (index: number, extend: boolean) => {
    const hunk = rows[index]?.hunk
    if (hunk === null || hunk === undefined) return
    if (extend && pick && pick.hunk === hunk) {
      setPick({ ...pick, reach: index })
      return
    }
    setPick({ hunk, origin: index, reach: index })
    setNote('')
  }
  const submit = () => {
    const chosen = rows.slice(from, to + 1).filter((row) => row.hunk !== null)
    if (chosen.length === 0) return
    const anchored = chosen.flatMap((row) => diffRowId(row) ?? [])
    addQuote(conversationId, null, diffQuoteText(path, chosen), note, { diff: diffKey, rows: anchored })
    setPick(null)
  }

  // A line's number, which picks the line to comment on; line is the number its side shows.
  const lineNumber = (index: number, row: HighlightedDiffRow, line: number | null) => (ids[index] ?? null) !== null && line !== null && (
    <button
      type="button"
      className="diff-line-number"
      data-old={row.newLine === null || undefined}
      aria-label={t('DiffComments.commentOnLine', { line: line })}
      title={t('DiffComments.commentOnThisLineShiftClickAnotherLine')}
      // Shift would otherwise also stretch the page's text selection.
      onMouseDown={(event) => event.shiftKey && event.preventDefault()}
      onClick={(event) => choose(index, event.shiftKey)}
    >
      {line}
    </button>
  )
  const marks = (index: number) => {
    const id = ids[index] ?? null
    return { 'data-picked': (index >= from && index <= to) || undefined, 'data-commented': (id !== null && commented.has(id)) || undefined }
  }
  // What follows a line: its comments, then the box for a new one where the pick ends.
  const after = (indexes: readonly number[]) => (
    <>
      {[...new Set(indexes)].flatMap((index) => below.get(index) ?? []).map((quote) => (
        <div key={quote.id} className="diff-comment">
          <span className={quote.note ? 'diff-comment-note' : 'diff-comment-note muted'}>{quote.note || t('DiffComments.quoteOnlyThisCode')}</span>
          <button type="button" className="tool-button" aria-label={t('DiffComments.removeComment')} data-tooltip={t('ChatQuoteCards.remove')} onClick={() => removeQuote(conversationId, quote.id)}>
            <CloseIcon />
          </button>
        </div>
      ))}
      {pick && indexes.includes(to) && (
        <div className="diff-comment diff-comment-draft">
          <input
            autoFocus
            value={note}
            placeholder={from === to ? t('DiffComments.commentOnLine_794', { line: rows[to]?.newLine ?? rows[to]?.oldLine }) : t('DiffComments.commentOnTheseLines')}
            aria-label={t('DiffComments.comments')}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Enter') {
                event.preventDefault()
                submit()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setPick(null)
              }
            }}
          />
          <button type="button" className="link-button" onClick={() => setPick(null)}>{t('ChatCommandSettings.cancel')}</button>
          <button type="button" className="link-button" onClick={submit}>{t('DiffComments.comments')}</button>
        </div>
      )}
    </>
  )
  const side = (cell: SplitCell<HighlightedDiffRow> | null, old: boolean) => cell
    ? <div className={`diff-split-cell ${cell.row.kind}`} {...marks(cell.index)}>
      <span className="diff-gutter">{lineNumber(cell.index, cell.row, old ? cell.row.oldLine : cell.row.newLine)}</span>
      <span className="diff-split-code"><DiffCode row={cell.row} bare /></span>
    </div>
    : <div className="diff-split-cell diff-split-empty" />

  return (
    <>
      {split ? (
        <div className="diff-view diff-view-commentable diff-view-split">
          {splitRows(rows).map((line, at) => line.kind === 'full' ? (
            <div key={at} className={`diff-split-full ${line.cell.row.kind}`}><DiffCode row={line.cell.row} /></div>
          ) : (
            <Fragment key={at}>
              <div className="diff-split-pair">{side(line.left, true)}{side(line.right, false)}</div>
              {after([line.left?.index, line.right?.index].filter((index) => index !== undefined))}
            </Fragment>
          ))}
        </div>
      ) : (
        <pre className="diff-view diff-view-commentable">
          {rows.map((row, index) => (
            <Fragment key={index}>
              <div className={row.kind} {...marks(index)}>
                <span className="diff-gutter">{lineNumber(index, row, row.newLine ?? row.oldLine)}</span>
                <DiffCode row={row} />
              </div>
              {after([index])}
            </Fragment>
          ))}
        </pre>
      )}
      {comments.length > 0 && <p className="inspector-empty muted">{tr('DiffComments.commentsInTheComposerWillBeSentWith', { value1: comments.length })}</p>}
    </>
  )
}
