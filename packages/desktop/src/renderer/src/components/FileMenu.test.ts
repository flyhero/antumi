import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ResolvedFile } from '@antumi/protocol'
import { FileMenuItems } from './FileMenu'

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})

const file: ResolvedFile = { path: '/repo/README.md', relative: 'README.md', root: '/repo', kind: 'file' }
const scope = { conversationId: '00000000-0000-4000-8000-000000000001', roots: ['/repo'], inspector: 'conversation' as const }
const render = (inPanel: boolean) => renderToStaticMarkup(createElement(FileMenuItems, { scope, file, inPanel, onClose: () => {} }))

describe('FileMenuItems', () => {
  it('offers to open a file in the side panel from elsewhere', () => {
    expect(render(false)).toContain('在侧栏打开')
    expect(render(false)).not.toContain('将文件加入会话')
  })

  it("leaves that out in the side panel's own files, where it would do nothing", () => {
    const html = render(true)
    expect(html).not.toContain('在侧栏打开')
    expect(html).toContain('复制绝对路径')
    expect(html).toContain('将文件加入会话')
  })

  it('does not offer to send a file when no conversation is available', () => {
    const html = renderToStaticMarkup(createElement(FileMenuItems, { scope: { conversationId: null, roots: ['/repo'] }, file, inPanel: true, onClose: () => {} }))
    expect(html).not.toContain('将文件加入会话')
  })
})
