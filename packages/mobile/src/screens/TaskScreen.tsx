import { useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { Check, ClipboardList, ListTodo, MessageSquare, Play, Search, X, type LucideIcon } from 'lucide-react-native'
import { checkCancel, checkMove, type ChatPermissionMode, type StartBlocker, type TaskStatus } from '@antumi/protocol'
import { Markdown } from '../components/markdown'
import { Button, Card, EmptyState, Muted, Screen, StatusPill, confirmTap } from '../components/ui'
import { strings, t } from '../i18n'
import { taskWhere } from '../labels'
import { pop, push } from '../navigation'
import { cancelTask, finishTask, startTask, useSession } from '../session'
import { startBlockerOf, startModeOf } from '../task-start'
import { space, type, useTheme } from '../theme'

const TONE: Record<TaskStatus, 'waiting' | 'running' | 'success' | 'neutral'> = { pending: 'neutral', running: 'running', review: 'waiting', done: 'success', abandoned: 'neutral' }

// The words of the computer's start button for the mode it starts in.
function startAction(mode: ChatPermissionMode): { label: string; icon: LucideIcon } {
  if (mode === 'plan') return { label: t('startPlanning'), icon: ClipboardList }
  if (mode === 'readOnly') return { label: t('startAnalysis'), icon: Search }
  return { label: t('executeDirectly'), icon: Play }
}

// Why a pending task does not start here; null when it does, or when that is not news.
function blockerText(blocker: StartBlocker | null): string | null {
  if (blocker === 'missing-repo') return t('needsRepo')
  if (blocker === 'missing-agent') return t('needsAgent')
  if (blocker === 'dependencies-unfinished') return t('needsDependencies')
  if (blocker === 'planning') return t('planningWaits')
  return null
}

export function TaskScreen({ id }: { id: string }) {
  const theme = useTheme()
  const task = useSession((s) => s.tasks[id])
  const tasks = useSession((s) => s.tasks)
  const operates = useSession((s) => s.status === 'online' && s.welcome?.access === 'operate')
  const [busy, setBusy] = useState<'start' | 'done' | 'cancel' | null>(null)
  if (!task) {
    return <Screen title={t('task')} onBack={() => pop()}><EmptyState icon={ListTodo} title={t('taskGone')} /></Screen>
  }
  const blocker = startBlockerOf(task, tasks)
  const start = startAction(startModeOf(task, tasks))
  const closes = checkMove(task, 'done') === null
  const cancels = checkCancel(task) === null
  const act = async (kind: 'start' | 'done' | 'cancel', run: () => Promise<unknown>) => {
    confirmTap()
    setBusy(kind)
    await run()
    setBusy(null)
  }
  const begin = () => act('start', async () => {
    const started = await startTask(task, startModeOf(task, tasks))
    // As on the computer, a start opens the task's chat, where its plan comes for approval.
    if (started?.conversationId) push({ name: 'chat', id: started.conversationId })
  })
  const askCancel = () => {
    Alert.alert(t('cancelTask'), t('cancelTaskConfirm', { title: task.title, stops: task.status === 'running' ? t('agentWillStop') : '' }), [
      { text: t('back'), style: 'cancel' },
      { text: t('cancelTask'), style: 'destructive', onPress: () => void act('cancel', () => cancelTask(task.id)) }
    ])
  }
  return (
    <Screen title={t('task')} onBack={() => pop()}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]}>{task.title}</Text>
        <View style={styles.meta}>
          <StatusPill label={strings.status[task.status]} tone={TONE[task.status]} />
          <Text style={[type.secondary, styles.where, { color: theme.textMuted }]} numberOfLines={1}>{taskWhere(task)}</Text>
        </View>
      </View>
      {task.details.trim() ? <Card style={styles.details}><Markdown text={task.details} /></Card> : null}
      <View style={styles.actions}>
        {operates && blocker === null ? <Button label={start.label} kind="primary" icon={start.icon} wide busy={busy === 'start'} onPress={() => void begin()} /> : null}
        {operates && task.status === 'pending' && blockerText(blocker) ? <Muted>{blockerText(blocker)}</Muted> : null}
        {task.conversationId ? <Button label={t('openConversation')} icon={MessageSquare} wide onPress={() => push({ name: 'chat', id: task.conversationId! })} /> : null}
        {operates && closes ? (
          <Button label={task.status === 'review' ? t('accept') : t('markDone')} kind={task.status === 'review' ? 'primary' : 'secondary'} icon={Check} wide busy={busy === 'done'}
            onPress={() => void act('done', () => finishTask(task.id))} />
        ) : null}
        {operates && cancels ? <Button label={t('cancelTask')} kind="danger" icon={X} wide busy={busy === 'cancel'} onPress={askCancel} /> : null}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  head: { gap: space.md, paddingHorizontal: space.xs },
  title: { fontSize: 22, lineHeight: 29, fontWeight: '700' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  where: { flex: 1 },
  details: { padding: space.lg },
  actions: { gap: space.sm }
})
