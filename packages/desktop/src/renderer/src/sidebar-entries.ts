import type { SourceDescriptor } from '@antumi/protocol'

// Once a plugin brings an issue source its issues land in the inbox and nowhere else, so the inbox
// stays. Without one there is no inbox entry; source plugins are installed from Settings.
export function inboxLocked(sources: readonly SourceDescriptor[] | null): boolean {
  return (sources?.length ?? 0) > 0
}
