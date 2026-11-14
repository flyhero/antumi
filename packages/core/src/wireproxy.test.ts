import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { lastHandshake, obtainWireproxy, tarEntry } from './wireproxy'

// A tar archive as `tar` writes one: a 512-byte header per file, the file padded to 512, two empty
// blocks at the end.
function tar(files: Record<string, string>): Uint8Array {
  const blocks: Buffer[] = []
  for (const [name, content] of Object.entries(files)) {
    const header = Buffer.alloc(512)
    header.write(name, 0, 'utf8')
    header.write(Buffer.byteLength(content).toString(8).padStart(11, '0') + '\0', 124, 'utf8')
    header.write('0', 156, 'utf8')
    blocks.push(header, Buffer.from(content), Buffer.alloc((512 - (Buffer.byteLength(content) % 512)) % 512))
  }
  blocks.push(Buffer.alloc(1024))
  return Buffer.concat(blocks)
}

describe('wireproxy', () => {
  const dirs: string[] = []
  const servers: Server[] = []
  const tempDir = () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'antumi-wireproxy-'))
    dirs.push(dir)
    return dir
  }
  afterEach(() => {
    dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }))
    servers.splice(0).forEach((server) => server.close())
  })

  it('takes one file out of a tar archive', () => {
    const archive = tar({ 'LICENSE': 'ISC', './wireproxy': 'program'.repeat(100) })
    expect(Buffer.from(tarEntry(archive, 'wireproxy') ?? []).toString()).toBe('program'.repeat(100))
    expect(tarEntry(archive, 'wireproxy.exe')).toBeNull()
  })

  it('says when there is no build for this system, and fetches nothing', async () => {
    let fetched = 0
    await expect(obtainWireproxy(tempDir(), { platform: 'freebsd', arch: 'x64', download: async () => (fetched++, new Uint8Array()) }))
      .rejects.toMatchObject({ reason: 'unsupported-platform' })
    expect(fetched).toBe(0)
  })

  it('refuses an archive that is not the one it knows, and keeps nothing of it', async () => {
    const dir = tempDir()
    let announced = false
    await expect(obtainWireproxy(dir, { platform: 'darwin', arch: 'arm64', download: async () => tar({ wireproxy: 'not it' }), downloading: () => (announced = true) }))
      .rejects.toMatchObject({ reason: 'download-failed' })
    expect(announced).toBe(true)
    expect(readdirSync(dir)).toEqual([])
    await expect(obtainWireproxy(dir, { platform: 'darwin', arch: 'arm64', download: async () => { throw new Error('offline') } }))
      .rejects.toMatchObject({ reason: 'download-failed', message: 'offline' })
  })

  it('uses the program it fetched before without fetching again', async () => {
    const dir = tempDir()
    writeFileSync(path.join(dir, 'wireproxy-v1.1.3.exe'), 'program')
    const found = await obtainWireproxy(dir, { platform: 'win32', arch: 'x64', download: async () => { throw new Error('should not fetch') } })
    expect(found).toBe(path.join(dir, 'wireproxy-v1.1.3.exe'))
    expect(existsSync(found)).toBe(true)
  })

  it('reads the latest handshake from the health endpoint, and none from a tunnel without one', async () => {
    let body = 'public_key=abc\nlast_handshake_time_sec=1794586879\nlast_handshake_time_nsec=643916000\ntx_bytes=3092\n'
    const server = createServer((_request, response) => response.end(body))
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    expect(await lastHandshake(port)).toBe(1794586879_000)
    body = 'last_handshake_time_sec=0\n'
    expect(await lastHandshake(port)).toBeNull()
    server.close()
    expect(await lastHandshake(port)).toBeNull()
  })
})
