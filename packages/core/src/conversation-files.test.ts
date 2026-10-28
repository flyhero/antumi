import { execFileSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_FILE_PREVIEW_BYTES } from '@antumi/protocol'
import { ConversationFiles, fileScope, projectLocation } from './conversation-files'

describe('conversation files', () => {
  let root: string
  let primary: string
  let extra: string
  let files: ConversationFiles
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'antumi-preview-'))
    primary = path.join(root, 'primary')
    extra = path.join(root, 'extra')
    await Promise.all([mkdir(path.join(primary, 'src/deep'), { recursive: true }), mkdir(extra)])
    execFileSync('git', ['init', '-q'], { cwd: primary })
    files = new ConversationFiles(() => ({ workspacePath: primary, projectPaths: [primary, extra] }))
  })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })

  it('resolves exact paths in project order, including an extra worktree and spaced Unicode names', async () => {
    await Promise.all([writeFile(path.join(primary, '同名 文件.ts'), 'primary'), writeFile(path.join(extra, '同名 文件.ts'), 'extra'), writeFile(path.join(extra, 'only.md'), '')])
    expect(await files.resolve('chat', '同名 文件.ts')).toEqual({ path: path.join(primary, '同名 文件.ts'), root: primary, relative: '同名 文件.ts', kind: 'file' })
    expect(await files.resolve('chat', 'only.md')).toMatchObject({ path: path.join(extra, 'only.md'), root: extra })
    expect(await files.resolve('chat', '../extra/only.md')).toMatchObject({ path: path.join(extra, 'only.md') })
  })

  it('finds a bare name below the project root with the existing shallowest match rule', async () => {
    await Promise.all([writeFile(path.join(primary, 'src/deep/a.ts'), ''), writeFile(path.join(primary, 'src/a.ts'), '')])
    expect(await files.resolve('chat', 'a.ts')).toMatchObject({ path: path.join(primary, 'src/a.ts') })
    expect(await files.resolve('chat', 'missing.ts')).toBeNull()
  })

  it('supports managed workspaces, directories, home and absolute files outside the projects', async () => {
    const managed = new ConversationFiles(() => ({ workspacePath: primary, projectPaths: [] }))
    await writeFile(path.join(primary, 'managed.md'), 'managed')
    await writeFile(path.join(root, 'outside.txt'), 'outside')
    expect(await managed.resolve('chat', 'managed.md')).toMatchObject({ path: path.join(primary, 'managed.md') })
    expect(await files.resolve('chat', 'src')).toMatchObject({ kind: 'directory' })
    expect(await files.resolve('chat', '~')).toMatchObject({ path: homedir(), kind: 'directory' })
    expect(await files.resolve('chat', path.join(root, 'outside.txt'))).toMatchObject({ root: null, relative: null })
  })

  it('reads UTF-8 text and empty files, and distinguishes missing files and directories', async () => {
    const text = path.join(primary, 'text.md')
    const empty = path.join(primary, 'empty.txt')
    await Promise.all([writeFile(text, '你好\ncontent\n'), writeFile(empty, '')])
    expect(await files.read('chat', text)).toMatchObject({ kind: 'text', text: '你好\ncontent\n', mtimeMs: expect.any(Number) })
    expect(await files.read('chat', empty)).toMatchObject({ kind: 'text', text: '' })
    expect(await files.read('chat', path.join(primary, 'gone'))).toEqual({ kind: 'unavailable', reason: 'not-found' })
    expect(await files.read('chat', primary)).toEqual({ kind: 'unavailable', reason: 'is-directory' })
  })

  it('rejects binary bytes and invalid UTF-8 instead of decoding them as text', async () => {
    for (const [index, buffer] of [Buffer.from([0, 65]), Buffer.from([0xff, 0xfe])].entries()) {
      const file = path.join(primary, `binary-${index}`)
      await writeFile(file, buffer)
      expect(await files.read('chat', file)).toEqual({ kind: 'unavailable', reason: 'binary' })
    }
  })

  it('allows exactly the preview limit and refuses larger files without truncating them', async () => {
    const file = path.join(primary, 'large.txt')
    await writeFile(file, 'a'.repeat(MAX_FILE_PREVIEW_BYTES))
    const read = await files.read('chat', file)
    expect(read.kind === 'text' && read.text.length).toBe(MAX_FILE_PREVIEW_BYTES)
    await writeFile(file, 'a'.repeat(MAX_FILE_PREVIEW_BYTES + 1))
    expect(await files.read('chat', file)).toEqual({ kind: 'unavailable', reason: 'too-large' })
  })

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('reports unreadable files', async () => {
    const file = path.join(primary, 'private.txt')
    await writeFile(file, 'private')
    await chmod(file, 0)
    expect(await files.read('chat', file)).toEqual({ kind: 'unavailable', reason: 'unreadable' })
  })

  it('checks the owning conversation and requires an absolute read path', async () => {
    await expect(files.read('chat', 'a.ts')).rejects.toThrow('绝对路径')
    const deleted = new ConversationFiles(() => { throw new Error('conversation not found') })
    await expect(deleted.read('deleted', primary)).rejects.toThrow('conversation not found')
    await expect(deleted.resolve('deleted', primary)).rejects.toThrow('conversation not found')
  })

  it('lists a project folder with folders first in natural order, hiding .git', async () => {
    await Promise.all([writeFile(path.join(primary, 'b10.ts'), ''), writeFile(path.join(primary, 'b2.ts'), ''), writeFile(path.join(primary, 'A.md'), '')])
    const listing = await files.list('chat', primary)
    expect(listing.truncated).toBe(false)
    expect(listing.entries.map((entry) => [entry.name, entry.kind])).toEqual([['src', 'directory'], ['A.md', 'file'], ['b2.ts', 'file'], ['b10.ts', 'file']])
    expect(listing.entries[0]?.path).toBe(path.join(primary, 'src'))
    expect((await files.list('chat', path.join(primary, 'src'))).entries.map((entry) => entry.name)).toEqual(['deep'])
  })

  it.skipIf(process.platform === 'win32')('lists links by what they point at', async () => {
    await symlink(extra, path.join(primary, 'linked'))
    await symlink(path.join(root, 'gone'), path.join(primary, 'broken'))
    const { entries } = await files.list('chat', primary)
    expect(entries.find((entry) => entry.name === 'linked')).toMatchObject({ kind: 'directory', symlink: true })
    expect(entries.find((entry) => entry.name === 'broken')).toMatchObject({ kind: 'other', symlink: true })
    expect(entries.find((entry) => entry.name === 'src')).toMatchObject({ kind: 'directory', symlink: false })
  })

  it('refuses to list folders outside the projects', async () => {
    await expect(files.list('chat', root)).rejects.toThrow('项目')
    await expect(files.list('chat', 'src')).rejects.toThrow('项目')
    await expect(files.list('chat', path.join(primary, 'missing'))).rejects.toThrow('无法读取目录')
  })

  it('saves a project file in place when it has not changed since it was read', async () => {
    const file = path.join(primary, 'edit.ts')
    await writeFile(file, 'before')
    await chmod(file, 0o640)
    const read = await files.read('chat', file)
    const mtimeMs = read.kind === 'text' ? read.mtimeMs ?? null : null
    const saved = await files.write('chat', file, '之后', mtimeMs)
    expect(saved).toEqual({ kind: 'saved', mtimeMs: (await stat(file)).mtimeMs })
    expect(await readFile(file, 'utf8')).toBe('之后')
    if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o640)
  })

  it('reports a conflict when the file changed or vanished after it was read', async () => {
    const file = path.join(primary, 'edit.ts')
    await writeFile(file, 'before')
    const { mtimeMs } = await stat(file)
    await utimes(file, new Date(), new Date(mtimeMs + 5000))
    expect(await files.write('chat', file, 'mine', mtimeMs)).toEqual({ kind: 'conflict', mtimeMs: (await stat(file)).mtimeMs })
    expect(await readFile(file, 'utf8')).toBe('before')
    expect(await files.write('chat', file, 'mine', null)).toMatchObject({ kind: 'saved' })
    expect(await files.write('chat', path.join(primary, 'gone.ts'), 'mine', null)).toEqual({ kind: 'conflict', mtimeMs: null })
  })

  it('refuses to save outside the projects, through a link, or into a folder', async () => {
    const outside = path.join(root, 'outside.txt')
    await writeFile(outside, 'outside')
    await expect(files.write('chat', outside, 'x', null)).rejects.toThrow('项目')
    await expect(files.write('chat', 'edit.ts', 'x', null)).rejects.toThrow('绝对路径')
    await expect(files.write('chat', primary, 'x', null)).rejects.toThrow('无法写入')
    if (process.platform !== 'win32') {
      await symlink(outside, path.join(primary, 'link.txt'))
      await expect(files.write('chat', path.join(primary, 'link.txt'), 'x', null)).rejects.toThrow('项目')
      expect(await readFile(outside, 'utf8')).toBe('outside')
    }
  })
  it('works within given folders when no conversation owns them', async () => {
    const scope = fileScope(undefined, [extra])
    const file = path.join(extra, 'notes.md')
    await writeFile(file, 'before')
    expect(await files.resolve(scope, 'notes.md')).toMatchObject({ path: file, root: extra, relative: 'notes.md' })
    expect((await files.list(scope, extra)).entries.map((entry) => entry.name)).toEqual(['notes.md'])
    await expect(files.list(scope, primary)).rejects.toThrow('项目')
    expect(await files.write(scope, file, 'after', null)).toMatchObject({ kind: 'saved' })
    await writeFile(path.join(primary, 'x.ts'), 'x')
    await expect(files.write(scope, path.join(primary, 'x.ts'), 'y', null)).rejects.toThrow('项目')
    expect(() => fileScope(undefined, undefined)).toThrow('需要会话或项目目录')
    expect(() => fileScope(undefined, ['relative'])).toThrow('绝对路径')
    expect(fileScope('chat', [extra])).toBe('chat')
  })
})

it('computes project boundaries for Windows drive and UNC paths', () => {
  expect(projectLocation('C:\\repo\\src\\a.ts', ['C:\\repo'], path.win32)).toEqual({ root: 'C:\\repo', relative: 'src\\a.ts' })
  expect(projectLocation('C:\\repo-other\\a.ts', ['C:\\repo'], path.win32)).toEqual({ root: null, relative: null })
  expect(projectLocation('\\\\host\\share\\repo\\a.ts', ['\\\\host\\share\\repo'], path.win32).relative).toBe('a.ts')
})
