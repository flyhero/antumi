import { t } from './i18n'
import { agentAdvice, quotaVerdict, rankAgents, type AgentKind, type AgentRecommendation, type AgentUsage, type QuotaAdvice, type WindowPace } from '@antumi/protocol'
import { agentLabel } from './labels'
import { formatClock, formatDuration, windowLabel } from './usage-format'

// How a piece of quota advice reads, in the usage card and in a notification.

// Another agent with room and on pace, to hand light work to; null when none is.
export function alternativeAgent(agent: AgentKind, usages: readonly AgentUsage[], installed: readonly AgentKind[], now: number): AgentKind | null {
  const others = rankAgents(usages, installed.filter((kind) => kind !== agent), now)
  return (
    others.find((kind) => {
      const usage = usages.find((entry) => entry.agent === kind)
      return quotaVerdict(usage, now).state === 'ok' && !agentAdvice(usage, now).some((item) => item.kind === 'wait-reset' || item.kind === 'slow-down')
    }) ?? null
  )
}

// Chinese text sets Latin letters and digits off from Han characters with a space, wherever the
// labels put them ("5h", "本周", "Opus 本周").
export function spacedText(text: string): string {
  return text.replace(/([\u4e00-\u9fff])(?=[A-Za-z0-9])/g, '$1 ').replace(/([A-Za-z0-9%])(?=[\u4e00-\u9fff])/g, '$1 ')
}

// What slow-down advice asks for, alone where its window's row already says when the quota runs out.
export function lighterWorkStep(alternative: AgentKind | null): string {
  return alternative ? t('quotaAdviceText.useForLighterWork', { other: agentLabel(alternative) }) : t('quotaAdviceText.useASmallerModelForLighterWork')
}

const quotaOf = (advice: QuotaAdvice) => t('quotaAdviceText.quota', { value1: windowLabel(advice.window) })

export function adviceText(advice: QuotaAdvice, now: number, alternative: AgentKind | null): string {
  return spacedText(rawAdviceText(advice, now, alternative))
}

function rawAdviceText(advice: QuotaAdvice, now: number, alternative: AgentKind | null): string {
  const { window } = advice
  const reset = window.resetsAt === null ? '' : formatClock(window.resetsAt, now)
  const other = alternative ? agentLabel(alternative) : null
  switch (advice.kind) {
    case 'use-more': {
      const left = 100 - Math.round(window.usedPercent)
      const waste = Math.round(advice.percent ?? 0)
      const model = advice.model ? t('quotaAdviceText.isAlsoAvailable', { value1: advice.model }) : ''
      return t('quotaAdviceText.leftResetsAtThisPaceAboutMayGo', { value1: windowLabel(window), left: left, reset: reset, waste: waste, model: model })
    }
    case 'slow-down': {
      const early = advice.at !== null && window.resetsAt !== null ? t('quotaAdviceText.beforeReset', { value1: formatDuration(window.resetsAt - advice.at) }) : ''
      const at = advice.at === null ? '' : t('quotaAdviceText.at', { value1: formatClock(advice.at, now) })
      return t('quotaAdviceText.atThisPaceQuotaRunsOut', { value1: quotaOf(advice), at: at, early: early, value4: lighterWorkStep(alternative) })
    }
    case 'wait-reset': {
      const head = window.usedPercent >= 100 ? t('quotaAdviceText.5hQuotaExhaustedResets', { reset: reset }) : t('quotaAdviceText.atThisPace5hQuotaRunsOutBefore', { reset: reset })
      return `${head}${other ? t('quotaAdviceText.useInTheMeantime', { other: other }) : t('quotaAdviceText.waitUntilResetForLargeTasks')}`
    }
    case 'switch-model': {
      const model = advice.model ?? ''
      return window.usedPercent >= 100
        ? t('quotaAdviceText.exhaustedResetsSwitchModelsFirst', { value1: quotaOf(advice), reset: reset })
        : t('quotaAdviceText.isUsedSwitchModelsForRoutineWorkAnd', { value1: windowLabel(window), value2: Math.round(window.usedPercent), model: model })
    }
  }
}

// What a window's row in the usage card adds about its pace, with the detail for its tooltip.
export function paceText(pace: WindowPace | null, now: number): { label: string; detail: string } | null {
  if (!pace) return null
  if (pace.pace === 'over' && pace.runsOutAt !== null) return { label: t('quotaAdviceText.fastPace'), detail: spacedText(t('quotaAdviceText.atThisPaceRunsOutBeforeReset', { value1: formatClock(pace.runsOutAt, now) })) }
  if (pace.pace === 'under' && pace.wastePercent !== null) return { label: t('quotaAdviceText.mayGoUnused'), detail: spacedText(t('quotaAdviceText.atThisPaceAboutRemainsUnusedAtReset', { value1: Math.round(pace.wastePercent) })) }
  return null
}

export function recommendationText(recommendation: AgentRecommendation): string {
  return recommendation.reason === 'expiring' ? t('quotaAdviceText.quotaResetsSoonWithPlentyLeftUseThis') : t('quotaAdviceText.moreQuotaAvailableThanOtherAgents')
}
