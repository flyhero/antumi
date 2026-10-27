export type TextPart = { kind: 'text'; text: string } | { kind: 'link'; href: string }

// A web address in what the user typed runs to a space, an angle bracket or quote, or CJK: Chinese
// is written right after an address with no space between, as are its full-width punctuation marks.
const ADDRESS = /https?:\/\/[^\s<>"'`\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]+/giu
const TRAILING = /[.,:;!?*_~]$/

// Punctuation that ends a sentence is not part of the address before it, nor is a closing bracket
// the address did not open: "(see https://example.com/a_(b))" keeps its last one.
function trimmed(address: string): string {
  let end = address
  for (;;) {
    if (TRAILING.test(end)) end = end.slice(0, -1)
    else if (end.endsWith(')') && count(end, '(') < count(end, ')')) end = end.slice(0, -1)
    else if (end.endsWith(']') && count(end, '[') < count(end, ']')) end = end.slice(0, -1)
    else return end
  }
}

function count(text: string, char: string): number {
  return text.split(char).length - 1
}

// The text with its web addresses picked out, in order; text alone when it has none.
export function textLinks(text: string): TextPart[] {
  const parts: TextPart[] = []
  let at = 0
  for (const match of text.matchAll(ADDRESS)) {
    const href = trimmed(match[0])
    // Nothing after the scheme is no address.
    if (!/^https?:\/\/[^/]/i.test(href)) continue
    if (match.index > at) parts.push({ kind: 'text', text: text.slice(at, match.index) })
    parts.push({ kind: 'link', href })
    at = match.index + href.length
  }
  if (at < text.length) parts.push({ kind: 'text', text: text.slice(at) })
  return parts
}
