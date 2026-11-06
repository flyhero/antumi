import { z } from 'zod'
import { AgentKind } from './agent'
import { knowledgeBaseKind, type KnowledgeBase } from './knowledge'

// Agent Skills: folders of SKILL.md that Antumi installs once, from git repositories pinned to a
// commit, and hands to whichever agent it starts. Names follow the Agent Skills spec: lowercase,
// digits and hyphens, the same as the skill's folder.
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/
export const SkillRepoId = z.string().regex(SLUG)
export const SkillName = z.string().regex(SLUG)
export const CommitSha = z.string().regex(/^[0-9a-f]{40}$/)

// One skill as a repository's pinned commit holds it; problem: why it cannot be used (bad
// frontmatter), for the user to see rather than a refusal of the whole repository.
export const SkillEntry = z.object({ name: SkillName, description: z.string(), dir: z.string(), problem: z.string().nullable() })
export type SkillEntry = z.infer<typeof SkillEntry>

// null agents follows every compatible agent, including ones supported in future versions.
export const SkillActivation = z.object({
  mode: z.enum(['all', 'selected']),
  skills: z.array(SkillName).max(10_000),
  agents: z.array(AgentKind).max(100).nullable()
})
export type SkillActivation = z.infer<typeof SkillActivation>

// previousCommit: where an update came from, for one rollback; null until an update.
export const SkillRepo = z.object({
  id: SkillRepoId,
  url: z.string(),
  commit: CommitSha,
  previousCommit: CommitSha.nullable(),
  installedAt: z.number(),
  updatedAt: z.number(),
  plugin: z.object({ name: z.string(), version: z.string() }).nullable(),
  skills: z.array(SkillEntry),
  // Absent on repositories installed before activation settings; preserves feature-provided skills.
  activation: SkillActivation.optional(),
  previousActivation: SkillActivation.nullable().optional()
})
export type SkillRepo = z.infer<typeof SkillRepo>

// The user's own skills in a folder an agent loads by itself, outside Antumi's library: shown, never
// changed. agents: those that load the folder. A name is the frontmatter's, else the folder's.
export const LocalSkill = z.object({ name: z.string(), description: z.string(), dir: z.string() })
export type LocalSkill = z.infer<typeof LocalSkill>
export const LocalSkillFolder = z.object({ dir: z.string(), agents: z.array(AgentKind), skills: z.array(LocalSkill) })
export type LocalSkillFolder = z.infer<typeof LocalSkillFolder>

// A skill named by its repository: what a feature asks for in an agent's bundle.
export const SkillRef = z.object({ repo: SkillRepoId, skill: SkillName })
export type SkillRef = z.infer<typeof SkillRef>

// What an update would bring: the commit it would move to, how far behind, and the skills there.
export const SkillChange = z.object({ name: SkillName, kind: z.enum(['added', 'changed', 'removed']) })
export type SkillChange = z.infer<typeof SkillChange>
export const SkillUpdateCheck = z.object({ id: SkillRepoId, current: CommitSha, latest: CommitSha, behind: z.number().int().nonnegative(), skills: z.array(SkillEntry), changes: z.array(SkillChange).optional() })
export type SkillUpdateCheck = z.infer<typeof SkillUpdateCheck>

// A repository Antumi suggests, with what the user should know before installing third-party code.
export const RecommendedSkillRepo = z.object({ url: z.string(), name: z.string(), description: z.string(), license: z.string(), homepage: z.string(), skills: z.array(SkillName) })
export type RecommendedSkillRepo = z.infer<typeof RecommendedSkillRepo>

// One hit from the skills.sh registry, grouped to the GitHub repository it lives in: Antumi still
// installs the whole repository at url, so several matched skills in one repo are a single row.
// installs is that registry's popularity, for ordering and for the user to judge a third party by.
export const SkillSearchResult = z.object({ url: z.string(), source: z.string(), skills: z.array(z.string()), installs: z.number().int().nonnegative() })
export type SkillSearchResult = z.infer<typeof SkillSearchResult>

// GitHub repository identity, shared by discovery, installation and installed-state rendering.
// Other servers may have case-sensitive paths, credentials or meaningful query parameters.
export function skillRepositoryUrl(raw: string): string {
  try {
    const url = new URL(raw)
    const segments = url.pathname.replace(/\/+$/, '').replace(/\.git$/i, '').split('/').filter(Boolean)
    if (url.protocol === 'https:' && url.hostname === 'github.com' && !url.port && !url.username && !url.password && !url.search && !url.hash && segments.length === 2) {
      return `https://github.com/${segments.join('/').toLowerCase()}`
    }
    return url.href
  } catch { return raw }
}

export function activatedSkillNames(repo: SkillRepo, fallback: readonly SkillRef[] = []): string[] {
  const activation = repo.activation
  return repo.skills.filter((skill) => skill.problem === null && (activation
    ? activation.mode === 'all' || activation.skills.includes(skill.name)
    : fallback.some((ref) => ref.repo === repo.id && ref.skill === skill.name))).map((skill) => skill.name)
}

export function knowledgeBaseSkillRefs(base: KnowledgeBase | null): SkillRef[] {
  return base?.write && knowledgeBaseKind(base) === 'obsidian' ? [{ repo: 'kepano-obsidian-skills', skill: 'obsidian-markdown' }] : []
}

// A duplicate name is ambiguous only when both sources are given to the same agent.
export function skillNameConflicts(repos: readonly SkillRepo[], agents: readonly AgentKind[]): Array<{ name: string; repos: string[]; agent: AgentKind }> {
  return agents.flatMap((agent) => {
    const names = new Map<string, string[]>()
    for (const repo of repos) {
      if (!repo.activation || (repo.activation.agents !== null && !repo.activation.agents.includes(agent))) continue
      for (const name of activatedSkillNames(repo)) names.set(name, [...(names.get(name) ?? []), repo.id])
    }
    return [...names].flatMap(([name, sources]) => sources.length > 1 ? [{ name, repos: sources, agent }] : [])
  })
}
