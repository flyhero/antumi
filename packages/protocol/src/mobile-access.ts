import type { MobileAccess } from './mobile'
import type { RpcMethod, RpcNotificationName } from './rpc'

// What a phone may call, and with which access (docs/MOBILE.md, 手机能调用什么). Core checks every
// request of a phone's connection against it before any handler runs; a method missing here is
// refused, so a new RPC stays off phones until it is added. The list says which features a phone
// gets, not a security boundary: a phone that operates drives the agents as the desktop does.
export const MOBILE_METHODS: Partial<Record<RpcMethod, MobileAccess>> = {
  'conversations.list': 'view',
  'conversations.get': 'view',
  'conversations.watchChat': 'view',
  'conversations.unwatchChat': 'view',
  'conversations.chatItems': 'view',
  'conversations.messages': 'view',
  'conversations.search': 'view',
  'conversations.chatCatalog': 'view',
  'conversations.configuration': 'view',
  'attachments.stat': 'view',
  'attachments.read': 'view',
  'tasks.list': 'view',
  'usage.list': 'view',
  'projects.recent': 'view',
  'system.environment': 'view',
  'conversations.respond': 'operate',
  'conversations.send': 'operate',
  'conversations.cancelQueued': 'operate',
  'conversations.sendQueued': 'operate',
  'conversations.retryTurn': 'operate',
  'conversations.interrupt': 'operate',
  'conversations.continue': 'operate',
  'conversations.setOption': 'operate',
  // Only in projects already among the recent ones (core checks the paths), as is the next.
  'conversations.create': 'operate',
  // Whether a project is a git repo, for offering a worktree.
  'projects.branches': 'operate',
  // Also only in recent projects, and without a squad (core checks).
  'tasks.create': 'operate',
  // In the mode the task keeps, as a start from its details on the computer.
  'tasks.start': 'operate',
  // Only ever to done (manualMoves).
  'tasks.move': 'operate',
  'tasks.cancel': 'operate',
  'attachments.begin': 'operate',
  'attachments.append': 'operate',
  'attachments.commit': 'operate'
}

export const MOBILE_NOTIFICATIONS: ReadonlySet<RpcNotificationName> = new Set<RpcNotificationName>([
  'conversations.changed',
  'conversations.deleted',
  'conversations.chatItems',
  'conversations.chatDelta',
  'tasks.changed',
  'tasks.deleted',
  'usage.changed'
])

// Whether a device with this access may call the method.
export function mobileMayCall(method: RpcMethod, access: MobileAccess): boolean {
  const needs = MOBILE_METHODS[method]
  return needs !== undefined && (needs === 'view' || access === 'operate')
}
