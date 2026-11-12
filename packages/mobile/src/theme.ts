import { useColorScheme } from 'react-native'

// The phone's own look: quiet neutrals, one warm accent for actions, color for state.

const light = {
  bg: '#F5F5F3',
  surface: '#FFFFFF',
  raised: '#EFEFEC',
  sunken: '#E8E8E4',
  border: 'rgba(17, 17, 17, 0.08)',
  borderStrong: 'rgba(17, 17, 17, 0.14)',
  text: '#141414',
  textMuted: '#6B6B6B',
  text3: '#A0A09C',
  accent: '#C2542D',
  accentText: '#FFFFFF',
  accentSoft: 'rgba(194, 84, 45, 0.10)',
  waiting: '#C27B0A',
  waitingSoft: 'rgba(214, 140, 18, 0.12)',
  running: '#2F6FE4',
  runningSoft: 'rgba(47, 111, 228, 0.10)',
  success: '#2E9B5A',
  danger: '#D14343',
  dangerSoft: 'rgba(209, 67, 67, 0.10)',
  userBubble: '#ECEBE7',
  codeBg: 'rgba(17, 17, 17, 0.05)',
  overlay: 'rgba(0, 0, 0, 0.32)',
  shadow: 'rgba(0, 0, 0, 0.08)'
}

export type Theme = typeof light

const dark: Theme = {
  bg: '#0B0B0C',
  surface: '#161618',
  raised: '#1F1F22',
  sunken: '#26262A',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',
  text: '#F3F3F2',
  textMuted: '#A3A3A6',
  text3: '#6E6E73',
  accent: '#E5794D',
  accentText: '#1A0F0A',
  accentSoft: 'rgba(229, 121, 77, 0.16)',
  waiting: '#E9A23B',
  waitingSoft: 'rgba(233, 162, 59, 0.16)',
  running: '#6EA2FF',
  runningSoft: 'rgba(110, 162, 255, 0.14)',
  success: '#4CC27F',
  danger: '#F0716B',
  dangerSoft: 'rgba(240, 113, 107, 0.14)',
  userBubble: '#232326',
  codeBg: 'rgba(255, 255, 255, 0.06)',
  overlay: 'rgba(0, 0, 0, 0.55)',
  shadow: 'rgba(0, 0, 0, 0)'
}

export const radius = { sm: 8, md: 12, lg: 18, xl: 24, pill: 999 }
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 }
export const type = {
  largeTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  rowTitle: { fontSize: 16, lineHeight: 21, fontWeight: '500' },
  secondary: { fontSize: 14, lineHeight: 19, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 17, fontWeight: '400' },
  micro: { fontSize: 12, lineHeight: 16, fontWeight: '500' }
} as const
export const mono = 'monospace'

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light
}
