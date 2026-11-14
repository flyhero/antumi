import { spawn } from 'node:child_process'
import { z } from 'zod'
import type { ChatCatalog, ChatItem } from '@antumi/protocol'
import { createLineDecoder, planLaunch } from '@antumi/protocol/node'
import type { AgentCommand } from './agent-command'
import type { ChatDriver } from './chat-driver'

const PROBE_TIMEOUT_MS = 20_000
// Frames a probe has no use for: a thread, which Codex keeps in its history, and the skills a
// chat offers as commands.
const SKIPPED_METHODS: ReadonlySet<string> = new Set(['thread/start', 'thread/resume', 'skills/list'])

const Request = z.union([
  z.looseObject({ type: z.literal('control_request'), request_id: z.string() }).transform((frame) => frame.request_id),
  z.looseObject({ id: z.union([z.string(), z.number()]), method: z.string() }).transform((frame) => String(frame.id))
])
const Answer = z.union([
  z.looseObject({ type: z.literal('control_response'), response: z.looseObject({ request_id: z.string() }) }).transform((frame) => frame.response.request_id),
  // A Codex answer has no method; a request from it does.
  z.looseObject({ id: z.union([z.string(), z.number()]), method: z.undefined().optional() }).transform((frame) => String(frame.id))
])

export function catalogOf(items: readonly ChatItem[]): ChatCatalog | null {
  const state = items.findLast((item) => item.kind === 'state')
  const models = state?.kind === 'state' ? state.models.filter((model) => !model.unlisted) : []
  return models.length > 0 ? { models } : null
}

// Runs the agent's chat protocol only as far as it lists its models, then lets it go. A probe,
// not a session: nothing is sent to the model and nothing needs to outlive core, so it runs here
// rather than in the daemon, as `claude --version` does.
export function probeChatCatalog(driver: ChatDriver, command: AgentCommand, cwd: string): Promise<ChatCatalog | null> {
  return new Promise((resolve) => {
    let launch
    try {
      launch = planLaunch(command.command, command.args, cwd, { ...process.env, ...command.env })
    } catch {
      return resolve(null)
    }
    const child = spawn(launch.file, launch.args, { cwd, env: launch.env, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
    const waiting = new Set<string>()
    let settled = false
    let closed = false
    const finish = (catalog: ChatCatalog | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (closed || child.pid === undefined) { resolve(catalog); return }
      const force = setTimeout(() => child.kill('SIGKILL'), 2000)
      child.once('close', () => { clearTimeout(force); resolve(catalog) })
      child.kill()
    }
    const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS)
    const write = () => {
      for (const frame of driver.due()) {
        const method = z.looseObject({ method: z.string() }).safeParse(frame)
        if (method.success && SKIPPED_METHODS.has(method.data.method)) continue
        driver.apply({ dir: 'out', at: Date.now(), frame })
        const id = Request.safeParse(frame)
        if (id.success) waiting.add(id.data)
        child.stdin.write(`${JSON.stringify(frame)}\n`)
      }
    }
    child.on('error', () => finish(null))
    child.on('close', () => { closed = true; finish(null) })
    child.stdin.on('error', () => finish(null))
    child.stdout.on('data', createLineDecoder((line) => {
      let frame: unknown
      try {
        frame = JSON.parse(line)
      } catch {
        return
      }
      const answered = Answer.safeParse(frame)
      if (answered.success) waiting.delete(answered.data)
      driver.apply({ dir: 'in', at: Date.now(), frame })
      write()
      // Done once every question asked has its answer, the default model and effort included.
      const catalog = catalogOf(driver.items.list())
      if (catalog && waiting.size === 0) finish(catalog)
    }))
    write()
  })
}
