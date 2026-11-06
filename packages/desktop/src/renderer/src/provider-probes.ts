import { create } from 'zustand'
import type { ModelProviderProbe } from '@antumi/protocol'
import { perform, useCore } from './core-store'

type Probe = { revision: number; result: ModelProviderProbe | 'running' }
export const useProviderProbes = create<{ probes: Record<string, Probe> }>()(() => ({ probes: {} }))

// An edit a test would not tell apart (a name, the agents, a model's limits) keeps the last result.
export function keepProbe(id: string, from: number, to: number): void {
  useProviderProbes.setState(({ probes }) => {
    const probe = probes[id]
    return probe?.revision === from && probe.result !== 'running' ? { probes: { ...probes, [id]: { ...probe, revision: to } } } : { probes }
  })
}

// Results survive navigation, but never describe a later edit of the provider.
export async function probeProvider(id: string): Promise<void> {
  const provider = useCore.getState().modelProviders.find((entry) => entry.id === id)
  if (!provider) return
  const { revision } = provider
  const current = useProviderProbes.getState().probes[id]
  if (current?.revision === revision && current.result === 'running') return
  useProviderProbes.setState(({ probes }) => ({ probes: { ...probes, [id]: { revision, result: 'running' } } }))
  const result = await perform((rpc) => rpc.call('modelProviders.probe', { id }))
  useProviderProbes.setState(({ probes }) => {
    if (probes[id]?.revision !== revision) return { probes }
    const { [id]: _previous, ...rest } = probes
    return { probes: result ? { ...rest, [id]: { revision, result } } : rest }
  })
}
