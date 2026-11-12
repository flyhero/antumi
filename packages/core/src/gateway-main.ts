import { base64Url } from '@antumi/protocol'
import { keyPairFromPrivate } from '@antumi/protocol/mobile'
import { Gateway } from './gateway'
import { CoreToGateway, type GatewayToCore } from './gateway-ipc'

// The phone gateway as core's child process (mobile-service.ts starts it). Everything it knows
// comes from core over IPC; when that channel goes, core is gone and so is it, with no orphan
// left holding the port.

let gateway: Gateway | null = null

function send(message: GatewayToCore): void {
  process.send?.(message)
}

process.on('disconnect', () => process.exit(0))

process.on('message', (raw) => {
  const parsed = CoreToGateway.safeParse(raw)
  if (!parsed.success) return
  const message = parsed.data
  if (message.type === 'start') {
    if (gateway) return
    const { config } = message
    gateway = new Gateway({
      port: config.port,
      staticKey: keyPairFromPrivate(base64Url.decode(config.privateKey)),
      coreUrl: config.coreUrl,
      computerName: config.computerName,
      onPairing: (pairing) => send({ type: 'paired', ...pairing })
    })
    gateway.start().then((port) => send({ type: 'listening', port }), (error: unknown) => {
      const inUse = error instanceof Error && 'code' in error && error.code === 'EADDRINUSE'
      send({ type: 'failed', reason: inUse ? 'port-in-use' : 'error', message: error instanceof Error ? error.message : String(error) })
      setTimeout(() => process.exit(1), 100)
    })
  } else if (message.type === 'devices') gateway?.setDevices(message.devices)
  else if (message.type === 'pairing') gateway?.setPairing(message.pairing)
  else if (message.type === 'answer') gateway?.answerPairing(message.pairingId, message.answer)
  else if (message.type === 'hosts') gateway?.setHosts(message.hosts)
  else gateway?.revoke(message.deviceId)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void (gateway?.stop() ?? Promise.resolve()).finally(() => process.exit(0)))
}
