import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createRpcClient, type Bookmark, type RpcConnection } from '@antumi/protocol'
import { bookmarkToolsOverCore } from './mcp-bookmark-tools'
import { createMcpHandler } from './mcp-server'

const bookmark = (title: string, url: string, folder: string | null = null): Bookmark => ({ id: crypto.randomUUID(), title, url, folder, createdAt: 1 })

const Frame = z.object({ id: z.number(), method: z.string() })

// A core that has these bookmarks, or one from before bookmarks when features leave it out.
function toolOver(bookmarks: Bookmark[], features = ['bookmarks']) {
  const client = createRpcClient((sent) => {
    const frame = Frame.parse(JSON.parse(sent))
    const result = frame.method === 'bookmarks.list' ? bookmarks : null
    queueMicrotask(() => client.receive(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result })))
  })
  const rpc: RpcConnection = { ...client, features, close: () => {}, closed: new Promise(() => {}) }
  const [tool] = bookmarkToolsOverCore(async (work) => work(rpc))
  return tool!
}
const text = (result: { content: Array<{ text: string }> }) => result.content.map((part) => part.text).join('')

describe('browser_bookmarks', () => {
  const kept = [
    bookmark('Admin 后台', 'https://admin.example.com/', '书签栏 / 工作'),
    bookmark('Grafana', 'https://grafana.example.com/d/orders', '书签栏 / 工作'),
    bookmark('', 'https://news.example.org/')
  ]

  it('is listed among the read-only tools of a plan-only conversation', async () => {
    const handler = createMcpHandler({ preview: async () => {}, planOnly: true, bookmarks: bookmarkToolsOverCore(async () => { throw new Error('unused') }) })
    expect(JSON.stringify(await handler(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })))).toContain('browser_bookmarks')
  })

  it('finds bookmarks by every word of the query, in title, address or folder', async () => {
    const tool = toolOver(kept)
    expect(text(await tool.run({ query: '后台' }))).toBe('- Admin 后台 https://admin.example.com/（书签栏 / 工作）')
    expect(text(await tool.run({ query: '工作 orders' }))).toBe('- Grafana https://grafana.example.com/d/orders（书签栏 / 工作）')
    expect(text(await tool.run({}))).toContain('- (无标题) https://news.example.org/')
  })

  it('says how many more there are past the limit', async () => {
    expect(text(await toolOver(kept).run({ limit: 1 }))).toContain('还有 2 个')
  })

  it('tells the agent when nothing matches, or nothing is kept', async () => {
    expect(text(await toolOver(kept).run({ query: 'jira' }))).toContain('没有和「jira」相关')
    expect(text(await toolOver([]).run({}))).toBe('用户还没有收藏任何网页。')
    expect(text(await toolOver(kept, []).run({}))).toBe('用户还没有收藏任何网页。')
  })

  it('turns bad arguments into an error the agent can read', async () => {
    const result = await toolOver(kept).run({ limit: 0 })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('limit')
  })
})
