// Exercise an installed runtime tarball, just as Antumi does on first use.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { dshOverlay } from '../packages/core/src/agents/dsh/dsh-cli.ts'
import { dshCommand } from '../packages/core/src/agents/dsh/dsh-command.ts'

const cli = process.argv[2]
assert(cli, 'Pass the absolute path to @deepseek-ai/dsh/lib/bin.js')
const bundle = fileURLToPath(new URL('../packages/dsh-runtime/dist/runtime.tgz', import.meta.url))
const home = await mkdtemp(path.join(tmpdir(), 'antumi-dsh-catalog-'))
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|PASSWORD|SECRET|TOKEN|^DSH_|^ANTUMI_/i.test(key)))
const env = { ...cleanEnv, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', ANTUMI_CATALOG_FIXTURE_KEY: 'fixture' }
const nativeModel = 'native-fixture-model'
const routedModel = 'routed-fixture-model'
const nativeValue = JSON.stringify(['native-fixture', nativeModel])

async function check(label, args, route) {
  const launch = dshCommand({ providerSessionId: null, resume: false, handoffPath: null, extraProjects: [], provider: route })
  const child = spawn(process.execPath, [cli, ...launch.args, ...args], { cwd: home, env: { ...env, ...launch.env }, stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = ''
  let serial = 0
  const requests = new Map()
  const closed = once(child, 'close')
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-16000) })
  child.stdin.on('error', () => {})
  child.on('close', (code) => {
    for (const { reject } of requests.values()) reject(new Error(`${label}: DSH exited ${code}\n${stderr}`))
  })
  const lines = createInterface({ input: child.stdout })
  lines.on('line', (line) => {
    if (!line.startsWith('{')) return
    const reply = JSON.parse(line)
    const request = requests.get(reply.id)
    if (!request) return
    requests.delete(reply.id)
    if (reply.error) request.reject(new Error(`${label}: ${JSON.stringify(reply.error)}`))
    else request.resolve(reply.result)
  })
  const ask = (method, params) => new Promise((resolve, reject) => {
    const id = ++serial
    requests.set(id, { resolve, reject })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
  const deadline = setTimeout(() => child.kill(), 30_000)
  try {
    const init = await ask('initialize', { protocolVersion: 1, clientCapabilities: {} })
    assert.equal(init._meta?.antumiDshRuntime, 1, label)
    const catalog = await ask('_antumi/models', {})
    const values = catalog.models.map((model) => model.value)
    assert(values.includes(route ? JSON.stringify(['antumi-fixture', routedModel]) : nativeValue), `${label}: expected model missing from the catalog`)
    if (route) assert(!values.includes(nativeValue), `${label}: native provider should not leak into the routed catalog`)
    if (args.length) {
      const session = await ask('session/new', { cwd: home, mcpServers: [] })
      assert(session.sessionId, `${label}: native session not opened`)
    }
    console.log(`PASS ${label}`)
  } finally {
    clearTimeout(deadline)
    child.kill()
    await closed
  }
}

try {
  execFileSync(process.execPath, [cli, 'plugin', '--profile', 'antumi', 'add', bundle], { cwd: home, env, stdio: 'inherit', timeout: 180_000 })
  // A profile-local provider, with a fake key and an endpoint that is never called.
  await writeFile(path.join(home, 'profiles', 'antumi', 'cordis.patch.yml'), JSON.stringify([
    { id: 'llm-pi-ai', config: { providers: { 'native-fixture': {
      api: 'openai-completions', apiKeyEnv: 'ANTUMI_CATALOG_FIXTURE_KEY', baseURL: 'http://127.0.0.1:1/v1',
      models: [{ id: nativeModel, name: 'Native Fixture Model', input: ['text'], contextWindow: 16_000, maxTokens: 2048 }]
    } } } }
  ]))
  const overlay = path.join(home, 'stage.yml')
  await check('catalog from a clean installed profile', [])
  await writeFile(overlay, dshOverlay(false))
  await check('native session with the Antumi overlay', ['--patch', overlay])
  await writeFile(overlay, dshOverlay(true))
  await check('session routed through an Antumi provider', ['--patch', overlay], {
    providerId: 'fixture', endpoint: { wire: 'openai-chat', baseUrl: 'http://127.0.0.1:1/v1', anthropic: null },
    defaultModel: routedModel, smallModel: routedModel, apiKey: 'fixture', headers: {},
    models: [{ id: routedModel, label: 'Routed Fixture Model', efforts: [] }]
  })
} finally {
  await rm(home, { recursive: true, force: true })
}
