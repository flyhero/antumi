import { z } from 'zod'
import { MarkdownCommunityId, MarkdownThemeManifest, MarkdownThemePack, MarkdownThemeVersion } from './markdown-theme-packs'

export const CommunityThemeManifest = MarkdownThemeManifest.omit({ fontSize: true, lineHeight: true, paragraphSpacing: true }).extend({
  themeVersion: MarkdownThemeVersion,
  author: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(240),
  license: z.string().trim().min(1).max(80)
}).strict()

export type CommunityTheme = {
  id: string
  manifest: z.infer<typeof CommunityThemeManifest>
  lightPreview: string
  darkPreview: string
}

export function communityThemeCatalog(manifests: Record<string, unknown>, images: Record<string, string>): CommunityTheme[] {
  return Object.keys(manifests).sort().map((path) => {
    const id = MarkdownCommunityId.parse(/\/([^/]+)\/theme\.json$/.exec(path)?.[1])
    const parsed = CommunityThemeManifest.safeParse(manifests[path])
    if (!parsed.success) throw new Error(`${id}/theme.json: ${parsed.error.message}`)
    const lightPreview = images[path.replace(/theme\.json$/, 'preview-light.png')]
    const darkPreview = images[path.replace(/theme\.json$/, 'preview-dark.png')]
    if (!lightPreview || !darkPreview) throw new Error(`${id}: missing preview-light.png / preview-dark.png`)
    return {
      id,
      manifest: { ...parsed.data, source: parsed.data.source ?? `https://github.com/flyhero/antumi/tree/main/community/markdown-themes/${id}` },
      lightPreview,
      darkPreview
    }
  })
}

export function communityThemeUpdate(theme: CommunityTheme, installed: MarkdownThemePack | undefined): boolean {
  if (!installed?.themeVersion) return Boolean(installed)
  const current = installed.themeVersion.split('.').map(BigInt)
  const next = theme.manifest.themeVersion.split('.').map(BigInt)
  for (let index = 0; index < 3; index++) {
    if (next[index] !== current[index]) return (next[index] ?? 0n) > (current[index] ?? 0n)
  }
  return false
}

// Replace a requested version without changing its local identity or duplicating installations.
export function installCommunityTheme(theme: CommunityTheme, packs: readonly MarkdownThemePack[], id: string): MarkdownThemePack[] {
  const installed = packs.find((pack) => pack.communityId === theme.id)
  if (installed && !communityThemeUpdate(theme, installed)) return [...packs]
  const pack = MarkdownThemePack.parse({ ...theme.manifest, id: installed?.id ?? id, communityId: theme.id })
  return installed ? packs.map((each) => each.id === installed.id ? pack : each) : [...packs, pack]
}
