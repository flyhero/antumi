import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { StateCreator } from 'zustand'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRpcClient, type RpcConnection, type SourceUpdateSummary } from '@antumi/protocol'
import { useCore } from '../core-store'
import { SourceCommentBadge, SourceUpdatesPanel } from './SourceUpdatesPanel'

vi.mock('zustand', async (importOriginal) => {
  const zustand = await importOriginal<typeof import('zustand')>()
  return { ...zustand, create: <T>() => (initializer: StateCreator<T>) => {
    const store = zustand.create(initializer)
    return Object.assign((selector: (state: T) => unknown) => selector(store.getState()), store)
  } }
})

const target = { kind: 'conversation', id: 'one' } as const
const initial: SourceUpdateSummary = { revision: 'one', target, watching: true, active: true, supported: true, unread: 2, pending: 3, through: 9, refreshedAt: 1000, refreshing: false, problem: null, sendBlocker: null }
const render = () => renderToStaticMarkup(createElement(SourceUpdatesPanel, { target }))
function connect(features = ['source-comments-v1']) {
  const client = createRpcClient(() => {})
  const rpc: RpcConnection = { ...client, features, close: () => {}, closed: new Promise(() => {}) }
  useCore.setState({ rpc, sourceUpdates: { 'conversation:one': initial } })
}
beforeEach(() => { useCore.setState(useCore.getInitialState(), true); connect() })

describe('issue update entry', () => {
  it('keeps the unread count separate from comments not sent to the agent', () => {
    const html = render()
    expect(html).toContain('2 条新评论')
    expect(html).toContain('3 条尚未交给 Agent')
    expect(html).toContain('带新评论继续排查')
    expect(renderToStaticMarkup(createElement(SourceCommentBadge, { target }))).toContain('2 条新评论')
  })
  it('hides the feature on an older core', () => {
    connect([])
    expect(render()).toBe('')
  })
  it('disables sending while the conversation is archived', () => {
    useCore.setState({ sourceUpdates: { 'conversation:one': { ...initial, active: false, sendBlocker: '请先取消归档' } } })
    expect(render()).toContain('disabled="" title="请先取消归档"')
    expect(render()).toContain('同步已暂停')
  })
})
