import type { HighlightedDiffRow } from '../diff-highlight'

// bare: without the +, - or space a line starts with, where its side already says it.
export function DiffCode({ row, bare = false }: { row: HighlightedDiffRow; bare?: boolean }) {
  const tokens = bare ? row.tokens?.slice(1) : row.tokens
  const text = bare ? row.text.slice(1) : row.text
  return tokens && row.text ? <>{tokens.map((token, index) => token.className ? <span key={index} className={token.className}>{token.text}</span> : token.text)}</> : <>{text || ' '}</>
}
