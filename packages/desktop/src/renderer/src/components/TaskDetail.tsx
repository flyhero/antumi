import { SourceUpdatesPanel } from './SourceUpdatesPanel'
import { localized, t, tr } from '../i18n'
import { useState } from 'react'
import { checkChangePrimary, checkEditProjects, shortTaskId, type Task } from '@antumi/protocol'
import { selectTask, updateTask, useCore, useTaskCancelSupported } from '../core-store'
import { dayAndTime } from '../labels'
import { saveTaskText, unsavedTaskText, useTaskSaveState, type SaveState } from '../unsaved-edits'
import { MarkdownEditor } from './MarkdownEditor'
import { SourceLink } from './SourceLink'
import { SourceSnapshotCard } from './SourceSnapshotCard'
import { BoardCrumb } from './TaskBoard'
import { TaskAlerts } from './TaskAlerts'
import { TaskPlanCard } from './TaskPlanCard'
import { TaskImages, useImageAdder } from './TaskImages'
import { reopenTask, TaskStatusMenu, TaskSteps, TaskToolbar } from './TaskActions'
import { DependencyPicker, TaskDependents } from './DependencyPicker'
import { ProjectPicker } from './ProjectPicker'
import { TaskStarts } from './TaskStarts'
import { TaskAutoRun } from './TaskAutoRun'

// Drafts are local and saved on blur so a remote update never clobbers typing.
function useDraft(value: string, save: (next: string) => void) {
  const [draft, setDraft] = useState(value)
  return {
    value: draft,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: () => {
      if (draft !== value) {
        save(draft)
      }
    }
  }
}

const SAVE_TEXT: Record<SaveState, string> = localized(() => ({
  saving: t('McpSettingsSection.saving'),
  saved: t('TaskDetail.saved'),
  failed: t('TaskDetail.saveFailedRetriesAutomaticallyAfterCoreReconnects')
}))

function SaveIndicator({ taskId }: { taskId: string }) {
  const state = useTaskSaveState(taskId)
  return state && <span className="save-state" data-state={state} role="status">{SAVE_TEXT[state]}</span>
}

// Why a task was cancelled, and the way back; how many times it was redone, why last, and where the
// earlier goes are kept. From before redoing kept the task: which task a redo came from, or took over.
function Lineage({ task, tasks }: { task: Task; tasks: Record<string, Task> }) {
  const link = (other: Task) => (
    <button type="button" className="link-button" onClick={() => selectTask(other.id)}>
      「{other.title}」
    </button>
  )
  const reopenable = useTaskCancelSupported()
  if (task.status === 'abandoned') {
    const successor = Object.values(tasks).find((other) => other.derivedFrom === task.id)
    return (
      <p className="lineage" data-abandoned="true">{tr('TaskDetail.cancelled', { value1: task.abandonReason ? `：${task.abandonReason}` : '', value2: successor
          ? <>{tr('TaskDetail.continuedByThisWorktreeRemainsOnDisk', { value1: link(successor) })}</>
          : reopenable && <button type="button" className="link-button" onClick={() => void reopenTask(task)}>{t('TaskActions.reopen')}</button> })}</p>
    )
  }
  const last = task.attempts.at(-1)
  if (last) {
    const branches = task.attempts.flatMap((attempt) => attempt.branches.map((kept) => kept.branch))
    return (
      <p className="lineage">{tr('TaskDetail.redoneTimes', { value1: task.attempts.length, value2: last.reason ? t('TaskDetail.lastReason', { value1: last.reason }) : '', value3: branches.length > 0 && <>{tr('TaskDetail.previousChangesAreOnBranch', { value1: <span className="mono">{branches.join('、')}</span> })}</> })}</p>
    )
  }
  const predecessor = task.derivedFrom ? tasks[task.derivedFrom] : undefined
  if (!predecessor) {
    return null
  }
  return (
    <p className="lineage">{tr('TaskDetail.redoneFromAbandoned', { value1: link(predecessor), value2: predecessor.abandonReason ? `：${predecessor.abandonReason}` : '' })}</p>
  )
}

export function TaskDetail({ taskId }: { taskId: string }) {
  const task = useCore((s) => s.tasks[taskId])
  if (!task) {
    return null
  }
  return <TaskDetailBody task={task} />
}

function TaskDetailBody({ task }: { task: Task }) {
  const tasks = useCore((s) => s.tasks)
  // Text core has not confirmed yet wins over core's copy, so a failed save stays on screen.
  const title = useDraft(unsavedTaskText(task.id, 'title') ?? task.title, (next) => {
    if (next.trim()) {
      saveTaskText(task.id, 'title', next.trim())
    }
  })
  const dependents = Object.values(tasks).filter((other) => other.dependsOn.includes(task.id))
  const images = useImageAdder(task.id)

  return (
    <section className="detail task-detail" aria-label={t('NewTaskDialog.taskDetails')} {...images.handlers}>
      <header className="detail-header">
        <BoardCrumb />
        <span className="muted mono">{shortTaskId(task.id)}</span>
        <TaskAlerts task={task} />
        <SourceLink source={task.source} />
        <SaveIndicator taskId={task.id} />
        <TaskToolbar task={task} view="detail" />
      </header>

      <div className="task-detail-layout">
        <div className="task-detail-heading">
          <input className="input title-input" {...title} maxLength={200} aria-label={t('ConversationList.title')} />
          <Lineage task={task} tasks={tasks} />
          <div className="task-detail-actions">
            <TaskSteps task={task} labelled />
          </div>
        </div>

        <aside className="task-detail-side" aria-label={t('TaskDetail.taskProperties')}>
          <div className="task-props">
            <TaskStatusMenu task={task} />
          </div>
          <dl className="props">
            <dt>{t('ChatMentionMenu.project')}</dt>
            <dd>
              <ProjectPicker
                projects={task.repos}
                locked={checkEditProjects(task) !== null}
                primaryLocked={checkChangePrimary(task) !== null}
                onChange={(repos) => void updateTask(task.id, { repos })}
              />
            </dd>
            <TaskStarts task={task} />
            <dt>{t('TaskDetail.dependencies')}</dt>
            <dd>
              <DependencyPicker
                taskId={task.id}
                dependsOn={task.dependsOn}
                onChange={(dependsOn) => void updateTask(task.id, { dependsOn })}
              />
              <TaskAutoRun task={task} />
            </dd>
            <dt>{t('FileMarkdown.image')}</dt>
            <dd>
              <TaskImages task={task} uploading={images.uploading} onAddFiles={(files) => void images.add(files)} />
            </dd>
            {dependents.length > 0 && (
              <>
                <dt>{t('TaskDetail.dependents')}</dt>
                <dd>
                  <TaskDependents dependents={dependents} />
                </dd>
              </>
            )}
          </dl>
          <p className="task-detail-created">{tr('TaskDetail.created', { value1: dayAndTime(task.createdAt) })}</p>
        </aside>

        <div className="task-detail-main">
          <SourceSnapshotCard task={task} />
          {task.source && <SourceUpdatesPanel target={{ kind: 'task', id: task.id }} />}
          <TaskPlanCard task={task} />

          <MarkdownEditor
            className="task-detail-details"
            value={unsavedTaskText(task.id, 'details') ?? task.details}
            onSave={(next) => saveTaskText(task.id, 'details', next)}
            label={t('NewTaskDialog.taskDetails')}
            hint={t('TaskDetail.goalContextAcceptanceCriteriaImportantFilesMarkdownSupported')}
          />
        </div>
      </div>
    </section>
  )
}
