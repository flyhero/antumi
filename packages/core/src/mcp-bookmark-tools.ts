import { z } from 'zod'
import { BROWSER_BOOKMARKS_TOOL, matchBookmarks, type Bookmark, type RpcConnection } from '@antumi/protocol'

const Arguments = z.object({ query: z.string().trim().max(200).optional(), limit: z.number().int().min(1).max(200).optional() })
const DEFAULT_LIMIT = 50

type McpResult = { content: Array<{ type: 'text'; text: string }>; isError: boolean }
const result = (text: string, isError = false): McpResult => ({ content: [{ type: 'text', text }], isError })

function bookmarkLine(bookmark: Bookmark): string {
  const folder = bookmark.folder ? `（${bookmark.folder}）` : ''
  return `- ${bookmark.title || '(无标题)'} ${bookmark.url}${folder}`
}

// The user's bookmarks in the built-in browser, so a site named in passing ("the admin") has an address.
export function bookmarkToolsOverCore(withCore: <T>(work: (rpc: RpcConnection) => Promise<T>) => Promise<T>) {
  const run = async (raw: Record<string, unknown>): Promise<McpResult> => {
    const args = Arguments.safeParse(raw)
    if (!args.success) return result(`参数不对：${args.error.issues.map((issue) => `${issue.path.join('.') || '参数'} ${issue.message}`).join('；')}`, true)
    try {
      const all = await withCore((rpc) => (rpc.features.includes('bookmarks') ? rpc.call('bookmarks.list', {}) : Promise.resolve([])))
      if (all.length === 0) return result('用户还没有收藏任何网页。')
      const query = args.data.query ?? ''
      const found = matchBookmarks(all, query)
      if (found.length === 0) return result(`收藏里没有和「${query}」相关的网页（共 ${all.length} 个收藏）。换个关键词试试，或者问用户要地址。`)
      const limit = args.data.limit ?? DEFAULT_LIMIT
      const more = found.length > limit ? `\n…还有 ${found.length - limit} 个，用 query 缩小范围。` : ''
      return result(`${found.slice(0, limit).map(bookmarkLine).join('\n')}${more}`)
    } catch (error) {
      return result(`没能读取收藏：${error instanceof Error ? error.message : String(error)}`, true)
    }
  }
  return [{
    spec: {
      name: BROWSER_BOOKMARKS_TOOL,
      title: '查找收藏',
      description:
        '在用户为 Antumi 浏览器收藏的网页里按关键词找地址：标题、网址、所在文件夹都会匹配，多个词要同时出现。' +
        '用户提到某个网站却没给地址时（如「去后台看看」「打开报表」），先用它找，再用 browser_navigate 打开。只读。',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '关键词，空格分隔；不给就列出全部' },
          limit: { type: 'number', description: `最多列多少个，默认 ${DEFAULT_LIMIT}` }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    run
  }]
}
