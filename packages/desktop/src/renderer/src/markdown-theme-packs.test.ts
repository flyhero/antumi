import { describe, expect, it } from 'vitest'
import { markdownThemeCss } from './markdown-theme-css'
import { MarkdownThemeLibrary, MarkdownThemePack, exportMarkdownTheme, importMarkdownTheme, markdownThemeStyle, resolveMarkdownTheme } from './markdown-theme-packs'

const pack = MarkdownThemePack.parse({
  format: 'antumi-markdown-theme', version: 1, id: '5dde10ce-045e-42d5-b2d7-3510edf38fc1',
  name: 'Reading', base: 'quiet', author: 'Alice', license: 'MIT', source: 'https://example.com/theme',
  primary: { light: '#663399', dark: '#bb99ee' }, css: 'h2 { border-left: 3px solid var(--md-primary-color); }'
})

describe('Markdown theme CSS', () => {
  it('scopes ordinary, comma and root selectors, and preserves dark-mode rules', () => {
    const result = markdownThemeCss(':root { --md-custom: 1em; } h1, h2 { color: var(--md-primary-color); } @media (prefers-color-scheme: dark) { h2 { font-weight: 700; } }', 'test-a')
    expect(result.error).toBeNull()
    expect(result.css).toContain('@scope ([data-md-scope="test-a"])')
    expect(result.css).toContain(':scope{--md-custom:1em!important}')
    expect(result.css).toContain('h1,h2{color:var(--md-primary-color)!important}')
    expect(result.css).toContain('@container style(--md-color-scheme:dark)')
  })

  it.each([
    '@import "https://example.com/a.css";',
    '@\\69mport "https://example.com/a.css";',
    '@font-face { font-family: a; src: url(a.woff); }',
    'h2 { background: url(https://example.com/x); }',
    'h2 { background: u\\72l(https://example.com/x); }',
    ':root { --md-test: url(https://example.com/x); }',
    ':root { --surface: red; }',
    ':root { --md-color-scheme: dark; }',
    'h2 { position: fixed; }',
    'h2 { po\\73ition: fixed; }',
    'h2 { content: attr(data-token); }',
    'h2 { animation: fade 1s infinite; }',
    '@layer x { h2 { color: red; } }',
    'h2 { color: red; @import "https://example.com"; }',
    ':host { color: red; }',
    'h2::before { content: "</style><script>alert(1)</script>"; }',
    'h2 { ??? }'
  ])('rejects unsupported or unsafe CSS: %s', (css) => {
    const result = markdownThemeCss(css, 'test')
    expect(result.error).toBeTruthy()
    expect(result.css).toBe('')
  })

  it('rejects HTML produced by escaped CSS strings', () => {
    expect(markdownThemeCss('h2::before { content: "\\3c /style>"; }', 'test').css).not.toContain('</style>')
  })

  it('normalizes a closing brace omitted at EOF, as the browser does', () => {
    expect(markdownThemeCss('h2 { color: red;', 'test')).toEqual({ css: '@scope ([data-md-scope="test"]) { h2{color:red!important} }', error: null })
  })

  it('adapts common Doocs/Typora roots and inline-code selectors', () => {
    const result = markdownThemeCss('#output h2 { color:var(--md-primary-color); } #write {line-height:1.8} .codespan {color:var(--md-primary-color)}', 'imported')
    expect(result.error).toBeNull()
    expect(result.css).toContain(':scope h2')
    expect(result.css).toContain('code:not(pre code)')
  })

  it('accepts individual border widths and styles used while refining a theme', () => {
    const result = markdownThemeCss('h2 { border-bottom-width: 10px; border-left-style: double; }', 'editing')
    expect(result.error).toBeNull()
    expect(result.css).toContain('border-bottom-width:10px!important')
  })

  it('ignores typography, widths and scaling while preserving theme decorations', () => {
    const result = markdownThemeCss('* { font: italic 40px/3 serif; font-family: serif; font-size: 60px; line-height: 4; width: 4000px; max-inline-size: none; transform: scale(3); } h2 { font-weight: 700; border-bottom: 2px solid red; }', 'reading')
    expect(result.error).toBeNull()
    expect(result.css).not.toMatch(/font:|font-family:|font-size:|line-height:|width:|inline-size:|transform:/)
    expect(result.css).toContain('font-weight:700!important')
    expect(result.css).toContain('border-bottom:2px solid red!important')
  })

  it('also ignores escaped reading properties and declarations nested in dark-mode rules', () => {
    const result = markdownThemeCss('p { f\\6fnt-size: 60px; } @media (prefers-color-scheme: dark) { * { font-family: serif; min-width: 9000px; } h2 { color: red; } }', 'reading')
    expect(result.error).toBeNull()
    expect(result.css).not.toMatch(/60px|serif|9000px/)
    expect(result.css).toContain('color:red!important')
  })

  it('discards comments containing markup before generating the style element', () => {
    const result = markdownThemeCss('/* styles for <p>; </style><script> */ h2 { color: red; }', 'comments')
    expect(result.error).toBeNull()
    expect(result.css).not.toContain('<')
    expect(result.css).toContain('color:red!important')
  })

  it('does not share a scope between an installed theme and its draft preview', () => {
    expect(markdownThemeCss(pack.css, 'file').css).not.toContain('scope="draft"')
    expect(markdownThemeCss(pack.css, 'draft').css).toContain('scope="draft"')
  })
})

describe('Markdown theme files', () => {
  it('round-trips names, attribution, dark accents, typography and CSS without a local id', () => {
    const output = exportMarkdownTheme(pack)
    expect(output).not.toContain(pack.id)
    const imported = importMarkdownTheme(output, 'theme.json')
    expect(imported).toMatchObject({ name: 'Reading', author: 'Alice', license: 'MIT', css: pack.css, primary: pack.primary })
    expect(imported.fontSize).toBeUndefined()
    expect(markdownThemeStyle(pack)).toMatchObject({ '--accent': 'light-dark(#663399, #bb99ee)' })
  })

  it('imports ordinary community CSS with a filename as its initial name', () => {
    expect(importMarkdownTheme('h2 { color: var(--md-primary-color); }', 'Community.css')).toMatchObject({ name: 'Community', base: 'default' })
  })

  it('ignores corrupted library items and duplicate ids while preserving valid themes', () => {
    const library = MarkdownThemeLibrary.parse([pack, { ...pack, id: 'invalid' }, { ...pack, css: '@import "x";' }, pack])
    expect(library).toEqual([pack])
    expect(resolveMarkdownTheme(`user:${pack.id}`, library)).toMatchObject({ base: 'quiet', name: 'Reading' })
    expect(resolveMarkdownTheme('user:missing', library)).toMatchObject({ base: 'default' })
  })

  it('retains legacy typography metadata when sharing without applying it', () => {
    const legacy = MarkdownThemePack.parse({ ...pack, fontSize: 20, lineHeight: 2.4, paragraphSpacing: 1.6 })
    expect(importMarkdownTheme(exportMarkdownTheme(legacy), 'legacy.json')).toMatchObject({ fontSize: 20, lineHeight: 2.4, paragraphSpacing: 1.6 })
    expect(markdownThemeStyle(legacy)).toEqual(markdownThemeStyle(pack))
  })

  it.each([
    () => importMarkdownTheme('{"format":"antumi-markdown-theme","version":2}', 'theme.json'),
    () => importMarkdownTheme('h2 { background:url(x); }', 'theme.css'),
    () => importMarkdownTheme(' '.repeat(65_537), 'theme.css'),
    () => MarkdownThemePack.parse({ ...pack, source: 'javascript:alert(1)' }),
    () => MarkdownThemePack.parse({ ...pack, source: 'not-a-url' }),
    () => MarkdownThemePack.parse({ ...pack, fontSize: 1000 })
  ])('rejects malformed, unsupported or oversized imports', (read) => expect(read).toThrow())
})
