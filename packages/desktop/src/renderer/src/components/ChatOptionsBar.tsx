import { useState } from 'react'
import { getLocale, localized, t } from '../i18n'
import { agentDescriptor, agentModeText, helperAllowsMode, isHelper, startModes, type AgentKind, type ChatItem, type ChatModel, type ChatOption, type ChatPermissionMode, type Conversation } from '@antumi/protocol'
import { perform, setConversationAccount, useCore } from '../core-store'
import { useAgentCatalog } from '../agent-models'
import { providerFor } from '../model-provider-choice'
import { beginPermissionSwitch, endPermissionSwitch, usePermissionSwitching } from '../permission-switching'
import { ProviderPicker } from './ProviderPicker'
import { askConfirm } from '../confirm-dialog'
import { AccountPicker } from './AccountPicker'
import { ChatModelPicker, ChatPicker, modelMeta, type PickerOption } from './ChatPicker'
import { ContextUsage } from './ContextUsage'

type StateItem = Extract<ChatItem, { kind: 'state' }>

export function modeLabel(agent: AgentKind, mode: string): string {
  return agentModeText(agent, mode, getLocale())?.label ?? mode
}

// The modes as the picker lists them; one the agent offers but cannot be picked now stays greyed.
export function modeOptions(agent: AgentKind, modes: readonly string[], offered: readonly string[] = modes): PickerOption[] {
  return modes.map((mode) => ({
    value: mode,
    label: modeLabel(agent, mode),
    description: agentModeText(agent, mode, getLocale())?.description ?? null,
    disabled: !offered.includes(mode)
  }))
}

// Only the modes worth a second look stand out: planning, and running with nothing asked.
export function modeTone(mode: string | null): string | undefined {
  return mode === 'plan' || mode === 'bypass' ? mode : undefined
}

// Shared with core, which starts runs nobody watches in them (unattendedPermission), and the phone.
export { defaultStartMode, startModes } from '@antumi/protocol'

export function useAgentBackend(agent: AgentKind | null): string | null {
  return useCore((s) => (agent ? s.environment?.checks.find((check) => check.tool === agent)?.runtime?.active ?? null : null))
}

// What a stopped conversation can start in next: keeps its last stage's modes (existing stages
// stay on their own backend), or follows the active backend's modes when no stage has run yet.
export function nextStartModes(agent: AgentKind, stateModes: readonly string[], defaultModel: ChatModel | undefined, backend: string | null, planOnly: boolean): string[] {
  if (planOnly) return ['plan']
  const backendModes = backend ? agentDescriptor(agent).backendModes?.[backend] : undefined
  const base = stateModes.length > 0 ? stateModes : startModes(agent, defaultModel, backend)
  const canBypass = stateModes.length === 0 && backendModes
    ? backendModes.includes('bypass')
    : agentDescriptor(agent).capabilities.bypass
  return [...base.filter((mode) => mode !== 'bypass'), ...(canBypass ? ['bypass'] : [])]
}

const EFFORT_LABEL: Record<string, string> = localized(() => ({
  none: t('ChatOptionsBar.none'),
  minimal: t('ChatOptionsBar.minimal'),
  low: t('ChatOptionsBar.low'),
  medium: t('ChatOptionsBar.medium'),
  high: t('ChatOptionsBar.high'),
  xhigh: t('ChatOptionsBar.extraHigh'),
  max: t('ChatOptionsBar.maximum'),
  ultra: t('ChatOptionsBar.ultra')
}))

export function effortLabel(effort: string): string {
  return EFFORT_LABEL[effort] ?? effort
}

// A choice the stage reports but does not list (a mode Antumi has no name for) still shows.
function withCurrent(values: readonly string[], current: string | null): string[] {
  return current && !values.includes(current) ? [current, ...values] : [...values]
}

// The composer's toolbar, inside its box after the ＋: how freely the agent may act on the left; on
// the right, the model and effort it runs beside how full its context is. A click switches each;
// the model and effort change between turns, the mode at any time. With no agent running, the
// choices are for the next start, from what the last stage offered: as chosen since, or as that
// stage left them. Imported histories get their choices from the agent until first resumed.
export function ChatOptionsBar({ conversation, state, compact = false }: { conversation: Conversation; state: StateItem | null; compact?: boolean }) {
  const { id, agent, chatOptions: next } = conversation
  const managed = Boolean(conversation.squadRunId || conversation.parentConversationId || conversation.workspaceReadOnly)
  const running = conversation.sessionId !== null
  const switchingPermission = usePermissionSwitching(id) !== null
  const switchingSupported = useCore((s) => s.rpc?.features.includes('provider-selection-v2') ?? false)
  const [switchingProvider, setSwitchingProvider] = useState(false)
  const providers = useCore((s) => s.modelProviders)
  const activeBackend = useAgentBackend(agent)
  const catalog = useAgentCatalog(agent, !running && (!state?.models.length || Boolean(conversation.providerChangePending)), providerFor(providers, conversation.modelProvider, agent), conversation.modelProvider)
  const availableModels = conversation.providerChangePending ? catalog?.models ?? [] : state?.models.length ? state.models : running ? [] : catalog?.models ?? []
  // An older core takes options only from a running agent.
  if (!running && !next) return null
  // Work the agent left in the background runs on between turns, which take a new model as well.
  const idle = !running || conversation.chat?.turn === 'idle' || Boolean(conversation.chat?.betweenTurns)
  const set = (option: ChatOption, value: string) => {
    if (option !== 'permissionMode' || !running) {
      void perform((rpc) => rpc.call('conversations.setOption', { id, option, value }))
      return
    }
    beginPermissionSwitch(id, value)
    void perform((rpc) => rpc.call('conversations.setOption', { id, option, value }))
      .finally(() => endPermissionSwitch(id))
  }
  const permissionMode = (running ? state?.permissionMode : next?.permissionMode ?? state?.permissionMode) ?? null
  const modelId = (conversation.providerChangePending ? next?.model : running ? state?.model : next?.model ?? state?.model) ?? null
  // A model picked since takes its own default effort unless one was picked for it too.
  const effort = (conversation.providerChangePending ? next?.effort : running ? state?.effort : next?.effort ?? (next?.model && next.model !== state?.model ? null : state?.effort)) ?? null
  // Running stages offer exactly what the runtime reported; stopped ones follow the active backend.
  const offered = (running
    ? (state?.permissionModes ?? [])
    : nextStartModes(agent, state?.permissionModes ?? [], availableModels.find((each) => each.isDefault), activeBackend, Boolean(conversation.planOnly))
  ).filter((mode) => !isHelper(conversation) || helperAllowsMode(mode))
  const model = availableModels.find((each) => each.id === modelId)
  const modes = withCurrent(offered, permissionMode)
  const models = model || !modelId
    ? availableModels
    : [{ id: modelId, label: modelId, description: null, efforts: [], isDefault: false }, ...availableModels]
  const later = running ? null : t('ChatOptionsBar.appliesWhenYouSendTheNextMessage')
  return (
    <>
      {modes.length > 0 && (
        <ChatPicker
          label={t('ChatHandoff.permissionMode')}
          value={permissionMode}
          placeholder={t('ChatHandoff.permissionMode')}
          options={modeOptions(agent, modes, offered).map((option) => conversation.workspaceReadOnly ? { ...option, label: conversation.squadRunId || conversation.profile ? t('ChatOptionsBar.readOnly') : t('ChatOptionsBar.readOnlyCoordination') } : option)}
          tone={modeTone(permissionMode)}
          disabled={managed || switchingPermission || (!agentDescriptor(agent).capabilities.optionsWhileBusy && !idle)}
          title={managed ? t(conversation.profile ? 'AgentProfiles.fixedConfig' : 'ChatOptionsBar.useThisSquadSConfiguration') : switchingPermission ? t('ChatOptionsBar.switchingPermission') : later ?? undefined}
          onChange={(mode) => set('permissionMode', mode)}
        />
      )}
      {switchingPermission && (
        <span className="chat-suggestion-hint" role="status">{t('ChatOptionsBar.switchingPermission')}</span>
      )}
      {switchingSupported && <ProviderPicker agent={agent} value={conversation.modelProvider ?? null} remember={false}
        disabled={managed || Boolean(conversation.profile || conversation.discussionId) || isHelper(conversation) || switchingProvider || switchingPermission || !idle || Boolean(conversation.starting)}
        onChange={(modelProvider) => { void (async () => {
          if (!await askConfirm({ message: t('ProviderPicker.switchConfirm'), confirm: t('ProviderPicker.switch') })) return
          setSwitchingProvider(true)
          try { await perform((rpc) => rpc.call('conversations.setModelProvider', { id, modelProvider })) }
          finally { setSwitchingProvider(false) }
        })() }} />}
      {!conversation.modelProvider && !isHelper(conversation) && (
        <AccountPicker
          agent={agent}
          value={next?.account ?? null}
          disabled={managed || switchingProvider || switchingPermission || !idle}
          title={managed ? t(conversation.profile ? 'AgentProfiles.fixedConfig' : 'ChatOptionsBar.useThisSquadSConfiguration') : idle ? (running ? t('AccountPicker.restarts') : undefined) : t('AccountPicker.afterTurn')}
          onChange={(account) => void setConversationAccount(id, account)}
        />
      )}
      <span className="chat-dock-spacer" />
      {models.length > 0 && (
        <ChatModelPicker
          models={models.map((each) => ({ value: each.id, label: each.label, description: each.description, suffix: modelMeta(each), efforts: each.efforts.map((one) => ({ value: one, label: effortLabel(one) })) }))}
          model={modelId}
          effort={effort}
          disabled={managed || switchingProvider || switchingPermission || !idle}
          title={managed ? t(conversation.profile ? 'AgentProfiles.fixedConfig' : 'ChatOptionsBar.useThisSquadSConfiguration') : later ?? (idle ? undefined : t('ChatOptionsBar.changeModelAndReasoningEffortAfterThisTurn'))}
          onModel={(value) => set('model', value)}
          onEffort={(value) => set('effort', value)}
        />
      )}
      {!compact && state?.context && <ContextUsage context={state.context} />}
    </>
  )
}
