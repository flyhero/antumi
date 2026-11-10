import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useCore } from './core-store'
import { panelContext } from './panel-window-context'
import { dockGitWithNavigation, dockThisPanel, hideThisPanel, startPanelWindowPage } from './panel-window-page'

let receive: (command: unknown) => void
const dock = vi.fn()
const hide = vi.fn()

beforeEach(() => {
  useCore.setState(useCore.getInitialState(), true)
  vi.stubGlobal('location', { hash: '#panel-git' })
  vi.stubGlobal('document', { documentElement: { dataset: {} } })
  vi.stubGlobal('window', { antumi: {
    onPanelCommand: (listener: (command: unknown) => void) => { receive = listener; return () => {} },
    dockPanelWindow: dock,
    hidePanelWindow: hide
  } })
  dock.mockClear()
  hide.mockClear()
  startPanelWindowPage()
})

afterEach(() => vi.unstubAllGlobals())

it('opens an exact Git checkout and retains it across main-window context updates', () => {
  const location = { project: '/project', workspace: '/project/feature' }
  receive({ type: 'show-git', location })
  receive({ type: 'context', ...panelContext(useCore.getState()), selectedConversationId: 'another' })
  expect(useCore.getState()).toMatchObject({ gitLocation: location, selectedConversationId: 'another' })
})

it('returns the selected checkout when docking or closing the Git window', () => {
  const gitLocation = { project: '/project', workspace: '/project/feature' }
  useCore.setState({ gitLocation })
  dockThisPanel()
  expect(dock).toHaveBeenCalledWith(expect.objectContaining({ docked: 'git', gitLocation, files: null }))
  hideThisPanel()
  expect(hide).toHaveBeenCalledWith(expect.objectContaining({ gitLocation, files: null }))
})

it('hands a Git action back together with its checkout', () => {
  const gitLocation = { project: '/project', workspace: '/project/feature' }
  useCore.setState({ gitLocation })
  dockGitWithNavigation({ type: 'terminal', id: 'terminal' })
  expect(dock).toHaveBeenCalledWith(expect.objectContaining({ docked: 'git', gitLocation, gitNavigation: { type: 'terminal', id: 'terminal' } }))
})
