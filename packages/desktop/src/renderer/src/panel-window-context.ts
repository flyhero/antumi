import type { PanelContext } from '../../shared/panel-window'
import type { CoreState } from './core-store'

export function panelContext(state: CoreState): PanelContext {
  return {
    section: state.section,
    selectedConversationId: state.selectedConversationId,
    selectedId: state.selectedId,
    selectedDiscussionId: state.selectedDiscussionId,
    settingsOpen: state.settingsOpen,
    overviewOpen: state.overviewOpen,
    inboxOpen: state.inboxOpen,
    gitOpen: state.gitOpen,
    worktreesOpen: state.worktreesOpen,
    routinesOpen: state.routinesOpen
  }
}
