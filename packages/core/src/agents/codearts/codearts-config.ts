import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AgentLaunch } from '../agent-adapter'
import { CODEARTS_AGENTS } from './codearts-permissions'

// The tools a planning or read-only agent goes without. CodeArts cannot be made to ask before an
// edit or a command (its permission service answers from its own run mode), and a tool whose every
// use its agent denies is not offered to the model at all. Nor are subagents, which would edit for
// it, its skill editor, or questions, which the bridge does not pass on.
const LOCKED = { edit: 'deny', write: 'deny', deleteFile: 'deny', bash: 'deny', task: 'deny', skill_manage: 'deny', question: 'deny' }

// What Antumi adds to the user's CodeArts config for one process, through OPENCODE_CONFIG_CONTENT,
// in the OpenCode 1 shape CodeArts reads: its permission plugin and the agents for Antumi's modes,
// merged over the user's own config, which stays as it is. The bypass agent exists only where the
// stage may bypass, so it is never there to switch to otherwise. The plugin's file is the stage's,
// which only the launch knows.
export function codeartsConfig(launch: Pick<AgentLaunch, 'allowBypass' | 'planOnly' | 'readOnly' | 'skills'>, plugin?: string): string {
  const bypass = Boolean(launch.allowBypass) && !launch.planOnly && !launch.readOnly
  return JSON.stringify({
    ...(plugin ? { plugin: [pathToFileURL(plugin).href] } : {}),
    agent: {
      [CODEARTS_AGENTS.auto]: {
        description: 'Automatic: edits and runs commands in the project; never reaches outside it (Antumi)',
        mode: 'primary',
        permission: { question: 'deny' }
      },
      [CODEARTS_AGENTS.plan]: {
        description: 'Plan: reads code and proposes a plan; edits nothing and runs no commands (Antumi)',
        mode: 'primary',
        permission: LOCKED
      },
      [CODEARTS_AGENTS.readOnly]: {
        description: 'Read-only: reads files and answers; edits nothing and runs no commands (Antumi)',
        mode: 'primary',
        permission: LOCKED
      },
      ...(bypass ? {
        [CODEARTS_AGENTS.bypass]: {
          description: 'Allow everything: nothing is asked (Antumi)',
          mode: 'primary',
          permission: { question: 'deny' }
        }
      } : {})
    },
    // Antumi's skills bundle, in the Agent Skills layout it scans for SKILL.md.
    ...(launch.skills ? { skills: { paths: [path.join(launch.skills.dir, '.agents', 'skills')] } } : {})
  })
}
