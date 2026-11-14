import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ArrowUp, Folder, GitBranch } from 'lucide-react-native'
import { AgentPicker, ProjectsSheet, StartOptionsGroup, modelText, useStartChoices, useStartOptions } from '../components/pickers'
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
  const { projects, project, agents, agent, setAgent } = useStartChoices()
  // The primary first; until the user picks, the project the choices start on.
  const [chosen, setChosen] = useState<string[] | null>(null)
  const picked = chosen ?? (project ? [project] : [])
  const primary = picked[0] ?? null
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
  const unasked = picked.find((path) => !(path in git))
  useEffect(() => {
    if (!unasked) return
    let live = true
    void isGitProject(unasked).then((answer) => {
      // Not knowing counts as git, and is not asked again.
      if (live) setGit((current) => ({ ...current, [unasked]: answer ?? true }))
    })
    return () => { live = false }
  }, [unasked])
  // Core lays out a worktree of every project, so each must be a git repo.
  const worktreeOffered = picked.length > 0 && picked.every((path) => git[path] !== false)
  const ready = primary !== null && agent !== null && options !== null && text.trim() !== '' && !busy
  const start = async () => {
    if (!ready || !agent || !options) return
    confirmTap()
    setBusy(true)
    const id = await startConversation({
      agent, projectPaths: picked, worktree: worktree && worktreeOffered, text: text.trim(), images: [],
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
          <Chip icon={Folder} label={primary ? `${folderName(primary)}${picked.length > 1 ? ` +${picked.length - 1}` : ''}` : '…'} chevron onPress={() => setPicking(true)} />
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
      {worktree && worktreeOffered ? <Muted>{t(picked.length > 1 ? 'worktreesHint' : 'worktreeHint')}</Muted> : null}
      {worktree && !worktreeOffered ? <Muted>{t('worktreeNeedsGit')}</Muted> : null}
      <AgentPicker title={t('agent')} agents={agents} agent={agent} onPick={setAgent} />
      {exhausted ? <QuotaWarning text={exhausted} /> : null}
      {agent && options ? <StartOptionsGroup agent={agent} options={options} /> : null}
      {picking && projects ? <ProjectsSheet projects={projects} picked={picked} onChange={setChosen} onClose={() => setPicking(false)} /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  composer: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.sm, gap: space.sm },
  input: { minHeight: 96, maxHeight: 220, textAlignVertical: 'top', paddingHorizontal: space.xs, paddingVertical: 0 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  send: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' }
})
