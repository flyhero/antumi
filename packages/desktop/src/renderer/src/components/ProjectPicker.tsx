import { t, tr } from '../i18n'
import { useCallback, useState, type FormEvent } from 'react'
import { MAX_TASK_REPOS, type TaskRepo } from '@antumi/protocol'
import { perform, useCore } from '../core-store'
import { canPickFolder, pickFolder } from '../desktop-bridge'
import { ContextMenu, MenuItem, menuPoint, type MenuPoint } from './ContextMenu'
import { Popover } from './Popover'
import { FolderIcon } from './icons'
import { ProjectIcon } from './ProjectIcon'

export function projectName(projectPath: string): string {
  return projectPath.split(/[\\/]/).filter(Boolean).at(-1) ?? projectPath
}

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
  onAdd,
  onBrowse,
  onForget,
  onClose
}: {
  recent: readonly string[]
  onAdd: (projectPath: string) => void
  onBrowse: () => void
  onForget: (projectPath: string) => void
  onClose: () => void
}) {
  const location = useProjectLocation()
  return (
    <Popover label={t('ProjectPicker.addProject')} onClose={onClose}>
      {recent.length > 0 && (
        <>
          <div className="menu-label">{t('ProjectPicker.recent')}</div>
          <ul className="menu-list">
            {recent.map((projectPath) => (
              <li key={projectPath} className="menu-row">
                <button type="button" className="menu-item" title={projectPath} onClick={() => onAdd(projectPath)}>
                  <ProjectIcon path={projectPath} />
                  <span className="menu-item-name">{projectName(projectPath)}</span>
                  <span className="menu-item-path project-location">{location(projectPath)}</span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  title={t('ProjectPicker.removeFromRecentProjectsExistingTasksAndConversations')}
                  aria-label={t('ProjectPicker.removeFromRecentProjects', { value1: projectName(projectPath) })}
                  onClick={() => onForget(projectPath)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
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
  // Open menu → the recent projects it offers; null while closed.
  const [menu, setMenu] = useState<string[] | null>(null)
  const close = useCallback(() => setMenu(null), [])
  // An additional project's right-click menu, which makes it the primary one.
  const [projectMenu, setProjectMenu] = useState<{ path: string; at: MenuPoint } | null>(null)
  const closeProjectMenu = useCallback(() => setProjectMenu(null), [])
  const paths = projects.map((project) => project.path)
  const promotable = !locked && !primaryLocked
  const promote = (projectPath: string) => {
    setProjectMenu(null)
    onChange([projectPath, ...paths.filter((each) => each !== projectPath)])
  }

  const add = (projectPath: string) => {
    setMenu(null)
    onChange([...paths, projectPath])
  }

  const browse = async (recent: readonly string[]) => {
    setMenu(null)
    const picked = await pickFolder(recent[0] ? parentDir(recent[0]) : undefined)
    if (picked) {
      add(picked)
    }
  }

  const open = async () => {
    const recent = ((await perform((rpc) => rpc.call('projects.recent', {}))) ?? []).filter(
      (projectPath) => !paths.includes(projectPath)
    )
    // Nothing to choose from yet: go straight to the folder dialog.
    if (recent.length === 0 && canPickFolder()) {
      await browse(recent)
    } else {
      setMenu(recent)
    }
  }

  const forget = async (projectPath: string) => {
    if (await perform((rpc) => rpc.call('projects.forget', { path: projectPath }))) {
      setMenu((current) => current?.filter((entry) => entry !== projectPath) ?? null)
    }
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
            promotable && index > 0 && t('ProjectPicker.rightClickToMakePrimary'),
            !locked && primaryLocked && index === 0 && t('ProjectPicker.primaryProjectIsFixedAfterTheConversationStarts')
          ].filter(Boolean).join('\n')}
          onContextMenu={promotable && index > 0 ? (event) => {
            event.preventDefault()
            setProjectMenu({ path: project.path, at: menuPoint(event) })
          } : undefined}
        >
          <span className="chip-main chip-static">
            <ProjectIcon path={project.path} />
            <span className="project-name">{projectName(project.path)}</span>
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
        <ContextMenu at={projectMenu.at} label={t('GitInspector.actionsFor', { value1: projectName(projectMenu.path) })} onClose={closeProjectMenu}>
          <MenuItem label={t('ProjectPicker.makePrimaryProject')} onSelect={() => promote(projectMenu.path)} />
        </ContextMenu>
      )}
      {!locked && paths.length < maxProjects && (
        <span className="menu-anchor">
          <button
            type="button"
            className="chip chip-add-button"
            aria-haspopup="dialog"
            aria-expanded={menu !== null}
            onClick={() => (menu ? setMenu(null) : void open())}
          >
            {compact && paths.length === 0 ? (
              <>{tr('ProjectPicker.noProject_1431', { value1: <FolderIcon /> })}</>
            ) : t('ProjectPicker.addProject_1432')}
          </button>
          {menu && (
            <ProjectMenu
              recent={menu}
              onAdd={add}
              onBrowse={() => void browse(menu)}
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
