import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { communityThemePackages } from './community-theme-packages.vite.ts'

// The pet's playground in a plain browser: `pnpm dev:pet`, then http://127.0.0.1:5175/#pet-playground.
// Only the renderer is served, with no Electron and no core; the page needs neither.
export default defineConfig({
  root: 'src/renderer',
  plugins: [react(), communityThemePackages()],
  server: { port: 5175, strictPort: true, host: '127.0.0.1' }
})
