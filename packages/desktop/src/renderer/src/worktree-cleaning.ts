import type { WorktreeCleanResult } from '@antumi/protocol'

// How far a clean has got: the worktree going now, and how each one before it went (failures by
// their reason code).
export type CleanProgress = {
  total: number
  current: string | null
  removed: ReadonlySet<string>
  failed: ReadonlyMap<string, string>
}

// One at a time, so a page can show which one is going and drop each as it goes. Nothing is lost
// to it: git takes a repository's lock for each removal anyway.
export async function cleanOneByOne(
  paths: readonly string[],
  clean: (path: string) => Promise<WorktreeCleanResult[] | null>,
  onProgress?: (progress: CleanProgress) => void
): Promise<CleanProgress> {
  const removed = new Set<string>()
  const failed = new Map<string, string>()
  const progress = (current: string | null): CleanProgress => ({ total: paths.length, current, removed: new Set(removed), failed: new Map(failed) })
  for (const path of paths) {
    onProgress?.(progress(path))
    // No answer at all (core unreachable) is a failure too; perform has already said why.
    const result = (await clean(path))?.[0]
    if (result?.removed) removed.add(path)
    else failed.set(path, result?.reason ?? 'worktree-failed')
  }
  const done = progress(null)
  onProgress?.(done)
  return done
}
