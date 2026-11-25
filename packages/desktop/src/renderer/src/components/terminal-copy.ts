type CopyKey = Pick<KeyboardEvent, 'type' | 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'preventDefault'>

type SelectionClipboard = {
  getSelection: () => string
  writeText: (text: string) => void
}

// With a selection Ctrl+C copies; without one it keeps its shell meaning.
export function terminalCopyHandler({ getSelection, writeText }: SelectionClipboard) {
  return (event: CopyKey): boolean => {
    if (!event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== 'c') return true
    const text = getSelection()
    if (!text) return true
    event.preventDefault()
    if (event.type === 'keydown') writeText(text)
    return false
  }
}
