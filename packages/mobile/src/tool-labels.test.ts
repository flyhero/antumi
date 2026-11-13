import { describe, expect, it } from 'vitest'
import { AGENT_CALL_TOOLS, MANAGEMENT_TOOLS, PULL_REQUEST_TOOLS, SQUAD_TOOL_NAMES, type ChatItem } from '@antumi/protocol'
import { readableNotice, turnText, usageLimitText, workedFor } from './chat-text'
import { fill, strings } from './i18n'
import { runSummary, toolLabel } from './tool-labels'

// In whichever language the test machine runs: the words come from strings, the logic is checked.

describe('naming tool calls as the computer does', () => {
  it('names the agents’ own tools, Antumi’s and the browser’s', () => {
    expect(toolLabel('Bash')).toBe(strings.toolNames.command)
    expect(toolLabel('fileChange')).toBe(strings.toolNames.modifyFiles)
    expect(toolLabel(`mcp__antumi__${MANAGEMENT_TOOLS.profileList}`)).toBe(strings.antumiTools.profileList)
    expect(toolLabel(`mcp__antumi__${AGENT_CALL_TOOLS.dispatch}`)).toBe(strings.antumiTools.agentDispatch)
    expect(toolLabel(`mcp__antumi__${SQUAD_TOOL_NAMES.roster}`)).toBe(strings.antumiTools.squadRoster)
    expect(toolLabel(`mcp__antumi__${PULL_REQUEST_TOOLS.create}`)).toBe(strings.antumiTools.pullRequestCreate)
    expect(toolLabel('mcp__antumi__browser_navigate')).toBe(strings.browserTools.navigate)
  })

  it('names another MCP server’s tool by the server and the tool, and leaves an unknown one as it is', () => {
    expect(toolLabel('mcp__claude_ai_Linear_App__get_issue')).toBe('Linear App · get_issue')
    expect(toolLabel('mcp__x__y', { name: 'Get issue', server: 'Atlassian' })).toBe('Atlassian · Get issue')
    expect(toolLabel('somethingNew')).toBe('somethingNew')
  })

  it('sums a run up by what it did, in the order each kind came up', () => {
    const run = [{ name: 'Read' }, { name: 'Bash' }, { name: 'Read' }, { name: 'Grep' }, { name: 'TodoWrite' }]
    expect(runSummary(run)).toBe([
      fill(strings.runReadFiles, { count: 2 }), fill(strings.runCommands, { count: 1 }), fill(strings.runSearched, { count: 1 }),
      fill(strings.runTimes, { label: strings.toolNames.toDos, count: 1 })
    ].join(strings.listSeparator))
  })
})

const turn = (overrides: Partial<Extract<ChatItem, { kind: 'turn' }>>): Extract<ChatItem, { kind: 'turn' }> => ({
  kind: 'turn', id: 't', stageId: 's', revision: 0, at: 0, state: 'completed', error: null, durationMs: null, ...overrides
})

describe('the chat’s own lines', () => {
  it('says how long something worked', () => {
    expect(workedFor(4_200)).toBe(fill(strings.durationSeconds, { seconds: 4 }))
    expect(workedFor(65_000)).toBe(fill(strings.durationMinutesSeconds, { minutes: 1, seconds: 5 }))
    expect(workedFor(3_600_000)).toBe(fill(strings.durationHours, { hours: 1 }))
  })

  it('says how a turn ended, with its time and tokens', () => {
    const took = ` · ${fill(strings.durationSeconds, { seconds: 3 })} · ↑ 1.2k ↓ 340`
    expect(turnText(turn({ durationMs: 3000, usage: { input: 1200, output: 340 } }))).toBe(fill(strings.turnCompleted, { why: '', took }))
    expect(turnText(turn({ state: 'failed', error: 'boom', resumed: true, resumedBy: 'subagent' })))
      .toBe(fill(strings.turnFailed, { why: strings.resumedAfterSubagent, took: '', error: '：boom' }))
  })

  it('says when a usage limit lifts, or that it did', () => {
    const limit: Extract<ChatItem, { kind: 'usageLimit' }> = { kind: 'usageLimit', id: 'l', stageId: 's', revision: 0, at: 0, message: null, resetsAt: null, autoContinue: false, status: 'waiting', continueAt: null, continuedAt: null, error: null }
    expect(usageLimitText(limit)).toBe(strings.usageLimitExhausted)
    expect(usageLimitText({ ...limit, resetsAt: 1000 }, 2000)).toBe(strings.usageLimitRestored)
    expect(usageLimitText({ ...limit, status: 'continued' })).toBe(strings.usageLimitResumed)
  })

  it('reads Claude’s epoch reset time as a clock time', () => {
    expect(readableNotice('Claude AI usage limit reached|1700000000')).not.toContain('1700000000')
    expect(readableNotice('plain words')).toBe('plain words')
  })
})
