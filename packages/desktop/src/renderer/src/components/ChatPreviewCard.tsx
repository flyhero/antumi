import { t, tr } from '../i18n'
import { useContext, useState } from 'react'
import { isPreviewImage, previewLayout, previewRequest, type ChatItem } from '@antumi/protocol'
import { openFileInBrowser } from '../browser-state'
import { useBrowserSupported } from '../core-store'
import { canRevealFile, revealFile } from '../desktop-bridge'
import { previewUrl } from '../file-links'
import { LocalImageViewer } from './ChatMarkdown'
import { ChatPaths } from './ChatToolCard'
import { RefreshIcon } from './icons'
import { ChatToolIcon } from './ChatToolIcon'
import { ChatPreviewSet } from './ChatPreviewSet'
import { toolRunStatus } from '../chat-tools'

type ToolItem = Extract<ChatItem, { kind: 'tool' }>

// A picture the agent asked to show: fitted to the card, opened full size on a click.
function PreviewImage({ path, src, label }: { path: string; src: string; label: string }) {
  const [viewing, setViewing] = useState(false)
  const [missing, setMissing] = useState(false)
  if (missing) return <p className="chat-preview-note muted">{tr('ChatBrowserCard.imageIsNoLongerAvailable', { path: path })}</p>
  return (
    <>
      <button type="button" className="chat-preview-image" aria-label={t('ChatPreviewCard.viewImage', { label: label })} onClick={() => setViewing(true)}>
        <img src={src} alt="" draggable={false} onError={() => setMissing(true)} />
      </button>
      {viewing && <LocalImageViewer images={[{ path, src }]} index={0} onIndex={() => {}} onClose={() => setViewing(false)} />}
    </>
  )
}

// Files shown one call at a time, back to back, as one set.
export function ChatPreviewRun({ conversationId, tools }: { conversationId: string; tools: readonly ToolItem[] }) {
  // Each call's own title names its file within the set.
  const files = tools.flatMap((tool) => {
    const request = previewRequest(tool.input, tool.title)
    return request.files.map((file) => ({ path: file.path, title: request.title ?? file.title, status: tool.status, output: tool.output }))
  })
  const [first] = tools
  // A set that grows while the turn runs is laid out anew, the view the user picked with it.
  const placed = previewLayout(files.map((file) => file.path), null)
  return first ? <ChatPreviewSet key={placed} conversationId={conversationId} name={first.name} status={toolRunStatus(tools).status} title={null} files={files} layout={null} /> : null
}

// What a call asked to show: a set of files in a card of its own, or one file.
export function ChatPreviewCard({ conversationId, item }: { conversationId: string; item: ToolItem }) {
  const request = previewRequest(item.input, item.title)
  const [only] = request.files
  if (request.files.length > 1 || !only) {
    const files = request.files.map((file) => ({ ...file, status: item.status, output: item.output }))
    return <ChatPreviewSet conversationId={conversationId} name={item.name} status={item.status} title={request.title} files={files} layout={request.layout} />
  }
  return <SinglePreview conversationId={conversationId} item={item} path={only.path} title={request.title ?? only.title} />
}

// A file the agent asked to show, rendered where it asked. A page or an SVG is a frame that is a
// page of its own, with no way to the app around it or to the network (main's antumi-preview
// protocol sets the policy), following the app's light or dark scheme; a picture is an image. It
// reads the file as it stands now, so a later edit shows on refresh.
function SinglePreview({ conversationId, item, path, title }: { conversationId: string; item: ToolItem; path: string; title: string | null }) {
  const browsable = useBrowserSupported() && !isPreviewImage(path)
  const shorten = useContext(ChatPaths)
  const [generation, setGeneration] = useState(0)
  // A page's script may focus a field as it loads, which pulls the chat to the card every time the
  // conversation opens. The frame takes no focus until the pointer first comes over the card.
  const [awake, setAwake] = useState(false)
  const refused = item.status === 'failed' || item.status === 'denied'
  // The call arrives before it runs, and the file it names may still be on its way (written by a
  // call beside it); the tool checks it is there, so the page loads once the call is done.
  const pending = item.status === 'running'
  const src = `antumi-preview://file${path}?v=${generation}`
  return (
    <div className="chat-preview" data-status={item.status} onPointerEnter={() => setAwake(true)}>
      <div className="chat-preview-head">
        <ChatToolIcon name={item.name} status={item.status} />
        <span className="chat-preview-title">{title ?? shorten(path)}</span>
        {title && <span className="chat-preview-path" title={path}>{shorten(path)}</span>}
        <span className="chat-preview-actions">
          <button type="button" className="tool-button" aria-label={t('ChatPreviewCard.reload')} data-tooltip={t('ChatPreviewCard.reload')} data-tooltip-side="top-end" onClick={() => setGeneration((n) => n + 1)}><RefreshIcon /></button>
          {browsable && !refused && (
            <button type="button" className="link-button" data-tooltip={t('ChatPreviewCard.openAtFullSizeInTheBuiltIn')} data-tooltip-side="top-end" onClick={() => void openFileInBrowser(path, conversationId)}>{t('ChatPreviewCard.openInBrowser')}</button>
          )}
          {canRevealFile() && (
            <button type="button" className="link-button" onClick={() => void revealFile([path])}>{t('ChatPreviewCard.showFile')}</button>
          )}
        </span>
      </div>
      {refused
        ? <p className="chat-preview-note muted">{item.output ?? t('ChatPreviewCard.couldNotDisplayThisFile')}</p>
        : pending
          ? <p className="chat-preview-note muted">{t('ChatPreviewCard.preparingPreview')}</p>
          : isPreviewImage(path)
            ? <PreviewImage key={generation} path={path} src={`${previewUrl(path)}?v=${generation}`} label={title ?? path} />
            : <iframe key={generation} className="chat-preview-frame" title={title ?? path} src={src} sandbox="allow-scripts" referrerPolicy="no-referrer" inert={!awake} />}
    </div>
  )
}
