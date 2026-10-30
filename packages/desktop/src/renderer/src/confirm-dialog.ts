import { create } from 'zustand'

export type ConfirmRequest = {
  message: string
  // The action itself, as the button names it: 「删除」, not 「确定」.
  confirm: string
  cancel?: string
  // Losing something the user cannot get back.
  danger?: boolean
}

type Asking = ConfirmRequest & { answer(confirmed: boolean): void }

export const useConfirmDialog = create<{ asking: Asking | null }>()(() => ({ asking: null }))

// Stands in for window.confirm, whose native box ignores the app's look. A second question while
// one is open declines the first.
export function askConfirm(request: ConfirmRequest): Promise<boolean> {
  useConfirmDialog.getState().asking?.answer(false)
  return new Promise((resolve) => {
    const asking: Asking = {
      ...request,
      answer: (confirmed) => {
        if (useConfirmDialog.getState().asking === asking) useConfirmDialog.setState({ asking: null })
        resolve(confirmed)
      }
    }
    useConfirmDialog.setState({ asking })
  })
}

// Where a sentence ends. A mark inside a quote or bracket ends the quoted text, not the sentence;
// a Latin full stop ends one only before a space, so a file name's dot does not.
function endsSentence(text: string, index: number): boolean {
  const char = text.charAt(index)
  const next = text.charAt(index + 1)
  if (char === '\n') return true
  if ('。！？'.includes(char)) return next === '' || !'」』”’）)'.includes(next)
  return '.!?'.includes(char) && (next === '' || /\s/.test(next))
}

// The messages read 「question? what it means.」, sometimes the other way round: the question is the
// title, the rest the explanation under it.
export function confirmParts(message: string): { title: string; body: string } {
  const text = message.trim()
  let end = -1
  for (let index = 0; index < text.length && end < 0; index++) {
    if ('?？'.includes(text.charAt(index)) && endsSentence(text, index)) end = index
  }
  if (end < 0) return { title: text, body: '' }
  let start = end
  while (start > 0 && !endsSentence(text, start - 1)) start--
  const body = [text.slice(0, start).trim(), text.slice(end + 1).trim()].filter(Boolean).join('\n\n')
  return { title: text.slice(start, end + 1).trim(), body }
}
