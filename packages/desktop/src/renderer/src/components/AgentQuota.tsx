import { t } from '../i18n'
import {
  AGENT_KINDS,
  agentAdvice,
  quotaVerdict,
  rankAgents,
  recommendAgent,
  usageLevel,
  type AgentKind,
  type AgentRecommendation,
  type AgentUsage,
  type ChatModel,
  type DelegationQuota,
  type QuotaVerdict
} from '@antumi/protocol'
import { useCore } from '../core-store'
import { currentInstalledAgents } from '../installed-agents'
import { agentLabel } from '../labels'
import { usePreferences, type Preferences } from '../preferences'
import { adviceText, alternativeAgent, recommendationText } from '../quota-advice-text'
import { formatClock, resetText, useNow, windowLabel } from '../usage-format'
import { askConfirm } from '../confirm-dialog'

// What quotaVerdict matches a model-specific window against: everything the catalog says of it,
// since the default model names the real one only in its description.
export function modelText(model: Pick<ChatModel, 'id' | 'label' | 'description'> | undefined): string | null {
  return model ? [model.id, model.label, model.description].filter(Boolean).join(' ') : null
}

function verdictOf(agent: AgentKind, now: number, model?: string | null): QuotaVerdict {
  return quotaVerdict(useCore.getState().usage?.[agent], now, model)
}

const usageList = (usage: Partial<Record<AgentKind, AgentUsage>> | null): AgentUsage[] =>
  AGENT_KINDS.map((agent) => usage?.[agent]).filter((entry) => entry !== undefined)

// The agent among `candidates` best spent now, where it is clearly the better one; null while
// the user has quota advice off.
export function useRecommendation(candidates: readonly AgentKind[]): AgentRecommendation | null {
  const usage = useCore((s) => s.usage)
  const on = usePreferences((s) => s.quotaAdvice)
  const now = useNow(60_000)
  return on ? recommendAgent(usageList(usage), candidates, now) : null
}

export function RecommendedMark({ recommendation }: { recommendation: AgentRecommendation }) {
  return (
    <span className="agent-recommended" title={recommendationText(recommendation)}>{t('AgentPicker.recommended')}</span>
  )
}

// "5h 剩 12%", "本周 已用完 · 今天 18:00 重置": short enough for a menu row; the confirmation
// spells the wait out. null when there is nothing worth saying.
export function quotaText(verdict: QuotaVerdict, display: Preferences['usageDisplay'], now: number): string | null {
  const { window } = verdict
  if (!window) {
    return null
  }
  const stale = verdict.stale ? t('AgentQuota.mayBeOutdated') : ''
  if (verdict.state === 'exhausted') {
    const reset = window.resetsAt === null ? '' : t('AgentQuota.resets', { value1: formatClock(window.resetsAt, now) })
    return t('AgentQuota.limitReached', { value1: windowLabel(window), reset: reset, stale: stale })
  }
  const used = Math.round(window.usedPercent)
  return `${windowLabel(window)} ${display === 'remaining' ? t('AgentQuota.remaining', { value1: 100 - used }) : t('AgentQuota.used', { used: used })}${stale}`
}

// The same for whom work is delegated to; nothing for one on a model provider, which has no quota.
export function delegationQuotaText(quota: DelegationQuota, display: Preferences['usageDisplay'], now: number): string | null {
  return quota.state === 'provider' ? null : quotaText({ state: quota.state, window: quota.window, stale: quota.stale }, display, now)
}

// The agent's tightest window, for wherever it is about to be picked. Says nothing while the usage
// is unknown (signed out, an older core) rather than guessing.
export function AgentQuotaHint({ agent, model, className }: { agent: AgentKind; model?: string | null; className?: string }) {
  const usage = useCore((s) => s.usage?.[agent])
  const display = usePreferences((s) => s.usageDisplay)
  const now = useNow(60_000)
  const adviceOn = usePreferences((s) => s.quotaAdvice)
  const verdict = quotaVerdict(usage, now, model)
  const text = quotaText(verdict, display, now)
  if (!text || !verdict.window) {
    return null
  }
  const level = verdict.state === 'exhausted' || verdict.state === 'tight' ? 'critical' : usageLevel(verdict.window.usedPercent)
  const advice = adviceOn ? modelAdvice(agent, model, now) : null
  return (
    <span className={['agent-quota', className].filter(Boolean).join(' ')} data-level={level} title={advice ?? undefined}>
      {text}
    </span>
  )
}

// What to say of the model about to run, where its own cap is near or there is room to spend on
// it: the hint's tooltip.
function modelAdvice(agent: AgentKind, model: string | null | undefined, now: number): string | null {
  const named = model?.toLowerCase()
  if (!named) return null
  const all = usageList(useCore.getState().usage)
  const advice = agentAdvice(all.find((entry) => entry.agent === agent), now).find(
    (item) => (item.kind === 'switch-model' || item.kind === 'use-more') && item.model !== null && named.includes(item.model.toLowerCase())
  )
  return advice ? adviceText(advice, now, alternativeAgent(agent, all, currentInstalledAgents(), now)) : null
}

// Chinese text sets Latin letters and digits off from Han characters with a space.
function spaced(label: string): string {
  const latin = (char: string | undefined) => char !== undefined && /[\x21-\x7e]/.test(char)
  return `${latin(label[0]) ? ' ' : ''}${label}${latin(label.at(-1)) ? ' ' : ''}`
}

// Asked before starting an agent whose quota is used up: it would stall at once. Only a nudge; the
// user may know better (a reset about to land, a credit to spend).
export async function confirmQuota(agent: AgentKind, model?: string | null): Promise<boolean> {
  const now = Date.now()
  const verdict = verdictOf(agent, now, model)
  if (verdict.state !== 'exhausted' || !verdict.window) {
    return true
  }
  const reset = resetText(verdict.window, now)
  // The other agent best spent now, rather than whichever comes first.
  const other = rankAgents(usageList(useCore.getState().usage), currentInstalledAgents().filter((kind) => kind !== agent), now)[0] ?? null
  const otherVerdict = other ? verdictOf(other, now) : null
  const display = usePreferences.getState().usageDisplay
  const suggestion =
    other && otherVerdict && (otherVerdict.state === 'ok' || otherVerdict.state === 'tight')
      ? t('AgentQuota.stillHasQuotaYouCanSwitchToIt', { value1: agentLabel(other), value2: otherVerdict.window ? `（${quotaText(otherVerdict, display, now)}）` : '' })
      : ''
  // Waiting for the reset is a choice too, where core can start things later.
  const later = useCore.getState().rpc?.features.includes('schedules')
    ? t('AgentQuota.youCanAlsoCancelAndUseTheClock')
    : ''
  return askConfirm({
    message: t('AgentQuota.hasUsedItsQuotaStartWithAnyway', { value1: agentLabel(agent), value2: spaced(windowLabel(verdict.window)), value3: reset ? `，${reset}` : '', suggestion: suggestion, later: later, value6: agentLabel(agent) }),
    confirm: t('ConfirmDialog.startAnyway')
  })
}
