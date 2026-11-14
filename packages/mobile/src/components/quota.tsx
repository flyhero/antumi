import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { QUOTA_STALE_MS, usageLevel, type AgentUsage, type UsageWindow } from '@antumi/protocol'
import { ago, t } from '../i18n'
import { agentName } from '../labels'
import { resetText, shownQuotas, usedText, windowName } from '../quota-text'
import { useSession } from '../session'
import { radius, space, type, useTheme, type Theme } from '../theme'
import { AgentMark } from './agent-mark'
import { Sheet } from './sheet'
import { AgentAvatar, Card, tap } from './ui'

// Each agent's usage limits on the computer: a strip of the tightest ones, and a card per agent.

// Resets count down, so what is shown is redrawn as time passes.
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

// Yellow from 60% used, red from 80%, as on the desktop.
function toneColor(theme: Theme, usedPercent: number, normal: string): string {
  const level = usageLevel(usedPercent)
  return level === 'critical' ? theme.danger : level === 'warning' ? theme.waiting : normal
}

// One chip per agent, its tightest window; tapped, every window of every agent.
export function QuotaStrip() {
  const theme = useTheme()
  const usage = useSession((s) => s.usage)
  const now = useNow()
  const [open, setOpen] = useState(false)
  const shown = shownQuotas(usage, now)
  if (shown.length === 0) return null
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={t('quota')} onPress={() => { tap(); setOpen(true) }} style={styles.strip}>
        {shown.map(({ usage: each, verdict: { window } }) => {
          const reset = resetText(window, now, true)
          return (
            <View key={`${each.agent}:${each.account ?? ''}`} style={[styles.chip, { backgroundColor: theme.raised }]}>
              <AgentMark agent={each.agent} size={13} color={theme.text} />
              <Text style={[type.caption, styles.percent, { color: toneColor(theme, window.usedPercent, theme.text) }]}>
                {window.usedPercent >= 100 ? t('quotaSpent') : `${Math.round(window.usedPercent)}%`}
              </Text>
              {reset ? <Text style={[type.caption, { color: theme.textMuted }]} numberOfLines={1}>· {reset}</Text> : null}
            </View>
          )
        })}
      </Pressable>
      {open ? (
        <Sheet title={t('quota')} onClose={() => setOpen(false)}>
          <QuotaCards usage={usage} now={now} />
        </Sheet>
      ) : null}
    </>
  )
}

function WindowRow({ window, now }: { window: UsageWindow; now: number }) {
  const theme = useTheme()
  const color = toneColor(theme, window.usedPercent, theme.text)
  const reset = resetText(window, now)
  return (
    <View style={styles.window}>
      <View style={styles.windowHead}>
        <Text style={[type.secondary, { color: theme.text }]}>{windowName(window)}</Text>
        <Text style={[type.caption, styles.flex, { color: theme.text3 }]} numberOfLines={1}>{reset ? `· ${reset}` : ''}</Text>
        <Text style={[type.secondary, styles.percent, { color }]}>{usedText(window)}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: theme.raised }]}>
        <View style={[styles.fill, { width: `${Math.min(100, Math.max(2, window.usedPercent))}%`, backgroundColor: toneColor(theme, window.usedPercent, theme.success) }]} />
      </View>
    </View>
  )
}

function QuotaCard({ usage, now }: { usage: AgentUsage; now: number }) {
  const theme = useTheme()
  const stale = usage.status === 'error' || now - usage.updatedAt > QUOTA_STALE_MS
  return (
    <Card>
      <View style={styles.cardHead}>
        <AgentAvatar agent={usage.agent} size={28} />
        <Text style={[type.rowTitle, { color: theme.text }]} numberOfLines={1}>{agentName(usage.agent)}</Text>
        <Text style={[type.caption, styles.flex, { color: theme.textMuted }]} numberOfLines={1}>{usage.plan ?? ''}</Text>
        {stale ? <Text style={[type.caption, { color: theme.text3 }]}>{t('quotaUpdated', { when: ago(usage.updatedAt, now) })}</Text> : null}
      </View>
      {usage.windows.map((window) => <WindowRow key={`${window.kind}:${window.model ?? ''}`} window={window} now={now} />)}
    </Card>
  )
}

// Every agent the computer has a reading for.
export function QuotaCards({ usage, now }: { usage: readonly AgentUsage[] | null; now: number }) {
  const read = (usage ?? []).filter((each) => each.status !== 'signed-out' && each.windows.length > 0)
  return <>{read.map((each) => <QuotaCard key={`${each.agent}:${each.account ?? ''}`} usage={each} now={now} />)}</>
}

export function QuotaWarning({ text }: { text: string }) {
  const theme = useTheme()
  return (
    <View style={[styles.warning, { backgroundColor: theme.dangerSoft }]} accessibilityLiveRegion="polite">
      <Text style={[type.secondary, { color: theme.danger }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingTop: space.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 10, borderRadius: radius.pill, maxWidth: '100%' },
  percent: { fontWeight: '600' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  window: { gap: 7 },
  windowHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: { height: 5, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 5, borderRadius: radius.pill },
  warning: { borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm }
})
