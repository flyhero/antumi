import { describe, expect, it } from 'vitest'
import { splitRows } from './split-diff'
import { diffRows } from './unified-diff'

const patch = [
  'diff --git a/x.ts b/x.ts',
  '--- a/x.ts',
  '+++ b/x.ts',
  '@@ -1,6 +1,6 @@',
  ' keep',
  '-old one',
  '-old two',
  '+new one',
  ' middle',
  '+added alone',
  ' tail',
  '-gone alone',
  '\\ No newline at end of file'
].join('\n')

describe('splitRows', () => {
  it('faces removed lines with the added ones after them, line by line, and context with itself', () => {
    const rows = diffRows(patch)
    const text = splitRows(rows).map((row) => row.kind === 'full' ? `| ${row.cell.row.text}` : `${row.left?.row.text ?? '·'} | ${row.right?.row.text ?? '·'}`)
    expect(text).toEqual([
      '| diff --git a/x.ts b/x.ts',
      '| --- a/x.ts',
      '| +++ b/x.ts',
      '| @@ -1,6 +1,6 @@',
      ' keep |  keep',
      '-old one | +new one',
      '-old two | ·',
      ' middle |  middle',
      '· | +added alone',
      ' tail |  tail',
      '-gone alone | ·',
      '| \\ No newline at end of file'
    ])
  })

  it('keeps each cell at its row\'s place in the diff, so a pick means the same row in both layouts', () => {
    const rows = diffRows(patch)
    for (const row of splitRows(rows)) {
      for (const cell of row.kind === 'full' ? [row.cell] : [row.left, row.right]) {
        if (cell) expect(rows[cell.index]).toBe(cell.row)
      }
    }
  })

  it('starts a new run when lines are removed after some were added', () => {
    const rows = diffRows(['@@ -1,2 +1,2 @@', '+a', '-b', '+c', '-d'].join('\n'))
    const pairs = splitRows(rows).filter((row) => row.kind === 'pair').map((row) => [row.left?.row.text ?? null, row.right?.row.text ?? null])
    expect(pairs).toEqual([[null, '+a'], ['-b', '+c'], ['-d', null]])
  })
})
