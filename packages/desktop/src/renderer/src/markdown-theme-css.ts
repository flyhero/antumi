import { generate, ident, parse, walk, type Atrule } from 'css-tree'

export const MAX_THEME_CSS = 32_768

// Reading preferences own these, even in imported CSS or font shorthand declarations.
const readingProperties = new Set([
  'font', 'font-family', 'font-size', 'font-size-adjust', 'font-stretch', 'line-height',
  'width', 'min-width', 'max-width', 'inline-size', 'min-inline-size', 'max-inline-size',
  'transform', 'transform-origin', '-webkit-transform', '-webkit-transform-origin', 'zoom'
])

const properties = new Set([
  'color', 'background', 'background-color', 'background-image', 'background-size', 'background-position',
  'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'line-height', 'letter-spacing',
  'text-align', 'text-indent', 'text-transform', 'text-decoration', 'text-decoration-color', 'text-decoration-thickness',
  'text-underline-offset', 'text-shadow', 'text-wrap', 'white-space', 'word-break', 'overflow-wrap',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-block', 'border-inline',
  'border-color', 'border-style', 'border-width', 'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color',
  'border-top-width', 'border-bottom-width', 'border-left-width', 'border-right-width',
  'border-top-style', 'border-bottom-style', 'border-left-style', 'border-right-style',
  'border-radius', 'border-collapse', 'border-spacing', 'box-shadow', 'box-sizing',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'margin-block', 'margin-inline',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'padding-block', 'padding-inline',
  'list-style', 'list-style-type', 'list-style-position', 'display', 'vertical-align',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'overflow', 'overflow-x', 'overflow-y',
  'content', 'gap', 'align-items', 'justify-content', 'cursor', 'fill', 'opacity',
  'transform', 'transform-origin', '-webkit-transform', '-webkit-transform-origin', '-webkit-overflow-scrolling'
])
const functions = new Set(['var', 'calc', 'min', 'max', 'clamp', 'rgb', 'rgba', 'hsl', 'hsla', 'light-dark', 'color-mix', 'linear-gradient', 'radial-gradient', 'repeating-linear-gradient', 'scale', 'scalex', 'scaley', 'rotate', 'translate', 'translatex', 'translatey', 'skew', 'skewx', 'skewy', 'matrix'])

// Parse before scoping: escaped URLs, nested at-rules and malformed values must not bypass checks.
export function markdownThemeCss(css: string, scope: string): { css: string; error: string | null } {
  try {
    if (css.length > MAX_THEME_CSS || !/^[\w-]+$/.test(scope)) throw new Error('CSS size or scope')
    const ast = parse(css, { parseCustomProperty: true, onParseError: (error) => { throw error } })
    walk(ast, (node, item, list) => {
      if (node.type === 'Raw' || node.type === 'Url') throw new Error('url / invalid CSS')
      if (node.type === 'Atrule') {
        const media = node.prelude ? generate(node.prelude) : ''
        if (ident.decode(node.name).toLowerCase() !== 'media' || !/^\(prefers-color-scheme:(light|dark)\)$/.test(media) || !node.block) throw new Error(`@${node.name}`)
      }
      if (node.type === 'Declaration') {
        const property = ident.decode(node.property).toLowerCase()
        if (property === '--md-color-scheme') throw new Error(property)
        if (!properties.has(property) && !readingProperties.has(property) && !/^--md-[a-z0-9-]+$/.test(property)) throw new Error(property)
        node.important = true
      }
      if (node.type === 'Function' && !functions.has(ident.decode(node.name).toLowerCase())) throw new Error(`${node.name}()`)
      if (node.type === 'PseudoClassSelector' && ['host', 'host-context', 'global'].includes(ident.decode(node.name).toLowerCase())) throw new Error(`:${node.name}`)
      const root = (node.type === 'PseudoClassSelector' && node.name === 'root')
        || (node.type === 'TypeSelector' && ['html', 'body'].includes(node.name))
        || (node.type === 'IdSelector' && ['output', 'write'].includes(node.name))
        || (node.type === 'ClassSelector' && ['container', 'md-container'].includes(node.name))
      if (root && list) list.replace(item, list.createItem({ type: 'PseudoClassSelector', name: 'scope', children: null }))
      if (node.type === 'ClassSelector' && node.name === 'codespan' && list) {
        const selector = parse('code:not(pre code)', { context: 'selector' })
        if (selector.type === 'Selector') list.replace(item, selector.children)
      }
    })
    walk(ast, { visit: 'Declaration', enter: (node, item, list) => {
      if (readingProperties.has(ident.decode(node.property).toLowerCase())) list.remove(item)
    } })
    // Imported media queries follow Antumi's chosen mode, including a settings draft preview.
    walk(ast, { visit: 'Atrule', leave: (node: Atrule) => {
      if (!node.prelude) return
      const mode = /:(light|dark)\)/.exec(generate(node.prelude))?.[1]
      if (!mode) return
      node.name = 'container'
      node.prelude = { type: 'Raw', value: `style(--md-color-scheme:${mode})` }
    } })
    const output = generate(ast)
    if (output.includes('<')) throw new Error('HTML in CSS')
    // @scope constrains the matched element, including selectors that try to reach a sibling.
    return { css: `@scope ([data-md-scope="${scope}"]) { ${output} }`, error: null }
  } catch (error) {
    return { css: '', error: error instanceof Error ? error.message : 'CSS' }
  }
}
