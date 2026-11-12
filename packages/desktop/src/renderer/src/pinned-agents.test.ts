import { beforeEach, describe, expect, it } from 'vitest'
import { AgentProfile, Conversation } from '@antumi/protocol'
import { useCore } from './core-store'
import { usePreferences } from './preferences'
import { agentConversation, newAgentConversation, openPinnedAgent, pinAgent, pinnedAgents } from './pinned-agents'

const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const agent = AgentProfile.parse({ id: id(1), name: '代码审查', agent: 'claude', archivedAt: null, createdAt: 1, updatedAt: 1 })
const chat = (n: number, profile = agent) => Conversation.parse({
  id: id(n), title: `会话 ${n}`, titleLocked: false, agent: 'claude', profile, workspacePath: '/project',
  projectPaths: ['/project'], managedWorkspace: false, sessionId: null, createdAt: n, updatedAt: n
})

beforeEach(() => {
  useCore.setState(useCore.getInitialState(), true)
  useCore.setState({ agentProfiles: { [agent.id]: agent } })
  usePreferences.setState({ pinnedAgentIds: [] })
})

describe('pinned agents', () => {
  it('keeps pin order, removes duplicates and hides unavailable or archived agents', () => {
    const second = { ...agent, id: id(2), name: '第二位' }
    const archived = { ...agent, id: id(3), archivedAt: 10 }
    const profiles = { [agent.id]: agent, [second.id]: second, [archived.id]: archived }
    expect(pinnedAgents([second.id, id(99), archived.id, agent.id, second.id], profiles)).toEqual([second, agent])
  })

  it('pins an agent once and unpins it without changing its conversations', () => {
    const conversation = chat(10)
    useCore.setState({ conversations: { [conversation.id]: conversation } })
    pinAgent(agent.id, true)
    pinAgent(agent.id, true)
    expect(usePreferences.getState().pinnedAgentIds).toEqual([agent.id])
    pinAgent(agent.id, false)
    expect(usePreferences.getState().pinnedAgentIds).toEqual([])
    expect(useCore.getState().conversations[conversation.id]).toEqual(conversation)
  })

  it('continues the latest ordinary chat, ignoring tasks, delegated, routine and archived chats', () => {
    const older = chat(10)
    const latest = chat(11)
    const excluded = [
      { ...chat(12), archivedAt: 20 },
      { ...chat(13), taskId: id(50) },
      { ...chat(14), parentConversationId: id(51) },
      { ...chat(15), routineId: id(52) },
      chat(16, { ...agent, id: id(2) })
    ]
    expect(agentConversation(agent.id, [older, ...excluded, latest], null)).toEqual(latest)
    expect(agentConversation(agent.id, [older, latest], older.id)).toEqual(older)
    useCore.setState({ conversations: { [older.id]: older, [latest.id]: latest } })
    openPinnedAgent(agent.id)
    expect(useCore.getState()).toMatchObject({ section: 'conversations', selectedConversationId: latest.id, overviewOpen: false, conversationDraft: false })
  })

  it('opens an agent draft when no ordinary chat exists and preserves an existing draft', () => {
    openPinnedAgent(agent.id)
    expect(useCore.getState()).toMatchObject({ section: 'conversations', draftProfileId: agent.id, conversationDraft: true, selectedConversationId: null })
    const carry = { text: '还没发送的内容', projects: ['/project'], agent: null, model: null }
    useCore.setState({ conversationDraftCarry: carry, worktreesOpen: true })
    openPinnedAgent(agent.id)
    expect(useCore.getState().conversationDraftCarry).toEqual(carry)
    expect(useCore.getState()).toMatchObject({ conversationDraft: true, draftProfileId: agent.id, worktreesOpen: false })
  })

  it('can explicitly start another chat and does nothing for a missing or archived agent', () => {
    const conversation = chat(10)
    useCore.setState({ conversations: { [conversation.id]: conversation } })
    openPinnedAgent(agent.id)
    newAgentConversation(agent.id)
    expect(useCore.getState()).toMatchObject({ draftProfileId: agent.id, conversationDraft: true, selectedConversationId: null })
    useCore.setState({ agentProfiles: { [agent.id]: { ...agent, archivedAt: 20 } }, overviewOpen: true })
    openPinnedAgent(agent.id)
    openPinnedAgent(id(99))
    expect(useCore.getState().overviewOpen).toBe(true)
  })
})
