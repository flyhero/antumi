import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentProfile, Squad, SquadRun, Task, createRpcClient, type Conversation, type RpcConnection } from '@antumi/protocol'
import { actionableItems, attentionCount, noticesBetween } from './attention'
import { openAttentionItem, selectSquad, useCore } from './core-store'
import { defaultAddedMember, defaultSquadMembers, resolveSquadMembers, saveSquad, squadReadOnlyIssueText } from './squads'
import { getLocale, setLocale } from './i18n'
import { SquadLaunchDialog } from './components/SquadLaunchDialog'
import { SquadsEntry, SquadsView } from './components/Squads'
import { SquadWorkPanel } from './components/SquadWorkPanel'

vi.mock('./core-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./core-store')>()
  return { ...actual, useSquadsSupported: () => actual.useCore.getState().rpc?.features.includes('squads') ?? false, useCore: Object.assign((selector: (state: import('./core-store').CoreState) => unknown) => selector(actual.useCore.getState()), actual.useCore) }
})

vi.mock('./components/ChatMarkdown', () => ({ ChatMarkdown: ({ text }: { text: string }) => createElement('p', null, text) }))

const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const squad = Squad.parse({ id: id(5), name: 'Delivery', leaderId: id(1), archivedAt: null, createdAt: 0, updatedAt: 0, members: [
  { id: id(1), name: 'Lead', agent: 'claude', capability: 'readOnly' }, { id: id(2), name: 'Build', agent: 'codex', capability: 'develop', role: 'implement and test' }
] })
const run = SquadRun.parse({ id: id(6), taskId: 'task', squad, leaderConversationId: id(7), state: 'running', permissionMode: 'ask', allowBypass: false, summary: null, createdAt: 0, updatedAt: 0, works: [
  { id: id(8), memberId: id(2), conversationId: id(9), instruction: 'Implement export', capability: 'develop', state: 'awaiting', result: null, error: null, delivered: false, createdAt: 0, updatedAt: 0 }
] })
const task = Task.parse({ id: 'task', title: 'Export', details: '', status: 'running', agent: 'claude', squadId: squad.id, repos: [], dependsOn: [], conversationId: id(7), awaitingInput: true, createdAt: 0, updatedAt: 0 })
const conversation: Conversation = { id: id(9), title: 'Build', titleLocked: true, agent: 'codex', workspacePath: '/wt', projectPaths: ['/wt'], managedWorkspace: false, sessionId: 'worker', createdAt: 0, updatedAt: 0, squadRunId: run.id, chat: { turn: 'awaiting', request: { kind: 'approval', requestId: 'approve', title: 'Run tests', tool: 'shell', open: 1, decisions: ['allow', 'deny'] } } }

const labels = { leader: 'Lead', leaderRole: 'Coordinate', developer: 'Build', developerRole: 'Implement', reviewer: 'Review', reviewerRole: 'Verify' }
const members = (installed: Parameters<typeof defaultSquadMembers>[0]) => {
  let next = 0
  return defaultSquadMembers(installed, () => null, labels, () => id(++next))
}
const linkedRole = AgentProfile.parse({ id: id(10), name: 'Linked role', agent: 'gemini', model: 'flash', effort: 'high', modelProvider: 'gateway', capability: 'develop',
  archivedAt: null, createdAt: 0, updatedAt: 0 })

beforeEach(() => useCore.setState(useCore.getInitialState(), true))
describe('squad member settings', () => {
  it('prefills the lead and reviewer with read-only engines and preserves the first installed developer', () => {
    expect(members(['gemini', 'codex', 'codebuddy', 'antigravity']).map(({ agent, capability }) => [agent, capability])).toEqual([
      ['codex', 'readOnly'], ['gemini', 'develop'], ['antigravity', 'readOnly']
    ])
    expect(members(['kimi']).map(({ agent }) => agent)).toEqual(['claude', 'kimi', 'claude'])
    expect(members([]).map(({ agent }) => agent)).toEqual(['claude', 'claude', 'claude'])
    const remembered = defaultSquadMembers(['gemini', 'codex'], (agent) => agent === 'codex' ? 'gateway' : null, labels)
    expect(remembered.map(({ agent, modelProvider }) => [agent, modelProvider])).toEqual([['codex', 'gateway'], ['gemini', null], ['codex', 'gateway']])
  })

  it('adds a read-only member when supported and a developer otherwise', () => {
    const add = (installed: Parameters<typeof defaultAddedMember>[0]) => defaultAddedMember(installed, () => null, 'Extra', () => id(6))
    expect(add(['codebuddy', 'antigravity'])).toMatchObject({ id: id(6), name: 'Extra', agent: 'antigravity', capability: 'readOnly' })
    expect(add(['gemini', 'kimi'])).toMatchObject({ agent: 'gemini', capability: 'develop' })
    expect(add([])).toMatchObject({ agent: 'claude', capability: 'develop' })
  })

  it('overlays linked role runtime fields while preserving squad member names and capabilities', () => {
    const linked = members(['claude']).map((member) => ({ ...member, profileId: member.capability === 'readOnly' ? linkedRole.id : id(11) }))
    const resolved = resolveSquadMembers(linked, { [linkedRole.id]: linkedRole })
    expect(resolved[0]).toMatchObject({ name: 'Lead', agent: linkedRole.agent, model: 'flash', effort: 'high', modelProvider: 'gateway', capability: 'readOnly' })
    expect(resolved[1]).toBe(linked[1])
    expect(resolved[2]).toMatchObject({ name: 'Review', agent: linkedRole.agent, model: 'flash', effort: 'high', capability: 'readOnly' })
  })

  it('formats leader and member guidance in Chinese and English', () => {
    const previous = getLocale()
    try {
      const issue = { memberId: id(1), memberName: 'Lead', agent: 'gemini', leader: true } as const
      setLocale('zh-CN')
      expect(squadReadOnlyIssueText(issue)).toContain('队长「Lead」使用的 Gemini CLI')
      expect(squadReadOnlyIssueText({ ...issue, leader: false, memberName: 'Review' })).toContain('只读成员「Review」使用的 Gemini CLI')
      setLocale('en')
      expect(squadReadOnlyIssueText(issue)).toContain('Lead, the team lead, uses Gemini CLI')
      expect(squadReadOnlyIssueText({ ...issue, leader: false, memberName: 'Review' })).toContain('Read-only member Review uses Gemini CLI')
    } finally { setLocale(previous) }
  })
})

describe('squad read-only warnings', () => {
  const pending = Task.parse({ ...task, status: 'pending', conversationId: null, repos: [{ path: '/project', branch: null, worktreePath: null }] })
  const renderLaunch = () => renderToStaticMarkup(createElement(SquadLaunchDialog, { task: pending, onSingle: () => {} }))
  const renderOverview = () => renderToStaticMarkup(createElement(SquadsView))
  const submit = (html: string) => html.match(/<button type="submit"[^>]*>/)?.[0]

  beforeEach(() => {
    const rpc: RpcConnection = { ...createRpcClient(() => {}), features: ['squads', 'squad-leader-planning'], close() {}, closed: new Promise(() => {}) }
    useCore.setState({ rpc, tasks: { [pending.id]: pending }, selectedSquadId: squad.id })
  })

  it.each([[id(1), '队长「Lead」'], [id(3), '只读成员「Review」']] as const)('blocks a legacy read-only assignment in the launch dialog and team overview', (memberId, label) => {
    const saved = { ...squad, members: members(['claude']).map((member) => member.id === memberId ? { ...member, agent: linkedRole.agent } : member) }
    useCore.setState({ squads: { [squad.id]: saved }, error: 'Earlier error' })
    const launch = renderLaunch()
    const overview = renderOverview()
    const message = label + '使用的 Gemini CLI 不支持只读模式'
    expect(launch).toContain(message)
    expect(launch).toContain('>去修改团队</button>')
    expect(launch).not.toContain('Earlier error')
    expect(submit(launch)).toContain('disabled')
    expect(overview).toContain(message)
    expect(overview).toContain('data-kind="error">不支持只读</span>')
  })

  it('blocks when an assigned read-only member is now linked to an unsupported developer role', () => {
    const saved = { ...squad, members: members(['claude']).map((member) => member.id === id(3) ? { ...member, profileId: linkedRole.id } : member) }
    useCore.setState({ squads: { [squad.id]: saved }, agentProfiles: { [linkedRole.id]: linkedRole } })
    const launch = renderLaunch()
    expect(launch).toContain('只读成员「Review」使用的 Gemini CLI 不支持只读模式')
    expect(submit(launch)).toContain('disabled')
  })

  it('allows Antigravity as squad lead, disabling plan-first on managed-acp and keeping both options on agy-cli', () => {
    const saved = { ...squad, members: members(['antigravity', 'claude']) }
    useCore.setState({
      squads: { [squad.id]: saved },
      environment: { checkedAt: 0, searchPath: [], checks: [{ tool: 'antigravity', status: 'ok', version: '1.4.1', path: '/bin/agy_acp_server', signedIn: true, runtime: { active: 'managed-acp', available: ['managed-acp'] } }] }
    })
    const managedLaunch = renderLaunch()
    expect(managedLaunch).not.toContain('不支持只读')
    expect(managedLaunch).toContain('当前后端不支持规划模式')
    expect(managedLaunch).toContain('开始团队开发</button>')
    expect(submit(managedLaunch)).toBe('<button type="submit" class="button primary">')
    expect(renderOverview()).not.toContain('data-kind="error"')

    useCore.setState({
      environment: { checkedAt: 0, searchPath: [], checks: [{ tool: 'antigravity', status: 'ok', version: '1.5.17', path: '/bin/agy', signedIn: true, runtime: { active: 'agy-cli', available: ['agy-cli', 'managed-acp'] } }] }
    })
    const agyLaunch = renderLaunch()
    expect(agyLaunch).not.toContain('当前后端不支持规划模式')
    expect(agyLaunch).toContain('开始规划</button>')
    expect(submit(agyLaunch)).toBe('<button type="submit" class="button primary">')
  })

  it('allows launch with Gemini assigned development and testing', () => {
    const saved = { ...squad, members: members(['gemini', 'claude']) }
    useCore.setState({ squads: { [squad.id]: saved } })
    const launch = renderLaunch()
    expect(launch).not.toContain('不支持只读')
    expect(launch).not.toContain('去修改团队')
    expect(submit(launch)).toBe('<button type="submit" class="button primary">')
    expect(renderOverview()).not.toContain('data-kind="error"')
  })
})

describe('development squad user paths', () => {
  it('waits for successful creation before opening the saved squad', async () => {
    const sent: Array<{ id: number; method: string; params: unknown }> = []
    const client = createRpcClient((frame) => sent.push(JSON.parse(frame)))
    const rpc: RpcConnection = { ...client, features: ['squads'], close: () => {}, closed: new Promise(() => {}) }
    useCore.setState({ rpc, settingsOpen: true, section: 'tasks' })
    const saving = saveSquad(squad)
    expect(useCore.getState().section).toBe('tasks')
    expect(sent[0]?.method).toBe('squads.create')
    rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: sent[0]?.id, result: squad }))
    await saving
    expect(useCore.getState()).toMatchObject({ section: 'squads', selectedSquadId: squad.id, settingsOpen: false, squads: { [squad.id]: squad } })
  })
  it('shows a dedicated management section, editable roles and member work access', () => {
    const client = createRpcClient(() => {})
    const rpc: RpcConnection = { ...client, features: ['squads'], close: () => {}, closed: new Promise(() => {}) }
    useCore.setState({ rpc, squads: { [squad.id]: squad } })
    selectSquad(null)
    // The sidebar holds an entry only; the squads are listed on their page.
    const sidebar = renderToStaticMarkup(createElement(SquadsEntry))
    expect(sidebar).toContain('<span class="sidebar-navigation-label">团队</span>')
    expect(sidebar).not.toContain('Delivery')
    const list = renderToStaticMarkup(createElement(SquadsView))
    expect(list).toContain('Delivery')
    // A card a squad, its leader first and marked, and a card to start another.
    expect(list).toContain('data-lead="true" title="Lead · Claude Code')
    expect(list).toContain('新建团队')
    selectSquad(squad.id)
    const overview = renderToStaticMarkup(createElement(SquadsView))
    expect(overview).toContain('队长 · 只读')
    expect(overview).toContain('开发 / 测试')
    expect(overview).toContain('implement and test')
    expect(overview).toContain('编辑')
    const panel = renderToStaticMarkup(createElement(SquadWorkPanel, { runs: [run], onConversation: () => {} }))
    expect(panel).toContain('等你回答')
    expect(panel).toContain('看会话')
    expect(panel).toContain('Implement export')
  })
  it('routes member approvals to the task and opens the exact member conversation', () => {
    const snapshot = { tasks: { [task.id]: task }, conversations: { [conversation.id]: conversation }, squadRuns: { [run.id]: run }, unseen: {} }
    const items = actionableItems(snapshot)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ target: { kind: 'task', id: task.id }, conversationId: conversation.id, primaryReason: 'awaiting' })
    expect(attentionCount(snapshot)).toBe(1)
    useCore.setState(snapshot)
    openAttentionItem(items[0]!)
    expect(useCore.getState()).toMatchObject({ section: 'tasks', selectedId: task.id, view: 'chat', taskMemberConversationId: conversation.id, taskInspectorTab: 'squad' })
    const before = { ...conversation, chat: { turn: 'running' as const } }
    expect(noticesBetween({ ...snapshot, conversations: { [conversation.id]: before } }, snapshot)[0]?.target).toEqual({ kind: 'task', id: task.id })
  })
})
