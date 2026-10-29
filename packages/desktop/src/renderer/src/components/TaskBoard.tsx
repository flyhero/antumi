import { getLocale, localized, t, tr } from '../i18n'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { AGENT_KINDS, type AgentKind, type Task } from '@antumi/protocol'
import { timeAgo } from '../conversation-state'
import { selectTask, setNewTaskOpen, useCore } from '../core-store'
import { agentLabel, STATUS_LABEL } from '../labels'
import { setPreference, TASK_SORTS, usePreferences } from '../preferences'
import { isShortcut, recordingShortcut, useShortcutLabel } from '../keyboard-shortcuts'
import { boardColumns, boardProjects, type BoardColumn, type BoardFilter, type TaskSort } from '../task-board'
import { waitingOn } from '../task-waiting'
import { saveTaskText } from '../unsaved-edits'
import { ChatPicker } from './ChatPicker'
import { menuPoint, type MenuPoint } from './ContextMenu'
import { AgentIcon } from './icons'
import { projectName, projectNames } from './ProjectPicker'
import { StatusIcon } from './StatusIcon'
import { cardAction, TaskContextMenu, useChatTurn } from './TaskActions'
import { TaskAlerts } from './TaskAlerts'
import { openQuickAdd, TaskQuickAdd } from './TaskQuickAdd'
import { TitleEditor } from './TitleEditor'
import { TaskActivity } from './TaskActivity'
import { TaskDependencies } from './TaskDependencies'
import { useTaskActivity } from '../work-activity'

// The way back from a task to the board, at the start of its header; Esc goes there too.
export function BoardCrumb() {
  return (
    <span className="board-crumb">
      <button type="button" className="board-crumb-link" data-tooltip={t('TaskBoard.backToTaskBoardEsc')} onClick={() => selectTask(null)}>{t('GitInspector.task')}</button>
      <span className="board-crumb-sep" aria-hidden="true">/</span>
    </span>
  )
}

const SORT_LABEL: Record<TaskSort, string> = localized(() => ({ recent: t('TaskBoard.byRecentActivity'), created: t('TaskBoard.byCreationTime'), title: t('TaskBoard.byTitle') }))

// Kept while a task is open, so going back finds the board as it was left.
const useBoardFilter = create<BoardFilter & { allDone: boolean }>(() => ({ query: '', project: null, agent: null, allDone: false }))

// The tasks, one column per status. Each card offers the step that moves its task on; the rest is
// in the task itself, which a click opens.
export function TaskBoard() {
  const newTaskKey = useShortcutLabel('new-task')
  const tasks = useCore((s) => s.tasks)
  const filter = useBoardFilter()
  const sort = usePreferences((p) => p.taskSort)
  const abandoned = usePreferences((p) => p.showAbandonedTasks)
  const list = useMemo(() => Object.values(tasks), [tasks, getLocale()])
  const columns = useMemo(
    () => boardColumns(list, filter, sort, { abandoned, allDone: filter.allDone }),
    [list, filter, sort, abandoned, getLocale()]
  )
  const [menu, setMenu] = useState<{ id: string; at: MenuPoint } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const menuTask = menu ? tasks[menu.id] : undefined
  const narrowed = filter.query.trim() !== '' || filter.project !== null || filter.agent !== null
  const now = Date.now()
  // The task just written down, lit for a moment where it lands.
  const [freshId, setFreshId] = useState<string | null>(null)

  // N writes a task down, unless it is being typed somewhere or a dialog or menu is up.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || recordingShortcut() || !isShortcut('quick-add-task', event)) return
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], .xterm, [role="menu"], dialog')) return
      if (document.querySelector('dialog[open]')) return
      event.preventDefault()
      openQuickAdd()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <section className="task-board" aria-label={t('GitInspector.task')}>
      <header className="task-board-header">
        <h2>{t('GitInspector.task')}</h2>
        <input
          className="input task-board-search"
          type="search"
          aria-label={t('DependencyPicker.searchTasks')}
          placeholder={t('TaskBoard.titleSourceKeyOrTaskId')}
          value={filter.query}
          onChange={(event) => useBoardFilter.setState({ query: event.target.value })}
        />
        <ProjectFilter tasks={list} value={filter.project} />
        <AgentFilter tasks={list} value={filter.agent} />
        <span className="task-board-spacer" />
        <button
          type="button"
          className="task-board-chip"
          aria-pressed={abandoned}
          onClick={() => setPreference('showAbandonedTasks', !abandoned)}
        >{t('ChatRequestCards.cancelled')}</button>
        <SortButton value={sort} />
        <button type="button" className="button primary task-board-new" onClick={() => setNewTaskOpen(true)}>{tr('TaskBoard.newTask', { value1: <span className="task-board-key">{newTaskKey}</span> })}</button>
      </header>
      <TaskDependencies columns={columns}>
        <div className="task-board-columns">
          {columns.map((column) => (
            <Column key={column.status} column={column} narrowed={narrowed} top={column.status === 'pending' && <TaskQuickAdd onCreated={setFreshId} />}>
              {column.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  tasks={tasks}
                  now={now}
                  fresh={freshId === task.id}
                  renaming={renamingId === task.id}
                  menuOpen={menu?.id === task.id}
                  onRenamed={() => setRenamingId(null)}
                  onMenu={(at) => setMenu({ id: task.id, at })}
                />
              ))}
            </Column>
          ))}
        </div>
      </TaskDependencies>
      {menu && menuTask && (
        <TaskContextMenu task={menuTask} at={menu.at} onClose={closeMenu} onRename={() => setRenamingId(menuTask.id)} />
      )}
    </section>
  )
}

function Column({ column, narrowed, top, children }: { column: BoardColumn; narrowed: boolean; top?: ReactNode; children: ReactNode }) {
  const hidden = column.total - column.tasks.length
  return (
    <section className="task-board-column" aria-label={STATUS_LABEL[column.status]} data-status={column.status}>
      <h3 className="task-board-column-title">
        <StatusIcon status={column.status} decorative />
        <span>{STATUS_LABEL[column.status]}</span>
        <span className="count">{column.total}</span>
      </h3>
      {top}
      {column.total === 0 ? !top && <p className="task-board-column-empty">{narrowed ? t('DependencyPicker.noMatchingTasks') : t('TaskBoard.empty')}</p> : children}
      {hidden > 0 && (
        <button type="button" className="task-board-more" onClick={() => useBoardFilter.setState({ allDone: true })}>{tr('TaskBoard.showEarlier', { hidden: hidden })}</button>
      )}
    </section>
  )
}

function TaskCard({ task, tasks, now, fresh, renaming, menuOpen, onRenamed, onMenu }: {
  task: Task
  tasks: Readonly<Record<string, Task>>
  now: number
  fresh: boolean
  renaming: boolean
  menuOpen: boolean
  onRenamed: () => void
  onMenu: (at: MenuPoint) => void
}) {
  const turn = useChatTurn(task)
  const activity = useTaskActivity(task)
  const dependencies = task.dependsOn.map((id) => tasks[id]).filter((dependency) => dependency !== undefined)
  const action = cardAction(task, dependencies, turn)
  // A chat task that has not started its work: planning, or holding the plan it saved.
  const planning = task.status === 'pending' && task.conversationId !== null
  const agent = task.agent ? agentLabel(task.agent) : 'Agent'
  return (
    <article
      className="task-card"
      data-task-id={task.id}
      data-menu-open={menuOpen || undefined}
      data-fresh={fresh || undefined}
      data-abandoned={task.status === 'abandoned' || undefined}
      onClick={(event) => {
        if (!renaming && !(event.target instanceof Element && event.target.closest('.task-card-action'))) selectTask(task.id)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        onMenu(menuPoint(event))
      }}
    >
      {renaming ? (
        <TitleEditor title={task.title} label={t('NewTaskDialog.taskTitle')} onSave={(title) => saveTaskText(task.id, 'title', title)} onDone={onRenamed} />
      ) : (
        <button type="button" className="task-card-title" title={task.title}>
          {task.title}
          {dependencies.length > 0 && <span className="visually-hidden">{t('TaskBoard.dependencies', { titles: dependencies.map((dependency) => dependency.title).join(getLocale() === 'en' ? ', ' : '、') })}</span>}
        </button>
      )}
      {(planning || task.source || waitingOn(task, tasks) > 0) && (
        <span className="task-card-tags">
          {task.source && <span className="task-tag mono">{task.source.key}</span>}
          {planning && <span className="task-tag task-tag-refining">{task.plan && !task.plan.approved ? t('TaskBoard.planSaved') : t('TaskBoard.planning')}</span>}
          {waitingOn(task, tasks) > 0 && <span className="task-tag">{t('TaskBoard.waitingForDependencies')}</span>}
        </span>
      )}
      <TaskAlerts task={task} />
      {activity && <TaskActivity activity={activity} />}
      <span className="task-card-meta">
        <span className="task-card-agent" title={agent}><AgentIcon agent={task.agent} /></span>
        <span className="task-card-project">{projectNames(task.repos.map((repo) => repo.path))}</span>
        <span className="task-card-time">{timeAgo(task.updatedAt, now)}</span>
      </span>
      {action && (
        <span className="task-card-action">
          <button
            type="button"
            className="button"
            aria-disabled={action.reason !== null}
            data-tooltip={action.reason ? t('TaskBoard.cannotYet', { value1: action.label, value2: action.reason }) : undefined}
            onClick={() => {
              if (!action.reason) action.run()
            }}
          >
            {action.label}
          </button>
        </span>
      )}
    </article>
  )
}

// The board's filters and sort are the app's pickers, as wide as what they say and opening below.
function ProjectFilter({ tasks, value }: { tasks: readonly Task[]; value: string | null }) {
  const projects = useMemo(() => boardProjects(tasks), [tasks, getLocale()])
  if (projects.length < 2 && value === null) return null
  return (
    <ChatPicker
      label={t('TaskBoard.filterByProject')}
      value={value ?? ''}
      placeholder={t('TaskBoard.allProjects')}
      options={[{ value: '', label: t('TaskBoard.allProjects') }, ...projects.map((project) => ({ value: project, label: projectName(project), description: project }))]}
      size="large"
      placement="below"
      onChange={(project) => useBoardFilter.setState({ project: project || null })}
    />
  )
}

function AgentFilter({ tasks, value }: { tasks: readonly Task[]; value: AgentKind | null }) {
  const used = AGENT_KINDS.filter((agent) => tasks.some((task) => task.agent === agent))
  if (used.length < 2 && value === null) return null
  return (
    <ChatPicker
      label={t('TaskBoard.filterByAgent')}
      value={value ?? ''}
      placeholder={t('TaskBoard.allAgents')}
      options={[{ value: '', label: t('TaskBoard.allAgents') }, ...used.map((agent) => ({ value: agent, label: agentLabel(agent), icon: <AgentIcon agent={agent} /> }))]}
      size="large"
      placement="below"
      onChange={(picked) => useBoardFilter.setState({ agent: AGENT_KINDS.find((agent) => agent === picked) ?? null })}
    />
  )
}

function SortButton({ value }: { value: TaskSort }) {
  return (
    <ChatPicker
      label={t('ConversationList.sortBy')}
      value={value}
      placeholder={SORT_LABEL[value]}
      options={TASK_SORTS.map((sort) => ({ value: sort, label: SORT_LABEL[sort] }))}
      size="large"
      placement="below"
      align="end"
      onChange={(picked) => {
        const sort = TASK_SORTS.find((each) => each === picked)
        if (sort) setPreference('taskSort', sort)
      }}
    />
  )
}
