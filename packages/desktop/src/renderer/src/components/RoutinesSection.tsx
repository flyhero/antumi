import { localized, t, tr } from '../i18n'
import { useEffect, useId, useState } from 'react'
import { isScheduleOpen, type Routine, type ScheduledRun } from '@antumi/protocol'
import { selectConversation, setAwakeMode, useCore } from '../core-store'
import { reasonText } from '../labels'
import { deleteRoutine, fetchRoutineRuns, isUnread, markRoutineAllSeen, nextRunText, routineAgentLabel, runOutcomeText, runRoutineNow, scheduleText, updateRoutine } from '../routines'
import { scheduleTime, UNATTENDED_LABEL } from '../schedules'
import { useNow } from '../usage-format'
import { ChevronRightIcon, ClockIcon, MoreIcon, PauseIcon, PencilIcon, PlayIcon, PlusIcon, TrashIcon } from './icons'
import type { ReactNode } from 'react'
import { AgentsPageHeader } from './AgentsPageHeader'
import { ContextMenu, MenuItem, type MenuPoint } from './ContextMenu'
import { RoutineEditor } from './RoutineEditor'
import { SettingsLink } from './SchedulePicker'
import { Segmented } from './SettingsControls'
import { ROUTINE_TEMPLATES, type RoutineTemplate } from '../routine-templates'
import { BookIcon, BranchIcon, ChartIcon, DocumentIcon, FileChangesIcon, FolderIcon, PulseIcon, RefreshIcon } from './icons'

const PAGE = 50

// A routine's runs, newest first, fetched when the row opens and again as the routine changes.
function History({ routine, now }: { routine: Routine; now: number }) {
  const rpc = useCore((s) => s.rpc)
  const [runs, setRuns] = useState<ScheduledRun[] | null>(null)
  const [more, setMore] = useState(false)
  const key = `${routine.updatedAt}:${routine.lastRun?.id}:${routine.lastRun?.status}:${routine.lastRun?.finishedAt}:${routine.unread}`
  useEffect(() => {
    let current = true
    void fetchRoutineRuns(routine.id, null).then((page) => {
      if (!current || !page) return
      setRuns(page)
      setMore(page.length === PAGE)
    })
    return () => { current = false }
  }, [routine.id, key])

  const older = async () => {
    const last = runs?.at(-1)
    if (!last) return
    const page = await fetchRoutineRuns(routine.id, last.createdAt)
    if (!page) return
    setRuns([...(runs ?? []), ...page])
    setMore(page.length === PAGE)
  }
  const markSeen = (run: ScheduledRun) => void rpc?.call('routines.markSeen', { runId: run.id }).catch(() => {})

  if (runs === null) return <p className="routine-history-empty muted">{t('DashboardPanel.loading')}</p>
  if (runs.length === 0) return <p className="routine-history-empty muted">{t('RoutinesSection.noRunsYet')}</p>
  return (
    <>
      <ul className="routine-history">
        {runs.map((run) => {
          const unread = isUnread(run)
          const skipped = run.status === 'cancelled'
          return (
            <li key={run.id} className="routine-run" data-skipped={skipped || undefined} data-unread={unread || undefined}>
              <span className="routine-run-dot" aria-label={unread ? t('OverviewView.unread') : undefined} />
              <span className="routine-run-when">{scheduleTime(run.dueAt ?? run.createdAt, now)}</span>
              {run.conversationId ? (
                <button type="button" className="schedule-title routine-run-open" onClick={() => selectConversation(run.conversationId)}>{runOutcomeText(run, now)}</button>
              ) : (
                <span className="routine-run-text">{runOutcomeText(run, now)}</span>
              )}
              {unread && !run.conversationId && <button type="button" className="link-button" onClick={() => markSeen(run)}>{t('RoutinesSection.read')}</button>}
            </li>
          )
        })}
      </ul>
      {more && <button type="button" className="link-button routine-history-more" onClick={() => void older()}>{t('RoutinesSection.earlier')}</button>}
    </>
  )
}

// A rule per row: what a run needs most (its results, running it, editing it) stays at hand, the
// rest waits in its menu, so a page of rules is not a column of red links.
function Row({ routine, now, onEdit }: { routine: Routine; now: number; onEdit: () => void }) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [menu, setMenu] = useState<{ at: MenuPoint; trigger: HTMLElement } | null>(null)
  const failure = routine.lastRun && (routine.lastRun.status === 'failed' || routine.lastRun.outcome === 'failed') ? routine.lastRun.error : null
  return (
    <li className="routine-row" data-paused={!routine.enabled || undefined} data-open={open || undefined}>
      <div className="routine-line">
        <button type="button" className="routine-toggle" aria-expanded={open} aria-label={open ? t('RoutinesSection.collapseHistory') : t('RoutinesSection.expandHistory')} onClick={() => setOpen(!open)}>
          <ChevronRightIcon />
        </button>
        <span className="routine-main">
          <span className="routine-title-line">
            <button type="button" className="schedule-title routine-title" onClick={() => setOpen(!open)}>{routine.title}</button>
            {routine.unread > 0 && <span className="inbox-entry-count routine-unread" aria-label={t('RoutinesSection.unreadRuns', { value1: routine.unread })}>{routine.unread}</span>}
          </span>
          <span className="schedule-meta">
            {scheduleText(routine.schedule)} · {routineAgentLabel(routine.target.agent)} · {nextRunText(routine, now)}
            {routine.lastRun && isScheduleOpen(routine.lastRun) && <span> · {runOutcomeText(routine.lastRun, now)}</span>}
            {failure && <span className="routine-failure">{tr('RoutinesSection.last', { value1: reasonText(failure, failure) })}</span>}
          </span>
        </span>
        <span className="schedule-actions routine-actions">
          {deleting ? (
            <>
              <span className="muted routine-confirm">{t('RoutinesSection.conversationsCreatedByThisRoutineReturnToThe')}</span>
              <button type="button" className="link-button routine-delete" onClick={() => void deleteRoutine(routine.id)}>{t('McpSettingsSection.confirmDeletion')}</button>
              <button type="button" className="link-button" onClick={() => setDeleting(false)}>{t('ChatCommandSettings.cancel')}</button>
            </>
          ) : (
            <>
              {routine.unread > 0 && <button type="button" className="link-button" onClick={() => markRoutineAllSeen(routine.id)}>{t('RoutinesSection.markAllAsRead')}</button>}
              <button type="button" className="tool-button" aria-label={t('OverviewView.runNow')} data-tooltip={t('RoutinesSection.runImmediatelyIgnoringTimeAndQuota')} onClick={() => void runRoutineNow(routine.id)}><PlayIcon /></button>
              <button type="button" className="tool-button" aria-label={t('chatTools.edit')} data-tooltip={t('chatTools.edit')} onClick={onEdit}><PencilIcon /></button>
              <button
                type="button"
                className="tool-button"
                aria-label={t('FileEditor.moreActions')}
                data-tooltip={t('FileEditor.moreActions')}
                aria-haspopup="menu"
                aria-expanded={menu !== null}
                onClick={(event) => {
                  const trigger = event.currentTarget
                  const box = trigger.getBoundingClientRect()
                  setMenu(menu ? null : { at: { x: box.right, y: box.bottom + 4 }, trigger })
                }}
              >
                <MoreIcon />
              </button>
            </>
          )}
        </span>
      </div>
      {menu && (
        <ContextMenu at={menu.at} align="end" trigger={menu.trigger} label={t('FileEditor.moreActions')} onClose={() => setMenu(null)}>
          <MenuItem label={routine.enabled ? t('DiscussionView.pause') : t('RoutinesSection.enable')} icon={routine.enabled ? <PauseIcon /> : <PlayIcon />} onSelect={() => { setMenu(null); void updateRoutine(routine.id, { enabled: !routine.enabled }) }} />
          <MenuItem label={t('ChatCommandSettings.delete')} icon={<TrashIcon />} danger onSelect={() => { setMenu(null); setDeleting(true) }} />
        </ContextMenu>
      )}
      {open && <History routine={routine} now={now} />}
    </li>
  )
}

const TEMPLATE_ICON: Record<RoutineTemplate['icon'], ReactNode> = {
  changes: <FileChangesIcon />, refresh: <RefreshIcon />, branch: <BranchIcon />, pulse: <PulseIcon />,
  folder: <FolderIcon />, document: <DocumentIcon />, book: <BookIcon />, chart: <ChartIcon />
}

// Common chores written out, to start a routine from: picked like the agents' templates, as cards,
// each opening the editor filled in; the last starts a blank one.
function Templates({ onPick, onBlank }: { onPick: (template: RoutineTemplate) => void; onBlank: () => void }) {
  return (
    <ul className="squad-cards" aria-label={t('RoutinesSection.templates')}>
      {ROUTINE_TEMPLATES.map((template) => (
        <li key={template.id}>
          <button type="button" className="squad-card" onClick={() => onPick(template)}>
            <span className="squad-card-top"><span className="squad-card-icon" aria-hidden="true">{TEMPLATE_ICON[template.icon]}</span><span className="squad-card-name">{template.title}</span></span>
            <span className="squad-card-description">{template.description}</span>
            <span className="squad-card-foot"><span className="routine-template-when"><ClockIcon />{scheduleText(template.schedule)}</span></span>
          </button>
        </li>
      ))}
      <li>
        <button type="button" className="squad-card squad-card-new" onClick={onBlank}>
          <span className="squad-card-plus"><PlusIcon /></span>{t('AgentTemplates.blank')}<span className="squad-card-new-hint">{t('RoutinesSection.blankHint')}</span>
        </button>
      </li>
    </ul>
  )
}

type Editing = { routine: Routine | null; template: RoutineTemplate | null }
type Tab = 'rules' | 'templates'
const TABS: readonly { value: Tab; label: string }[] = localized(() => ([{ value: 'rules', label: t('RoutinesSection.mine') }, { value: 'templates', label: t('RoutinesSection.templates') }]))

// The routines' tab: a page head like the agents', then the routines, each with when it next runs
// and what its runs did: the runs' conversations are opened from here and nowhere else. Beside
// them, on their own tab, templates to start one from, which is where a user without any lands first.
export function RoutinesSection() {
  const routines = useCore((s) => s.routines)
  const mode = useCore((s) => s.chatSettings?.unattendedMode ?? 'acceptEdits')
  const awake = useCore((s) => s.awake)
  const now = useNow(60_000)
  const tabsId = useId()
  const [tab, setTab] = useState<Tab>(() => (routines.length === 0 ? 'templates' : 'rules'))
  const [editing, setEditing] = useState<Editing | null>(null)
  const create = () => setEditing({ routine: null, template: null })
  const scheduled = routines.some((routine) => routine.enabled && routine.schedule.kind !== 'manual')
  return (
    <>
      <AgentsPageHeader
        title={t('RoutinesEntry.scheduled')}
        description={tr('RoutinesView.repeatingTasksEachRunOpensANewConversation', { value1: UNATTENDED_LABEL[mode], value2: <SettingsLink /> })}
        actions={<button type="button" className="button primary" onClick={create}><PlusIcon />{t('RoutinesView.newRoutine')}</button>}
      />
      {awake && awake.mode !== 'on' && scheduled && (
        <p className="routines-notice" role="note">{tr('RoutinesView.nothingRunsWhileTheComputerSleepsOnlyThe', { value1: <button type="button" className="link-button" onClick={() => void setAwakeMode('on')}>{t('RoutinesView.switchToAlwaysAwake')}</button> })}</p>
      )}
      <section className="routines-section" aria-label={t('RoutinesSection.routineList')}>
        <div className="squads-tabs">
          <span id={tabsId} className="visually-hidden">{t('RoutinesSection.show')}</span>
          <Segmented labelId={tabsId} value={tab} options={TABS.map((each) => (each.value === 'rules' ? { ...each, label: t('RoutinesSection.mine_1485', { value1: routines.length }) } : each))} onChange={setTab} />
        </div>
        {tab === 'rules'
          ? routines.length === 0
            ? <p className="worktrees-empty muted">{t('RoutinesSection.noRoutinesYetClickNewToSetRecurring')}</p>
            : <ul className="worktree-list routine-list">{routines.map((routine) => <Row key={routine.id} routine={routine} now={now} onEdit={() => setEditing({ routine, template: null })} />)}</ul>
          : <Templates onPick={(template) => setEditing({ routine: null, template })} onBlank={create} />}
        {editing && <RoutineEditor routine={editing.routine} template={editing.template} onClose={() => setEditing(null)} />}
      </section>
    </>
  )
}
