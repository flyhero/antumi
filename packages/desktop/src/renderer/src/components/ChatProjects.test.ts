import { Children, isValidElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { Conversation, createRpcClient, RpcRequest, type ProjectChoice, type RpcConnection } from '@antumi/protocol'
import { ChatProjects } from './ChatProjects'

const hooks = vi.hoisted(() => {
  const effects = new Map<number, { deps?: readonly unknown[]; cleanup?: () => void }>()
  const pending: (() => void)[] = []
  const values = new Map<number, unknown>()
  const state: { rpc: RpcConnection | null } = { rpc: null }
  return { effects, pending, values, state, cursor: 0 }
})

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})
vi.mock('react', async (load) => {
  const react = await load<typeof import('react')>()
  return { ...react,
    useState: (initial: unknown) => {
      const index = hooks.cursor++
      if (!hooks.values.has(index)) hooks.values.set(index, typeof initial === 'function' ? initial() : initial)
      return [hooks.values.get(index), (next: unknown) => hooks.values.set(index, typeof next === 'function' ? next(hooks.values.get(index)) : next)]
    },
    useRef: (initial: unknown) => {
      const index = hooks.cursor++
      if (!hooks.values.has(index)) hooks.values.set(index, { current: initial })
      return hooks.values.get(index)
    },
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
      const index = hooks.cursor++
      const previous = hooks.effects.get(index)
      if (previous && deps && previous.deps?.length === deps.length && deps.every((value, at) => Object.is(value, previous.deps?.[at]))) return
      hooks.pending.push(() => {
        previous?.cleanup?.()
        const cleanup = effect()
        hooks.effects.set(index, { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined })
      })
    }
  }
})
vi.mock('../core-store', () => ({
  useCore: (selector: (state: typeof hooks.state) => unknown) => selector(hooks.state),
  perform: async (action: (rpc: RpcConnection) => Promise<unknown>) => {
    if (!hooks.state.rpc) throw new Error('missing connection')
    return action(hooks.state.rpc)
  }
}))
vi.mock('../desktop-bridge', () => ({ canPickFolder: () => true, pickFolder: vi.fn() }))
vi.mock('../project-choices', async (load) => {
  const actual = await load<typeof import('../project-choices')>()
  return { ...actual, useProjectDescriptions: (paths: readonly string[]) => paths.map(actual.plainProject) }
})

type Row = { children?: ReactNode; className?: string; role?: string; choice?: ProjectChoice; ref?: { current: unknown }; onClick?: () => void; onClose?: () => void; 'aria-checked'?: boolean }
function nodes(tree: ReactNode): Row[] {
  const found: Row[] = []
  Children.forEach(tree, (child) => {
    if (isValidElement<Row>(child)) found.push(child.props, ...nodes(child.props.children))
  })
  return found
}
const conversation = Conversation.parse({ id: '11111111-1111-4111-8111-111111111111', title: 'Chat', titleLocked: false, agent: 'codex', workspacePath: '/code/current', projectPaths: ['/code/current'], managedWorkspace: false, sessionId: null, createdAt: 0, updatedAt: 0 })
function render() {
  hooks.cursor = 0
  const tree = nodes(ChatProjects({ conversation }))
  for (const effect of hooks.pending.splice(0)) effect()
  return tree
}
function find(tree: Row[], check: (row: Row) => boolean): Row {
  const row = tree.find(check)
  if (!row) throw new Error('missing menu row')
  return row
}
beforeEach(() => {
  for (const effect of hooks.effects.values()) effect.cleanup?.()
  hooks.effects.clear()
  hooks.values.clear()
  hooks.pending.length = 0
})

it('shows recent sources while copies are still loading and keeps picks through the refresh', async () => {
  const sent: ReturnType<typeof RpcRequest.parse>[] = []
  const client = createRpcClient((wire) => sent.push(RpcRequest.parse(JSON.parse(wire))))
  hooks.state.rpc = { ...client, features: ['conversation-projects', 'project-choices', 'project-suggestions'], close() {}, closed: new Promise(() => {}) }
  const button = find(render(), (row) => row.className === 'chat-projects')
  if (!button.ref) throw new Error('missing trigger ref')
  button.ref.current = { getBoundingClientRect: () => ({ left: 0, top: 100 }) }
  button.onClick?.()
  render()
  const source = { path: '/code/recent', worktree: false, source: null, branch: null }
  const copy = { path: '/worktrees/recent', worktree: true, source: source.path, branch: 'old' }
  for (const request of sent.filter((request) => request.method === 'projects.suggestions')) {
    client.receive(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { paths: [source.path, copy.path], choices: [source, copy] } }))
  }
  await vi.waitFor(() => expect(sent.some((request) => request.method === 'projects.describe')).toBe(true))
  const recent = find(render(), (row) => row.role === 'menuitemcheckbox' && nodes(row.children).some((child) => child.choice?.path === source.path))
  expect(recent['aria-checked']).toBe(false)
  recent.onClick?.()
  find(render(), (row) => row.className === 'menu-item project-copies-toggle').onClick?.()
  for (const request of sent.filter((request) => request.method === 'projects.describe')) {
    client.receive(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: [{ ...copy, branch: 'new' }] }))
  }
  await vi.waitFor(() => expect(render().some((row) => row.choice?.branch === 'new')).toBe(true))
  const updated = render()
  expect(find(updated, (row) => row.role === 'menuitemcheckbox' && nodes(row.children).some((child) => child.choice?.path === source.path))['aria-checked']).toBe(true)
  find(updated, (row) => typeof row.onClose === 'function').onClose?.()
  expect(sent.find((request) => request.method === 'conversations.setAdditionalProjects')).toMatchObject({ params: { id: conversation.id, projectPaths: [source.path] } })
})
