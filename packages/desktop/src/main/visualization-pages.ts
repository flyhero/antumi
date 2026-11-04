import { randomUUID } from 'node:crypto'
import { VISUALIZATION_POLICY, VISUALIZATION_SCHEME } from '../shared/visualization-policy'

// Documents belong to the renderer that registered them, and never resolve local file paths.
export class VisualizationPages {
  private readonly pages = new Map<string, { owner: number; document: string; bytes: number }>()
  create(owner: number, document: unknown): string {
    if (typeof document !== 'string') throw new Error('Invalid visualization document')
    const bytes = Buffer.byteLength(document)
    if (bytes > 6_000_000 || [...this.pages.values()].filter((page) => page.owner === owner).reduce((sum, page) => sum + page.bytes, 0) + bytes > 32_000_000) throw new Error('Visualization documents are too large')
    const id = randomUUID()
    this.pages.set(id, { owner, document, bytes })
    return `${VISUALIZATION_SCHEME}://document/${id}`
  }
  remove(owner: number, url?: string): void {
    for (const [id, page] of this.pages) if (page.owner === owner && (url === undefined || url === `${VISUALIZATION_SCHEME}://document/${id}`)) this.pages.delete(id)
  }
  serve(request: Request): Response {
    const url = new URL(request.url)
    const page = url.host === 'document' && request.method === 'GET' ? this.pages.get(url.pathname.slice(1)) : undefined
    return page ? new Response(page.document, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': VISUALIZATION_POLICY, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }) : new Response('not found', { status: 404 })
  }
}
