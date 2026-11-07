import { localized, t } from './i18n'
import { ratesAt, type SmallModelCost, type SmallModelKind, type SmallModelTotals } from '@antumi/protocol'

export const SMALL_MODEL_LABELS: Record<SmallModelKind, string> = localized(() => ({ translation: t('ChatContextMenu.translate'), commitMessage: t('modelCostFormat.commitMessage'), pullRequest: t('modelCostFormat.pullRequest'), helper: t('HelperPanel.helper'), title: t('ConversationList.conversationTitle') }))

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const WHOLE_USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function dollars(value: number | null): string {
  if (value === null) return '—'
  if (value > 0 && value < 0.01) return '<$0.01'
  return USD.format(value)
}

// A headline amount: the cents go once there are a hundred dollars to read.
export const headlineDollars = (value: number | null) => value !== null && value >= 100 ? WHOLE_USD.format(value) : dollars(value)

// An axis tick: whole dollars once the scale reaches ten.
export const tickDollars = (value: number, max: number) => max >= 10 ? WHOLE_USD.format(value) : dollars(value)

const precise = (value: number | null) => value === null ? t('SmallModelStats.unavailable') : `$${value.toFixed(6)}`

export function coverage(totals: SmallModelTotals): string {
  return t('modelCostFormat.totalPricedEstimable', { value1: totals.count, value2: totals.priced, value3: totals.estimated })
}

export function smallModelExplanation(cost: SmallModelCost): string {
  const { baseline } = cost
  const mainCost = cost.modelDifferenceUsd !== null && cost.costUsd !== null ? cost.modelDifferenceUsd + cost.costUsd : null
  const cacheRate = baseline.price && baseline.context !== null ? ratesAt(baseline.price, baseline.context).cacheRead : null
  const dates = [...new Set(cost.prices.map((price) => price.updatedAt).concat(baseline.price ? [baseline.price.updatedAt] : []))]
  return [
    t('modelCostFormat.estimatedAtApiListPricesSubscriptionUsageIs'),
    t('modelCostFormat.costMainModel', { value1: precise(cost.costUsd), value2: baseline.model ?? t('SmallModelStats.unavailable') }),
    t('modelCostFormat.modelDifferenceSameUsagePricedAtMainModel', { value1: precise(mainCost), value2: precise(cost.costUsd), value3: precise(cost.modelDifferenceUsd) }),
    cost.contextSavedUsd === null ? t('modelCostFormat.mainContextOrCallDataMissingEstimatingModel')
      : t('modelCostFormat.contextSavingsTokensCallsMillionTokens', { value1: baseline.context ?? 0, value2: cost.calls ?? 0, value3: precise(cacheRate), value4: precise(cost.contextSavedUsd) }),
    t('modelCostFormat.estimatedSavingsMax0ModelDifferenceContextSavings', { value1: precise(cost.savedUsd) }),
    ...(cost.callsEstimated ? [t('modelCostFormat.modelCallCountsAreConservativeEstimatesAssumeOne')] : []),
    ...(!cost.completed ? [t('modelCostFormat.failedOrInterruptedRequestsCountReportedCostsOnly')] : []),
    t('modelCostFormat.assumesAWarmCacheExcludesFutureCostsOf'),
    ...(dates.length ? [t('modelCostFormat.pricesUpdated', { value1: dates.join('、') })] : []),
    ...(cost.costUsd === null ? [t('modelCostFormat.verifiablePricesOrFullBillingDetailsAreMissing')] : [])
  ].join('\n')
}
