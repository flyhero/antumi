import { getLocale } from './i18n'
import { useMemo } from 'react'
import { AGENT_KINDS, type AgentKind, type Environment } from '@antumi/protocol'
import { useCore } from './core-store'
import { usePreferences } from './preferences'

// The agents core found on its path, in Antumi's own order. Before core says, or on a core that
// does not look, every agent Antumi knows, as before. None found also offers every one: the user
// then sees what there is to install, not an empty list, and the environment notice says what is
// wrong.
export function detectedAgents(environment: Environment | null): readonly AgentKind[] {
  if (!environment) return AGENT_KINDS
  const found = AGENT_KINDS.filter((kind) => environment.checks.some((check) => check.tool === kind && check.status !== 'missing'))
  return found.length > 0 ? found : AGENT_KINDS
}

// The agents Antumi offers here: those found, less the ones the user turned off. Turning off every
// one is not allowed, but should it happen the found ones stand, so there is always a choice.
export function installedAgents(environment: Environment | null, disabled: readonly AgentKind[] = []): readonly AgentKind[] {
  const detected = detectedAgents(environment)
  const enabled = detected.filter((kind) => !disabled.includes(kind))
  return enabled.length > 0 ? enabled : detected
}

// The same, read outside a component.
export function currentInstalledAgents(): readonly AgentKind[] {
  return installedAgents(useCore.getState().environment, usePreferences.getState().disabledAgents)
}

// The agent a conversation could hand off to, or be told has room: another one that is here.
export function otherInstalledAgent(agent: AgentKind, installed: readonly AgentKind[]): AgentKind | null {
  return installed.find((kind) => kind !== agent) ?? null
}

// Core delegates to no agent turned off here, so it keeps the list too (ChatSettings.disabledAgents):
// sent on connecting and on each change, where it differs. A send that fails is not retried until
// the list or the connection changes.
export function startDisabledAgentsMirror(): void {
  let sent: { rpc: unknown; key: string } | null = null
  const mirror = () => {
    const { rpc, chatSettings } = useCore.getState()
    const wanted = [...usePreferences.getState().disabledAgents].sort()
    const key = wanted.join(',')
    if (!rpc || !chatSettings?.disabledAgents || key === [...chatSettings.disabledAgents].sort().join(',') || (sent?.rpc === rpc && sent.key === key)) return
    sent = { rpc, key }
    rpc.call('system.setChatSettings', { disabledAgents: wanted }).then((settings) => useCore.setState({ chatSettings: settings }), () => {})
  }
  useCore.subscribe(mirror)
  usePreferences.subscribe(mirror)
}

export function useInstalledAgents(): readonly AgentKind[] {
  const environment = useCore((s) => s.environment)
  const disabled = usePreferences((s) => s.disabledAgents)
  return useMemo(() => installedAgents(environment, disabled), [environment, disabled, getLocale()])
}
