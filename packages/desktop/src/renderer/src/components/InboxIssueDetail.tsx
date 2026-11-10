import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { RpcError, type SourceComment, type SourceIssue, type SourceIssuePreview } from '@antumi/protocol'
import { useCore } from '../core-store'
import { useOccludesBrowser } from '../browser-occlusion'
import { t } from '../i18n'
import { dayAndTime, reasonText } from '../labels'
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon, ExternalIcon, RefreshIcon, SourceIcon } from './icons'
import { ImageStrip } from './ImageStrip'
import { ImageViewer } from './ImageViewer'
import { MarkdownEditor } from './MarkdownEditor'
import { Spinner } from './Spinner'

const failureText = (error: unknown) => error instanceof RpcError && error.reason
  ? reasonText(error.reason, error.message)
  : error instanceof Error ? error.message : String(error)

function IssueComments({ provider, instance, issueKey }: { provider: string; instance: string; issueKey: string }) {
  const rpc = useCore((state) => state.rpc)
  const [comments, setComments] = useState<SourceComment[]>([])
  const [continuation, setContinuation] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const generation = useRef(0)
  const pending = useRef(false)
  const load = async (next: string | null) => {
    if (pending.current) return
    pending.current = true
    const current = generation.current
    setBusy(true)
    setFailure(null)
    try {
      if (!rpc) throw new Error(t('coreStore.notConnectedToAntumiCore'))
      const page = await rpc.call('sources.issueComments', { provider, instance, key: issueKey, options: { checkpoint: { createdAt: 0, ids: [] }, continuation: next } })
      if (current !== generation.current) return
      setComments((previous) => [...new Map([...previous, ...page.comments].map((comment) => [comment.id, comment])).values()])
      setContinuation(page.continuation)
      setLoaded(true)
    } catch (error) {
      if (current === generation.current) setFailure(failureText(error))
    } finally {
      if (current === generation.current) { pending.current = false; setBusy(false) }
    }
  }
  useEffect(() => {
    pending.current = false
    setComments([])
    setContinuation(null)
    setLoaded(false)
    void load(null)
    return () => { generation.current += 1 }
  }, [rpc, provider, instance, issueKey])
  return <div className="inbox-issue-comments">
    {comments.map((comment) => <article className="inbox-issue-comment" key={comment.id}>
      <div className="inbox-issue-comment-meta"><strong>{comment.author || t('SourceUpdates.unknownAuthor')}</strong><time>{dayAndTime(comment.createdAt)}</time><a href={comment.url} target="_blank" rel="noreferrer">{t('SourceUpdates.original')}</a></div>
      <MarkdownEditor key={comment.updatedAt ?? comment.createdAt} value={comment.markdown} label={t('SourceUpdates.comment')} hint="" readOnly />
      {comment.truncated && <p className="muted">{t('SourceUpdates.truncated')}</p>}
    </article>)}
    {loaded && comments.length === 0 && <p className="muted">{t('SourceUpdates.empty')}</p>}
    {busy && <p className="inbox-issue-loading" role="status"><Spinner />{t('SourceUpdates.loading')}</p>}
    {failure && <p role="alert" className="inbox-issue-error">{failure}</p>}
    {(failure || continuation) && <button type="button" className="button" disabled={busy} onClick={() => void load(continuation)}>{failure ? t('InboxIssueDetail.retry') : t('InboxIssueDetail.moreComments')}</button>}
  </div>
}

export function InboxIssueDetail({ provider, instance, name, issue, modal, panelId, onClose, onPrevious, onNext, children }: {
  provider: string
  instance: string
  name: string
  issue: SourceIssue
  modal: boolean
  panelId: string
  onClose: () => void
  onPrevious?: () => void
  onNext?: () => void
  children: ReactNode
}) {
  const rpc = useCore((state) => state.rpc)
  const [preview, setPreview] = useState<SourceIssuePreview | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [imageAttempt, setImageAttempt] = useState(0)
  const [imageFailure, setImageFailure] = useState<string | null>(null)
  const [imagesLoading, setImagesLoading] = useState(false)
  const [tab, setTab] = useState<'description' | 'comments'>('description')
  const [viewing, setViewing] = useState<number | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const ids = useId()
  useOccludesBrowser(modal)
  const close = () => { dialog.current?.close(); onClose() }

  useEffect(() => {
    const element = dialog.current
    if (!modal || !element) return
    element.showModal()
    return () => element.close()
  }, [modal])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      // An image viewer or another modal owns Escape until it closes.
      if (event.key === 'Escape' && !modal && !document.querySelector('dialog[open]')) {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [modal, onClose])
  useEffect(() => { body.current?.scrollTo(0, 0) }, [tab])

  useEffect(() => {
    let current = true
    setPreview(null)
    setFailure(null)
    setImageFailure(null)
    setImagesLoading(false)
    setViewing(null)
    const load = async () => {
      try {
        if (!rpc) throw new Error(t('coreStore.notConnectedToAntumiCore'))
        const result = await rpc.call('sources.issue', { provider, instance, key: issue.key })
        if (current) setPreview(result)
      } catch (error) {
        if (current) setFailure(failureText(error))
      }
    }
    void load()
    return () => { current = false }
  }, [rpc, provider, instance, issue.key, attempt])

  useEffect(() => {
    if (!preview?.imagesDeferred || !rpc) return
    let current = true
    setImagesLoading(true)
    setImageFailure(null)
    void rpc.call('sources.issue', { provider, instance, key: issue.key, images: true }).then((result) => {
      if (current) { setPreview(result); setImagesLoading(false) }
    }).catch((error) => {
      if (current) { setImageFailure(failureText(error)); setImagesLoading(false) }
    })
    return () => { current = false }
  }, [rpc, provider, instance, issue.key, preview?.imagesDeferred, imageAttempt])

  const shown = preview?.issue ?? issue
  const snapshot = preview?.snapshot
  const titleId = `${ids}-title`
  const content = <>
    <header className="inbox-issue-toolbar">
      <span className="inbox-issue-origin"><SourceIcon provider={provider} />{name}<span>/</span>{shown.key}</span>
      <div className="inbox-issue-tools">
        <a className="inbox-issue-original" href={shown.url} target="_blank" rel="noreferrer">{t('InboxIssueDetail.original')}<ExternalIcon /></a>
        <button type="button" className="tool-button" aria-label={t('InboxIssueDetail.previous')} disabled={!onPrevious} onClick={onPrevious}><ArrowLeftIcon /></button>
        <button type="button" className="tool-button" aria-label={t('InboxIssueDetail.next')} disabled={!onNext} onClick={onNext}><ArrowRightIcon /></button>
        <button type="button" className="tool-button" aria-label={t('InboxIssueDetail.close')} onClick={close}><CloseIcon /></button>
      </div>
    </header>
    <div className="inbox-issue-intro">
      <h2 id={titleId}>{shown.title}</h2>
      <div className="inbox-issue-facts"><span className="inbox-status" data-category={shown.statusCategory}>{shown.status}</span>{shown.type && <span>{shown.type}</span>}{shown.priority && <span>{t('InboxIssueDetail.priority', { priority: shown.priority })}</span>}{shown.updatedAt !== null && <time>{t('SourceInboxView.updated', { value1: dayAndTime(shown.updatedAt) })}</time>}</div>
    </div>
    <div className="inbox-issue-tabs" role="tablist" aria-label={t('InboxIssueDetail.content')}>
      <button type="button" role="tab" id={`${ids}-description`} aria-selected={tab === 'description'} aria-controls={`${ids}-body`} onClick={() => setTab('description')}>{t('InboxIssueDetail.description')}</button>
      {preview?.commentsSupported && <button type="button" role="tab" id={`${ids}-comments`} aria-selected={tab === 'comments'} aria-controls={`${ids}-body`} onClick={() => setTab('comments')}>{t('InboxIssueDetail.comments')}</button>}
      <button type="button" className="tool-button inbox-issue-refresh" aria-label={t('InboxIssueDetail.refresh')} disabled={!preview && !failure} onClick={() => { setTab('description'); setAttempt(attempt + 1) }}><RefreshIcon /></button>
    </div>
    <div ref={body} id={`${ids}-body`} className="inbox-issue-body" role="tabpanel" aria-labelledby={`${ids}-${tab}`}>
      {failure && <div className="inbox-issue-error" role="alert"><p>{failure}</p><button type="button" className="button" onClick={() => setAttempt(attempt + 1)}>{t('InboxIssueDetail.retry')}</button></div>}
      {!preview && !failure && <p className="inbox-issue-loading" role="status"><Spinner />{t('InboxIssueDetail.loading')}</p>}
      {snapshot && tab === 'description' && <>
        <MarkdownEditor key={`${snapshot.fetchedAt}:${snapshot.imagesFetchedAt}`} value={snapshot.markdown || t('SourceSnapshotCard.originalContentIsEmpty')} label={t('InboxIssueDetail.description')} hint="" readOnly />
        {snapshot.images.length > 0 && <section className="inbox-issue-images" aria-label={t('InboxIssueDetail.images')}><h3>{t('InboxIssueDetail.images')} <span>{snapshot.images.length}</span></h3><ImageStrip images={snapshot.images} onOpen={setViewing} /></section>}
        {imagesLoading && <p className="inbox-issue-loading" role="status"><Spinner />{t('InboxIssueDetail.loadingImages')}</p>}
        {imageFailure && <div className="inbox-issue-error" role="alert"><p>{t('InboxIssueDetail.imagesFailed', { reason: imageFailure })}</p><button type="button" className="button" onClick={() => setImageAttempt(imageAttempt + 1)}>{t('InboxIssueDetail.retry')}</button></div>}
      </>}
      {preview?.commentsSupported && tab === 'comments' && <IssueComments provider={provider} instance={instance} issueKey={shown.key} />}
    </div>
    <footer className="inbox-issue-footer">{children}</footer>
    {viewing !== null && snapshot && snapshot.images.length > 0 && <ImageViewer images={snapshot.images} index={Math.min(viewing, snapshot.images.length - 1)} onIndex={setViewing} onClose={() => setViewing(null)} />}
  </>
  return modal
    ? <dialog ref={dialog} id={panelId} className="modal inbox-issue-detail inbox-issue-modal" aria-labelledby={titleId}
      onCancel={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); close() } }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const box = event.currentTarget.getBoundingClientRect()
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close()
      }}
    >{content}</dialog>
    : <aside id={panelId} className="inbox-issue-detail" aria-labelledby={titleId}>{content}</aside>
}
