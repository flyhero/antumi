import { t } from '../i18n'
import { useId } from 'react'
import { MAX_DISCUSSION_REQUIREMENTS } from '@antumi/protocol'
import { DISCUSSION_REQUIREMENT_PRESETS } from '../discussion-requirements'
import { ChatPicker } from './ChatPicker'

// roundtable: the round table's own styles (debate, relay) are offered too. onPreset: told which
// preset was picked, for one that also sets stances.
export function DiscussionRequirements({ value, onChange, disabled = false, roundtable = false, onPreset }: { value: string; onChange: (value: string) => void; disabled?: boolean; roundtable?: boolean; onPreset?: (id: string) => void }) {
  const id = useId()
  const presets = DISCUSSION_REQUIREMENT_PRESETS.filter((preset) => roundtable || !preset.roundtable)
  const selected = presets.find((preset) => preset.text === value)?.id ?? null
  return (
    <div className="discussion-draft-field">
      <div className="discussion-draft-requirements-head">
        <label htmlFor={id}>{t('DiscussionRequirements.discussionRequirementsOptional')}</label>
        <ChatPicker
          label={t('DiscussionRequirements.usePreset')}
          value={selected}
          placeholder={value ? t('DiscussionRequirements.custom') : t('DiscussionRequirements.usePreset')}
          size="large"
          placement="below"
          disabled={disabled}
          title={t('DiscussionRequirements.choosingAPresetReplacesTheContentBelowYou')}
          options={presets.map((preset) => ({ value: preset.id, label: preset.label, description: preset.description }))}
          onChange={(chosen) => {
            const preset = presets.find((preset) => preset.id === chosen)
            if (!preset) return
            onChange(preset.text)
            onPreset?.(preset.id)
          }}
        />
      </div>
      <textarea
        id={id}
        className="discussion-draft-requirements"
        rows={4}
        maxLength={MAX_DISCUSSION_REQUIREMENTS}
        value={value}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        placeholder={t('DiscussionRequirements.sharedRequirementsForLengthStyleReasoningOrOutput')}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={`${id}-hint`} className="discussion-draft-requirements-hint muted">{t('DiscussionRequirements.appliesToEveryMemberEveryRoundAndThe')}</p>
    </div>
  )
}
