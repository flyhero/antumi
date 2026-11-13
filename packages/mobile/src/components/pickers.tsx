import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { defaultStartMode, startModes, type AgentKind, type ChatCatalog, type ChatPermissionMode } from '@antumi/protocol'
import { AgentMark } from './agent-mark'
import { ChoiceList, Sheet } from './sheet'
import { Muted, SectionLabel, tap } from './ui'
import { t } from '../i18n'
import { agentName, folderName } from '../labels'
import { agentCatalog, readyAgents, recentProjects } from '../session'
import { radius, space, type, useTheme } from '../theme'

// What a new conversation or task is made with: an agent the computer has ready, in one of its
// recent projects (core takes no other path from a phone). Each starts on the first offered.
export function useStartChoices() {
  const [projects, setProjects] = useState<string[] | null>(null)
  const [agents, setAgents] = useState<AgentKind[] | null>(null)
  const [project, setProject] = useState<string | null>(null)
  const [agent, setAgent] = useState<AgentKind | null>(null)
  useEffect(() => {
    void recentProjects().then((list) => {
      setProjects(list)
      setProject((current) => current ?? list[0] ?? null)
    })
    void readyAgents().then((list) => {
      setAgents(list)
      setAgent((current) => current ?? list[0] ?? null)
    })
  }, [])
  return { projects, project, setProject, agents, agent, setAgent }
}

export function AgentPicker({ title, agents, agent, onPick }: { title: string; agents: readonly AgentKind[] | null; agent: AgentKind | null; onPick: (agent: AgentKind) => void }) {
  const theme = useTheme()
  return (
    <View style={styles.section}>
      <SectionLabel title={title} />
      {agents?.length === 0 ? <Muted>{t('noAgents')}</Muted> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.agentScroll} contentContainerStyle={styles.agents}>
        {agents?.map((kind) => {
          const selected = kind === agent
          return (
            <Pressable key={kind} onPress={() => { tap(); onPick(kind) }} style={[styles.agent, { backgroundColor: selected ? theme.accentSoft : theme.surface, borderColor: selected ? theme.accent : theme.border }]}>
              <AgentMark agent={kind} size={16} color={selected ? theme.accent : theme.text} />
              <Text style={[type.secondary, styles.agentName, { color: selected ? theme.accent : theme.text }]}>{agentName(kind)}</Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

// The recent projects in a sheet rather than on the page, so a long list does not push the rest down.
export function ProjectSheet({ projects, project, onPick, onClose }: { projects: readonly string[]; project: string | null; onPick: (project: string) => void; onClose: () => void }) {
  return (
    <Sheet title={t('project')} onClose={onClose}>
      <ChoiceList choices={projects.map((path) => ({ value: path, label: folderName(path), detail: path }))} current={project} onPick={(path) => { onPick(path); onClose() }} />
    </Sheet>
  )
}

type StartPick = { model?: string; effort?: string; mode?: ChatPermissionMode }

// What a new chat starts with, as on the computer: the agent's default model and mode unless one is
// picked, and an effort only once picked (the model's own otherwise). Picks are kept per agent, so
// switching back finds them; a mode or effort the picked model does not take falls back.
export function useStartOptions(agent: AgentKind | null) {
  const [catalogs, setCatalogs] = useState<Partial<Record<AgentKind, ChatCatalog | null>>>({})
  const [picks, setPicks] = useState<Partial<Record<AgentKind, StartPick>>>({})
  useEffect(() => {
    if (!agent || agent in catalogs) return
    let live = true
    void agentCatalog(agent).then((catalog) => {
      if (live) setCatalogs((current) => ({ ...current, [agent]: catalog }))
    })
    return () => { live = false }
  }, [agent, catalogs])
  if (!agent) return null
  const pick = picks[agent] ?? {}
  const models = catalogs[agent]?.models ?? []
  const model = models.find((each) => each.id === pick.model) ?? models.find((each) => each.isDefault) ?? models[0] ?? null
  const modes = startModes(agent, model ?? undefined)
  const efforts = model?.efforts ?? []
  const set = (next: StartPick) => setPicks((current) => ({ ...current, [agent]: { ...current[agent], ...next } }))
  return {
    loading: !(agent in catalogs),
    models,
    model,
    modes,
    mode: pick.mode && modes.includes(pick.mode) ? pick.mode : defaultStartMode(agent, modes),
    efforts,
    effort: pick.effort && efforts.includes(pick.effort) ? pick.effort : null,
    // Sent only when picked: left out, the computer starts the agent's own.
    picked: { model: pick.model && model?.id === pick.model ? pick.model : undefined, effort: pick.effort && efforts.includes(pick.effort) ? pick.effort : undefined },
    pickModel: (id: string) => set({ model: id }),
    pickEffort: (effort: string) => set({ effort }),
    pickMode: (mode: ChatPermissionMode) => set({ mode })
  }
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  // Bleeds to the screen edges so a chip cut off at the right reads as scrollable.
  agentScroll: { marginHorizontal: -space.lg },
  agents: { gap: space.sm, paddingHorizontal: space.lg },
  agent: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  agentName: { fontWeight: '600' }
})
