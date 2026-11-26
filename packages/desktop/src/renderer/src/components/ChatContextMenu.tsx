import { t, tr } from '../i18n'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from 'react'
import { canHaveHelper, LANGUAGE_NAMES, type Conversation, type ResolvedFile } from '@antumi/protocol'
import { handToHelper } from '../helper-conversations'
import { useCore, useTranslateSupported } from '../core-store'
import { usePreferences } from '../preferences'
import { translate, translationKey, useTranslations } from '../translation'
import { canRevealFile } from '../desktop-bridge'
import { copyFileText, filePreviewSupported, showChatFile, type ChatFileScope } from '../file-actions'
import { linkTarget, type FileReference } from '../file-links'
import { copyRegionText } from './ChatCopyRegion'
import { ContextMenu, MenuItem, menuPoint, type MenuPoint } from './ContextMenu'
import { FileMenuItems } from './FileMenu'
import { CodeIcon, CopyIcon, DocumentIcon, FolderIcon, LinkIcon, RefreshIcon, SparkIcon, TranslateIcon } from './icons'
import { Spinner } from './Spinner'

export const ChatFilesContext = createContext<ChatFileScope | null>(null)
export function useChatFiles(): ChatFileScope | null { return useContext(ChatFilesContext) }

// `translating`: the selection, once the user asked for it in their language; the menu then shows that.
type Menu = { at: MenuPoint; selection: string; text: string; code: string | null; href: string | null; reference: FileReference | null; file: ResolvedFile | null; resolving: boolean; error: string | null; translating?: string }

export function selectedChatText(root: HTMLElement): string {
  const selection = document.getSelection()
  if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return ''
  return selection.toString()
}

export function useChatContextMenu(list: RefObject<HTMLDivElement | null>, scope: ChatFileScope) {
  const parent = useCore((state) => state.conversations[scope.conversationId])
  const [menu, setMenu] = useState<Menu | null>(null)
  const translateSupported = useTranslateSupported()
  const sequence = useRef(0)
  const close = useCallback(() => { sequence.current++; setMenu(null) }, [])
  useEffect(() => { close(); return () => { sequence.current++ } }, [scope.conversationId, close])
  const openMenu = (target: Element, at: MenuPoint) => {
    if (!list.current) return
    const path = target.closest<HTMLElement>('[data-file-path]')?.dataset.filePath
    const reference = path ? { path, line: Number(target.closest<HTMLElement>('[data-file-line]')?.dataset.fileLine) || null } : null
    const href = target.closest<HTMLAnchorElement>('a[href]')?.getAttribute('href') ?? null
    const code = target.closest('.chat-code pre')
    const state: Menu = {
      at, selection: selectedChatText(list.current), text: copyRegionText(target, list.current) ?? '',
      code: code?.textContent?.replace(/\n$/, '') ?? null,
      href: href && ['web', 'app'].includes(linkTarget(href)?.kind ?? '') ? href : null,
      reference, file: null, resolving: reference !== null && filePreviewSupported(), error: null
    }
    const current = ++sequence.current
    setMenu(state)
    const rpc = useCore.getState().rpc
    if (reference && state.resolving && rpc) void rpc.call('files.resolve', { conversationId: scope.conversationId, path: reference.path }).then((file) => {
      if (sequence.current === current) setMenu({ ...state, file, resolving: false, error: file ? null : t('ChatContextMenu.fileNotFound') })
    }, () => { if (sequence.current === current) setMenu({ ...state, resolving: false, error: t('ChatContextMenu.cannotAccessFile') }) })
  }
  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return
    event.preventDefault()
    openMenu(event.target, menuPoint(event, event.target.closest<HTMLElement>('button, .chat-entry') ?? event.currentTarget))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) || !(event.target instanceof Element)) return
    event.preventDefault()
    const box = (event.target.closest<HTMLElement>('button, .chat-entry') ?? event.currentTarget).getBoundingClientRect()
    openMenu(event.target, { x: box.left + 12, y: box.bottom })
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const mac = window.antumi?.platform === 'darwin' || navigator.userAgent.includes('Mac')
    if (event.button === 2 || (mac && event.ctrlKey)) event.preventDefault()
  }
  const copy = (text: string) => { close(); void copyFileText(text) }
  const content = menu && (menu.translating !== undefined
    ? <ContextMenu at={menu.at} scrollBoundary={list.current} label={t('ChatContextMenu.translationOfSelection')} onClose={close}>
      <SelectionTranslation conversationId={scope.conversationId} text={menu.translating} onClose={close} />
    </ContextMenu>
    : <ContextMenu at={menu.at} scrollBoundary={list.current} label={t('ChatContextMenu.chatContent')} onClose={close}>
    <HandToHelperItem parent={parent} selection={menu.selection} inspector={scope.inspector} onClose={close} />
    {menu.selection.trim() && translateSupported && <MenuItem label={t('ChatContextMenu.translate')} icon={<TranslateIcon />} onSelect={() => setMenu({ ...menu, translating: menu.selection.trim() })} />}
    {menu.selection && <MenuItem label={t('ChatContextMenu.copySelection')} icon={<CopyIcon />} onSelect={() => copy(menu.selection)} />}
    {menu.text && <MenuItem label={t('ChatContextMenu.copyContent')} icon={<DocumentIcon />} onSelect={() => copy(menu.text)} />}
    {menu.code !== null && <MenuItem label={t('ChatContextMenu.copyCode')} icon={<CodeIcon />} onSelect={() => copy(menu.code ?? '')} />}
    {menu.href && <MenuItem label={t('ChatContextMenu.copyLink')} icon={<LinkIcon />} onSelect={() => copy(menu.href ?? '')} />}
    {menu.file && <FileMenuItems scope={scope} file={menu.file} line={menu.reference?.line} onClose={close} />}
    {menu.reference && !filePreviewSupported() && canRevealFile() && <MenuItem label={t('ChatContextMenu.showInFileManager')} icon={<FolderIcon />} onSelect={() => { close(); if (menu.reference) void showChatFile(scope, menu.reference) }} />}
    {menu.resolving && <div className="menu-label" role="status">{t('ChatContextMenu.findingFile')}</div>}
    {menu.error && <div className="menu-label" role="status">{menu.error}</div>}
    {!menu.selection && !menu.text && menu.code === null && !menu.reference && !menu.href && <MenuItem label={t('ChatContextMenu.nothingToCopy')} disabled onSelect={close} />}
  </ContextMenu>)
  return { onContextMenu, onKeyDown, onPointerDown, menu: content, open: menu !== null }
}

// A passage the user selected, put into their language by the conversation's agent's small model,
// where the menu was: kept by its text, so the same words are not asked for twice.
export function SelectionTranslation({ conversationId, text, onClose }: { conversationId: string; text: string; onClose: () => void }) {
  const to = usePreferences((preferences) => preferences.translateTo)
  const agent = useCore((state) => state.conversations[conversationId]?.agent)
  const model = usePreferences((preferences) => (agent ? preferences.quickModels[agent] : undefined)) ?? ''
  const key = translationKey(conversationId, `selection:${text}`, to, model)
  const result = useTranslations((state) => state.results[key])
  useEffect(() => { void translate(conversationId, key, text, to, model) }, [conversationId, key, text, to, model])
  return <>
    <div className="menu-label">{tr('ChatContextMenu.translateTo', { value1: LANGUAGE_NAMES[to], value2: result?.state === 'done' && result.model ? t('ChatContextMenu.translatedBy', { value1: result.model }) : '' })}</div>
    <div className="selection-translation" role="status" data-failed={result?.state === 'failed' || undefined}>
      {result?.state === 'done' ? result.text : result?.state === 'failed' ? result.error : <>{tr('ChatContextMenu.translating', { value1: <Spinner /> })}</>}
    </div>
    {result?.state === 'done' && <MenuItem label={t('ChatContextMenu.copyTranslation')} icon={<CopyIcon />} onSelect={() => { onClose(); void copyFileText(result.text) }} />}
    {result?.state === 'failed' && <MenuItem label={t('ChatContextMenu.retry')} icon={<RefreshIcon />} onSelect={() => void translate(conversationId, key, text, to, model)} />}
  </>
}

export function HandToHelperItem({ parent, selection, inspector, onClose }: {
  parent: Conversation | undefined
  selection: string
  inspector: 'task' | 'conversation'
  onClose: () => void
}) {
  const supported = useCore((state) => state.rpc?.features.includes('conversation-helper') ?? false)
  if (!selection.trim() || !supported || !parent || !canHaveHelper(parent)) return null
  return <MenuItem label={t('ChatContextMenu.askHelper')} icon={<SparkIcon />} onSelect={() => { document.getSelection()?.removeAllRanges(); onClose(); void handToHelper(parent, selection, inspector) }} />
}
