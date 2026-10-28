import { t } from '../i18n'
import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import type { ProjectBranches } from '@antumi/protocol'
import { useCore } from '../core-store'
import { shortRef } from '../task-starts'
import { BranchIcon, CheckIcon, ChevronDownIcon, WarningIcon } from './icons'
import { holderLabel } from './BranchHolder'
import { Popover } from './Popover'
import { projectName } from './ProjectPicker'

// The primary project's branches, asked of core when it is picked and again each time the list opens.
export function useProjectBranches(project: string | null): { options: ProjectBranches | null; refresh: () => void } {
  const rpc = useCore((s) => s.rpc)
  const [options, setOptions] = useState<ProjectBranches | null>(null)
  const refresh = useCallback(() => {
    if (!rpc || !project) return
    void rpc.call('projects.branches', { path: project }).then((next) => setOptions(next.path === project ? next : null), () => setOptions(null))
  }, [rpc, project])
  useEffect(() => {
    setOptions(null)
    refresh()
  }, [refresh])
  return { options, refresh }
}

// Which branch a new conversation starts on, beside its primary project. With a worktree, the
// branch its own is made from; without, the one the project is switched to before the agent
// starts. picked: a full ref, or null for the branch the project has checked out.
// A switch picked shows on the chip itself, "current → picked", what it does and who else works in
// the folder in its tooltip; one tracked changes will refuse turns it to a warning.
export function DraftBranchPicker({ options, picked, worktree, locked, onOpen, onPick }: {
  options: ProjectBranches
  picked: string | null
  worktree: boolean
  locked: boolean
  onOpen: () => void
  onPick: (ref: string | null) => void
}) {
  const note = worktree ? null : switchNote(options, picked)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const close = useCallback(() => setOpen(false), [])
  const current = options.branch ? `refs/heads/${options.branch}` : null
  const chosen = picked ?? current
  const needle = query.trim().toLowerCase()
  // Local branches only, as Claude's own app lists them: a remote one is fetched and checked out
  // as a local branch first.
  const local = options.refs.filter((ref) => ref.startsWith('refs/heads/'))
  const refs = needle ? local.filter((ref) => shortRef(ref).toLowerCase().includes(needle)) : local
  // git checks a branch out in one worktree at a time; as where a new one starts, any will do.
  const pickable = (ref: string) => worktree || !options.elsewhere[ref] || ref === current
  const pick = (ref: string) => {
    onPick(ref === current ? null : ref)
    close()
  }
  const onKey = (event: KeyboardEvent) => {
    const first = refs.find(pickable)
    if (event.key === 'Enter' && first) {
      event.preventDefault()
      pick(first)
    }
  }
  const name = chosen ? shortRef(chosen) : 'HEAD'
  const tooltip = note?.text ?? (worktree ? t('DraftBranchPicker.branchTheNewWorktreeFromHere') : t('DraftBranchPicker.workOnThisBranchChoosingAnotherSwitchesThe'))
  return (
    <span className="menu-anchor">
      <button
        type="button"
        className="chat-draft-branch"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={locked}
        data-tooltip={tooltip}
        data-tooltip-side="top"
        data-switch={note ? true : undefined}
        data-blocked={note?.blocked || undefined}
        onClick={() => {
          if (!open) {
            setQuery('')
            onOpen()
          }
          setOpen(!open)
        }}
      >
        {note?.blocked ? <WarningIcon /> : <BranchIcon />}
        {worktree && <span className="chat-draft-branch-from">{t('DraftBranchPicker.from')}</span>}
        {note && options.branch && <><span className="chat-draft-branch-name chat-draft-branch-current mono">{options.branch}</span><span className="chat-draft-branch-arrow" aria-hidden="true">→</span></>}
        <span className="chat-draft-branch-name mono">{name}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <Popover label={worktree ? t('DraftBranchPicker.chooseStartingBranch') : t('DraftBranchPicker.chooseBranch')} onClose={close}>
          <p className="menu-label">{worktree ? t('DraftBranchPicker.startingBranchForSNewWorktree', { value1: projectName(options.path) }) : t('DraftBranchPicker.branchToWorkOnIn', { value1: projectName(options.path) })}</p>
          <input className="input menu-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKey} placeholder={t('DraftBranchPicker.searchBranchesEnterToSelectTheFirst')} aria-label={t('ConversationBranches.searchBranches')} />
          <ul className="menu-list branch-action-list">
            {refs.map((ref) => {
              const holder = options.elsewhere[ref]
              return (
                <li key={ref} className="menu-row">
                  <button type="button" className="menu-item" disabled={!pickable(ref)} title={holder && !worktree ? t('ConversationBranches.checkedOutIn', { holder: holder }) : undefined} onClick={() => pick(ref)}>
                    <span className="menu-item-title mono">{shortRef(ref)}</span>
                    {ref === current && <span className="menu-item-path">{t('DraftBranchPicker.current')}</span>}
                    {holder && !worktree && <span className="menu-item-path">{holderLabel(holder, options.holders?.[ref])}</span>}
                    {ref === chosen && <span className="menu-check"><CheckIcon /></span>}
                  </button>
                </li>
              )
            })}
          </ul>
          {refs.length === 0 && <p className="branch-action-note">{t('ConversationBranches.noMatchingBranches')}</p>}
        </Popover>
      )}
    </span>
  )
}

// What a switch picked without a worktree will do to the project, and what may stop it.
export function switchNote(options: ProjectBranches, picked: string | null): { text: string; blocked: boolean } | null {
  if (!picked) return null
  const project = projectName(options.path)
  if (options.changes > 0) return { text: t('DraftBranchPicker.hasUncommittedChangesAndCannotSwitchCommitOr', { project: project, value2: options.changes }), blocked: true }
  const shared = options.sharedWith.length > 0 ? t('DraftBranchPicker.conversationsAlsoUseThisDirectory', { value1: options.sharedWith.map((title) => `「${title}」`).join('、') }) : ''
  return { text: t('DraftBranchPicker.sendingSwitchesFromTo', { project: project, value2: options.branch ?? t('DraftBranchPicker.currentCommit'), value3: shortRef(picked), shared: shared }), blocked: false }
}
