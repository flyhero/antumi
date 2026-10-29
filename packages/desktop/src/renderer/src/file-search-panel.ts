import { t, useLocale } from './i18n'
import { isShortcut } from './keyboard-shortcuts'
import { closeSearchPanel, openSearchPanel, findNext, findPrevious, getSearchQuery, replaceAll, replaceNext, SearchQuery, setSearchQuery } from '@codemirror/search'
import type { EditorState } from '@codemirror/state'
import { runScopeHandlers, type EditorView, type Panel, type ViewUpdate } from '@codemirror/view'

// Counting walks every match, so past this many the count stops being worth its cost.
const COUNT_LIMIT = 999

const ICONS = {
  up: '<path d="M10 16V4M5 9l5-5 5 5" />',
  down: '<path d="M10 4v12M5 11l5 5 5-5" />',
  close: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />'
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, attrs: Record<string, string> = {}, children: (Node | string)[] = []) {
  const node = document.createElement(tag)
  node.className = className
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  node.append(...children)
  return node
}

function button(className: string, label: string, onclick: () => void, attrs: Record<string, string> = {}) {
  const node = element('button', className, { type: 'button', ...attrs })
  node.textContent = label
  node.onclick = onclick
  return node
}

function iconButton(name: keyof typeof ICONS, label: string, onclick: () => void) {
  const node = button('tool-button', '', onclick, { 'aria-label': label, 'data-tooltip': label })
  node.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
  return node
}

function pressed(node: HTMLButtonElement) {
  return node.getAttribute('aria-pressed') === 'true'
}

// Where the main selection sits among the matches, and how many there are; null for a broken regexp.
export function matchCount(state: EditorState, query: SearchQuery) {
  if (!query.valid) return null
  const { from, to } = state.selection.main
  const cursor = query.getCursor(state)
  let total = 0
  let current = 0
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    total++
    if (next.value.from === from && next.value.to === to) current = total
    if (total > COUNT_LIMIT) break
  }
  return { current, total }
}

export function runFileSearchShortcut(event: KeyboardEvent, view: EditorView): boolean {
  const command = isShortcut('find-content', event) ? openSearchPanel : isShortcut('find-previous', event) ? findPrevious : isShortcut('find-next', event) ? findNext : null
  if (!command) return false
  event.preventDefault()
  command(view)
  return true
}

// Replaces CodeMirror's stock panel, whose bare buttons and checkboxes ignore the app's look.
export function createFileSearchPanel(view: EditorView): Panel {
  let query = getSearchQuery(view.state)
  const commit = () => {
    const next = new SearchQuery({
      search: search.value, replace: replace.value,
      caseSensitive: pressed(caseToggle), wholeWord: pressed(wordToggle), regexp: pressed(regexpToggle)
    })
    if (next.eq(query)) return
    query = next
    view.dispatch({ effects: setSearchQuery.of(next) })
  }
  const toggle = (text: string, label: string) => {
    const node = button('file-search-toggle', text, () => { node.setAttribute('aria-pressed', String(!pressed(node))); commit() }, { 'aria-label': label, 'aria-pressed': 'false', 'data-tooltip': label })
    return node
  }

  const search = element('input', 'file-search-input', { type: 'text', placeholder: t('chatTools.search'), 'aria-label': t('chatTools.search'), 'main-field': 'true' })
  const replace = element('input', 'file-search-input', { type: 'text', placeholder: t('fileSearchPanel.replace'), 'aria-label': t('fileSearchPanel.replace') })
  search.oninput = commit
  replace.oninput = commit
  const caseToggle = toggle('Aa', t('fileSearchPanel.matchCase'))
  const wordToggle = toggle('ab', t('fileSearchPanel.wholeWord'))
  const regexpToggle = toggle('.*', t('fileSearchPanel.regularExpression'))
  wordToggle.classList.add('file-search-word')
  const count = element('span', 'file-search-count', { role: 'status', 'aria-live': 'polite' })
  const searchField = element('div', 'file-search-field', {}, [search, caseToggle, wordToggle, regexpToggle])

  const replaceButton = button('file-search-action', t('fileSearchPanel.replace'), () => replaceNext(view))
  const replaceAllButton = button('file-search-action', t('fileSearchPanel.replaceAll'), () => replaceAll(view))
  const previousButton = iconButton('up', t('fileSearchPanel.previousShiftEnter'), () => findPrevious(view))
  const nextButton = iconButton('down', t('fileSearchPanel.nextEnter'), () => findNext(view))
  const closeButton = iconButton('close', t('fileSearchPanel.closeEsc'), () => closeSearchPanel(view))

  const replaceRow = element('div', 'file-search-row', {}, [
    element('div', 'file-search-field', {}, [replace]),
    replaceButton, replaceAllButton
  ])
  const dom = element('div', 'file-search', { role: 'search', 'aria-label': t('FileEditor.searchFileContents') }, [
    element('div', 'file-search-row', {}, [
      searchField, count,
      previousButton, nextButton, closeButton
    ]),
    replaceRow
  ])
  dom.onkeydown = (event) => {
    if (event.isComposing || event.defaultPrevented) return
    if (runFileSearchShortcut(event, view)) return
    if (runScopeHandlers(view, event, 'search-panel')) event.preventDefault()
    else if (event.key === 'Enter' && event.target === search) { event.preventDefault(); (event.shiftKey ? findPrevious : findNext)(view) }
    else if (event.key === 'Enter' && event.target === replace) { event.preventDefault(); replaceNext(view) }
  }

  const show = (state: EditorState) => {
    search.value = query.search
    replace.value = query.replace
    caseToggle.setAttribute('aria-pressed', String(query.caseSensitive))
    wordToggle.setAttribute('aria-pressed', String(query.wholeWord))
    regexpToggle.setAttribute('aria-pressed', String(query.regexp))
    replaceRow.hidden = state.readOnly
  }
  const recount = (state: EditorState) => {
    const result = query.search ? matchCount(state, query) : { current: 0, total: 0 }
    searchField.dataset.invalid = String(result === null)
    count.textContent = result === null ? t('fileSearchPanel.invalidExpression') : !query.search ? '' : result.total > COUNT_LIMIT ? `${COUNT_LIMIT}+` : `${result.current} / ${result.total}`
  }
  const localize = () => {
    search.placeholder = t('chatTools.search')
    search.setAttribute('aria-label', t('chatTools.search'))
    replace.placeholder = t('fileSearchPanel.replace')
    replace.setAttribute('aria-label', t('fileSearchPanel.replace'))
    dom.setAttribute('aria-label', t('FileEditor.searchFileContents'))
    replaceButton.textContent = t('fileSearchPanel.replace')
    replaceAllButton.textContent = t('fileSearchPanel.replaceAll')
    for (const [node, label] of [
      [caseToggle, t('fileSearchPanel.matchCase')], [wordToggle, t('fileSearchPanel.wholeWord')],
      [regexpToggle, t('fileSearchPanel.regularExpression')], [previousButton, t('fileSearchPanel.previousShiftEnter')],
      [nextButton, t('fileSearchPanel.nextEnter')], [closeButton, t('fileSearchPanel.closeEsc')]
    ] as const) {
      node.setAttribute('aria-label', label)
      node.setAttribute('data-tooltip', label)
    }
    recount(view.state)
  }
  let unsubscribe = () => {}
  show(view.state)
  recount(view.state)

  return {
    dom,
    top: true,
    mount: () => { search.select(); unsubscribe = useLocale.subscribe(localize) },
    destroy: () => unsubscribe(),
    update: (update: ViewUpdate) => {
      const next = getSearchQuery(update.state)
      // A query typed here is already in `query`; only one set from outside needs showing.
      const outside = !next.eq(query)
      query = next
      if (outside || update.startState.readOnly !== update.state.readOnly) show(update.state)
      if (!next.eq(getSearchQuery(update.startState)) || update.docChanged || update.selectionSet) recount(update.state)
    }
  }
}
