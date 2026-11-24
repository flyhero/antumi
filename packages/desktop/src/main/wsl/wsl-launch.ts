import path from 'node:path'

// CREATE_NO_WINDOW is ignored with DETACHED_PROCESS. The launcher's child escapes libuv's
// kill-on-exit job without DETACHED_PROCESS, so wsl.exe stays hidden and outlives the app.
const LAUNCH_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
  $launch = [Console]::In.ReadToEnd() | ConvertFrom-Json
  # Windows PowerShell's ProcessStartInfo needs CreateProcess quoting, never shell quoting.
  $quoted = foreach ($argument in $launch.args) {
    if ($argument.Length -gt 0 -and $argument -notmatch '[\s"]') {
      $argument
      continue
    }
    $escaped = [regex]::Replace($argument, '(\\*)"', '$1$1\"')
    $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
    '"' + $escaped + '"'
  }
  $info = [System.Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $launch.file
  $info.Arguments = $quoted -join ' '
  $info.WorkingDirectory = $launch.cwd
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $child = [System.Diagnostics.Process]::Start($info)
  $child.Dispose()
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
`

export function planWslLaunch(file: string, args: readonly string[], cwd: string): { file: string; args: string[]; input: string } {
  return {
    file: path.win32.join(path.win32.dirname(file), 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    args: ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(LAUNCH_SCRIPT, 'utf16le').toString('base64')],
    // Data goes only through stdin; no Linux argument or environment value becomes PowerShell.
    input: JSON.stringify({ file, args, cwd })
  }
}
