import { useState, type MouseEvent } from 'react'
import { useCore } from '../core-store'
import { conversationGlyph, conversationState } from '../conversation-state'
import { t } from '../i18n'
import { agentConversation, newAgentConversation, openPinnedAgent, pinAgent, pinnedAgents } from '../pinned-agents'
import { usePreferences } from '../preferences'
import { AgentAvatar } from './AgentAvatar'
import { openAgentProfile } from './AgentProfiles'
import { ContextMenu, MenuItem, menuPoint, type MenuPoint } from './ContextMenu'
import { MoreIcon, PencilIcon, PinIcon, PlusIcon } from './icons'
import './sidebar-pinned-agents.css'

export function SidebarPinnedAgents() {
  const ids = usePreferences((s) => s.pinnedAgentIds)
  const profiles = useCore((s) => s.agentProfiles)
  const conversations = useCore((s) => s.conversations)
  const unseen = useCore((s) => s.unseen)
  const current = useCore((s) => s.section === 'conversations' && !s.settingsOpen && !s.overviewOpen && !s.inboxOpen && !s.worktreesOpen && !s.routinesOpen ? s.selectedConversationId : null)
  const draft = useCore((s) => s.section === 'conversations' && s.conversationDraft && !s.settingsOpen && !s.overviewOpen && !s.inboxOpen && !s.worktreesOpen && !s.routinesOpen ? s.draftProfileId : null)
  const [menu, setMenu] = useState<{ id: string; at: MenuPoint } | null>(null)
  const shown = pinnedAgents(ids, profiles)
  const selected = shown.find((profile) => profile.id === menu?.id)
  const chats = Object.values(conversations)
  const pick = (action: () => void) => () => { setMenu(null); action() }
  const openMenu = (id: string, event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    setMenu({ id, at: menuPoint(event) })
  }
  if (shown.length === 0) return null
  return <>
    <ul className="sidebar-pinned-agents" aria-label={t('AgentProfiles.pinnedAgents')}>
      {shown.map((profile) => {
        const conversation = agentConversation(profile.id, chats, current)
        const active = conversation?.id === current || draft === profile.id
        const glyph = conversation ? conversationGlyph(conversation, Boolean(unseen[conversation.id])) : 'idle'
        const status = conversation ? conversationState(conversation) : null
        const hint = conversation ? `${profile.name} · ${conversation.title}` : profile.name
        return <li key={profile.id} className="sidebar-pinned-agent" data-menu-open={menu?.id === profile.id || undefined} onContextMenu={(event) => openMenu(profile.id, event)}>
          <button type="button" className="sidebar-pinned-agent-open" aria-label={profile.name} aria-current={active || undefined} title={hint} onClick={() => openPinnedAgent(profile.id)}>
            <span className="agent-status-mark" data-glyph={glyph} role="img" aria-label={glyph === 'unseen' ? t('ConversationStatus.newActivity') : status?.label ?? profile.name} title={status?.detail ?? status?.label}>
              <AgentAvatar id={profile.id} />
              {glyph !== 'idle' && <span className="agent-status-ring" aria-hidden="true" />}
            </span>
            <span className="sidebar-pinned-agent-name">{profile.name}</span>
          </button>
          <button type="button" className="icon-button sidebar-pinned-agent-menu" aria-label={t('AgentProfiles.agentActions', { name: profile.name })} onClick={(event) => openMenu(profile.id, event)}><MoreIcon /></button>
        </li>
      })}
    </ul>
    {menu && selected && <ContextMenu at={menu.at} label={t('AgentProfiles.agentActions', { name: selected.name })} onClose={() => setMenu(null)}>
      <MenuItem label={t('AgentProfiles.chat')} icon={<PlusIcon />} onSelect={pick(() => newAgentConversation(selected.id))} />
      <MenuItem label={t('AgentProfiles.editAgent')} icon={<PencilIcon />} onSelect={pick(() => openAgentProfile(selected.id))} />
      <div className="menu-separator" role="separator" />
      <MenuItem label={t('AgentProfiles.unpinFromSidebar')} icon={<PinIcon />} onSelect={pick(() => pinAgent(selected.id, false))} />
    </ContextMenu>}
  </>
}
