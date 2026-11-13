import { getLocale, localized, t } from '../i18n'
import { agentDescriptor, agentModeText, helperAllowsMode, isHelper, type AgentKind, type ChatItem, type ChatModel, type ChatOption, type ChatPermissionMode, type Conversation } from '@antumi/protocol'
import { perform } from '../core-store'
import { ChatModelPicker, ChatPicker, type PickerOption } from './ChatPicker'
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
// stage left them.
export function ChatOptionsBar({ conversation, state, compact = false }: { conversation: Conversation; state: StateItem; compact?: boolean }) {
  const { id, agent, chatOptions: next } = conversation
  const managed = Boolean(conversation.squadRunId || conversation.parentConversationId || conversation.workspaceReadOnly)
  const running = conversation.sessionId !== null
  // An older core takes options only from a running agent.
  if (!running && !next) return null
  const idle = !running || conversation.chat?.turn === 'idle'
  const set = (option: ChatOption, value: string) => void perform((rpc) => rpc.call('conversations.setOption', { id, option, value }))
  const permissionMode = running ? state.permissionMode : (next?.permissionMode ?? state.permissionMode)
  const modelId = running ? state.model : (next?.model ?? state.model)
  // A model picked since takes its own default effort unless one was picked for it too.
  const effort = running ? state.effort : (next?.effort ?? (next?.model && next.model !== state.model ? null : state.effort))
  // The next start offers bypass where the agent has it, even if this one started without; a task
  // that only plans never. A helper never plans.
  const offered = (running || conversation.planOnly
    ? state.permissionModes
    : [...state.permissionModes.filter((mode) => mode !== 'bypass'), ...(agentDescriptor(agent).capabilities.bypass ? ['bypass'] : [])]
  ).filter((mode) => !isHelper(conversation) || helperAllowsMode(mode))
  const model = state.models.find((each) => each.id === modelId)
  const modes = withCurrent(offered, permissionMode)
  const models = model || !modelId
    ? state.models
    : [{ id: modelId, label: modelId, description: null, efforts: [], isDefault: false }, ...state.models]
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
          disabled={managed || (!agentDescriptor(agent).capabilities.optionsWhileBusy && !idle)}
          title={managed ? t(conversation.profile ? 'AgentProfiles.fixedConfig' : 'ChatOptionsBar.useThisSquadSConfiguration') : later ?? undefined}
          onChange={(mode) => set('permissionMode', mode)}
        />
      )}
      <span className="chat-dock-spacer" />
      {models.length > 0 && (
        <ChatModelPicker
          models={models.map((each) => ({ value: each.id, label: each.label, description: each.description, efforts: each.efforts.map((one) => ({ value: one, label: effortLabel(one) })) }))}
          model={modelId}
          effort={effort}
          disabled={managed || !idle}
          title={managed ? t(conversation.profile ? 'AgentProfiles.fixedConfig' : 'ChatOptionsBar.useThisSquadSConfiguration') : later ?? (idle ? undefined : t('ChatOptionsBar.changeModelAndReasoningEffortAfterThisTurn'))}
          onModel={(value) => set('model', value)}
          onEffort={(value) => set('effort', value)}
        />
      )}
      {!compact && state.context && <ContextUsage context={state.context} />}
    </>
  )
}
