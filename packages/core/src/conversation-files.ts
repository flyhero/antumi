import { constants } from 'node:fs'
import { open, readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { MAX_DIRECTORY_ENTRIES, MAX_FILE_PREVIEW_BYTES, type Conversation, type DirectoryEntry, type DirectoryListing, type FileRead, type FileWrite, type ResolvedFile } from '@antumi/protocol'
import { findFiles } from './file-search'
import { Rejection } from './rejection'

type FileOwner = Pick<Conversation, 'workspacePath' | 'projectPaths'>
// A conversation's id, whose folders the files belong to, or the folders themselves.
export type FileScope = string | { roots: readonly string[] }

export function fileScope(conversationId: string | undefined, roots: readonly string[] | undefined): FileScope {
  if (conversationId) return conversationId
  if (!roots?.length) throw new Rejection('file-scope-missing', '需要会话或项目目录')
  if (!roots.every((root) => path.isAbsolute(root))) throw new Rejection('file-path-invalid', '项目目录需要绝对路径')
  return { roots: roots.map((root) => path.normalize(root)) }
}

export function projectLocation(file: string, roots: readonly string[], paths = path): { root: string | null; relative: string | null } {
  const root = [...roots].sort((a, b) => b.length - a.length).find((root) => {
    const relative = paths.relative(root, file)
    return relative !== '..' && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative)
  })
  return root ? { root, relative: paths.relative(root, file) || '.' } : { root: null, relative: null }
}

function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}

export class ConversationFiles {
  constructor(private readonly owner: (id: string) => FileOwner) {}

  private roots(scope: FileScope): readonly string[] {
    if (typeof scope !== 'string') return scope.roots
    const conversation = this.owner(scope)
    return conversation.projectPaths.length ? conversation.projectPaths : [conversation.workspacePath]
  }

  async resolve(scope: FileScope, name: string): Promise<ResolvedFile | null> {
    const roots = this.roots(scope)
    const expanded = name === '~' || /^~[\\/]/.test(name) ? path.join(homedir(), name.slice(2)) : name
    const absolute = path.isAbsolute(expanded)
    const candidates = absolute ? [path.normalize(expanded)] : roots.map((root) => path.resolve(root, expanded))
    const inspect = async (file: string): Promise<ResolvedFile | null> => {
      try {
        const info = await stat(file)
        if (!info.isFile() && !info.isDirectory()) return null
        return { path: file, ...projectLocation(file, roots), kind: info.isDirectory() ? 'directory' : 'file' }
      } catch (error) {
        if (missing(error)) return null
        throw new Rejection('file-unreadable', `无法访问文件：${file}`)
      }
    }
    for (const file of new Set(candidates)) {
      const found = await inspect(file)
      if (found) return found
    }
    if (!absolute && expanded === name) {
      for (const file of await findFiles(roots, name.replaceAll(path.sep, '/'))) {
        const found = await inspect(file)
        if (found) return found
      }
    }
    return null
  }

  async read(scope: FileScope, file: string): Promise<FileRead> {
    this.roots(scope)
    if (!path.isAbsolute(file)) throw new Rejection('file-path-invalid', '读取文件需要绝对路径')
    try {
      const info = await stat(file)
      if (info.isDirectory()) return { kind: 'unavailable', reason: 'is-directory' }
      if (!info.isFile()) return { kind: 'unavailable', reason: 'binary' }
      if (info.size > MAX_FILE_PREVIEW_BYTES) return { kind: 'unavailable', reason: 'too-large' }
      // Nonblocking also protects against a regular file being replaced with a pipe before open.
      const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK)
      try {
        const opened = await handle.stat()
        if (!opened.isFile()) return { kind: 'unavailable', reason: opened.isDirectory() ? 'is-directory' : 'binary' }
        if (opened.size > MAX_FILE_PREVIEW_BYTES) return { kind: 'unavailable', reason: 'too-large' }
        const buffer = Buffer.alloc(MAX_FILE_PREVIEW_BYTES + 1)
        let length = 0
        while (length < buffer.length) {
          const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null)
          if (bytesRead === 0) break
          length += bytesRead
        }
        if (length > MAX_FILE_PREVIEW_BYTES) return { kind: 'unavailable', reason: 'too-large' }
        const bytes = buffer.subarray(0, length)
        if (bytes.includes(0)) return { kind: 'unavailable', reason: 'binary' }
        try {
          return { kind: 'text', text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), mtimeMs: opened.mtimeMs }
        } catch {
          return { kind: 'unavailable', reason: 'binary' }
        }
      } finally {
        await handle.close()
      }
    } catch (error) {
      return { kind: 'unavailable', reason: missing(error) ? 'not-found' : 'unreadable' }
    }
  }

  async list(scope: FileScope, dir: string): Promise<DirectoryListing> {
    const roots = this.roots(scope)
    if (!path.isAbsolute(dir) || projectLocation(path.normalize(dir), roots).root === null) throw new Rejection('file-path-invalid', '只能列出项目里的目录')
    let found
    try {
      found = await readdir(dir, { withFileTypes: true })
    } catch {
      throw new Rejection('file-unreadable', `无法读取目录：${dir}`)
    }
    const entries = await Promise.all(found.filter((entry) => entry.name !== '.git').map(async (entry): Promise<DirectoryEntry> => {
      const file = path.join(dir, entry.name)
      const symlink = entry.isSymbolicLink()
      const target = symlink ? await stat(file).catch(() => null) : entry
      const kind = target?.isDirectory() ? 'directory' : target?.isFile() ? 'file' : 'other'
      return { name: entry.name, path: file, kind, symlink }
    }))
    entries.sort((a, b) => Number(b.kind === 'directory') - Number(a.kind === 'directory') || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    return { entries: entries.slice(0, MAX_DIRECTORY_ENTRIES), truncated: entries.length > MAX_DIRECTORY_ENTRIES }
  }

  // Overwrites an existing project file in place, so its mode and hard links survive; `expected` is the
  // mtime the editor read, and a different one means someone else (usually the agent) wrote it since.
  async write(scope: FileScope, file: string, text: string, expected: number | null): Promise<FileWrite> {
    const roots = this.roots(scope)
    if (!path.isAbsolute(file)) throw new Rejection('file-path-invalid', '保存文件需要绝对路径')
    if (Buffer.byteLength(text) > MAX_FILE_PREVIEW_BYTES) throw new Rejection('file-too-large', '文件超过 2 MiB，无法保存')
    let real: string
    try {
      real = await realpath(file)
    } catch (error) {
      if (missing(error)) return { kind: 'conflict', mtimeMs: null }
      throw new Rejection('file-unreadable', `无法访问文件：${file}`)
    }
    const realRoots = await Promise.all(roots.map((root) => realpath(root).catch(() => root)))
    if (projectLocation(real, realRoots).root === null) throw new Rejection('file-outside-project', '只能保存项目里的文件')
    const handle = await open(real, constants.O_WRONLY | constants.O_NONBLOCK).catch(() => {
      throw new Rejection('file-unwritable', `无法写入文件：${file}`)
    })
    try {
      const before = await handle.stat()
      if (!before.isFile()) throw new Rejection('file-unwritable', `无法写入文件：${file}`)
      if (expected !== null && before.mtimeMs !== expected) return { kind: 'conflict', mtimeMs: before.mtimeMs }
      await handle.truncate(0)
      await handle.writeFile(text, 'utf8')
      return { kind: 'saved', mtimeMs: (await handle.stat()).mtimeMs }
    } finally {
      await handle.close()
    }
  }
}
