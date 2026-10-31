import { getLocale, t, tr } from '../i18n'
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  AGENT_KINDS,
  accountUsage,
  agentAdvice,
  agentDescriptor,
  quotaVerdict,
  scheduledQuotaReset,
  tightestWindow,
  usageAccount,
  windowPace,
  usageLevel,
  type AgentAccount,
  type AgentKind,
  type AgentUsage,
  type GlobalResets,
  type QuotaAdvice,
  type ResetCredit,
  type ResetCreditOutcome,
  type ResetCredits,
  type UsageForecast,
  type UsageWindow
} from '@antumi/protocol'
import { activateAccount, openUsageCard, refreshUsage, setSettingsOpen, spendResetCredit, useCore } from '../core-store'
import { accountName, accountsOf } from '../agent-accounts'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel } from '../labels'
import { usePreferences, type Preferences } from '../preferences'
import { adviceText, alternativeAgent, lighterWorkStep, paceText, spacedText } from '../quota-advice-text'
import { clearsText, elapsedPercent, formatClock, formatDuration, globalResetText, percentText, resetText, shownPercent, SPEND_OUTCOME_TEXT, spendNote, useNow, windowLabel } from '../usage-format'
import { AgentIcon, CheckIcon, InfoIcon, WarningIcon } from './icons'
import { Spinner } from './Spinner'
import { forecastRunsOut, useQuotaForecasts } from '../quota-forecast'

function errorText(usage: AgentUsage): string {
  return usage.error === 'auth-expired'
    ? t('UsageBar.signInCredentialsExpiredRunToRefresh', { value1: agentDescriptor(usage.agent).cli })
    : t('UsageBar.failedToLoadRetriesAutomatically')
}

// A credit this close to expiring is worth a nudge.
const EXPIRING_SOON_MS = 24 * 60 * 60_000

const expiresSoon = (expiresAt: number | null, now: number) => expiresAt !== null && expiresAt - now < EXPIRING_SOON_MS

function expiryText(expiresAt: number | null, now: number): string {
  if (expiresAt === null) {
    return t('UsageBar.noExpirationDate')
  }
  if (expiresAt <= now) {
    return t('UsageBar.expired')
  }
  const date = new Date(expiresAt)
  const time = date.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', hour12: false })
  return t('UsageBar.expiresLeft', { value1: date.getMonth() + 1, value2: date.getDate(), time: time, value4: formatDuration(expiresAt - now) })
}

// Spending a reset, from asking first to what came of it: the credit picked by id, or without one
// whichever the service picks. A failed attempt keeps its request id, so retrying it can never
// spend a second one.
type Spending =
  | { phase: 'confirm'; creditId?: string }
  | { phase: 'pending'; creditId?: string; requestId: string }
  | { phase: 'failed'; creditId?: string; requestId: string; error: string }
  | { phase: 'done'; outcome: ResetCreditOutcome }

type SpendProps = {
  spending: Spending | null
  onSpend: (requestId: string, creditId?: string) => void
  onChange: (spending: Spending | null) => void
}

// Under the credit being spent: what it will do, then waiting, or why it did not go through.
function SpendSteps({ usage, credit, spending, onSpend, onChange }: SpendProps & { usage: AgentUsage; credit: ResetCredit | undefined; spending: Spending }) {
  if (spending.phase === 'done') {
    return null
  }
  if (spending.phase === 'pending') {
    return <div className="usage-card-spend-note" role="status">{tr('UsageBar.usingResetCard', { value1: <Spinner /> })}</div>
  }
  const failed = spending.phase === 'failed'
  return (
    <>
      <div className="usage-card-spend-note" role={failed ? 'alert' : undefined} data-failed={failed || undefined}>
        {failed ? spending.error : spendNote(usage, credit?.clears ?? [])}
      </div>
      <div className="usage-card-spend">
        <button type="button" className="button primary" onClick={() => onSpend(failed ? spending.requestId : crypto.randomUUID(), spending.creditId)}>
          {failed ? t('ChatContextMenu.retry') : t('UsageBar.confirmUse')}
        </button>
        <button type="button" className="button" onClick={() => onChange(null)}>{t('ChatCommandSettings.cancel')}</button>
      </div>
    </>
  )
}

export function ResetCreditList({ usage, credits, now, spending, onSpend, onChange }: SpendProps & { usage: AgentUsage; credits: ResetCredits; now: number }) {
  if (credits.blockedBy === 'cli_version') {
    return <div className="usage-card-credits muted">{t('UsageBar.upgradeClaudeCodeToSeeAvailableResetCards')}</div>
  }
  const unlisted = credits.available - credits.credits.length
  const busy = spending !== null && spending.phase !== 'done'
  const steps = (credit: ResetCredit | undefined) => spending && <SpendSteps usage={usage} credit={credit} spending={spending} onSpend={onSpend} onChange={onChange} />
  // Spent one by one where the service names them; where it does not, it picks the one to spend.
  const byId = credits.usable === true && credits.credits.some((credit) => credit.id)
  const unnamed = credits.usable === true && !byId && credits.available > 0
  const labels = byId ? [] : [...new Set(credits.credits.flatMap((credit) => (credit.label ? [credit.label] : [])))]
  return (
    <div className="usage-card-credits">
      <div className="usage-card-credits-title">{tr('UsageBar.resetCardsAvailable', { value1: credits.available })}</div>
      {labels.map((label) => (
        <div key={label} className="usage-card-credit-label">
          {label}
        </div>
      ))}
      {credits.credits.map((credit, index) => {
        const clears = clearsText(credit.clears)
        if (byId && credit.id) {
          const picked = spending !== null && spending.phase !== 'done' && spending.creditId === credit.id
          return (
            <div key={credit.id} className="usage-card-credit-item">
              <div className="usage-card-credit-row">
                <div className="usage-card-credit-text">
                  <div className="usage-card-credit-label">{credit.label ?? (clears || t('UsageBar.resetCards'))}</div>
                  <div className="usage-card-credit-expiry" data-soon={expiresSoon(credit.expiresAt, now) || undefined}>
                    {expiryText(credit.expiresAt, now)}
                  </div>
                </div>
                {!picked && (
                  <button type="button" className="button" disabled={busy} onClick={() => onChange({ phase: 'confirm', creditId: credit.id })}>{t('KnowledgeBaseSettings.use')}</button>
                )}
              </div>
              {picked && steps(credit)}
            </div>
          )
        }
        return (
          <div key={index} className="usage-card-credit" data-soon={expiresSoon(credit.expiresAt, now) || undefined}>
            {expiryText(credit.expiresAt, now)}
            {clears && ` · ${clears}`}
          </div>
        )
      })}
      {unlisted > 0 && <div className="usage-card-credit">{tr('UsageBar.moreWithoutExpirationDates', { unlisted: unlisted })}</div>}
      {unnamed && (spending === null || spending.phase === 'done' ? (
        <div className="usage-card-spend">
          <button type="button" className="button" onClick={() => onChange({ phase: 'confirm' })}>{t('UsageBar.useOneResetCard')}</button>
        </div>
      ) : steps(credits.credits[0]))}
      {spending?.phase === 'done' && (
        <div className="usage-card-spend-note" role="status" data-outcome={spending.outcome}>{SPEND_OUTCOME_TEXT[spending.outcome]}</div>
      )}
      {!credits.usable && <div className="usage-card-credits-hint">{agentDescriptor(usage.agent, getLocale()).usageWhere}</div>}
    </div>
  )
}

const fullDate = (at: number) => new Date(at).toLocaleString(getLocale(), { hour12: false })

// What the service announced for everyone, from a community tracker: a word that it is not official,
// and the credit the tracker asks for.
export function GlobalResetList({ resets, now }: { resets: GlobalResets; now: number }) {
  const sourceId = useId()
  const text = globalResetText(resets, now)
  const source = (url: string | null, label: string) => url && <a className="usage-card-global-source" href={url} target="_blank" rel="noreferrer">{label}</a>
  const attribution = (
    <span className="usage-card-global-attribution" title="">
      <button type="button" className="usage-card-global-info" aria-label={t('UsageBar.dataSources')} aria-describedby={sourceId}><InfoIcon /></button>
      <span id={sourceId} role="tooltip" className="usage-card-global-tooltip">
        {tr('UsageBar.basedOnAnnouncementsOnXUnofficialInformationData', { value1: <a href="https://limitreset.net" target="_blank" rel="noreferrer">LimitReset</a>, value2: <a href="https://codex-resets.com" target="_blank" rel="noreferrer">Codex Resets</a> })}
      </span>
    </span>
  )
  return (
    <div className="usage-card-global">
      <div className="usage-card-credits-title">{t('SettingsPage.serviceWideReset')}{!text.upcoming && !text.latest && !text.chance && attribution}</div>
      {resets.upcoming && text.upcoming && (
        <div className="usage-card-global-upcoming" title={fullDate(resets.upcoming.at)}>
          {text.upcoming}
          {resets.upcoming.text && <q>{resets.upcoming.text}</q>}
          {source(resets.upcoming.sourceUrl, t('UsageBar.upcomingSource'))}
          {!text.latest && !text.chance && attribution}
        </div>
      )}
      {resets.latest && text.latest && (
        <div className="usage-card-global-line" title={fullDate(resets.latest.at)}>
          {text.latest}
          {source(resets.latest.sourceUrl, t('UsageBar.latestSource'))}
          {!text.chance && attribution}
        </div>
      )}
      {text.chance && <div className="usage-card-global-line">{text.chance}{attribution}</div>}
    </div>
  )
}

// What a meter's fill and its time mark stand for, on hover rather than as a legend taking a row.
export function MeterHint({ display }: { display: Preferences['usageDisplay'] }) {
  const id = useId()
  return (
    <span className="usage-card-meter-hint">
      <button type="button" className="usage-card-meter-info" aria-label={t('UsageBar.aboutTheMeters')} aria-describedby={id}><InfoIcon /></button>
      <span id={id} role="tooltip" className="usage-card-meter-tooltip">
        {display === 'remaining' ? t('UsageBar.meterHintRemaining') : t('UsageBar.meterHintUsed')}
      </span>
    </span>
  )
}

// One window in the card: its meter against the clock, when it resets, and what to do about it.
export function UsageWindowRow({ window, now, display, showPace, forecast, advice, alternative, usage }: {
  window: UsageWindow
  now: number
  display: Preferences['usageDisplay']
  showPace: boolean
  forecast: UsageForecast | undefined
  advice: readonly QuotaAdvice[]
  alternative: AgentKind | null
  usage?: AgentUsage
}) {
  const elapsed = elapsedPercent(window, now)
  const mark = elapsed === null ? null : display === 'remaining' ? 100 - elapsed : elapsed
  const planned = scheduledQuotaReset(usage, window, now)
  const resetAt = planned?.kind === 'reset' ? planned.at : window.resetsAt
  const pace = showPace ? windowPace(window, now, resetAt) : null
  const paceLabel = paceText(pace, now)
  // Said only where the window runs out before it resets: that it lasts, the bar already shows.
  const runsOut = showPace && window.usedPercent < 100 ? forecastRunsOut(forecast, usage ? resetAt : undefined) : null
  return (
    <div className="usage-card-row" data-level={usageLevel(window.usedPercent)}>
      <span className="usage-card-label">{windowLabel(window)}</span>
      <span
        className="usage-meter"
        aria-hidden="true"
        title={elapsed === null ? undefined : t('UsageBar.usedAndElapsed', { used: Math.round(window.usedPercent), elapsed: Math.round(elapsed) })}
      >
        <span style={{ width: `${shownPercent(window, display)}%` }} />
        {mark !== null && <span className="usage-meter-time" style={{ left: `${mark}%` }} />}
      </span>
      <span className="usage-card-value">{percentText(window, display)}</span>
      {(paceLabel || window.resetsAt !== null) && (
        <span className="usage-card-reset">
          {paceLabel && pace && <span className="usage-card-pace" data-pace={pace.pace} title={paceLabel.detail}>{paceLabel.label}</span>}
          {resetText(window, now)}
        </span>
      )}
      {runsOut && (
        <span className="usage-card-forecast" title={runsOut.basis}>
          <WarningIcon />
          {spacedText(`${t('UsageBar.runsOutAt', { value1: formatClock(runsOut.at, now) })}${resetAt === null ? '' : t(planned?.kind === 'reset' ? 'quotaAdviceText.beforeExpectedReset' : 'quotaAdviceText.beforeReset', { value1: formatDuration(resetAt - runsOut.at) })}`)}
        </span>
      )}
      {advice.map((item) => (
        <div key={item.kind} className="usage-card-advice-line" data-kind={item.kind}>
          <span className="usage-card-advice-label">{t('UsageBar.advice')}</span>
          {/* The row above already says when it runs out: only what to do about it is left. */}
          {item.kind === 'slow-down' && runsOut ? lighterWorkStep(alternative) : adviceText(item, now, alternative)}
        </div>
      ))}
    </div>
  )
}

// The agent's accounts, each with the window that would stop it first: picking one makes it the
// account the agent's next process starts on.
function AccountList({ accounts, active, now }: { accounts: readonly AgentAccount[]; active: string; now: number }) {
  const readings = useCore((s) => s.accountUsage)
  const display = usePreferences((s) => s.usageDisplay)
  return (
    <div className="usage-card-accounts">
      <div className="usage-card-credits-title">{t('AgentAccounts.title')}</div>
      <div role="radiogroup" aria-label={t('AgentAccounts.title')}>
        {accounts.map((account) => {
          const usage = accountUsage(readings, account.agent, account.id)
          const tightest = tightestWindow(usage?.windows.filter((window) => window.model === null) ?? [])
          const spent = quotaVerdict(usage, now).state === 'exhausted'
          const chosen = account.id === active
          return (
            <button
              key={account.id}
              type="button"
              role="radio"
              aria-checked={chosen}
              className="usage-card-account"
              disabled={!account.signedIn}
              title={chosen ? undefined : t('AgentAccounts.switchTo', { value1: accountName(account) })}
              onClick={() => { if (!chosen) void activateAccount(account.agent, account.id) }}
            >
              <span className="usage-card-account-check" aria-hidden="true">{chosen && <CheckIcon />}</span>
              <span className="usage-card-account-name">{accountName(account)}</span>
              {!account.signedIn ? <span className="usage-card-account-value">{t('InstalledAgentsSettings.notSignedIn')}</span> : tightest ? (
                <>
                  <span className="usage-meter" data-level={usageLevel(tightest.usedPercent)} aria-hidden="true">
                    <span style={{ width: `${shownPercent(tightest, display)}%` }} />
                  </span>
                  <span className="usage-card-account-value" data-level={usageLevel(tightest.usedPercent)}>
                    {spent ? t('AgentAccounts.spent') : `${windowLabel(tightest)} ${percentText(tightest, display)}`}
                  </span>
                </>
              ) : <span className="usage-card-account-value">{t('AgentAccounts.noUsage')}</span>}
            </button>
          )
        })}
      </div>
      <button type="button" className="link-button usage-card-accounts-manage" onClick={() => setSettingsOpen(true, 'accounts')}>{t('AgentAccounts.manage')}</button>
    </div>
  )
}

const CARD_WIDTH = 340
// Hovering past on the way somewhere else should not flash a card.
const CARD_DELAY_MS = 300
const CARD_HIDE_DELAY_MS = 200

// Every window in full, above the segment. Rendered into <body> at a fixed position: inside the
// status bar it would be clipped, and a button may not contain it.
function UsageCard({ usage, accounts, accountLabel, now, advice, alternative, showPace, anchor, id, cardRef, onEnter, onLeave, onRefresh, refreshing, spending, onSpend, onSpendingChange }: {
  usage: AgentUsage
  // The agent's accounts, where it has more than one to switch between; the shown one's name.
  accounts: readonly AgentAccount[]
  accountLabel: string | null
  now: number
  // Empty, and no pace beside the windows, while the user has quota advice off.
  advice: readonly QuotaAdvice[]
  alternative: AgentKind | null
  showPace: boolean
  anchor: DOMRect
  id: string
  cardRef: RefObject<HTMLDivElement | null>
  onEnter: () => void
  onLeave: () => void
  onRefresh: () => void
  refreshing: boolean
  spending: Spending | null
  onSpend: (requestId: string, creditId?: string) => void
  onSpendingChange: (spending: Spending | null) => void
}) {
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - CARD_WIDTH - 8))
  const display = usePreferences((s) => s.usageDisplay)
  // Read against its time mark, a meter's fill shows the pace at a glance.
  const timed = usage.windows.some((window) => elapsedPercent(window, now) !== null)
  const forecasts = useQuotaForecasts().filter((entry) => entry.agent === usage.agent && entry.account === usageAccount(usage))
  const bottom = window.innerHeight - anchor.top + 6
  const footer =
    usage.status === 'error'
      ? `${errorText(usage)}${usage.windows.length > 0 ? t('UsageBar.dataAsOf', { value1: formatClock(usage.updatedAt, now) }) : ''}`
      : t('UsageBar.updatedAgo', { value1: formatDuration(now - usage.updatedAt) })
  return (
    <div
      id={id}
      ref={cardRef}
      role="dialog"
      aria-label={t('UsageBar.usageQuota', { value1: agentLabel(usage.agent) })}
      className="usage-card"
      style={{ left, bottom, width: CARD_WIDTH }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocusCapture={onEnter}
      onBlurCapture={onLeave}
    >
      <div className="usage-card-title">
        <span>
          {agentLabel(usage.agent)}
          {accountLabel && <span className="muted"> · {accountLabel}</span>}
          {usage.plan && <span className="muted"> · {usage.plan}</span>}
        </span>
        {timed && <MeterHint display={display} />}
      </div>
      {usage.windows.map((window) => (
        <UsageWindowRow
          key={`${window.kind}-${window.model}`}
          window={window}
          now={now}
          display={display}
          showPace={showPace}
          forecast={forecasts.find((forecast) => forecast.window.kind === window.kind && forecast.window.model === window.model)}
          advice={advice.filter((item) => item.window.kind === window.kind && item.window.model === window.model)}
          alternative={alternative}
          usage={usage}
        />
      ))}
      {usage.resetCredits && (usage.resetCredits.available > 0 || usage.resetCredits.blockedBy || spending) && (
        <ResetCreditList usage={usage} credits={usage.resetCredits} now={now} spending={spending} onSpend={onSpend} onChange={onSpendingChange} />
      )}
      {usage.globalResets && <GlobalResetList resets={usage.globalResets} now={now} />}
      {accounts.length > 1 && <AccountList accounts={accounts} active={usageAccount(usage)} now={now} />}
      <div className="usage-card-footer">
        <span>{footer}</span>
        <button type="button" className="link-button usage-card-refresh" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? t('UsageBar.refreshing') : t('UsageBar.refreshNow')}
        </button>
      </div>
    </div>
  )
}

// Model-specific caps only take footer space once they are the ones about to bite.
function inlineWindows(windows: readonly UsageWindow[]): UsageWindow[] {
  return windows.filter((window) => window.model === null || usageLevel(window.usedPercent) !== 'normal')
}

function UsageSegment({ usage, now }: { usage: AgentUsage; now: number }) {
  const display = usePreferences((s) => s.usageDisplay)
  const adviceOn = usePreferences((s) => s.quotaAdvice)
  const allUsage = useCore((s) => s.usage)
  const installed = useInstalledAgents()
  const requested = useCore((s) => s.usageCardAgent === usage.agent)
  const allAccounts = useCore((s) => s.accounts)
  const accounts = accountsOf(allAccounts, usage.agent)
  const shownAccount = accounts.length > 1 ? accounts.find((account) => account.id === usageAccount(usage)) : undefined
  const accountLabel = shownAccount ? accountName(shownAccount) : null
  const advice = adviceOn ? agentAdvice(usage, now) : []
  const usages = AGENT_KINDS.map((agent) => allUsage?.[agent]).filter((entry) => entry !== undefined)
  const alternative = advice.length > 0 ? alternativeAgent(usage.agent, usages, installed, now) : null
  // Worth a mark on the status bar: quota about to go unused, or running out early.
  const nudge = advice.find((item) => item.kind === 'use-more' || item.kind === 'slow-down')
  const windows = inlineWindows(usage.windows)
  // The meter follows the numbers beside it, so a model's cap moves it once it is shown.
  const tightest = tightestWindow(windows)
  const cardId = useId()
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [pinned, setPinned] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [spending, setSpending] = useState<Spending | null>(null)
  // Asking, waiting or failed: the card stays put however the pointer wanders.
  const holding = spending !== null && spending.phase !== 'done'
  const trigger = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const close = useCallback(() => {
    clearTimeout(timer.current)
    setPinned(false)
    setAnchor(null)
  }, [])
  const show = (element: HTMLElement, delay: number) => {
    if (pinned) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setAnchor(element.getBoundingClientRect()), delay)
  }
  const hide = () => {
    clearTimeout(timer.current)
    if (!pinned && !holding) timer.current = setTimeout(() => setAnchor(null), CARD_HIDE_DELAY_MS)
  }
  const keepOpen = () => clearTimeout(timer.current)
  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await refreshUsage()
    } finally {
      setRefreshing(false)
    }
  }
  const spend = async (requestId: string, creditId?: string) => {
    setSpending({ phase: 'pending', creditId, requestId })
    try {
      setSpending({ phase: 'done', outcome: await spendResetCredit(usage.agent, requestId, creditId, usageAccount(usage)) })
    } catch (error) {
      setSpending({ phase: 'failed', creditId, requestId, error: error instanceof Error ? error.message : String(error) })
    }
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  // A closed card starts over, but one still spending reports when it is next opened.
  useEffect(() => {
    if (!anchor) setSpending((spending) => (spending?.phase === 'pending' ? spending : null))
  }, [anchor])
  useEffect(() => {
    if (!anchor) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !card.current?.contains(event.target)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [anchor, close])
  useEffect(() => {
    // Past the info buttons: focused, one would open its tooltip over the card unasked.
    if (pinned) card.current?.querySelector<HTMLButtonElement>('button:not(.usage-card-meter-info, .usage-card-global-info)')?.focus()
  }, [pinned])
  // A quota notification clicked: open this card as a click on it would.
  useEffect(() => {
    if (!requested || !trigger.current) return
    clearTimeout(timer.current)
    setAnchor(trigger.current.getBoundingClientRect())
    setPinned(true)
    openUsageCard(null)
  }, [requested])
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="usage-segment"
        data-stale={usage.status === 'error' || undefined}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        aria-controls={anchor ? cardId : undefined}
        onMouseEnter={(event) => show(event.currentTarget, CARD_DELAY_MS)}
        onMouseLeave={hide}
        onClick={(event) => {
          if (pinned) close()
          else {
            clearTimeout(timer.current)
            setAnchor(event.currentTarget.getBoundingClientRect())
            setPinned(true)
          }
        }}
      >
        {/* Just the mark: the card that opens on hover leads with the full name. */}
        <span className="usage-agent" role="img" aria-label={agentLabel(usage.agent)}>
          <AgentIcon agent={usage.agent} />
        </span>
        {accountLabel && <span className="usage-account">{accountLabel}</span>}
        {tightest && (
          <span className="usage-meter" data-level={usageLevel(tightest.usedPercent)} aria-hidden="true">
            <span style={{ width: `${shownPercent(tightest, display)}%` }} />
          </span>
        )}
        {windows.map((window, index) => (
          <span key={`${window.kind}-${window.model}`} className="usage-window" data-level={usageLevel(window.usedPercent)}>
            {index > 0 && <span className="usage-separator">·</span>}
            {windowLabel(window)} {percentText(window, display)}
          </span>
        ))}
        {usage.resetCredits && usage.resetCredits.available > 0 && (
          <span className="usage-credits" data-soon={expiresSoon(usage.resetCredits.credits[0]?.expiresAt ?? null, now) || undefined}>{tr('UsageBar.resetCards_2190', { value1: usage.resetCredits.available })}</span>
        )}
        {usage.globalResets?.upcoming && <span className="usage-global-soon">{t('UsageBar.resettingSoon')}</span>}
        {nudge && <span className="usage-advice-dot" data-kind={nudge.kind} role="img" aria-label={t('UsageBar.quotaAdviceAvailable')} />}
        {usage.status === 'error' && (
          <span className="usage-stale" role="img" aria-label={errorText(usage)}>
            ⚠
          </span>
        )}
      </button>
      {anchor && createPortal(
        <UsageCard
          usage={usage}
          accounts={accounts}
          accountLabel={accountLabel}
          now={now}
          advice={advice}
          alternative={alternative}
          showPace={adviceOn}
          anchor={anchor}
          id={cardId}
          cardRef={card}
          onEnter={keepOpen}
          onLeave={hide}
          onRefresh={() => void refresh()}
          refreshing={refreshing}
          spending={spending}
          onSpend={(requestId, creditId) => void spend(requestId, creditId)}
          onSpendingChange={setSpending}
        />,
        document.body
      )}
    </>
  )
}

export function UsageBar() {
  const usage = useCore((s) => s.usage)
  const visible = usePreferences((s) => s.showUsage)
  const hidden = usePreferences((s) => s.hiddenUsageAgents)
  const now = useNow(60_000)

  // An older core has no usage methods: show nothing rather than a dead segment.
  if (usage === null || !visible) {
    return null
  }
  const known = AGENT_KINDS.map((agent) => usage[agent]).filter((entry) => entry !== undefined)
  const selected = known.filter((entry) => !hidden.includes(entry.agent))
  if (known.length > 0 && selected.length === 0) return null
  const shown = selected.filter((entry) => entry.status !== 'signed-out')

  return (
    <div className="statusbar-group" aria-label={t('UsageBar.agentUsageQuota')}>
      {known.length === 0 && <span className="statusbar-hint">{t('UsageBar.loadingUsageQuota')}</span>}
      {known.length > 0 && shown.length === 0 && (
        <span className="statusbar-hint">{tr('UsageBar.noSignInDetectedForUsageQuotaAppears', { value1: new Intl.ListFormat(getLocale(), { type: 'disjunction' }).format(selected.map((entry) => agentLabel(entry.agent))) })}</span>
      )}
      {shown.map((entry) => (
        <UsageSegment key={entry.agent} usage={entry} now={now} />
      ))}
    </div>
  )
}
