import type { LinuxTarget } from '../linux-backend/linux-target'
import { launchInDistro, nodeWslHost, runInDistro, spawnInDistro, type WslHost } from './wsl-command'

// The background program writes its own logs, from the distro's home rather than Windows' cwd.
const LAUNCH_SCRIPT = [
  'logs="$HOME/.antumi/logs"',
  'mkdir -p -m 700 "$logs"',
  'cd "$HOME"',
  'name=$1',
  'shift',
  'exec "$@" >> "$logs/$name.log" 2>&1'
].join('\n')

// A WSL distro as the backend's machine: every program through wsl.exe (the default distro for
// null).
export function wslTarget(distro: string | null, host: WslHost = nodeWslHost): LinuxTarget {
  return {
    run: (argv, options = {}) => runInDistro(distro, argv, { ...options, host }),
    spawn: (argv, options = {}) => spawnInDistro(distro, argv, { ...options, host }),
    // Its wsl.exe stays for as long as the program runs, which is what keeps the distro up.
    launch(name, argv, env) {
      return launchInDistro(distro, ['/bin/sh', '-c', LAUNCH_SCRIPT, 'sh', name, ...argv], { host, env })
    }
  }
}
