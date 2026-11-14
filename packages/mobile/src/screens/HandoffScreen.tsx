import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { ArrowUp } from 'lucide-react-native'
import type { AgentKind, Conversation } from '@antumi/protocol'
import { AgentPicker, StartOptionsGroup, modelText, useStartOptions } from '../components/pickers'
import { QuotaWarning, useNow } from '../components/quota'
import { Muted, Screen, confirmTap } from '../components/ui'
import { t } from '../i18n'
import { agentName } from '../labels'
import { pop } from '../navigation'
import { exhaustedText } from '../quota-text'
import { handOff, readyAgents, useSession } from '../session'
import { radius, space, type, useTheme } from '../theme'

// Whether a conversation's agent is the user's to change, as on the computer: saved agents, group
// chat members, helpers and squads keep theirs, and a task's chat goes to another agent with its task.
export function handOffable(conversation: Conversation): boolean {
  return !conversation.taskId && !conversation.profile && !conversation.discussionId && !conversation.helperOf
    && !conversation.squadRunId && !conversation.parentConversationId && !conversation.archivedAt
}

// The chat goes on with another agent, in the same folders, handed what was said and the note.
export function HandoffScreen({ id }: { id: string }) {
  const theme = useTheme()
  const conversation = useSession((s) => s.conversations[id])
  const [agents, setAgents] = useState<AgentKind[] | null>(null)
  const [agent, setAgent] = useState<AgentKind | null>(null)
  const options = useStartOptions(agent, { modelProvider: conversation?.modelProvider, mode: conversation?.chatOptions?.permissionMode })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const usage = useSession((s) => s.usage)
  const now = useNow()
  const from = conversation?.agent
  useEffect(() => {
    if (!from) return
    void readyAgents().then((list) => {
      const others = list.filter((each) => each !== from)
      setAgents(others)
      setAgent((current) => current ?? others[0] ?? null)
    })
  }, [from])
  if (!conversation) return <Screen title={t('handoff')} onBack={() => pop()}><Muted>{t('noConversations')}</Muted></Screen>
  // On a provider the agent's own account is not what it spends, so its limits say nothing.
  const exhausted = agent && !conversation.modelProvider ? exhaustedText(usage?.find((each) => each.agent === agent), modelText(options?.model), now) : null
  const ready = agent !== null && options !== null && !options.loading && !busy
  const go = async (stopRunning: boolean) => {
    if (!agent || !options) return
    confirmTap()
    setBusy(true)
    const done = await handOff(id, { agent, note: note.trim(), stopRunning, permissionMode: options.mode, ...options.picked })
    setBusy(false)
    if (done) pop()
  }
  const submit = () => {
    if (!ready || !agent) return
    // A turn under way, or work left in the background, ends with the agent doing it.
    const running = conversation.sessionId !== null && conversation.chat?.turn !== 'idle'
    if (!running) return void go(false)
    Alert.alert(t('handoff'), t('stopAndHandOffConfirm', { from: agentName(conversation.agent), to: agentName(agent) }), [
      { text: t('back'), style: 'cancel' },
      { text: t('stopAndHandOff'), style: 'destructive', onPress: () => void go(true) }
    ])
  }
  return (
    <Screen title={t('handoff')} subtitle={conversation.title || undefined} onBack={() => pop()}>
      <View style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TextInput
          style={[type.body, styles.input, { color: theme.text }]}
          placeholder={t('handoffNotePlaceholder')}
          placeholderTextColor={theme.text3}
          value={note}
          onChangeText={setNote}
          multiline
        />
        <View style={styles.bar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('handoff')}
            disabled={!ready}
            onPress={submit}
            style={[styles.send, { backgroundColor: ready ? theme.accent : theme.raised }]}
          >
            {busy ? <ActivityIndicator color={theme.accentText} /> : <ArrowUp size={20} color={ready ? theme.accentText : theme.text3} strokeWidth={2.4} />}
          </Pressable>
        </View>
      </View>
      <Muted>{t('handoffHint', { agent: agentName(conversation.agent) })}</Muted>
      <AgentPicker title={t('handOffTo')} agents={agents} agent={agent} onPick={setAgent} empty={t('noOtherAgents')} />
      {exhausted ? <QuotaWarning text={exhausted} /> : null}
      {agent && options ? <StartOptionsGroup agent={agent} options={options} /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  composer: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.sm, gap: space.sm },
  input: { minHeight: 72, maxHeight: 220, textAlignVertical: 'top', paddingHorizontal: space.xs, paddingVertical: 0 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  send: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' }
})
