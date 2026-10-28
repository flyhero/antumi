import type { ChatReferenceTarget } from '@antumi/protocol'
import type { MouseEventHandler, ReactNode } from 'react'
import { mentionLabel } from '../chat-mentions'
import { selectConversation, useCore } from '../core-store'
import { revealFile } from '../desktop-bridge'
import { showChatFile } from '../file-actions'
import { t } from '../i18n'
import { useChatFiles } from './ChatContextMenu'
import { openAgentProfile } from './AgentProfiles'
import { ChatIcon, DocumentIcon, FolderIcon, RobotIcon } from './icons'
import './chat-reference.css'

export function ReferenceIcon({ kind }: { kind: ChatReferenceTarget['kind'] }) {
  return kind === 'conversation' ? <ChatIcon /> : kind === 'agent' ? <RobotIcon /> : kind === 'file' ? <DocumentIcon /> : <FolderIcon />
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
  const content = <><span className="chat-reference-icon" aria-hidden="true"><ReferenceIcon kind={target.kind} /></span><span className="chat-reference-name">{label}</span></>
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
