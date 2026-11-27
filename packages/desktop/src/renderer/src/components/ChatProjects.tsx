import { t } from '../i18n'
import { useRef, useState } from 'react'
import { checkEditAdditionalProjects, MAX_TASK_REPOS, type Conversation, type ProjectChoice } from '@antumi/protocol'
import { perform, useCore } from '../core-store'
import { canPickFolder, pickFolder } from '../desktop-bridge'
import { reasonText } from '../labels'
import { ContextMenu, type MenuPoint } from './ContextMenu'
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from './icons'
import { ProjectIcon } from './ProjectIcon'
import { parentDir, projectName, useProjectLocation } from './ProjectPicker'
import { availableProjects, plainProject, useRecentProjectChoices, useProjectDescriptions } from '../project-choices'
import { ProjectChoiceLabel, projectChoiceTitle } from './ProjectChoiceLabel'

// Why the additional projects cannot change right now, as the menu says it.
function blockerNote(conversation: Conversation, supported: boolean): string | null {
  if (!supported) return t('ChatProjects.thisCoreCannotChangeConversationProjectsYet')
  const blocker = checkEditAdditionalProjects(conversation)
  if (blocker === 'task-conversation') return t('ChatProjects.changeTaskProjectsInTaskDetails')
  return blocker ? reasonText(blocker, blocker) : null
}

function sameProjects(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((each) => b.includes(each))
}

// The dock header's first chip: where the conversation works. The primary is the cwd its session
// began in; the others come and go from the menu, which restarts an idle agent on its session.
// Ticks wait for the menu to close, so picking several restarts the agent once and the rows hold still.
export function ChatProjects({ conversation }: { conversation: Conversation }) {
  const supported = useCore((s) => s.rpc?.features.includes('conversation-projects') ?? false)
  const location = useProjectLocation()
  const button = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<MenuPoint | null>(null)
  const recent = useRecentProjectChoices(at !== null)
  const [copiesOpen, setCopiesOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ticked, setTicked] = useState<readonly string[]>([])
  // Mirrors `ticked` while the menu is open; null once applied, so a second close event can't apply twice.
  const pending = useRef<readonly string[] | null>(null)
  const [primary, ...extras] = conversation.projectPaths
  const descriptions = useProjectDescriptions(conversation.projectPaths)
  if (!primary) return null
  const note = blockerNote(conversation, supported)
  const full = 1 + ticked.length >= MAX_TASK_REPOS
  const available = availableProjects(note ? [] : recent, conversation.projectPaths)
  const choices = [
    ...descriptions.slice(1),
    ...available.sources
  ]
  const copies = available.copies
  const apply = async (next: readonly string[]) => {
    if (sameProjects(next, extras)) return
    setBusy(true)
    await perform((rpc) => rpc.call('conversations.setAdditionalProjects', { id: conversation.id, projectPaths: [...next] }))
    setBusy(false)
  }
  const tick = (next: readonly string[]) => {
    pending.current = next
    setTicked(next)
  }
  // Takes what is ticked so far, and leaves it unapplied.
  const dismiss = () => {
    const next = pending.current
    pending.current = null
    setAt(null)
    return next
  }
  const close = () => {
    const next = dismiss()
    if (next) void apply(next)
  }
  const open = () => {
    const box = button.current?.getBoundingClientRect()
    if (!box) return
    tick(extras)
    setCopiesOpen(false)
    setAt({ x: box.left, y: box.top })
  }
  // The dialog takes the focus, which closes the menu anyway; its pick joins the ticks in one apply.
  const browse = async () => {
    const base = dismiss() ?? extras
    const picked = await pickFolder(parentDir(primary))
    await apply(picked && !base.includes(picked) ? [...base, picked] : base)
  }
  // The agent is given its directories at launch.
  const footer = note ?? (conversation.sessionId !== null ? t('ChatProjects.appliesWhenTheMenuClosesAgentRestartsIn') : null)
  const row = (choice: ProjectChoice, badge = false) => {
    const each = choice.path
    const on = ticked.includes(each)
    return (
      <button key={each} type="button" role="menuitemcheckbox" aria-checked={on}
        className="menu-item chat-projects-item" title={note ?? projectChoiceTitle(choice)}
        disabled={note !== null || busy || (!on && full)}
        onClick={() => tick(on ? ticked.filter((other) => other !== each) : [...ticked, each])}>
        <ProjectChoiceLabel choice={choice} location={location(each)} badge={badge} />
        {on && <span className="menu-check"><CheckIcon /></span>}
      </button>
    )
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className="chat-projects"
        aria-haspopup="menu"
        aria-expanded={at !== null}
        aria-label={t('ChatProjects.conversationProjects', { value1: conversation.projectPaths.map(projectName).join('、') })}
        title={[t('ChatProjects.primaryProject', { primary: primary }), ...extras].join('\n')}
        disabled={busy}
        onClick={() => (at ? close() : open())}
      >
        <ProjectIcon path={primary} />
        <span className="chat-projects-name">{projectName(primary)}</span>
        {extras.length > 0 && <span className="chat-projects-count">+{extras.length}</span>}
        <ChevronDownIcon />
      </button>
      <span className="chat-dock-sep" aria-hidden="true" />
      {at && (
        <ContextMenu at={at} above trigger={button.current} label={t('ChatProjects.conversationProjects_445')} onClose={close}>
          <div className="chat-picker-heading">{t('ChatProjects.primaryProjectFixedAfterConversationStarts')}</div>
          <div className="menu-item chat-projects-item chat-projects-primary" title={primary}>
            <ProjectChoiceLabel choice={descriptions[0] ?? plainProject(primary)} location={location(primary)} badge />
          </div>
          <div className="menu-separator" role="separator" />
          <div className="chat-picker-heading">{t('ChatProjects.additionalProjects')}</div>
          {choices.map((choice) => row(choice, true))}
          {copies.length > 0 && <>
            <div className="menu-separator" role="separator" />
            <button type="button" role="menuitem" className="menu-item project-copies-toggle"
              aria-expanded={copiesOpen} onClick={() => setCopiesOpen(!copiesOpen)}>
              <ChevronRightIcon /><span>{t('ProjectChoices.worktree')}</span><span className="project-copies-count">{copies.length}</span>
            </button>
            {copiesOpen && copies.map((choice) => row(choice))}
          </>}
          {note === null && canPickFolder() && (
            <>
              <div className="menu-separator" role="separator" />
              <button type="button" role="menuitem" className="menu-item" disabled={full || busy} onClick={() => void browse()}>{t('ChatProjects.chooseFolder')}</button>
            </>
          )}
          {note === null && choices.length === 0 && copies.length === 0 && !canPickFolder() && <p className="menu-note">{t('ChatProjects.noRecentProjects')}</p>}
          {footer && <p className="menu-note">{footer}</p>}
        </ContextMenu>
      )}
    </>
  )
}
