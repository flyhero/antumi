import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { GitProject } from '@antumi/protocol'
import { t } from '../i18n'
import { openGit, openOverview, selectConversation, selectTask, setGitLocation, useCore } from '../core-store'
import { canPickFolder, pickFolder } from '../desktop-bridge'
import { setPreference, usePreferences } from '../preferences'
import { ChatPicker } from './ChatPicker'
import { GitRepository } from './GitRepository'
import { useFocusCount } from './Inspector'
import { useSidebarEntryMenu } from './SidebarEntryMenu'
import { GitIcon, CloseIcon, FolderIcon, RefreshIcon } from './icons'
import { projectName } from './ProjectPicker'

export function GitEntry() {
  const supported = useCore((s) => s.rpc?.features.includes('git-projects'))
  const open = useCore((s) => s.gitOpen)
  const { onContextMenu, menu } = useSidebarEntryMenu('git')
  if (!supported) return null
  return <><button className="inbox-entry" aria-current={open} onClick={() => openGit()} onContextMenu={onContextMenu}><GitIcon /><span>Git</span></button>{menu}</>
}

export function GitPage() {
  const rpc = useCore((s) => s.rpc)
  const location = useCore((s) => s.gitLocation)
  const revision = useCore((s) => s.gitRevision)
  const tasks = useCore((s) => s.tasks)
  const conversations = useCore((s) => s.conversations)
  const lastProject = usePreferences((s) => s.gitLastProject)
  const focus = useFocusCount()
  const [recent, setRecent] = useState<string[]>([])
  const [data, setData] = useState<{ path: string; project: GitProject } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [path, setPath] = useState('')
  const request = useRef(0)
  const selected = location?.project || lastProject || recent[0] || ''
  const workspace = location?.workspace || selected
  const project = data?.path === selected ? data.project : null
  useEffect(() => {
    let live = true
    void rpc?.call('projects.recent', {}).then((paths) => { if (live) setRecent(paths) }, () => {})
    return () => { live = false }
  }, [rpc, selected])
  useEffect(() => {
    const sequence = ++request.current
    setError(null)
    if (!selected || !rpc?.features.includes('git-projects')) return
    void rpc.call('git.openProject', { path: selected }).then((project) => {
      if (sequence !== request.current) return
      setData({ path: selected, project })
      const latest = useCore.getState().gitLocation
      if ((!latest || latest.project === selected && latest.workspace === selected) && project.directory !== selected) setGitLocation(selected, project.directory)
      setPreference('gitLastProject', selected)
    }, (failure: unknown) => {
      if (sequence === request.current) setError(failure instanceof Error ? failure.message : String(failure))
    })
    return () => { request.current++ }
  }, [rpc, selected, revision, focus, retry])
  const choose = (project: string) => { setGitLocation(project, project) }
  const browse = async () => {
    const folder = await pickFolder(selected || undefined)
    if (folder) choose(folder)
  }
  const submit = (event: FormEvent) => { event.preventDefault(); if (path.trim()) choose(path.trim()) }
  const entries = [...new Set([selected, ...recent].filter(Boolean))]
  const current = project?.workspaces.find((entry) => entry.path === workspace)
  const active = current && !current.missing ? current.path : undefined
  const owner = current?.taskId ? tasks[current.taskId] : undefined
  const chat = current?.conversationIds.map((id) => conversations[id]).find(Boolean)
  return <section className="git-page">
    <header className="git-page-header">
      <h1><GitIcon /> Git</h1>
      <button className="tool-button" aria-label={t('GitPage.close')} onClick={openOverview}><CloseIcon /></button>
    </header>
    <div className="git-project-bar git-page-projects">
      {entries.length > 0 && <ChatPicker label={t('GitPage.project')} value={selected} placeholder={t('GitPage.project')} placement="below"
        options={entries.map((path) => ({ value: path, label: projectName(path), description: path, icon: <FolderIcon /> }))} onChange={choose} />}
      {canPickFolder() ? <button className="button" onClick={() => void browse()}><FolderIcon />{t('GitPage.openProject')}</button>
        : <form className="git-path-form" onSubmit={submit}><input className="input mono" aria-label={t('ProjectPicker.projectPath')} placeholder={t('ProjectPicker.absoluteProjectPathEGIdeaprojectsApp')} value={path} onChange={(event) => setPath(event.target.value)} /><button className="button" disabled={!path.trim()}>{t('GitPage.openProject')}</button></form>}
      <button className="tool-button" aria-label={t('GitPage.refresh')} disabled={!selected} onClick={() => setRetry((value) => value + 1)}><RefreshIcon /></button>
    </div>
    {project && <div className="git-project-bar git-workspace-bar">
      <ChatPicker label={t('GitPage.workspace')} value={active ?? ''} placeholder={t('GitPage.workspace')} placement="below"
        options={project.workspaces.map((entry) => ({ value: entry.path, label: `${entry.branch ?? t('GitInspector.detachedHead')}${entry.taskId ? ` · ${tasks[entry.taskId]?.title ?? t('GitInspector.task')}` : ''}`, description: `${entry.path}${entry.missing ? ` · ${t('GitPage.missing')}` : ''}${entry.planning ? ` · ${t('GitPage.readOnly')}` : ''}${entry.locked ? ` · ${t('GitPage.locked')}` : ''}`, disabled: entry.missing }))}
        onChange={(path) => setGitLocation(selected, path)} />
      {owner && <button className="button ghost" onClick={() => selectTask(owner.id)}>{t('SourceInboxView.openTask')}</button>}
      {!owner && chat && <button className="button ghost" onClick={() => selectConversation(chat.id)}>{t('WorktreeManager.openConversation')}</button>}
    </div>}
    {project && !active && <p className="git-message" role="alert">{t('GitPage.workspaceGone')}</p>}
    {error && <p className="git-message" role="alert">{error} <button className="button" onClick={() => setRetry((value) => value + 1)}>{t('ChatContextMenu.retry')}</button></p>}
    {!rpc?.features.includes('git-projects') ? <p className="inspector-empty muted">{t('GitPage.unsupported')}</p>
      : !selected ? <div className="git-page-empty"><GitIcon /><strong>{t('GitPage.emptyTitle')}</strong><p>{t('GitPage.emptyDescription')}</p></div>
        : !project && !error ? <p className="git-message muted">{t('GitInspector.loadingProject')}</p>
          : active && !error && <div className="git-manager"><GitRepository key={active} target={{ kind: 'project', project: active }} refresh={retry} /></div>}
  </section>
}
