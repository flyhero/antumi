import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adapterOf } from './agents'
import { localSkillFolders } from './local-skills'

describe('localSkillFolders', () => {
  let root: string
  beforeEach(() => { root = mkdtempSync(path.join(os.tmpdir(), 'antumi-local-skills-')) })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const skill = (dir: string, name: string, text: string | null) => {
    mkdirSync(path.join(dir, name), { recursive: true })
    if (text !== null) writeFileSync(path.join(dir, name, 'SKILL.md'), text)
  }

  it('lists the skills one level down, by their frontmatter, skipping hidden folders and ones with no SKILL.md', async () => {
    const claude = path.join(root, 'claude', 'skills')
    skill(claude, 'review', '---\nname: code-review\ndescription: |\n  Reviews a diff\n  for bugs.\n---\nBody')
    skill(claude, 'bare', 'No frontmatter')
    skill(claude, '.hidden', '---\nname: hidden\n---')
    skill(claude, 'empty', null)
    writeFileSync(path.join(claude, 'notes.md'), 'not a skill')
    const folders = await localSkillFolders((agent) => (agent === 'claude' ? [claude, path.join(root, 'missing')] : []))
    expect(folders).toEqual([{ dir: claude, agents: ['claude'], skills: [
      { name: 'bare', description: '', dir: path.join(claude, 'bare') },
      { name: 'code-review', description: 'Reviews a diff for bugs.', dir: path.join(claude, 'review') }
    ] }])
  })

  it('names a folder once, with every agent that loads it, however it is linked', async () => {
    const shared = path.join(root, 'agents', 'skills')
    skill(shared, 'deploy', '---\nname: deploy\ndescription: Ships it\n---')
    symlinkSync(shared, path.join(root, 'linked'))
    const folders = await localSkillFolders((agent) => (agent === 'codex' ? [shared] : agent === 'opencode' ? [path.join(root, 'linked')] : []))
    expect(folders).toHaveLength(1)
    expect(folders[0]).toMatchObject({ dir: shared, agents: ['codex', 'opencode'] })
  })

  it('takes Claude Code\'s and Codex\'s folders from their homes as the environment sets them', () => {
    const env = { CLAUDE_CONFIG_DIR: '/c', CODEX_HOME: '/x' }
    expect(adapterOf('claude').globalSkillDirs?.(env)).toEqual(['/c/skills'])
    expect(adapterOf('codex').globalSkillDirs?.(env)).toEqual(['/x/skills', path.join(os.homedir(), '.agents', 'skills'), '/etc/codex/skills'])
  })

  it('follows the variables that move OpenCode\'s, Pi\'s and Gemini CLI\'s folders, and OpenCode\'s switch for Claude Code\'s', () => {
    const home = os.homedir()
    expect(adapterOf('opencode').globalSkillDirs?.({ OPENCODE_CONFIG_DIR: '/oc' })).toEqual(['/oc/skill', '/oc/skills', path.join(home, '.claude', 'skills'), path.join(home, '.agents', 'skills')])
    expect(adapterOf('opencode').globalSkillDirs?.({ XDG_CONFIG_HOME: '/xdg', OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: '1' })).toEqual(['/xdg/opencode/skill', '/xdg/opencode/skills', path.join(home, '.agents', 'skills')])
    expect(adapterOf('pi').globalSkillDirs?.({ PI_CODING_AGENT_DIR: '/pi' })).toEqual(['/pi/skills', path.join(home, '.agents', 'skills')])
    expect(adapterOf('gemini').globalSkillDirs?.({ GEMINI_CLI_HOME: '/g' })).toEqual(['/g/.gemini/skills', '/g/.agents/skills'])
  })
})
