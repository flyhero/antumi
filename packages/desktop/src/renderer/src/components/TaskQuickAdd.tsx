import { t, tr } from '../i18n'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import type { AgentKind } from '@antumi/protocol'
import { perform, setNewTaskOpen, useCore } from '../core-store'
import { isShortcut, useShortcutLabel } from '../keyboard-shortcuts'
import { defaultAgent } from '../default-agent'
import { canPickFolder, pickFolder } from '../desktop-bridge'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel } from '../labels'
import { latestProjects } from '../task-board'
import { ChatPicker } from './ChatPicker'
import { AgentIcon, FolderIcon } from './icons'
import { parentDir, projectName, projectNames } from './ProjectPicker'

// What is being written, kept while the board is away so a half-written title is still there.
// Projects and agent are null until the first open, which takes them from the latest task; after
// that they stay as picked, since a batch of tasks usually shares them.
type QuickAdd = { open: boolean; title: string; repos: readonly string[] | null; agent: AgentKind | null | undefined }
const useQuickAdd = create<QuickAdd>(() => ({ open: false, title: '', repos: null, agent: undefined }))

export function openQuickAdd(): void {
  const { tasks, conversations } = useCore.getState()
  useQuickAdd.setState((s) => ({
    open: true,
    repos: s.repos ?? latestProjects(Object.values(tasks)),
    agent: s.agent === undefined ? defaultAgent(tasks, conversations) : s.agent
  }))
}

// Writing a task down at the top of the pending column: Enter creates it and leaves the field for
// the next, Shift+Enter carries it into the full dialog, Esc or a click elsewhere folds it away.
export function TaskQuickAdd({ onCreated }: { onCreated: (id: string) => void }) {
  const quickAddKey = useShortcutLabel('quick-add-task')
  const submitKey = useShortcutLabel('quick-add-submit')
  const expandKey = useShortcutLabel('quick-add-expand')
  const { open, title, repos, agent } = useQuickAdd()
  const connected = useCore((s) => s.connection === 'connected')
  const editor = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const [busy, setBusy] = useState(false)
  const fold = useCallback(() => useQuickAdd.setState({ open: false }), [])

  // A click outside folds it, but not one in a menu it opened, which is portaled elsewhere.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && !editor.current?.contains(event.target) && !event.target.closest('[role="menu"]')) fold()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, fold])

  // The title grows with what is written rather than scrolling inside one line.
  useLayoutEffect(() => {
    const element = input.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [title, open])

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  if (!open) {
    return (
      <button type="button" className="task-quick-add-row" onClick={openQuickAdd}>{tr('TaskQuickAdd.writeATask', { value1: quickAddKey && <kbd>{quickAddKey}</kbd> })}</button>
    )
  }

  const draft = { title: title.trim(), repos: repos ?? [], agent: agent ?? null }
  const createTask = async () => {
    if (!draft.title || busy || !connected) return
    setBusy(true)
    const task = await perform((rpc) => rpc.call('tasks.create', { title: draft.title, repos: [...draft.repos], agent: draft.agent }))
    setBusy(false)
    if (!task) return
    useQuickAdd.setState({ title: '' })
    onCreated(task.id)
    input.current?.focus()
  }

  return (
    <div ref={editor} className="task-quick-add" aria-busy={busy}>
      <textarea
        ref={input}
        className="task-quick-add-title"
        rows={1}
        aria-label={t('TaskQuickAdd.newTaskTitle')}
        placeholder={t('TaskQuickAdd.whatNeedsDoingOneSentenceIsEnough')}
        value={title}
        maxLength={200}
        onChange={(event) => useQuickAdd.setState({ title: event.target.value.replace(/\n/g, ' ') })}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.repeat) return
          if (isShortcut('quick-add-expand', event.nativeEvent)) {
            event.preventDefault()
            useQuickAdd.setState({ open: false, title: '' })
            setNewTaskOpen(true, draft)
          } else if (isShortcut('quick-add-submit', event.nativeEvent)) {
            event.preventDefault()
            void createTask()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            fold()
          }
        }}
      />
      <div className="task-quick-add-picks">
        <ProjectPick repos={draft.repos} />
        <AgentPick agent={draft.agent} />
      </div>
      <div className="task-quick-add-hint">
        {submitKey && <span>{tr('TaskQuickAdd.create', { value1: <kbd>{submitKey}</kbd> })}</span>}
        {expandKey && <span>{tr('TaskQuickAdd.moreOptions', { value1: <kbd>{expandKey}</kbd> })}</span>}
        <span>{tr('TaskQuickAdd.collapse', { value1: <kbd>Esc</kbd> })}</span>
      </div>
    </div>
  )
}

// One project for the new task, from those used lately; several, or none, in the full dialog too.
// What it has now stays a choice, even several at once, as the latest task may have left it.
function ProjectPick({ repos }: { repos: readonly string[] }) {
  const [recent, setRecent] = useState<readonly string[]>([])
  useEffect(() => {
    void perform((rpc) => rpc.call('projects.recent', {})).then((found) => setRecent(found ?? []))
  }, [])
  const current = repos.join('\n')
  const browse = async () => {
    const picked = await pickFolder(repos[0] ? parentDir(repos[0]) : undefined)
    if (picked) useQuickAdd.setState({ repos: [picked] })
  }
  const folder = <FolderIcon />
  const singles = [...new Set([...repos, ...recent])]
  return (
    <ChatPicker
      label={t('TaskQuickAdd.projectsForNewTask')}
      value={current}
      placeholder={t('TaskQuickAdd.chooseProject')}
      placement="below"
      options={[
        ...(repos.length > 1 ? [{ value: current, label: projectNames(repos), description: repos.join('、'), icon: folder }] : []),
        ...singles.map((each) => ({ value: each, label: projectName(each), description: each, icon: folder })),
        { value: '', label: t('TaskQuickAdd.noProjectChooseLater'), icon: folder }
      ]}
      onChange={(value) => useQuickAdd.setState({ repos: value ? value.split('\n') : [] })}
      footer={canPickFolder() ? (close) => (
        <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); void browse() }}>{t('ChatProjects.chooseFolder')}</button>
      ) : undefined}
    />
  )
}

function AgentPick({ agent }: { agent: AgentKind | null }) {
  const installed = useInstalledAgents()
  const choices = agent && !installed.includes(agent) ? [...installed, agent] : installed
  return (
    <ChatPicker
      label={t('TaskQuickAdd.agentForNewTask')}
      value={agent ?? ''}
      placeholder={t('AgentPicker.chooseAgent')}
      placement="below"
      options={[
        ...choices.map((each) => ({ value: each, label: agentLabel(each), icon: <AgentIcon agent={each} />, description: installed.includes(each) ? null : t('AgentPicker.notInstalled') })),
        { value: '', label: t('TaskQuickAdd.chooseLater'), icon: <AgentIcon agent={null} /> }
      ]}
      onChange={(value) => useQuickAdd.setState({ agent: choices.find((each) => each === value) ?? null })}
    />
  )
}
