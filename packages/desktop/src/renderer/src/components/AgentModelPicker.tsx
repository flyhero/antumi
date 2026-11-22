import { t } from '../i18n'
import type { ChatCatalog } from '@antumi/protocol'
import { resolveModel, type ModelChoice } from '../agent-models'
import { ChatModelPicker, ChatPicker, modelMeta, type PickerSize } from './ChatPicker'
import { effortLabel } from './ChatOptionsBar'

// An agent's model and effort, picked the way the composer picks them: one picker for both, the
// default model shown by name so it always says what will run. While the agent's models are on
// their way, or it lists none, it says so and takes nothing.
export function AgentModelPicker({ catalog, choice, onChange, size, placement = 'below', align = 'start', disabled = false }: {
  catalog: ChatCatalog | null | undefined
  choice: ModelChoice
  onChange: (next: ModelChoice) => void
  size?: PickerSize
  placement?: 'above' | 'below'
  align?: 'start' | 'end'
  disabled?: boolean
}) {
  const { defaultModel, modelId, effort } = resolveModel(catalog, choice)
  if (!catalog?.models.length) {
    return <ChatPicker label={t('AgentModelPicker.model')} value="" placeholder={catalog === undefined ? t('AgentModelPicker.loadingModels') : t('AgentModelPicker.agentDefaultModel')} options={[]} disabled size={size} onChange={() => {}} />
  }
  const current = modelId ?? defaultModel?.id
  return (
    <ChatModelPicker
      models={catalog.models.map((each) => ({ value: each.id, label: each.label, description: each.description, suffix: modelMeta(each), efforts: each.efforts.map((one) => ({ value: one, label: effortLabel(one) })) }))}
      model={current ?? null}
      effort={effort ?? null}
      size={size}
      placement={placement}
      align={align}
      disabled={disabled}
      onModel={(model) => {
        const efforts = catalog.models.find((each) => each.id === model)?.efforts ?? []
        onChange({ model, ...(choice.effort && efforts.includes(choice.effort) ? { effort: choice.effort } : {}) })
      }}
      onEffort={(next) => onChange({ ...(current ? { model: current } : {}), effort: next })}
    />
  )
}
