import { useMemo, type ReactNode } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { marked, type Token, type Tokens } from 'marked'
import { mono, radius, space, useTheme, type Theme } from '../theme'

// An agent's reply as the phone shows it: marked's tokens drawn as native text. Covers what
// replies use (paragraphs, headings, lists, quotes, code, tables, emphasis, links); anything else
// falls back to its raw text.

const BODY = 16
const LINE = 25

function inline(tokens: readonly Token[] | undefined, theme: Theme, keyPrefix: string): ReactNode[] {
  return (tokens ?? []).map((token, index) => {
    const key = `${keyPrefix}.${index}`
    switch (token.type) {
      case 'strong':
        return <Text key={key} style={styles.strong}>{inline((token as Tokens.Strong).tokens, theme, key)}</Text>
      case 'em':
        return <Text key={key} style={styles.em}>{inline((token as Tokens.Em).tokens, theme, key)}</Text>
      case 'del':
        return <Text key={key} style={styles.del}>{inline((token as Tokens.Del).tokens, theme, key)}</Text>
      case 'codespan':
        return <Text key={key} style={[styles.codespan, { backgroundColor: theme.codeBg, color: theme.text }]}>{`\u2009${decode((token as Tokens.Codespan).text)}\u2009`}</Text>
      case 'link': {
        const link = token as Tokens.Link
        return <Text key={key} style={{ color: theme.accent }} onPress={() => void Linking.openURL(link.href).catch(() => {})}>{inline(link.tokens, theme, key)}</Text>
      }
      case 'br':
        return '\n'
      case 'text': {
        const text = token as Tokens.Text
        return text.tokens ? <Text key={key}>{inline(text.tokens, theme, key)}</Text> : decode(text.text)
      }
      case 'escape':
        return (token as Tokens.Escape).text
      case 'image':
        return `[${(token as Tokens.Image).text}]`
      default:
        return 'raw' in token ? token.raw : ''
    }
  })
}

// marked leaves HTML entities in text; the common ones read better decoded.
function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (match, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': '\'' })[name] ?? match)
}

function block(token: Token, theme: Theme, key: string): ReactNode {
  switch (token.type) {
    case 'space':
      return null
    case 'heading': {
      const heading = token as Tokens.Heading
      const size = heading.depth <= 1 ? 22 : heading.depth === 2 ? 19 : 17
      return <Text key={key} style={[styles.heading, { color: theme.text, fontSize: size, lineHeight: size * 1.35 }]}>{inline(heading.tokens, theme, key)}</Text>
    }
    case 'paragraph':
      return <Text key={key} selectable style={[styles.body, { color: theme.text }]}>{inline((token as Tokens.Paragraph).tokens, theme, key)}</Text>
    case 'text': {
      const text = token as Tokens.Text
      return <Text key={key} selectable style={[styles.body, { color: theme.text }]}>{text.tokens ? inline(text.tokens, theme, key) : decode(text.text)}</Text>
    }
    case 'code': {
      const code = token as Tokens.Code
      return (
        <View key={key} style={[styles.codeBlock, { backgroundColor: theme.codeBg }]}>
          {code.lang ? <Text style={[styles.codeLang, { color: theme.text3 }]}>{code.lang}</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text selectable style={[styles.code, { color: theme.text }]}>{code.text}</Text>
          </ScrollView>
        </View>
      )
    }
    case 'blockquote':
      return (
        <View key={key} style={[styles.quote, { borderLeftColor: theme.borderStrong }]}>
          {(token as Tokens.Blockquote).tokens.map((child, index) => block(child, { ...theme, text: theme.textMuted }, `${key}.${index}`))}
        </View>
      )
    case 'list': {
      const list = token as Tokens.List
      const start = typeof list.start === 'number' ? list.start : 1
      return (
        <View key={key} style={styles.list}>
          {list.items.map((item, index) => (
            <View key={`${key}.${index}`} style={styles.listItem}>
              <Text style={[styles.body, styles.marker, { color: theme.text3 }]}>{item.task ? (item.checked ? '☑' : '☐') : list.ordered ? `${start + index}.` : '•'}</Text>
              <View style={styles.listBody}>{item.tokens.map((child, childIndex) => block(child, theme, `${key}.${index}.${childIndex}`))}</View>
            </View>
          ))}
        </View>
      )
    }
    case 'hr':
      return <View key={key} style={[styles.hr, { backgroundColor: theme.border }]} />
    case 'table': {
      const table = token as Tokens.Table
      return (
        <ScrollView key={key} horizontal showsHorizontalScrollIndicator={false}>
          <View style={[styles.table, { borderColor: theme.border }]}>
            {[table.header, ...table.rows].map((row, rowIndex) => (
              <View key={rowIndex} style={[styles.tableRow, rowIndex === 0 && { backgroundColor: theme.codeBg }, rowIndex > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                {row.map((cell, cellIndex) => (
                  <Text key={cellIndex} style={[styles.cell, { color: theme.text }, rowIndex === 0 && styles.strong]}>{inline(cell.tokens, theme, `${key}.${rowIndex}.${cellIndex}`)}</Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )
    }
    default:
      return 'raw' in token && token.raw.trim() ? <Text key={key} style={[styles.body, { color: theme.text }]}>{token.raw}</Text> : null
  }
}

export function Markdown({ text, color }: { text: string; color?: string }) {
  const theme = useTheme()
  const shown = color ? { ...theme, text: color } : theme
  const tokens = useMemo(() => {
    try {
      return marked.lexer(text, { gfm: true, breaks: true })
    } catch {
      return null
    }
  }, [text])
  if (!tokens) return <Text selectable style={[styles.body, { color: shown.text }]}>{text}</Text>
  return <View style={styles.root}>{tokens.map((token, index) => block(token, shown, String(index)))}</View>
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  body: { fontSize: BODY, lineHeight: LINE },
  strong: { fontWeight: '700' },
  em: { fontStyle: 'italic' },
  del: { textDecorationLine: 'line-through' },
  codespan: { fontFamily: mono, fontSize: 14.5 },
  heading: { fontWeight: '700', marginTop: space.xs },
  codeBlock: { borderRadius: radius.md, padding: space.md, gap: space.xs },
  codeLang: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  code: { fontFamily: mono, fontSize: 13, lineHeight: 20 },
  quote: { borderLeftWidth: 3, paddingLeft: space.md, gap: space.sm },
  list: { gap: space.xs },
  listItem: { flexDirection: 'row', gap: space.sm },
  marker: { minWidth: 18 },
  listBody: { flex: 1, gap: space.xs },
  hr: { height: StyleSheet.hairlineWidth, marginVertical: space.xs },
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, overflow: 'hidden' },
  tableRow: { flexDirection: 'row' },
  cell: { minWidth: 96, maxWidth: 220, paddingHorizontal: space.sm, paddingVertical: 6, fontSize: 14, lineHeight: 20 }
})
