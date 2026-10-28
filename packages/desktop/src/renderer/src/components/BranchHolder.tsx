import type { BranchHolder } from '@antumi/protocol'
import { t } from '../i18n'
import { selectConversation, setWorktreesOpen, useCore } from '../core-store'
import { revealFile } from '../desktop-bridge'
import { FILE_MANAGER } from '../file-actions'

export function folderName(folder: string): string {
  return folder.split(/[\\/]/).filter(Boolean).at(-1) ?? folder
}

// Where a branch is checked out instead, by whose it is rather than by folder: Antumi's worktrees
// are all named after the repo, so a folder name alone cannot tell them from the repo itself.
export function holderLabel(folder: string, holder: BranchHolder | undefined): string {
  if (holder?.kind === 'main') return t('BranchHolder.inMainFolder')
  if (holder?.kind === 'conversation' && holder.title) return t(holder.archived ? 'BranchHolder.inArchivedConversation' : 'BranchHolder.inConversation', { title: holder.title })
  return t('ConversationBranches.in', { value1: folderName(folder) })
}

// Why a branch cannot be switched to, said when it is picked, and what frees it: git checks a
// branch out in one folder at a time. `onLeave` closes what showed it before going elsewhere.
export function HeldBranchNote({ branch, folder, holder, onLeave }: { branch: string; folder: string; holder: BranchHolder | undefined; onLeave: () => void }) {
  const known = useCore((s) => (holder?.conversationId ? Boolean(s.conversations[holder.conversationId]) : false))
  const reveal = <button type="button" className="link-button" onClick={() => void revealFile([folder])}>{t('FileMenu.showIn', { FILE_MANAGER: FILE_MANAGER() })}</button>
  if (holder?.kind === 'conversation' && holder.conversationId) {
    const id = holder.conversationId
    return (
      <div className="branch-held-note" role="status">
        <p>{t(holder.archived ? 'BranchHolder.heldByArchivedConversation' : 'BranchHolder.heldByConversation', { branch, title: holder.title ?? folderName(folder) })}</p>
        <div className="branch-held-actions">
          {holder.archived
            ? <button type="button" className="link-button" onClick={() => { onLeave(); setWorktreesOpen(true) }}>{t('BranchHolder.manageWorktrees')}</button>
            : known && <button type="button" className="link-button" onClick={() => { onLeave(); selectConversation(id) }}>{t('WorktreeManager.openConversation')}</button>}
          {reveal}
        </div>
      </div>
    )
  }
  return (
    <div className="branch-held-note" role="status">
      <p>{holder?.kind === 'main' ? t('BranchHolder.heldByMainFolder', { branch }) : t('BranchHolder.heldElsewhere', { branch, folder })}</p>
      <div className="branch-held-actions">{reveal}</div>
    </div>
  )
}
