type Node = {
  type: string
  value?: string
  url?: string
  children?: Node[]
  data?: { hProperties?: Record<string, unknown> }
}

const CJK = '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}]'
const CJK_START = new RegExp(`^${CJK}`, 'u')
const CJK_END = new RegExp(`${CJK}$`, 'u')

function inlineParts(node: Node): Node[] {
  return (node.children ?? []).flatMap((child) =>
    ['strong', 'emphasis', 'delete'].includes(child.type) ? inlineParts(child) : [child])
}

// A web link's classes, given the text just before and after it: room is made only against CJK.
export function webLinkClasses(before: string | null, after: string | null): string[] {
  const classes = ['chat-web-link']
  if (before !== null && CJK_END.test(before)) classes.push('chat-link-space-before')
  if (after !== null && CJK_START.test(after)) classes.push('chat-link-space-after')
  return classes
}

function markLine(parts: Node[], standalone: boolean): void {
  const visible = parts.filter((part) => part.type !== 'text' || part.value?.trim())
  for (const [index, part] of parts.entries()) {
    if (part.type !== 'link' || !part.url || !/^https?:\/\//i.test(part.url)) continue
    const previous = parts[index - 1]
    const next = parts[index + 1]
    const classes = webLinkClasses(previous?.type === 'text' ? previous.value ?? '' : null, next?.type === 'text' ? next.value ?? '' : null)
    if (standalone && visible.length === 1) classes.push('chat-link-standalone')
    part.data = { ...part.data, hProperties: { ...part.data?.hProperties, className: classes } }
  }
}

// Mark presentation only: copied text and the Markdown source keep their original spacing.
export function remarkChatLinks() {
  const walk = (node: Node): void => {
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'tableCell') {
      let line: Node[] = []
      for (const part of inlineParts(node)) {
        if (part.type === 'break') { markLine(line, node.type === 'paragraph'); line = [] }
        else line.push(part)
      }
      markLine(line, node.type === 'paragraph')
      return
    }
    for (const child of node.children ?? []) walk(child)
  }
  return walk
}
