import type { PanelKind } from '../../../shared/panel-window'
import { canOpenPanelWindow } from '../desktop-bridge'
import { t } from '../i18n'
import { detachPanel } from '../panel-window-host'
import { dockThisPanel } from '../panel-window-page'
import { PopInIcon, PopOutIcon } from './icons'

// Opens this panel in a window of its own, or puts that window back in the dock.
export function PanelWindowButton({ kind, windowed }: { kind: PanelKind; windowed: boolean }) {
  if (windowed) {
    return (
      <button type="button" className="tool-button" aria-label={t('PanelWindow.returnToMain')} data-tooltip={t('PanelWindow.returnToMainHint')} onClick={dockThisPanel}>
        <PopInIcon />
      </button>
    )
  }
  if (!canOpenPanelWindow()) return null
  return (
    <button type="button" className="tool-button" aria-label={t('PanelWindow.openSeparate')} data-tooltip={t('PanelWindow.openSeparateHint')} onClick={() => detachPanel(kind)}>
      <PopOutIcon />
    </button>
  )
}
