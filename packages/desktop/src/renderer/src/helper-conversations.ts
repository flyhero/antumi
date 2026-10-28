import { useEffect } from 'react'
import { agentDescriptor, canHaveHelper, quickModel, type ChatCatalog, type ChatPermissionMode, type Conversation, type RpcConnection } from '@antumi/protocol'
import { perform, useCore } from './core-store'
import { addQuote } from './chat-quotes'
import { usePreferences } from './preferences'

// The model provider a helper runs on: its parent's, where the parent's agent runs on one.
export function helperProvider(parent: Pick<Conversation, 'modelProvider' | 'route'>): string | undefined {
  return parent.route?.reason === 'served' ? parent.modelProvider ?? undefined : undefined
}

// On a provider, its small model as the agent names it (Claude adds [1m], OpenCode the provider).
export function helperModel(parent: Conversation, catalog: ChatCatalog | null): string | null {
  const providerId = helperProvider(parent)
  const provider = providerId ? useCore.getState().modelProviders.find((each) => each.id === providerId) : undefined
  if (provider) {
    const small = provider.smallModel
    return catalog?.models.find((each) => each.id === small || each.id === `${small}[1m]` || each.id.endsWith(`/${small}`))?.id ?? null
  }
  return usePreferences.getState().quickModels[parent.agent] || quickModel(agentDescriptor(parent.agent).quickModels, catalog)
}

export function helperFor(conversations: Readonly<Record<string, Conversation>>, parentId: string): Conversation | null {
  return Object.values(conversations).find((conversation) => conversation.helperOf === parentId) ?? null
}

export function helperWaiting(conversations: Readonly<Record<string, Conversation>>, parentId: string): boolean {
  return helperFor(conversations, parentId)?.chat?.turn === 'awaiting'
}

export function useHelperSupported(parent: Conversation | undefined): boolean {
  const supported = useCore((state) => state.rpc?.features.includes('conversation-helper') ?? false)
  return supported && Boolean(parent && canHaveHelper(parent))
}

function remember(conversation: Conversation): Conversation {
  useCore.setState((state) => ({ conversations: { ...state.conversations, [conversation.id]: conversation } }))
  return conversation
}

async function readHelper(rpc: RpcConnection, parentId: string): Promise<Conversation | null> {
  let changed: Conversation | null = null
  const deleted = new Set<string>()
  const offChanged = rpc.on('conversations.changed', ({ conversation }) => { if (conversation.helperOf === parentId) changed = conversation })
  const offDeleted = rpc.on('conversations.deleted', ({ id }) => deleted.add(id))
  try {
    const found = await rpc.call('conversations.helper', { id: parentId })
    const latest = changed ?? found
    return latest && !deleted.has(latest.id) ? latest : null
  } finally { offChanged(); offDeleted() }
}

export function useHelper(parentId: string | null): Conversation | null {
  const rpc = useCore((state) => state.rpc)
  const helper = useCore((state) => parentId ? helperFor(state.conversations, parentId) : null)
  useEffect(() => {
    if (!parentId || !rpc?.features.includes('conversation-helper')) return
    let current = true
    void readHelper(rpc, parentId).then((found) => {
      if (current && found && useCore.getState().rpc === rpc) remember(found)
    }).catch(() => {})
    return () => { current = false }
  }, [rpc, parentId])
  return helper
}

// A double click shares discovery and creation; uniqueness is also enforced by core.
const pending = new WeakMap<RpcConnection, Map<string, Promise<Conversation | null>>>()
export function ensureHelper(parent: Conversation, choice?: { model: string | null; effort: string | null; permissionMode: ChatPermissionMode }): Promise<Conversation | null> {
  const rpc = useCore.getState().rpc
  if (!rpc?.features.includes('conversation-helper') || !canHaveHelper(parent)) return Promise.resolve(null)
  const known = helperFor(useCore.getState().conversations, parent.id)
  if (known) return Promise.resolve(known)
  let creates = pending.get(rpc)
  if (!creates) { creates = new Map(); pending.set(rpc, creates) }
  const existing = creates.get(parent.id)
  if (existing) return existing
  const result = perform(async () => {
    const found = await readHelper(rpc, parent.id)
    if (found) return remember(found)
    const providerId = helperProvider(parent)
    const catalog = choice ? null : await rpc.call('conversations.chatCatalog', { agent: parent.agent, ...(providerId ? { modelProvider: providerId } : {}) })
    const model = choice ? choice.model : helperModel(parent, catalog)
    const created = await rpc.call('conversations.create', {
      agent: parent.agent, projectPaths: parent.projectPaths, helperOf: parent.id,
      deferStart: true, permissionMode: choice?.permissionMode ?? 'ask', allowBypass: true,
      ...(model ? { model } : {}), ...(choice?.effort ? { effort: choice.effort } : {})
    })
    return remember(created)
  }).finally(() => creates.delete(parent.id))
  creates.set(parent.id, result)
  return result
}

export function focusChatInput(id: string): void {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`.chat-view[data-conversation-id="${id}"] .chat-input`)?.focus())
}

export async function handToHelper(parent: Conversation, selection: string, inspector: 'task' | 'conversation'): Promise<void> {
  if (!selection.trim()) return
  const helper = await ensureHelper(parent)
  if (!helper) return
  addQuote(helper.id, null, selection)
  useCore.setState(inspector === 'task'
    ? { inspectorOpen: true, taskInspectorTab: 'helper' }
    : { conversationInspectorOpen: true, conversationInspectorTab: 'helper' })
  focusChatInput(helper.id)
}
