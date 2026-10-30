import { t } from '../i18n'
import { checkTaskHandoff, ChatPermissionMode, type ChatReference, type AgentKind, type ChatModel, type Conversation, type TaskLaunchOptions } from '@antumi/protocol'
import { resolveModel, useAgentCatalog } from '../agent-models'
import { providerFor } from '../model-provider-choice'
import { cancelHandoff, chooseHandoffMode, chooseHandoffModel, proposeHandoff, useHandoffs } from '../chat-handoff'
import { perform, useCore, useTaskHandoffSupported } from '../core-store'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel, reasonText } from '../labels'
import { confirmQuota, modelText } from './AgentQuota'
import { ChatModelPicker, ChatPicker } from './ChatPicker'
import { AgentIcon } from './icons'
import { defaultStartMode, effortLabel, modeOptions, modeTone, startModes } from './ChatOptionsBar'
import { startOptions } from './ConversationActions'
import { askConfirm } from '../confirm-dialog'

export type ComposerHandoff = {
  // The agent at work now: a task's, for a task's chat.
  from: AgentKind
  // Others installed here, to hand to; none, and the composer offers no switch.
  targets: readonly AgentKind[]
  // The agent the next send hands the chat to, with the mode, model and effort it starts in. modes
  // is empty where the mode is not the user's to pick: an older core, or a task still planned.
  target: {
    agent: AgentKind
    model: ChatModel | undefined
    modes: readonly ChatPermissionMode[]
    mode: ChatPermissionMode | null
    options: Pick<TaskLaunchOptions, 'permissionMode' | 'model' | 'effort'>
  } | null
  // Why it cannot go now (a task's chat waits for its turn to end), or null.
  blocker: string | null
  // A free conversation's agent mid-turn is stopped for it, once the user agrees.
  stopsRunning: boolean
  // Hands the chat over, the message as the note it goes with. Resolves to whether it went.
  send: (note: string, references?: ChatReference[]) => Promise<boolean>
}

// The mode an agent takes over in: the one picked for it, else the one the chat is in where it has
// that, else its own default. Shown before the handoff, so a mode it lacks never drops unseen.
export function handoffMode(agent: AgentKind, offered: readonly ChatPermissionMode[], picked: ChatPermissionMode | undefined, current: string | null | undefined): ChatPermissionMode {
  return offered.find((mode) => mode === picked) ?? offered.find((mode) => mode === current) ?? defaultStartMode(agent, offered)
}

// The composer's switch of agent: picking another agent readies a handoff, which the next send
// carries out; picking the agent at work again calls it off.
export function useComposerHandoff(conversation: Conversation): ComposerHandoff {
  const { id } = conversation
  const task = useCore((s) => (conversation.taskId ? s.tasks[conversation.taskId] : undefined))
  const tasks = useCore((s) => s.tasks)
  const taskSupported = useTaskHandoffSupported()
  const modelsSupported = useCore((s) => s.rpc?.features.includes('handoff-model') ?? false)
  const modesSupported = useCore((s) => s.rpc?.features.includes('handoff-mode') ?? false)
  const installed = useInstalledAgents()
  const pending = useHandoffs((s) => s[id])
  const from = task?.agent ?? conversation.agent
  // A group chat's member keeps the agent it was added as.
  const targets = (!task || taskSupported) && !conversation.discussionId && !conversation.helperOf ? installed.filter((agent) => agent !== from) : []
  const picked = pending && targets.includes(pending.agent) ? pending : null
  // An agent the conversation's provider serves goes on on it; another, on its own account.
  const providers = useCore((s) => s.modelProviders)
  const targetProvider = providerFor(providers, conversation.modelProvider, picked?.agent ?? null)
  const catalog = useAgentCatalog(picked?.agent ?? null, modelsSupported, targetProvider)
  const { model, modelId, effort } = resolveModel(catalog, picked ?? {})
  const turn = conversation.sessionId ? (conversation.chat?.turn ?? null) : null
  const dependencies = task ? task.dependsOn.map((other) => tasks[other]).filter((dependency) => dependency !== undefined) : []
  const found = task ? checkTaskHandoff(task, dependencies, turn) : null
  const stopsRunning = !task && conversation.sessionId !== null && turn !== 'idle'
  // A task still planned goes on planning, whoever takes it.
  const modes = picked && modesSupported && task?.status !== 'pending' ? startModes(picked.agent, model) : []
  const mode = picked && modes.length > 0 ? handoffMode(picked.agent, modes, picked.permissionMode, conversation.chatOptions?.permissionMode) : null
  const target = picked && {
    agent: picked.agent,
    model,
    modes,
    mode,
    options: { ...(mode ? { permissionMode: mode } : {}), ...(modelsSupported ? { model: modelId ?? null, effort: effort ?? null } : {}) }
  }
  const send = async (note: string, references?: ChatReference[]) => {
    if (!target || found) return false
    if (stopsRunning && !await askConfirm({ message: t('ChatHandoff.stopTheCurrentAndHandOffTo', { value1: agentLabel(from), value2: agentLabel(target.agent) }), confirm: t('ConfirmDialog.stopAndHandOff') })) return false
    if (!targetProvider && !await confirmQuota(target.agent, modelText(target.model))) return false
    const result = task
      ? await perform((rpc) => rpc.call('tasks.handoff', { id: task.id, agent: target.agent, note, ...(rpc.features.includes('chat-references') ? { references } : {}), ...startOptions(), ...target.options }))
      : await perform((rpc) => rpc.call('conversations.handoff', { id, agent: target.agent, note, ...(rpc.features.includes('chat-references') ? { references } : {}), stopRunning: stopsRunning, ...startOptions(), ...target.options }))
    if (result) cancelHandoff(id)
    return result !== null
  }
  return { from, targets, target, blocker: found && reasonText(found, found), stopsRunning, send }
}

// Who the chat is with, and the switch to another agent; the picked one stands out until it is sent.
export function HandoffAgentPicker({ conversationId, handoff, disabled }: { conversationId: string; handoff: ComposerHandoff; disabled: boolean }) {
  const { from, targets, target } = handoff
  const providers = useCore((s) => s.modelProviders)
  const chosen = useCore((s) => s.conversations[conversationId]?.modelProvider ?? null)
  const name = providers.find((provider) => provider.id === chosen)?.name ?? null
  // On a provider, where each agent would run once it takes over.
  const runsOn = (agent: AgentKind) => (chosen && name ? (providerFor(providers, chosen, agent) ? t('ChatHandoff.keepsProvider', { value1: name }) : t('ChatHandoff.ownAccountInstead', { value1: name })) : null)
  return (
    <ChatPicker
      label="Agent"
      value={target?.agent ?? from}
      placeholder={agentLabel(from)}
      options={[
        { value: from, label: agentLabel(from), icon: <AgentIcon agent={from} /> },
        ...targets.map((agent) => ({ value: agent, label: agentLabel(agent), icon: <AgentIcon agent={agent} />, description: runsOn(agent) }))
      ]}
      tone={target ? 'handoff' : undefined}
      disabled={disabled}
      onChange={(value) => {
        const agent = targets.find((each) => each === value)
        if (agent) proposeHandoff(conversationId, agent)
        else cancelHandoff(conversationId)
      }}
    />
  )
}

// The permission mode the agent taking over starts in, where core takes it.
export function HandoffModePicker({ conversationId, handoff }: { conversationId: string; handoff: ComposerHandoff }) {
  const { target } = handoff
  if (!target?.mode) return null
  return (
    <ChatPicker
      label={t('ChatHandoff.permissionMode')}
      value={target.mode}
      placeholder={t('ChatHandoff.permissionMode')}
      options={modeOptions(target.agent, target.modes)}
      tone={modeTone(target.mode)}
      onChange={(value) => {
        const picked = ChatPermissionMode.safeParse(value)
        if (picked.success) chooseHandoffMode(conversationId, picked.data)
      }}
    />
  )
}

// The model and effort the agent taking over starts in, where core takes them.
export function HandoffModelPicker({ conversationId, agent }: { conversationId: string; agent: AgentKind }) {
  const modelsSupported = useCore((s) => s.rpc?.features.includes('handoff-model') ?? false)
  const providers = useCore((s) => s.modelProviders)
  const chosen = useCore((s) => s.conversations[conversationId]?.modelProvider)
  const catalog = useAgentCatalog(agent, modelsSupported, providerFor(providers, chosen, agent))
  const pending = useHandoffs((s) => s[conversationId])
  const { modelId, defaultModel, effort } = resolveModel(catalog, pending ?? {})
  if (!catalog?.models.length) return null
  return (
    <ChatModelPicker
      models={catalog.models.map((each) => ({ value: each.id, label: each.label, description: each.description, efforts: each.efforts.map((one) => ({ value: one, label: effortLabel(one) })) }))}
      model={modelId ?? defaultModel?.id ?? null}
      effort={effort ?? null}
      onModel={(model) => {
        const efforts = catalog.models.find((each) => each.id === model)?.efforts ?? []
        chooseHandoffModel(conversationId, { model, ...(effort && efforts.includes(effort) ? { effort } : {}) })
      }}
      onEffort={(next) => chooseHandoffModel(conversationId, { model: modelId ?? defaultModel?.id, effort: next })}
    />
  )
}
