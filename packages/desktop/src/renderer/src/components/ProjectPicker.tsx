import { t, tr } from '../i18n'
import { useCallback, useState, type FormEvent } from 'react'
import { MAX_TASK_REPOS, type TaskRepo, type ProjectChoice } from '@antumi/protocol'
import { perform, useCore } from '../core-store'
import { canPickFolder, pickFolder } from '../desktop-bridge'
import { ContextMenu, MenuItem, menuPoint, type MenuPoint } from './ContextMenu'
import { Popover } from './Popover'
import { ChevronRightIcon, FolderIcon } from './icons'
import { ProjectIcon } from './ProjectIcon'
import { projectName } from '../project-names'
import { availableProjects, useRecentProjectChoices, useProjectDescriptions } from '../project-choices'
import { ProjectChoiceLabel, projectChoiceTitle } from './ProjectChoiceLabel'

export { projectName }

export function projectNames(paths: readonly string[]): string {
  return paths.length ? paths.map(projectName).join('、') : t('ProjectPicker.noProject')
}

// A header names the folder the agent works in; the rest are in its tooltip.
export function primaryProjectName(paths: readonly string[]): string {
  const [primary] = paths
  return primary ? projectName(primary) : t('ProjectPicker.noProject')
}

export function parentDir(projectPath: string): string | undefined {
  const parent = projectPath.replace(/[\\/]+[^\\/]+[\\/]*$/, '')
  return parent && parent !== projectPath ? parent : undefined
}

// Where a project is, for a row that already shows its name: the folder holding it, with core's
// home as ~ except on Windows, where few would read ~ as a folder. The full path is the row's tooltip.
export function projectLocation(projectPath: string, home?: { path: string; windows: boolean }): string {
  const parent = projectPath.replace(/[\\/]+[^\\/]+[\\/]*$/, '')
  if (parent === projectPath) return projectPath
  if (parent === '') return projectPath.startsWith('\\') ? '\\' : '/'
  if (/^[a-z]:$/i.test(parent)) return `${parent}\\`
  const own = home && !home.windows ? home.path.replace(/\/+$/, '') : ''
  if (own && (parent === own || parent.startsWith(`${own}/`))) return `~${parent.slice(own.length)}`
  return parent
}

export function useProjectLocation(): (projectPath: string) => string {
  const home = useCore((s) => s.rpc?.home)
  return (projectPath) => projectLocation(projectPath, home)
}

// Only reachable in a plain browser, where there is no native folder dialog.
function PathForm({ onSubmit }: { onSubmit: (projectPath: string) => void }) {
  const [draft, setDraft] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (draft.trim()) {
      onSubmit(draft.trim())
    }
  }
  return (
    <form className="menu-form" onSubmit={submit}>
      <input
        className="input mono"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t('ProjectPicker.absoluteProjectPathEGIdeaprojectsApp')}
        aria-label={t('ProjectPicker.projectPath')}
        autoFocus
      />
      <button type="submit" className="button" disabled={!draft.trim()}>{t('ProjectPicker.add')}</button>
    </form>
  )
}

function ProjectMenu({
  recent,
  selected,
  onAdd,
  onBrowse,
  onForget,
  onClose
}: {
  recent: readonly ProjectChoice[]
  selected: readonly string[]
  onAdd: (projectPath: string) => void
  onBrowse: () => void
  onForget: (projectPath: string) => void
  onClose: () => void
}) {
  const location = useProjectLocation()
  const [copiesOpen, setCopiesOpen] = useState(false)
  const { sources, copies } = availableProjects(recent, selected)
  const rows = (choices: readonly ProjectChoice[]) => choices.map((choice) => (
    <li key={choice.path} className="menu-row">
      <button type="button" className="menu-item" title={projectChoiceTitle(choice)} onClick={() => onAdd(choice.path)}>
        <ProjectChoiceLabel choice={choice} location={location(choice.path)} />
      </button>
      <button type="button" className="icon-button"
        title={t('ProjectPicker.removeFromRecentProjectsExistingTasksAndConversations')}
        aria-label={t('ProjectPicker.removeFromRecentProjects', { value1: projectName(choice.path) })}
        onClick={() => onForget(choice.path)}>×</button>
    </li>
  ))
  return (
    <Popover label={t('ProjectPicker.addProject')} onClose={onClose}>
      {recent.length > 0 && (
        <>
          <div className="menu-label">{t('ProjectPicker.recent')}</div>
          <ul className="menu-list">{rows(sources)}</ul>
          {copies.length > 0 && <>
            <button type="button" className="menu-item project-copies-toggle" aria-expanded={copiesOpen}
              onClick={() => setCopiesOpen(!copiesOpen)}>
              <ChevronRightIcon /><span>{t('ProjectChoices.worktree')}</span><span className="project-copies-count">{copies.length}</span>
            </button>
            {copiesOpen && <ul className="menu-list">{rows(copies)}</ul>}
          </>}
          <div className="menu-separator" />
        </>
      )}
      {canPickFolder() ? (
        <button type="button" className="menu-item" onClick={onBrowse}>{t('KnowledgeBaseSettings.chooseAnotherFolder')}</button>
      ) : (
        <PathForm onSubmit={onAdd} />
      )}
    </Popover>
  )
}

type ProjectEntry = Pick<TaskRepo, 'path' | 'worktreePath'>

// Controlled: shows `projects` and reports the new path list through `onChange`. With
// `primaryLocked`, projects can still be added and removed but the first one stays first.
export function ProjectPicker({
  projects,
  onChange,
  locked = false,
  primaryLocked = false,
  maxProjects = MAX_TASK_REPOS,
  compact = false
}: {
  projects: readonly ProjectEntry[]
  onChange: (paths: string[]) => void
  locked?: boolean
  primaryLocked?: boolean
  maxProjects?: number
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const choices = useRecentProjectChoices(open)
  const [forgotten, setForgotten] = useState<readonly string[]>([])
  const recent = choices.filter((choice) => !forgotten.includes(choice.path) && (!choice.source || !forgotten.includes(choice.source)))
  const close = useCallback(() => setOpen(false), [])
  // An additional project's right-click menu, which makes it the primary one.
  const [projectMenu, setProjectMenu] = useState<{ path: string; at: MenuPoint; anchor: HTMLElement } | null>(null)
  const closeProjectMenu = useCallback(() => setProjectMenu(null), [])
  const paths = projects.map((project) => project.path)
  const descriptions = useProjectDescriptions(paths)
  const promotable = !locked && !primaryLocked
  const promote = (projectPath: string) => {
    setProjectMenu(null)
    onChange([projectPath, ...paths.filter((each) => each !== projectPath)])
  }

  const add = (projectPath: string) => {
    setOpen(false)
    onChange([...paths, projectPath])
  }

  const browse = async (recent: readonly ProjectChoice[]) => {
    setOpen(false)
    const picked = await pickFolder(recent[0] ? parentDir(recent[0].source ?? recent[0].path) : undefined)
    if (picked) {
      add(picked)
    }
  }

  const forget = async (projectPath: string) => {
    const removed = recent.filter((choice) => choice.path === projectPath || choice.source === projectPath)
    if (await perform(async (rpc) => {
      for (const choice of removed) await rpc.call('projects.forget', { path: choice.path })
      return true
    })) setForgotten((known) => [...known, projectPath, ...removed.map((choice) => choice.path)])
  }

  return (
    <div className="chip-field">
      {/* The primary project stands out by colour; another becomes primary from its right-click menu. */}
      {projects.map((project, index) => (
        <span
          key={project.path}
          className="chip project-chip"
          data-primary={index === 0 || undefined}
          title={[
            index === 0 ? t('ProjectPicker.primaryProject', { value1: project.path }) : project.path,
            project.worktreePath && `worktree：${project.worktreePath}`,
            descriptions[index]?.worktree && projectChoiceTitle(descriptions[index]),
            promotable && index > 0 && t('ProjectPicker.rightClickToMakePrimary'),
            !locked && primaryLocked && index === 0 && t('ProjectPicker.primaryProjectIsFixedAfterTheConversationStarts')
          ].filter(Boolean).join('\n')}
          onContextMenu={promotable && index > 0 ? (event) => {
            event.preventDefault()
            setProjectMenu({ path: project.path, at: menuPoint(event), anchor: event.currentTarget })
          } : undefined}
        >
          <span className="chip-main chip-static">
            <ProjectIcon path={project.path} />
            <span className="project-name">{projectName(project.path)}</span>
            {descriptions[index]?.worktree && <span className="project-copy-badge">{t('ProjectChoices.copy')}</span>}
            {index === 0 && <span className="visually-hidden">{t('ProjectPicker.primaryProject_1427')}</span>}
          </span>
          {!locked && !(primaryLocked && index === 0) && (
            <button
              type="button"
              className="chip-remove"
              title={t('ProjectPicker.removeProjectKeepsDirectoryAndExistingWorktrees')}
              aria-label={t('ProjectPicker.remove', { value1: projectName(project.path) })}
              onClick={() => onChange(paths.filter((projectPath) => projectPath !== project.path))}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {projectMenu && (
        <ContextMenu at={projectMenu.at} anchor={projectMenu.anchor} label={t('GitInspector.actionsFor', { value1: projectName(projectMenu.path) })} onClose={closeProjectMenu}>
          <MenuItem label={t('ProjectPicker.makePrimaryProject')} onSelect={() => promote(projectMenu.path)} />
        </ContextMenu>
      )}
      {!locked && paths.length < maxProjects && (
        <span className="menu-anchor">
          <button
            type="button"
            className="chip chip-add-button"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {compact && paths.length === 0 ? (
              <>{tr('ProjectPicker.noProject_1431', { value1: <FolderIcon /> })}</>
            ) : t('ProjectPicker.addProject_1432')}
          </button>
          {open && (
            <ProjectMenu
              recent={recent}
              selected={paths}
              onAdd={add}
              onBrowse={() => void browse(recent)}
              onForget={(projectPath) => void forget(projectPath)}
              onClose={close}
            />
          )}
        </span>
      )}
      {locked && projects.length === 0 && <span className="muted">{t('ProjectPicker.notSet')}</span>}
    </div>
  )
}
