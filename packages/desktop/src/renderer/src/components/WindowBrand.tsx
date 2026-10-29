import { t } from '../i18n'
import { setPreference, usePreferences } from '../preferences'
import { useShortcutLabel } from '../keyboard-shortcuts'
import { SidebarIcon } from './icons'

export function toggleSidebar(): void {
  setPreference('sidebarHidden', !usePreferences.getState().sidebarHidden)
}

// The app's name and the sidebar's switch, in the title bar beside the traffic lights. It stays
// put whether the sidebar shows or not, so the switch is always where it was.
export function WindowBrand() {
  const hidden = usePreferences((s) => s.sidebarHidden)

  const shortcut = useShortcutLabel('toggle-sidebar')

  const label = hidden ? t('WindowBrand.expandSidebar') : t('WindowBrand.collapseSidebar')
  return (
    <div className="window-brand">
      <span className="window-brand-name">Antumi</span>
      <button
        type="button"
        className="icon-button window-brand-toggle"
        aria-label={label}
        aria-pressed={!hidden}
        data-tooltip={[label, shortcut].filter(Boolean).join(' · ')}
        data-tooltip-align="start"
        onClick={toggleSidebar}
      >
        <SidebarIcon />
      </button>
    </div>
  )
}
