import { afterEach, describe, expect, it } from 'vitest'
import { AGENT_CALL_TOOLS, MANAGEMENT_TOOLS, SQUAD_TOOL_NAMES, type ChatItem } from '@antumi/protocol'
import { antumiToolPresentation, antumiToolTitle } from './antumi-tool-presentation'
import { runSummary, toolIconKind, toolLabel } from './chat-tools'
import { setLocale } from './i18n'

type Tool = Extract<ChatItem, { kind: 'tool' }>
const call = (name: string, input: unknown = {}, output: unknown = null, status: Tool['status'] = 'done') => ({
  name, input: JSON.stringify(input), output: JSON.stringify(output), status, title: 'driver fallback'
})
afterEach(() => setLocale('zh-CN'))

describe('Antumi tool presentation', () => {
  it.each([...Object.values(MANAGEMENT_TOOLS), ...Object.values(AGENT_CALL_TOOLS), ...Object.values(SQUAD_TOOL_NAMES)])('recognizes both MCP spellings of %s', (name) => {
    for (const alias of [`mcp__antumi__${name}`, `antumi.${name}`]) {
      expect(antumiToolPresentation(alias)).not.toBeNull()
      expect(toolLabel(alias)).not.toContain('antumi')
      expect(toolIconKind(alias)).not.toBe('tool')
    }
  })

  it('does not claim a third-party tool or an unfamiliar Antumi tool', () => {
    for (const name of ['mcp__other__antumi_agent_profile_update', 'other.antumi_skill_list', 'antumi.future_tool']) {
      expect(antumiToolPresentation(name)).toBeNull()
      expect(antumiToolTitle(call(name))).toBeNull()
    }
    expect(toolLabel('mcp__other__antumi_skill_list', { name: 'Other skills', server: 'Other' })).toBe('Other · Other skills')
    expect(toolIconKind('mcp__other__antumi_skill_list')).toBe('tool')
  })

  it('uses owned names and semantic icons rather than provider display strings', () => {
    expect(toolLabel('mcp__antumi__antumi_agent_profile_update', { name: 'raw tool', server: 'antumi' })).toBe('修改智能体')
    expect(toolIconKind('antumi.antumi_skill_search')).toBe('search')
    expect(toolIconKind('antumi.antumi_chat_command_update')).toBe('edit')
    expect(toolLabel('antumi.antumi_agent_dispatch')).toBe('委派智能体')
    expect(toolLabel('antumi.antumi_squad_dispatch')).toBe('分派团队工作')
    expect(runSummary([{ name: 'antumi.antumi_agent_profile_create' }, { name: 'antumi.antumi_skill_search' }])).toBe('创建智能体 1 次，搜索技能 1 次')
  })

  it('summarizes the object rather than whichever argument the driver saw first', () => {
    expect(antumiToolTitle(call('antumi.antumi_agent_profile_update', { id: 'profile-id', name: 'Reviewer' }))).toBe('Reviewer')
    expect(antumiToolTitle(call('antumi.antumi_routine_create', { target: { text: 'Long instructions' }, title: 'Daily review' }))).toBe('Daily review')
    expect(antumiToolTitle(call('antumi.antumi_skill_search', { query: 'design' }))).toBe('design')
    expect(antumiToolTitle(call('antumi.antumi_skill_install', { url: 'https://example.test/team/skills' }))).toBe('https://example.test/team/skills')
    expect(antumiToolTitle(call('antumi.antumi_chat_command_create', { name: 'review' }))).toBe('/review')
    expect(antumiToolTitle(call('antumi.antumi_skill_set_activation', { id: 'team-skills', activation: { mode: 'all' } }))).toBe('team-skills')
  })

  it('resolves unchanged names from successful results and keeps failures honest', () => {
    const input = { id: 'profile-id', description: 'New role' }
    const output = { id: 'profile-id', name: 'Reviewer' }
    expect(antumiToolTitle(call('antumi.antumi_agent_profile_update', input, output))).toBe('Reviewer')
    for (const status of ['running', 'failed', 'denied', 'interrupted'] as const) {
      expect(antumiToolTitle(call('antumi.antumi_agent_profile_update', input, output, status))).toBe('profile-id')
      expect(antumiToolTitle(call('antumi.antumi_skill_list', {}, [{ id: 'repo' }], status))).toBe('')
    }
    expect(antumiToolTitle(call('antumi.antumi_chat_command_update', { id: 'command-id' }, { name: 'review' }))).toBe('/review')
  })

  it('counts successful list results, including empty and wrapped pretty JSON results', () => {
    expect(antumiToolTitle(call('antumi.antumi_agent_list', {}, []))).toBe('0 项')
    expect(antumiToolTitle(call('antumi.antumi_skill_list', {}, [{ id: 'repo' }, { id: 'repo2' }]))).toBe('2 项')
    const wrapped = { content: [{ type: 'text', text: JSON.stringify([{ name: 'Reviewer' }], null, 2) }] }
    expect(antumiToolTitle(call('antumi.antumi_agent_profile_list', {}, wrapped))).toBe('1 项')
    expect(antumiToolTitle(call('antumi.antumi_agent_profile_list', {}, { ...wrapped, isError: true }))).toBe('')
    expect(antumiToolTitle(call('antumi.antumi_agent_profile_list', {}, 'not JSON'))).toBe('')
  })

  it('keeps scheduling, delegation and team operations in their own contexts', () => {
    expect(antumiToolTitle(call('antumi.antumi_schedule_create', { target: { kind: 'conversation', text: 'Review changes\nFull instructions' } }))).toBe('Review changes')
    expect(antumiToolTitle(call('antumi.antumi_schedule_update', { id: 'schedule-id', notBefore: null }))).toBe('schedule-id')
    expect(antumiToolTitle(call('antumi.antumi_agent_dispatch', { profileId: 'profile-id', ref: 'review' }))).toBe('review')
    expect(antumiToolTitle(call('antumi.antumi_agent_cancel', { callId: 'call-id' }))).toBe('call-id')
    expect(antumiToolTitle(call('antumi.antumi_squad_dispatch', { memberId: 'member-id', instruction: 'Long instructions' }))).toBe('member-id')
    expect(antumiToolTitle(call('antumi.antumi_squad_finish', { summary: 'Delivered changes\nVerification follows' }))).toBe('Delivered changes')
  })

  it('falls back without throwing on malformed or truncated input', () => {
    const input = { ...call('antumi.antumi_agent_profile_update'), input: '{"id":"cut', output: '{"name":"cut' }
    expect(antumiToolTitle(input)).toBe('driver fallback')
    expect(antumiToolTitle({ ...input, input: 'null', output: '[]' })).toBe('driver fallback')
    expect(antumiToolTitle({ ...input, input: '42' })).toBe('driver fallback')
  })

  it('localizes labels, grouped summaries and result counts at render time', () => {
    const name = 'mcp__antumi__antumi_skill_list'
    expect(toolLabel(name)).toBe('查看技能')
    setLocale('en')
    expect(toolLabel(name)).toBe('List skills')
    expect(antumiToolTitle(call(name, {}, [{}]))).toBe('1 result')
    expect(antumiToolTitle(call(name, {}, [{}, {}]))).toBe('2 results')
    expect(runSummary([{ name: 'antumi.antumi_agent_profile_update' }])).toBe('Update agent 1 time')
  })
})
