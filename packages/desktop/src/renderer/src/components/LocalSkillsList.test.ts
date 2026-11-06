import { describe, expect, it } from 'vitest'
import type { SkillRepo } from '@antumi/protocol'
import { antumiSkillAgents } from './LocalSkillsList'

const commit = 'a'.repeat(40)
const repo = (id: string, activation: SkillRepo['activation']): SkillRepo => ({
  id, url: `https://github.com/o/${id}`, commit, previousCommit: null, installedAt: 0, updatedAt: 0, plugin: null, activation,
  skills: [{ name: 'deploy', description: 'd', dir: 'skills/deploy', problem: null }, { name: 'review', description: 'r', dir: 'skills/review', problem: null }]
})

describe('antumiSkillAgents', () => {
  it('names each enabled skill with the agents that take it, never one that takes no skills', () => {
    const byName = antumiSkillAgents([
      repo('a', { mode: 'selected', skills: ['deploy'], agents: ['claude', 'codex'] }),
      repo('b', { mode: 'all', skills: [], agents: ['opencode'] })
    ], [])
    // Codex is given no bundle, so its own folder's deploy is not doubled.
    expect([...byName.get('deploy') ?? []]).toEqual(['claude', 'opencode'])
    expect([...byName.get('review') ?? []]).toEqual(['opencode'])
  })

  it('leaves out what is installed but not enabled', () => {
    expect(antumiSkillAgents([repo('a', { mode: 'selected', skills: [], agents: null })], []).size).toBe(0)
  })
})
