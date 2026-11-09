import { useEffect, useRef, useState } from 'react'
import type { SourceUpdateTarget, SourceUpdates } from '@antumi/protocol'
import { perform, showSourceUpdates, useCore } from '../core-store'
import { t } from '../i18n'
import { dayAndTime } from '../labels'
import { MarkdownEditor } from './MarkdownEditor'
import { useSourceUpdateSummary } from '../source-updates'
import { useConversationPane } from './conversation-pane'
import { ChatIcon, PauseIcon, SourceIcon, WarningIcon } from './icons'
import { SourceLink } from './SourceLink'
import { Spinner } from './Spinner'

const ignore = () => {}

export function SourceCommentBadge({ target }: { target: SourceUpdateTarget }) {
  const summary = useCore((state) => state.sourceUpdates[`${target.kind}:${target.id}`])
  return summary && summary.unread > 0 ? <span className="source-comment-badge" title={t('SourceUpdates.newComments', { count: summary.unread })}>{t('SourceUpdates.newComments', { count: summary.unread })}</span> : null
}

export function SourceUpdatesButton({ target }: { target: SourceUpdateTarget }) {
  const summary = useSourceUpdateSummary(target)
  const source = useCore((state) => target.kind === 'task' ? state.tasks[target.id]?.source : state.conversations[target.id]?.source)
  const pane = useConversationPane()
  const expanded = useCore((state) => target.kind === 'task'
    ? state.inspectorOpen && state.taskInspectorTab === 'source'
    : state.conversationInspectorOpen && state.conversationInspectorTab === 'source')
  if (!summary) return null
  const hints = [t('SourceUpdates.title'), summary.pending > 0 ? t('SourceUpdates.pending', { count: summary.pending }) : t('SourceUpdates.noPending')]
  if (source) hints.splice(1, 0, `${source.name} ${source.key}`)
  if (summary.unread > 0) hints.push(t('SourceUpdates.newComments', { count: summary.unread }))
  if (summary.problem) hints.push(summary.problem)
  else if (!summary.active) hints.push(t('SourceUpdates.paused'))
  return <button
    type="button"
    className="source-updates-button"
    aria-label={hints.join(' · ')}
    aria-expanded={expanded && (pane?.active ?? true)}
    data-tooltip={hints.join(' · ')}
    data-tooltip-side="top-end"
    data-pending={summary.pending > 0 || undefined}
    data-problem={Boolean(summary.problem) || undefined}
    onClick={() => { if (pane && !pane.active) pane.focus(); showSourceUpdates(target) }}
  >
    {source ? <SourceIcon provider={source.provider} fallback={ChatIcon} /> : <ChatIcon />}
    <span>{t('SourceUpdates.title')}</span>
    {summary.pending > 0 && <span className="source-updates-count">{summary.pending}</span>}
    {summary.unread > 0 && <span className="source-updates-unread" aria-hidden="true" />}
    {summary.refreshing ? <Spinner /> : summary.problem ? <WarningIcon /> : !summary.active ? <PauseIcon /> : null}
  </button>
}

export function SourceUpdatesPanel({ target, inspector = false }: { target: SourceUpdateTarget; inspector?: boolean }) {
  const supported = useCore((state) => state.rpc?.features.includes('source-comments-v1') ?? false)
  const summary = useCore((state) => state.sourceUpdates[`${target.kind}:${target.id}`])
  const source = useCore((state) => target.kind === 'task' ? state.tasks[target.id]?.source : state.conversations[target.id]?.source)
  const [open, setOpen] = useState(false)
  const visible = inspector || open
  const [loadedPage, setPage] = useState<SourceUpdates | null>(null)
  const page = loadedPage?.summary.target.kind === target.kind && loadedPage.summary.target.id === target.id ? loadedPage : null
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const request = useRef<string | null>(null)
  const scope = `${target.kind}:${target.id}`
  const currentScope = useRef(scope)
  currentScope.current = scope
  const loadGeneration = useRef(0)
  useEffect(() => { setOpen(false); setPage(null); setFailed(false); request.current = null }, [scope])
  useEffect(() => {
    if (!supported || !visible) return
    const generation = ++loadGeneration.current
    let current = true
    void perform((rpc) => rpc.call('sources.updates', { target })).then((result) => {
      if (!current || generation !== loadGeneration.current || currentScope.current !== scope) return
      setFailed(!result)
      if (result) {
        setPage(result)
        if (result.summary.unread <= result.comments.length && result.summary.unread > 0) void perform((rpc) => rpc.call('sources.markUpdatesSeen', { target, through: result.summary.through }))
      }
    })
    return () => { current = false }
  }, [supported, visible, scope, summary?.revision, summary?.through, summary?.pending, summary?.refreshedAt, summary?.refreshing])
  if (!supported || !summary) return null
  const action = async (run: () => Promise<unknown>) => { setBusy(true); try { await run() } finally { setBusy(false) } }
  const send = (requestId?: string) => action(async () => {
    request.current = requestId ?? request.current ?? crypto.randomUUID()
    const delivery = await perform((rpc) => rpc.call('sources.sendUpdates', { target, requestId: request.current!, through: page?.summary.through ?? summary.through }))
    if (currentScope.current !== scope) return
    if (delivery && delivery.state !== 'failed' && delivery.state !== 'prepared') request.current = null
    const result = await perform((rpc) => rpc.call('sources.updates', { target }))
    if (result && currentScope.current === scope) setPage(result)
  })
  const older = () => action(async () => {
    if (!page?.next) return
    const generation = loadGeneration.current
    const result = await perform((rpc) => rpc.call('sources.updates', { target, before: page.next! }))
    if (!result || currentScope.current !== scope || generation !== loadGeneration.current) return
    const displayed = result.comments.length + page.comments.length
    setPage({ ...page, comments: [...result.comments, ...page.comments], next: result.next, summary: result.summary })
    if (result.summary.unread <= displayed) await perform((rpc) => rpc.call('sources.markUpdatesSeen', { target, through: page.summary.through }))
  })
  const sendButton = summary.supported && summary.pending > 0 && <button type="button" className={`button${inspector ? ' primary' : ''}`} disabled={busy || !!summary.sendBlocker || (inspector && (!page || failed))} title={summary.sendBlocker ?? undefined} onClick={() => void send()}>{target.kind === 'task' ? t('SourceUpdates.sendTask') : t('SourceUpdates.continue')}</button>
  return <section className="source-updates" data-inspector={inspector || undefined} aria-label={t('SourceUpdates.title')}>
    {!inspector && <div className="source-updates-toolbar">
      <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>{summary.unread ? t('SourceUpdates.newComments', { count: summary.unread }) : t('SourceUpdates.title')}</button>
      {summary.pending > 0 && <span className="muted">{t('SourceUpdates.pending', { count: summary.pending })}</span>}
      {sendButton}
      {!summary.active && <span className="muted">{t('SourceUpdates.paused')}</span>}
    </div>}
    {visible && <div className="source-updates-content">
      {inspector && source && <div className="source-updates-origin"><span className="muted">{source.name}</span><SourceLink source={source} /></div>}
      <div className="source-updates-toolbar">
        <label><input type="checkbox" checked={summary.watching} disabled={busy || !summary.supported} onChange={(event) => void action(() => perform((rpc) => rpc.call('sources.setWatching', { target, watching: event.target.checked })))} /> {t('SourceUpdates.watch')}</label>
        <button type="button" className="button ghost" disabled={busy || summary.refreshing || !summary.supported} aria-busy={summary.refreshing} onClick={() => void action(() => perform((rpc) => rpc.call('sources.refreshUpdates', { target })))}>{t('SourceUpdates.refresh')}</button>
        {summary.refreshedAt !== null && <span className="muted">{dayAndTime(summary.refreshedAt)}</span>}
      </div>
      {inspector && !summary.active && <p className="muted">{t('SourceUpdates.paused')}</p>}
      {!summary.supported && <p className="muted">{t('SourceUpdates.upgradePlugin')}</p>}
      {summary.problem && <p role="status">{summary.problem}</p>}
      {summary.sendBlocker && summary.pending > 0 && <p className="muted">{summary.sendBlocker}</p>}
      {failed && <p role="status">{t('SourceUpdates.loadFailed')}</p>}
      {!page && !failed && <p className="muted">{t('SourceUpdates.loading')}</p>}
      {page?.next !== null && page?.next !== undefined && <button type="button" className="button ghost" disabled={busy} onClick={() => void older()}>{t('SourceUpdates.older')}</button>}
      {page?.comments.length === 0 && <p className="muted">{t('SourceUpdates.empty')}</p>}
      {page?.comments.map((comment) => <article className="source-update-comment" key={comment.id}>
        <div className="source-updates-toolbar"><strong>{comment.author || t('SourceUpdates.unknownAuthor')}</strong><span className="muted">{dayAndTime(comment.createdAt)}</span><a href={comment.url} target="_blank" rel="noreferrer">{t('SourceUpdates.original')}</a></div>
        {inspector && comment.pending && <span className="source-update-pending">{t('SourceUpdates.pendingComment')}</span>}
        <MarkdownEditor key={comment.updatedAt ?? comment.createdAt} value={comment.markdown} onSave={ignore} label={t('SourceUpdates.comment')} hint="" readOnly />
        {comment.truncated && <p className="muted">{t('SourceUpdates.truncated')}</p>}
      </article>)}
      {page?.deliveries.map((delivery) => <div className="source-update-delivery" key={delivery.id} role="status">
        <span>{t('SourceUpdates.batch', { count: delivery.commentIds.length })} · {t(`SourceUpdates.${delivery.state}`)}</span>
        {delivery.error && <span className="muted">{delivery.error}</span>}
        {(delivery.state === 'failed' || delivery.state === 'prepared') && <button type="button" className="button ghost" disabled={busy} onClick={() => void send(delivery.requestId)}>{t('SourceUpdates.retry')}</button>}
      </div>)}
      <p className="muted">{t('SourceUpdates.textOnly')}</p>
    </div>}
    {inspector && <footer className="source-updates-footer">
      {sendButton}
      <span className="muted" role="status">{summary.pending > 0 ? t('SourceUpdates.pending', { count: summary.pending }) : t('SourceUpdates.noPending')}</span>
    </footer>}
  </section>
}
