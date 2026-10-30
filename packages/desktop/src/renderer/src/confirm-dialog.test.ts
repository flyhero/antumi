import { describe, expect, it } from 'vitest'
import { askConfirm, confirmParts, useConfirmDialog } from './confirm-dialog'

describe('confirm parts', () => {
  it('takes the leading question as the title', () => {
    expect(confirmParts('清理 4 个 worktree？\n\n分支和提交都会保留。')).toEqual({ title: '清理 4 个 worktree？', body: '分支和提交都会保留。' })
    expect(confirmParts('Delete task “x”? Existing worktrees are kept.')).toEqual({ title: 'Delete task “x”?', body: 'Existing worktrees are kept.' })
  })

  it('takes a trailing question, leaving what comes before as the body', () => {
    expect(confirmParts('Codex 已用完 5 小时额度。\nClaude 还有额度。\n\n仍要用 Codex 启动吗？')).toEqual({ title: '仍要用 Codex 启动吗？', body: 'Codex 已用完 5 小时额度。\nClaude 还有额度。' })
    expect(confirmParts('index.ts has unsaved changes. Close and discard them?')).toEqual({ title: 'Close and discard them?', body: 'index.ts has unsaved changes.' })
  })

  it('does not end the question inside a quoted name', () => {
    expect(confirmParts('删除任务「为什么？」？聊天记录保留。')).toEqual({ title: '删除任务「为什么？」？', body: '聊天记录保留。' })
    expect(confirmParts('Delete task “why?”? Kept.')).toEqual({ title: 'Delete task “why?”?', body: 'Kept.' })
  })

  it('shows a message without a question whole', () => {
    expect(confirmParts('  Done.  ')).toEqual({ title: 'Done.', body: '' })
  })
})

describe('ask confirm', () => {
  it('resolves with the answer and declines a question a newer one replaces', async () => {
    const first = askConfirm({ message: 'A?', confirm: 'OK' })
    const second = askConfirm({ message: 'B?', confirm: 'OK' })
    expect(await first).toBe(false)
    useConfirmDialog.getState().asking?.answer(true)
    expect(await second).toBe(true)
    expect(useConfirmDialog.getState().asking).toBeNull()
  })
})
