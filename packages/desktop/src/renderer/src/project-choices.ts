import { useEffect, useRef, useState } from 'react'
import type { ProjectChoice, RpcConnection } from '@antumi/protocol'
import { perform, useCore } from './core-store'

export function plainProject(path: string): ProjectChoice {
  return { path, worktree: false, source: null, branch: null }
}

// Preserve each selected path. Only the suggestions gain their copy's source project.
export function sourceProjects(choices: readonly ProjectChoice[]): ProjectChoice[] {
  const sources = new Map<string, ProjectChoice>()
  for (const choice of choices) {
    const source = choice.worktree ? choice.source : choice.path
    if (source && !sources.has(source)) sources.set(source, plainProject(source))
  }
  return [...sources.values()]
}

export function availableProjects(choices: readonly ProjectChoice[], selected: readonly string[]): {
  sources: ProjectChoice[]
  copies: ProjectChoice[]
} {
  return {
    sources: sourceProjects(choices).filter((choice) => !selected.includes(choice.path)),
    copies: choices.filter((choice) => choice.worktree && !selected.includes(choice.path))
  }
}

// The project a worktree copy came from, or the path itself. Known identities skip the Git lookup.
export async function sourceProject(rpc: RpcConnection, path: string): Promise<string> {
  if (!rpc.features.includes('project-choices')) return path
  try {
    const cached = rpc.features.includes('project-suggestions')
      ? (await rpc.call('projects.suggestions', {})).choices.find((choice) => choice.path === path) : undefined
    const choice = cached ?? (await rpc.call('projects.describe', { paths: [path] }))[0]
    return choice?.worktree && choice.source ? choice.source : path
  } catch {
    return path
  }
}

const recentChoices = new WeakMap<RpcConnection, readonly ProjectChoice[]>()
const refreshing = new WeakMap<RpcConnection, { key: string; request: Promise<ProjectChoice[]> }>()

// Publish cached source identities before the slower inspection of worktree copies.
export async function recentProjectChoices(rpc: RpcConnection, onRecent?: (choices: readonly ProjectChoice[]) => void): Promise<ProjectChoice[]> {
  const cached = rpc.features.includes('project-suggestions')
    ? await rpc.call('projects.suggestions', {}) : null
  const paths = cached?.paths ?? await rpc.call('projects.recent', {})
  const initial = cached?.choices ?? (rpc.features.includes('project-choices')
    ? (recentChoices.get(rpc) ?? []).filter((choice) => paths.includes(choice.path))
    : paths.map(plainProject))
  recentChoices.set(rpc, initial)
  onRecent?.(initial)
  if (!rpc.features.includes('project-choices') || !paths.length) {
    const choices = paths.map(plainProject)
    recentChoices.set(rpc, choices)
    return choices
  }
  const inspect = paths.filter((path) => !initial.some((choice) => choice.path === path && !choice.worktree))
  if (!inspect.length) return [...initial]
  const key = JSON.stringify(inspect)
  let refresh = refreshing.get(rpc)
  if (!refresh || refresh.key !== key) {
    refresh = { key, request: rpc.call('projects.describe', { paths: inspect }) }
    refreshing.set(rpc, refresh)
  }
  try {
    const described = await refresh.request
    const byPath = new Map([...initial, ...described].map((choice) => [choice.path, choice]))
    const choices = paths.flatMap((path) => { const choice = byPath.get(path); return choice ? [choice] : [] })
    if (refreshing.get(rpc) === refresh) recentChoices.set(rpc, choices)
    return choices
  } finally {
    if (refreshing.get(rpc) === refresh) refreshing.delete(rpc)
  }
}

// Warm the list while its picker is mounted, then refresh on opening. Closing cancels UI updates.
export function useRecentProjectChoices(open: boolean): readonly ProjectChoice[] {
  const rpc = useCore((s) => s.rpc)
  const [choices, setChoices] = useState<readonly ProjectChoice[]>(() => rpc ? recentChoices.get(rpc) ?? [] : [])
  const warmed = useRef<RpcConnection | null>(null)
  useEffect(() => {
    setChoices(rpc ? recentChoices.get(rpc) ?? [] : [])
    if (!rpc || (!open && warmed.current === rpc)) return
    warmed.current = rpc
    let active = true
    const publish = (choices: readonly ProjectChoice[]) => { if (active) setChoices(choices) }
    void perform(() => recentProjectChoices(rpc, publish)).then((found) => { if (found) publish(found) })
    return () => { active = false }
  }, [rpc, open])
  return choices
}

export function useProjectDescriptions(paths: readonly string[]): readonly ProjectChoice[] {
  const rpc = useCore((s) => s.rpc)
  const key = JSON.stringify(paths)
  const [choices, setChoices] = useState<readonly ProjectChoice[]>([])
  useEffect(() => {
    let active = true
    const paths: string[] = JSON.parse(key)
    setChoices([])
    if (paths.length && rpc?.features.includes('project-choices')) {
      void perform(() => rpc.call('projects.describe', { paths })).then((found) => {
        if (active && found) setChoices(found)
      })
    }
    return () => { active = false }
  }, [key, rpc])
  return paths.map((path) => choices.find((choice) => choice.path === path) ?? plainProject(path))
}
