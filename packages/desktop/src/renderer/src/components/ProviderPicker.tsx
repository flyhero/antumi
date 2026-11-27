import { setPreference, usePreferences } from '../preferences'
import { t } from '../i18n'
import { agentDescriptor, MODEL_PROVIDER_PRESETS, type AgentKind } from '@antumi/protocol'
import { setSettingsOpen, useCore } from '../core-store'
import { agentLabel } from '../labels'
import { servingProviders } from '../model-provider-choice'
import { ChatPicker, type PickerSize } from './ChatPicker'

// An empty selection preserves the agent's native account or provider configuration.
export function ProviderPicker({ agent, value, onChange, disabled = false, placement, size, remember = true }: {
  agent: AgentKind
  value: string | null
  onChange: (providerId: string | null) => void
  remember?: boolean
  disabled?: boolean
  placement?: 'above' | 'below'
  size?: PickerSize
}) {
  const providers = servingProviders(useCore((s) => s.modelProviders), agent)
  if (agentDescriptor(agent).capabilities.modelProviders.length === 0) return null
  const picked = value
  const missing = Boolean(value && !providers.some((provider) => provider.id === value))
  return (
    <ChatPicker
      label={t('ProviderPicker.provider')}
      value={picked ?? ''}
      placeholder={t('ProviderPicker.ownAccount', { value1: agentLabel(agent) })}
      disabled={disabled}
      tone={missing ? 'warning' : undefined}
      title={disabled ? t('ProviderPicker.inherited') : missing ? t('ProviderPicker.unavailableHint') : undefined}
      placement={placement}
      size={size}
      options={[
        { value: '', label: t('ProviderPicker.ownAccount', { value1: agentLabel(agent) }), description: t('ProviderPicker.ownAccountDescription', { value1: agentLabel(agent) }) },
        ...(missing && value ? [{ value, label: t('ProviderPicker.unavailable'), description: t('ProviderPicker.unavailableHint'), disabled: true }] : []),
        ...providers.map((provider) => ({
          value: provider.id,
          label: provider.name,
          description: [provider.defaultModel, provider.preset !== 'custom' && !MODEL_PROVIDER_PRESETS[provider.preset].verified ? t('ModelProviderSettings.unverified') : null].filter(Boolean).join(' · ')
        }))
      ]}
      onChange={(next) => {
        const provider = next || null
        if (remember) setPreference('defaultProviders', { ...usePreferences.getState().defaultProviders, [agent]: provider })
        onChange(provider)
      }}
      footer={(close) => (
        <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); setSettingsOpen(true, 'model-providers') }}>{t('ProviderPicker.manage')}</button>
      )}
    />
  )
}
