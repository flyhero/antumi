import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES } from './preferences'
import { changedAppearancePreferences, withAppearanceDefaults } from './appearance-preferences'

describe('appearance group defaults', () => {
  const customized = {
    ...DEFAULT_PREFERENCES,
    theme: 'dark' as const,
    palette: 'nord' as const,
    chatFontSize: 18,
    chatFontFamily: 'Custom family',
    terminalFontSize: 16,
    language: 'en' as const,
    notifications: false
  }

  it('compares a copy of one group without changing saved settings', () => {
    const preview = withAppearanceDefaults(customized, DEFAULT_PREFERENCES, 'chat')
    expect(preview.chatFontSize).toBe(DEFAULT_PREFERENCES.chatFontSize)
    expect(preview.chatFontFamily).toBe(DEFAULT_PREFERENCES.chatFontFamily)
    expect(preview.palette).toBe('nord')
    expect(preview.terminalFontSize).toBe(16)
    expect(preview.notifications).toBe(false)
    expect(customized.chatFontSize).toBe(18)
    expect(customized.chatFontFamily).toBe('Custom family')
  })

  it('keeps language and chat preferences when resetting theme and palette', () => {
    const preview = withAppearanceDefaults(customized, DEFAULT_PREFERENCES, 'colors')
    expect(preview.theme).toBe(DEFAULT_PREFERENCES.theme)
    expect(preview.palette).toBe(DEFAULT_PREFERENCES.palette)
    expect(preview.language).toBe('en')
    expect(preview.chatFontSize).toBe(18)
  })

  it('offers only the selected group’s customized fields for a reset', () => {
    expect(changedAppearancePreferences(customized, DEFAULT_PREFERENCES, 'terminal')).toEqual(['terminalFontSize'])
    expect(changedAppearancePreferences(customized, DEFAULT_PREFERENCES, 'language')).toEqual(['language'])
    expect(changedAppearancePreferences(DEFAULT_PREFERENCES, DEFAULT_PREFERENCES, 'chat')).toEqual([])
  })
})
