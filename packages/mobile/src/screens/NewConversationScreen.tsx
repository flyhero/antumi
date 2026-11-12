import { useEffect, useState } from 'react'
import { StyleSheet, Switch, TextInput, View } from 'react-native'
import { Folder, GitBranch, Sparkles } from 'lucide-react-native'
import { AgentPicker, ProjectPicker, useStartChoices } from '../components/pickers'
import { Button, EmptyState, ListGroup, ListRow, Screen, confirmTap } from '../components/ui'
import { t } from '../i18n'
import { pop, push } from '../navigation'
import { isGitProject, startConversation } from '../session'
import { radius, space, type, useTheme } from '../theme'

export function NewConversationScreen() {
  const theme = useTheme()
  const { projects, project, setProject, agents, agent, setAgent } = useStartChoices()
  const [worktree, setWorktree] = useState(false)
  // What the computer said of each project; one it has not answered for yet counts as git, so the
  // choice does not flicker away while it is asked.
  const [git, setGit] = useState<Record<string, boolean>>({})
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!project || project in git) return
    let live = true
    void isGitProject(project).then((answer) => {
      if (live && answer !== null) setGit((current) => ({ ...current, [project]: answer }))
    })
    return () => { live = false }
  }, [project, git])
  const worktreeOffered = project !== null && git[project] !== false
  const start = async () => {
    if (!project || !agent || !text.trim()) return
    confirmTap()
    setBusy(true)
    const id = await startConversation({ agent, projectPath: project, worktree: worktree && worktreeOffered, text: text.trim(), images: [] })
    setBusy(false)
    if (id) {
      pop()
      push({ name: 'chat', id })
    }
  }
  if (projects?.length === 0) {
    return <Screen title={t('newConversation')} onBack={() => pop()}><EmptyState icon={Folder} title={t('noRecentProjects')} /></Screen>
  }
  return (
    <Screen title={t('newConversation')} onBack={() => pop()}>
      <View style={[styles.message, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TextInput
          style={[type.body, styles.input, { color: theme.text }]}
          placeholder={t('firstMessagePlaceholder')}
          placeholderTextColor={theme.text3}
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
        />
      </View>
      <AgentPicker title={t('agent')} agents={agents} agent={agent} onPick={setAgent} />
      <ProjectPicker projects={projects} project={project} onPick={setProject} />
      {worktreeOffered ? (
        <ListGroup>
          <ListRow leading={<GitBranch size={20} color={theme.textMuted} strokeWidth={1.8} />} title={t('worktree')} subtitle={t('worktreeHint')} chevron={false}
            trailing={<Switch value={worktree} onValueChange={setWorktree} trackColor={{ true: theme.accent, false: theme.sunken }} thumbColor="#FFFFFF" />} />
        </ListGroup>
      ) : null}
      <Button label={t('start')} kind="primary" icon={Sparkles} wide busy={busy} disabled={!project || !agent || !text.trim()} onPress={() => void start()} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  message: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md },
  input: { minHeight: 110, textAlignVertical: 'top', paddingHorizontal: space.xs, paddingVertical: space.xs }
})
