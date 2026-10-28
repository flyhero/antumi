import { useState } from 'react'
import { agentDescriptor, type AgentKind } from '@antumi/protocol'
import { t } from '../i18n'
import { useCore } from '../core-store'
import { sendWayKeys } from '../chat-send-ways'
import { IS_MAC } from '../shortcut-keys'
import { SparkIcon } from './icons'

const keys = (way: 'steer' | 'newConversation') => sendWayKeys(way).join(IS_MAC ? '' : '+')

// One thing a new conversation can do that is easy to miss, picked once per page from those that
// work right now: a tip for a switch that is off would only send the user looking for it.
export function ConversationTip({ agent, agents, images }: { agent: AgentKind | null; agents: number; images: boolean }) {
  const features = useCore((s) => s.rpc)?.features ?? []
  const readHistory = useCore((s) => s.chatSettings?.readHistory === true)
  const profiles = useCore((s) => Object.values(s.agentProfiles).some((profile) => profile.archivedAt === null))
  const [seed] = useState(Math.random)
  const tips = ([
    [features.includes('conversation-references') && readHistory, () => t('ConversationTip.referenceConversation')],
    [features.includes('agent-profiles') && profiles, () => t('ConversationTip.delegate')],
    [agents > 1, () => t('ConversationTip.handOff')],
    [images, () => t('ConversationTip.images')],
    [features.includes('chat-options'), () => t('ConversationTip.sendWays', { keys: keys('steer') })],
    [features.includes('conversation-configuration'), () => t('ConversationTip.sendToNewConversation', { keys: keys('newConversation') })],
    [features.includes('schedules') && agent !== null && agentDescriptor(agent).capabilities.unattended, () => t('ConversationTip.schedule')]
  ] as const).filter(([works]) => works).map(([, tip]) => tip)
  const tip = tips[Math.floor(seed * tips.length)]
  if (!tip) return null
  return <p className="chat-draft-tip"><SparkIcon /><span>{tip()}</span></p>
}
