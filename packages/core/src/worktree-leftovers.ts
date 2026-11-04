import { execFileAsync } from './hidden-exec'
import { readProjectConfig } from './project-config'

// What installs, builds and caches leave, made again by setup or the next build: a folder of one of
// these names anywhere, or a file with one of these endings.
const REMADE_FOLDERS = new Set([
  'node_modules', '.pnpm-store', 'bower_components', 'vendor', 'dist', 'build', 'out', 'target', 'bin', 'obj',
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.parcel-cache', '.vite', '.cache', '.eslintcache', 'coverage', '.nyc_output',
  '__pycache__', '.venv', 'venv', '.tox', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.gradle', '.DS_Store'
])
const REMADE_ENDINGS = ['.log', '.pyc', '.tsbuildinfo']

function remade(entry: string, copied: readonly string[]): boolean {
  const trimmed = entry.replace(/\/$/, '')
  if (copied.some((listed) => {
    const plain = listed.replace(/^\.\//, '').replace(/\/$/, '')
    return trimmed === plain || trimmed.startsWith(`${plain}/`)
  })) return true
  return trimmed.split('/').some((segment) => REMADE_FOLDERS.has(segment)) || REMADE_ENDINGS.some((ending) => trimmed.endsWith(ending))
}

// The files git ignores in a worktree that nothing would make again: neither the project's copy list
// (.antumi/project.json) nor an install or build. Such a file may be the user's own, kept nowhere
// else, so a worktree holding one is never cleaned on Antumi's own accord. null when git cannot say.
export async function keptLeftovers(dir: string, repo: string | null): Promise<string[] | null> {
  let listing: string
  try {
    listing = (await execFileAsync('git', ['-C', dir, 'status', '--porcelain=v1', '-z', '--ignored=matching'])).stdout
  } catch {
    return null
  }
  const copied = repo ? ((await readProjectConfig(repo).catch(() => null))?.config.copy ?? []) : []
  return listing.split('\0').flatMap((line) => (line.startsWith('!! ') && !remade(line.slice(3), copied) ? [line.slice(3)] : []))
}
