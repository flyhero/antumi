import { writeSync } from 'node:fs'
import { ChannelGateway } from './channel-gateway'
import { CoreToChannelGateway } from './channel-gateway-ipc'

// The channel gateway as core's child process (channel-service.ts starts it). Everything it knows
// comes from core over IPC, the platforms' credentials too, and it has nothing of core's to lose:
// no token, no address. When the IPC channel goes, core is gone and so is it.

const gateway = new ChannelGateway((message) => { process.send?.(message) })

process.on('disconnect', () => process.exit(0))

function fatal(origin: string): never {
  // Core restarts the gateway. Keep raw SDK errors out of the parent log.
  writeSync(2, `[channel-gateway] uncaught failure (${origin}); exiting\n`)
  process.exit(1)
}

process.on('uncaughtException', (_error, origin) => fatal(origin))
process.on('unhandledRejection', () => fatal('unhandledRejection'))

process.on('message', (raw) => {
  const parsed = CoreToChannelGateway.safeParse(raw)
  if (parsed.success) gateway.handle(parsed.data)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    gateway.stop()
    process.exit(0)
  })
}
