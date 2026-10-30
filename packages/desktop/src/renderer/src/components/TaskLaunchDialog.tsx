import { t } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { ChatPermissionMode, checkStart, checkStartMode, type AgentKind, type Task } from '@antumi/protocol'
import { resolveModel, useAgentCatalog, type ModelChoice } from '../agent-models'
import { dismissError, openChatWhileStarting, perform, updateTask, useCore } from '../core-store'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel, reasonText } from '../labels'
import { useOccludesBrowser } from '../browser-occlusion'
import { AgentQuotaHint, confirmQuota, modelText, useRecommendation } from './AgentQuota'
import { AgentModelPicker } from './AgentModelPicker'
import { modeOptions, startModes } from './ChatOptionsBar'
import { ChatPicker } from './ChatPicker'
import { AgentIcon, CloseIcon } from './icons'
import { SquadLaunchDialog } from './SquadLaunchDialog'
import { useEditsInPlace } from './TaskLaunch'
import { OtherProjectsHint } from './OtherProjectsHint'
import { providerFor, servingProviders } from '../model-provider-choice'
import { ProviderPicker } from './ProviderPicker'


function closeTaskLaunch() {
  dismissError()
  useCore.setState({ taskLaunchId: null, squadLaunch: false, squadPlan: null })
}

export function TaskLaunchDialog({ taskId }: { taskId: string }) {
  const task = useCore((s) => s.tasks[taskId])
  const plan = useCore((state) => state.squadPlan)
  const [squad, setSquad] = useState(Boolean(task?.squadId || plan || useCore.getState().squadLaunch))
  useEffect(() => { if (!task) closeTaskLaunch() }, [task])
  return task ? squad ? <SquadLaunchDialog task={task} onSingle={() => setSquad(false)} /> : <LaunchForm task={task} onSquad={() => setSquad(true)} /> : null
}

function LaunchForm({ task, onSquad }: { task: Task; onSquad(): void }) {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  const installed = useInstalledAgents()
  const recommended = useRecommendation(installed)?.agent ?? null
  const [agent, setAgent] = useState<AgentKind | null>(task.agent)
  const agents = agent && !installed.includes(agent) ? [...installed, agent] : installed
  const rpc = useCore((s) => s.rpc)
  const squadsSupported = rpc?.features.includes('squads') ?? false
  const supported = rpc?.features.includes('task-launch-options') ?? false
  const error = useCore((s) => s.error)
  const tasks = useCore((s) => s.tasks)
  const dependencies = task.dependsOn.flatMap((id) => tasks[id] ? [tasks[id]] : [])
  const [busy, setBusy] = useState(false)
  const inPlace = useEditsInPlace(task)
  const conversation = useCore((s) => s.conversations[task.conversationId ?? ''])
  // The provider the task runs on: settled with its conversation, picked here until it has one.
  const providers = useCore((s) => s.modelProviders)
  const providersSupported = rpc?.features.includes('model-providers') ?? false
  const providerFixed = Boolean(task.conversationId)
  const [providerId, setProviderId] = useState<string | null>(() => conversation?.modelProvider ?? task.launch.modelProvider ?? null)
  const provider = providerFor(providers, providerId, agent)
  const catalog = useAgentCatalog(agent, supported, provider)
  // What the task keeps (a core with Task.launch), else what its chat last ran in.
  const [choices, setChoices] = useState<Partial<Record<AgentKind, ModelChoice>>>(() => {
    if (!task.agent) return {}
    const chat = conversation?.agent === task.agent ? conversation.chatOptions : null
    return { [task.agent]: {
      model: task.launch.model ?? chat?.model ?? undefined,
      effort: task.launch.effort ?? chat?.effort ?? undefined
    } }
  })
  // Unpicked, each agent starts the task planning.
  const [modes, setModes] = useState<Partial<Record<AgentKind, ChatPermissionMode>>>(() =>
    task.agent && task.launch.permissionMode ? { [task.agent]: task.launch.permissionMode } : {})

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    dismissError()
    return () => element?.close()
  }, [])

  const choice = agent ? choices[agent] ?? {} : {}
  const { model, modelId, effort } = resolveModel(catalog, choice)
  const offered = agent ? startModes(agent, model) : []
  const requestedMode = (agent ? modes[agent] : undefined) ?? 'plan'
  const mode = supported && offered.includes(requestedMode) && !checkStartMode(dependencies, requestedMode) ? requestedMode : 'plan'
  const options = agent ? modeOptions(agent, ['plan', ...offered.filter((each) => each !== 'plan')]) : []
  const blocker = checkStart({ ...task, agent }, dependencies)
  const label = mode === 'plan' ? t('SquadLaunchDialog.startPlanning') : mode === 'readOnly' ? t('TaskActions.startAnalysis') : t('TaskActions.startExecution')
  const choose = (next: ModelChoice) => {
    if (agent) setChoices((known) => ({ ...known, [agent]: next }))
  }
  // Once the agent is settled, the dialog closes and the chat opens while the task starts; an error
  // from then on is the app's, not the closed dialog's.
  const submit = async () => {
    // On a provider it spends the provider's plan, not the agent's own quota.
    if (!agent || busy || blocker || (!provider && !await confirmQuota(agent, modelText(model)))) return
    setBusy(true)
    dismissError()
    if ((agent !== task.agent || task.squadId) && !await updateTask(task.id, { agent, ...(task.squadId ? { squadId: null } : {}) })) {
      setBusy(false)
      return
    }
    const params = {
      id: task.id,
      ...(rpc?.features.includes('chat-options') ? { allowBypass: true } : {}),
      ...(supported ? { permissionMode: mode, model: modelId ?? null, effort: effort ?? null } : {}),
      ...(providersSupported && !providerFixed ? { modelProvider: provider?.id ?? null } : {})
    }
    closeTaskLaunch()
    await openChatWhileStarting(task.id, () => perform((connection) => connection.call('tasks.start', params)))
  }

  return (
    <dialog ref={dialog} className="modal task-launch-dialog" aria-labelledby="task-launch-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) closeTaskLaunch() }}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) closeTaskLaunch() }}>
      <form className="modal-body" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <header className="modal-header">
          <h2 id="task-launch-title">{t('TaskLaunchDialog.startTask')}</h2>
          <button type="button" className="icon-button modal-close" aria-label={t('BackdropPicker.close')} disabled={busy} onClick={closeTaskLaunch}><CloseIcon /></button>
        </header>
        <p className="task-launch-name">{task.title}</p>
        {squadsSupported && <button type="button" className="link-button" disabled={busy} onClick={onSquad}>{t('SquadLaunchDialog.assignToDevelopmentSquad')}</button>}
        <fieldset className="task-launch-fields" disabled={busy}>
          <div className="task-launch-field"><span>Agent</span>
            <ChatPicker
              label="Agent"
              value={agent ?? ''}
              placeholder={t('AgentPicker.chooseAgent')}
              size="field"
              placement="below"
              options={agents.map((kind) => ({ value: kind, label: agentLabel(kind), icon: <AgentIcon agent={kind} />, description: installed.includes(kind) ? (kind === recommended ? t('AgentPicker.recommended') : null) : t('AgentPicker.notInstalled') }))}
              onChange={(value) => {
                const next = agents.find((each) => each === value)
                if (next) setAgent(next)
              }}
            />
          </div>
          {providersSupported && agent && servingProviders(providers, agent).length > 0 && (
            <div className="task-launch-field"><span>{t('ProviderPicker.provider')}</span>
              <ProviderPicker agent={agent} value={providerId} size="field" placement="below" disabled={providerFixed}
                onChange={(next) => { setProviderId(next); setChoices({}) }} />
            </div>
          )}
          {supported && <>
            <div className="task-launch-field"><span>{t('AgentModelPicker.model')}</span>
              <AgentModelPicker catalog={catalog} choice={choice} size="field" onChange={choose} />
            </div>
            <div className="task-launch-field"><span>{t('TaskLaunchDialog.mode')}</span>
              <ChatPicker
                label={t('TaskLaunchDialog.mode')}
                value={mode}
                placeholder={t('SettingsPage.planning')}
                size="field"
                placement="below"
                options={options.map((each) => ({ ...each, disabled: each.disabled || checkStartMode(dependencies, each.value) !== null }))}
                onChange={(value) => {
                  const selected = ChatPermissionMode.safeParse(value)
                  if (agent && selected.success) setModes((known) => ({ ...known, [agent]: selected.data }))
                }}
              />
            </div>
          </>}
        </fieldset>
        <p className="task-launch-description muted">
          {checkStartMode(dependencies, 'ask') ? t('TaskLaunchDialog.dependenciesAreUnfinishedOnlyPlanningIsAvailableNow') : options.find((each) => each.value === mode)?.description ?? t('TaskLaunchDialog.planFirstThenExecuteAfterApproval')}
        </p>
        {inPlace && mode !== 'plan' && mode !== 'readOnly' && <p className="task-launch-description muted">{t('SquadLaunchDialog.thisProjectIsNotAGitRepositoryChanges')}</p>}
        <OtherProjectsHint agent={agent} projectCount={task.repos.length} />
        {agent && !provider && <AgentQuotaHint agent={agent} model={modelText(model)} />}
        {blocker && <p className="modal-error">{reasonText(blocker, blocker)}</p>}
        {error && <p className="modal-error" role="alert">{error}</p>}
        <footer className="modal-footer">
          <button type="button" className="button ghost" disabled={busy} onClick={closeTaskLaunch}>{t('ChatCommandSettings.cancel')}</button>
          <button type="submit" className="button primary" disabled={busy || !agent || blocker !== null}>{busy ? t('DiscussionDraft.starting') : label}</button>
        </footer>
      </form>
    </dialog>
  )
}
