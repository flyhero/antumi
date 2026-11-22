import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand'
import type { AgentAccount, AgentKind, Environment, EnvironmentCheck } from '@antumi/protocol'
import { useCore } from '../core-store'
import { AgentAccountSettings } from './AgentAccountSettings'

vi.mock('zustand', async (original) => {
  const actual = await original<typeof import('zustand')>()
  return { ...actual, create: <T>() => (initializer: StateCreator<T>) => {
    const store = actual.create(initializer)
    return Object.assign((selector: (state: T) => unknown) => selector(store.getState()), store)
  } }
})

const account = (agent: AgentKind): AgentAccount => ({ id: 'default', agent, label: null, email: null, plan: null, signedIn: false, createdAt: 0 })
const check = (tool: AgentKind, status: EnvironmentCheck['status']): EnvironmentCheck => ({ tool, status, path: status === 'missing' ? null : `/bin/${tool}`, version: null, signedIn: null })
const environment: Environment = { checks: [check('claude', 'ok'), check('codex', 'ok'), check('codebuddy', 'missing')], searchPath: [], checkedAt: 0 }
const render = () => renderToStaticMarkup(createElement(AgentAccountSettings))

beforeEach(() => {
  useCore.setState(useCore.getInitialState(), true)
  useCore.setState({ connection: 'connected', environment, accounts: { accounts: [account('claude'), account('codex'), account('codebuddy')], active: {}, autoSwitch: true } })
})

describe('account settings availability', () => {
  it('shows account controls only for installed agents', () => {
    const html = render()
    expect(html).toContain('添加 Claude Code 账号')
    expect(html).toContain('添加 Codex 账号')
    expect(html).not.toContain('CodeBuddy')
    expect(html.match(/class="account-agent-group"/g)).toHaveLength(2)
  })

  it('does not treat a desktop application without its CLI as installed', () => {
    useCore.setState({ environment: { ...environment, detectedAgents: [{ id: 'codebuddy', name: 'CodeBuddy', locations: [{ source: 'application', path: '/Applications/CodeBuddy.app' }] }] } })
    expect(render()).not.toContain('CodeBuddy')
  })

  it('does not offer an agent the connected core has no accounts for', () => {
    useCore.setState({ environment: { ...environment, checks: [check('claude', 'ok'), check('codebuddy', 'ok')] }, accounts: { accounts: [account('claude')], active: {}, autoSwitch: true } })
    expect(render()).not.toContain('CodeBuddy')
    expect(render()).toContain('添加 Claude Code 账号')
  })

  it('keeps a detected CLI available when its version probe is inconclusive', () => {
    useCore.setState({ environment: { ...environment, checks: [check('codebuddy', 'unknown')] } })
    expect(render()).toContain('aria-label="CodeBuddy"')
  })

  it('waits for installation checks before offering sign-in', () => {
    useCore.setState({ environment: null })
    expect(render()).toContain('正在读取账号')
    expect(render()).not.toContain('account-agent-group')
  })

  it('offers installation when no account-capable CLI is installed', () => {
    useCore.setState({ environment: { ...environment, checks: [check('claude', 'missing'), check('codex', 'missing'), check('codebuddy', 'missing')] } })
    const html = render()
    expect(html).toContain('查看外部智能体')
    expect(html).not.toContain('account-agent-group')
    expect(html).not.toContain('添加 CodeBuddy 账号')
  })
})
