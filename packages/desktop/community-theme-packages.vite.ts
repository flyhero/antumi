import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

// An empty catalog has no imports yet, so Vite must watch its directory outside the renderer root.
export function communityThemePackages(): Plugin {
  return {
    name: 'antumi-community-theme-packages',
    configureServer(server) {
      server.watcher.add(fileURLToPath(new URL('../../community/markdown-themes/', import.meta.url)))
    }
  }
}
