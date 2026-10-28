import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand'
import { Conversation, Task, createRpcClient, type Routine, type RpcConnection, type ScheduledRun } from '@antumi/protocol'
import { useCore } from '../core-store'
import { useQuotes } from '../chat-quotes'
import { receiveTodos } from '../conversation-todos'
import { OverviewEntry } from './OverviewEntry'
import { OverviewView } from './OverviewView'
import { SchedulePicker } from './SchedulePicker'

// Keep the existing SSR markup checks; capture handlers to exercise the same RPC and navigation paths.
const captured = vi.hoisted(() => {
  const nodes: { type: unknown; props: Record<string, unknown> }[] = []
  const layouts: (() => void)[] = []
  return { nodes, values: new Map<number, unknown>(), cursor: 0, layouts }
})
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  return { ...react, useLayoutEffect: (effect: () => void) => captured.layouts.push(effect), useState: (initial: unknown) => {
    const index = captured.cursor++
    if (!captured.values.has(index)) captured.values.set(index, typeof initial === 'function' ? initial() : initial)
    return [captured.values.get(index), (next: unknown) => captured.values.set(index, typeof next === 'function' ? next(captured.values.get(index)) : next)]
  } }
})
vi.mock('react/jsx-runtime', async (importOriginal) => {
  const runtime = await importOriginal<typeof import('react/jsx-runtime')>()
  const capture = (...args: Parameters<typeof runtime.jsx>) => {
    const [type, props] = args
    if (props && typeof props === 'object') captured.nodes.push({ type, props: Object.fromEntries(Object.entries(props)) })
    return runtime.jsx(...args)
  }
  return { ...runtime, jsx: capture, jsxs: capture }
})
vi.mock('react/jsx-dev-runtime', async (importOriginal) => {
  const runtime = await importOriginal<typeof import('react/jsx-dev-runtime')>()
  return { ...runtime, jsxDEV: (...args: Parameters<typeof runtime.jsxDEV>) => {
    const [type, props] = args
    if (props && typeof props === 'object') captured.nodes.push({ type, props: Object.fromEntries(Object.entries(props)) })
    return runtime.jsxDEV(...args)
  } }
})
vi.mock('zustand', async (importOriginal) => {
  const zustand = await importOriginal<typeof import('zustand')>()
  return { ...zustand, create: <T>() => (initializer: StateCreator<T>) => {
    const store = zustand.create(initializer)
    return Object.assign((selector: (state: T) => unknown) => selector(store.getState()), store)
  } }
})
const now = new Date(2026, 9, 14, 12).getTime()
const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const task = (patch: object = {}) => Task.parse({ id: 'task', title: '运行任务', details: '', status: 'running', repos: [], dependsOn: [], agent: 'codex', createdAt: now, updatedAt: now, ...patch })
const chat = (patch: object = {}) => Conversation.parse({ id: id(1), title: '提交修复', titleLocked: false, agent: 'claude', workspacePath: '/w', projectPaths: [], managedWorkspace: false, sessionId: 's', createdAt: now, updatedAt: now, chat: { turn: 'idle' }, ...patch })
const run = (patch: Partial<ScheduledRun> = {}): ScheduledRun => ({ id: id(2), title: '预约工作', agent: 'codex', target: { kind: 'task', taskId: 'task' }, notBefore: now + 3600_000, resetsAt: null, status: 'waiting', conversationId: null, attempts: 0, error: null, createdAt: now, settledAt: null, ...patch })
const routine = (patch: Partial<Routine> = {}): Routine => ({ id: id(3), title: '定时巡检', enabled: true, schedule: { kind: 'daily', time: '18:00' }, target: { kind: 'new', agent: 'auto', projectPaths: [], text: '巡检' }, nextRunAt: now + 3600_000, lastFiredAt: null, unread: 0, lastRun: null, createdAt: now, updatedAt: now, ...patch })
function render() {
  captured.nodes = []
  captured.layouts = []
  captured.cursor = 0
  return renderToStaticMarkup(createElement(OverviewView))
}
function node(type: unknown, predicate: (props: Record<string, unknown>) => boolean) {
  const found = captured.nodes.find((node) => node.type === type && predicate(node.props))
  if (!found) throw new Error(`missing node: ${String(type)}`)
  return found.props
}
function click(label: string) {
  const props = node('button', (props) => props['aria-label'] === label || props.children === label || (Array.isArray(props.children) && props.children.join('') === label))
  if (typeof props.onClick !== 'function') throw new Error('button has no click handler')
  props.onClick()
}
function connect() {
  const sent: Array<{ id: number; method: string; params: unknown }> = []
  const client = createRpcClient((frame) => sent.push(JSON.parse(frame)))
  const rpc: RpcConnection = { ...client, features: [], close: () => {}, closed: new Promise(() => {}) }
  useCore.setState({ rpc, connection: 'connected', attentionSummaryMode: 'complete', attentionSummaryLoading: false })
  return { sent, rpc }
}
beforeEach(() => {
  useCore.setState(useCore.getInitialState(), true)
  captured.values.clear()
  captured.cursor = 0
  vi.spyOn(Date, 'now').mockReturnValue(now)
})

describe('overview page', () => {
  it.each([
    ['/w/antumi-agents', '/w/orca', '/w/lobehub'],
    ['C:\\work\\antumi-agents', 'C:\\work\\orca'],
    ['/w/antumi-agents']
  ])('shows only the primary project in row metadata (%j)', (...projectPaths) => {
    connect()
    useCore.setState({
      tasks: { task: task({ repos: projectPaths.map((path) => ({ path, worktreePath: null, branch: null })) }) },
      conversations: { [id(1)]: chat({ projectPaths }) }, unseen: { [id(1)]: true },
      schedules: [run()], routines: [routine({ target: { kind: 'new', agent: 'auto', projectPaths, text: '巡检' } })]
    })
    render()
    const projects = captured.nodes.filter((entry) => entry.type === 'span' && entry.props.className === 'overview-project')
    expect(projects).toHaveLength(4)
    for (const { props } of projects) {
      expect(props.children).toBe('antumi-agents')
      expect(props.title).toBe(projectPaths.join('\n'))
    }
  })

  it('omits project metadata when no project is attached', () => {
    useCore.setState({ tasks: { task: task() } })
    expect(render()).not.toContain('class="overview-project"')
  })

  it('shows the empty message only after a successful connected snapshot', () => {
    expect(render()).not.toContain('暂时没有进行中的工作')
    expect(render()).toContain('尚未连接到 core')
    useCore.setState({ connection: 'connected', attentionSummaryMode: 'complete' })
    expect(render()).toContain('正在读取待处理事项')
    expect(render()).not.toContain('暂时没有进行中的工作')
    useCore.setState({ attentionSummaryLoading: false })
    expect(render()).toContain('暂时没有进行中的工作')
    useCore.setState({ attentionSummaryError: 'snapshot failed' })
    expect(render()).toContain('聊天摘要加载失败')
    expect(render()).toContain('重试')
    expect(render()).not.toContain('暂时没有进行中的工作')
  })

  it('shows limited-core and disconnection notices without hiding known items', () => {
    useCore.setState({ tasks: { task: task({ status: 'review', title: '验收登录修复' }) }, attentionSummaryMode: 'limited', attentionSummaryLoading: false })
    expect(render()).toContain('当前 core 的任务聊天详情不完整')
    expect(render()).toContain('以下为最近收到的信息')
    expect(render()).toContain('验收登录修复')
    expect(render()).toContain('去处理')
  })

  it('offers allow and deny for a plain approval, and only the chat for a plan', async () => {
    const { sent, rpc } = connect()
    const bash = { requestId: 'r1', kind: 'approval', tool: 'Bash', title: 'git commit -m fix', decisions: ['allow', 'deny'], open: 2 }
    useCore.setState({ conversations: { [id(1)]: chat({ chat: { turn: 'awaiting', request: bash } }) } })
    const plain = render()
    expect(plain).toContain('git commit -m fix')
    expect(plain).toContain('还有 1 项')
    click('允许一次：git commit -m fix')
    expect(sent[0]).toMatchObject({ method: 'conversations.respond', params: { id: id(1), requestId: 'r1', decision: 'allow' } })
    rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: sent[0]?.id, result: { ok: true } }))
    await Promise.resolve()
    captured.values.clear()
    render()
    click('拒绝：git commit -m fix')
    expect(sent[1]).toMatchObject({ method: 'conversations.respond', params: { decision: 'deny' } })
    useCore.setState({ conversations: { [id(1)]: chat({ chat: { turn: 'awaiting', request: { ...bash, tool: 'ExitPlanMode', title: '计划', open: 1 } } }) } })
    expect(render()).not.toContain('允许一次')
    expect(render()).toContain('去处理')
  })

  it('keeps the entry at zero and counts conversations rather than requests', () => {
    const empty = renderToStaticMarkup(createElement(OverviewEntry))
    expect(empty).toContain('总览')
    expect(empty).not.toContain('inbox-entry-count')
    useCore.setState({ tasks: { task: task({ awaitingInput: true }) } })
    expect(renderToStaticMarkup(createElement(OverviewEntry))).toContain('总览，1 项等你处理')
    expect(render()).toContain('等我 1')
  })

  it('toggles each range and returns to all without losing navigation scroll', () => {
    connect()
    useCore.setState({ tasks: { task: task(), review: task({ id: 'review', status: 'review', title: '待验收' }) }, schedules: [run()], conversations: { [id(1)]: chat() }, unseen: { [id(1)]: true } })
    expect(render()).toContain('aria-label="未读"')
    for (const [label, range, section] of [['等我 1', 'mine', '需要我'], ['在跑 1', 'running', '进行中'], ['接下来 1', 'next', '接下来'], ['未读 1', 'unread', '未读']] as const) {
      render()
      click(label)
      expect(useCore.getState().overviewFilter).toBe(range)
      const filtered = render()
      expect(filtered).toContain(`aria-label="${section}"`)
      expect(filtered).not.toContain(`aria-label="${section === '未读' ? '需要我' : '未读'}"`)
      expect(filtered).toContain('aria-pressed="true"')
      click(label)
      expect(useCore.getState().overviewFilter).toBeNull()
    }
    render()
    const scroll = node('section', (props) => props['aria-label'] === '总览').onScroll
    if (typeof scroll !== 'function') throw new Error('missing scroll handler')
    scroll({ currentTarget: { scrollTop: 420 } })
    click('打开：提交修复')
    expect(useCore.getState()).toMatchObject({ overviewOpen: false, overviewScroll: 420, selectedConversationId: id(1) })
  })

  it('says in the head what waits, who works and what comes next', () => {
    connect()
    useCore.setState({
      tasks: { review: task({ id: 'review', status: 'review', title: '待验收' }) },
      conversations: { [id(1)]: chat({ chat: { turn: 'running', doing: { tool: 'Bash', title: 'pnpm test' } } }) },
      schedules: [run({ notBefore: now + 3600_000 })]
    })
    const markup = render()
    expect(markup).toContain('1 待验收')
    expect(markup).toContain('Claude Code 工作中')
    expect(markup).toContain('下一个 13:00')
    expect(markup).toContain('都看过了')
    expect(markup).toContain('data-next=""')
  })

  it('gathers what is left to do, checks an item off and hands an agent\'s one to it', () => {
    const { sent, rpc } = connect()
    useCore.setState({ rpc: { ...rpc, features: ['todo-overview'] }, conversations: { [id(1)]: chat() } })
    receiveTodos(id(1), [{ id: 'g', title: '上线前', note: '周五前', createdAt: now, updatedAt: now, items: [
      { id: 'a', text: '通知运营', owner: 'user', done: false, createdAt: now, doneAt: null },
      { id: 'b', text: '补测试', owner: 'agent', done: false, createdAt: now, doneAt: null },
      { id: 'c', text: '改版本号', owner: 'user', done: true, createdAt: now, doneAt: now }
    ] }])
    const markup = render()
    expect(markup).toContain('aria-label="待办 2"')
    expect(markup).toContain('1 件归你 · 1 件 Agent 可接着做')
    expect(markup).toContain('aria-label="待办"')
    expect(markup).toContain('通知运营')
    expect(markup).toContain('上线前 · 周五前')
    expect(markup).not.toContain('改版本号')
    const box = node('input', (props) => props['aria-label'] === '完成：通知运营')
    if (typeof box.onChange !== 'function') throw new Error('missing check handler')
    box.onChange()
    expect(sent.at(-1)).toMatchObject({ method: 'todos.check', params: { id: id(1), groupId: 'g', itemId: 'a', done: true } })
    click('交给 Agent：补测试')
    expect(useQuotes(id(1))).toEqual([expect.objectContaining({ text: '补测试', note: '请处理这一项待办，做完后在待办里把它勾掉。' })])
    expect(useCore.getState()).toMatchObject({ selectedConversationId: id(1), conversationInspectorOpen: true, conversationInspectorTab: 'todos' })
  })

  it('shows six to-do conversations and folds the rest', () => {
    const { rpc } = connect()
    const conversations: Record<string, ReturnType<typeof chat>> = {}
    for (let n = 1; n <= 7; n++) {
      conversations[id(n)] = chat({ id: id(n), title: `会话${n}` })
      receiveTodos(id(n), [{ id: 'g', title: '待办', note: null, createdAt: now - n, updatedAt: now, items: [
        { id: 'a', text: `事项${n}`, owner: 'user', done: false, createdAt: now - n, doneAt: null }
      ] }])
    }
    useCore.setState({ rpc: { ...rpc, features: ['todo-overview'] }, conversations })
    const folded = render()
    for (let n = 1; n <= 6; n++) expect(folded).toContain(`会话${n}`)
    expect(folded).not.toContain('会话7')
    expect(folded).toContain('其余 1 个会话')
    expect(folded).toContain('aria-expanded="false"')
    click('其余 1 个会话')
    const open = render()
    expect(open).toContain('会话7')
    expect(open).toContain('aria-expanded="true"')
    click('其余 1 个会话')
    expect(render()).not.toContain('会话7')
  })

  it('leaves to-dos out of the overview on a core that cannot gather them', () => {
    connect()
    useCore.setState({ conversations: { [id(1)]: chat() } })
    receiveTodos(id(1), [{ id: 'g', title: 't', note: null, createdAt: now, updatedAt: now, items: [{ id: 'a', text: '通知运营', owner: 'user', done: false, createdAt: now, doneAt: null }] }])
    expect(render()).not.toContain('待办')
  })

  it('restores the saved scroll when the overview mounts again', () => {
    useCore.setState({ overviewScroll: 420, overviewFilter: 'mine' })
    render()
    const ref = node('section', (props) => props['aria-label'] === '总览').ref
    const element = { scrollTop: 0 }
    if (!ref || typeof ref !== 'object' || !('current' in ref)) throw new Error('missing page ref')
    ref.current = element
    for (const effect of captured.layouts) effect()
    expect(element.scrollTop).toBe(420)
  })

  it('resets the page and saved scroll when switching ranges in either direction', () => {
    useCore.setState({ overviewScroll: 420, tasks: { task: task({ status: 'review' }) } })
    for (const expectedFilter of ['mine', null] as const) {
      render()
      const ref = node('section', (props) => props['aria-label'] === '总览').ref
      const element = { scrollTop: 420 }
      if (!ref || typeof ref !== 'object' || !('current' in ref)) throw new Error('missing page ref')
      ref.current = element
      click('等我 1')
      expect(element.scrollTop).toBe(0)
      expect(useCore.getState()).toMatchObject({ overviewFilter: expectedFilter, overviewScroll: 0 })
      useCore.setState({ overviewScroll: 420 })
    }
  })

  it('opens the management pages for failed appointments and routines', () => {
    connect()
    useCore.setState({ schedules: [run({ status: 'failed' })], routines: [routine({ unread: 1, lastRun: run({ status: 'failed' }) })] })
    const markup = render()
    expect(markup.match(/data-reason="crashed"/g)).toHaveLength(2)
    expect(markup).toContain('role="img" aria-label="预约 · Codex"')
    expect(markup).toContain('role="img" aria-label="定时任务"')
    expect(markup).toContain('aria-hidden="true"')
    click('查看失败的预约：预约工作')
    expect(useCore.getState()).toMatchObject({ routinesOpen: true, routinesTab: 'schedules', overviewOpen: false })
    click('查看失败的定时任务：定时巡检')
    expect(useCore.getState()).toMatchObject({ routinesOpen: true, routinesTab: 'routines' })
  })

  it('opens a running task from the row by keyboard', () => {
    useCore.setState({ tasks: { task: task() } })
    render()
    const row = node('div', (props) => props.role === 'button')
    expect(row.tabIndex).toBe(0)
    const preventDefault = vi.fn()
    if (typeof row.onKeyDown !== 'function') throw new Error('missing keyboard handler')
    row.onKeyDown({ key: 'Enter', preventDefault })
    expect(preventDefault).toHaveBeenCalled()
    expect(useCore.getState()).toMatchObject({ overviewOpen: false, selectedId: 'task' })
  })

  it('collapses tomorrow and later, then expands and collapses on click', () => {
    useCore.setState({ schedules: [run({ notBefore: now + 86400_000, title: '明晚工作' })] })
    expect(render()).toContain('明天及以后 1 项')
    expect(render()).not.toContain('明晚工作')
    click('明天及以后 1 项')
    expect(render()).toContain('明晚工作')
    expect(node('button', (props) => Array.isArray(props.children) && props.children.join('') === '明天及以后 1 项')['aria-expanded']).toBe(true)
    click('明天及以后 1 项')
    expect(render()).not.toContain('明晚工作')
  })

  it('marks a conversation and a routine read through their respective sources', () => {
    const { sent } = connect()
    useCore.setState({ conversations: { [id(1)]: chat() }, unseen: { [id(1)]: true }, routines: [routine({ unread: 2 })] })
    render()
    click('标为已读：提交修复')
    expect(useCore.getState().unseen).toEqual({})
    click('标为已读：定时巡检')
    expect(sent[0]).toMatchObject({ method: 'routines.markAllSeen', params: { routineId: id(3) } })
  })

  it('clears every unread conversation behind a single task row', () => {
    useCore.setState({ tasks: { task: task({ status: 'done' }) }, conversations: { [id(1)]: chat({ taskId: 'task' }), [id(4)]: chat({ id: id(4), taskId: 'task' }) }, unseen: { [id(1)]: true, [id(4)]: true } })
    render()
    click('标为已读：运行任务')
    expect(useCore.getState().unseen).toEqual({})
    expect(render()).not.toContain('aria-label="未读"')
  })

  it('reschedules appointments and immediately runs appointments and routines', async () => {
    const { sent, rpc } = connect()
    const scheduled = run()
    useCore.setState({ schedules: [scheduled], routines: [routine()] })
    render()
    click('改期：预约工作')
    render()
    const picker = node(SchedulePicker, () => true)
    expect(picker.initial).toBe(scheduled.notBefore)
    if (typeof picker.onSchedule !== 'function') throw new Error('missing scheduling callback')
    const changed = picker.onSchedule(now + 7200_000)
    expect(sent[0]).toMatchObject({ method: 'schedules.update', params: { id: scheduled.id, notBefore: now + 7200_000 } })
    rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: sent[0]?.id, result: { ...scheduled, notBefore: now + 7200_000 } }))
    expect(await changed).toBe(true)
    click('立即运行：预约工作')
    click('立即运行：定时巡检')
    expect(sent.slice(1)).toMatchObject([{ method: 'schedules.runNow', params: { id: id(2) } }, { method: 'routines.runNow', params: { id: id(3) } }])
  })

  it.each(['schedule', 'routine'] as const)('disables %s run-now until the RPC settles and allows retry after failure', async (kind) => {
    const { sent, rpc } = connect()
    useCore.setState(kind === 'schedule' ? { schedules: [run()] } : { routines: [routine()] })
    const label = `立即运行：${kind === 'schedule' ? '预约工作' : '定时巡检'}`
    render()
    click(label)
    click(label)
    expect(sent).toHaveLength(1)
    render()
    expect(node('button', (props) => props['aria-label'] === label).disabled).toBe(true)
    click(label)
    expect(sent).toHaveLength(1)
    rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: sent[0]?.id, error: { code: -32000, message: 'try again' } }))
    await vi.waitFor(() => {
      render()
      expect(node('button', (props) => props['aria-label'] === label).disabled).toBe(false)
    })
    click(label)
    expect(sent).toHaveLength(2)
    expect(sent[1]?.method).toBe(kind === 'schedule' ? 'schedules.runNow' : 'routines.runNow')
  })
})
