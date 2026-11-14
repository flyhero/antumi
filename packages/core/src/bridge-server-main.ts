import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { BRIDGE_DEFAULT_PORT } from './bridge-protocol'
import { BridgeServer, type BridgeRecord } from './bridge-server'

// The bridge as a program of its own, on the user's server: node bridge-server.mjs --port 7830
// --data /var/lib/antumi-bridge. The install script (bridge-install.ts) runs it under systemd.

const EXPIRE_MS = 180 * 86_400_000

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const port = Number(argument('port') ?? BRIDGE_DEFAULT_PORT)
const data = argument('data') ?? process.env.STATE_DIRECTORY ?? path.resolve('antumi-bridge-data')
const file = path.join(data, 'computers.json')
mkdirSync(data, { recursive: true })

let records: Record<string, BridgeRecord> = {}
try {
  const saved: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (saved && typeof saved === 'object') records = Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, BridgeRecord] => isRecord(entry[1])))
} catch {
  // None yet.
}
// A computer not seen for half a year is forgotten; it is taken as new if it comes back.
records = Object.fromEntries(Object.entries(records).filter(([, record]) => Date.now() - record.seenAt < EXPIRE_MS))

function isRecord(value: unknown): value is BridgeRecord {
  return typeof value === 'object' && value !== null && 'hash' in value && typeof value.hash === 'string' && 'seenAt' in value && typeof value.seenAt === 'number'
}

const persist = (next: Record<string, BridgeRecord>) => {
  writeFileSync(`${file}.partial`, JSON.stringify(next), { mode: 0o600 })
  renameSync(`${file}.partial`, file)
}
persist(records)

const server = new BridgeServer({ port, records, persist })
server.start().then((listening) => console.log(`[antumi-bridge] listening on ${listening}`), (error: unknown) => {
  console.error('[antumi-bridge] could not start:', error)
  process.exit(1)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void server.stop().finally(() => process.exit(0)))
}
