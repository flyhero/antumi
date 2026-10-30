import { z } from 'zod'
import { BrowserTab, ChatImage, ResolvedFile } from '@antumi/protocol'

// Browser, files and terminal can leave the main window's dock and fill a window of their own.
export const PanelKind = z.enum(['browser', 'files', 'terminal'])
export type PanelKind = z.infer<typeof PanelKind>

export function panelWindowHash(kind: PanelKind): string {
  return `panel-${kind}`
}

export function panelKindFromHash(hash: string): PanelKind | null {
  const name = hash.startsWith('#') ? hash.slice(1) : hash
  const parsed = PanelKind.safeParse(name.slice('panel-'.length))
  return name.startsWith('panel-') && parsed.success ? parsed.data : null
}

const FileScopeMessage = z.object({
  conversationId: z.string().nullable(),
  roots: z.array(z.string())
})

const FileDraftMessage = z.object({
  id: z.string(),
  path: z.string(),
  text: z.string(),
  base: z.string(),
  mtimeMs: z.number().nullable()
})

const FileTabMessage = z.object({
  file: ResolvedFile,
  line: z.number().nullable(),
  reveal: z.number(),
  scrollTop: z.number(),
  scrollLeft: z.number(),
  dirty: z.boolean(),
  preview: z.boolean()
})

const FileTabsMessage = z.object({
  tabs: z.array(FileTabMessage),
  active: z.string().nullable(),
  wrap: z.boolean(),
  tree: z.boolean(),
  expanded: z.array(z.string()).nullable()
})

// Open files and unsaved edits move with the files window, then come back when it docks.
export const FilesSnapshot = z.object({
  tabs: z.record(z.string(), FileTabsMessage),
  drafts: z.array(FileDraftMessage),
  filesFolders: z.object({ scope: FileScopeMessage, context: z.string() }).nullable()
})
export type FilesSnapshot = z.infer<typeof FilesSnapshot>

export const PanelContext = z.object({
  section: z.enum(['tasks', 'conversations', 'discussions', 'squads']),
  selectedConversationId: z.string().nullable(),
  selectedId: z.string().nullable(),
  selectedDiscussionId: z.string().nullable(),
  settingsOpen: z.boolean(),
  overviewOpen: z.boolean(),
  inboxOpen: z.boolean(),
  gitOpen: z.boolean(),
  worktreesOpen: z.boolean(),
  routinesOpen: z.boolean()
})
export type PanelContext = z.infer<typeof PanelContext>

// What the main window tells a panel window, and what a panel window applies to its own store.
export const PanelCommand = z.discriminatedUnion('type', [
  PanelContext.extend({ type: z.literal('context') }),
  z.object({ type: z.literal('focus-address') }),
  z.object({ type: z.literal('focus-conversation'), conversationId: z.string() }),
  z.object({ type: z.literal('focus-tab'), tabId: z.string() }),
  z.object({ type: z.literal('select-terminal'), id: z.string().nullable() }),
  z.object({ type: z.literal('show-files'), scope: FileScopeMessage.nullable().optional() }),
  z.object({ type: z.literal('open-file'), scope: FileScopeMessage, file: ResolvedFile, line: z.number().nullable() }),
  z.object({ type: z.literal('reveal-folder'), scope: FileScopeMessage, folder: z.string() }),
  z.object({ type: z.literal('files-state'), snapshot: FilesSnapshot })
])
export type PanelCommand = z.infer<typeof PanelCommand>

// What a panel window hands back as it closes, so unsaved files are not left behind in it.
export const PanelHandoff = z.object({
  context: PanelContext,
  files: FilesSnapshot.nullable(),
  terminalId: z.string().nullable(),
  browserTabId: z.string().nullable()
})
export type PanelHandoff = z.infer<typeof PanelHandoff>

// Sent when a panel window closes: a dock puts that panel back on the main window.
export const PanelDockPayload = PanelHandoff.extend({ docked: PanelKind })
export type PanelDockPayload = z.infer<typeof PanelDockPayload>

export const PanelBrowserContext = z.object({ tab: BrowserTab, text: z.string(), images: z.array(ChatImage) })
export type PanelBrowserContext = z.infer<typeof PanelBrowserContext>
export const PanelQuote = z.object({ conversationId: z.string().min(1), text: z.string().min(1).max(100_000) })

export const PanelDelivery = z.object({
  id: z.number().int().positive(),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('handoff'), kind: PanelKind, docked: z.boolean(), handoff: PanelHandoff }),
    PanelBrowserContext.extend({ type: z.literal('browser-context') }),
    PanelQuote.extend({ type: z.literal('quote') })
  ])
})
export type PanelDelivery = z.infer<typeof PanelDelivery>
export const PanelReceipt = z.object({ id: z.number().int().positive(), accepted: z.boolean() })

export const PanelWindowsMessage = z.object({ open: z.array(PanelKind), deliveries: z.array(PanelDelivery) })
export type PanelWindowsMessage = z.infer<typeof PanelWindowsMessage>

export type WorkArea = { x: number; y: number; width: number; height: number }

// A panel window prefers a display the main window is not on, so a small screen can keep the chat
// and the panel a swipe apart. Later windows cascade. On the only display it sits slightly aside.
export function panelWindowBounds(main: WorkArea | null, others: readonly WorkArea[], slot: number): WorkArea {
  const target = others[0] ?? main
  const width = 1100
  const height = 760
  if (!target) return { x: 80 + slot * 28, y: 60, width, height }
  const fitted = { width: Math.min(width, target.width), height: Math.min(height, target.height) }
  const cascade = slot * 28
  const x = target.x + Math.max(0, Math.round((target.width - fitted.width) / 2)) + (others.length > 0 ? cascade : 48)
  const y = target.y + Math.max(0, Math.round((target.height - fitted.height) / 2)) + (others.length > 0 ? cascade : 24)
  return {
    x: Math.min(x, target.x + Math.max(0, target.width - fitted.width)),
    y: Math.min(y, target.y + Math.max(0, target.height - fitted.height)),
    ...fitted
  }
}
