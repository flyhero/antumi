import { describe, expect, it } from 'vitest'
import { agentDescriptor } from './agents'
import { AGENT_KINDS } from './agent'
import { codexVisualizations, visualizationPath } from './visualization'

const marker = (data: unknown) => `\uE200visualize\uE202${JSON.stringify(data)}\uE201`
const valid = marker({ path: '/work/status-preview.html', title: '状态预览', mode: 'wide' })

describe('Codex visualization references', () => {
  it('is enabled only by the Codex descriptor', () => {
    expect(AGENT_KINDS.filter((agent) => agentDescriptor(agent).inlineVisualizations)).toEqual(['codex'])
  })

  it('keeps surrounding Markdown and the references in their original order', () => {
    expect(codexVisualizations(`**Before**\n\n${valid}\n\nAfter`)).toEqual([
      { kind: 'markdown', text: '**Before**\n\n' },
      { kind: 'visualization', reference: { path: '/work/status-preview.html', title: '状态预览', mode: 'wide' } },
      { kind: 'markdown', text: '\nAfter' }
    ])
  })

  it('supports native directives, legacy filenames and Windows absolute paths', () => {
    for (const text of ['::codex-inline-vis{file="status-preview.html" title="Preview" mode="wide"}', '\uE200visualize\uE202status-preview.html\uE201', marker({ path: 'C:\\work\\status-preview.html' })]) {
      expect(codexVisualizations(text)[0]?.kind).toBe('visualization')
    }
  })

  it('leaves fenced, indented, inline and quoted examples untouched', () => {
    for (const text of [`\`\`\`text\n${valid}\n\`\`\``, `~~~~\n${valid}\n~~~~`, `    ${valid}`, `\`${valid}\``, `> ${valid}`, `Example: ${valid}`]) {
      expect(codexVisualizations(text)).toEqual([{ kind: 'markdown', text }])
    }
  })

  it('retains invalid JSON, traversal, unexpected types and filenames as text', () => {
    for (const text of ['\uE200visualize\uE202{broken}\uE201', marker({ path: '../status-preview.html' }), marker({ path: '/work/../status-preview.html' }), marker({ path: '/work/UPPER.html' }), marker({ path: '/work/page.htm' }), marker({ path: '/work/a.html', type: 'live' }), marker({ path: '/work/a.html', mode: 'unknown' }), marker({ path: '/work/a\n.html' })]) {
      expect(codexVisualizations(text)).toEqual([{ kind: 'markdown', text }])
    }
    expect(visualizationPath('/work/a\0.html')).toBe(false)
  })

  it('hides only the unfinished reference at the streaming tail', () => {
    for (const tail of ['\uE200vis', '\uE200visualize\uE202{"path":', '::codex-inline-vis{path="/work/a']) {
      expect(codexVisualizations(`Before\n${tail}`, true)).toEqual([{ kind: 'markdown', text: 'Before\n' }])
      expect(codexVisualizations(tail, false)).toEqual([{ kind: 'markdown', text: tail }])
    }
    expect(codexVisualizations(valid, true)[0]?.kind).toBe('visualization')
  })
})
