import { SupportActions } from './ContactAuthor'
import { t, tr } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { agentSupportsPlan, ChatPermissionMode, checkSquadStart, squadModes, squadReadOnlyIssues, type Task } from '@antumi/protocol'
import { dismissError, openChatWhileStarting, perform, selectSquad, useCore } from '../core-store'
import { useOccludesBrowser } from '../browser-occlusion'
import { reasonText } from '../labels'
import { resolveSquadRoster, squadReadOnlyIssueText } from '../squads'
import { useAgentBackend } from './ChatOptionsBar'
import { useEditsInPlace } from './TaskLaunch'
import { ChatPicker } from './ChatPicker'
import { CloseIcon, SquadIcon } from './icons'

export function SquadLaunchDialog({ task, onSingle }: { task: Task; onSingle(): void }) {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  const squads = useCore((state) => state.squads)
  const profiles = useCore((state) => state.agentProfiles)
  const tasks = useCore((state) => state.tasks)
  const plan = useCore((state) => state.squadPlan)
  const inPlace = useEditsInPlace(task)
  const error = useCore((state) => state.error)
  const available = Object.values(squads).filter((squad) => squad.archivedAt === null)
  const [squadId, setSquadId] = useState(task.squadId ?? available[0]?.id ?? '')
  const [requested, setRequested] = useState<ChatPermissionMode>('ask')
  const [busy, setBusy] = useState(false)
  // Without a plan to go by, the leader plans with the user first unless told to divide the work up
  // as it goes.
  const leaderPlans = useCore((state) => state.rpc?.features.includes('squad-leader-planning') ?? false) && !plan && !task.plan
  const [planFirst, setPlanFirst] = useState(true)
  const squad = squads[squadId]
  const resolvedSquad = squad ? { ...squad, members: resolveSquadRoster(squad, profiles) } : null
  const leader = resolvedSquad?.members.find((member) => member.id === resolvedSquad.leaderId) ?? null
  const leaderBackend = useAgentBackend(leader?.agent ?? null)
  const leaderCanPlan = leader ? agentSupportsPlan(leader.agent, leaderBackend) : true
  const planning = leaderPlans && leaderCanPlan && planFirst
  const modes = resolvedSquad ? squadModes(resolvedSquad, true) : []
  const readOnlyIssue = resolvedSquad ? squadReadOnlyIssues(resolvedSquad)[0] ?? null : null
  const mode = modes.includes(requested) ? requested : modes[0] ?? 'ask'
  const dependencies = task.dependsOn.flatMap((id) => tasks[id] ? [tasks[id]] : [])
  // Planning reads only, so it may begin before the dependencies are done.
  const blocker = planning ? (task.status !== 'pending' ? 'not-pending' : task.repos.length ? null : 'missing-repo') : checkSquadStart(task, dependencies, Boolean(plan))
  const close = () => { dismissError(); useCore.setState({ taskLaunchId: null, squadPlan: null, squadLaunch: false }) }
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close() }, [])
  const start = async () => {
    if (busy || blocker || readOnlyIssue || !squad || squad.archivedAt !== null || !modes.length) return
    setBusy(true); dismissError()
    const result = await openChatWhileStarting(task.id, () => perform((rpc) => rpc.call('squads.start', { id: task.id, squadId, permissionMode: mode, allowBypass: true, ...(plan ? { plan } : {}), ...(planning ? { planFirst: true } : {}) })))
    if (result) { close(); if (!planning) useCore.setState({ inspectorOpen: true, taskInspectorTab: 'squad' }) }
    if (!result && useCore.getState().tasks[task.id]?.squadId === squadId && useCore.getState().tasks[task.id]?.status === 'running') useCore.setState({ taskLaunchId: null, squadPlan: null, squadLaunch: false, view: 'chat', inspectorOpen: true, taskInspectorTab: 'squad' })
    setBusy(false)
  }
  return <dialog ref={dialog} className="modal task-launch-dialog" aria-labelledby="squad-launch-title" onCancel={(event) => { event.preventDefault(); if (!busy) close() }}>
    <form className="modal-body" onSubmit={(event) => { event.preventDefault(); void start() }}>
      <header className="modal-header"><h2 id="squad-launch-title">{plan ? t('SquadLaunchDialog.assignPlanningToSquad') : t('SquadLaunchDialog.assignToDevelopmentSquad')}</h2><button type="button" className="icon-button modal-close" aria-label={t('BackdropPicker.close')} disabled={busy} onClick={close}><CloseIcon /></button></header>
      <p className="task-launch-name">{task.title}</p>
      {!plan && <button type="button" className="link-button" disabled={busy} onClick={onSingle}>{t('SquadLaunchDialog.useASingleAgent')}</button>}
      <fieldset className="task-launch-fields" disabled={busy}>
        <div className="task-launch-field"><span>{t('NewTaskDialog.developmentSquad')}</span>
          <ChatPicker label={t('NewTaskDialog.developmentSquad')} value={squadId} placeholder={t('SquadLaunchDialog.chooseSquad')} size="field" placement="below" onChange={setSquadId}
            options={available.map((each) => ({ value: each.id, label: each.name, description: each.description || t('SquadLaunchDialog.members', { value1: each.members.length - 1 }), icon: <SquadIcon /> }))} />
        </div>
        <div className="task-launch-field"><span>{t('SquadLaunchDialog.developmentPermissions')}</span>
          <ChatPicker label={t('SquadLaunchDialog.developmentPermissions')} value={mode} placeholder={t('ChatPlan.askEachTime')} size="field" placement="below"
            options={modes.map((each) => ({ value: each, label: each === 'ask' ? t('ChatPlan.askEachTime') : each === 'acceptEdits' ? t('ChatPlan.acceptEditsAutomatically') : each === 'bypass' ? t('ChatPlan.allowEverything') : t('SquadLaunchDialog.automatic') }))}
            onChange={(value) => { const parsed = ChatPermissionMode.safeParse(value); if (parsed.success) setRequested(parsed.data) }} />
        </div>
      </fieldset>
      {leaderPlans && (
        <fieldset className="squad-launch-ways" disabled={busy}>
          <label><input type="radio" name="squad-launch-way" disabled={!leaderCanPlan} checked={leaderCanPlan && planFirst} onChange={() => setPlanFirst(true)} /><span>{tr('SquadLaunchDialog.recommended', { value1: <b>{t('SquadLaunchDialog.planWithTheLeaderFirst')}</b>, value2: <span className="muted">{t(leaderCanPlan ? 'SquadLaunchDialog.theLeaderReadsCodeAndDiscussesThePlan' : 'SquadLaunchDialog.leaderPlanUnsupported')}</span> })}</span></label>
          <label><input type="radio" name="squad-launch-way" checked={!leaderCanPlan || !planFirst} onChange={() => setPlanFirst(false)} /><span><b>{t('SquadLaunchDialog.startDirectly')}</b><span className="muted">{t('SquadLaunchDialog.theLeaderBreaksDownTaskDetailsAndAssigns')}</span></span></label>
        </fieldset>
      )}
      {resolvedSquad && <p className="muted">{tr('SquadLaunchDialog.coordinatesMembersUsingTheSquadSModelsAnd', { value1: resolvedSquad.members.find((member) => member.id === resolvedSquad.leaderId)?.name, value2: resolvedSquad.members.length - 1, value3: planning ? t('SquadLaunchDialog.developmentPermissionsApplyAfterPlanApproval') : '' })}</p>}
      {inPlace && <p className="muted">{t('SquadLaunchDialog.thisProjectIsNotAGitRepositoryChanges')}</p>}
      {!available.length && <button type="button" className="button" onClick={() => { close(); selectSquad(null, true) }}>{t('SquadLaunchDialog.createADevelopmentSquadFirst')}</button>}
      {readOnlyIssue && squad ? (
        <p className="modal-error" role="alert">{squadReadOnlyIssueText(readOnlyIssue)}<button type="button" className="link-button" onClick={() => { close(); selectSquad(squad.id) }}>{t('SquadLaunchDialog.editSquad')}</button></p>
      ) : blocker ? <p className="modal-error" role="alert">{reasonText(blocker, blocker)}</p>
        : error && <p className="modal-error" role="alert">{error}<SupportActions error={error} /></p>}
      <footer className="modal-footer"><button type="button" className="button ghost" disabled={busy} onClick={close}>{t('ChatCommandSettings.cancel')}</button><button type="submit" className="button primary" disabled={busy || Boolean(blocker || readOnlyIssue) || !squad || squad.archivedAt !== null || !modes.length}>{busy ? t('DiscussionDraft.starting') : planning ? t('SquadLaunchDialog.startPlanning') : t('ChatPlan.startSquadDevelopment')}</button></footer>
    </form>
  </dialog>
}
