import { describe, expect, it } from 'vitest'
import { workingPlaceholder } from './composer-placeholder'

describe('workingPlaceholder', () => {
  it('names the platform\'s key for putting a message into the running turn', () => {
    const working = { awaiting: false, queueable: true, steerable: true }
    expect(workingPlaceholder(working, { send: 'Enter', steer: '⌘Enter', interrupt: 'Esc' })).toBe('也可以写下一条，Enter 排到回合结束后发送，⌘Enter 立刻插入；Esc 中断')
    expect(workingPlaceholder(working, { send: 'Enter', steer: 'Ctrl+Enter', interrupt: 'Esc' })).toBe('也可以写下一条，Enter 排到回合结束后发送，Ctrl+Enter 立刻插入；Esc 中断')
  })

  it('leaves the key out where the agent takes nothing mid-turn, and asks first while it waits', () => {
    expect(workingPlaceholder({ awaiting: false, queueable: true, steerable: false }, { send: 'Enter', steer: '⌘Enter', interrupt: 'Esc' })).toBe('也可以写下一条，Enter 排到回合结束后发送；Esc 中断')
    expect(workingPlaceholder({ awaiting: true, queueable: true, steerable: true }, { send: 'Enter', steer: '⌘Enter', interrupt: 'Esc' })).toBe('先回答上面的请求，也可以写下一条，Enter 排到回合结束后发送，⌘Enter 立刻插入；Esc 中断')
  })

  it('says only what an older core allows, which queues nothing', () => {
    expect(workingPlaceholder({ awaiting: false, queueable: false, steerable: true }, { send: 'Enter', steer: '⌘Enter', interrupt: 'Esc' })).toBe('Agent 正在处理，可以先写下一条；Esc 中断')
    expect(workingPlaceholder({ awaiting: true, queueable: false, steerable: true }, { send: 'Enter', steer: '⌘Enter', interrupt: 'Esc' })).toBe('先回答上面的请求')
  })

  it('shows current bindings and leaves disabled shortcuts out', () => {
    const working = { awaiting: false, queueable: true, steerable: true }
    expect(workingPlaceholder(working, { send: 'F6', steer: 'F7', interrupt: 'F8' })).toBe('也可以写下一条，F6 排到回合结束后发送，F7 立刻插入；F8 中断')
    expect(workingPlaceholder(working, { send: '', steer: '', interrupt: '' })).toBe('也可以写下一条')
    expect(workingPlaceholder({ ...working, queueable: false }, { send: '', steer: '', interrupt: '' })).toBe('Agent 正在处理，可以先写下一条')
  })

  it('never shows a placeholder of its own source', () => {
    for (const awaiting of [false, true]) for (const queueable of [false, true]) for (const steerable of [false, true]) {
      expect(workingPlaceholder({ awaiting, queueable, steerable })).not.toContain('${')
    }
  })
})
