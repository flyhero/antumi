import { Fragment } from 'react'
import { useDiffHighlight } from '../diff-highlight'
import { splitRows } from '../split-diff'
import { DiffCode } from './DiffCode'

// A unified diff, one line per row, coloured by what each line does; split, side by side, the old
// file's numbers on the left and the new file's on the right.
export function DiffLines({ patch, path, split = false }: { patch: string; path: string; split?: boolean }) {
  const rows = useDiffHighlight(patch, path)
  if (split) {
    return (
      <div className="diff-view diff-view-split">
        {splitRows(rows).map((line, at) => line.kind === 'full'
          ? <div key={at} className={`diff-split-full ${line.cell.row.kind}`}><DiffCode row={line.cell.row} /></div>
          : (
            <div key={at} className="diff-split-pair">
              {[line.left, line.right].map((cell, side) => (
                <Fragment key={side}>
                  {cell
                    ? <div className={`diff-split-cell ${cell.row.kind}`}>
                      <span className="diff-gutter"><span className="diff-line-label">{side === 0 ? cell.row.oldLine : cell.row.newLine}</span></span>
                      <span className="diff-split-code"><DiffCode row={cell.row} bare /></span>
                    </div>
                    : <div className="diff-split-cell diff-split-empty" />}
                </Fragment>
              ))}
            </div>
          ))}
      </div>
    )
  }
  return (
    <pre className="diff-view">
      {rows.map((row, index) => (
        <div key={index} className={row.kind}><DiffCode row={row} /></div>
      ))}
    </pre>
  )
}
