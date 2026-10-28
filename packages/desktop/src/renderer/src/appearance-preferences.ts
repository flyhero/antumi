import type { Preferences } from './preferences'

export const APPEARANCE_SECTIONS = ['colors', 'chat', 'terminal', 'language'] as const
export type AppearanceSection = typeof APPEARANCE_SECTIONS[number]

const SECTION_PREFERENCES = {
  colors: ['theme', 'palette', 'backdrop'],
  chat: ['chatFontSize', 'chatFont', 'chatFontFamily', 'chatCjkFontFamily', 'chatWidth', 'foldTurns'],
  terminal: ['codeFontFamily', 'codeCjkFontFamily', 'terminalFontSize', 'terminalLineHeight', 'colorPrompt'],
  language: ['language']
} as const

export function changedAppearancePreferences(current: Preferences, defaults: Preferences, section: AppearanceSection) {
  return SECTION_PREFERENCES[section].filter((key) => current[key] !== defaults[key])
}

// Comparing uses a copy: the user's saved preferences never change until they reset the group.
export function withAppearanceDefaults(current: Preferences, defaults: Preferences, section: AppearanceSection): Preferences {
  const preview = { ...current }
  for (const key of SECTION_PREFERENCES[section]) Object.assign(preview, { [key]: defaults[key] })
  return preview
}
