/// <reference types="node" />
import { readFile, readdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { MarkdownCommunityId, MarkdownThemePack } from './markdown-theme-packs'
import { communityThemeUpdate, CommunityThemeManifest } from './community-theme-catalog'
import { MARKDOWN_COMMUNITY_THEMES } from './markdown-community-themes'

const root = new URL('../../../../../community/markdown-themes/', import.meta.url)
const pngHeader = Buffer.from('89504e470d0a1a0a', 'hex')
const repository = new URL('../../', root)

describe('submitted community theme packages', () => {
  it('validates every directory, manifest and preview included in the desktop catalog', async () => {
    const entries = await readdir(root, { withFileTypes: true })
    expect(entries.some((entry) => entry.isSymbolicLink())).toBe(false)
    const directories = entries.filter((entry) => entry.isDirectory())
    const base = process.env.COMMUNITY_THEME_BASE
    const previousPaths = base ? new Set(execFileSync('git', ['ls-tree', '-r', '--name-only', base, '--', 'community/markdown-themes'], { cwd: repository, encoding: 'utf8' }).trim().split('\n')) : new Set<string>()
    expect(MARKDOWN_COMMUNITY_THEMES.map((theme) => theme.id).sort()).toEqual(directories.map((directory) => directory.name).sort())
    for (const directory of directories) {
      MarkdownCommunityId.parse(directory.name)
      const folder = new URL(`${directory.name}/`, root)
      const files = await readdir(folder, { withFileTypes: true })
      for (const file of files) {
        expect(file.isFile() && !file.isSymbolicLink(), `${directory.name}/${file.name}: data files only`).toBe(true)
        expect(['theme.json', 'preview-light.png', 'preview-dark.png', 'README.md', 'LICENSE.md'], `${directory.name}: unsupported file ${file.name}`).toContain(file.name)
      }
      const json = await readFile(new URL('theme.json', folder))
      expect(json.byteLength, `${directory.name}: manifest exceeds 64 KiB`).toBeLessThanOrEqual(65_536)
      const manifest = CommunityThemeManifest.parse(JSON.parse(json.toString('utf8')))
      const path = `community/markdown-themes/${directory.name}/theme.json`
      if (base && previousPaths.has(path)) {
        const previous = CommunityThemeManifest.parse(JSON.parse(execFileSync('git', ['show', `${base}:${path}`], { cwd: repository, encoding: 'utf8' })))
        if (JSON.stringify(manifest) !== JSON.stringify(previous)) {
          const theme = MARKDOWN_COMMUNITY_THEMES.find((each) => each.id === directory.name)
          if (!theme) throw new Error(`Missing catalog entry: ${directory.name}`)
          const installed = MarkdownThemePack.parse({ ...previous, id: '5dde10ce-045e-42d5-b2d7-3510edf38fc1' })
          expect(communityThemeUpdate(theme, installed), `${directory.name}: increase themeVersion when updating a published theme`).toBe(true)
        }
      }
      for (const name of ['preview-light.png', 'preview-dark.png']) {
        const data = await readFile(new URL(name, folder))
        expect(data.byteLength, `${directory.name}/${name}: preview exceeds 2 MiB`).toBeLessThanOrEqual(2 * 1024 * 1024)
        expect(data.subarray(0, 8).equals(pngHeader), `${directory.name}/${name}: PNG required`).toBe(true)
        expect(data.toString('ascii', 12, 16)).toBe('IHDR')
        expect(data.readUInt32BE(16)).toBeGreaterThan(0)
        expect(data.readUInt32BE(20)).toBeGreaterThan(0)
      }
    }
  })
})
