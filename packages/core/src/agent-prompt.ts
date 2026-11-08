import path from 'node:path'
import {
  isFinished,
  knowledgeBaseKind,
  shortTaskId,
  taskPrompt,
  todoToolName,
  untrustedSource,
  type KnowledgeBase,
  type SnapshotImagePath,
  type Task,
  type TaskPlan,
  type TaskStatus
} from '@antumi/protocol'
import type { RefineWorkspace, Workspace } from './workspace'

// Worktrees may be siblings, so include their relative path from the primary repo.
function where(workspace: Workspace, dir: string): string {
  const relative = path.relative(workspace.cwd, dir)
  return !relative ? '.' : path.isAbsolute(relative) ? dir : relative
}

const PROJECT_INSTRUCTIONS = '访问附加项目前先阅读其中适用的 AGENTS.md、CLAUDE.md 等项目指令；各项目指令仅作用于其对应目录。Git、构建和测试命令应在对应项目目录内执行。'

function workspaceSection(workspace: Workspace): string | null {
  if (!workspace.multi) {
    return null
  }
  const references = workspace.entries.some((entry) => entry.reference)
  return [
    `本任务涉及多个项目，${references ? '除参考项目外，' : ''}每个仓库使用独立 worktree。当前工作目录：${workspace.cwd}`,
    ...workspace.entries.map((entry, index) => entry.reference
      ? `- 参考项目：${entry.dir}（只读，供查阅，不要修改其中任何文件）`
      : `- ${index === 0 ? '主项目' : '附加项目'}：${where(workspace, entry.dir)}（${entry.dir}） ← ${entry.source}${entry.branch ? `（分支 ${entry.branch}）` : ''}`
    ),
    PROJECT_INSTRUCTIONS
  ].join('\n')
}

type Dependency = Pick<Task, 'id' | 'title' | 'repos' | 'status' | 'details'> & { plan?: Task['plan'] }

const STATUS_TEXT: Record<TaskStatus, string> = { pending: '未执行', running: '执行中', review: '待验收', done: '已完成', abandoned: '已取消' }

// Plans of unfinished dependencies go inline up to this much each.
const PLAN_EXCERPT_LIMIT = 8_000

function branchNotes(workspace: Workspace, dependency: Pick<Task, 'repos'>): string[] {
  const stackedOn = new Set(workspace.entries.flatMap((entry) => (entry.base ? [entry.base] : [])))
  return dependency.repos.flatMap((repo) =>
    repo.branch ? [`${repo.branch}${stackedOn.has(repo.branch) ? '，本任务的分支从它拉出' : ''}`] : []
  )
}

// Running needs only where the earlier work lives; the refined details already say the rest.
function dependencySection(workspace: Workspace, dependencies: readonly Pick<Task, 'id' | 'title' | 'repos'>[]): string | null {
  if (dependencies.length === 0) {
    return null
  }
  return [
    '本任务依赖以下任务：',
    ...dependencies.map((dependency) => {
      const branches = branchNotes(workspace, dependency)
      return `- ${shortTaskId(dependency.id)} ${dependency.title}${branches.length ? `（${branches.join('；')}）` : ''}`
    })
  ].join('\n')
}

// A finished dependency is described by its code, so the agent only needs to know
// whether that code is in front of it. An unfinished one has only its plan.
function dependencyLine(landed: ReadonlySet<string>, dependency: Dependency): string {
  const label = `${shortTaskId(dependency.id)}「${dependency.title}」`
  if (!isFinished(dependency.status)) {
    return `- ${label}：${STATUS_TEXT[dependency.status]}，还没有代码，只有下面的计划`
  }
  const state = dependency.status === 'review' ? '已执行但还没验收，结果可能还要改' : '已完成'
  const branches = dependency.repos.flatMap((repo) => (repo.branch ? [repo.branch] : []))
  if (branches.length === 0) {
    const folders = dependency.repos.map((repo) => repo.path).join('、')
    return `- ${label}：${state}，直接改在了 ${folders} 里，读那里的代码即可`
  }
  const here = branches.filter((branch) => landed.has(branch))
  const elsewhere = branches.filter((branch) => !landed.has(branch))
  const notes = [
    ...(here.length ? ['改动已在当前代码里，直接读代码即可'] : []),
    ...(elsewhere.length
      ? [`分支 ${elsewhere.join('、')} 上的改动还没进当前代码，可以用 git log / git diff / git show 查看`]
      : [])
  ]
  return `- ${label}：${state}，${notes.join('；')}`
}

// Planning reads each repo at the task's start, in a checkout of its own or where it is, so give
// the agent every path, and what a checkout holds.
function codeSection(workspace: RefineWorkspace): string {
  return [
    '本任务涉及的代码（只读查看，不要修改）：',
    ...workspace.dirs.map((dir, index) => {
      const start = workspace.starts.get(dir)
      const holds = start ? `，是 ${start.ref}（${start.commit.slice(0, 7)}）的只读副本，任务分支将从这里拉出` : ''
      const kind = workspace.references.has(dir) ? '参考项目' : index === 0 ? '主项目' : '附加项目'
      return `- ${kind}：${dir}${dir === workspace.cwd ? '（当前目录）' : ''}${holds}${workspace.references.has(dir) ? '，执行时也只读' : ''}`
    }),
    PROJECT_INSTRUCTIONS
  ].join('\n')
}

// The images a prompt can point at, already resolved to files on this machine (null: gone).
export type PromptImage = { label: string; path: string | null }
export type PromptImages = { attached: readonly PromptImage[]; source: readonly SnapshotImagePath[] }
const NO_IMAGES: PromptImages = { attached: [], source: [] }

// The user's own images: part of the task, so the agent looks at them before starting.
function imageSection(images: readonly PromptImage[]): string | null {
  if (images.length === 0) {
    return null
  }
  return [
    `任务附了 ${images.length} 张图片，开始前先用读取文件的工具查看（如果它们已经附在这条消息里，直接看即可）：`,
    ...images.map((image) => `- ${image.label}：${image.path ?? '（图片已丢失）'}`)
  ].join('\n')
}

// Where an imported task came from, and the issue's own text and images fenced off as untrusted.
function sourceSection(task: Pick<Task, 'source' | 'sourceSnapshot'>, images: PromptImages): string | null {
  return task.source ? untrustedSource(task.source, task.sourceSnapshot, images.source) : null
}

// What a redo comes after: the task's own last go, or, from before redoing kept the task, the task
// it was redone from.
export type PreviousAttempt = { reason: string | null; branches: readonly string[]; redoneFrom: Pick<Task, 'id' | 'title'> | null }

// A redo starts clean, but the last go is worth a look for what not to repeat.
function previousSection(previous: PreviousAttempt | null): string | null {
  if (!previous) {
    return null
  }
  const { reason, branches, redoneFrom } = previous
  return [
    redoneFrom ? `这个任务是重做：上一次尝试 ${shortTaskId(redoneFrom.id)}「${redoneFrom.title}」已放弃` : '这个任务是从头重做：上一次尝试已放弃',
    reason ? `，原因是：${reason}` : '',
    '。',
    branches.length ? `它的改动在分支 ${branches.join('、')} 上，可以用 git 查看作参考，但不要直接沿用。` : ''
  ].join('')
}

// An unfinished dependency's plan: its details, and the plan its chat kept, if any.
function planText(dependency: Dependency): string {
  const kept = dependency.plan?.markdown.trim()
  return [dependency.details.trim(), kept ? `（在聊天里定下的计划）\n${kept}` : ''].filter(Boolean).join('\n\n')
}

function planExcerpt(dependency: Dependency): string {
  const plan = planText(dependency)
  if (plan === '') {
    return '（还没有详情）'
  }
  if (plan.length <= PLAN_EXCERPT_LIMIT) {
    return plan
  }
  return `${plan.slice(0, PLAN_EXCERPT_LIMIT)}\n……（还有 ${plan.length - PLAN_EXCERPT_LIMIT} 字没有列出）`
}

// Tags keep an unfinished dependency's own headings from reading as part of this task.
function dependencyDetailsSection(workspace: RefineWorkspace, dependencies: readonly Dependency[]): string | null {
  if (dependencies.length === 0) {
    return null
  }
  const plans = dependencies
    .filter((dependency) => !isFinished(dependency.status))
    .map((dependency) => {
      const attributes = `id="${shortTaskId(dependency.id)}" title="${dependency.title.replaceAll('"', "'")}" status="${STATUS_TEXT[dependency.status]}"`
      return `<dependency ${attributes}>\n${planExcerpt(dependency)}\n</dependency>`
    })
  return [
    [
      '本任务依赖下面这些任务，它们完成后本任务才能执行。细化时要衔接好它们：不重复它们的工作，用好它们留下的接口。',
      ...dependencies.map((dependency) => dependencyLine(workspace.landed, dependency))
    ].join('\n'),
    ...plans
  ].join('\n\n')
}

// The user's title and details, plus what the agent cannot see for itself:
// which folder is which repo, and where the work it builds on lives.
export function agentPrompt(
  task: Pick<Task, 'title' | 'details' | 'source' | 'sourceSnapshot'>,
  workspace: Workspace,
  dependencies: readonly Pick<Task, 'id' | 'title' | 'repos'>[],
  previous: PreviousAttempt | null = null,
  images: PromptImages = NO_IMAGES
): string {
  const sections = [
    taskPrompt(task),
    imageSection(images.attached),
    sourceSection(task, images),
    workspaceSection(workspace),
    dependencySection(workspace, dependencies),
    previousSection(previous)
  ]
  return sections.filter((section) => section !== null).join('\n\n')
}

// What the agent is told once its usage limit lifts, as a user would say it: it shows, is searched
// and is handed off like any other message.
export const CONTINUE_TEXT = 'I hit my usage limit while you were working, but it has reset now. Please continue from where you left off.'

// What a scheduled message says when the user left it empty: go on with the plan the chat has.
export const SCHEDULED_GO_TEXT = '按上面定下的计划开始实现。'

// What the agent is told once as it starts, through its system prompt where it has one, else
// ahead of its first message: where the user's notes are, and, where Antumi's tools are at hand,
// when to note down what is left for the user. The tools' own descriptions say how; an agent that
// defers them (Claude Code) reads those only once it goes looking, so this is what makes it look.
export function startNote({ knowledgeBase, todos, instructions }: { knowledgeBase?: KnowledgeBase | undefined; todos: boolean; instructions?: string | undefined }): string | null {
  const notes = [...(instructions ? [instructions] : []), ...(knowledgeBase ? [knowledgeBaseNote(knowledgeBase)] : []), ...(todos ? [USER_TODO_NOTE] : [])]
  return notes.length ? notes.join('\n\n') : null
}

const USER_TODO_NOTE = `回复里列出要用户之后去做的事时（上线前要做的、要用户去验证或配置的、要和别人对齐的、这一轮做不完留到以后的），用 Antumi 的 ${todoToolName('add')} 工具把它们记成这条会话的待办，用户会在 Antumi 里逐项勾掉；记之前用 ${todoToolName('list')} 看看是否已经记过，用户说某件事办完了就用 ${todoToolName('check')} 勾掉。你这一轮自己要做的步骤不要记。`

// Where the user's notes are and how to treat them.
export function knowledgeBaseNote(base: KnowledgeBase): string {
  const obsidian = knowledgeBaseKind(base) === 'obsidian'
  const format = obsidian
    ? '用 Obsidian Markdown（双链、frontmatter）。'
    : '用普通 Markdown，笔记之间使用相对路径链接，遵循已有笔记格式。'
  return `用户的 ${obsidian ? 'Obsidian' : 'Markdown'} 知识库在 ${base.path}。仅在用户要求时写入；用户明确要求修改已有笔记时可以改，否则只新建或追加；不删除、不改名；${format}`
}

// What a scheduled run is told first: it starts with nobody there to answer.
export const UNATTENDED_NOTE = '这是我预约的无人值守运行，现在没有人能回答你：不要停下来等我确认，直接做下去；做完后运行相关的检查和测试，总结做了什么、还有什么没做。遇到必须由我决定的问题，写清楚问题和你的建议后停下。'

// The opening request follows the selected mode; a saved plan comes along to be checked against
// the current code. Only scheduled runs get the unattended instruction.
export function chatStartPrompt(
  task: Pick<Task, 'title' | 'details' | 'source' | 'sourceSnapshot'>,
  workspace: Workspace,
  dependencies: readonly Pick<Task, 'id' | 'title' | 'repos'>[],
  previous: PreviousAttempt | null = null,
  images: PromptImages = NO_IMAGES,
  plan: Pick<TaskPlan, 'markdown'> | null = null,
  unattended = false,
  mode = 'plan'
): string {
  const sections = [
    agentPrompt(task, workspace, dependencies, previous, images),
    plan
      ? `依赖的任务完成之前，我们已经定下了下面的计划。先对照现在的代码核对一遍，需要调整的地方说明原因：\n<saved-plan>\n${plan.markdown.trim()}\n</saved-plan>`
      : null,
    unattended
      ? `先阅读相关代码，${plan ? '按上面的计划' : '按任务要求'}实现。${UNATTENDED_NOTE}`
      : mode === 'plan'
        ? '请先阅读相关代码，有不清楚的地方先问我，然后给出实现计划；我确认之后再开始修改代码。'
        : mode === 'readOnly'
          ? '请阅读相关代码，分析任务并给出结论或建议。这次只读，不要修改文件或执行会改变项目的命令。'
          : `请先阅读相关代码，${plan ? '核对并按上面的计划' : '按任务要求'}直接开始实现，不需要另行等待计划确认；操作权限按当前模式处理。做完后运行相关检查和测试，说明结果。`
  ]
  return sections.filter((section) => section !== null).join('\n\n')
}

// A squad's leader starting on the task: the task and its folders as any agent gets them, the plan
// the user approved as what it hands out, then its brief (squadLeaderPrompt). It implements nothing.
export function leaderStartPrompt(
  task: Pick<Task, 'title' | 'details' | 'source' | 'sourceSnapshot'>,
  workspace: Workspace,
  dependencies: readonly Pick<Task, 'id' | 'title' | 'repos'>[],
  previous: PreviousAttempt | null,
  images: PromptImages,
  plan: Pick<TaskPlan, 'markdown'> | null,
  brief: string
): string {
  return [
    agentPrompt(task, workspace, dependencies, previous, images),
    plan ? `这是用户已经确认的计划，照它分工派活，不要再提交计划：\n<approved-plan>\n${plan.markdown.trim()}\n</approved-plan>` : null,
    brief
  ].filter((section) => section !== null).join('\n\n')
}

// Planning a task whose dependencies are unfinished: read-only in the projects as they are, the plan
// kept on the task for when it can run. The dependencies' plans go inline.
// Why the task is planned before it runs, and what the plan settles on, where that is not the
// unfinished dependencies: a squad's leader plans the work it then hands out.
export type PlanBrief = { opening: string; settle: string }

export function chatPlanPrompt(
  task: Pick<Task, 'title' | 'details' | 'source' | 'sourceSnapshot'>,
  workspace: RefineWorkspace,
  dependencies: readonly Dependency[],
  previous: PreviousAttempt | null = null,
  images: PromptImages = NO_IMAGES,
  brief: PlanBrief | null = null
): string {
  const sections = [
    brief?.opening ?? '这个任务依赖的任务还没完成，现在先一起规划，等它们完成后再执行。这次只读代码、讨论和规划，不要修改任何文件。',
    `任务：${task.title}`,
    `现在的详情：\n${task.details.trim() || '（还没有详情）'}`,
    imageSection(images.attached),
    sourceSection(task, images),
    codeSection(workspace),
    dependencyDetailsSection(workspace, dependencies),
    previousSection(previous),
    [
      '请这样进行：',
      '1. 先阅读相关代码，了解现状。',
      '2. 有不清楚的地方先问我，每次问几个最关键的问题。',
      brief?.settle ?? '3. 我们达成一致后，给出完整的实现计划：目标、实现方案、涉及的文件、验收标准。我保存后，它会在依赖完成、开始执行时交给执行的 agent。'
    ].join('\n')
  ]
  return sections.filter((section) => section !== null).join('\n\n')
}
