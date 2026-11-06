import type { EditorState } from '@codemirror/state'
import { addQuote } from './chat-quotes'
import { showError, useFilesContextScope } from './core-store'
import { focusChatInput } from './helper-conversations'
import { quoteFromPanel, thisPanelKind } from './panel-window-page'
import type { FileScope } from './file-tabs'
import { t } from './i18n'

export type FilePassage = { text: string; line: number; endLine: number }

// Read the document, including selections spanning lines outside CodeMirror's viewport.
export function selectedFilePassage(state: EditorState): FilePassage | null {
  const { from, to, empty } = state.selection.main
  if (empty) return null
  const text = state.sliceDoc(from, to)
  if (!text.trim()) return null
  return { text, line: state.doc.lineAt(from).number, endLine: state.doc.lineAt(Math.max(from, to - 1)).number }
}

export function fileQuoteText(path: string, passage?: { text: string; line?: number; endLine?: number }): string {
  const location = passage?.line ? `:${passage.line}${passage.endLine && passage.endLine !== passage.line ? `-${passage.endLine}` : ''}` : ''
  return `${path}${location}${passage ? `\n${passage.text}` : ''}`
}

export function useFileQuoteTarget(scope: FileScope): string | null {
  const context = useFilesContextScope()
  return context?.conversationId ?? scope.conversationId
}

// A detached file window delivers to the main window's quote store, with a receipt.
export async function quoteFileInChat(conversationId: string, text: string, note = ''): Promise<boolean> {
  try {
    const accepted = thisPanelKind()
      ? await quoteFromPanel(conversationId, text, note)
      : addQuote(conversationId, null, text, note) !== null
    if (!accepted) showError(t('PanelWindow.sendFailed'))
    else if (!thisPanelKind()) focusChatInput(conversationId)
    return accepted
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error))
    return false
  }
}
