import { t } from '../i18n'
import { useState } from 'react'
import type { ProjectHead } from '@antumi/protocol'
import { useCore } from '../core-store'
import { BranchStatusDetails, type BranchTarget } from './BranchStatus'
import { ChatPicker } from './ChatPicker'
import { FolderIcon, MaximizeIcon, RestoreIcon } from './icons'
import { projectName } from './ProjectPicker'
import { GitRepository } from './GitRepository'

export function GitInspector({ target, heads, updatedAt, refresh, maximized, onMaximize }: {
  target: BranchTarget; heads: readonly ProjectHead[]; updatedAt: number; refresh: number; maximized: boolean; onMaximize: () => void
}) {
  const rpc = useCore((s) => s.rpc)
  const [project, setProject] = useState(heads[0]?.path ?? '')
  const selected = heads.some((head) => head.path === project) ? project : heads[0]?.path ?? ''
  if (!rpc?.features.includes('git-management')) return <BranchStatusDetails heads={heads} />
  if (!selected) return <p className="inspector-empty muted">{t('GitInspector.loadingProject')}</p>
  return <div className="git-manager">
    <div className="git-project-bar">
      <ChatPicker
        label={t('GitInspector.gitProject')}
        value={selected}
        placeholder={projectName(selected)}
        size="large"
        placement="below"
        options={heads.map((head, index) => ({ value: head.path, label: `${index === 0 ? t('BranchStatus.primaryProject') : t('GitInspector.additionalProjects')} · ${projectName(head.path)}`, description: head.path, icon: <FolderIcon /> }))}
        onChange={setProject}
      />
      <button className="tool-button" aria-label={maximized ? t('GitInspector.restoreGitPanel') : t('GitInspector.maximizeGitPanel')} title={maximized ? t('BrowserSidePanel.restore') : t('BrowserSidePanel.maximize')} onClick={onMaximize}>{maximized ? <RestoreIcon /> : <MaximizeIcon />}</button>
    </div>
    <GitRepository key={`${target.kind}:${target.id}:${selected}`} target={{ ...target, project: selected }} updatedAt={updatedAt} refresh={refresh} />
  </div>
}
