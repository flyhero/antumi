import type { CSSProperties } from 'react'
import { z } from 'zod'
import { MARKDOWN_THEMES, MARKDOWN_THEME_LABEL } from './markdown-themes'
import { markdownThemeCss, MAX_THEME_CSS } from './markdown-theme-css'

export const MAX_THEME_PACKS = 24
const colour = z.string().regex(/^#[\da-fA-F]{6}$/)
const colourPair = z.object({ light: colour, dark: colour })
export const MarkdownThemeVersion = z.string().max(32).regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
export const MarkdownCommunityId = z.string().min(2).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const source = z.string().url().refine((value) => {
  try { return new URL(value).protocol === 'https:' } catch { return false }
})

export const MarkdownThemeManifest = z.object({
  format: z.literal('antumi-markdown-theme'),
  version: z.literal(1),
  themeVersion: MarkdownThemeVersion.optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(240).default(''),
  author: z.string().max(80).default(''),
  source: source.optional(),
  license: z.string().max(80).default(''),
  base: z.enum(MARKDOWN_THEMES).default('default'),
  primary: colourPair.optional(),
  secondary: colourPair.optional(),
  // Retain legacy metadata when sharing a theme, without applying it to reading settings.
  fontSize: z.number().int().min(12).max(20).optional(),
  lineHeight: z.number().min(1.4).max(2.4).optional(),
  paragraphSpacing: z.number().min(0.4).max(1.6).optional(),
  css: z.string().max(MAX_THEME_CSS).default('').refine((css) => !markdownThemeCss(css, 'validate').error)
})
export type MarkdownThemeManifest = z.infer<typeof MarkdownThemeManifest>
export const MarkdownThemePack = MarkdownThemeManifest.extend({ id: z.string().uuid(), communityId: MarkdownCommunityId.optional() })
export type MarkdownThemePack = z.infer<typeof MarkdownThemePack>
export const MarkdownThemeSelection = z.union([z.enum(MARKDOWN_THEMES), z.string().regex(/^user:[\da-f-]{36}$/)])

// A damaged imported item must not discard the rest of the library or other preferences.
export const MarkdownThemeLibrary = z.array(z.unknown()).max(MAX_THEME_PACKS).transform((items) => {
  const packs: MarkdownThemePack[] = []
  for (const item of items) {
    const parsed = MarkdownThemePack.safeParse(item)
    if (parsed.success && !packs.some((each) => each.id === parsed.data.id)) packs.push(parsed.data)
  }
  return packs
}).catch([])

export function resolveMarkdownTheme(selection: string, packs: readonly MarkdownThemePack[]) {
  const pack = packs.find((each) => `user:${each.id}` === selection)
  const base = pack?.base ?? MARKDOWN_THEMES.find((each) => each === selection) ?? 'default'
  return { base, pack, name: pack?.name ?? MARKDOWN_THEME_LABEL[base].name }
}

type ThemeStyle = CSSProperties & { '--accent'?: string; '--md-secondary'?: string }
export function markdownThemeStyle(pack: MarkdownThemePack | undefined): ThemeStyle | undefined {
  if (!pack) return undefined
  return {
    ...(pack.primary ? { '--accent': `light-dark(${pack.primary.light}, ${pack.primary.dark})` } : {}),
    ...(pack.secondary ? { '--md-secondary': `light-dark(${pack.secondary.light}, ${pack.secondary.dark})` } : {})
  }
}

export function exportMarkdownTheme(pack: MarkdownThemePack): string {
  return JSON.stringify(MarkdownThemeManifest.parse(pack), null, 2)
}

export function importMarkdownTheme(text: string, filename: string): MarkdownThemeManifest {
  if (text.length > 65_536) throw new Error('size')
  return MarkdownThemeManifest.parse(/\.css$/i.test(filename)
    ? { format: 'antumi-markdown-theme', version: 1, name: filename.replace(/\.css$/i, '').slice(0, 80), css: text }
    : JSON.parse(text))
}
