import type { ChatPermissionMode } from '@antumi/protocol'

// What was last picked for an agent on the new conversation page.
export type DraftChoice = { mode?: ChatPermissionMode | undefined; model?: string | undefined; effort?: string | undefined }

// The model and effort a fresh page starts with for an agent, from what was picked last: only a
// model its catalog still lists, and its effort only where that model still takes it. Nothing
// until the catalog is in, so a start never runs on a model the agent no longer has.
export function rememberedPick(choice: DraftChoice | undefined, models: readonly { id: string; efforts: readonly string[] }[] | undefined): { model?: string; effort?: string } {
  const model = choice?.model ? models?.find((each) => each.id === choice.model) : undefined
  if (!model) return {}
  return choice?.effort && model.efforts.includes(choice.effort) ? { model: model.id, effort: choice.effort } : { model: model.id }
}
