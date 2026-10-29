import { useEffect, useState } from 'react'
import { PanelShortcutAction, PANEL_SHORTCUT_LABELS, defaultPanelShortcut, formatShortcut, panelShortcut, panelShortcutConflict, reservedShortcut, shortcutBinding, withPanelShortcut } from '../../../shared/panel-shortcuts'
import { messageSearchText, t } from '../i18n'
import { SHORTCUT_PLATFORM } from '../panel-shortcuts'
import { setPreference, usePreferences } from '../preferences'
import { SettingsGroup, SettingsRow } from './SettingsControls'
import { SearchIcon } from './icons'
import './keyboard-shortcut-settings.css'

export function KeyboardShortcutSettings() {
  const settings = usePreferences((state) => state.panelShortcuts)
  const [query, setQuery] = useState('')
  const [recording, setRecording] = useState<PanelShortcutAction | null>(null)
  const [error, setError] = useState('')
  const label = (action: PanelShortcutAction) => t(PANEL_SHORTCUT_LABELS[action])

  const apply = (action: PanelShortcutAction, binding: ReturnType<typeof panelShortcut> | undefined) => {
    const current = usePreferences.getState().panelShortcuts
    const next = binding === undefined ? defaultPanelShortcut(action, SHORTCUT_PLATFORM) : binding
    const conflict = next && panelShortcutConflict(current, SHORTCUT_PLATFORM, action, next)
    if (conflict) {
      setError(t('KeyboardShortcuts.conflict', { action: label(conflict) }))
      return false
    }
    setPreference('panelShortcuts', withPanelShortcut(current, SHORTCUT_PLATFORM, action, binding))
    setError('')
    setRecording(null)
    return true
  }

  useEffect(() => {
    if (!recording) return
    const capture = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229 || event.getModifierState('AltGraph')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.repeat) return
      if (event.key === 'Escape') { setRecording(null); setError(''); return }
      const binding = shortcutBinding(event)
      if (!binding) return
      if (reservedShortcut(binding, SHORTCUT_PLATFORM)) { setError(t('KeyboardShortcuts.reserved')); return }
      apply(recording, binding)
    }
    window.addEventListener('keydown', capture, true)
    return () => window.removeEventListener('keydown', capture, true)
  }, [recording])

  const needle = query.trim().toLowerCase()
  const actions = PanelShortcutAction.options.filter((action) => {
    const binding = panelShortcut(settings, SHORTCUT_PLATFORM, action)
    const keys = binding ? `${binding.key} ${binding.ctrl ? 'ctrl control' : ''} ${binding.meta ? 'cmd command' : ''} ${binding.alt ? 'alt option' : ''} ${binding.shift ? 'shift' : ''}` : t('KeyboardShortcuts.disabled')
    return `${messageSearchText(label(action))} ${keys} ${formatShortcut(binding, SHORTCUT_PLATFORM)}`.toLowerCase().includes(needle)
  })
  const changed = PanelShortcutAction.options.some((action) => settings[SHORTCUT_PLATFORM]?.[action] !== undefined)

  return <div className="keyboard-shortcut-settings" data-shortcut-recording={recording ? true : undefined}>
    <div className="keyboard-shortcut-toolbar">
      <label className="keyboard-shortcut-search">
        <SearchIcon />
        <input className="input" type="search" aria-label={t('KeyboardShortcuts.search')} placeholder={t('KeyboardShortcuts.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <button type="button" className="button" disabled={!changed} onClick={() => {
        setPreference('panelShortcuts', { ...settings, [SHORTCUT_PLATFORM]: undefined })
        setRecording(null)
        setError('')
      }}>{t('KeyboardShortcuts.resetAll')}</button>
    </div>
    <p className="muted keyboard-shortcut-hint">{t('KeyboardShortcuts.hint')}</p>
    {error && <p className="keyboard-shortcut-error" role="alert">{error}</p>}
    {actions.length > 0 ? <SettingsGroup>
      {actions.map((action) => {
        const binding = panelShortcut(settings, SHORTCUT_PLATFORM, action)
        const keys = formatShortcut(binding, SHORTCUT_PLATFORM)
        const customized = settings[SHORTCUT_PLATFORM]?.[action] !== undefined
        return <SettingsRow key={action} label={label(action)}
          description={t('KeyboardShortcuts.default', { keys: formatShortcut(defaultPanelShortcut(action, SHORTCUT_PLATFORM), SHORTCUT_PLATFORM) })}
          control={(labelId) => <div className="keyboard-shortcut-controls" role="group" aria-labelledby={labelId}>
            <button type="button" className="button keyboard-shortcut-binding" aria-label={t('KeyboardShortcuts.modify', { action: label(action) })} aria-pressed={recording === action}
              onClick={() => { setRecording(recording === action ? null : action); setError('') }}>
              {recording === action ? t('KeyboardShortcuts.recording') : keys ? <kbd>{keys}</kbd> : t('KeyboardShortcuts.disabled')}
            </button>
            <button type="button" className="button ghost" disabled={binding === null} onClick={() => apply(action, null)}>{t('KeyboardShortcuts.disable')}</button>
            <button type="button" className="button ghost" disabled={!customized} onClick={() => apply(action, undefined)}>{t('KeyboardShortcuts.reset')}</button>
          </div>} />
      })}
    </SettingsGroup> : <p className="muted" role="status">{t('KeyboardShortcuts.noResults')}</p>}
    {recording && <div className="keyboard-shortcut-recording" role="status">
      <span>{t('KeyboardShortcuts.recordingHint', { action: label(recording) })}</span>
      <button type="button" className="button" onClick={() => { setRecording(null); setError('') }}>{t('KeyboardShortcuts.cancel')}</button>
    </div>}
  </div>
}
