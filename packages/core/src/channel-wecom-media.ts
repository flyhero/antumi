import { lookup } from 'node:dns/promises'
import { get } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { decryptFile } from '@wecom/aibot-node-sdk'
import { MAX_ATTACHMENT_BYTES } from '@antumi/protocol'

const blocked = new BlockList()
for (const [ip, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 3]
] as const) blocked.addSubnet(ip, bits)
for (const [ip, bits] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]
] as const) blocked.addSubnet(ip, bits, 'ipv6')

const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')

export function publicMediaAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return !blocked.check(address)
  return family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6')
}

export async function fetchWecomPicture(rawUrl: string, key: string, stop: AbortSignal): Promise<Buffer> {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(url.hostname.replace(/^\[|\]$/g, ''))) throw new Error('invalid image address')
  if (Buffer.from(key, 'base64').length !== 32) throw new Error('invalid image key')
  const signal = AbortSignal.any([stop, AbortSignal.timeout(25_000)])
  const address = await new Promise<Awaited<ReturnType<typeof lookupAll>>[number]>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    void lookupAll(url.hostname).then((addresses) => {
      const allowed = addresses.find(({ address }) => publicMediaAddress(address))
      if (!allowed) throw new Error('image address is not public')
      resolve(allowed)
    }).catch(reject).finally(() => signal.removeEventListener('abort', abort))
  })
  const limit = MAX_ATTACHMENT_BYTES + 32
  const encrypted = await new Promise<Buffer>((resolve, reject) => {
    // Connect to the address we checked, while TLS still authenticates the URL hostname.
    const request = get(url, { agent: false, signal, family: address.family, lookup: (_host, _options, done) => done(null, address.address, address.family) }, (response) => {
      if (response.statusCode !== 200 || Number(response.headers['content-length']) > limit) {
        response.destroy()
        reject(new Error('image unavailable'))
        return
      }
      const chunks: Buffer[] = []
      let bytes = 0
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > limit) response.destroy(new Error('image too large'))
        else chunks.push(chunk)
      })
      response.on('end', () => resolve(Buffer.concat(chunks, bytes)))
      response.on('error', reject)
    })
    request.on('error', reject)
  })
  const decoded = decryptFile(encrypted, key)
  if (!decoded.length || decoded.length > MAX_ATTACHMENT_BYTES) throw new Error('invalid image size')
  return decoded
}

function lookupAll(hostname: string) {
  return lookup(hostname, { all: true })
}
