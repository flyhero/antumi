import { t } from '../i18n'
import { useEffect, useMemo, useState } from 'react'
import { perform, setFileQuickOpen, setFilesMaximized, showFilesPanel, toggleFilesPanel, useCore, useFilesContextScope, useFilesScope } from '../core-store'
import { fileScopeKey, type FileScope } from '../file-tabs'
import { PRIMARY_KEY_LABEL } from '../shortcut-keys'
import { usePanelShortcut } from '../panel-shortcuts'
import { useProjectHeads } from './BranchStatus'
import { ChatPicker, type PickerOption } from './ChatPicker'
import { FileEditor } from './FileEditor'
import { projectName, projectNames } from './ProjectPicker'
import { CloseIcon, FolderIcon, MaximizeIcon, RestoreIcon, SearchIcon } from './icons'
import './files-panel.css'

const FOLLOW = 'follow'

// The branch the shown conversation's first folder is on, so the header says which checkout this is.
function useScopeBranch(scope: FileScope | null, updatedAt: number): string | null {
  const heads = useProjectHeads({ kind: 'conversation', id: scope?.conversationId ?? '' }, updatedAt, 0)
  const head = scope?.conversationId ? heads.find((each) => each.path === scope.roots[0]) : undefined
  return head?.branch?.replace(/^refs\/(?:heads|remotes)\//, '') ?? null
}

// The files of what the user looks at, or of a project they pick here: the dock's 文件.
export function FilesPanel() {
  const shortcut = usePanelShortcut('toggle-files')
  const maximized = useCore((s) => s.filesMaximized)
  const contextScope = useFilesContextScope()
  const scope = useFilesScope()
  const editor = useCore((s) => s.rpc?.features.includes('file-editor') ?? false)
  const projectFiles = useCore((s) => s.rpc?.features.includes('project-files') ?? false)
  const updatedAt = useCore((s) => scope?.conversationId ? s.conversations[scope.conversationId]?.updatedAt ?? 0 : 0)
  const branch = useScopeBranch(scope, updatedAt)
  const [projects, setProjects] = useState<string[]>([])
  useEffect(() => {
    if (projectFiles) void perform((rpc) => rpc.call('projects.recent', {})).then((found) => setProjects(found ?? []))
  }, [projectFiles])

  const following = !scope || !contextScope || fileScopeKey(scope) === fileScopeKey(contextScope)
  const options = useMemo<PickerOption[]>(() => [
    ...(contextScope?.roots.length ? [{ value: FOLLOW, label: projectNames(contextScope.roots), description: t('FilesPanel.followsWhatYouLookAt'), icon: <FolderIcon /> }] : []),
    ...projects.filter((path) => !contextScope?.roots.includes(path)).map((path) => ({ value: path, label: projectName(path), description: path, icon: <FolderIcon /> }))
  ], [contextScope, projects])
  const value = following && contextScope?.roots.length ? FOLLOW : scope?.roots.length === 1 && !scope.conversationId ? scope.roots[0] ?? null : null
  // A scope without a conversation reads through its folders, which an older core cannot.
  const readable = scope && (scope.conversationId || projectFiles)

  return (
    <aside className="side-panel files-panel" aria-label={t('FilesPanel.files')} data-maximized={maximized || undefined}>
      <header className="terminal-panel-header files-panel-header">
        <div className="files-panel-where">
          {options.length > 0
            ? <ChatPicker label={t('FilesPanel.whichFolders')} placement="below" value={value} placeholder={scope ? projectNames(scope.roots) : t('FilesPanel.pickAProject')} options={options}
                onChange={(picked) => showFilesPanel(picked === FOLLOW ? null : { conversationId: null, roots: [picked] })} />
            : <span className="files-panel-name">{scope?.roots.length ? projectNames(scope.roots) : t('FilesPanel.files')}</span>}
          {branch && following && <span className="files-panel-branch mono" title={branch}>{branch}</span>}
        </div>
        {readable && scope.roots.length > 0 && <button type="button" className="tool-button" aria-label={t('FilesPanel.goToFile')} data-tooltip={`${t('FilesPanel.goToFile')} ${PRIMARY_KEY_LABEL}P`} onClick={() => setFileQuickOpen(true)}><SearchIcon /></button>}
        <button type="button" className="tool-button" aria-label={maximized ? t('BrowserSidePanel.restore') : t('BrowserSidePanel.maximize')} data-tooltip={maximized ? t('BrowserSidePanel.restore') : t('BrowserSidePanel.maximize')} onClick={() => setFilesMaximized(!maximized)}>{maximized ? <RestoreIcon /> : <MaximizeIcon />}</button>
        <button type="button" className="tool-button" aria-label={t('FilesPanel.hideFiles')} data-tooltip={[t('FilesPanel.hideFiles'), shortcut].filter(Boolean).join(' ')} onClick={toggleFilesPanel}><CloseIcon /></button>
      </header>
      <div className="files-panel-body">
        {readable
          ? <FileEditor key={fileScopeKey(scope)} scope={scope} updatedAt={updatedAt} editor={editor} />
          : <p className="inspector-empty muted">{scope ? t('FilesPanel.updateCoreToBrowseProjects') : options.length ? t('FilesPanel.pickAProjectAbove') : t('FilesPanel.openAConversationWithAProject')}</p>}
      </div>
    </aside>
  )
}
