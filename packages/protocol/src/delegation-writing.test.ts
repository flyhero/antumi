import { describe, expect, it } from 'vitest'
import { branchSwitchMessage, withoutBranchSwitchNote } from './branch-switch'
import { delegationWritingMessage, withoutDelegationWritingNote } from './delegation-writing'

describe('the note that a delegated member is editing', () => {
  const said = 'Why did you split the module?\n\nAnd what is left?'

  it('goes before what the user wrote, and comes off again', () => {
    const message = delegationWritingMessage(['Developer 在 /work/app', 'Tester 在 /work/api'], said)
    expect(message.startsWith('（委派的成员正在修改文件：Developer 在 /work/app；Tester 在 /work/api。这一轮只讨论、阅读和规划')).toBe(true)
    expect(message.endsWith(`\n\n${said}`)).toBe(true)
    expect(withoutDelegationWritingNote(message)).toBe(said)
    expect(withoutDelegationWritingNote(delegationWritingMessage(['Developer 在 /work/app'], ''))).toBe('')
  })

  it('leaves any other message whole', () => {
    expect(withoutDelegationWritingNote('Carry on')).toBe('Carry on')
    expect(withoutDelegationWritingNote('（委派的成员正在修改文件：然后呢\n\n后面')).toBe('（委派的成员正在修改文件：然后呢\n\n后面')
  })

  it('comes off before a branch switch note sent with the same message', () => {
    const message = delegationWritingMessage(['Developer 在 /work/app'], branchSwitchMessage(['app 现在在分支 main'], said))
    expect(withoutBranchSwitchNote(withoutDelegationWritingNote(message))).toBe(said)
  })
})
