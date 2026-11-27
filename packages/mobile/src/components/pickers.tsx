import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Brain, Cpu, ShieldCheck } from 'lucide-react-native'
import { defaultStartMode, startModes, agentDescriptor, providerEndpoint, type AgentKind, type ChatCatalog, type ChatPermissionMode } from '@antumi/protocol'
import { AgentMark } from './agent-mark'
import { ChoiceList, Sheet } from './sheet'
import { Button, ListGroup, ListRow, Muted, SectionLabel, tap } from './ui'
import { t } from '../i18n'
import { agentName, effortName, folderName, modeName } from '../labels'
import { agentCatalog, readyAgents, recentProjects, useSession, rememberProvider } from '../session'
import { radius, space, type, useTheme } from '../theme'

// What a new conversation or task is made with: an agent the computer has ready, in one of its
// recent projects (core takes no other path from a phone). Each starts on the first offered.
export function useStartChoices() {
  const [projects, setProjects] = useState<string[] | null>(null)
  const [project, setProject] = useState<string | null>(null)
  const choices = useReadyAgents()
  useEffect(() => {
    void recentProjects().then((list) => {
      setProjects(list)
      setProject((current) => current ?? list[0] ?? null)
    })
  }, [])
  return { projects, project, setProject, ...choices }
}

export function useReadyAgents(exclude?: AgentKind) {
  const [agents, setAgents] = useState<AgentKind[] | null>(null)
  const [agent, setAgent] = useState<AgentKind | null>(null)
  const [agentsFailed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setAgents(null)
    setAgent(null)
    setFailed(false)
    void readyAgents().then((list) => {
      if (!live) return
      setFailed(list === null)
      const offered = list?.filter((each) => each !== exclude) ?? null
      setAgents(offered)
      setAgent(offered?.[0] ?? null)
    })
    return () => { live = false }
  }, [exclude, attempt])
  return { agents, agent, setAgent, agentsFailed, retryAgents: () => setAttempt((current) => current + 1) }
}

export function AgentPicker({ title, agents, agent, onPick, failed = false, onRetry, empty = t('noAgents') }: { title: string; agents: readonly AgentKind[] | null; agent: AgentKind | null; onPick: (agent: AgentKind) => void; failed?: boolean; onRetry?: () => void; empty?: string }) {
  const theme = useTheme()
  return (
    <View style={styles.section}>
      <SectionLabel title={title} />
      {failed ? <><Muted>{t('agentsUnavailable')}</Muted>{onRetry ? <Button label={t('retry')} onPress={onRetry} /> : null}</> : agents?.length === 0 ? <Muted>{empty}</Muted> : null}
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

// Recent projects in a sheet, several for one conversation or task: the first picked is the
// primary, where the agent works; picking it away hands that to the next. The last one stays.
export function ProjectsSheet({ projects, picked, onChange, onClose }: { projects: readonly string[]; picked: readonly string[]; onChange: (picked: string[]) => void; onClose: () => void }) {
  const toggle = (path: string) => {
    if (!picked.includes(path)) return onChange([...picked, path])
    if (picked.length > 1) onChange(picked.filter((each) => each !== path))
  }
  return (
    <Sheet title={t('projects')} onClose={onClose}>
      <Muted>{t('projectsHint')}</Muted>
      <ChoiceList
        choices={projects.map((path) => ({ value: path, label: path === picked[0] ? `${folderName(path)} · ${t('primaryProject')}` : folderName(path), detail: path }))}
        current={picked}
        onPick={toggle}
      />
    </Sheet>
  )
}

const EMPTY_PROVIDER_DEFAULTS: Record<string, string | null> = {}

type StartPick = { model?: string; effort?: string; mode?: ChatPermissionMode }

// What a new chat starts with, as on the computer: the agent's default model and mode unless one is
// picked, and an effort only once picked (the model's own otherwise). Picks are kept per agent, so
// switching back finds them; a mode or effort the picked model does not take falls back. A handoff
// passes the chat's provider, and its mode, which an agent offering it takes over in unless picked.
export function useStartOptions(agent: AgentKind | null, from: { modelProvider?: string | null; mode?: string | null } = {}) {
  const defaults = useSession((state) => state.settings.defaultProviders?.[state.current ?? ''] ?? EMPTY_PROVIDER_DEFAULTS)
  const providers = useSession((state) => state.providers)
  const [providerPicks, setProviderPicks] = useState<Partial<Record<AgentKind, string | null>>>({})
  const providerId = agent ? providerPicks[agent] !== undefined ? providerPicks[agent] : from.modelProvider !== undefined ? from.modelProvider : defaults[agent] ?? null : null
  const selected = providers.find((provider) => provider.id === providerId)
  const key = `${agent}|${providerId ?? ''}|${selected?.revision ?? ''}`
  const [catalogs, setCatalogs] = useState<Record<string, ChatCatalog | null>>({})
  const [picks, setPicks] = useState<Record<string, StartPick>>({})
  useEffect(() => {
    if (!agent || key in catalogs) return
    let live = true
    void agentCatalog(agent, providerId).then((catalog) => {
      if (live) setCatalogs((current) => ({ ...current, [key]: catalog }))
    })
    return () => { live = false }
  }, [agent, catalogs, providerId, key])
  if (!agent) return null
  const pick = picks[key] ?? {}
  const models = catalogs[key]?.models ?? []
  const model = models.find((each) => each.id === pick.model) ?? models.find((each) => each.isDefault) ?? models[0] ?? null
  const modes = startModes(agent, model ?? undefined)
  const efforts = model?.efforts ?? []
  const set = (next: StartPick) => setPicks((current) => ({ ...current, [key]: { ...current[key], ...next } }))
  return {
    modelProvider: providerId ?? null,
    pickProvider: (value: string | null) => { setProviderPicks((current) => ({ ...current, [agent]: value })); void rememberProvider(agent, value) },
    loading: !(key in catalogs),
    models,
    model,
    modes,
    mode: modes.find((mode) => mode === pick.mode) ?? modes.find((mode) => mode === from.mode) ?? defaultStartMode(agent, modes),
    efforts,
    effort: pick.effort && efforts.includes(pick.effort) ? pick.effort : null,
    // Sent only when picked: left out, the computer starts the agent's own.
    picked: { modelProvider: providerId ?? null, model: pick.model && model?.id === pick.model ? pick.model : undefined, effort: pick.effort && efforts.includes(pick.effort) ? pick.effort : undefined },
    pickModel: (id: string) => set({ model: id }),
    pickEffort: (effort: string) => set({ effort }),
    pickMode: (mode: ChatPermissionMode) => set({ mode })
  }
}

export function ProviderChoice({ agent, value, onChange, disabled = false }: { agent: AgentKind; value: string | null; onChange(value: string | null): void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const providers = useSession((state) => state.providers)
  const supported = useSession((state) => state.welcome?.features.includes('provider-selection-v2') ?? false)
  if (!supported || !agentDescriptor(agent).capabilities.modelProviders.length) return null
  const choices = providers.filter((provider) => provider.hasKey && providerEndpoint(provider, agent))
  const name = value ? choices.find((provider) => provider.id === value)?.name ?? t('providerUnavailable') : t('ownConfiguration')
  return <>
    <ListGroup><ListRow title={t('provider')} subtitle={name} {...(!disabled ? { onPress: () => setOpen(true) } : {})} /></ListGroup>
    {open && <Sheet title={t('provider')} onClose={() => setOpen(false)}>
      <ChoiceList choices={[{ value: '', label: t('ownConfiguration') }, ...choices.map((provider) => ({ value: provider.id, label: provider.name }))]} current={value ?? ''}
        onPick={(picked) => { onChange(picked || null); setOpen(false) }} />
      <Muted>{t('configureProvidersOnComputer')}</Muted>
    </Sheet>}
  </>
}

type StartOptions = NonNullable<ReturnType<typeof useStartOptions>>

// The mode, model and effort an agent starts in, each row opening its choices in a sheet.
export function StartOptionsGroup({ agent, options }: { agent: AgentKind; options: StartOptions }) {
  const theme = useTheme()
  const [picking, setPicking] = useState<'mode' | 'model' | 'effort' | null>(null)
  const value = (label: string) => <Text style={[type.secondary, styles.value, { color: theme.textMuted }]} numberOfLines={1}>{label}</Text>
  return (
    <>
      <ProviderChoice agent={agent} value={options.modelProvider} onChange={options.pickProvider} />
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
      {picking ? (
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
    </>
  )
}

// What a model-specific window is matched against, as on the desktop: everything the catalog says
// of the model, since the default one names the real model only in its description.
export function modelText(model: { id: string; label: string; description?: string | null } | null | undefined): string | null {
  return model ? [model.id, model.label, model.description].filter(Boolean).join(' ') : null
}

// A choice list hands back the string it showed; the mode is one of those offered.
function pickMode(modes: readonly ChatPermissionMode[], value: string, pick: (mode: ChatPermissionMode) => void): void {
  const mode = modes.find((each) => each === value)
  if (mode) pick(mode)
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  value: { maxWidth: 170 },
  // Bleeds to the screen edges so a chip cut off at the right reads as scrollable.
  agentScroll: { marginHorizontal: -space.lg },
  agents: { gap: space.sm, paddingHorizontal: space.lg },
  agent: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  agentName: { fontWeight: '600' }
})
