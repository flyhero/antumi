// Uses an explicit CLI, a temporary DSH home and a local fake provider. No account or model calls.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, writeFile, readFile, access, symlink, rm, realpath } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { dshCommand } from '../packages/core/src/agents/dsh/dsh-command.ts'
import { dshOverlay } from '../packages/core/src/agents/dsh/dsh-cli.ts'

const cli = process.argv[process.argv.indexOf('--dsh') + 1]
if (!process.argv.includes('--dsh') || !cli) throw new Error('Pass --dsh /absolute/path/to/@deepseek-ai/dsh/lib/bin.js')
const source = fileURLToPath(new URL('../', import.meta.url))
const scratch = await mkdtemp(path.join(tmpdir(), 'antumi-dsh-smoke-'))
await mkdir(path.join(source, 'work'), { recursive: true })
const projects = await mkdtemp(path.join(source, 'work', 'dsh-smoke-'))
const main = path.join(projects, 'main'), extra = path.join(projects, 'extra'), outside = path.join(projects, 'outside')
for (const dir of [main, extra, outside]) await mkdir(dir)
const profile = path.join(scratch, 'profiles', 'antumi')
await mkdir(path.join(profile, 'node_modules', '@antumi'), { recursive: true })
await mkdir(path.join(profile, 'node_modules', '@deepseek-ai'), { recursive: true })
const runtime = path.join(scratch, 'runtime')
await mkdir(runtime)
execFileSync(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xzf', path.join(source, 'packages/dsh-runtime/dist/runtime.tgz'), '-C', runtime])
const link = (from, to) => symlink(from, to, process.platform === 'win32' ? 'junction' : 'dir')
await link(path.join(source, 'packages/dsh-runtime/node_modules'), path.join(runtime, 'package', 'node_modules'))
await link(path.join(runtime, 'package'), path.join(profile, 'node_modules', '@antumi', 'dsh-runtime'))
const requireCli = createRequire(await realpath(cli))
await link(path.dirname(requireCli.resolve('@deepseek-ai/dsh-base/package.json')), path.join(profile, 'node_modules', '@deepseek-ai', 'dsh-base'))
await writeFile(path.join(profile, 'package.json'), JSON.stringify({ name: 'dsh-profile-antumi', private: true, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@antumi/dsh-runtime'] } } }))
const overlay = path.join(scratch, 'overlay.yml')
await writeFile(overlay, dshOverlay(true))
const mcp = path.join(scratch, 'mcp.mjs')
await writeFile(mcp, `import { createInterface } from 'node:readline'
createInterface({input:process.stdin}).on('line', line => {
  const frame = JSON.parse(line)
  if (frame.id === undefined) return
  const result = frame.method === 'initialize'
    ? {protocolVersion:frame.params.protocolVersion,serverInfo:{name:'smoke',version:'1'},capabilities:{tools:{}}}
    : frame.method === 'tools/list'
      ? {tools:['echo','user_todo_list'].map(name=>({name,description:'Isolated MCP probe',inputSchema:{type:'object',properties:{}},annotations:{readOnlyHint:true}}))}
      : {content:[{type:'text',text:JSON.stringify({keyPresent:Boolean(process.env.ANTUMI_MODEL_PROVIDER_KEY)})}]}
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:frame.id,result})+'\\n')
})
`)

let actions = [], wire = 'openai-chat', call = 0, admitted
const key = 'fake-dsh-smoke-key'
const server = createServer(async (req, res) => {
  let body = ''
  for await (const bytes of req) body += bytes
  const request = JSON.parse(body)
  const action = actions.shift() ?? { text: 'done' }
  admitted?.()
  admitted = undefined
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.flushHeaders()
  const emit = (event, value) => res.write(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(value)}\n\n`)
  const id = `smoke-${++call}`
  if (action.hang) return
  if (wire === 'anthropic') {
    assert.equal(req.headers.authorization, `Bearer ${key}`)
    emit('message_start', { type: 'message_start', message: { id, type: 'message', role: 'assistant', model: request.model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })
    emit('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
    emit('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'done' } })
    emit('content_block_stop', { type: 'content_block_stop', index: 0 })
    emit('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } })
    emit('message_stop', { type: 'message_stop' })
  } else if (wire === 'openai-responses') {
    assert.equal(req.headers.authorization, `Bearer ${key}`)
    const response = { id, object: 'response', status: 'in_progress', model: request.model, output: [] }
    const item = { id: `msg-${id}`, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'done', annotations: [] }] }
    emit('response.created', { type: 'response.created', response })
    emit('response.output_item.added', { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } })
    emit('response.content_part.added', { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } })
    emit('response.output_text.delta', { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'done' })
    emit('response.output_item.done', { type: 'response.output_item.done', output_index: 0, item })
    emit('response.completed', { type: 'response.completed', response: { ...response, status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 } } })
  } else {
    assert.equal(req.headers.authorization, `Bearer ${key}`)
    const delta = action.tool ? { role: 'assistant', tool_calls: [{ index: 0, id, type: 'function', function: { name: action.tool, arguments: JSON.stringify(action.args) } }] } : { role: 'assistant', content: action.text ?? 'done' }
    emit(null, { id, object: 'chat.completion.chunk', created: 0, model: request.model, choices: [{ index: 0, delta, finish_reason: null }] })
    emit(null, { id, object: 'chat.completion.chunk', created: 0, model: request.model, choices: [{ index: 0, delta: {}, finish_reason: action.tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } })
    res.write('data: [DONE]\n\n')
  }
  res.end()
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') throw new Error('No fake provider port')
const baseUrl = `http://127.0.0.1:${address.port}/v1`
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/KEY|PASSWORD|SECRET|TOKEN|^DSH_|^ANTUMI_/i.test(name)))
const children = new Set()

function start(lock = false) {
  const provider = { providerId: 'smoke', endpoint: { wire, baseUrl, anthropic: wire === 'anthropic' ? { baseUrl, auth: 'auth_token', env: {} } : null }, defaultModel: 'test', smallModel: 'test', apiKey: key, headers: {}, models: [{ id: 'test', label: 'Smoke', contextWindow: 32000, maxOutput: 4096, efforts: [] }] }
  const launch = dshCommand({ providerSessionId: null, resume: false, handoffPath: null, extraProjects: [extra], provider, allowBypass: true, ...(lock ? { readOnly: { dirs: [main, extra] } } : {}) })
  const child = spawn(process.execPath, [cli, ...launch.args, '--patch', overlay], { cwd: main, env: { ...cleanEnv, ...launch.env, DSH_HOME: scratch, DSH_TELEMETRY_DISABLED: '1' }, stdio: ['pipe', 'pipe', 'pipe'] })
  children.add(child)
  let serial = 0, stderr = ''
  const waiting = new Map(), updates = []
  const write = (frame) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...frame })}\n`)
  const request = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; waiting.set(id, { resolve, reject }); write({ id, method, params }) })
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-10000) })
  child.on('exit', (code) => { children.delete(child); for (const pending of waiting.values()) pending.reject(new Error(`DSH exited ${code}: ${stderr}`)) })
  createInterface({ input: child.stdout }).on('line', (line) => {
    const frame = JSON.parse(line)
    const pending = waiting.get(frame.id)
    if (pending) { waiting.delete(frame.id); frame.error ? pending.reject(new Error(JSON.stringify(frame.error))) : pending.resolve(frame.result) }
    else if (frame.method === 'session/update') updates.push(frame.params.update)
    else if (frame.method === '_antumi/plan') void request('session/set_mode', { sessionId: frame.params.sessionId, modeId: 'acceptEdits' }).then(() => write({ id: frame.id, result: { outcome: { outcome: 'accepted' } } }))
    else if (frame.method === '_antumi/question') write({ id: frame.id, result: { outcome: { outcome: 'answered', answers: frame.params.questions.map((question) => ({ questionId: question.id, selectedOptionIds: [question.options[0]?.id ?? 'continue'] })) } } })
    else if (frame.method === 'session/request_permission') write({ id: frame.id, result: { outcome: { outcome: 'selected', optionId: frame.params.options.find((option) => option.kind === 'reject_once')?.optionId } } })
  })
  return {
    request, write, updates,
    async stop() { child.stdin.end(); const timer = setTimeout(() => child.kill('SIGTERM'), 2000); try { if (child.exitCode === null) await once(child, 'exit') } finally { clearTimeout(timer) } }
  }
}

const absent = async (file) => assert.equal(await access(file).then(() => true, () => false), false)
async function opened(client, resume) {
  const init = await client.request('initialize', { protocolVersion: 1, clientCapabilities: { fs: {}, terminal: false } })
  assert.equal(init._meta.antumiDshRuntime, 1)
  const session = await client.request(resume ? 'session/resume' : 'session/new', { cwd: main, mcpServers: ['antumi', 'probe'].map((name) => ({ name, command: process.execPath, args: [mcp], env: [] })), ...(resume ? { sessionId: resume } : {}) })
  return session.sessionId ?? resume
}
async function prompt(client, sessionId, prescribed) {
  actions = [...prescribed, { text: 'done' }]
  client.updates.length = 0
  const result = await client.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'Run this isolated smoke test.' }] })
  assert.equal(result.stopReason, 'end_turn')
  return result
}
const deadline = setTimeout(() => { for (const child of children) child.kill('SIGTERM') }, 60000)
try {
  const client = start()
  const session = await opened(client)
  await client.request('session/set_mode', { sessionId: session, modeId: 'acceptEdits' })
  await prompt(client, session, [{ tool: 'mcp__probe__echo', args: {} }])
  assert(client.updates.some((update) => update.content?.some((entry) => entry.content?.text?.includes('"keyPresent":false'))))
  await prompt(client, session, [{ tool: 'write', args: { file_path: path.join(extra, 'allowed'), content: 'allowed' } }])
  assert.equal(await readFile(path.join(extra, 'allowed'), 'utf8'), 'allowed')
  await prompt(client, session, [{ tool: 'write', args: { file_path: path.join(outside, 'denied'), content: 'denied' } }])
  await absent(path.join(outside, 'denied'))
  await client.request('session/set_mode', { sessionId: session, modeId: 'plan' })
  await prompt(client, session, [{ tool: 'mcp__antumi__user_todo_list', args: {} }])
  assert(client.updates.some((update) => update.status === 'completed'))
  await prompt(client, session, [{ tool: 'write', args: { file_path: path.join(extra, 'planned'), content: 'denied' } }])
  await absent(path.join(extra, 'planned'))
  await prompt(client, session, [{ tool: 'exit_plan_mode', args: { plan: '# Test plan\nWrite one file.' } }, { tool: 'write', args: { file_path: path.join(extra, 'approved'), content: 'approved' } }])
  assert.equal(await readFile(path.join(extra, 'approved'), 'utf8'), 'approved')
  await prompt(client, session, [{ tool: 'ask_user_question', args: { questions: [{ id: 'q', question: 'Continue?', options: [{ label: 'Continue' }] }] } }])
  await prompt(client, session, [{ tool: 'bash', args: { description: 'Write in the extra project', command: 'echo shell-ok > shell.txt', workdir: extra } }])
  assert.equal((await readFile(path.join(extra, 'shell.txt'), 'utf8')).trim(), 'shell-ok')
  await prompt(client, session, [{ tool: 'bash', args: { description: 'Check provider key isolation', command: 'printf "%s" "$ANTUMI_MODEL_PROVIDER_KEY"' } }])
  assert(!JSON.stringify(client.updates).includes(key))
  const started = new Promise((resolve) => { admitted = resolve })
  actions = [{ hang: true }]
  const cancelled = client.request('session/prompt', { sessionId: session, prompt: [{ type: 'text', text: 'Wait for cancellation.' }] })
  await started
  client.write({ method: 'session/cancel', params: { sessionId: session } })
  assert.equal((await cancelled).stopReason, 'cancelled')
  await client.request('session/close', { sessionId: session })
  await client.stop()
  const restored = start(true)
  await opened(restored, session)
  await assert.rejects(restored.request('session/set_mode', { sessionId: session, modeId: 'bypass' }))
  await prompt(restored, session, [{ tool: 'write', args: { file_path: path.join(extra, 'resumed'), content: 'denied' } }])
  await absent(path.join(extra, 'resumed'))
  await restored.stop()
  console.log('PASS Chat: MCP coexistence and key isolation, extra project edits and shell, outside denial, plan approval, questions, cancel, read-only resume')
  for (const protocol of ['openai-responses', 'anthropic']) {
    wire = protocol
    const other = start()
    const id = await opened(other)
    await prompt(other, id, [])
    assert(other.updates.some((update) => update.sessionUpdate === 'agent_message_chunk' && update.content?.text === 'done'))
    await other.stop()
    console.log(`PASS ${protocol}: real adapter, local endpoint and credentials`)
  }
} finally {
  clearTimeout(deadline)
  for (const child of children) child.kill('SIGTERM')
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  await rm(scratch, { recursive: true, force: true })
  await rm(projects, { recursive: true, force: true })
}
