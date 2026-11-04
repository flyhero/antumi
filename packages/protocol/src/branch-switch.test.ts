import { describe, expect, it } from 'vitest'
import { branchSwitchMessage, withoutBranchSwitchNote } from './branch-switch'

describe('branch switch note', () => {
  it('leaves what the user wrote, quotes and all', () => {
    const said = '<!-- quote 1 from item:s/r1 -->\n> 原话\n\n为什么？'
    expect(branchSwitchMessage(['app 现在在分支 fix/login', 'api 现在在分支 main'], said))
      .toBe(`（我切换了分支：app 现在在分支 fix/login；api 现在在分支 main。文件已经变了，需要时请重新读。）\n\n${said}`)
    expect(withoutBranchSwitchNote(branchSwitchMessage(['app 现在在分支 fix/login'], said))).toBe(said)
    expect(withoutBranchSwitchNote(branchSwitchMessage(['app 现在在分支 fix/login'], ''))).toBe('')
  })

  it('leaves any other message alone', () => {
    expect(withoutBranchSwitchNote('Carry on')).toBe('Carry on')
    expect(withoutBranchSwitchNote('（我切换了分支：然后呢\n\n后面')).toBe('（我切换了分支：然后呢\n\n后面')
  })
})
