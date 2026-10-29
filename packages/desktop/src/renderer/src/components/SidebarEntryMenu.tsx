import { useState, type MouseEvent, type ReactNode } from 'react'
import { openSidebarSettings, useCore } from '../core-store'
import { t } from '../i18n'
import { hideFromSidebar, inboxLocked, type SidebarEntry } from '../sidebar-entries'
import { ContextMenu, MenuItem, menuPoint, type MenuPoint } from './ContextMenu'
import { SlidersIcon } from './icons'

// Right-click on one of the sidebar's optional entries: hide it, or go where they are all set. The
// inbox a plugin keeps has no menu, as there is nothing to hide.
export function useSidebarEntryMenu(entry: SidebarEntry): { onContextMenu: ((event: MouseEvent<HTMLElement>) => void) | undefined; menu: ReactNode } {
  const [at, setAt] = useState<MenuPoint | null>(null)
  const locked = useCore((s) => entry === 'inbox' && inboxLocked(s.sources))
  if (locked) return { onContextMenu: undefined, menu: null }
  const close = () => setAt(null)
  return {
    onContextMenu: (event) => {
      event.preventDefault()
      setAt(menuPoint(event))
    },
    menu: at && (
      <ContextMenu at={at} label={t('SidebarEntryMenu.label')} onClose={close}>
        <MenuItem label={t('SidebarEntryMenu.hide')} onSelect={() => { close(); hideFromSidebar(entry) }} />
        <MenuItem label={t('SidebarEntryMenu.settings')} icon={<SlidersIcon />} onSelect={() => { close(); openSidebarSettings() }} />
      </ContextMenu>
    )
  }
}
