import { t } from '../i18n'
import { setBrowserMaximized, toggleBrowserPanel, useCore } from '../core-store'
import { BrowserPanel, BrowserTabStrip } from './BrowserPanel'
import { CloseIcon, MaximizeIcon, RestoreIcon } from './icons'
import { usePanelShortcut } from '../panel-shortcuts'

// Every hosted tab, the agents' and the user's own. The dock decides whether this sits above the
// terminal or fills the available tool area. Hiding it leaves the browser running.
export function BrowserSidePanel() {
  const shortcut = usePanelShortcut('toggle-browser')
  const maximized = useCore((s) => s.browserMaximized)
  return (
    <aside className="side-panel browser-side-panel" aria-label={t('BrowserSidePanel.browser')} data-maximized={maximized || undefined}>
      <header className="terminal-panel-header browser-side-header">
        <BrowserTabStrip />
        <button
          type="button"
          className="tool-button"
          aria-label={maximized ? t('BrowserSidePanel.restore') : t('BrowserSidePanel.maximize')}
          data-tooltip={maximized ? t('BrowserSidePanel.restore') : t('BrowserSidePanel.maximize')}
          onClick={() => setBrowserMaximized(!maximized)}
        >
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button type="button" className="tool-button" aria-label={t('BrowserSidePanel.hideBrowser')} data-tooltip={[t('BrowserSidePanel.hideBrowserKeepsRunning'), shortcut].filter(Boolean).join(' ')} onClick={toggleBrowserPanel}>
          <CloseIcon />
        </button>
      </header>
      <BrowserPanel />
    </aside>
  )
}
