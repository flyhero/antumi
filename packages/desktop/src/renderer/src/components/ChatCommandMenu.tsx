import { getLocale, t, tr } from '../i18n'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject, type TextareaHTMLAttributes } from 'react'
import type { EditorView } from '@codemirror/view'
import { isolateHistory } from '@codemirror/commands'
import { commandQuery, expandPrompt, matchCommands, typedAntumiCommand, type CommandEntry } from '../chat-commands'

const ANTUMI_LABEL = () => t('ChatCommandMenu.myCommands')

type InputProps = Pick<TextareaHTMLAttributes<HTMLTextAreaElement>, 'aria-autocomplete' | 'aria-expanded' | 'aria-controls' | 'aria-activedescendant'>

function CommandOption({ entry, id, active, onHover, onPick }: {
  entry: CommandEntry
  id: string
  active: boolean
  onHover: () => void
  onPick: () => void
}) {
  const row = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (active) row.current?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return (
    <li
      ref={row}
      id={id}
      role="option"
      aria-selected={active}
      className="chat-command-option"
      // Keeps the focus in the input, which goes on taking the keys.
      onMouseDown={(event) => event.preventDefault()}
      // Only a pointer that moves picks a row: the list appearing or changing under a resting one
      // must not take the highlight from the keys.
      onMouseMove={(event) => {
        if (!active && (event.movementX !== 0 || event.movementY !== 0)) onHover()
      }}
      onClick={onPick}
    >
      <span className="chat-command-option-name mono">/{entry.name}</span>
      {entry.argumentHint && <span className="chat-command-option-hint mono">{entry.argumentHint}</span>}
      <span className="chat-command-option-description">{entry.description}</span>
    </li>
  )
}

// The commands whose names match what follows a leading /, above the input: the user's own first,
// then the agent's. Enter runs the one picked (the user's own expands into the input, an agent's is
// sent), Tab only completes its name, Esc puts the list away until the text changes.
export function useChatCommandMenu({ text, entries, agentLabel, input, sendCommand }: {
  text: string
  entries: readonly CommandEntry[]
  agentLabel: string
  input: RefObject<EditorView | null>
  sendCommand: (text: string) => void
}): {
  menu: ReactNode
  inputProps: InputProps
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => boolean
  expand: (text: string) => string | null
} {
  const listId = useId()
  const [highlight, setHighlight] = useState(0)
  const [closedAt, setClosedAt] = useState<string | null>(null)
  const query = commandQuery(text)
  const shown = useMemo(() => {
    const matches = query === null ? [] : matchCommands(entries, query)
    return [...matches.filter((entry) => entry.source === 'antumi'), ...matches.filter((entry) => entry.source === 'agent')]
  }, [entries, query, getLocale()])
  const open = query !== null && text !== closedAt && shown.length > 0
  const active = Math.min(highlight, shown.length - 1)
  useEffect(() => setHighlight(0), [query])

  const replace = (next: string) => {
    const view = input.current
    if (!view) return
    // Complete the text and place the caret together; mapping an insertion keeps it before the suffix.
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next }, selection: { anchor: next.length }, annotations: isolateHistory.of('full'), userEvent: 'input.complete' })
    view.focus()
  }
  const pick = (entry: CommandEntry, complete: boolean) => {
    if (complete || (entry.source === 'antumi' && entry.argumentHint)) {
      replace(`/${entry.name} `)
    } else if (entry.source === 'antumi') {
      replace(expandPrompt(entry.command.prompt, ''))
    } else {
      setClosedAt(`/${entry.name}`)
      sendCommand(`/${entry.name}`)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): boolean => {
    if (!open || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) return false
    const entry = shown[active]
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1
      setHighlight((active + step + shown.length) % shown.length)
    } else if (event.key === 'Escape') {
      setClosedAt(text)
    } else if ((event.key === 'Enter' && !event.shiftKey) || (event.key === 'Tab' && !event.shiftKey)) {
      if (entry) pick(entry, event.key === 'Tab')
    } else {
      return false
    }
    event.preventDefault()
    return true
  }

  // Before a message goes, the user's own command it names expands into the input instead.
  const expand = (value: string): string | null => {
    const typed = typedAntumiCommand(value, entries)
    if (!typed) return null
    const expanded = expandPrompt(typed.command.prompt, typed.args)
    return expanded === value.trim() ? null : expanded
  }

  const optionId = (index: number) => `${listId}-${index}`
  const group = (source: CommandEntry['source'], label: string) => {
    const rows = shown.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.source === source)
    if (rows.length === 0) return null
    return (
      <li role="presentation" className="chat-command-group">
        <div className="menu-label">{label}</div>
        <ul role="group" aria-label={label} className="menu-list">
          {rows.map(({ entry, index }) => (
            <CommandOption
              key={`${source}:${entry.name}`}
              entry={entry}
              id={optionId(index)}
              active={index === active}
              onHover={() => setHighlight(index)}
              onPick={() => pick(entry, false)}
            />
          ))}
        </ul>
      </li>
    )
  }

  const menu = open ? (
    <div className="menu menu-up chat-command-menu">
      <ul id={listId} role="listbox" aria-label={t('ChatCommandMenu.slashCommands')} className="menu-list">
        {group('antumi', ANTUMI_LABEL())}
        {group('agent', t('ChatCommandMenu.commands', { agentLabel: agentLabel }))}
      </ul>
      <div className="chat-command-keys" aria-hidden="true">{tr('ChatCommandMenu.navigateSelectCompleteClose', { value1: <kbd>↑↓</kbd>, value2: <kbd>Enter</kbd>, value3: <kbd>Tab</kbd>, value4: <kbd>Esc</kbd> })}</div>
    </div>
  ) : null

  const inputProps: InputProps = {
    'aria-autocomplete': 'list',
    'aria-expanded': open,
    'aria-controls': open ? listId : undefined,
    'aria-activedescendant': open ? optionId(active) : undefined
  }
  return { menu, inputProps, onKeyDown, expand }
}
