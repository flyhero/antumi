import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Check, Folder } from 'lucide-react-native'
import type { AgentKind } from '@antumi/protocol'
import { AgentMark } from './agent-mark'
import { ListGroup, ListRow, Muted, SectionLabel, tap } from './ui'
import { t } from '../i18n'
import { agentName, folderName } from '../labels'
import { readyAgents, recentProjects } from '../session'
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

export function ProjectPicker({ projects, project, onPick }: { projects: readonly string[] | null; project: string | null; onPick: (project: string) => void }) {
  const theme = useTheme()
  return (
    <ListGroup title={t('project')}>
      {(projects ?? []).map((path) => (
        <ListRow key={path} leading={<Folder size={20} color={path === project ? theme.accent : theme.textMuted} strokeWidth={1.8} />} title={folderName(path)} subtitle={path}
          chevron={false} trailing={path === project ? <Check size={18} color={theme.accent} /> : null} onPress={() => onPick(path)} />
      ))}
    </ListGroup>
  )
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  // Bleeds to the screen edges so a chip cut off at the right reads as scrollable.
  agentScroll: { marginHorizontal: -space.lg },
  agents: { gap: space.sm, paddingHorizontal: space.lg },
  agent: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  agentName: { fontWeight: '600' }
})
