import { createServer, type Server, type Socket } from 'node:net'

// The built-in browser connects through the server using a local SOCKS5 proxy, as Orca does.
// Chromium only needs CONNECT without authentication. The forwarded address keeps its original
// hostname so the server resolves it, including `localhost`.

export type SocksEntry = { port: number; close(): void }

// Where each connection goes once its address is known; the socket then carries only its bytes.
export type SocksConnect = (host: string, port: number, socket: Socket) => void

const VERSION = 5
const NO_AUTH = 0
const NO_ACCEPTABLE = 0xff
const CONNECT = 1
const ATYP = { ipv4: 1, domain: 3, ipv6: 4 } as const
const REPLY = { ok: 0, failure: 1, commandUnsupported: 7, addressUnsupported: 8 } as const
// A handshake that has not finished by now is abandoned.
const HANDSHAKE_MS = 10_000

function reply(code: number): Buffer {
  return Buffer.from([VERSION, code, 0, ATYP.ipv4, 0, 0, 0, 0, 0, 0])
}

function ipv6(bytes: Buffer): string {
  const groups: string[] = []
  for (let at = 0; at < 16; at += 2) groups.push(bytes.readUInt16BE(at).toString(16))
  return groups.join(':')
}

// The request's address once all of it has arrived: what is read, and how many bytes it took;
// null while more is due; a reply code when it cannot be served.
export function parseRequest(buffer: Buffer): { host: string; port: number; length: number } | number | null {
  if (buffer.length < 5) return null
  if (buffer[0] !== VERSION) return REPLY.failure
  if (buffer[1] !== CONNECT) return REPLY.commandUnsupported
  const type = buffer[3]
  const start = 4
  let host: string
  let end: number
  if (type === ATYP.ipv4) {
    end = start + 4
    if (buffer.length < end + 2) return null
    host = [...buffer.subarray(start, end)].join('.')
  } else if (type === ATYP.domain) {
    const size = buffer[start] ?? 0
    end = start + 1 + size
    if (buffer.length < end + 2) return null
    host = buffer.subarray(start + 1, end).toString('utf8')
  } else if (type === ATYP.ipv6) {
    end = start + 16
    if (buffer.length < end + 2) return null
    host = ipv6(buffer.subarray(start, end))
  } else {
    return REPLY.addressUnsupported
  }
  return host ? { host, port: buffer.readUInt16BE(end), length: end + 2 } : REPLY.addressUnsupported
}

function handshake(socket: Socket, connect: SocksConnect): void {
  let buffer: Buffer = Buffer.alloc(0)
  let greeted = false
  const timer = setTimeout(() => socket.destroy(), HANDSHAKE_MS)
  const fail = (code: number) => {
    clearTimeout(timer)
    socket.off('data', onData)
    socket.end(code === NO_ACCEPTABLE ? Buffer.from([VERSION, NO_ACCEPTABLE]) : reply(code))
  }
  const onData = (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    if (!greeted) {
      if (buffer.length < 2) return
      if (buffer[0] !== VERSION) return fail(REPLY.failure)
      const methods = buffer[1] ?? 0
      if (buffer.length < 2 + methods) return
      if (!buffer.subarray(2, 2 + methods).includes(NO_AUTH)) return fail(NO_ACCEPTABLE)
      greeted = true
      buffer = buffer.subarray(2 + methods)
      socket.write(Buffer.from([VERSION, NO_AUTH]))
    }
    const request = parseRequest(buffer)
    if (request === null) return
    if (typeof request === 'number') return fail(request)
    clearTimeout(timer)
    // Handed over in this same turn, so no byte is read with nobody listening.
    socket.off('data', onData)
    // Said at once: the stream to the server carries no answer of its own, and a connection it
    // could not make there is reset, which the browser reports as it would a refused one.
    socket.write(reply(REPLY.ok))
    const rest = buffer.subarray(request.length)
    if (rest.length > 0) socket.unshift(rest)
    connect(request.host, request.port, socket)
  }
  socket.on('data', onData)
  socket.on('error', () => clearTimeout(timer))
}

export function startSocksEntry(connect: SocksConnect): Promise<SocksEntry> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer({ allowHalfOpen: true }, (socket) => handshake(socket, connect))
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') return reject(new Error('socks entry has no port'))
      resolve({ port: address.port, close: () => server.close() })
    })
  })
}
