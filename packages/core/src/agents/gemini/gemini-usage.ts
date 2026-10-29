import { readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { UsageWindow } from '@antumi/protocol'
import { fetchUsageJson, parseJson, UsageFetchError, type UsageReading } from '../../usage-source'
import { geminiAuthType, geminiHome, geminiSignedIn, requireGemini } from './gemini-cli'

const ENDPOINT = 'https://cloudcode-pa.googleapis.com/v1internal'
const Credential = z.looseObject({ access_token: z.string().optional(), refresh_token: z.string().optional(), expiry_date: z.number().optional() })
const Loaded = z.looseObject({ cloudaicompanionProject: z.union([z.string(), z.looseObject({ id: z.string() })]).optional(), currentTier: z.looseObject({ name: z.string().optional() }).optional() })
const Bucket = z.looseObject({ modelId: z.string().optional(), remainingFraction: z.number().finite(), resetTime: z.string().optional() })
const Quota = z.looseObject({ buckets: z.array(z.unknown()) })
const tokens = new Map<string, { token: string; until: number }>()

// Read the public OAuth client shipped by the installed CLI, never import its executable code.
// npm 0.66 bundles it; source-style installs keep it in gemini-cli-core's oauth2.js.
export async function readGeminiOAuthClient(command: string): Promise<{ id: string; secret: string }> {
  let directory = path.dirname(await realpath(command))
  while (directory !== path.dirname(directory)) {
    // npm's Windows .cmd shim is beside node_modules rather than linked into the package.
    const roots = [directory, path.join(directory, 'node_modules', '@google', 'gemini-cli')]
    for (const root of roots) {
      const pkg = z.looseObject({ name: z.string() }).safeParse(parseJson(await readFile(path.join(root, 'package.json'), 'utf8').catch(() => null))).data
      if (pkg?.name !== '@google/gemini-cli') continue
      const bundle = path.join(root, 'bundle')
      const files = (await readdir(bundle).catch(() => [])).filter((file) => file.endsWith('.js') && file.startsWith('chunk-')).map((file) => path.join(bundle, file))
      files.push(path.join(root, 'node_modules', '@google', 'gemini-cli-core', 'dist', 'src', 'code_assist', 'oauth2.js'), path.join(root, '..', 'gemini-cli-core', 'dist', 'src', 'code_assist', 'oauth2.js'))
      for (const file of files) {
        const source = await readFile(file, 'utf8').catch(() => '')
        const id = /\bOAUTH_CLIENT_ID\s*=\s*["']([^"']+)["']/.exec(source)?.[1]
        const secret = /\bOAUTH_CLIENT_SECRET\s*=\s*["']([^"']+)["']/.exec(source)?.[1]
        if (id && secret) return { id, secret }
      }
      throw new UsageFetchError('request-failed', '无法从已安装的 Gemini CLI 读取 OAuth 客户端，请更新 CLI')
    }
    directory = path.dirname(directory)
  }
  throw new UsageFetchError('request-failed', '无法从已安装的 Gemini CLI 读取 OAuth 客户端，请更新 CLI')
}

async function accessToken(credential: z.infer<typeof Credential>): Promise<string> {
  const now = Date.now()
  const kept = credential.refresh_token ? tokens.get(credential.refresh_token) : undefined
  if (kept && kept.until > now) return kept.token
  if (credential.access_token && (credential.expiry_date ?? 0) > now + 60_000) return credential.access_token
  if (!credential.refresh_token) throw new UsageFetchError('auth-expired', 'Gemini 登录已过期，请在终端重新登录')
  const client = await readGeminiOAuthClient(await requireGemini())
  let response: Response
  try {
    response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, refresh_token: credential.refresh_token, grant_type: 'refresh_token' }), signal: AbortSignal.timeout(10_000) })
  } catch (error) { throw new UsageFetchError('request-failed', error instanceof Error ? error.message : String(error)) }
  if (response.status === 400 || response.status === 401) throw new UsageFetchError('auth-expired', 'Gemini 登录已过期，请在终端重新登录')
  if (!response.ok) throw new UsageFetchError('request-failed', `Google token endpoint answered ${response.status}`)
  const granted = z.object({ access_token: z.string().min(1), expires_in: z.number().positive().default(3600) }).safeParse(await response.json())
  if (!granted.success) throw new UsageFetchError('request-failed', 'Google 的令牌响应无法识别')
  tokens.set(credential.refresh_token, { token: granted.data.access_token, until: now + granted.data.expires_in * 1000 - 60_000 })
  return granted.data.access_token
}

export function parseGeminiQuota(body: unknown): UsageWindow[] {
  const quota = Quota.safeParse(body)
  if (!quota.success) throw new UsageFetchError('request-failed', 'Gemini 的额度响应无法识别')
  return quota.data.buckets.flatMap((raw) => {
    const bucket = Bucket.safeParse(raw).data
    if (!bucket) return []
    const reset = Date.parse(bucket.resetTime ?? '')
    return [{ kind: 'daily' as const, model: bucket.modelId ?? null, usedPercent: Math.round((1 - Math.min(1, Math.max(0, bucket.remainingFraction))) * 1000) / 10, windowMinutes: 1440, resetsAt: Number.isFinite(reset) ? reset : null }]
  })
}

export async function readGeminiUsage(): Promise<UsageReading> {
  if (await geminiAuthType() !== 'oauth-personal') return await geminiSignedIn() ? { signedIn: true, windows: [], plan: null } : { signedIn: false }
  const credential = Credential.safeParse(parseJson(await readFile(path.join(geminiHome(), 'oauth_creds.json'), 'utf8').catch(() => null))).data
  if (!credential || (!credential.access_token && !credential.refresh_token)) return { signedIn: false }
  try {
    const headers = { Authorization: `Bearer ${await accessToken(credential)}`, 'Content-Type': 'application/json' }
    const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID
    const loaded = Loaded.safeParse(await fetchUsageJson(`${ENDPOINT}:loadCodeAssist`, headers, JSON.stringify({ ...(project ? { cloudaicompanionProject: project } : {}), metadata: { ideType: 'IDE_UNSPECIFIED', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' } }))).data
    const resolved = typeof loaded?.cloudaicompanionProject === 'string' ? loaded.cloudaicompanionProject : loaded?.cloudaicompanionProject?.id
    if (!resolved && !project) throw new UsageFetchError('request-failed', 'Gemini 尚未完成账号初始化，请在终端运行 gemini')
    const windows = parseGeminiQuota(await fetchUsageJson(`${ENDPOINT}:retrieveUserQuota`, headers, JSON.stringify({ project: resolved || project })))
    return { signedIn: true, windows, plan: loaded?.currentTier?.name ?? null }
  } catch (error) {
    if (error instanceof UsageFetchError && error.code === 'auth-expired' && credential.refresh_token) tokens.delete(credential.refresh_token)
    throw error
  }
}
