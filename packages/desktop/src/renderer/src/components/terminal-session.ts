import type { RpcConnection } from '@antumi/protocol'
import type { Terminal } from '@xterm/xterm'
import { t } from '../i18n'

const ignore = () => {}
type Output = { offset: number; data: string }

// The attach snapshot and live events overlap; each character is written only once.
function bufferedOutput(term: Pick<Terminal, 'write'>) {
  let attached = false
  let cursor = 0
  const queued: Output[] = []
  const writeAt = ({ offset, data }: Output) => {
    const skip = Math.max(0, cursor - offset)
    if (skip >= data.length) return
    term.write(data.slice(skip))
    cursor = offset + data.length
  }
  return {
    data: (event: Output) => { if (attached) writeAt(event); else queued.push(event) },
    attach: (buffer: Output) => {
      writeAt(buffer)
      queued.sort((a, b) => a.offset - b.offset).forEach(writeAt)
      queued.length = 0
      attached = true
    }
  }
}

export function attachTerminalSession({ rpc, term, sessionId, sendSize }: {
  rpc: RpcConnection
  term: Pick<Terminal, 'write'>
  sessionId: string
  sendSize: () => void
}) {
  let disposed = false
  const output = bufferedOutput(term)
  const stopData = rpc.on('sessions.data', (event) => {
    if (event.sessionId === sessionId && !disposed) output.data(event)
  })
  const stopExit = rpc.on('sessions.exit', (event) => {
    if (event.sessionId === sessionId && !disposed) term.write(t('SessionTerminal.2mProcessExitedCode0m', { value1: event.exitCode }))
  })
  void rpc.call('sessions.attach', { sessionId }).then(({ buffer, bufferStart, exited }) => {
    if (disposed) return
    output.attach({ offset: bufferStart, data: buffer })
    if (exited) term.write(t('SessionTerminal.2mSessionEnded0m'))
    else sendSize()
  }).catch((error: unknown) => {
    term.write(t('SessionTerminal.cannotConnectToSession', { value1: error instanceof Error ? error.message : String(error) }))
  })
  return () => {
    disposed = true
    stopData()
    stopExit()
    void rpc.call('sessions.detach', { sessionId }).catch(ignore)
  }
}
