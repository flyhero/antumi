import { describe, expect, it } from 'vitest'
import type { ChangedFile } from '@antumi/protocol'
import { changedFileTree, type ChangedFileNode } from './changed-file-tree'

const file = (path: string): ChangedFile => ({ path, oldPath: null, kind: 'modified', additions: 1, deletions: 0 })
const outline = (nodes: ChangedFileNode[], depth = 0): string[] =>
  nodes.flatMap((node) => node.kind === 'file' ? [`${'  '.repeat(depth)}${node.name}`] : [`${'  '.repeat(depth)}${node.name}/`, ...outline(node.children, depth + 1)])

describe('changed file tree', () => {
  it('puts files under their folders, folders first, sharing a row with an only child folder', () => {
    const tree = changedFileTree([
      file('packages/desktop/src/renderer/src/styles.css'),
      file('CHANGELOG.md'),
      file('packages/core/src/task-store.ts'),
      file('packages/core/src/conversation-store.ts'),
      file('packages/desktop/src/renderer/src/components/ContextUsage.tsx'),
      file('DESIGN.md')
    ])
    expect(outline(tree)).toEqual([
      'packages/',
      '  core/src/',
      '    conversation-store.ts',
      '    task-store.ts',
      '  desktop/src/renderer/src/',
      '    components/',
      '      ContextUsage.tsx',
      '    styles.css',
      'CHANGELOG.md',
      'DESIGN.md'
    ])
  })

  it('keeps each folder its full path, for a key and a tooltip', () => {
    expect(changedFileTree([file('a/b/c.ts'), file('a/b/d/e.ts')])).toMatchObject([
      { kind: 'folder', name: 'a/b', path: 'a/b', children: [{ kind: 'folder', name: 'd', path: 'a/b/d' }, { kind: 'file', name: 'c.ts' }] }
    ])
  })
})
