import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { committedHead, countStatusEntries, describeWorktreeOutcome, layOutDelegationWorktree, readWorktreeOutcome } from './delegation-worktree'

describe('a delegated member\'s worktree', () => {
  const dirs: string[] = []
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim()
  const repo = () => {
    const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'antumi-delegation-')))
    dirs.push(dir)
    const source = path.join(dir, 'src')
    git(dir, 'init', '-q', '-b', 'main', source)
    writeFileSync(path.join(source, 'a.txt'), 'a')
    git(source, 'add', 'a.txt'); git(source, 'commit', '-q', '-m', 'a')
    return { dir, source, root: path.join(dir, 'worktrees') }
  }

  it('counts a staged rename once, as git status lists it with its old path', () => {
    expect(countStatusEntries('1 .M N... 100644 100644 100644 abc def a.txt\0? new.txt\0')).toBe(2)
    expect(countStatusEntries('2 R. N... 100644 100644 100644 abc def R100 b.txt\0a.txt\0? c.txt\0')).toBe(2)
    expect(countStatusEntries('')).toBe(0)
  })

  it('refuses a source with anything uncommitted, untracked files included, and gives the head of a clean one', async () => {
    const { source } = repo()
    expect(await committedHead(source)).toBe(git(source, 'rev-parse', 'HEAD'))
    writeFileSync(path.join(source, 'draft.txt'), 'd')
    await expect(committedHead(source)).rejects.toMatchObject({ reason: 'delegation-dirty' })
  })

  it('lays the worktree out from the source\'s head and, found again later, keeps the base the branch came from', async () => {
    const { source, root } = repo()
    const id = '0000000a-0000-4000-8000-000000000000'
    const head = git(source, 'rev-parse', 'HEAD')
    const laid = await layOutDelegationWorktree(id, source, root)
    expect(laid).toMatchObject({ source, base: head, created: true, branch: 'antumi/0000000a' })
    expect(git(laid.dir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('antumi/0000000a')
    // The source moves on; the member's branch does not follow it.
    writeFileSync(path.join(source, 'b.txt'), 'b'); git(source, 'add', 'b.txt'); git(source, 'commit', '-q', '-m', 'b')
    const again = await layOutDelegationWorktree(id, source, root)
    expect(again).toMatchObject({ dir: laid.dir, base: head, created: false })
  })

  it('reads what the member left from git, null where git could not say', async () => {
    const { source, root } = repo()
    const laid = await layOutDelegationWorktree('0000000b-0000-4000-8000-000000000000', source, root)
    writeFileSync(path.join(laid.dir, 'c.txt'), 'c'); git(laid.dir, 'add', 'c.txt'); git(laid.dir, 'commit', '-q', '-m', 'c')
    writeFileSync(path.join(laid.dir, 'd.txt'), 'd')
    expect(await readWorktreeOutcome(laid.dir, laid.base)).toEqual({ branch: laid.branch, head: git(laid.dir, 'rev-parse', 'HEAD'), commits: 1, changes: 1, error: null })
    const gone = await readWorktreeOutcome(path.join(root, 'missing'), laid.base)
    expect(gone).toMatchObject({ branch: null, head: null, commits: null, changes: null })
    expect(gone.error).toBeTruthy()
  })

  it('tells the caller what to merge, or that there is nothing', () => {
    expect(describeWorktreeOutcome('antumi/x', { branch: 'antumi/x', head: 'h', commits: 2, changes: 1, error: null }))
      .toBe('（worktree 委派：分支 `antumi/x`，2 个提交，1 个未提交文件。有 1 个未提交文件留在 worktree 里，合并前不要清理它。合并后请重新运行检查。）')
    expect(describeWorktreeOutcome('antumi/x', { branch: 'antumi/x', head: 'h', commits: 0, changes: 0, error: null }))
      .toBe('（worktree 委派：分支 `antumi/x`，没有新的提交，也没有未提交的文件。没有要合并的。）')
    expect(describeWorktreeOutcome('antumi/x', { branch: 'main', head: null, commits: null, changes: null, error: 'boom' }))
      .toContain('成员当前在分支 `main`，不是 `antumi/x`；读取 worktree 状态时出错：boom')
  })
})
