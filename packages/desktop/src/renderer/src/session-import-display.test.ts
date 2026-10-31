import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import type { ExternalSession } from '@antumi/protocol'
import { SessionImportGroup } from './components/SessionImportSettings'
import { ResumableSessionList } from './components/ResumableSessions'
import { setLocale } from './i18n'

const session: ExternalSession = { agent: 'cursor', sessionId: 'desktop:composer', cwd: '/project/app', title: 'Fix the app', firstPrompt: 'Investigate', startedAt: 100, updatedAt: 200, status: 'new', conversationId: null, problem: null, source: 'desktop', continuation: 'handoff' }
const renderGroup = (members: ExternalSession[]) => renderToStaticMarkup(createElement(SessionImportGroup, { cwd: session.cwd, members, chosen: new Set<string>(), busy: false, expanded: true, toggle: () => {}, onExpand: () => {} }))
afterEach(() => setLocale('zh-CN'))
describe('imported session presentation', () => {
  it('distinguishes desktop handoffs and disables sessions whose folder is gone', () => {
    setLocale('en')
    const html = renderGroup([session, { ...session, sessionId: 'missing', title: 'Missing folder', problem: 'missing-cwd' }])
    expect(html).toContain('Desktop')
    expect(html).toContain('History handoff')
    expect(html).toContain('disabled=""')
    expect(html).toContain('Missing folder')
  })
  it('keeps old core responses displayable without source or continuation metadata', () => {
    const html = renderGroup([{ ...session, source: undefined, continuation: undefined }])
    expect(html).toContain('Fix the app')
    expect(html).not.toContain('历史移交')
  })
  it('shows handoff behavior in the shared onboarding and overview list', () => {
    const html = renderToStaticMarkup(createElement(ResumableSessionList, { sessions: [session] }))
    expect(html).toContain('桌面')
    expect(html).toContain('历史移交')
    expect(html).toContain('接着聊')
  })
})
