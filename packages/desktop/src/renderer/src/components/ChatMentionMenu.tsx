import { getLocale, t, tr } from '../i18n'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode, type RefObject, type HTMLAttributes } from 'react'
import type { EditorView } from '@codemirror/view'
import type { AgentKind, DelegationTarget, ProjectFileMatch } from '@antumi/protocol'
import { useCore, useFileMentionsSupported } from '../core-store'
import { fileTarget, insertMention, matchConversations, matchProjects, mentionQuery, placeMention, type MentionedText, type MentionTarget } from '../chat-mentions'
import type { SetText } from './ChatMentionField'
import { projectName } from './ProjectPicker'
import { AgentIcon, ChatIcon, FolderIcon } from './icons'
import { FileTypeIcon } from './FileTypeIcon'
import { isDarkTheme, onThemeChange } from '../appearance'
import { agentLabel } from '../labels'
import { usePreferences } from '../preferences'
import { useNow } from '../usage-format'
import { delegationQuotaText } from './AgentQuota'
import './chat-mention-menu.css'

// Long enough that a word typed at speed asks once.
const SEARCH_DELAY_MS = 80

type InputProps = Pick<HTMLAttributes<HTMLDivElement>, 'aria-autocomplete' | 'aria-expanded' | 'aria-controls' | 'aria-activedescendant'> & {
  input: RefObject<EditorView | null>
  onSelectionChange: () => void
}

// `opens`: what Tab puts after the @ to look inside a folder, its path under its project.
type MentionGroup = 'files' | 'projects' | 'profiles' | 'conversations'
type MentionEntry = { key: string; group: MentionGroup; target: MentionTarget | null; name: string; detail: string; opens: string | null; icon: ReactNode }
const NO_FILES: readonly ProjectFileMatch[] = []

function fileEntry(match: ProjectFileMatch, cwd: string | null, manyRoots: boolean, dark: boolean): MentionEntry {
  const folder = match.relative.includes('/') ? match.relative.slice(0, match.relative.lastIndexOf('/')) : ''
  const detail = manyRoots ? [projectName(match.root), folder].filter(Boolean).join('/') : folder
  const opens = match.kind === 'directory' ? `${match.relative}/` : null
  return { key: `file:${match.path}`, group: 'files', target: fileTarget(match, cwd), name: projectName(match.relative), detail, opens,
    icon: <FileTypeIcon path={match.path} directory={match.kind === 'directory'} dark={dark} /> }
}

function MentionOption({ entry, id, active, onHover, onPick }: {
  entry: MentionEntry
  id: string
  active: boolean
  onHover: () => void
  onPick: () => void
}) {
  const row = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (active) row.current?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return (
    <li
      ref={row}
      id={id}
      role="option"
      aria-selected={active}
      className="chat-mention-option"
      data-detail={Boolean(entry.detail) || undefined}
      title={[entry.name, entry.detail].filter(Boolean).join('\n')}
      // Keeps the focus in the input, which goes on taking the keys.
      onMouseDown={(event) => event.preventDefault()}
      // Only a pointer that moves picks a row, as in the command menu.
      onMouseMove={(event) => {
        if (!active && (event.movementX !== 0 || event.movementY !== 0)) onHover()
      }}
      onClick={onPick}
    >
      <span className="chat-mention-option-icon" data-reference-kind={entry.target?.kind} aria-hidden="true">{entry.icon}</span>
      <span className={`chat-mention-option-name${entry.group === 'files' || entry.group === 'projects' ? ' mono' : ''}`}>{entry.name}{entry.target?.kind === 'directory' ? '/' : ''}</span>
      {entry.detail && <span className="chat-mention-option-description">{entry.detail}</span>}
    </li>
  )
}

// Agents, files, projects and conversations matching the @word above the input. Enter puts the
// one picked in as a mention, its icon and short name, written out for the agent as the message goes
// (see writeMentions); Tab on a folder opens it to pick inside, and elsewhere picks too; Esc puts
// the list away until the text changes.
export function useChatMentionMenu({ value, setText, setValue, roots, cwd, agent, conversationId }: {
  conversationId?: string
  value: MentionedText
  setText: SetText
  setValue: (value: MentionedText) => void
  // The folders the agent works in, its working folder first.
  roots: readonly string[]
  cwd: string | null
  agent: AgentKind | null
}): {
  menu: ReactNode
  inputProps: InputProps
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => boolean
} {
  const listId = useId()
  const { text } = value
  const input = useRef<EditorView>(null)
  const [caret, setCaret] = useState(0)
  // Where the caret goes once a pick's text is in the input.
  const placed = useRef<number | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [closedAt, setClosedAt] = useState<string | null>(null)
  const [group, setGroup] = useState<MentionGroup | null>(null)
  const fileMentions = useFileMentionsSupported()
  const rpc = useCore((s) => s.rpc)
  const conversations = useCore((s) => s.conversations)
  const readHistory = useCore((s) => s.chatSettings?.readHistory === true)
  const references = Boolean(rpc?.features.includes('conversation-references') && readHistory)
  const supported = (fileMentions || references) && agent !== null
  const profiles = useCore((s) => s.agentProfiles)
  const conversation = useCore((s) => conversationId ? s.conversations[conversationId] : null)
  const delegates = Boolean(rpc?.features.includes('agent-profiles') && conversation
    && !conversation.parentConversationId && !conversation.discussionId && !conversation.squadRunId && !conversation.routineId && !conversation.helperOf)
  const disabledAgents = usePreferences((s) => s.disabledAgents)
  const callable = Object.values(profiles).filter((profile) => delegates && profile.archivedAt === null && profile.id !== conversation?.profile?.id
    && !disabledAgents.includes(profile.agent) && (!conversation?.profile || conversation.profile.callableProfiles.includes(profile.id)))
  // What core says of whom it can delegate to: their quota, and the agents called as they are.
  const [targets, setTargets] = useState<readonly DelegationTarget[]>([])
  const display = usePreferences((s) => s.usageDisplay)
  const now = useNow(60_000)
  const quotaOf = (target: DelegationTarget | undefined) => target ? delegationQuotaText(target.quota, display, now) : null
  // Less those the user turned off and any a profile already goes by.
  const direct = targets.filter((entry) => entry.profileId === null && !disabledAgents.includes(entry.agent)
    && !callable.some((profile) => profile.name.toLocaleLowerCase() === entry.name.toLocaleLowerCase()))
  const range = supported ? mentionQuery(text, Math.min(caret, text.length)) : null
  const query = range?.query ?? null
  const rootsKey = roots.join('\0')
  const [fileResult, setFileResult] = useState<{ query: string; roots: string; matches: ProjectFileMatch[] } | null>(null)
  const files = fileResult?.query === query && fileResult.roots === rootsKey ? fileResult.matches : NO_FILES
  const filesLoading = query !== null && fileMentions && Boolean(rpc && rootsKey) && (fileResult?.query !== query || fileResult.roots !== rootsKey)
  const [projects, setProjects] = useState<string[] | null>(null)
  const dark = useSyncExternalStore(onThemeChange, isDarkTheme, () => false)

  useLayoutEffect(() => {
    if (placed.current === null || !input.current) return
    input.current.dispatch({ selection: { anchor: placed.current } })
    setCaret(placed.current)
    placed.current = null
  }, [text])

  useEffect(() => {
    if (query === null || !rpc || !rootsKey || !fileMentions) return
    let current = true
    const timer = setTimeout(() => {
      // Not through perform: a failed search only offers nothing.
      rpc.call('projects.searchFiles', { roots: rootsKey.split('\0'), query }).then(
        (found) => current && setFileResult({ query, roots: rootsKey, matches: found }),
        () => current && setFileResult({ query, roots: rootsKey, matches: [] })
      )
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query, rootsKey, rpc, fileMentions])

  const asking = query !== null
  useEffect(() => {
    if (!asking || !rpc || projects !== null) return
    let current = true
    rpc.call('projects.recent', {}).then((found) => current && setProjects(found), () => current && setProjects([]))
    return () => { current = false }
  }, [asking, rpc, projects])

  const directSupported = delegates && Boolean(rpc?.features.includes('direct-agent-calls'))
  useEffect(() => {
    if (!asking || !rpc || !conversationId || !directSupported) return
    let current = true
    rpc.call('agentCalls.targets', { id: conversationId }).then((found) => current && setTargets(found), () => current && setTargets([]))
    return () => { current = false }
  }, [asking, rpc, conversationId, directSupported])

  const entries = useMemo(() => {
    if (query === null) return { profiles: [], files: [], projects: [], conversations: [] }
    const fileRows = rootsKey ? files.map((match) => fileEntry(match, cwd, roots.length > 1, dark)) : []
    const projectRows = matchProjects(projects ?? [], query).map((projectPath): MentionEntry => ({
      key: `project:${projectPath}`,
      group: 'projects',
      target: { kind: 'project', path: projectPath, relative: null },
      name: projectName(projectPath),
      detail: projectPath,
      opens: null,
      icon: <FolderIcon />
    }))
    const profileRows = callable.filter((profile) => profile.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((profile): MentionEntry => ({
      key: `profile:${profile.id}`, group: 'profiles', target: { kind: 'agent', id: profile.id, name: profile.name }, name: profile.name, opens: null,
      detail: [profile.description || agentLabel(profile.agent), quotaOf(targets.find((each) => each.profileId === profile.id))].filter(Boolean).join(' · '),
      icon: <AgentIcon agent={profile.agent} />
    }))
    // Named in the text only: the agent finds it by name among those antumi_agent_list returns.
    const directRows = direct.filter((entry) => entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((entry): MentionEntry => ({
      key: `agent:${entry.agent}`, group: 'profiles', target: null, name: entry.name, detail: [t('AgentProfiles.engine'), quotaOf(entry)].filter(Boolean).join(' · '), opens: null,
      icon: <AgentIcon agent={entry.agent} />
    }))
    const conversationRows = references ? matchConversations(Object.values(conversations), query, conversationId).map((entry): MentionEntry => ({
      key: `conversation:${entry.id}`, group: 'conversations', target: { kind: 'conversation', id: entry.id, title: entry.title },
      name: entry.title || entry.id.slice(0, 8),
      detail: [agentLabel(entry.agent), ...entry.projectPaths.map(projectName), entry.archivedAt != null ? t('ConversationList.archived') : '', entry.id.slice(0, 8)].filter(Boolean).join(' · '),
      opens: null, icon: <ChatIcon />
    })) : []
    return { profiles: [...profileRows, ...directRows], files: fileRows, projects: projectRows, conversations: conversationRows }
  }, [query, files, projects, cwd, rootsKey, roots.length, profiles, conversation, delegates, targets, disabledAgents, display, now, conversations, conversationId, references, dark, getLocale()])
  const tabs: { id: MentionGroup; label: string; loading: boolean }[] = [
    ...(delegates ? [{ id: 'profiles' as const, label: t('AgentProfiles.title'), loading: false }] : []),
    { id: 'files', label: t('ChatMentionMenu.files'), loading: filesLoading },
    { id: 'projects', label: t('ChatMentionMenu.projects'), loading: projects === null },
    ...(references ? [{ id: 'conversations' as const, label: t('ChatMentionMenu.conversations'), loading: false }] : [])
  ]
  const preferred: MentionGroup = delegates && (callable.length || direct.length) ? 'profiles' : rootsKey ? 'files' : 'projects'
  // Until the user picks a category, one with something for what they typed rather than an empty one.
  const fallback = !query || entries[preferred].length > 0 ? preferred : tabs.find((tab) => entries[tab.id].length > 0)?.id ?? preferred
  const selectedGroup = tabs.some((tab) => tab.id === group) && group !== null ? group : fallback
  const shown = entries[selectedGroup]
  const loading = tabs.find((tab) => tab.id === selectedGroup)?.loading ?? false
  const open = range !== null && text !== closedAt
  const active = Math.min(highlight, Math.max(0, shown.length - 1))
  useEffect(() => setHighlight(0), [query])
  useEffect(() => {
    if (query !== null) return
    setGroup(null)
    setClosedAt(null)
  }, [query])

  const pick = (entry: MentionEntry, tab: boolean) => {
    if (!range) return
    if (!entry.target) {
      const next = insertMention(text, range, `@${entry.name}`, true)
      placed.current = next.caret
      setText(next.text, next.caret)
      setClosedAt(next.text)
    } else if (tab && entry.opens !== null) {
      const next = insertMention(text, range, `@${entry.opens}`, false)
      placed.current = next.caret
      setText(next.text, next.caret)
    } else {
      const next = placeMention(value, range, entry.target)
      placed.current = next.caret
      setValue(next.value)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): boolean => {
    if (!open || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) return false
    const entry = shown[active]
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1
      if (shown.length) setHighlight((active + step + shown.length) % shown.length)
    } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.shiftKey) {
      // The query is a few letters: the arrows go between categories, Esc gives them back to the text.
      const at = tabs.findIndex((tab) => tab.id === selectedGroup)
      const next = tabs[(at + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
      if (next) chooseGroup(next.id)
    } else if (event.key === 'Escape') {
      setClosedAt(text)
    } else if ((event.key === 'Enter' && !event.shiftKey) || (event.key === 'Tab' && !event.shiftKey)) {
      if (entry) pick(entry, event.key === 'Tab')
    } else {
      return false
    }
    event.preventDefault()
    return true
  }

  const optionId = (index: number) => `${listId}-${selectedGroup}-${index}`
  const tabId = (id: MentionGroup) => `${listId}-tab-${id}`
  const chooseGroup = (id: MentionGroup) => { setGroup(id); setHighlight(0) }
  const tabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setClosedAt(text)
      input.current?.focus()
      return
    }
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (next === null) return
    event.preventDefault()
    chooseGroup(tabs[next]!.id)
    event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus()
  }

  const menu = open ? (
    <div className="menu menu-up chat-mention-menu">
      <div className="chat-mention-tabs" role="tablist" aria-label={t('ChatMentionMenu.categories')}>
        {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={tabId(tab.id)} aria-selected={selectedGroup === tab.id} aria-controls={`${listId}-panel`} tabIndex={selectedGroup === tab.id ? 0 : -1}
          onMouseDown={(event) => event.preventDefault()} onClick={() => { chooseGroup(tab.id); input.current?.focus() }} onKeyDown={(event) => tabKeyDown(event, index)}>
          {tab.label}<span className="chat-mention-count" title={t('ChatMentionMenu.matchingResults')}>{tab.loading ? '…' : entries[tab.id].length}</span>
        </button>)}
      </div>
      <div id={`${listId}-panel`} role="tabpanel" aria-labelledby={tabId(selectedGroup)} className="chat-mention-panel">
        <ul id={listId} role="listbox" aria-labelledby={tabId(selectedGroup)} aria-busy={loading} className="menu-list chat-mention-results">
          {shown.map((entry, index) => <MentionOption key={entry.key} entry={entry} id={optionId(index)} active={index === active} onHover={() => setHighlight(index)} onPick={() => pick(entry, false)} />)}
        </ul>
        {shown.length === 0 && <p className="chat-mention-empty" role="status">{loading ? t('ChatMentionMenu.searching') : selectedGroup === 'files' && !rootsKey ? t('ChatMentionMenu.noProject') : selectedGroup === 'profiles' && !query ? t('AgentProfiles.noAvailable') : t('ChatMentionMenu.noMatches')}</p>}
      </div>
      <div className="chat-mention-keys" aria-hidden="true">{tr('ChatMentionMenu.navigateReferenceOpenFolderClose', { value1: <kbd>↑↓</kbd>, value2: <kbd>Enter</kbd>, value3: <kbd>Tab</kbd>, value4: <kbd>Esc</kbd>, value5: <kbd>←→</kbd> })}</div>
    </div>
  ) : null

  const track = () => setCaret(input.current?.state.selection.main.head ?? 0)
  const inputProps: InputProps = {
    input,
    onSelectionChange: track,
    // Only while open: the command menu describes the input otherwise.
    ...(open ? {
      'aria-autocomplete': 'list' as const,
      'aria-expanded': true,
      'aria-controls': listId,
      ...(shown.length ? { 'aria-activedescendant': optionId(active) } : {})
    } : {})
  }
  return { menu, inputProps, onKeyDown }
}
