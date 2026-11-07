import { agentCliAccess } from './agent-cli-access'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { agentDescriptor, quickModel, type AgentKind, type ChatCatalog, type CostBaseline, type ModelMetering, type ProviderEndpoint } from '@antumi/protocol'
import { planLaunch } from '@antumi/protocol/node'
import type { QuickCommand } from './agents/agent-adapter'
import { adapterOf } from './agents'
import { Rejection } from './rejection'
import type { SmallModelStore } from './small-model-store'
import { askProvider } from './provider-request'

const TIMEOUT_MS = 120_000
// Opening an old conversation with translation on asks for many at once; a few run, the rest wait.
const AT_ONCE = 2

export type QuickTracking = { kind: 'translation' | 'commitMessage' | 'title' | 'pullRequest'; conversationId: string | null; baseline(): CostBaseline }
type QuickOutput = { stdout: string; error: Rejection | null }

// Where a small job for a conversation on a model provider goes: the provider, on its small model,
// whatever model the user picked for the agent's own small jobs. routeKey: ProviderRoute.key.
export type QuickProvider = { endpoint: ProviderEndpoint; apiKey: string; model: string; routeKey: string; headers?: Readonly<Record<string, string>> }

// A translation's answer is as long as the reply; a provider caps what it takes below this anyway.
const PROVIDER_MAX_TOKENS = 8192

export type QuickDeps = {
  catalog(agent: AgentKind): Promise<ChatCatalog | null>
  // Runs a one-off command to its end: what it printed, or why it failed.
  run?(command: QuickCommand, cwd: string): Promise<string | QuickOutput>
  // How a request reaches a model provider.
  fetch?: typeof fetch
  accounting?: SmallModelStore
  // The variables pointing the agent at its active account, where that is not the user's own.
  accountEnv?(agent: AgentKind): Promise<Record<string, string> | null>
  account?(agent: AgentKind): Promise<{ id: string; env: Record<string, string> | null; identity: string | null } | null>
  observe?(facts: { id?: string; endedAt?: number; agent: AgentKind; account: string | null; identity: string | null; startedAt: number; metering: ModelMetering; unpriced: boolean }): void
}

// Small jobs for an agent, such as translating a reply or writing a commit message: one request with
// no tools and nothing kept, on the model the user picked for it or else its cheapest. It runs here
// rather than in the daemon: like the catalog probe, nothing of it outlives core, and there is no
// session to keep. A few run at once.
export class QuickRequests {
  private running = 0
  private readonly waiting: Array<() => void> = []

  constructor(private readonly deps: QuickDeps) {}

  ask(agent: AgentKind, prompt: string, picked?: string, tracking?: QuickTracking, provider?: QuickProvider): Promise<{ text: string; model: string | null }> {
    return this.queued(() => (provider ? this.requestProvider(agent, prompt, provider, tracking) : this.request(agent, prompt, picked, tracking)))
  }

  // One request straight to the provider, as testing it does: no agent CLI, which would need the
  // provider set up for it all over again.
  private async requestProvider(agent: AgentKind, prompt: string, provider: QuickProvider, tracking?: QuickTracking): Promise<{ text: string; model: string | null }> {
    const startedAt = Date.now()
    const accounting = this.deps.accounting
    const job = tracking && accounting ? accounting.begin({ kind: tracking.kind, agent, model: provider.model, conversationId: tracking.conversationId, baseline: tracking.baseline(), unpriced: true }) : undefined
    const reply = await askProvider(provider, prompt, { maxTokens: PROVIDER_MAX_TOKENS, timeoutMs: TIMEOUT_MS, ...(this.deps.fetch ? { fetchImpl: this.deps.fetch } : {}) })
    const text = reply.ok ? reply.text.trim() : ''
    const metering: ModelMetering | undefined = reply.ok && reply.usage ? {
      models: [{ model: provider.model, input: reply.usage.input, output: reply.usage.output, cacheRead: null, cacheWrite: null, cacheWrite1h: null, costUsd: null }],
      calls: 1, callsEstimated: false, reportedCostUsd: null
    } : undefined
    if (metering) this.deps.observe?.({ id: job, agent, account: null, identity: null, startedAt, metering, unpriced: true })
    if (job) accounting?.finish(job, text ? 'completed' : 'failed', metering)
    if (!reply.ok) throw new Rejection('quick-failed', reply.message)
    if (!text) throw new Rejection('quick-failed', 'the provider gave no answer')
    return { text, model: provider.model }
  }

  private async request(agent: AgentKind, prompt: string, picked: string | undefined, tracking?: QuickTracking): Promise<{ text: string; model: string | null }> {
    const quick = adapterOf(agent).quick
    if (!quick) throw new Rejection('quick-unsupported', `${agent} takes no one-off requests`)
    const catalog = await this.deps.catalog(agent).catch(() => null)
    // A pick the agent no longer lists has gone: its cheapest stands in. Without a catalog to tell,
    // the pick is tried as it is.
    const gone = picked !== undefined && catalog !== null && !catalog.models.some((each) => each.id === picked)
    const model = picked !== undefined && !gone ? picked : quickModel(agentDescriptor(agent).quickModels, catalog)
    const dir = await mkdtemp(path.join(os.tmpdir(), 'antumi-quick-'))
    const accounting = this.deps.accounting
    let job: string | undefined
    try {
      const outputFile = path.join(dir, 'answer.md')
      const account = await this.deps.account?.(agent)
      const startedAt = Date.now()
      const env = account?.env ?? await this.deps.accountEnv?.(agent)
      const command = { ...await quick.command(prompt, model, outputFile), ...(env ? { env } : {}) }
      if (tracking && accounting) job = accounting.begin({ kind: tracking.kind, agent, model, conversationId: tracking.conversationId, baseline: tracking.baseline() })
      const output = await agentCliAccess.use(agent, () => (this.deps.run ?? runQuick)(command, dir))
      const printed = typeof output === 'string' ? output : output.stdout
      const answer = quick.parse(printed, model)
      if (answer.metering) this.deps.observe?.({ id: job, agent, account: account?.id ?? null, identity: account?.identity ?? null, startedAt, metering: answer.metering, unpriced: false })
      const text = (command.output === 'file' ? await readFile(outputFile, 'utf8').catch(() => '') : answer.text).trim()
      const error = typeof output === 'string' ? null : output.error
      const failed = error || answer.failed || !text
      if (job) accounting?.finish(job, failed ? 'failed' : 'completed', answer.metering)
      if (error) throw error
      if (failed) throw new Rejection('quick-failed', answer.failed ? text || 'the agent failed' : 'the agent gave no answer')
      return { text, model }
    } catch (error) {
      if (job) accounting?.finish(job, 'failed')
      throw error
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  private async queued<T>(work: () => Promise<T>): Promise<T> {
    if (this.running >= AT_ONCE) await new Promise<void>((resolve) => this.waiting.push(resolve))
    this.running++
    try {
      return await work()
    } finally {
      this.running--
      this.waiting.shift()?.()
    }
  }
}

function runQuick(command: QuickCommand, cwd: string): Promise<QuickOutput> {
  return new Promise((resolve, reject) => {
    let launch
    try {
      launch = planLaunch(command.command, command.args, cwd, { ...process.env, ...command.env })
    } catch (error) {
      return reject(new Rejection('quick-failed', error instanceof Error ? error.message : String(error)))
    }
    const child = spawn(launch.file, launch.args, { cwd, env: launch.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let out = ''
    let err = ''
    let timedOut = false
    let force: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
      force = setTimeout(() => child.kill('SIGKILL'), 2000)
    }, TIMEOUT_MS)
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { out += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { err = (err + chunk).slice(-2000) })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new Rejection('quick-failed', error.message))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (force) clearTimeout(force)
      if (timedOut) { resolve({ stdout: out, error: new Rejection('quick-timeout', 'the agent took too long') }); return }
      resolve({ stdout: out, error: code === 0 ? null : new Rejection('quick-failed', err.trim().split('\n').at(-1) || `exited with ${code}`) })
    })
    child.stdin.on('error', () => {})
    child.stdin.end(command.stdin ?? '')
  })
}
