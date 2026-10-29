import { mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_BROWSER_UPLOAD_BYTES } from '@antumi/protocol'
import { browserUploadFiles } from './browser-upload'

describe('browser upload files', () => {
  let directory: string
  beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'antumi-upload-')) })
  afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

  it('transfers binary bytes, names and MIME types without exposing filesystem paths to the host', async () => {
    const file = path.join(directory, '报告.PDF')
    const bytes = Buffer.from([0, 255, 1, 2])
    await writeFile(file, bytes)
    await writeFile(path.join(directory, 'empty.txt'), '')
    expect(await browserUploadFiles([file, path.join(directory, 'empty.txt')])).toEqual([{ name: '报告.PDF', mimeType: 'application/pdf', data: bytes.toString('base64') }, { name: 'empty.txt', mimeType: 'text/plain', data: '' }])
  })

  it('refuses relative, missing and non-file inputs', async () => {
    await expect(browserUploadFiles(['relative.txt'])).rejects.toMatchObject({ reason: 'browser-upload-file' })
    await expect(browserUploadFiles([path.join(directory, 'missing')])).rejects.toMatchObject({ reason: 'browser-upload-file' })
    await expect(browserUploadFiles([directory])).rejects.toMatchObject({ reason: 'browser-upload-file' })
  })

  it('limits aggregate bytes rather than just the size of each file', async () => {
    const file = path.join(directory, 'large.bin')
    const handle = await open(file, 'w')
    await handle.truncate(MAX_BROWSER_UPLOAD_BYTES + 1)
    await handle.close()
    await expect(browserUploadFiles([file])).rejects.toMatchObject({ reason: 'browser-upload-too-large' })
    const smaller = await open(file, 'w')
    await smaller.truncate(MAX_BROWSER_UPLOAD_BYTES / 2 + 1)
    await smaller.close()
    await expect(browserUploadFiles([file, file])).rejects.toMatchObject({ reason: 'browser-upload-too-large' })
  })
})
