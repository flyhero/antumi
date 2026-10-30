import { create } from 'zustand'
import type { ResolvedFile } from '@antumi/protocol'
import type { FilesSnapshot } from '../../shared/panel-window'

// The folders the files panel shows, and the conversation they came from when there is one: a
// core without project-files reads files only through a conversation.
export type FileScope = { conversationId: string | null; roots: readonly string[] }

// Open files belong to the folders, so chats on the same checkout share them; a chat with no
// project folder of its own keeps its own.
export function fileScopeKey(scope: FileScope): string {
  return scope.roots.length ? scope.roots.join('\0') : `conversation:${scope.conversationId ?? ''}`
}

export function fileScopeParams(scope: FileScope): { conversationId: string } | { roots: string[] } {
  return scope.conversationId ? { conversationId: scope.conversationId } : { roots: [...scope.roots] }
}

// `dirty`: the editor holds changes not saved to disk.
export type FileTab = { file: ResolvedFile; line: number | null; reveal: number; scrollTop: number; scrollLeft: number; dirty: boolean; preview: boolean }
// `expanded` lists the open folders of the file tree; null until the user folds one, when every project is open.
export type FileTabs = { tabs: FileTab[]; active: string | null; wrap: boolean; tree: boolean; expanded: string[] | null }
export const EMPTY_FILE_TABS: FileTabs = { tabs: [], active: null, wrap: true, tree: true, expanded: null }
export const useFileTabs = create<Record<string, FileTabs>>()(() => ({}))

export function openedFile(state: FileTabs, file: ResolvedFile, line: number | null): FileTabs {
  const existing = state.tabs.find((tab) => tab.file.path === file.path)
  const tab: FileTab = { file, line, reveal: (existing?.reveal ?? 0) + 1, scrollTop: existing?.scrollTop ?? 0, scrollLeft: existing?.scrollLeft ?? 0, dirty: existing?.dirty ?? false, preview: line === null && (existing?.preview ?? /\.svg$/i.test(file.path)) }
  return { ...state, active: file.path, tabs: existing ? state.tabs.map((each) => each.file.path === file.path ? tab : each) : [...state.tabs, tab] }
}

export function closedFile(state: FileTabs, path: string): FileTabs {
  const index = state.tabs.findIndex((tab) => tab.file.path === path)
  const tabs = state.tabs.filter((tab) => tab.file.path !== path)
  return { ...state, tabs, active: state.active === path ? (tabs[Math.min(index, tabs.length - 1)]?.file.path ?? null) : state.active }
}

export function markedDirty(state: FileTabs, path: string, dirty: boolean): FileTabs {
  return state.tabs.some((tab) => tab.file.path === path && tab.dirty !== dirty)
    ? { ...state, tabs: state.tabs.map((tab) => tab.file.path === path ? { ...tab, dirty } : tab) } : state
}

export function expandedFolders(state: FileTabs, roots: readonly string[]): readonly string[] {
  return state.expanded ?? roots
}

export function toggledFolder(state: FileTabs, roots: readonly string[], folder: string): FileTabs {
  const expanded = expandedFolders(state, roots)
  return { ...state, expanded: expanded.includes(folder) ? expanded.filter((each) => each !== folder) : [...expanded, folder] }
}

// Opens `folder` and the folders from its project down to it, so the tree shows what is inside.
export function revealedFolder(state: FileTabs, roots: readonly string[], folder: string): FileTabs {
  const root = [...roots].sort((a, b) => b.length - a.length).find((root) => folder === root || (folder.startsWith(root) && /^[\\/]/.test(folder.slice(root.length))))
  if (!root) return state
  const separator = folder.charAt(root.length)
  const wanted = [root]
  if (folder !== root) for (const part of folder.slice(root.length + 1).split(separator)) wanted.push(`${wanted.at(-1)}${separator}${part}`)
  const expanded = expandedFolders(state, roots)
  const missing = wanted.filter((each) => !expanded.includes(each))
  return missing.length === 0 ? state : { ...state, expanded: [...expanded, ...missing] }
}

export function revealedFile(state: FileTabs, roots: readonly string[], file: string): FileTabs {
  const end = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'))
  return end > 0 ? revealedFolder(state, roots, file.slice(0, end)) : state
}

export function updateFileTabs(id: string, change: (state: FileTabs) => FileTabs): void {
  if (!id) return
  useFileTabs.setState((state) => {
    const before = state[id] ?? EMPTY_FILE_TABS
    const next = change(before)
    return next === before ? state : { [id]: next }
  })
}

export function forgetFileTabs(id: string): void {
  const { [id]: _deleted, ...kept } = useFileTabs.getState()
  useFileTabs.setState(kept, true)
  for (const key of drafts.keys()) if (key.startsWith(`${id}\0`)) drafts.delete(key)
}

// Cached edits plus live readers: a transfer can happen before React unmounts the editor.
export type FileDraft = { text: string; base: string; mtimeMs: number | null }
const drafts = new Map<string, FileDraft>()
const liveDrafts = new Map<string, () => FileDraft | null>()

export function registerFileDraft(id: string, path: string, read: () => FileDraft | null): () => void {
  const key = `${id}\0${path}`
  liveDrafts.set(key, read)
  return () => { if (liveDrafts.get(key) === read) liveDrafts.delete(key) }
}

export function fileDraft(id: string, path: string): FileDraft | undefined {
  return drafts.get(`${id}\0${path}`)
}

export function keepFileDraft(id: string, path: string, draft: FileDraft): void {
  drafts.set(`${id}\0${path}`, draft)
}

export function dropFileDraft(id: string, path: string): void {
  drafts.delete(`${id}\0${path}`)
}

// The files window carries the open tabs and unsaved text, and hands them back when it docks.
export function exportFileTabs(): Pick<FilesSnapshot, 'tabs' | 'drafts'> {
  for (const [key, read] of liveDrafts) {
    const draft = read()
    if (draft) drafts.set(key, draft)
    else drafts.delete(key)
  }
  return {
    tabs: useFileTabs.getState(),
    drafts: [...drafts.entries()].map(([key, draft]) => {
      const at = key.lastIndexOf('\0')
      return { id: key.slice(0, at), path: key.slice(at + 1), text: draft.text, base: draft.base, mtimeMs: draft.mtimeMs }
    })
  }
}

export function importFileTabs(snapshot: Pick<FilesSnapshot, 'tabs' | 'drafts'>): void {
  drafts.clear()
  for (const draft of snapshot.drafts) drafts.set(`${draft.id}\0${draft.path}`, { text: draft.text, base: draft.base, mtimeMs: draft.mtimeMs })
  useFileTabs.setState(snapshot.tabs, true)
}

export function saveFileScroll(id: string, path: string, scrollTop: number, scrollLeft: number): void {
  updateFileTabs(id, (state) => state.tabs.some((tab) => tab.file.path === path && (tab.scrollTop !== scrollTop || tab.scrollLeft !== scrollLeft))
    ? { ...state, tabs: state.tabs.map((tab) => tab.file.path === path ? { ...tab, scrollTop, scrollLeft } : tab) } : state)
}
