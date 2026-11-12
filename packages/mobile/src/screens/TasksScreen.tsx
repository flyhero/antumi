import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { CircleCheck, CircleDashed, CircleDot, CircleSlash, Eye, ListTodo, Plus } from 'lucide-react-native'
import { TASK_STATUSES, type TaskStatus } from '@antumi/protocol'
import { Button, EmptyState, IconButton, ListGroup, ListRow, Screen } from '../components/ui'
import { ago, strings, t } from '../i18n'
import { pop, push } from '../navigation'
import { taskWhere } from '../labels'
import { useSession } from '../session'
import { radius, type, useTheme, type Theme } from '../theme'

const ICON = { pending: CircleDashed, running: CircleDot, review: Eye, done: CircleCheck, abandoned: CircleSlash } satisfies Record<TaskStatus, unknown>

function StatusIcon({ status }: { status: TaskStatus }) {
  const theme = useTheme()
  const Icon = ICON[status]
  const [color, background] = toneOf(status, theme)
  return <View style={[styles.icon, { backgroundColor: background }]}><Icon size={18} color={color} strokeWidth={1.9} /></View>
}

function toneOf(status: TaskStatus, theme: Theme): [string, string] {
  if (status === 'running') return [theme.running, theme.runningSoft]
  if (status === 'review') return [theme.waiting, theme.waitingSoft]
  if (status === 'done') return [theme.success, theme.raised]
  return [theme.textMuted, theme.raised]
}

// The task board; each task opens its page, where a phone that operates starts or closes it.
export function TasksScreen() {
  const theme = useTheme()
  const tasks = useSession((s) => s.tasks)
  const operates = useSession((s) => s.status === 'online' && s.welcome?.access === 'operate')
  const byStatus = useMemo(() => TASK_STATUSES.map((status) => ({
    status,
    tasks: Object.values(tasks).filter((task) => task.status === status).sort((a, b) => b.updatedAt - a.updatedAt)
  })).filter((group) => group.tasks.length > 0), [tasks])
  return (
    <Screen large title={t('tasks')} onBack={() => pop()}
      actions={operates ? <IconButton icon={Plus} label={t('newTask')} tone="accent" onPress={() => push({ name: 'newTask' })} /> : null}>
      {byStatus.length === 0 ? (
        <EmptyState icon={ListTodo} title={t('noTasks')}
          action={operates ? <Button label={t('newTask')} kind="primary" icon={Plus} onPress={() => push({ name: 'newTask' })} /> : undefined} />
      ) : null}
      {byStatus.map((group) => (
        <ListGroup key={group.status} title={`${strings.status[group.status]} · ${group.tasks.length}`}>
          {group.tasks.map((task) => (
            <ListRow
              key={task.id}
              leading={<StatusIcon status={task.status} />}
              title={task.title}
              subtitle={taskWhere(task) || null}
              trailing={<Text style={[type.caption, { color: theme.text3 }]}>{ago(task.updatedAt)}</Text>}
              onPress={() => push({ name: 'task', id: task.id })}
            />
          ))}
        </ListGroup>
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  icon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' }
})
