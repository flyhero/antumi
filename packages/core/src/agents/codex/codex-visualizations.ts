import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import path from 'node:path'
import { MAX_VISUALIZATION_BYTES, visualizationPath, type VisualizationFile } from '@antumi/protocol'
import { Rejection } from '../../rejection'
import { projectLocation } from '../../conversation-files'
import { codexDefaultHome } from './codex-account'

export type VisualizationScope = { roots: readonly string[]; threadId: string | null; startedAt: number; home?: string }

function threadDirectory(scope: VisualizationScope): string | null {
  if (!scope.threadId || !/^[a-zA-Z0-9_-]+$/.test(scope.threadId)) return null
  const epoch = /^[0-9a-f]{8}-[0-9a-f]{4}-7/i.test(scope.threadId) ? Number.parseInt(scope.threadId.replaceAll('-', '').slice(0, 12), 16) : scope.startedAt
  const date = new Date(epoch).toISOString().slice(0, 10).replaceAll('-', path.sep)
  return path.join(scope.home ?? codexDefaultHome(), 'visualizations', date, scope.threadId)
}

async function directories(file: string, root: string): Promise<boolean> {
  let parent = path.dirname(file)
  while (parent !== root) {
    const info = await lstat(parent)
    if (!info.isDirectory() || info.isSymbolicLink()) return false
    const next = path.dirname(parent)
    if (next === parent) return false
    parent = next
  }
  return true
}

// The fragment is read by core; it never receives a file URL or access to neighbouring files.
export async function readCodexVisualization(scope: VisualizationScope, name: string): Promise<VisualizationFile | null> {
  if (!visualizationPath(name)) throw new Rejection('visualization-path-invalid')
  const native = threadDirectory(scope)
  const roots = [...scope.roots, ...(native ? [native] : [])]
  const file = path.isAbsolute(name) ? name : native && name === path.basename(name) ? path.join(native, name) : null
  if (!file || path.normalize(file) !== file) throw new Rejection('visualization-path-invalid')
  const root = projectLocation(file, roots).root
  if (!root) throw new Rejection('visualization-outside-workspace')
  try {
    const boundary = root === native ? scope.home ?? codexDefaultHome() : root
    const realRoot = await realpath(boundary)
    const candidate = path.join(realRoot, path.relative(boundary, file))
    if (!await directories(candidate, realRoot)) throw new Rejection('visualization-path-invalid')
    const before = await lstat(candidate)
    if (!before.isFile() || before.isSymbolicLink()) throw new Rejection('visualization-path-invalid')
    if (before.size > MAX_VISUALIZATION_BYTES) throw new Rejection('visualization-too-large')
    const handle = await open(candidate, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0))
    try {
      const info = await handle.stat()
      if (!info.isFile() || info.ino !== before.ino || info.dev !== before.dev || !await directories(candidate, realRoot)) throw new Rejection('visualization-path-invalid')
      if (info.size > MAX_VISUALIZATION_BYTES) throw new Rejection('visualization-too-large')
      const buffer = Buffer.alloc(MAX_VISUALIZATION_BYTES + 1)
      let length = 0
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null)
        if (!bytesRead) break
        length += bytesRead
      }
      if (length > MAX_VISUALIZATION_BYTES) throw new Rejection('visualization-too-large')
      const contents = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))
      if (contents.includes('\0')) throw new Rejection('visualization-path-invalid')
      return { path: file, contents }
    } finally { await handle.close() }
  } catch (error) {
    if (error instanceof Rejection) throw error
    if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return null
    throw new Rejection('visualization-unreadable')
  }
}
