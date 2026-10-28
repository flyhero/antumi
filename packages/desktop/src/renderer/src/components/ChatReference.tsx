import type { ChatReferenceTarget } from '@antumi/protocol'
import { useSyncExternalStore, type MouseEventHandler, type ReactNode } from 'react'
import { isDarkTheme, onThemeChange } from '../appearance'
import { mentionLabel } from '../chat-mentions'
import { selectConversation, useCore } from '../core-store'
import { revealFile } from '../desktop-bridge'
import { showChatFile } from '../file-actions'
import { t } from '../i18n'
import { useChatFiles } from './ChatContextMenu'
import { openAgentProfile } from './AgentProfiles'
import { FileTypeIcon } from './FileTypeIcon'
import { AgentIcon, ChatIcon, FolderIcon } from './icons'
import './chat-reference.css'

// The icon the mention menu showed for it: an agent's own mark, a file's type.
export function ReferenceIcon({ target }: { target: ChatReferenceTarget }) {
  const agent = useCore((state) => target.kind === 'agent' ? state.agentProfiles[target.id]?.agent ?? null : null)
  const dark = useSyncExternalStore(onThemeChange, isDarkTheme, () => false)
  if (target.kind === 'conversation') return <ChatIcon />
  if (target.kind === 'agent') return <AgentIcon agent={agent} />
  if (target.kind === 'project') return <FolderIcon />
  return <FileTypeIcon path={target.path} directory={target.kind === 'directory'} dark={dark} />
}

export function ReferenceMark({ target, children, title, disabled, onClick, onMouseDown, tabIndex }: {
  target: ChatReferenceTarget
  children?: ReactNode
  title?: string
  disabled?: boolean
  onClick?: () => void
  onMouseDown?: MouseEventHandler<HTMLButtonElement>
  tabIndex?: number
}) {
  const label = children ?? mentionLabel(target)
  const content = <><span className="chat-reference-icon" aria-hidden="true"><ReferenceIcon target={target} /></span><span className="chat-reference-name">{label}</span></>
  const hint = title ?? (target.kind === 'conversation' ? target.title : target.kind === 'agent' ? target.name : target.path)
  return onClick ? <button type="button" className="chat-reference" data-reference-kind={target.kind}
    data-file-path={target.kind === 'file' || target.kind === 'directory' || target.kind === 'project' ? target.path : undefined}
    data-conversation-id={target.kind === 'conversation' ? target.id : undefined}
    data-profile-id={target.kind === 'agent' ? target.id : undefined}
    disabled={disabled} title={hint} tabIndex={tabIndex} onMouseDown={onMouseDown} onClick={onClick}>{content}</button>
    : <span className="chat-reference" data-reference-kind={target.kind} title={hint}>{content}</span>
}

export function useOpenReference(): (target: ChatReferenceTarget) => void {
  const scope = useChatFiles()
  return (target) => {
    if (target.kind === 'conversation') {
      if (useCore.getState().conversations[target.id]) selectConversation(target.id)
    }
    else if (target.kind === 'agent') openAgentProfile(target.id)
    else if (target.kind === 'file' && scope) void showChatFile(scope, { path: target.path, line: null })
    else void revealFile([target.path])
  }
}

export function ChatReferenceLink({ target, children }: { target: ChatReferenceTarget; children?: ReactNode }) {
  const open = useOpenReference()
  const available = useCore((state) => target.kind === 'conversation' ? Boolean(state.conversations[target.id]) : target.kind === 'agent' ? Boolean(state.agentProfiles[target.id]) : true)
  return <ReferenceMark target={target} disabled={!available} title={target.kind === 'conversation' && !available ? t('ConversationReference.unavailable') : undefined} onClick={() => open(target)}>{children}</ReferenceMark>
}
