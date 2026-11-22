import { describe, expect, it } from 'vitest'
import { Environment, blocksEverything, environmentProblems, type EnvironmentCheck } from './environment'

const check = (tool: EnvironmentCheck['tool'], status: EnvironmentCheck['status'], signedIn: boolean | null = null): EnvironmentCheck => ({
  tool,
  status,
  version: status === 'ok' ? '1.0.0' : null,
  path: status === 'missing' ? null : `/usr/bin/${tool}`,
  signedIn
})

describe('environment compatibility', () => {
  const known = { checks: [check('git', 'ok'), check('codex', 'ok', true)], checkedAt: 0, searchPath: ['/usr/bin'] }

  it('keeps known agents when a newer core includes unknown checks and installations', () => {
    const installation = { agent: 'codex', command: 'npm install -g @openai/codex', shell: 'bash' }
    const detected = { id: 'future-agent', name: 'Future Agent', locations: [] }
    expect(Environment.parse({
      ...known,
      checks: [...known.checks, { ...check('codex', 'ok'), tool: 'future-agent' }],
      cliInstallations: [installation, { agent: 'future-agent', command: 'future install', shell: 'bash' }],
      detectedAgents: [detected]
    })).toEqual({ ...known, cliInstallations: [installation], detectedAgents: [detected] })
  })

  it('still accepts an older core without the optional inventory', () => {
    expect(Environment.parse(known)).toEqual(known)
  })

  it('does not hide malformed entries for known agents', () => {
    expect(Environment.safeParse({ ...known, checks: [{ ...check('codex', 'ok'), status: 'future-status' }] }).success).toBe(false)
    expect(Environment.safeParse({ ...known, cliInstallations: [{ agent: 'codex', command: '', shell: 'bash' }] }).success).toBe(false)
    expect(Environment.safeParse({ ...known, checks: [{}] }).success).toBe(false)
    expect(Environment.safeParse({ ...known, cliInstallations: [{ agent: 7 }] }).success).toBe(false)
  })
})

describe('environmentProblems', () => {
  it('finds nothing wrong with git and a signed-in agent', () => {
    expect(environmentProblems({ checks: [check('git', 'ok'), check('claude', 'ok', true), check('codex', 'missing')] })).toEqual([])
  })

  it('reports git first, then the agents', () => {
    const problems = environmentProblems({ checks: [check('git', 'missing'), check('claude', 'missing'), check('codex', 'missing')] })
    expect(problems).toEqual([{ code: 'git-missing' }, { code: 'no-agent' }])
    expect(problems.every(blocksEverything)).toBe(true)
  })

  it('tells one agent signed out from none signed in', () => {
    expect(environmentProblems({ checks: [check('git', 'ok'), check('claude', 'ok', false), check('codex', 'ok', true)] })).toEqual([
      { code: 'signed-out', tool: 'claude' }
    ])
    expect(environmentProblems({ checks: [check('git', 'ok'), check('claude', 'ok', false), check('codex', 'ok', false)] })).toEqual([
      { code: 'no-signed-in-agent' }
    ])
    expect(blocksEverything({ code: 'signed-out', tool: 'claude' })).toBe(false)
  })

  it('gives a tool it could not ask the benefit of the doubt', () => {
    expect(environmentProblems({ checks: [check('git', 'unknown'), check('claude', 'unknown'), check('codex', 'missing')] })).toEqual([])
    expect(environmentProblems({ checks: [check('git', 'ok'), check('claude', 'unknown'), check('codex', 'ok', false)] })).toEqual([
      { code: 'signed-out', tool: 'codex' }
    ])
  })
})
