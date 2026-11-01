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
