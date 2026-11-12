import { useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { Folder, Plus } from 'lucide-react-native'
import { AgentPicker, ProjectPicker, useStartChoices } from '../components/pickers'
import { Button, EmptyState, Screen, confirmTap } from '../components/ui'
import { t } from '../i18n'
import { pop, push } from '../navigation'
import { createTask } from '../session'
import { radius, space, type, useTheme } from '../theme'

// A task to start later, from its page here or on the computer: written down now, run when ready.
export function NewTaskScreen() {
  const theme = useTheme()
  const { projects, project, setProject, agents, agent, setAgent } = useStartChoices()
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    if (!project || !agent || !title.trim()) return
    confirmTap()
    setBusy(true)
    const task = await createTask({ title: title.trim(), details: details.trim(), repo: project, agent })
    setBusy(false)
    if (task) {
      pop()
      push({ name: 'task', id: task.id })
    }
  }
  if (projects?.length === 0) {
    return <Screen title={t('newTask')} onBack={() => pop()}><EmptyState icon={Folder} title={t('noRecentProjects')} /></Screen>
  }
  return (
    <Screen title={t('newTask')} onBack={() => pop()}>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TextInput
          style={[type.rowTitle, styles.title, { color: theme.text }]}
          placeholder={t('taskTitlePlaceholder')}
          placeholderTextColor={theme.text3}
          value={title}
          onChangeText={setTitle}
          maxLength={200}
          autoFocus
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <TextInput
          style={[type.body, styles.details, { color: theme.text }]}
          placeholder={t('taskDetailsPlaceholder')}
          placeholderTextColor={theme.text3}
          value={details}
          onChangeText={setDetails}
          multiline
        />
      </View>
      <AgentPicker title={t('assignee')} agents={agents} agent={agent} onPick={setAgent} />
      <ProjectPicker projects={projects} project={project} onPick={setProject} />
      <Button label={t('createTask')} kind="primary" icon={Plus} wide busy={busy} disabled={!project || !agent || !title.trim()} onPress={() => void create()} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, paddingVertical: space.xs },
  title: { paddingHorizontal: space.xs, paddingVertical: space.md },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: space.xs },
  details: { minHeight: 96, textAlignVertical: 'top', paddingHorizontal: space.xs, paddingVertical: space.md }
})
