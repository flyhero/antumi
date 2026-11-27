import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, string>()
let events: EventTarget
let resolveDefault: (mode: unknown) => void

beforeEach(() => {
  vi.resetModules()
  storage.clear()
  events = new EventTarget()
  const response = new Promise<unknown>((resolve) => { resolveDefault = resolve })
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  })
  vi.stubGlobal('window', {
    antumi: { requestPopupDefaultMode: () => response },
    addEventListener: events.addEventListener.bind(events)
  })
})

afterEach(() => vi.unstubAllGlobals())

it('preserves the pinned agents and their order after restarting', async () => {
  const ids = ['22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111']
  const { setPreference } = await import('./preferences')
  setPreference('pinnedAgentIds', ids)
  vi.resetModules()
  const { usePreferences } = await import('./preferences')
  expect(usePreferences.getState().pinnedAgentIds).toEqual(ids)
})

it('remembers the release already introduced after restarting', async () => {
  const { setPreference } = await import('./preferences')
  setPreference('releaseNotesVersion', '0.22.0-beta.3')
  vi.resetModules()
  const { usePreferences } = await import('./preferences')
  expect(usePreferences.getState().releaseNotesVersion).toBe('0.22.0-beta.3')
})

it('remembers a provider per agent, including native configuration and unavailable provider IDs', async () => {
  storage.set('antumi.preferences', JSON.stringify({ defaultProviders: { claude: 'gateway-123', codex: null } }))
  const { usePreferences, setPreference } = await import('./preferences')
  expect(usePreferences.getState().defaultProviders).toEqual({ claude: 'gateway-123', codex: null })
  setPreference('defaultProviders', { claude: 'another-gateway', codex: null })
  expect(JSON.parse(storage.get('antumi.preferences') ?? '{}').defaultProviders).toEqual({ claude: 'another-gateway', codex: null })
})

describe('project color preferences', () => {
  it('persists color choices and loads them after a restart', async () => {
    const { setPreference } = await import('./preferences')
    setPreference('projectColors', { '/projects/antumi': 'purple' })
    expect(JSON.parse(storage.get('antumi.preferences') ?? '{}').projectColors).toEqual({ '/projects/antumi': 'purple' })
    vi.resetModules()
    const { usePreferences } = await import('./preferences')
    expect(usePreferences.getState().projectColors).toEqual({ '/projects/antumi': 'purple' })
  })

  it('defaults old preferences and discards invalid colors without losing the theme', async () => {
    storage.set('antumi.preferences', JSON.stringify({ theme: 'dark', projectColors: { '/projects/app': 'invalid' } }))
    const { usePreferences } = await import('./preferences')
    expect(usePreferences.getState().projectColors).toEqual({})
    expect(usePreferences.getState().theme).toBe('dark')
  })
})

describe('island preference defaults', () => {
  it.each(['always', 'requests'])('uses the display default %s when no mode is saved', async (mode) => {
    const { followPreferences, usePreferences, DEFAULT_PREFERENCES } = await import('./preferences')
    followPreferences()
    resolveDefault(mode)
    await Promise.resolve()
    expect(usePreferences.getState().island).toBe(mode)
    expect(DEFAULT_PREFERENCES.island).toBe(mode)
  })

  it.each(['off', 'requests', 'always'])('preserves the saved mode %s', async (island) => {
    storage.set('antumi.preferences', JSON.stringify({ island }))
    const { followPreferences, usePreferences, DEFAULT_PREFERENCES } = await import('./preferences')
    followPreferences()
    resolveDefault('always')
    await Promise.resolve()
    expect(usePreferences.getState().island).toBe(island)
    expect(DEFAULT_PREFERENCES.island).toBe('always')
  })

  it.each([true, false])('preserves the legacy request popup switch %s', async (requestPopup) => {
    storage.set('antumi.preferences', JSON.stringify({ requestPopup }))
    const { followPreferences, usePreferences } = await import('./preferences')
    followPreferences()
    resolveDefault('always')
    await Promise.resolve()
    expect(usePreferences.getState().island).toBe(requestPopup ? 'requests' : 'off')
  })

  it('keeps a choice made while waiting for the display, even if it equals the fallback', async () => {
    const { followPreferences, setPreference, usePreferences } = await import('./preferences')
    followPreferences()
    setPreference('island', 'requests')
    resolveDefault('always')
    await Promise.resolve()
    expect(usePreferences.getState().island).toBe('requests')
  })

  it('keeps a choice received from another window while waiting for the display', async () => {
    const { followPreferences, usePreferences } = await import('./preferences')
    followPreferences()
    storage.set('antumi.preferences', JSON.stringify({ island: 'off' }))
    events.dispatchEvent(Object.assign(new Event('storage'), { key: 'antumi.preferences' }))
    resolveDefault('always')
    await Promise.resolve()
    expect(usePreferences.getState().island).toBe('off')
  })

  it('still applies the display default after an unrelated preference is saved', async () => {
    const { followPreferences, setPreference, usePreferences } = await import('./preferences')
    followPreferences()
    setPreference('notifications', false)
    resolveDefault('always')
    await Promise.resolve()
    expect(usePreferences.getState()).toMatchObject({ island: 'always', notifications: false })
    expect(JSON.parse(storage.get('antumi.preferences') ?? '{}')).toMatchObject({ island: 'always', notifications: false })
  })

  it('uses the safe fallback with an older desktop bridge', async () => {
    vi.stubGlobal('window', { addEventListener: events.addEventListener.bind(events) })
    const { followPreferences, usePreferences } = await import('./preferences')
    followPreferences()
    expect(usePreferences.getState().island).toBe('requests')
  })
})

describe('group chats joining the conversation list', () => {
  it.each([
    [{}, 'all', false],
    [{ sidebarDiscussions: false }, 'conversations', false],
    [{ showArchivedDiscussions: true }, 'all', true],
    [{ showArchivedConversations: true, sidebarDiscussions: true }, 'all', true]
  ])('carries %j over once', async (saved, kinds, archived) => {
    storage.set('antumi.preferences', JSON.stringify(saved))
    const { usePreferences } = await import('./preferences')
    expect(usePreferences.getState().conversationKinds).toBe(kinds)
    expect(usePreferences.getState().showArchivedConversations).toBe(archived)
  })

  it('leaves a choice made since alone', async () => {
    storage.set('antumi.preferences', JSON.stringify({ conversationKinds: 'discussions', sidebarDiscussions: false, showArchivedDiscussions: true }))
    const { usePreferences } = await import('./preferences')
    expect(usePreferences.getState().conversationKinds).toBe('discussions')
    expect(usePreferences.getState().showArchivedConversations).toBe(false)
  })
})

describe('the sidebar splitting into a menu and a list', () => {
  it.each([
    [{}, 264],
    [{ sidebarWidth: 400 }, 344],
    [{ sidebarWidth: 240 }, 240]
  ])('gives the list the room the one column had beside the icon menu: %j', async (saved, width) => {
    storage.set('antumi.preferences', JSON.stringify(saved))
    const { usePreferences } = await import('./preferences')
    expect(usePreferences.getState().conversationListWidth).toBe(width)
  })

  it('keeps a sidebar that was put away out of the way, down to the icons', async () => {
    storage.set('antumi.preferences', JSON.stringify({ sidebarHidden: true }))
    const { usePreferences } = await import('./preferences')
    expect(usePreferences.getState().sidebarMenuCollapsed).toBe(true)
    expect(usePreferences.getState().sidebarHidden).toBe(true)
  })

  it('keeps the one column for a sidebar that showed', async () => {
    storage.set('antumi.preferences', JSON.stringify({ sidebarWidth: 400 }))
    const { usePreferences } = await import('./preferences')
    expect(usePreferences.getState().sidebarMenuCollapsed).toBe(false)
    expect(usePreferences.getState().sidebarWidth).toBe(400)
  })

  it('leaves a list width set since alone', async () => {
    storage.set('antumi.preferences', JSON.stringify({ sidebarWidth: 400, sidebarMenuCollapsed: true, conversationListWidth: 300 }))
    const { usePreferences } = await import('./preferences')
    expect(usePreferences.getState().conversationListWidth).toBe(300)
  })
})

describe('windows sharing preferences', () => {
  it('keeps what another window changed when a window with an older copy saves', async () => {
    const main = await import('./preferences')
    vi.resetModules()
    const card = await import('./preferences')
    main.setPreference('palette', 'indigo')
    card.setPreference('chatFontSize', 16)
    vi.resetModules()
    const { usePreferences } = await import('./preferences')
    expect(usePreferences.getState().palette).toBe('indigo')
    expect(usePreferences.getState().chatFontSize).toBe(16)
  })

  it('keeps preferences a newer version saved', async () => {
    storage.set('antumi.preferences', JSON.stringify({ palette: 'nord', laterSetting: 'kept' }))
    const { setPreference } = await import('./preferences')
    setPreference('theme', 'dark')
    expect(JSON.parse(storage.get('antumi.preferences') ?? '{}')).toMatchObject({ palette: 'nord', laterSetting: 'kept', theme: 'dark' })
  })

  it('stores what was carried over, so a later change is not undone', async () => {
    storage.set('antumi.preferences', JSON.stringify({ showArchivedDiscussions: true }))
    const { setPreference } = await import('./preferences')
    setPreference('showArchivedConversations', false)
    vi.resetModules()
    const { usePreferences } = await import('./preferences')
    expect(usePreferences.getState().showArchivedConversations).toBe(false)
  })
})

describe('backdrop preferences', () => {
  it('defaults absent fields independently and handles non-record inputs', async () => {
    const { parsePreferences } = await import('./preferences')
    const expected = { backdropMode: 'none', backdropPreset: 'aurora', backdropScope: 'full', backdropOpacity: 65, backdropBlur: 0, backdropSurfaceOpacity: 68, backdropGlassBlur: 12, backdropFit: 'cover', wallpaper: null }
    for (const saved of [{}, null, [], 'invalid']) expect(parsePreferences(saved)).toMatchObject(expected)
  })
  it('preserves valid boundaries and falls back for invalid numbers, enums, or assets', async () => {
    const { parsePreferences } = await import('./preferences')
    const wallpaper = { ext: 'avif', version: '123-16', size: 16 }
    expect(parsePreferences({ theme: 'dark', backdropMode: 'image', backdropPreset: 'forest', backdropScope: 'frame', backdropOpacity: 5, backdropBlur: 30, backdropSurfaceOpacity: 95, backdropGlassBlur: 24, backdropFit: 'contain', wallpaper })).toMatchObject({ theme: 'dark', backdropMode: 'image', backdropPreset: 'forest', backdropScope: 'frame', backdropOpacity: 5, backdropBlur: 30, backdropSurfaceOpacity: 95, backdropGlassBlur: 24, backdropFit: 'contain', wallpaper })
    expect(parsePreferences({ backdropOpacity: 100, backdropBlur: 0, backdropSurfaceOpacity: 30, backdropGlassBlur: 0 })).toMatchObject({ backdropOpacity: 100, backdropBlur: 0, backdropSurfaceOpacity: 30, backdropGlassBlur: 0 })
    for (const bad of [-1, 200, 1.5, '60', null]) {
      expect(parsePreferences({ theme: 'dark', backdropOpacity: bad, backdropBlur: bad, backdropSurfaceOpacity: bad, backdropGlassBlur: bad })).toMatchObject({ theme: 'dark', backdropOpacity: 65, backdropBlur: 0, backdropSurfaceOpacity: 68, backdropGlassBlur: 12 })
    }
    expect(parsePreferences({ backdropMode: 'bad', backdropPreset: 'bad', backdropScope: 'bad', backdropFit: 'bad', wallpaper: { ...wallpaper, ext: 'svg' } })).toMatchObject({ backdropMode: 'none', backdropPreset: 'aurora', backdropScope: 'full', backdropFit: 'cover', wallpaper: null })
    for (const patch of [{ version: '' }, { size: 0 }, { size: 20 * 1024 * 1024 + 1 }]) expect(parsePreferences({ wallpaper: { ...wallpaper, ...patch } }).wallpaper).toBeNull()
  })
  it.each([
    ['none', 'none', 'aurora'], ['sea-glass', 'preset', 'sea-glass'], ['funky-fresh', 'preset', 'funky-fresh'], ['invalid', 'none', 'aurora']
  ])('migrates legacy backdrop %s once, removing the obsolete key', async (backdrop, mode, preset) => {
    const { migratePreferencesRecord, parsePreferences } = await import('./preferences')
    const original = { backdrop, theme: 'dark', conversationKinds: 'all', sidebarMenuCollapsed: false }
    const migrated = migratePreferencesRecord(original)
    expect(migrated).not.toBe(original)
    expect(migrated).not.toHaveProperty('backdrop')
    expect(original.backdrop).toBe(backdrop)
    expect(migratePreferencesRecord(migrated)).toBe(migrated)
    expect(parsePreferences(original)).toMatchObject({ backdropMode: mode, backdropPreset: preset, backdropScope: 'full', theme: 'dark' })
  })
  it('does not overwrite an already-migrated mode or its preset', async () => {
    const { migratePreferencesRecord, parsePreferences } = await import('./preferences')
    const saved = { backdrop: 'sea-glass', backdropMode: 'image', backdropPreset: 'nebula', conversationKinds: 'all', sidebarMenuCollapsed: true }
    expect(migratePreferencesRecord(saved)).toBe(saved)
    expect(parsePreferences(saved)).toMatchObject({ backdropMode: 'image', backdropPreset: 'nebula' })
    expect(parsePreferences(saved)).not.toHaveProperty('backdrop')
  })
  it('persists the migration once so a later choice survives restarting', async () => {
    storage.set('antumi.preferences', JSON.stringify({ backdrop: 'sea-glass' }))
    const { setPreference, usePreferences } = await import('./preferences')
    expect(usePreferences.getState().backdropMode).toBe('preset')
    expect(JSON.parse(storage.get('antumi.preferences') ?? '{}')).not.toHaveProperty('backdrop')
    setPreference('backdropMode', 'none')
    vi.resetModules()
    const restarted = await import('./preferences')
    expect(restarted.usePreferences.getState().backdropMode).toBe('none')
  })
  it('retains the existing migrations alongside backdrop migration', async () => {
    const { parsePreferences } = await import('./preferences')
    expect(parsePreferences({ backdrop: 'funky-fresh', translateModels: { codex: 'small' }, requestPopup: false, sidebarDiscussions: false, showArchivedDiscussions: true, sidebarHidden: true, sidebarWidth: 400 })).toMatchObject({ backdropMode: 'preset', backdropPreset: 'funky-fresh', quickModels: { codex: 'small' }, island: 'off', conversationKinds: 'conversations', showArchivedConversations: true, sidebarMenuCollapsed: true, conversationListWidth: 344 })
  })
})
