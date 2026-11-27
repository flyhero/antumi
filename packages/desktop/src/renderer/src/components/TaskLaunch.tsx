import { useEffect, useState } from 'react'
import { checkStartMode, type ChatCatalog, type ChatPermissionMode, type Task, type TaskLaunchOptions } from '@antumi/protocol'
import { resolveModel, useProviderCatalog, type ResolvedModel } from '../agent-models'
import { updateTask, useCore, useTaskLaunchSupported } from '../core-store'
import { ProviderPicker } from './ProviderPicker'
import { ChatModelPicker } from './ChatPicker'
import { effortLabel, startModes, useAgentBackend } from './ChatOptionsBar'

export type TaskLaunch = ResolvedModel & {
  // undefined while core is asked, null when the agent lists none.
  catalog: ChatCatalog | null | undefined
  offered: readonly ChatPermissionMode[]
  // The task's own mode while it can take it, else planning.
  mode: ChatPermissionMode
  // Unfinished dependencies leave planning only.
  planOnly: boolean
}

// How the task starts from its details: as its launch says, within what its agent and model offer
// now. null when not `enabled`, when core does not keep a launch, or when there is no agent to start.
export function useTaskLaunch(task: Task, dependencies: readonly Task[], enabled = true): TaskLaunch | null {
  const supported = useTaskLaunchSupported() && enabled
  const activeBackend = useAgentBackend(task.agent ?? null)
  const provider = useCore((state) => task.conversationId && state.conversations[task.conversationId] ? state.conversations[task.conversationId]?.modelProvider ?? null : task.launch.modelProvider)
  const catalog = useProviderCatalog(task.agent, provider, supported && task.status === 'pending')
  if (!supported || !task.agent) return null
  const resolved = resolveModel(catalog, { model: task.launch.model ?? undefined, effort: task.launch.effort ?? undefined })
  const offered = startModes(task.agent, resolved.model, activeBackend)
  const wanted = task.launch.permissionMode ?? 'plan'
  // Auto depends on the model, so the task's mode stands until the catalog says otherwise.
  const takes = offered.includes(wanted) || catalog === undefined
  const mode = takes && !checkStartMode(dependencies, wanted) ? wanted : 'plan'
  return { ...resolved, catalog, offered, mode, planOnly: checkStartMode(dependencies, 'ask') !== null }
}

// What a start sends: the mode it shows, and the model and effort as the catalog takes them. Before
// the catalog is in, core uses the task's own.
export function launchOptions(launch: TaskLaunch): TaskLaunchOptions {
  return launch.catalog
    ? { permissionMode: launch.mode, model: launch.modelId ?? null, effort: launch.effort ?? null }
    : { permissionMode: launch.mode }
}

// Whether one of the task's projects is no git repository, so a start that edits writes there itself;
// a reference project is only read.
export function useEditsInPlace(task: Task, enabled = true): boolean {
  const rpc = useCore((s) => s.rpc)
  const [inPlace, setInPlace] = useState(false)
  useEffect(() => {
    if (!enabled || !rpc?.features.includes('task-start')) return
    let current = true
    rpc.call('tasks.startOptions', { id: task.id }).then((repos) => {
      if (current) setInPlace(repos.some((repo) => !repo.git && !task.repos.find((each) => each.path === repo.path)?.reference))
    }, () => {})
    return () => { current = false }
  }, [enabled, rpc, task.id, task.repos])
  return inPlace
}

// The model and effort the task starts in, kept on the task as they are picked. The default model
// shows by name, so the button always says what will run.
export function TaskModelPicker({ task, launch }: { task: Task; launch: TaskLaunch }) {
  const { catalog } = launch
  const providerId = useCore((state) => task.conversationId && state.conversations[task.conversationId] ? state.conversations[task.conversationId]?.modelProvider ?? null : task.launch.modelProvider)
  if (!task.agent) return null
  const shown = launch.modelId ?? launch.defaultModel?.id ?? null
  const save = (next: TaskLaunchOptions) => void updateTask(task.id, { launch: { ...task.launch, ...next } })
  return (
    <>
    <ProviderPicker agent={task.agent} value={providerId ?? null} disabled={Boolean(task.conversationId)} size="large" placement="below" onChange={(modelProvider) => save({ modelProvider, model: null, effort: null })} />
    {catalog?.models.length ? <ChatModelPicker
      models={catalog.models.map((each) => ({ value: each.id, label: each.label, description: each.description, efforts: each.efforts.map((one) => ({ value: one, label: effortLabel(one) })) }))}
      model={shown}
      effort={launch.effort ?? null}
      align="start"
      placement="below"
      size="large"
      onModel={(model) => {
        const efforts = catalog.models.find((each) => each.id === model)?.efforts ?? []
        save({ model, effort: launch.effort && efforts.includes(launch.effort) ? launch.effort : null })
      }}
      onEffort={(effort) => save({ model: shown, effort })}
    /> : null}
    </>
  )
}
