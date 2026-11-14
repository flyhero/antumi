import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ListTodo, MessageSquare, Plus, Settings } from 'lucide-react-native'
import { conversationAsking, conversationCrashed, conversationWaiting, conversationWorking, isHelper, type Conversation } from '@antumi/protocol'
import { QuotaStrip } from '../components/quota'
import { UpdateBanner } from '../components/update-banner'
import { AgentAvatar, Button, EmptyState, FloatingButton, IconButton, ListGroup, ListRow, SectionLabel, Screen, StatusPill, confirmTap, tap } from '../components/ui'
import { ago, t } from '../i18n'
import { folderName, isCommandRequest, relativePath, where } from '../labels'
import { pop, push } from '../navigation'
import { canOperate, computerOf, refresh, respond, useSession } from '../session'
import { mono, radius, space, type, useTheme } from '../theme'

const RECENT = 50

// A conversation waiting on the user, as a card: what it asks, and for a plain approval the
// answer right here.
function WaitingCard({ conversation }: { conversation: Conversation }) {
  const theme = useTheme()
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null)
  const request = conversation.chat?.request ?? null
  const quick = canOperate() && request?.kind === 'approval' && request.decisions.includes('allow') && request.tool !== null && !/ExitPlanMode|plan/i.test(request.tool)
  const answer = async (decision: 'allow' | 'deny') => {
    if (!request) return
    confirmTap()
    setBusy(decision)
    await respond(conversation.id, request.requestId, decision)
    setBusy(null)
  }
  const project = conversation.projectPaths[0]
  const caller = useSession((s) => conversation.parentConversationId ? s.conversations[conversation.parentConversationId] : undefined)
  const context = caller ? t('delegatedBy', { name: caller.title || where(caller) }) : project ? folderName(project) : where(conversation)
  return (
    <Pressable onPress={() => { tap(); push({ name: 'chat', id: conversation.id }) }} style={({ pressed }) => [styles.waiting, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
      <View style={styles.waitingHead}>
        <AgentAvatar agent={conversation.agent} size={34} status="waiting" />
        <View style={styles.flex}>
          <Text style={[type.rowTitle, { color: theme.text }]} numberOfLines={1}>{conversation.title || t('untitled')}</Text>
          <Text style={[type.caption, { color: theme.textMuted }]} numberOfLines={1}>{context} · {ago(conversation.updatedAt)}</Text>
        </View>
      </View>
      <View style={[styles.ask, { backgroundColor: theme.waitingSoft }]}>
        <Text style={[type.caption, styles.askLabel, { color: theme.waiting }]}>{request?.kind === 'question' ? t('asksYou') : t('needsApproval')}</Text>
        <Text style={[type.secondary, { color: theme.text }, isCommandRequest(request?.tool) && styles.command]} numberOfLines={3}>{request ? relativePath(request.title, conversation.projectPaths) : t('waitingShort')}</Text>
      </View>
      {quick ? (
        <View style={styles.quick}>
          <Button label={t('deny')} busy={busy === 'deny'} onPress={() => void answer('deny')} style={styles.flex} />
          <Button label={t('allow')} kind="primary" busy={busy === 'allow'} onPress={() => void answer('allow')} style={styles.flex} />
        </View>
      ) : null}
    </Pressable>
  )
}

export function ConversationsScreen() {
  const theme = useTheme()
  const conversations = useSession((s) => s.conversations)
  const computer = useSession(computerOf)
  const status = useSession((s) => s.status)
  const access = useSession((s) => s.welcome?.access)
  const online = status === 'online'
  const groups = useMemo(() => {
    // A delegated member is reached from its caller's chat, but listed while it waits on the user.
    const shown = Object.values(conversations).filter((conversation) => !isHelper(conversation) && conversation.archivedAt == null
      && (!conversation.parentConversationId || conversationWaiting(conversation) || conversationAsking(conversation)))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    const waiting = shown.filter((conversation) => conversationWaiting(conversation) || conversationAsking(conversation))
    const running = shown.filter((conversation) => conversationWorking(conversation) && !waiting.includes(conversation))
    const recent = shown.filter((conversation) => !waiting.includes(conversation) && !running.includes(conversation)).slice(0, RECENT)
    return { waiting, running, recent }
  }, [conversations])
  const open = (conversation: Conversation) => push({ name: 'chat', id: conversation.id })
  const pill = online ? <StatusPill label={t('online')} tone="success" /> : status === 'connecting' ? <StatusPill label={t('connecting')} tone="running" /> : <StatusPill label={t('offline')} tone="neutral" />
  return (
    <Screen
      large
      title={computer?.name ?? t('appName')}
      subtitle={<View style={styles.pill}>{pill}<QuotaStrip /></View>}
      onBack={() => pop()}
      onRefresh={online ? refresh : undefined}
      actions={<>
        <IconButton icon={ListTodo} label={t('tasks')} onPress={() => push({ name: 'tasks' })} />
        <IconButton icon={Settings} label={t('settings')} onPress={() => push({ name: 'settings' })} />
      </>}
      floating={online && access === 'operate' ? <FloatingButton icon={Plus} label={t('newConversation')} onPress={() => push({ name: 'new' })} /> : undefined}
    >
      <UpdateBanner />
      {groups.waiting.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel title={t('waiting')} count={groups.waiting.length} />
          {groups.waiting.map((conversation) => <WaitingCard key={conversation.id} conversation={conversation} />)}
        </View>
      ) : null}
      {groups.running.length > 0 ? (
        <ListGroup title={t('running')}>
          {groups.running.map((conversation) => (
            <ListRow key={conversation.id} leading={<AgentAvatar agent={conversation.agent} status="running" />} title={conversation.title || t('untitled')}
              subtitle={conversation.chat?.doing?.title ?? where(conversation)} subtitleTone="running" chevron={false} onPress={() => open(conversation)} />
          ))}
        </ListGroup>
      ) : null}
      {groups.recent.length > 0 ? (
        <ListGroup title={t('recent')}>
          {groups.recent.map((conversation) => (
            <ListRow key={conversation.id} leading={<AgentAvatar agent={conversation.agent} status={conversationCrashed(conversation) ? 'failed' : null} />} title={conversation.title || t('untitled')}
              subtitle={where(conversation)} chevron={false} onPress={() => open(conversation)}
              trailing={<Text style={[type.caption, { color: theme.text3 }]}>{ago(conversation.updatedAt)}</Text>} />
          ))}
        </ListGroup>
      ) : null}
      {Object.keys(conversations).length === 0 && online ? (
        <EmptyState icon={MessageSquare} title={t('noConversations')} body={access === 'operate' ? t('noConversationsHint') : undefined} />
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pill: { paddingTop: space.xs },
  section: { gap: space.sm },
  waiting: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.md },
  waitingHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  ask: { borderRadius: radius.md, padding: space.md, gap: 2 },
  askLabel: { fontWeight: '700' },
  quick: { flexDirection: 'row', gap: space.sm },
  command: { fontFamily: mono, fontSize: 13 }
})
