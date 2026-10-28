import { localized, t, tr } from '../i18n'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { checkSwitchBranch, type CommitPushResult, type CommitResult, type Conversation, type GitTarget, type ProjectBranches, type ProjectHead } from '@antumi/protocol'
import { perform, useCore } from '../core-store'
import { reasonText } from '../labels'
import { shortRef } from '../task-starts'
import { BranchStatusDetails } from './BranchStatus'
import { folderName, HeldBranchNote, holderLabel } from './BranchHolder'
import { CommitMessageButton } from './CommitMessageButton'
import { ArrowUpIcon, BranchIcon, CheckIcon, CommitIcon, PlusIcon } from './icons'
import { hasPrimaryModifier, PRIMARY_KEY_LABEL } from '../shortcut-keys'
import { useOccludesBrowser } from '../browser-occlusion'
import { commitSubject, commitWithWrittenMessage, useCanWriteCommitMessage, useWritingCommit } from '../written-commits'

// A conversation works in the user's own checkout: switching changes it for everything in the folder.
function useBranchOptions(id: string, version: number): readonly ProjectBranches[] {
  const rpc = useCore((s) => s.rpc)
  const gitRevision = useCore((s) => s.gitRevision)
  const [options, setOptions] = useState<readonly ProjectBranches[]>([])
  useEffect(() => {
    if (!rpc?.features.includes('conversation-branches')) return
    let live = true
    void rpc.call('conversations.branchOptions', { id }).then((found) => {
      if (live) setOptions(found)
    }, () => {})
    return () => {
      live = false
    }
  }, [rpc, id, version, gitRevision])
  return options
}

// The local branch a switch to `ref` leaves checked out: a remote one goes by its own name.
function localName(ref: string): string {
  return ref.startsWith('refs/remotes/') ? shortRef(ref).split('/').slice(1).join('/') : shortRef(ref)
}

// The agent hears of the switch with the next message.
function switchedNote(branch: string): string {
  return t('ConversationBranches.switchedToAgentWillBeNotifiedWithYour', { branch: branch })
}

// A branch another folder holds is still listed and can be picked, to say whose it is and what
// frees it, rather than sitting there greyed with its reason only on hover.
function SwitchList({ option, onPick, onLeave }: { option: ProjectBranches; onPick: (ref: string) => void; onLeave: () => void }) {
  const [query, setQuery] = useState('')
  const [held, setHeld] = useState<string | null>(null)
  const needle = query.trim().toLowerCase()
  const refs = needle ? option.refs.filter((ref) => shortRef(ref).toLowerCase().includes(needle)) : option.refs
  const current = option.branch ? `refs/heads/${option.branch}` : null
  const pickable = (ref: string) => ref !== current && !option.elsewhere[ref]
  const onKey = (event: KeyboardEvent) => {
    const first = refs.find(pickable)
    if (event.key === 'Enter' && first) {
      event.preventDefault()
      onPick(first)
    }
  }
  if (option.changes > 0) return <p className="branch-action-note" data-warn>{tr('ConversationBranches.thereAreUncommittedChangesCommitOrStashThem', { value1: option.changes })}</p>
  return (
    <div className="branch-action">
      {option.sharedWith.length > 0 && (
        <p className="branch-action-note" data-warn>{tr('ConversationBranches.alsoUseThisDirectoryAndWillSeeDifferent', { value1: option.sharedWith.map((title) => t('ConversationBranches.conversation', { title: title })).join('、') })}</p>
      )}
      <input className="input menu-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKey} placeholder={t('ConversationBranches.searchBranchesEnterToSwitchToTheFirst')} aria-label={t('ConversationBranches.searchBranches')} />
      <ul className="menu-list branch-action-list">
        {refs.map((ref) => {
          const holder = option.elsewhere[ref]
          return (
            <li key={ref} className="menu-row">
              <button type="button" className="menu-item" disabled={ref === current} data-held={holder ? true : undefined} aria-expanded={holder ? held === ref : undefined}
                title={holder ? t('ConversationBranches.checkedOutIn', { holder: holder }) : undefined} onClick={() => (holder ? setHeld(held === ref ? null : ref) : onPick(ref))}>
                <span className="menu-item-title mono">{shortRef(ref)}</span>
                {holder && <span className="menu-item-path">{holderLabel(holder, option.holders?.[ref])}</span>}
                {ref === current && <span className="menu-check"><CheckIcon /></span>}
              </button>
            </li>
          )
        })}
      </ul>
      {refs.length === 0 && <p className="branch-action-note">{t('ConversationBranches.noMatchingBranches')}</p>}
      {held && option.elsewhere[held] && <HeldBranchNote branch={shortRef(held)} folder={option.elsewhere[held]} holder={option.holders?.[held]} onLeave={onLeave} />}
    </div>
  )
}

function CreateForm({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState('')
  const submit = () => {
    if (name.trim()) onCreate(name.trim())
  }
  return (
    <div className="branch-action branch-action-create">
      <input
        className="input"
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
        }}
        placeholder={t('ConversationBranches.newBranchNameEGFixLogin')}
        aria-label={t('ConversationBranches.newBranchName')}
      />
      <button type="button" className="button" disabled={!name.trim()} onClick={submit}>{t('ConversationBranches.createAndSwitch')}</button>
      <p className="branch-action-note">{t('ConversationBranches.branchFromTheCurrentCommitCarryingUncommittedChanges')}</p>
    </div>
  )
}

// The message gets room for a subject and a body. With the steps on their own, it can be kept
// local; ⌘Enter commits and pushes, as the main button does. Left empty, the agent writes it.
function CommitForm({ target, steps, busy, onCommit }: { target: GitTarget; steps: boolean; busy: boolean; onCommit: (message: string, push: boolean) => void }) {
  const [message, setMessage] = useState('')
  const writable = useCanWriteCommitMessage(target)
  const ready = !busy && (Boolean(message.trim()) || writable)
  const submit = (push: boolean) => {
    if (ready) onCommit(message.trim(), push)
  }
  return (
    <div className="branch-action branch-commit">
      <textarea
        className="input branch-commit-message"
        autoFocus
        rows={6}
        value={message}
        maxLength={10_000}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && hasPrimaryModifier(event) && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit(true)
          }
        }}
        placeholder={writable ? t('ConversationBranches.commitMessageTitleOnTheFirstLineBlank') : t('ConversationBranches.commitMessageTitleOnTheFirstLineBlank_595')}
        aria-label={t('ConversationBranches.commitMessage')}
      />
      <p className="branch-action-note">{tr('ConversationBranches.commitAllChangesInThisRepositoryWithoutAn', { value1: steps ? t('ConversationBranches.commitPushAlsoPushesTheCurrentBranch') : t('ConversationBranches.thenPushTheCurrentBranch') })}</p>
      <div className="branch-commit-buttons">
        <CommitMessageButton target={target} disabled={busy} onMessage={setMessage} />
        {steps && <button type="button" className="button" disabled={!ready} onClick={() => submit(false)}>Commit</button>}
        <button type="button" className="button primary" disabled={!ready} title={`${PRIMARY_KEY_LABEL}Enter`} onClick={() => submit(true)}>Commit &amp; Push</button>
      </div>
    </div>
  )
}

function PushForm({ head, busy, onPush }: { head: ProjectHead; busy: boolean; onPush: () => void }) {
  const what = head.upstream
    ? t('ConversationBranches.pushCommitsOnTo', { value1: head.branch, value2: head.ahead ?? 0, value3: head.upstream })
    : t('ConversationBranches.hasNoUpstreamItWillPushToOrigin', { value1: head.branch })
  return (
    <div className="branch-action branch-commit">
      <p className="branch-push-what">{what}</p>
      {(head.changes ?? 0) > 0 && <p className="branch-action-note" data-warn>{tr('ConversationBranches.uncommittedChangesWillNotBePushed', { value1: head.changes })}</p>}
      <div className="branch-commit-buttons">
        <button type="button" className="button primary" autoFocus disabled={busy} onClick={onPush}>Push</button>
      </div>
    </div>
  )
}

type BranchAction = 'switch' | 'create' | 'commit' | 'push'

const ACTION_TITLE: Record<BranchAction, string> = localized(() => ({ switch: t('ConversationBranches.switchBranch'), create: t('ConversationBranches.newBranch'), commit: 'Commit', push: 'Push' }))

// One branch action in a dialog of its own, over the popover. It stays inside the popover's DOM, so
// pressing in it is not a click outside, and keeps Escape to itself, so the popover stays open
// under it and shows how the action went.
function BranchActionDialog({ action, head, onClose, children }: { action: BranchAction; head: ProjectHead; onClose: () => void; children: ReactNode }) {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    // showModal takes the focus to the first button, the close; the action's field wants it.
    element?.querySelector<HTMLElement>('input, textarea, .button.primary')?.focus()
    return () => element?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="modal branch-dialog"
      aria-label={`${ACTION_TITLE[action]} · ${folderName(head.path)}`}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.stopPropagation()
      }}
      // The backdrop is the dialog itself; its content sits in .modal-body.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal-body">
        <header className="modal-header">
          <div>
            <h2>{ACTION_TITLE[action]}</h2>
            <p className="branch-dialog-where muted">{folderName(head.path)}{head.branch ? t('ConversationBranches.currentlyOn', { value1: head.branch }) : ''}</p>
          </div>
          <button type="button" className="icon-button modal-close" aria-label={t('BackdropPicker.close')} onClick={onClose}>×</button>
        </header>
        {children}
      </div>
    </dialog>
  )
}

function ProjectActions({ conversation, head, option, onChanged }: {
  conversation: Conversation
  head: ProjectHead
  option: ProjectBranches | undefined
  onChanged: (note: string) => void
}) {
  const commitPush = useCore((s) => s.rpc?.features.includes('conversation-commit-push') ?? false)
  // An older core does both in one; the steps on their own come with conversation-commit-steps.
  const steps = useCore((s) => s.rpc?.features.includes('conversation-commit-steps') ?? false)
  const [open, setOpen] = useState<BranchAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [pushing, setPushing] = useState(false)
  const writing = useWritingCommit({ kind: 'conversation', id: conversation.id, project: head.path })
  if (!option?.git) return null
  const blocker = checkSwitchBranch(conversation)
  const done = <T,>(note: (result: T) => string) => (result: T | null) => {
    setBusy(false)
    if (result) {
      setOpen(null)
      onChanged(note(result))
    }
  }
  const run = async (call: Parameters<typeof perform>[0], branch: string) => {
    setBusy(true)
    done(() => switchedNote(branch))(await perform(call))
  }
  const project = { id: conversation.id, project: head.path }
  const target: GitTarget = { kind: 'conversation', ...project }
  const commit = async (message: string, push: boolean) => {
    if (!message) {
      // The dialog goes at once; the agent writes the message and the commit follows behind it.
      setOpen(null)
      if (push || !steps) {
        const done = await commitWithWrittenMessage(target, (written) => perform((rpc) => rpc.call('conversations.commitPush', { ...project, message: written })))
        if (done) onChanged(t('ConversationBranches.committedAndPushedTo', { value1: done.result.commit, value2: commitSubject(done.message), value3: done.result.upstream }))
      } else {
        const done = await commitWithWrittenMessage(target, (written) => perform((rpc) => rpc.call('conversations.commit', { ...project, message: written })))
        if (done) onChanged(t('ConversationBranches.committedNotPushedYet', { value1: done.result.commit, value2: commitSubject(done.message) }))
      }
      return
    }
    setBusy(true)
    if (push || !steps) {
      done<CommitPushResult>((result) => t('ConversationBranches.committedAndPushedTo_608', { value1: result.commit, value2: result.upstream }))(await perform((rpc) => rpc.call('conversations.commitPush', { ...project, message })))
    } else {
      done<CommitResult>((result) => t('ConversationBranches.committedNotPushedYet_609', { value1: result.commit }))(await perform((rpc) => rpc.call('conversations.commit', { ...project, message })))
    }
  }
  // A push can take a while: the dialog goes at once, and the bar says it is under way.
  const push = async () => {
    setOpen(null)
    setPushing(true)
    const result = await perform((rpc) => rpc.call('conversations.push', project))
    setPushing(false)
    if (result) onChanged(t('ConversationBranches.pushedTo', { value1: result.branch, value2: result.upstream }))
  }
  const hint = blocker ? reasonText(blocker, blocker) : undefined
  const commitHint = hint ?? (!head.branch ? t('ConversationBranches.noCurrentBranch') : head.changes === 0 ? t('ConversationBranches.noChangesToCommit') : undefined)
  // Nothing to push: a tracked branch with no commit past its upstream.
  const pushHint = hint ?? (!head.branch ? t('ConversationBranches.noCurrentBranch') : head.upstream && (head.ahead ?? 0) === 0 ? t('ConversationBranches.noCommitsToPush') : undefined)
  const canCommit = !blocker && Boolean(head.branch) && (head.changes ?? 0) > 0
  const canPush = !blocker && Boolean(head.branch) && !(head.upstream && (head.ahead ?? 0) === 0)
  const button = (action: BranchAction, enabled: boolean, title: string | undefined, content: ReactNode, primary = false) => (
    <button
      type="button"
      className="branch-action-button"
      data-primary={primary || undefined}
      aria-haspopup="dialog"
      aria-expanded={open === action}
      disabled={busy || pushing || writing || !enabled}
      title={title}
      onClick={() => setOpen(action)}
    >
      {content}
    </button>
  )
  return (
    <>
      <div className="branch-actions">
        {button('switch', blocker === null, hint, <>{tr('ConversationBranches.switch', { value1: <BranchIcon /> })}</>)}
        {button('create', blocker === null, hint, <>{tr('ConversationBranches.new', { value1: <PlusIcon /> })}</>)}
        {commitPush && button('commit', canCommit, commitHint, <><CommitIcon />{steps ? 'Commit' : 'Commit & Push'}</>, canCommit)}
        {commitPush && steps && button('push', canPush, pushHint, <><ArrowUpIcon />Push</>, !canCommit && canPush && (head.ahead ?? 0) > 0)}
        {blocker ? <span className="branch-actions-blocked">{hint}</span> : writing ? <span className="branch-actions-blocked">{t('ConversationBranches.writingCommitMessageThenCommitting')}</span>
          : pushing && <span className="branch-actions-blocked" role="status">{t('ConversationBranches.pushing', { value1: head.branch })}</span>}
      </div>
      {open && (
        <BranchActionDialog action={open} head={head} onClose={() => setOpen(null)}>
          {open === 'switch' && (
            <SwitchList option={option} onPick={(ref) => void run((rpc) => rpc.call('conversations.switchBranch', { ...project, ref }), localName(ref))} onLeave={() => setOpen(null)} />
          )}
          {open === 'create' && <CreateForm onCreate={(name) => void run((rpc) => rpc.call('conversations.createBranch', { ...project, name }), name)} />}
          {open === 'commit' && <CommitForm target={target} steps={steps} busy={busy} onCommit={(message, alsoPush) => void commit(message, alsoPush)} />}
          {open === 'push' && <PushForm head={head} busy={busy} onPush={() => void push()} />}
        </BranchActionDialog>
      )}
    </>
  )
}

// The branch popover of a conversation: each project's state, and switching it or starting a
// branch there, while no agent works in the folder.
export function ConversationBranches({ id, heads, onChanged }: { id: string; heads: readonly ProjectHead[]; onChanged: () => void }) {
  const conversation = useCore((s) => s.conversations[id])
  const [version, setVersion] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const options = useBranchOptions(id, version)
  if (!conversation) return <BranchStatusDetails heads={heads} />
  const changed = (text: string) => {
    setNote(text)
    setVersion((current) => current + 1)
    onChanged()
  }
  return (
    <>
      <BranchStatusDetails
        heads={heads}
        actions={(head) => (
          <ProjectActions key={head.path} conversation={conversation} head={head} option={options.find((option) => option.path === head.path)} onChanged={changed} />
        )}
      />
      {note && <p className="branch-status-note branch-action-done" role="status">{note}</p>}
    </>
  )
}
