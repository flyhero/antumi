import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand'
import { agentSetupIdentity, ModelProvider, type Environment, type ExternalSession } from '@antumi/protocol'
import { openGuide, openOverview, setSettingsOpen, useCore } from '../core-store'
import { useExternalSessions } from '../external-sessions'
import { setLocale } from '../i18n'
import { DEFAULT_PREFERENCES, usePreferences } from '../preferences'
import { useProviderProbes } from '../provider-probes'
import { openSetup, updateSetup } from '../setup-controller'
import { SetupProgress } from '../setup-progress'
import { SetupGuide } from './SetupGuide'

vi.hoisted(() => {
  const matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('window', { antumi: undefined, matchMedia, addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('matchMedia', matchMedia)
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})

vi.mock('zustand', async (importOriginal) => {
  const zustand = await importOriginal<typeof import('zustand')>()
  return { ...zustand, create: <T>() => (initializer: StateCreator<T>) => {
    const store = zustand.create(initializer)
    return Object.assign((selector: (state: T) => unknown) => selector(store.getState()), store)
  } }
})
vi.mock('./PetSprite', () => ({ usePetSkin: () => ({ render: () => createElement('span', { 'data-test-pet': true }) }) }))

const env = (signedIn: boolean | null, status: 'ok' | 'unknown' = 'ok'): Environment => ({ checks: [{ tool: 'codex', status, signedIn, version: '1.0.0', path: '/bin/codex' }], checkedAt: 0, searchPath: [] })
const render = () => renderToStaticMarkup(createElement(SetupGuide))

beforeEach(() => {
  useCore.setState({ ...useCore.getInitialState(), connection: 'connected', environment: env(false), sources: [] }, true)
  usePreferences.setState({ ...DEFAULT_PREFERENCES, petLevel: 'off', setup: SetupProgress.parse({ status: 'active' }) }, true)
  useProviderProbes.setState({ probes: {} })
  useExternalSessions.setState({ sessions: [], loading: false })
  setLocale('zh-CN')
})

describe('SetupGuide', () => {
  it('explains a proven sign-out without inviting the user to confirm an unknown state', () => {
    const html = render()
    expect(html).toContain('需要登录账号')
    expect(html).toContain('codex login')
    expect(html).toContain('打开外部智能体')
    expect(html).not.toContain('已在外部智能体中配置')
    expect(html).not.toContain('data-test-pet')
    expect(html).not.toContain('开始第一条会话')
  })

  it('only accepts native confirmation when the account status, rather than the CLI, is unknown', () => {
    useCore.setState({ environment: env(null) })
    expect(render()).toContain('已在外部智能体中配置')
    useCore.setState({ environment: env(null, 'unknown') })
    expect(render()).not.toContain('已在外部智能体中配置')
  })

  it('keeps a confirmed native setup visibly unverified and goes directly to the source question', () => {
    const environment = env(null)
    useCore.setState({ environment })
    updateSetup({ confirmed: agentSetupIdentity('codex', environment) })
    const html = render()
    expect(html).toContain('原生配置由你确认')
    expect(html).toContain('尚未进行连接验证')
    expect(html).toContain('暂时不需要')
  })

  it('persists pause, resume, and completion without generating a conversation', () => {
    updateSetup({ status: 'paused', agent: 'codex' })
    expect(render()).toBe('')
    openSetup()
    expect(usePreferences.getState().setup.agent).toBe('codex')
    expect(render()).toContain('检查使用环境')
    useCore.setState({ environment: env(true) })
    updateSetup({ sourceChoice: 'skip' })
    expect(render()).toContain('完成检查')
    updateSetup({ status: 'complete' })
    useCore.setState({ environment: env(false) })
    expect(render()).toBe('')
    expect(useCore.getState().conversations).toEqual({})
  })

  it('offers to go on with sessions run in a terminal once the agent is ready, and moves on when skipped', () => {
    const session: ExternalSession = { agent: 'codex', sessionId: 'a', cwd: '/work/shop', title: 'Fix the CSV export', firstPrompt: 'fix it', startedAt: 0, updatedAt: Date.now(), status: 'new', conversationId: null, problem: null }
    useCore.setState({ environment: env(true) })
    useExternalSessions.setState({ sessions: null })
    expect(render()).toContain('正在找你在终端里用过的会话')
    useExternalSessions.setState({ sessions: [session, { ...session, sessionId: 'b', cwd: '/work/api' }] })
    const html = render()
    expect(html).toContain('找到 2 个 Codex 会话')
    expect(html).toContain('Fix the CSV export')
    expect(html).toContain('shop')
    expect(html).toContain('接着聊')
    expect(html).not.toContain('暂时不需要')
    updateSetup({ sessionChoice: 'skip' })
    expect(render()).toContain('暂时不需要')
  })

  it('keeps the pet and actions available in settings, without forcing an off pet on', () => {
    useCore.setState({ settingsOpen: true })
    expect(render()).toContain('打开外部智能体')
    expect(render()).not.toContain('data-test-pet')
    usePreferences.setState({ petLevel: 'medium' })
    expect(render()).toContain('data-test-pet')
  })

  it('hides while reading the guide and restores the same progress on leaving it', () => {
    updateSetup({ agent: 'codex', sourceChoice: 'configure' })
    const progress = usePreferences.getState().setup
    openGuide()
    expect(render()).toBe('')
    expect(usePreferences.getState().setup).toEqual(progress)
    openOverview()
    expect(render()).toContain('检查使用环境')
    expect(usePreferences.getState().setup).toEqual(progress)
  })

  it('shows setup when following a settings link from the guide or explicitly resuming', () => {
    openGuide()
    setSettingsOpen(true, 'agents')
    expect(render()).toContain('打开外部智能体')
    openGuide()
    updateSetup({ status: 'paused', agent: 'codex' })
    openSetup()
    expect(useCore.getState().guideOpen).toBe(false)
    expect(usePreferences.getState().setup.agent).toBe('codex')
    expect(render()).toContain('检查使用环境')
  })

  it('shows waiting on disconnection rather than recommending configuration from stale data', () => {
    useCore.setState({ connection: 'connecting' })
    expect(render()).toContain('连接工作台后继续检查')
    expect(render()).not.toContain('打开外部智能体')
  })

  it('distinguishes configured providers from tested ones and ignores results from earlier edits', () => {
    const provider = ModelProvider.parse({ id: 'example', name: 'Example', preset: 'custom', anthropic: null, openai: { responsesUrl: 'https://api.example.com/v1', chatUrl: null }, models: [{ id: 'model', label: null, contextWindow: null, maxOutput: null, efforts: [] }], defaultModel: 'model', smallModel: 'model', agents: ['codex'], hasKey: true, revision: 2, createdAt: 0, updatedAt: 0 })
    useCore.setState({ modelProviders: [provider] })
    expect(render()).toContain('尚未执行连接测试')
    useProviderProbes.setState({ probes: { example: { revision: 2, result: { ok: false, checks: [], at: 0 } } } })
    expect(render()).toContain('连接测试未通过')
    updateSetup({ sourceChoice: 'skip' })
    expect(render()).not.toContain('完成检查')
    useProviderProbes.setState({ probes: { example: { revision: 1, result: { ok: true, checks: [], at: 0 } } } })
    expect(render()).not.toContain('连接测试已通过')
  })

  it('renders English copy and yields its reserved area while another operation needs input', () => {
    setLocale('en')
    useCore.setState({ newTaskOpen: true })
    expect(render()).toContain('Sign in to an account')
    expect(render()).toContain('data-blocked="true"')
  })
})
