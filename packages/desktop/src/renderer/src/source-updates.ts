import type { SourceUpdateTarget } from '@antumi/protocol'
import { useCore } from './core-store'

export function useSourceUpdateSummary(target: SourceUpdateTarget | null) {
  return useCore((state) => target && state.rpc?.features.includes('source-comments-v1')
    ? state.sourceUpdates[`${target.kind}:${target.id}`] ?? null
    : null)
}
