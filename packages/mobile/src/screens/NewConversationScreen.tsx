import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ArrowUp, Folder, GitBranch } from 'lucide-react-native'
import { AgentPicker, ProjectSheet, StartOptionsGroup, modelText, useStartChoices, useStartOptions } from '../components/pickers'
import { QuotaWarning, useNow } from '../components/quota'
import { Chip, EmptyState, Muted, Screen, confirmTap } from '../components/ui'
import { t } from '../i18n'
import { folderName } from '../labels'
import { pop, push } from '../navigation'
import { exhaustedText } from '../quota-text'
import { isGitProject, startConversation, useSession } from '../session'
import { radius, space, type, useTheme } from '../theme'

// The message box leads, with where it runs and the send button inside it, as in a chat; the agent
// and how it starts follow below.
export function NewConversationScreen() {
  const theme = useTheme()
  const { projects, project, setProject, agents, agent, setAgent } = useStartChoices()
  const options = useStartOptions(agent)
  const [worktree, setWorktree] = useState(false)
  // What the computer said of each project; one it has not answered for yet counts as git, so the
  // choice does not flicker away while it is asked.
  const [git, setGit] = useState<Record<string, boolean>>({})
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const usage = useSession((s) => s.usage)
  const now = useNow()
  const exhausted = agent ? exhaustedText(usage?.find((each) => each.agent === agent), modelText(options?.model), now) : null
  useEffect(() => {
    if (!project || project in git) return
    let live = true
    void isGitProject(project).then((answer) => {
      if (live && answer !== null) setGit((current) => ({ ...current, [project]: answer }))
    })
    return () => { live = false }
  }, [project, git])
  const worktreeOffered = project !== null && git[project] !== false
  const ready = project !== null && agent !== null && options !== null && text.trim() !== '' && !busy
  const start = async () => {
    if (!ready || !project || !agent || !options) return
    confirmTap()
    setBusy(true)
    const id = await startConversation({
      agent, projectPath: project, worktree: worktree && worktreeOffered, text: text.trim(), images: [],
      permissionMode: options.mode, ...options.picked
    })
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
      <View style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TextInput
          style={[type.body, styles.input, { color: theme.text }]}
          placeholder={t('firstMessagePlaceholder')}
          placeholderTextColor={theme.text3}
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
        />
        <View style={styles.bar}>
          <Chip icon={Folder} label={project ? folderName(project) : '…'} chevron onPress={() => setPicking(true)} />
          {worktreeOffered ? <Chip icon={GitBranch} label={t('newWorktree')} active={worktree} shrink={false} onPress={() => setWorktree(!worktree)} /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('send')}
            disabled={!ready}
            onPress={() => void start()}
            style={[styles.send, { backgroundColor: ready ? theme.accent : theme.raised }]}
          >
            {busy ? <ActivityIndicator color={theme.accentText} /> : <ArrowUp size={20} color={ready ? theme.accentText : theme.text3} strokeWidth={2.4} />}
          </Pressable>
        </View>
      </View>
      {worktree && worktreeOffered ? <Muted>{t('worktreeHint')}</Muted> : null}
      <AgentPicker title={t('agent')} agents={agents} agent={agent} onPick={setAgent} />
      {exhausted ? <QuotaWarning text={exhausted} /> : null}
      {agent && options ? <StartOptionsGroup agent={agent} options={options} /> : null}
      {picking && projects ? <ProjectSheet projects={projects} project={project} onPick={setProject} onClose={() => setPicking(false)} /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  composer: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.sm, gap: space.sm },
  input: { minHeight: 96, maxHeight: 220, textAlignVertical: 'top', paddingHorizontal: space.xs, paddingVertical: 0 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  send: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' }
})
