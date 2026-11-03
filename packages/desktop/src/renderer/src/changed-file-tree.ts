import type { ChangedFile } from '@antumi/protocol'

export type ChangedFileNode =
  | { kind: 'folder'; name: string; path: string; children: ChangedFileNode[] }
  | { kind: 'file'; name: string; file: ChangedFile }

type Folder = { folders: Map<string, Folder>; files: ChangedFile[] }

// The files by folder, folders first and each level by name. A folder holding one folder and no
// file shares its row with it ("packages/core/src"), as an IDE's compact folders do.
export function changedFileTree(files: readonly ChangedFile[]): ChangedFileNode[] {
  const root: Folder = { folders: new Map(), files: [] }
  for (const file of files) {
    let folder = root
    for (const part of file.path.split('/').slice(0, -1)) {
      let next = folder.folders.get(part)
      if (!next) {
        next = { folders: new Map(), files: [] }
        folder.folders.set(part, next)
      }
      folder = next
    }
    folder.files.push(file)
  }
  return nodes(root, '')
}

function nodes(folder: Folder, prefix: string): ChangedFileNode[] {
  const folders = [...folder.folders].sort(([a], [b]) => a.localeCompare(b)).map(([name, child]): ChangedFileNode => {
    let path = prefix + name
    let label = name
    for (let only = soleFolder(child); only; only = soleFolder(child)) {
      path += `/${only[0]}`
      label += `/${only[0]}`
      child = only[1]
    }
    return { kind: 'folder', name: label, path, children: nodes(child, `${path}/`) }
  })
  const files = [...folder.files].sort((a, b) => a.path.localeCompare(b.path)).map((file): ChangedFileNode => ({ kind: 'file', name: file.path.slice(file.path.lastIndexOf('/') + 1), file }))
  return [...folders, ...files]
}

function soleFolder(folder: Folder): [string, Folder] | undefined {
  return folder.files.length === 0 && folder.folders.size === 1 ? [...folder.folders][0] : undefined
}
