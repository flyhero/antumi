import { describe, expect, it } from 'vitest'
import type { RpcConnection } from '@antumi/protocol'
import { clipMiddle, historyToolsOverCore, parseWhen } from './mcp-history-tools'
import { createMcpHandler } from './mcp-server'

const day = (date: number, hour = 12) => new Date(2026, 9, date, hour).getTime()
const CHAT = 'aaaaaaaa-0000-4000-8000-000000000001'
const OLD = '00000000-0000-4000-8000-000000000002'
const TASK = '00000000-0000-4000-8000-000000000003'
const TASK_CHAT = '00000000-0000-4000-8000-000000000004'

const conversation = (id: string, title: string, at: number, agent = 'claude') => ({ id, title, agent, projectPaths: ['/code/antumi'], createdAt: at, updatedAt: at, archivedAt: null })
const message = (conversationId: string, role: 'user' | 'assistant', text: string, at: number, agent = 'codex') => ({ conversationId, role, text, agent, createdAt: at })

// A core that answers each method as the test says.
function fakeCore(answers: Record<string, (params: { id?: string; query?: string }) => unknown>) {
  const rpc = { call: async (method: string, params: { id?: string; query?: string }) => answers[method]?.(params) }
  // Only call is used; the rest of a connection never is.
  return async <T>(work: (connection: RpcConnection) => Promise<T>): Promise<T> => work(Object.assign(Object.create(null), rpc))
}

const core = fakeCore({
  'conversations.list': () => [conversation(CHAT, '修登录页', day(8), 'codex'), conversation(OLD, '上个月的事', day(1))],
  'tasks.list': () => [{ id: TASK, title: '加缓存', status: 'done', agent: 'claude', repos: [{ path: '/code/api' }], conversationId: TASK_CHAT, createdAt: day(6), updatedAt: day(7) }],
  'discussions.list': () => [],
  'conversations.search': ({ query }) => (query === 'redis' ? [{ conversationId: TASK_CHAT, snippet: 'redis' }] : []),
  'conversations.get': () => conversation(CHAT, '修登录页', day(8), 'codex'),
  'conversations.messages': ({ id }) => id === CHAT
    ? [message(CHAT, 'user', '按钮点不了', day(8, 9)), message(CHAT, 'assistant', '修好了，是 z-index', day(8, 10)), message(CHAT, 'user', '再看看手机上', day(9, 9))]
    : [message(TASK_CHAT, 'assistant', '用 redis 做了缓存', day(7), 'claude')],
  'tasks.get': () => ({ id: TASK, title: '加缓存', details: '给列表接口加缓存', status: 'done', agent: 'claude', repos: [{ path: '/code/api' }], conversationId: TASK_CHAT, attempts: [], abandonReason: null })
})

describe('history tools', () => {
  const tools = historyToolsOverCore(core, CHAT, () => day(10))

  it('lists what had activity in a stretch, any agent\'s, newest first, the asking one marked', async () => {
    const { text } = await tools.call('list', { since: '2026-10-05', until: '2026-10-11' })
    expect(text).toContain('现在是 2026-10-10 12:00。共 2 条：')
    expect(text.indexOf(`会话 ${CHAT}「修登录页」· Codex · antumi · 就是这条会话`)).toBeLessThan(text.indexOf(`任务 ${TASK}「加缓存」· 已完成 · Claude Code · api`))
    expect(text).not.toContain('上个月的事')
    expect((await tools.call('list', { query: 'redis' })).text).toContain(`共 1 条：\n- 任务 ${TASK}`)
    expect((await tools.call('list', { since: 'last week' })).isError).toBe(true)
  })

  it('reads what was said, by any agent, within the stretch asked, and a task with its details', async () => {
    const chat = (await tools.call('read', { id: CHAT.slice(0, 8), until: '2026-10-08' })).text
    expect(chat).toContain('会话「修登录页」· Codex')
    expect(chat).toContain('[2026-10-08 09:00] 用户：\n按钮点不了\n\n[2026-10-08 10:00] Codex：\n修好了，是 z-index')
    expect(chat).not.toContain('再看看手机上')
    const task = (await tools.call('read', { id: TASK })).text
    expect(task).toContain('任务「加缓存」· 已完成 · Claude Code · api\n详情：\n给列表接口加缓存')
    expect(task).toContain('Claude Code：\n用 redis 做了缓存')
    expect(await tools.call('read', { id: 'ffffffff' })).toMatchObject({ isError: true })
  })

  it('keeps the head and the tail of what is too long', () => {
    expect(clipMiddle('a'.repeat(10) + 'b'.repeat(10), 10)).toBe('aaaaa\n\n……（中间省略 10 字）……\n\nbbbbb')
    expect(parseWhen('2026-10-05', true)).toBe(new Date(2026, 9, 6).getTime() - 1)
  })

  it('reads an explicit conversation URL and refuses a deleted id without substituting a matching title', async () => {
    expect((await tools.call('read', { id: `antumi://conversation/${CHAT}` })).text).toContain('修好了，是 z-index')
    const gone = await tools.call('read', { id: 'antumi://conversation/ffffffff-0000-4000-8000-000000000001' })
    expect(gone.isError).toBe(true)
    expect(gone.text).toContain('可能已删除')
    expect(gone.text).not.toContain('修好了')
  })

  it('is offered only where the user allows it, planning included', async () => {
    const listed = async (history: boolean) => {
      const handle = createMcpHandler({ preview: async () => {}, planOnly: true, ...(history ? { history: tools } : {}) })
      const response = await handle(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
      return JSON.stringify(response?.result)
    }
    expect(await listed(true)).toContain('history_read')
    expect(await listed(true)).toContain('antumi://conversation/<id>')
    expect(await listed(false)).not.toContain('history_')
  })

  it('refuses once the user turns reading their records off', async () => {
    let readHistory = true
    const gated = fakeCore({ 'system.chatSettings': () => ({ promptSuggestions: true, readHistory }), 'conversations.list': () => [], 'tasks.list': () => [], 'discussions.list': () => [] })
    const history = historyToolsOverCore(gated, CHAT, () => day(10))
    expect((await history.call('list', {})).isError).toBeFalsy()
    readHistory = false
    for (const kind of ['list', 'read'] as const) {
      const refused = await history.call(kind, { id: CHAT })
      expect(refused.isError).toBe(true)
      expect(refused.text).toContain('关闭了读取 Antumi 记录')
    }
    expect((await history.call('read', { id: `antumi://conversation/${CHAT}` })).isError).toBe(true)
  })
})
