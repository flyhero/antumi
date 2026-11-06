import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { AGENT_KINDS, type AgentKind, type LocalSkill, type LocalSkillFolder } from '@antumi/protocol'
import { adapterOf } from './agents'
import { parseSkillFrontmatter } from './skill-manifest'

// The user's own skills, in the folders each agent loads by itself (its adapter's globalSkillDirs):
// what they already have, beside what Antumi installs. Only read, and only one level down, as the
// agents load them; a hidden folder (Codex's .system) is the agent's own.

const SKILL_LIMIT = 500
const DESCRIPTION_LIMIT = 300

type Dirs = (agent: AgentKind) => readonly string[]

const adapterDirs = (env: NodeJS.ProcessEnv): Dirs => (agent) => adapterOf(agent).globalSkillDirs?.(env) ?? []

async function skillsIn(dir: string): Promise<LocalSkill[]> {
  const names = await readdir(dir).catch(() => [])
  const found: LocalSkill[] = []
  for (const name of names.sort()) {
    if (name.startsWith('.') || found.length >= SKILL_LIMIT) continue
    const folder = path.join(dir, name)
    // Followed: a skill linked in from elsewhere is as much the agent's.
    if (!(await stat(folder).catch(() => null))?.isDirectory()) continue
    const text = await readFile(path.join(folder, 'SKILL.md'), 'utf8').catch(() => null)
    if (text === null) continue
    const fields = parseSkillFrontmatter(text)
    const description = (fields?.description ?? '').replace(/\s+/g, ' ').trim()
    found.push({ name: fields?.name?.trim() || name, description: description.length > DESCRIPTION_LIMIT ? `${description.slice(0, DESCRIPTION_LIMIT)}…` : description, dir: folder })
  }
  return found
}

// One entry per folder on disk, however many agents name it or by whatever link.
export async function localSkillFolders(dirsOf: Dirs = adapterDirs(process.env)): Promise<LocalSkillFolder[]> {
  const byReal = new Map<string, { dir: string; agents: AgentKind[] }>()
  for (const agent of AGENT_KINDS) {
    for (const dir of dirsOf(agent)) {
      const real = await realpath(dir).catch(() => null)
      if (real === null) continue
      const known = byReal.get(real)
      if (known) {
        if (!known.agents.includes(agent)) known.agents.push(agent)
      } else {
        byReal.set(real, { dir, agents: [agent] })
      }
    }
  }
  return Promise.all([...byReal.values()].map(async (folder) => ({ ...folder, skills: await skillsIn(folder.dir) })))
}
