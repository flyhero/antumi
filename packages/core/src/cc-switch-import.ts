import { randomBytes } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parse as parseToml } from 'smol-toml'
import { z } from 'zod'
import { ModelProviderInput, PROVIDER_CLAUDE_ENV, ProviderHeaders, ProviderModel, type ModelProvider, type ProviderImportCandidate, type ProviderImportPreview, type ProviderImportResult } from '@antumi/protocol'
import type { ModelProviderStore } from './model-providers'
import { CLAUDE_1M_CONTEXT, parseClaudeModelId } from './provider-request'
import { Rejection } from './rejection'
import { parseJson } from './usage-source'

const LIMIT = 500
const TTL = 10 * 60_000
const Row = z.object({ id: z.string(), app: z.string(), name: z.string(), config: z.unknown(), category: z.unknown().optional(), meta: z.unknown().optional() })
type Row = z.infer<typeof Row>
type Planned = { shown: ProviderImportCandidate; input: ModelProviderInput | null }
const record = (value: unknown): Record<string, unknown> => z.record(z.string(), z.unknown()).safeParse(value).data ?? {}
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const objectJson = (value: unknown) => record(typeof value === 'string' ? parseJson(value) : value)
const positive = (value: unknown): number | null => { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : null }
const bareUrl = (value: string) => value.replace(/\/+$/, '')

async function exists(file: string): Promise<boolean> {
  try { return (await stat(file)).isFile() } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

async function readRows(directory: string): Promise<Row[]> {
  const database = path.join(directory, 'cc-switch.db')
  if (await exists(database)) {
    const db = new DatabaseSync(database, { readOnly: true })
    try {
      db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000; BEGIN')
      const columns = new Set(db.prepare('PRAGMA table_info(providers)').all().map((row) => row.name))
      const optional = ['category', 'meta'].map((column) => columns.has(column) ? column : `NULL AS ${column}`).join(', ')
      const rows = db.prepare(`SELECT id, app_type AS app, name, CASE WHEN length(settings_config) <= 65536 THEN settings_config ELSE NULL END AS config, ${optional} FROM providers ORDER BY app_type, name, id LIMIT 501`).all()
      return rows.map((row) => Row.parse(row))
    } finally { db.close() }
  }
  const file = path.join(directory, 'config.json')
  if (!await exists(file)) throw new Rejection('cc-switch-not-found', '未找到 CC Switch 数据，请检查数据目录是否包含 cc-switch.db 或 config.json')
  if ((await stat(file)).size > 8 * 1024 * 1024) throw new Rejection('cc-switch-read-failed', 'CC Switch 配置文件过大，无法导入')
  const root = record(JSON.parse(await readFile(file, 'utf8')))
  const rows: Row[] = []
  for (const app of ['claude', 'codex']) {
    const providers = record(record(root[app]).providers ?? (app === 'claude' ? root.providers : undefined))
    for (const [id, raw] of Object.entries(providers)) {
      const entry = record(raw)
      rows.push({ id, app, name: text(entry.name) || id, config: entry.settingsConfig, category: entry.category, meta: entry.meta })
    }
  }
  return rows
}

function models(ids: unknown[], context: number | null = null, effort = '') {
  return [...new Set(ids.map(text).filter(Boolean))].map((id) => ProviderModel.parse({ id, label: null, contextWindow: context, maxOutput: null, efforts: effort ? [effort] : [] }))
}

function claudeModels(ids: unknown[], context: number | null): ProviderModel[] {
  const found = new Map<string, ProviderModel>()
  for (const entry of ids) {
    const raw = text(entry)
    if (!raw) continue
    const { id, oneMillion } = parseClaudeModelId(raw)
    const existing = found.get(id)
    if (existing) {
      if (oneMillion) existing.contextWindow = Math.max(existing.contextWindow ?? 0, CLAUDE_1M_CONTEXT)
      continue
    }
    const contextWindow = oneMillion ? Math.max(context ?? 0, CLAUDE_1M_CONTEXT) : context
    found.set(id, ProviderModel.parse({ id, label: null, contextWindow, maxOutput: null, efforts: [] }))
  }
  return [...found.values()]
}

function containsKey(value: unknown, key: string): boolean {
  if (typeof value === 'string') return value.includes(key)
  if (Array.isArray(value)) return value.some((entry) => containsKey(entry, key))
  return Object.entries(record(value)).some(([name, entry]) => name.includes(key) || containsKey(entry, key))
}

function normalize(row: Row): Planned {
  const shown: ProviderImportCandidate = { id: randomBytes(12).toString('hex'), app: row.app, name: row.name.trim().slice(0, 60).trim(), endpoint: null, models: [], issue: null }
  let secret = ''
  const skip = (issue: NonNullable<ProviderImportCandidate['issue']>): Planned => ({
    shown: { ...shown, name: (secret ? row.name.replaceAll(secret, '…') : row.name).trim().slice(0, 60).trim(), issue }, input: null
  })
  if (!['claude', 'codex'].includes(row.app)) return skip('unsupported')
  const meta = objectJson(row.meta)
  if (row.category === 'official' || ['codex_oauth', 'xai_oauth', 'github_copilot'].includes(text(meta.providerType))) return skip('managed-account')
  try {
    const config = objectJson(row.config)
    if (!Object.keys(config).length) return skip('invalid-config')
    let input: ModelProviderInput
    if (row.app === 'claude') {
      const env = record(config.env)
      if (['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'].some((key) => ['1', 'true'].includes(text(env[key])))) return skip('unsupported')
      const baseUrl = text(env.ANTHROPIC_BASE_URL) || 'https://api.anthropic.com'
      const token = text(env.ANTHROPIC_AUTH_TOKEN)
      const key = token || text(env.ANTHROPIC_API_KEY)
      if (!key || /^(\$|PROXY_MANAGED|MANAGED_BY_)/i.test(key)) return skip('missing-key')
      secret = key
      const ids = [env.ANTHROPIC_MODEL, env.ANTHROPIC_DEFAULT_SONNET_MODEL, env.ANTHROPIC_DEFAULT_OPUS_MODEL, env.ANTHROPIC_DEFAULT_HAIKU_MODEL, env.ANTHROPIC_SMALL_FAST_MODEL]
      if (Array.isArray(meta.stackModels)) ids.push(...meta.stackModels.map((entry) => record(entry).model))
      if (containsKey(ids, key)) return skip('invalid-config')
      const found = claudeModels(ids, positive(env.CLAUDE_CODE_MAX_CONTEXT_TOKENS))
      const smallModel = parseClaudeModelId(text(env.ANTHROPIC_DEFAULT_HAIKU_MODEL)).id ||
        parseClaudeModelId(text(env.ANTHROPIC_SMALL_FAST_MODEL)).id || found[0]?.id || ''
      const headers = Object.fromEntries(text(env.ANTHROPIC_CUSTOM_HEADERS).split('\n').filter(Boolean).map((line) => {
        const split = line.indexOf(':')
        if (split < 1) throw new Error('invalid header')
        return [line.slice(0, split).trim(), line.slice(split + 1).trim()]
      }))
      input = { id: null, name: shown.name, preset: 'custom', apiKey: key, agents: ['claude'], anthropic: { baseUrl, auth: token ? 'auth_token' : 'api_key', env: Object.fromEntries(PROVIDER_CLAUDE_ENV.filter((key) => typeof env[key] === 'string').map((key) => [key, text(env[key])])) }, openai: null, models: found, defaultModel: found[0]?.id ?? '', smallModel, headers: ProviderHeaders.parse(headers), smallJobs: 'off' }
    } else {
      const toml = parseToml(text(config.config))
      const profile = record(record(toml.profiles)[text(toml.profile)])
      const providerId = text(profile.model_provider) || text(toml.model_provider) || 'openai'
      const provider = record(record(toml.model_providers)[providerId])
      const baseUrl = text(provider.base_url) || (providerId === 'openai' ? 'https://api.openai.com/v1' : '')
      if (!baseUrl) return skip('missing-endpoint')
      if (text(provider.wire_api) && text(provider.wire_api) !== 'responses') return skip('unsupported')
      if (provider.auth || provider.aws || provider.gateway_oauth) return skip('managed-account')
      const key = text(provider.env_key) ? text(process.env[text(provider.env_key)]) : text(provider.experimental_bearer_token) || text(record(config.auth).OPENAI_API_KEY)
      if (!key || /^(\$|PROXY_MANAGED|MANAGED_BY_)/i.test(key)) return skip('missing-key')
      secret = key
      const found = models([profile.model ?? toml.model], positive(profile.model_context_window ?? toml.model_context_window), text(profile.model_reasoning_effort ?? toml.model_reasoning_effort))
      input = { id: null, name: shown.name, preset: 'custom', apiKey: key, agents: ['codex'], anthropic: null, openai: { chatUrl: null, responsesUrl: baseUrl }, models: found, defaultModel: found[0]?.id ?? '', smallModel: found[0]?.id ?? '', headers: ProviderHeaders.parse(provider.http_headers ?? {}), smallJobs: 'off' }
    }
    // Missing models can be listed at import time; all connection fields must already be valid.
    const { apiKey, ...publicConfig } = input
    if (apiKey && containsKey([row.name, publicConfig], apiKey)) return skip('invalid-config')
    ModelProviderInput.omit({ models: true, defaultModel: true, smallModel: true }).parse(input)
    z.array(ProviderModel).max(100).parse(input.models)
    shown.endpoint = input.anthropic?.baseUrl ?? input.openai?.responsesUrl ?? null
    shown.models = input.models.map((model) => model.id)
    return { shown, input }
  } catch { return skip('invalid-config') }
}

function sameConnection(provider: ModelProvider, input: ModelProviderInput): boolean {
  const headers = (value: Record<string, string> | undefined) => JSON.stringify(Object.entries(value ?? {}).map(([name, value]) => [name.toLowerCase(), value]).sort(([left = ''], [right = '']) => left.localeCompare(right)))
  return provider.name === input.name && input.agents.every((agent) => provider.agents.includes(agent)) &&
    bareUrl(provider.anthropic?.baseUrl ?? '') === bareUrl(input.anthropic?.baseUrl ?? '') &&
    provider.anthropic?.auth === input.anthropic?.auth &&
    bareUrl(provider.openai?.responsesUrl ?? '') === bareUrl(input.openai?.responsesUrl ?? '') &&
    bareUrl(provider.openai?.chatUrl ?? '') === bareUrl(input.openai?.chatUrl ?? '') &&
    headers(provider.headers) === headers(input.headers)
}

// Previews contain no key. The bounded, expiring snapshot keeps credentials in core until import.
export class CcSwitchImport {
  private snapshots = new Map<string, { at: number; entries: Planned[] }>()
  private chain: Promise<unknown> = Promise.resolve()
  constructor(private readonly store: Pick<ModelProviderStore, 'list' | 'resolve' | 'save' | 'fetchModels'>, private readonly ownHome: () => string = homedir, private readonly now: () => number = Date.now) {}

  private duplicate(input: ModelProviderInput): boolean {
    return this.store.list().some((provider) => sameConnection(provider, input) && this.store.resolve(provider.id)?.apiKey === input.apiKey)
  }

  async preview(directory?: string): Promise<ProviderImportPreview> {
    const home = this.ownHome()
    const chosen = directory?.trim() || path.join(home, '.cc-switch')
    const dir = chosen === '~' ? home : /^~[/\\]/.test(chosen) ? path.join(home, chosen.slice(2)) : path.resolve(chosen)
    let rows: Row[]
    try { rows = await readRows(dir) } catch (error) {
      if (error instanceof Rejection) throw error
      throw new Rejection('cc-switch-read-failed', '无法读取 CC Switch 数据，请检查目录和文件格式')
    }
    if (rows.length > LIMIT) throw new Rejection('cc-switch-read-failed', 'CC Switch 服务商超过 500 个，请先减少条目再导入')
    for (const [token, snapshot] of this.snapshots) if (this.now() - snapshot.at > TTL) this.snapshots.delete(token)
    if (this.snapshots.size >= 5) this.snapshots.delete(this.snapshots.keys().next().value ?? '')
    const entries = rows.map(normalize)
    for (const entry of entries) if (entry.input && this.duplicate(entry.input)) entry.shown.issue = 'duplicate'
    const token = randomBytes(16).toString('hex')
    this.snapshots.set(token, { at: this.now(), entries })
    return { token, directory: dir, candidates: entries.map((entry) => entry.shown) }
  }

  import(token: string, ids: readonly string[]): Promise<ProviderImportResult> {
    const action = this.chain.catch(() => {}).then(() => this.importSnapshot(token, ids))
    this.chain = action
    return action
  }

  private async importSnapshot(token: string, ids: readonly string[]): Promise<ProviderImportResult> {
    const snapshot = this.snapshots.get(token)
    if (!snapshot || this.now() - snapshot.at > TTL) {
      this.snapshots.delete(token)
      throw new Rejection('cc-switch-preview-expired', '导入预览已过期，请重新读取 CC Switch')
    }
    const wanted = new Set(ids)
    if (!wanted.size || [...wanted].some((id) => !snapshot.entries.some((entry) => entry.shown.id === id))) throw new Rejection('cc-switch-selection-invalid', '导入选项无效，请重新读取 CC Switch')
    const items: ProviderImportResult['items'] = []
    for (const { shown, input } of snapshot.entries.filter((entry) => wanted.has(entry.shown.id))) {
      const item = { id: shown.id, name: shown.name }
      if (!input || shown.issue) { items.push({ ...item, status: 'skipped', issue: shown.issue }); continue }
      if (this.duplicate(input)) { items.push({ ...item, status: 'skipped', issue: 'duplicate' }); continue }
      let saving = input
      if (!saving.models.length) {
        try {
          const listing = await this.store.fetchModels(input)
          const models = listing.models.slice(0, 100)
          const first = models[0]
          if (!first) { items.push({ ...item, status: 'failed', issue: 'models-unavailable' }); continue }
          saving = { ...input, models, defaultModel: first.id, smallModel: first.id }
        } catch { items.push({ ...item, status: 'failed', issue: 'models-unavailable' }); continue }
      }
      try {
        await this.store.save(ModelProviderInput.parse(saving))
        items.push({ ...item, status: 'imported', issue: null })
      } catch { items.push({ ...item, status: 'failed', issue: 'save-failed' }) }
    }
    return { items }
  }
}
