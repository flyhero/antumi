import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

describe('Markdown theme preferences', () => {
  it('restores a valid library and skips malformed imported items independently', async () => {
    vi.resetModules()
    const pack = { format: 'antumi-markdown-theme', version: 1, id: '5dde10ce-045e-42d5-b2d7-3510edf38fc1', name: 'Shared', css: 'h2 { font-weight: 700; }' }
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ markdownTheme: `user:${pack.id}`, markdownThemePacks: [pack, { ...pack, source: 'invalid-url' }], palette: 'nord' }), setItem: vi.fn() })
    const { usePreferences } = await import('./preferences')
    expect(usePreferences.getState().markdownThemePacks).toHaveLength(1)
    expect(usePreferences.getState().markdownTheme).toBe(`user:${pack.id}`)
    expect(usePreferences.getState().palette).toBe('nord')
  })
  it.each([undefined, 'removed-theme', 'minimal'])('falls back for missing or outdated theme %s without resetting other preferences', async (markdownTheme) => {
    vi.resetModules()
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ markdownTheme, palette: 'nord' }), setItem: vi.fn() })
    const { usePreferences } = await import('./preferences')
    expect(usePreferences.getState().markdownTheme).toBe('default')
    expect(usePreferences.getState().palette).toBe('nord')
  })

  it.each(['newsprint', 'sunset', 'ocean', 'neon'] as const)('persists the %s theme across reloads', async (theme) => {
    vi.resetModules()
    let saved = '{}'
    vi.stubGlobal('localStorage', { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value } })
    const { setPreference } = await import('./preferences')
    setPreference('markdownTheme', theme)
    vi.resetModules()
    const { usePreferences } = await import('./preferences')
    expect(usePreferences.getState().markdownTheme).toBe(theme)
  })
})
