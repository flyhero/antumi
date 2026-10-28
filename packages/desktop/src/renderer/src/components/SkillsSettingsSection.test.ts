import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand'
import type { SkillRepo } from '@antumi/protocol'
import { useCore } from '../core-store'
import { activeSkillAddTab, skillAddTabs, SkillsSettingsSection } from './SkillsSettingsSection'

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})

// Read the live store instead of Zustand's fixed SSR hydration snapshot.
vi.mock('zustand', async (importOriginal) => {
  const zustand = await importOriginal<typeof import('zustand')>()
  return { ...zustand, create: <T>() => (initializer: StateCreator<T>) => {
    const store = zustand.create(initializer)
    return Object.assign((selector: (state: T) => unknown) => selector(store.getState()), store)
  } }
})

const commit = 'a'.repeat(40)
const repo = (url: string): SkillRepo => ({ id: url.split('/').pop() ?? url, url, commit, previousCommit: null, installedAt: 0, updatedAt: 0, plugin: null, skills: [] })

beforeEach(() => {
  useCore.setState({ ...useCore.getInitialState(), connection: 'connected', skillRepos: [] }, true)
})

describe('SkillsSettingsSection', () => {
  it('puts installed skills and installation routes in one navigation group', () => {
    useCore.setState({ skillRepos: [repo('https://github.com/kepano/obsidian-skills')] })
    const html = renderToStaticMarkup(createElement(SkillsSettingsSection))
    expect(html.match(/class="settings-card"/g)).toHaveLength(2)
    expect(html.match(/role="radiogroup"/g)).toHaveLength(1)
    expect(html).toContain('已安装 · 1')
    expect(html).toContain('从其他仓库安装')
  })

  it('says where to start when nothing is installed', () => {
    const html = renderToStaticMarkup(createElement(SkillsSettingsSection))
    expect(html).toContain('>已安装<')
    expect(html).toContain('为 Agent 安装技能')
  })

  it('offers a tab per way to add a skill, and only the address when that is the only way', () => {
    expect(skillAddTabs({ recommended: true, search: true })).toEqual(['recommended', 'search', 'url'])
    expect(skillAddTabs({ recommended: false, search: true })).toEqual(['search', 'url'])
    expect(skillAddTabs({ recommended: false, search: false })).toEqual(['url'])
    expect(activeSkillAddTab(['search', 'url'], 'recommended')).toBe('search')
    expect(activeSkillAddTab(['recommended', 'search', 'url'], 'url')).toBe('url')
  })

  it('keeps installed and search routes alongside URL installation without activation support', () => {
    useCore.setState({ rpc: { features: ['skills-search'] } as never })
    const html = renderToStaticMarkup(createElement(SkillsSettingsSection))
    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('搜索技能市场')
    expect(html).toContain('从其他仓库安装')
    expect(html).toContain('搜 skills.sh 上的技能')
    expect(html).toContain('aria-checked="true">已安装</button>')
    expect(html).not.toContain('发现技能')
  })

  it('shows activation when supported without introducing a second navigation level', () => {
    useCore.setState({ rpc: { features: ['skills-search', 'skills-activation'] } as never, skillRepos: [{ ...repo('https://github.com/team/skills'), skills: [{ name: 'review', description: 'Reviews code.', dir: 'skills/review', problem: null }], activation: { mode: 'selected', skills: ['review'], agents: null } }] })
    const html = renderToStaticMarkup(createElement(SkillsSettingsSection))
    expect(html).not.toContain('发现技能')
    expect(html.match(/role="radiogroup"/g)).toHaveLength(1)
    expect(html).toContain('启用设置')
    expect(html).toContain('自选技能 · 全部兼容 Agent')
    expect(html).toContain('role="switch"')
  })
})
