import type { ChildProcess } from 'node:child_process'

// A Linux machine the backend runs on that is not this one: a WSL distro or an SSH host
// (docs/REMOTE.md). Installing, starting and asking the backend there is the same everywhere
// (linux-backend.ts); only how a program gets run there differs, and that is all a target says.

// Environment for the Linux side, set there rather than inherited from this machine.
export type LinuxEnv = Readonly<Record<string, string>>

export type LinuxResult = {
  // Null when the program never ran, was killed, or ended on a signal.
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export type LinuxRunOptions = {
  // Written to stdin, then stdin ends: how secrets and long scripts go in, never through argv.
  input?: string | Uint8Array
  timeoutMs?: number
  env?: LinuxEnv
}

export type LinuxTarget = {
  // Run to its end; resolves on any exit code.
  run(argv: readonly string[], options?: LinuxRunOptions): Promise<LinuxResult>
  // A long-lived program with piped, binary-clean stdio: the tunnel helper. Throws when there is
  // nothing to start it with.
  spawn(argv: readonly string[], options?: { env?: LinuxEnv }): ChildProcess
  // Starts daemon or core so that it outlives the app and whatever reached the machine, its output
  // in ~/.antumi/logs/<name>.log there.
  launch(name: 'daemon' | 'core', argv: readonly string[], env: LinuxEnv): void | Promise<void>
}
