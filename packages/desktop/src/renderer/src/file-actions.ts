import { t } from './i18n'
import type { ResolvedFile } from '@antumi/protocol'
import { perform, showFilesPanel, showError, useCore } from './core-store'
import { canRevealFile, openFile, revealFile } from './desktop-bridge'
import { fileCandidates, type FileReference } from './file-links'
import { fileScopeKey, fileScopeParams, openedFile, updateFileTabs, type FileScope } from './file-tabs'

// A chat's files: its conversation's folders, and the inspector beside it.
export type ChatFileScope = FileScope & { conversationId: string; inspector: 'task' | 'conversation' }
export const FILE_MANAGER = () => window.antumi?.platform === 'darwin' ? t('fileActions.finder') : window.antumi?.platform === 'win32' ? t('fileActions.fileExplorer') : t('fileActions.fileManager')

export function filePreviewSupported(): boolean {
  return useCore.getState().rpc?.features.includes('file-preview') ?? false
}

export function useFilePreviewSupported(): boolean {
  return useCore((state) => state.rpc?.features.includes('file-preview') ?? false)
}

export function showResolvedFile(scope: FileScope, file: ResolvedFile, line: number | null): void {
  updateFileTabs(fileScopeKey(scope), (state) => openedFile(state, file, line))
  showFilesPanel(scope)
}

export async function resolveChatFile(scope: FileScope, reference: FileReference): Promise<ResolvedFile | null> {
  return perform(async (rpc) => {
    const found = await rpc.call('files.resolve', { ...fileScopeParams(scope), path: reference.path })
    if (!found) showError(t('ChatMarkdown.fileNotFound', { value1: reference.path }))
    return found
  })
}

export async function showChatFile(scope: FileScope, reference: FileReference): Promise<void> {
  if (filePreviewSupported()) {
    const found = await resolveChatFile(scope, reference)
    if (found) showResolvedFile(scope, found, reference.line)
  } else if (canRevealFile()) {
    if (await revealFile(fileCandidates(reference.path, scope.roots))) return
    const found = useCore.getState().rpc?.features.includes('find-file')
      ? await perform((rpc) => rpc.call('projects.findFile', { roots: [...scope.roots], path: reference.path })) : null
    if (found?.length && await revealFile(found)) return
    showError(t('ChatMarkdown.fileNotFound', { value1: reference.path }))
  }
}

export async function revealResolvedFile(file: ResolvedFile): Promise<void> {
  if (!await revealFile([file.path])) showError(t('fileActions.cannotShowIn', { FILE_MANAGER: FILE_MANAGER(), value2: file.path }))
}

export async function openResolvedFile(file: ResolvedFile): Promise<void> {
  const error = await openFile(file.path)
  if (error) showError(error)
}

export async function copyFileText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    showError(t('fileActions.copyFailedTryAgain'))
  }
}
