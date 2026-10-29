import { useEffect, useState } from 'react'
import { ShortcutAction, SHORTCUTS, SHORTCUT_GROUPS, SHORTCUT_GROUP_LABELS, SHORTCUT_SCOPE_LABELS, shortcutBindings, shortcutConflict, reservedActionShortcut, shortcutBinding, shortcutLabel, formatShortcut, withShortcut, type ShortcutBinding } from '../../../shared/keyboard-shortcuts'
import { messageSearchText, t } from '../i18n'
import { SHORTCUT_PLATFORM } from '../keyboard-shortcuts'
import { setPreference, usePreferences } from '../preferences'
import { SettingsGroup, SettingsRow } from './SettingsControls'
import { SearchIcon } from './icons'
import './keyboard-shortcut-settings.css'

export function KeyboardShortcutSettings() {
  const settings = usePreferences((state) => state.panelShortcuts)
  const [query, setQuery] = useState('')
  const [recording, setRecording] = useState<ShortcutAction | null>(null)
  const [error, setError] = useState('')
  const label = (action: ShortcutAction) => t(SHORTCUTS[action].label)

  const apply = (action: ShortcutAction, binding: ShortcutBinding | null | undefined) => {
    const current = usePreferences.getState().panelShortcuts
    const next = binding === undefined ? SHORTCUTS[action].defaults(SHORTCUT_PLATFORM) : binding === null ? [] : [binding]
    const conflict = shortcutConflict(current, SHORTCUT_PLATFORM, action, next)
    if (conflict) {
      setError(t('KeyboardShortcuts.conflict', { action: label(conflict) }))
      return false
    }
    if (binding && reservedActionShortcut(action, binding, SHORTCUT_PLATFORM)) { setError(t('KeyboardShortcuts.reserved')); return false }
    setPreference('panelShortcuts', withShortcut(current, SHORTCUT_PLATFORM, action, binding))
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
      apply(recording, binding)
    }
    window.addEventListener('keydown', capture, true)
    return () => window.removeEventListener('keydown', capture, true)
  }, [recording])

  const needle = query.trim().toLowerCase()
  const actions = ShortcutAction.options.filter((action) => {
    const bindings = shortcutBindings(settings, SHORTCUT_PLATFORM, action)
    const keys = bindings.map((binding) => `${binding.key} ${binding.ctrl ? 'ctrl control' : ''} ${binding.meta ? 'cmd command' : ''} ${binding.alt ? 'alt option' : ''} ${binding.shift ? 'shift' : ''}`).join(' ')
    return `${messageSearchText(label(action))} ${messageSearchText(t(SHORTCUT_GROUP_LABELS[SHORTCUTS[action].group]))} ${messageSearchText(t(SHORTCUT_SCOPE_LABELS[SHORTCUTS[action].scope]))} ${keys} ${shortcutLabel(settings, SHORTCUT_PLATFORM, action)}`.toLowerCase().includes(needle)
  })
  const changed = ShortcutAction.options.some((action) => settings[SHORTCUT_PLATFORM]?.[action] !== undefined)
  const primary = SHORTCUT_PLATFORM === 'darwin' ? '⌘' : 'Ctrl+'
  const references = [
    ['KeyboardShortcuts.copy', `${primary}C`], ['KeyboardShortcuts.cut', `${primary}X`], ['KeyboardShortcuts.paste', `${primary}V`],
    ['KeyboardShortcuts.undo', `${primary}Z`], ['KeyboardShortcuts.redo', SHORTCUT_PLATFORM === 'darwin' ? '⇧⌘Z' : 'Ctrl+Y'],
    ['KeyboardShortcuts.newline', 'Shift+Enter'], ['KeyboardShortcuts.dismiss', 'Esc'], ['KeyboardShortcuts.menuNavigation', '↑ / ↓ / Enter'],
    ['KeyboardShortcuts.terminalInterrupt', 'Ctrl+C']
  ] as const
  const visibleReferences = references.filter(([key, keys]) => `${messageSearchText(t(key))} ${keys}`.toLowerCase().includes(needle))

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
    <p className="muted keyboard-shortcut-count">{t('KeyboardShortcuts.count', { count: ShortcutAction.options.length })}</p>
    <p className="muted keyboard-shortcut-hint">{t('KeyboardShortcuts.hint')}</p>
    {error && !recording && <p className="keyboard-shortcut-error" role="alert">{error}</p>}
    {SHORTCUT_GROUPS.map((group) => {
      const groupActions = actions.filter((action) => SHORTCUTS[action].group === group)
      return groupActions.length > 0 && <SettingsGroup key={group} title={t(SHORTCUT_GROUP_LABELS[group])}>
      {groupActions.map((action) => {
        const keys = shortcutLabel(settings, SHORTCUT_PLATFORM, action)
        const customized = settings[SHORTCUT_PLATFORM]?.[action] !== undefined
        return <SettingsRow key={action} label={label(action)}
          description={`${t(SHORTCUT_SCOPE_LABELS[SHORTCUTS[action].scope])} · ${t('KeyboardShortcuts.default', { keys: SHORTCUTS[action].defaults(SHORTCUT_PLATFORM).map((binding) => formatShortcut(binding, SHORTCUT_PLATFORM).replace(/Escape$/, 'Esc')).join(' / ') })}`}
          control={(labelId) => <div className="keyboard-shortcut-controls" role="group" aria-labelledby={labelId}>
            <button type="button" className="button keyboard-shortcut-binding" aria-label={t('KeyboardShortcuts.modify', { action: label(action) })} aria-pressed={recording === action}
              onClick={() => { setRecording(recording === action ? null : action); setError('') }}>
              {recording === action ? t('KeyboardShortcuts.recording') : keys ? <kbd>{keys}</kbd> : t('KeyboardShortcuts.disabled')}
            </button>
            <button type="button" className="button ghost" disabled={!keys} onClick={() => apply(action, null)}>{t('KeyboardShortcuts.disable')}</button>
            <button type="button" className="button ghost" disabled={!customized} onClick={() => apply(action, undefined)}>{t('KeyboardShortcuts.reset')}</button>
          </div>} />
      })}
    </SettingsGroup>})}
    {visibleReferences.length > 0 && <SettingsGroup title={t('KeyboardShortcuts.groupEditing')}>
      {visibleReferences.map(([key, keys]) => <SettingsRow key={key} label={t(key)} description={t('KeyboardShortcuts.nativeEditing')}
        control={() => <kbd className="keyboard-shortcut-reference">{keys}</kbd>} />)}
    </SettingsGroup>}
    {actions.length === 0 && visibleReferences.length === 0 && <p className="muted" role="status">{t('KeyboardShortcuts.noResults')}</p>}
    {recording && <div className="keyboard-shortcut-recording" role="status">
      <div><span>{t('KeyboardShortcuts.recordingHint', { action: label(recording) })}</span>
        {error && <p className="keyboard-shortcut-error" role="alert">{error}</p>}
      </div>
      <button type="button" className="button" onClick={() => { setRecording(null); setError('') }}>{t('KeyboardShortcuts.cancel')}</button>
    </div>}
  </div>
}
