import type { DiffRow } from './unified-diff'

// One side of a side-by-side row: the diff row it shows and where that row sits in the diff, so
// picking and commenting go by the same index as in the unified view.
export type SplitCell<R extends DiffRow = DiffRow> = { index: number; row: R }

// A line of a side-by-side diff: the old file on the left and the new on the right, a line left
// unchanged on both, or what stands across both (a file header, a hunk's @@ line).
export type SplitRow<R extends DiffRow = DiffRow> =
  | { kind: 'full'; cell: SplitCell<R> }
  | { kind: 'pair'; left: SplitCell<R> | null; right: SplitCell<R> | null }

// The rows side by side, as GitHub lays them: lines removed and then added in one run face each
// other line by line, the longer run against blanks; a run of one kind alone faces blanks.
export function splitRows<R extends DiffRow>(rows: readonly R[]): SplitRow<R>[] {
  const result: SplitRow<R>[] = []
  let removed: SplitCell<R>[] = []
  let added: SplitCell<R>[] = []
  const flush = () => {
    for (let at = 0; at < Math.max(removed.length, added.length); at++) result.push({ kind: 'pair', left: removed[at] ?? null, right: added[at] ?? null })
    removed = []
    added = []
  }
  rows.forEach((row, index) => {
    const cell = { index, row }
    if (row.hunk !== null && row.kind === 'diff-del') {
      // A removal after additions starts a new run.
      if (added.length > 0) flush()
      removed.push(cell)
    } else if (row.hunk !== null && row.kind === 'diff-add') {
      added.push(cell)
    } else {
      flush()
      result.push(row.hunk !== null ? { kind: 'pair', left: cell, right: cell } : { kind: 'full', cell })
    }
  })
  flush()
  return result
}
