import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ArrowUp, Brain, Cpu, Folder, GitBranch, ShieldCheck } from 'lucide-react-native'
import type { ChatPermissionMode } from '@antumi/protocol'
import { AgentPicker, ProjectSheet, useStartChoices, useStartOptions } from '../components/pickers'
import { ChoiceList, Sheet } from '../components/sheet'
import { Chip, EmptyState, ListGroup, ListRow, Muted, Screen, confirmTap } from '../components/ui'
import { t } from '../i18n'
import { effortName, folderName, modeName } from '../labels'
import { pop, push } from '../navigation'
import { isGitProject, startConversation } from '../session'
import { radius, space, type, useTheme } from '../theme'

type Picking = 'project' | 'mode' | 'model' | 'effort'

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
  const [picking, setPicking] = useState<Picking | null>(null)
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
  const value = (label: string) => <Text style={[type.secondary, styles.value, { color: theme.textMuted }]} numberOfLines={1}>{label}</Text>
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
          <Chip icon={Folder} label={project ? folderName(project) : '…'} chevron onPress={() => setPicking('project')} />
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
      {agent && options ? (
        <ListGroup title={t('options')}>
          <ListRow leading={<ShieldCheck size={20} color={theme.textMuted} strokeWidth={1.8} />} title={t('permissionMode')} trailing={value(modeName(agent, options.mode))} onPress={() => setPicking('mode')} />
          {options.loading || options.models.length > 0 ? (
            <ListRow leading={<Cpu size={20} color={theme.textMuted} strokeWidth={1.8} />} title={t('model')} trailing={value(options.model?.label ?? '…')}
              {...(options.models.length > 0 ? { onPress: () => setPicking('model') } : {})} />
          ) : null}
          {options.efforts.length > 0 ? (
            <ListRow leading={<Brain size={20} color={theme.textMuted} strokeWidth={1.8} />} title={t('effort')} trailing={value(options.effort ? effortName(options.effort) : t('agentDefault'))} onPress={() => setPicking('effort')} />
          ) : null}
        </ListGroup>
      ) : null}
      {picking === 'project' && projects ? <ProjectSheet projects={projects} project={project} onPick={setProject} onClose={() => setPicking(null)} /> : null}
      {picking && picking !== 'project' && agent && options ? (
        <Sheet title={t(picking === 'mode' ? 'permissionMode' : picking)} onClose={() => setPicking(null)}>
          {picking === 'mode' ? (
            <ChoiceList choices={options.modes.map((mode) => ({ value: mode, label: modeName(agent, mode) }))} current={options.mode}
              onPick={(mode) => { pickMode(options.modes, mode, options.pickMode); setPicking(null) }} />
          ) : picking === 'model' ? (
            <ChoiceList choices={options.models.map((each) => ({ value: each.id, label: each.label, detail: each.description }))} current={options.model?.id ?? null}
              onPick={(id) => { options.pickModel(id); setPicking(null) }} />
          ) : (
            <ChoiceList choices={options.efforts.map((effort) => ({ value: effort, label: effortName(effort) }))} current={options.effort}
              onPick={(effort) => { options.pickEffort(effort); setPicking(null) }} />
          )}
        </Sheet>
      ) : null}
    </Screen>
  )
}

// A choice list hands back the string it showed; the mode is one of those offered.
function pickMode(modes: readonly ChatPermissionMode[], value: string, pick: (mode: ChatPermissionMode) => void): void {
  const mode = modes.find((each) => each === value)
  if (mode) pick(mode)
}

const styles = StyleSheet.create({
  composer: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.sm, gap: space.sm },
  input: { minHeight: 96, maxHeight: 220, textAlignVertical: 'top', paddingHorizontal: space.xs, paddingVertical: 0 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  send: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  value: { maxWidth: 170 }
})
