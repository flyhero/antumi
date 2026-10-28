import { t } from '../i18n'
import { useCallback, useState, type ReactNode } from 'react'
import type { ResolvedFile } from '@antumi/protocol'
import { canOpenFile, canRevealFile } from '../desktop-bridge'
import { copyFileText, FILE_MANAGER, openResolvedFile, revealResolvedFile, showResolvedFile } from '../file-actions'
import type { FileScope } from '../file-tabs'
import { ContextMenu, MenuItem, menuPoint, type MenuPoint } from './ContextMenu'
import { CopyIcon, ExternalIcon, FolderIcon, InspectorIcon } from './icons'

// `inPanel`: the menu is in the side panel's files already, where a click opens the file and
// offering to open it there again does nothing.
export function FileMenuItems({ scope, file, line = null, inPanel = false, onClose }: {
  scope: FileScope; file: ResolvedFile; line?: number | null; inPanel?: boolean; onClose(): void
}) {
  const act = (action: () => void | Promise<void>) => { onClose(); void action() }
  return <>
    {!inPanel && <MenuItem label={t('FileMenu.openInSidebar')} icon={<InspectorIcon />} onSelect={() => act(() => showResolvedFile(scope, file, line))} />}
    <MenuItem label={t('FileMenu.copyAbsolutePath')} icon={<CopyIcon />} onSelect={() => act(() => copyFileText(file.path))} />
    {file.relative !== null && <MenuItem label={t('FileMenu.copyProjectRelativePath')} icon={<CopyIcon />} onSelect={() => act(() => copyFileText(file.relative ?? file.path))} />}
    {canRevealFile() && <MenuItem label={t('FileMenu.showIn', { FILE_MANAGER: FILE_MANAGER() })} icon={<FolderIcon />} onSelect={() => act(() => revealResolvedFile(file))} />}
    {canOpenFile() && <MenuItem label={t('FileMenu.openWithSystemDefaultApp')} icon={<ExternalIcon />} onSelect={() => act(() => openResolvedFile(file))} />}
  </>
}

export function FileMenu({ scope, file, inPanel = false, children }: { scope: FileScope; file: ResolvedFile; inPanel?: boolean; children: ReactNode }) {
  const [at, setAt] = useState<MenuPoint | null>(null)
  const close = useCallback(() => setAt(null), [])
  return <span className="file-menu-target" onKeyDown={(event) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
    event.preventDefault()
    event.stopPropagation()
    const box = event.currentTarget.getBoundingClientRect()
    setAt({ x: box.left + 12, y: box.bottom })
  }} onContextMenu={(event) => {
    event.preventDefault()
    event.stopPropagation()
    setAt(menuPoint(event))
  }}>
    {children}
    {at && <ContextMenu at={at} label={t('FileEditor.fileActions')} onClose={close}><FileMenuItems scope={scope} file={file} inPanel={inPanel} onClose={close} /></ContextMenu>}
  </span>
}
