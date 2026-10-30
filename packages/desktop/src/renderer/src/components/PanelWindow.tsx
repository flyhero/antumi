import type { PanelKind } from '../../../shared/panel-window'
import { useCore } from '../core-store'
import { usePanelWindowShortcuts } from '../panel-shortcuts'
import { BrowserSidePanel } from './BrowserSidePanel'
import { FilesPanel } from './FilesPanel'
import { SearchPalette } from './SearchPalette'
import { TerminalPanel } from './TerminalPanel'
import { ErrorToast } from './ErrorToast'
import { ProjectTrustDialog } from './ProjectTrustDialog'
import { useOccludesBrowser } from '../browser-occlusion'

// One panel, filling a window that can move to another display or become its own desktop.
export function PanelWindow({ kind }: { kind: PanelKind }) {
  const search = useCore((state) => state.search)
  const error = useCore((state) => state.error)
  useOccludesBrowser(Boolean(error))
  usePanelWindowShortcuts(kind)
  return (
    <div className="app panel-window">
      {kind === 'browser' ? <BrowserSidePanel windowed /> : kind === 'files' ? <FilesPanel windowed /> : <TerminalPanel windowed />}
      {kind === 'files' && search && <SearchPalette initial={search} />}
      <ProjectTrustDialog />
      {error && <ErrorToast message={error} />}
    </div>
  )
}
