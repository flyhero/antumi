import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url)))
const behavior = JSON.parse(readFileSync(new URL('./behavior.json', import.meta.url)))
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
let loginId
let answers = []
const lines = createInterface({ input: process.stdin })
lines.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.type === 'answer') {
    answers.push(message.value)
    if (answers.length === 1) send({ type: 'prompt', id: 'second', prompt: { kind: 'secret', label: String(process.pid) } })
    else send({ type: 'result', id: loginId, result: { credential: { kind: 'token', payload: { token: answers.join(':') } }, account: 'Demo' } })
    return
  }
  const { id, method, params } = message
  if (method === 'handshake') {
    send({ type: 'result', id, result: { protocolVersion: behavior.badHandshake ? 999 : 1, id: manifest.id, version: manifest.version, sources: manifest.contributes.sources.map((source) => source.id) } })
    return
  }
  if (behavior.stderr) process.stderr.write(behavior.stderr)
  if (behavior.mode === 'crash') process.exit(2)
  if (behavior.mode === 'hang') return
  if (behavior.mode === 'invalid') { process.stdout.write('not JSON\n'); return }
  if (behavior.mode === 'oversize') { process.stdout.write('x'.repeat(9 * 1024 * 1024)); return }
  if (behavior.mode === 'callback') { send({ type: 'prompt', id: 'unauthorized', prompt: { kind: 'secret', label: 'Token' } }); return }
  if (method === 'login') {
    loginId = id
    send({ type: 'notify', notice: { message: 'Signing in' } })
    send({ type: 'prompt', id: 'first', prompt: { kind: 'secret', label: String(process.pid) } })
    return
  }
  const result = method === 'envCredential' ? null
    : method === 'normalizeSettings' ? behavior.changeSettings ? { query: 'changed' } : params.settings
    : method === 'normalizeKey' ? behavior.mode === 'environment' ? JSON.stringify(process.env) : params.key.trim()
    : method === 'list' ? []
    : { key: params.key, title: 'Demo', url: 'https://example.test/1', status: 'open', statusCategory: 'todo', type: 'Issue', priority: null, updatedAt: null, markdown: 'Snapshot' }
  send({ type: 'result', id, result })
})
