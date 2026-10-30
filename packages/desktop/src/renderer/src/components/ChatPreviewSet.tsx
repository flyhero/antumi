import { t, tr } from '../i18n'
import { useContext, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { isPreviewPage, previewLayout, type ChatToolStatus, type PreviewFile, type PreviewLayout } from '@antumi/protocol'
import { openFileInBrowser } from '../browser-state'
import { useBrowserSupported } from '../core-store'
import { canRevealFile, revealFile } from '../desktop-bridge'
import { previewUrl } from '../file-links'
import { LocalImageViewer } from './ChatMarkdown'
import { ChatPaths } from './ChatToolCard'
import { ChatToolIcon } from './ChatToolIcon'
import { RefreshIcon } from './icons'

// A file of a set and how the call that showed it went: a set gathered from calls made back to back
// has one call per file.
export type PreviewSetFile = PreviewFile & { status: ChatToolStatus; output: string | null }

// Past two rows of thumbnails the rest wait behind the last one, in the viewer.
const GRID_SHOWN = 8

function fileName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path
}

function labelOf(file: PreviewSetFile): string {
  return file.title ?? fileName(file.path)
}

function countLabel(files: readonly PreviewSetFile[]): string {
  const count = files.length
  if (files.every((file) => isPreviewPage(file.path))) return t('ChatPreviewSet.pages', { count })
  if (files.some((file) => isPreviewPage(file.path))) return t('ChatPreviewSet.files', { count })
  return t('ChatPreviewSet.images', { count })
}

// A file's place in the card: still on its way, refused, a running page, or a picture that opens
// the viewer.
function FileBody({ file, src, awake, onView }: { file: PreviewSetFile; src: string; awake: boolean; onView: () => void }) {
  const [missing, setMissing] = useState(false)
  if (file.status === 'running') return <p className="chat-preview-note muted">{t('ChatPreviewCard.preparingPreview')}</p>
  if (file.status === 'failed' || file.status === 'denied') return <p className="chat-preview-note muted">{file.output ?? t('ChatPreviewCard.couldNotDisplayThisFile')}</p>
  if (isPreviewPage(file.path)) return <iframe className="chat-preview-frame" title={labelOf(file)} src={src} sandbox="allow-scripts" referrerPolicy="no-referrer" inert={!awake} />
  if (missing) return <p className="chat-preview-note muted">{tr('ChatBrowserCard.imageIsNoLongerAvailable', { path: file.path })}</p>
  return (
    <button type="button" className="chat-preview-shot" aria-label={t('ChatPreviewCard.viewImage', { label: labelOf(file) })} onClick={onView}>
      <img src={src} alt="" draggable={false} onError={() => setMissing(true)} />
    </button>
  )
}

// Two pictures over each other, the second shown right of a handle the pointer drags.
function Wipe({ files, srcs }: { files: readonly PreviewSetFile[]; srcs: readonly string[] }) {
  const [cut, setCut] = useState(50)
  const area = useRef<HTMLDivElement>(null)
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const box = area.current?.getBoundingClientRect()
    if (box && box.width > 0) setCut(Math.min(100, Math.max(0, (event.clientX - box.left) / box.width * 100)))
  }
  const [before, after] = files
  return (
    <div
      ref={area}
      className="chat-preview-wipe"
      role="slider"
      tabIndex={0}
      aria-label={t('ChatPreviewSet.wipe')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(cut)}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); move(event) }}
      onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event) }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') setCut((value) => Math.max(0, value - 5))
        if (event.key === 'ArrowRight') setCut((value) => Math.min(100, value + 5))
      }}
    >
      <img src={srcs[0]} alt="" draggable={false} />
      <img className="chat-preview-wipe-over" src={srcs[1]} alt="" draggable={false} style={{ clipPath: `inset(0 0 0 ${cut}%)` }} />
      {before && <span className="chat-preview-wipe-tag" data-side="start">{labelOf(before)}</span>}
      {after && <span className="chat-preview-wipe-tag" data-side="end">{labelOf(after)}</span>}
      <span className="chat-preview-wipe-handle" style={{ left: `${cut}%` }} />
    </div>
  )
}

function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <span className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>
      ))}
    </span>
  )
}

// Files the agent showed together (or one after another), in one card: side by side to compare,
// one at a time in tabs, or as thumbnails. A page runs only in tabs, the chosen one alone; pictures
// open in the viewer, which pages through all of them.
export function ChatPreviewSet({ conversationId, name, status, title, files, layout }: {
  conversationId: string
  name: string
  status: ChatToolStatus
  title: string | null
  files: readonly PreviewSetFile[]
  layout: PreviewLayout | null
}) {
  const shorten = useContext(ChatPaths)
  const browserSupported = useBrowserSupported()
  const placed = previewLayout(files.map((file) => file.path), layout)
  const pictures = files.every((file) => !isPreviewPage(file.path))
  const [view, setView] = useState<PreviewLayout | 'wipe'>(placed)
  const [index, setIndex] = useState(0)
  const [generation, setGeneration] = useState(0)
  const [awake, setAwake] = useState(false)
  const [viewing, setViewing] = useState<number | null>(null)
  const tabs = useRef<HTMLDivElement>(null)
  const src = (path: string) => `${previewUrl(path)}?v=${generation}`
  const images = files.filter((file) => !isPreviewPage(file.path) && file.status === 'done').map((file) => ({ path: file.path, src: src(file.path) }))
  const viewFile = (file: PreviewSetFile) => setViewing(Math.max(0, images.findIndex((image) => image.path === file.path)))
  const current = files[Math.min(index, files.length - 1)]
  const choose = (next: number) => {
    const wrapped = (next + files.length) % files.length
    setIndex(wrapped)
    tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[wrapped]?.focus()
  }
  const onTabsKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') choose(index - 1)
    else if (event.key === 'ArrowRight') choose(index + 1)
    else if (/^[1-9]$/.test(event.key) && Number(event.key) <= files.length) choose(Number(event.key) - 1)
    else return
    event.preventDefault()
  }
  const switches = placed === 'compare' && files.length === 2 && pictures
    ? <Segmented label={t('ChatPreviewSet.layout')} value={view === 'wipe' ? 'wipe' : 'compare'} onChange={setView} options={[{ value: 'compare', label: t('ChatPreviewSet.sideBySide') }, { value: 'wipe', label: t('ChatPreviewSet.wipe') }]} />
    : placed !== 'compare' && pictures && files.length <= GRID_SHOWN
      ? <Segmented label={t('ChatPreviewSet.layout')} value={view === 'grid' ? 'grid' : 'tabs'} onChange={setView} options={[{ value: 'tabs', label: t('ChatPreviewSet.oneAtATime') }, { value: 'grid', label: t('ChatPreviewSet.tiled') }]} />
      : null
  const page = view === 'tabs' && current && isPreviewPage(current.path) ? current : null
  let body: ReactNode
  if (view === 'wipe') {
    body = <Wipe files={files} srcs={files.map((file) => src(file.path))} />
  } else if (view === 'compare') {
    body = (
      <div className="chat-preview-compare" data-count={files.length}>
        {files.map((file) => (
          <figure key={file.path}>
            <FileBody file={file} src={src(file.path)} awake={awake} onView={() => viewFile(file)} />
            <figcaption>{labelOf(file)}</figcaption>
          </figure>
        ))}
      </div>
    )
  } else if (view === 'grid') {
    const hidden = files.length - GRID_SHOWN
    body = (
      <div className="chat-preview-grid">
        {files.slice(0, GRID_SHOWN).map((file, at) => {
          const more = hidden > 0 && at === GRID_SHOWN - 1
          return (
            <figure key={file.path} data-more={more ? `+${hidden + 1}` : undefined}>
              <FileBody file={file} src={src(file.path)} awake={awake} onView={() => viewFile(file)} />
              <figcaption>{more ? t('ChatPreviewSet.more') : labelOf(file)}</figcaption>
            </figure>
          )
        })}
      </div>
    )
  } else {
    body = current && (
      <>
        <div className="chat-preview-tabs" role="tablist" aria-label={title ?? countLabel(files)} ref={tabs} onKeyDown={onTabsKey}>
          {files.map((file, at) => (
            <button key={file.path} type="button" role="tab" aria-selected={at === index} tabIndex={at === index ? 0 : -1} onClick={() => setIndex(at)}>
              {labelOf(file)}{files.length <= 9 && <span className="chat-preview-tab-key">{at + 1}</span>}
            </button>
          ))}
        </div>
        <div className="chat-preview-current" role="tabpanel" data-page={isPreviewPage(current.path) || undefined}>
          <FileBody key={current.path} file={current} src={src(current.path)} awake={awake} onView={() => viewFile(current)} />
        </div>
        <div className="chat-preview-foot">
          <span>{t('ChatPreviewSet.position', { label: labelOf(current), index: index + 1, count: files.length })}</span>
          <span className="chat-preview-path" title={current.path}>{shorten(current.path)}</span>
        </div>
      </>
    )
  }
  return (
    <div className="chat-preview chat-preview-set" data-status={status} data-view={view} onPointerEnter={() => setAwake(true)}>
      <div className="chat-preview-head">
        <ChatToolIcon name={name} status={status} />
        <span className="chat-preview-title">{title ?? countLabel(files)}</span>
        {title && <span className="chat-preview-count">{countLabel(files)}</span>}
        <span className="chat-preview-actions">
          {switches}
          <button type="button" className="tool-button" aria-label={t('ChatPreviewCard.reload')} data-tooltip={t('ChatPreviewCard.reload')} data-tooltip-side="top-end" onClick={() => setGeneration((n) => n + 1)}><RefreshIcon /></button>
          {page && browserSupported && (
            <button type="button" className="link-button" data-tooltip={t('ChatPreviewCard.openAtFullSizeInTheBuiltIn')} data-tooltip-side="top-end" onClick={() => void openFileInBrowser(page.path, conversationId)}>{t('ChatPreviewCard.openInBrowser')}</button>
          )}
          {canRevealFile() && (
            <button type="button" className="link-button" onClick={() => void revealFile(view === 'tabs' && current ? [current.path] : files.map((file) => file.path))}>{t('ChatPreviewCard.showFile')}</button>
          )}
        </span>
      </div>
      <div className="chat-preview-body" key={generation}>{body}</div>
      {viewing !== null && <LocalImageViewer images={images} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
