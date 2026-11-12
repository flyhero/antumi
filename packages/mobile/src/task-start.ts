import { checkStart, checkStartMode, type ChatPermissionMode, type StartBlocker, type Task } from '@antumi/protocol'

// Starting a task as the computer does from its details: in the mode the task keeps, planning when
// it keeps none or while what it builds on is unfinished. The mode is not checked against the
// model's own list here; core refuses one the agent does not take.

export function dependenciesOf(task: Task, tasks: Record<string, Task>): Task[] {
  return task.dependsOn.flatMap((id) => (tasks[id] ? [tasks[id]] : []))
}

export function startModeOf(task: Task, tasks: Record<string, Task>): ChatPermissionMode {
  const wanted = task.launch.permissionMode ?? 'plan'
  return checkStartMode(dependenciesOf(task, tasks), wanted) ? 'plan' : wanted
}

export function startBlockerOf(task: Task, tasks: Record<string, Task>): StartBlocker | null {
  return checkStart(task, dependenciesOf(task, tasks))
}
