import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PluginProcess, pluginEnvironment, stderrLines } from './plugin-process'
import { pluginFixture } from './plugin-fixtures'

describe('plugin process boundary', () => {
  let directory: string
  beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), 'antumi-plugin-process-')) })
  afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

  it('keeps multiple login prompts in one process and starts the next operation separately', async () => {
    const manifest = await pluginFixture(directory)
    const runtime = new PluginProcess(manifest, path.join(directory, 'main.mjs'))
    const pids: string[] = []
    const notices: string[] = []
    const session = { prompt: async (prompt: { label: string }) => { pids.push(prompt.label); return String(pids.length) }, notify: (notice: { message: string }) => { notices.push(notice.message) } }
    const result = await runtime.call('login', { source: 'demo', settings: {} }, undefined, session)
    expect(result.credential.payload.token).toBe('1:2')
    expect(pids[0]).toBe(pids[1])
    expect(notices).toEqual(['Signing in'])
    await runtime.call('login', { source: 'demo', settings: {} }, undefined, session)
    expect(pids[2]).not.toBe(pids[0])
    expect(pids[2]).toBe(pids[3])
    runtime.stop()
    await expect(runtime.call('normalizeKey', { source: 'demo', key: '1' })).rejects.toThrow('已停止')
  })

  it('passes only declared variables, PATH and the host-controlled Node mode', async () => {
    const manifest = await pluginFixture(directory, { env: ['PLUGIN_TOKEN'], behavior: { mode: 'environment' } })
    const runtime = new PluginProcess(manifest, path.join(directory, 'main.mjs'), { PATH: '/test', PLUGIN_TOKEN: 'allowed', AWS_SECRET_ACCESS_KEY: 'hidden' })
    const env = JSON.parse(await runtime.call('normalizeKey', { source: 'demo', key: 'env' }))
    expect(env.PLUGIN_TOKEN).toBe('allowed')
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(() => pluginEnvironment(['NODE_OPTIONS'], {})).toThrow()
    expect(() => pluginEnvironment(['ELECTRON_RUN_AS_NODE'], {})).toThrow()
  })

  it.each(['crash', 'invalid', 'oversize', 'callback'])('rejects %s instead of leaving a call pending', async (mode) => {
    const manifest = await pluginFixture(directory, { behavior: { mode } })
    const runtime = new PluginProcess(manifest, path.join(directory, 'main.mjs'))
    await expect(runtime.call('normalizeKey', { source: 'demo', key: '1' })).rejects.toBeInstanceOf(Error)
  })

  it("logs the plugin's stderr line by line, and asks for the text alone when told to", async () => {
    const manifest = await pluginFixture(directory, { behavior: { stderr: '[demo] image a.png not fetched: timeout\n\u001b[31mred\u001b[0m\nlast without newline' } })
    const logged: string[] = []
    const runtime = new PluginProcess(manifest, path.join(directory, 'main.mjs'), process.env, (line) => logged.push(line))
    const [provider] = await runtime.providers()
    const detail = await provider!.fetch({}, { kind: 'token', payload: {} }, 'DEMO-1', AbortSignal.timeout(10_000), { images: false })
    expect(detail.imagesDeferred).toBe(1)
    expect((await provider!.fetch({}, { kind: 'token', payload: {} }, 'DEMO-1', AbortSignal.timeout(10_000))).imagesDeferred).toBeUndefined()
    expect(logged).toContain('[demo] image a.png not fetched: timeout')
    expect(logged).toContain('[31mred[0m')
    expect(logged).toContain('last without newline')
  })

  it('caps what one call can put in the log', () => {
    const logged: string[] = []
    const lines = stderrLines((line) => logged.push(line), 2)
    lines.write(Buffer.from(`one\n${'x'.repeat(600)}\nthree\nfour\n`))
    lines.end()
    expect(logged).toEqual(['one', `${'x'.repeat(500)}…`, '…（后面的输出没有记录）'])
  })

  it('rejects incompatible handshakes', async () => {
    const manifest = await pluginFixture(directory, { behavior: { badHandshake: true } })
    await expect(new PluginProcess(manifest, path.join(directory, 'main.mjs')).providers()).rejects.toThrow('协议')
  })

  it('terminates a process that ignores cancellation', async () => {
    const manifest = await pluginFixture(directory, { behavior: { mode: 'hang' } })
    const runtime = new PluginProcess(manifest, path.join(directory, 'main.mjs'))
    await expect(runtime.call('normalizeKey', { source: 'demo', key: '1' }, AbortSignal.timeout(500))).rejects.toThrow('取消或超时')
  })
})
