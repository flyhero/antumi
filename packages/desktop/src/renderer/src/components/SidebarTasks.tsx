import { t } from '../i18n'
import { tasksWaitingOnUser } from '../attention'
import { selectTask, setNewTaskOpen, useActionableItems, useTaskBoardOpen } from '../core-store'
import { useShortcutLabel } from '../keyboard-shortcuts'
import { CountBadge } from './CountBadge'
import { BoardIcon, PlusIcon } from './icons'

// The sidebar's way to the task board, which holds every task: the entry counts only the ones held
// up on the user, as the board shows the rest, and its ＋ starts a new one from anywhere.
export function SidebarTasks() {
  const shortcut = useShortcutLabel('new-task')
  const open = useTaskBoardOpen()
  const waiting = tasksWaitingOnUser(useActionableItems())
  return (
    <nav className="sidebar-tasks" aria-label={t('sidebar.tasks')}>
      <div className="sidebar-tasks-entry">
        <button type="button" className="inbox-entry" aria-current={open} aria-label={t('SidebarTasks.tasks', { value1: waiting ? t('SidebarTasks.needYourResponse', { waiting: waiting }) : '' })} onClick={() => selectTask(null)}>
          <BoardIcon />
          <span>{t('sidebar.tasks')}</span>
          <CountBadge count={waiting} title={t('SidebarTasks.tasksNeedYourResponse', { waiting: waiting })} />
        </button>
        <button
          type="button"
          className="icon-button sidebar-tasks-add sidebar-add"
          aria-label={t('SettingsPage.newTask')}
          data-tooltip={[t('SettingsPage.newTask'), shortcut].filter(Boolean).join(' · ')}
          onClick={() => setNewTaskOpen(true)}
        >
          <PlusIcon />
        </button>
      </div>
    </nav>
  )
}
