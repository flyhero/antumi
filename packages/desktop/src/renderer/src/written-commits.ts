import { create } from 'zustand'
import { gitTargetKey, type AgentKind, type GitTarget } from '@antumi/protocol'
import { perform, useCommitMessageSupported, useCore, type CoreState } from './core-store'
import { usePreferences } from './preferences'

// Commits whose message the agent is still writing, by target: the dialog is gone by then, and a
// second commit must not start under one on its way.
const useWriting = create<Record<string, true>>(() => ({}))

const keyOf = gitTargetKey

const agentOf = (state: CoreState, target: GitTarget): AgentKind | null =>
  (target.kind === 'conversation' ? state.conversations[target.id]?.agent : target.kind === 'task' ? state.tasks[target.id]?.agent : null) ?? null

// Whether the target's own agent can write a message, so the user may leave it empty.
export function useCanWriteCommitMessage(target: GitTarget): boolean {
  const supported = useCommitMessageSupported()
  const agent = useCore((s) => agentOf(s, target))
  return supported && agent !== null
}

export function useWritingCommit(target: GitTarget): boolean {
  return useWriting((s) => Boolean(s[keyOf(target)]))
}

// The message the target's agent writes for its changes, on the model the user picked for small jobs
// or else its cheapest; null once perform has shown why not.
export async function writeCommitMessage(target: GitTarget): Promise<string | null> {
  const agent = agentOf(useCore.getState(), target)
  const model = agent ? usePreferences.getState().quickModels[agent] : undefined
  const written = await perform((rpc) => rpc.call('git.commitMessage', { ...target, ...(model ? { model } : {}) }))
  return written?.message ?? null
}

// A commit the user left the message of to the agent: written, then committed with it as is.
export async function commitWithWrittenMessage<T>(target: GitTarget, commit: (message: string) => Promise<T | null>): Promise<{ message: string; result: T } | null> {
  const key = keyOf(target)
  if (useWriting.getState()[key]) return null
  useWriting.setState({ [key]: true })
  try {
    const message = await writeCommitMessage(target)
    const result = message === null ? null : await commit(message)
    return message !== null && result !== null ? { message, result } : null
  } finally {
    useWriting.setState((current) => Object.fromEntries(Object.entries(current).filter(([each]) => each !== key)), true)
  }
}

export function commitSubject(message: string): string {
  return message.split('\n')[0]?.trim() ?? ''
}
