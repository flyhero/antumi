import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { constants, zstdCompressSync } from 'node:zlib'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { readZstdLines } from './zstd-transcripts'

let dir: string
let file: string
beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), 'antumi-frames-')); file = path.join(dir, 'session.zstd') })
afterEach(() => rmSync(dir, { recursive: true, force: true }))
it('reads concatenated checksummed frames and UTF-8 split across frames', async () => {
  const bytes = Buffer.from('第一条\n第二条\n')
  const compressed = (part: Uint8Array) => zstdCompressSync(part, { params: { [constants.ZSTD_c_checksumFlag]: 1 } })
  writeFileSync(file, Buffer.concat([compressed(bytes.subarray(0, 2)), compressed(bytes.subarray(2, 12)), compressed(bytes.subarray(12))]))
  const lines: string[] = []
  await readZstdLines(file, (line) => { lines.push(line); return true }, Infinity)
  expect(lines).toEqual(['第一条', '第二条'])
})
it('handles multiple blocks and stops at the summary byte limit', async () => {
  const long = Array.from({ length: 100_000 }, (_, index) => `row ${index}`).join('\n') + '\n'
  writeFileSync(file, zstdCompressSync(long))
  const lines: string[] = []
  await readZstdLines(file, (line) => { lines.push(line); return true }, Infinity)
  expect(lines).toHaveLength(100_000)
  const first: string[] = []
  await readZstdLines(file, (line) => { first.push(line); return true }, 6)
  expect(first).toEqual(['row 0'])
})
it('rejects a torn frame instead of silently dropping committed history', async () => {
  const frame = zstdCompressSync('one\ntwo\n')
  writeFileSync(file, frame.subarray(0, frame.length - 1))
  await expect(readZstdLines(file, () => true, Infinity)).rejects.toThrow('truncated')
})
