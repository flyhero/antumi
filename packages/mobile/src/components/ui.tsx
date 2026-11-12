import { useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, Image, Pressable, RefreshControl, StyleSheet, Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { ChevronLeft, ChevronRight, CloudOff, type LucideIcon } from 'lucide-react-native'
import type { AgentKind } from '@antumi/protocol'
import { ago, t } from '../i18n'
import { push } from '../navigation'
import { computerOf, connect, dismissNotice, useSession } from '../session'
import { radius, space, type, useTheme } from '../theme'
import { AgentMark } from './agent-mark'

// The pieces every screen is built of.

export const tap = () => void Haptics.selectionAsync().catch(() => {})
export const confirmTap = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})

export function IconButton({ icon: Icon, label, onPress, tone = 'plain', disabled = false }: { icon: LucideIcon; label: string; onPress: () => void; tone?: 'plain' | 'accent'; disabled?: boolean }) {
  const theme = useTheme()
  const background = tone === 'accent' ? theme.accent : theme.raised
  const color = tone === 'accent' ? theme.accentText : theme.text
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        tap()
        onPress()
      }}
      style={({ pressed }) => [styles.iconButton, { backgroundColor: background, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}
    >
      <Icon size={19} color={color} strokeWidth={2} />
    </Pressable>
  )
}

type ScreenProps = {
  title: string
  subtitle?: ReactNode
  // A list screen: a large title under the bar instead of one in it.
  large?: boolean
  onBack?: () => void
  actions?: ReactNode
  children: ReactNode
  // Content that scrolls; false for a screen that lays itself out (the chat).
  scroll?: boolean
  onRefresh?: () => Promise<void>
}

export function Screen({ title, subtitle, large = false, onBack, actions, children, scroll = true, onRefresh }: ScreenProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [refreshing, setRefreshing] = useState(false)
  const refresh = onRefresh ? async () => {
    setRefreshing(true)
    await onRefresh().finally(() => setRefreshing(false))
  } : undefined
  const header = (
    <View style={[styles.bar, { paddingTop: insets.top + space.sm }]}>
      {onBack ? <IconButton icon={ChevronLeft} label={t('back')} onPress={onBack} /> : null}
      <View style={styles.barTitle}>
        {large ? null : (
          <>
            <Text style={[type.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
            {subtitle ? <View>{typeof subtitle === 'string' ? <Text style={[type.caption, { color: theme.textMuted }]} numberOfLines={1}>{subtitle}</Text> : subtitle}</View> : null}
          </>
        )}
      </View>
      <View style={styles.barActions}>{actions}</View>
    </View>
  )
  const heading = large ? (
    <View style={styles.largeHeading}>
      <Text style={[type.largeTitle, { color: theme.text }]} numberOfLines={1}>{title}</Text>
      {subtitle ? (typeof subtitle === 'string' ? <Text style={[type.secondary, { color: theme.textMuted }]}>{subtitle}</Text> : subtitle) : null}
    </View>
  ) : null
  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      {header}
      {scroll ? (
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
          refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.textMuted} colors={[theme.accent]} /> : undefined}
        >
          {heading}
          <LinkBanner />
          {children}
        </KeyboardAwareScrollView>
      ) : (
        <View style={styles.fill}>
          <LinkBanner inset />
          {children}
        </View>
      )}
      <NoticeToast />
    </View>
  )
}

export function Button({ label, onPress, kind = 'secondary', icon: Icon, disabled = false, busy = false, wide = false, style }: {
  label: string
  onPress: () => void
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: LucideIcon
  disabled?: boolean
  busy?: boolean
  wide?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  const background = kind === 'primary' ? theme.accent : kind === 'secondary' ? theme.raised : kind === 'danger' ? theme.dangerSoft : 'transparent'
  const color = kind === 'primary' ? theme.accentText : kind === 'danger' ? theme.danger : kind === 'ghost' ? theme.accent : theme.text
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={() => {
        tap()
        onPress()
      }}
      style={({ pressed }) => [styles.button, wide && styles.buttonWide, { backgroundColor: background, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }, style]}
    >
      {busy ? <ActivityIndicator color={color} /> : (
        <>
          {Icon ? <Icon size={18} color={color} strokeWidth={2} /> : null}
          <Text style={[styles.buttonText, { color }]}>{label}</Text>
        </>
      )}
    </Pressable>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme()
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }, style]}>{children}</View>
}

// Rows in one rounded card, divided by hairlines that start where the text does.
export function ListGroup({ children, title }: { children: ReactNode; title?: string }) {
  const theme = useTheme()
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean)
  return (
    <View style={styles.group}>
      {title ? <SectionLabel title={title} /> : null}
      <View style={[styles.groupCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {rows.map((row, index) => (
          <View key={index}>
            {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
            {row}
          </View>
        ))}
      </View>
    </View>
  )
}

export function ListRow({ leading, title, subtitle, subtitleTone, subtitleLines = 1, trailing, onPress, chevron = Boolean(onPress) }: {
  leading?: ReactNode
  title: string
  subtitle?: string | null
  subtitleTone?: 'muted' | 'waiting' | 'running' | 'danger'
  subtitleLines?: number
  trailing?: ReactNode
  onPress?: () => void
  chevron?: boolean
}) {
  const theme = useTheme()
  const tone = subtitleTone === 'waiting' ? theme.waiting : subtitleTone === 'running' ? theme.running : subtitleTone === 'danger' ? theme.danger : theme.textMuted
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress ? () => {
        tap()
        onPress()
      } : undefined}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.raised : 'transparent' }]}
    >
      {leading ? <View style={styles.rowLeading}>{leading}</View> : null}
      <View style={styles.rowMain}>
        <Text style={[type.rowTitle, { color: theme.text }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[type.secondary, { color: tone }]} numberOfLines={subtitleLines}>{subtitle}</Text> : null}
      </View>
      {trailing}
      {chevron ? <ChevronRight size={18} color={theme.text3} /> : null}
    </Pressable>
  )
}

export function SectionLabel({ title, count, right }: { title: string; count?: number; right?: ReactNode }) {
  const theme = useTheme()
  return (
    <View style={styles.sectionLabel}>
      <Text style={[type.caption, styles.sectionText, { color: theme.textMuted }]}>{title}</Text>
      {count !== undefined ? <Text style={[type.caption, { color: theme.text3 }]}>{count}</Text> : null}
      <View style={styles.fill} />
      {right}
    </View>
  )
}

export function Muted({ children, center = false }: { children: ReactNode; center?: boolean }) {
  const theme = useTheme()
  return <Text style={[type.secondary, { color: theme.textMuted }, center && styles.center]}>{children}</Text>
}

export function EmptyState({ icon: Icon, image, title, body, action }: { icon: LucideIcon; image?: ImageSourcePropType; title: string; body?: string; action?: ReactNode }) {
  const theme = useTheme()
  return (
    <View style={styles.empty}>
      {image ? <Image source={image} style={styles.emptyImage} /> : <View style={[styles.emptyIcon, { backgroundColor: theme.accentSoft }]}><Icon size={28} color={theme.accent} strokeWidth={1.8} /></View>}
      <Text style={[type.title, { color: theme.text }, styles.center]}>{title}</Text>
      {body ? <Text style={[type.secondary, { color: theme.textMuted }, styles.center]}>{body}</Text> : null}
      {action}
    </View>
  )
}

export type AvatarStatus = 'waiting' | 'running' | 'failed' | null

// An agent's mark on a soft disc, with a corner badge for what it is doing.
export function AgentAvatar({ agent, size = 40, status = null }: { agent: AgentKind; size?: number; status?: AvatarStatus }) {
  const theme = useTheme()
  const badge = status === 'waiting' ? theme.waiting : status === 'running' ? theme.running : status === 'failed' ? theme.danger : null
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.raised }]}>
        <AgentMark agent={agent} size={size * 0.5} color={theme.text} />
      </View>
      {badge ? <View style={[styles.badge, { backgroundColor: badge, borderColor: theme.surface }]} /> : null}
    </View>
  )
}

export function StatusPill({ label, tone }: { label: string; tone: 'waiting' | 'running' | 'success' | 'neutral' }) {
  const theme = useTheme()
  const color = tone === 'waiting' ? theme.waiting : tone === 'running' ? theme.running : tone === 'success' ? theme.success : theme.textMuted
  const background = tone === 'waiting' ? theme.waitingSoft : tone === 'running' ? theme.runningSoft : theme.raised
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={[type.micro, { color }]}>{label}</Text>
    </View>
  )
}

// Where the link to the computer stands, when it is not simply up.
function LinkBanner({ inset = false }: { inset?: boolean }) {
  const theme = useTheme()
  const status = useSession((s) => s.status)
  const computer = useSession(computerOf)
  if (!computer || status === 'online' || status === 'idle') return null
  const connecting = status === 'connecting'
  const text = connecting ? t('connecting') : status === 'revoked' ? t('revoked')
    : computer.lastOnlineAt ? t('offlineSince', { when: ago(computer.lastOnlineAt) }) : t('offline')
  return (
    <View style={[styles.banner, inset && styles.bannerInset, { backgroundColor: status === 'revoked' ? theme.dangerSoft : theme.surface, borderColor: theme.border }]} accessibilityLiveRegion="polite">
      <View style={styles.bannerHead}>
        {connecting ? <ActivityIndicator size="small" color={theme.textMuted} /> : <CloudOff size={18} color={status === 'revoked' ? theme.danger : theme.textMuted} />}
        <Text style={[type.secondary, styles.bannerTitle, { color: theme.text }]}>{text}</Text>
      </View>
      {status === 'offline' ? (
        <>
          <Text style={[type.caption, { color: theme.textMuted }]}>{t('offlineHint')}</Text>
          <Button label={t('retry')} onPress={() => void connect(computer.key)} style={styles.bannerButton} />
        </>
      ) : status === 'revoked' ? <Button label={t('rescan')} onPress={() => push({ name: 'pair' })} style={styles.bannerButton} /> : null}
    </View>
  )
}

function NoticeToast() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const notice = useSession((s) => s.notice)
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(dismissNotice, 4_000)
    return () => clearTimeout(timer)
  }, [notice])
  if (!notice) return null
  return (
    <Pressable onPress={dismissNotice} style={[styles.toast, { backgroundColor: theme.text, bottom: insets.bottom + 96 }]} accessibilityLiveRegion="assertive">
      <Text style={[type.secondary, { color: theme.bg }]}>{notice}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.md, minHeight: 56 },
  barTitle: { flex: 1, gap: 1 },
  barActions: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  largeHeading: { gap: space.xs, paddingBottom: space.sm },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.lg },
  iconButton: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 46, paddingHorizontal: space.lg, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm },
  buttonWide: { alignSelf: 'stretch' },
  buttonText: { fontSize: 15, fontWeight: '600' },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.md, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 0 },
  group: { gap: space.sm },
  groupCard: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 68 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  rowLeading: { width: 40, alignItems: 'center' },
  rowMain: { flex: 1, gap: 3 },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs },
  sectionText: { fontWeight: '600' },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: 48, paddingHorizontal: space.xxl },
  emptyImage: { width: 88, height: 88, borderRadius: 22, marginBottom: space.sm },
  emptyIcon: { width: 64, height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: radius.pill, borderWidth: 2.5 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillDot: { width: 6, height: 6, borderRadius: radius.pill },
  banner: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.sm },
  bannerInset: { marginHorizontal: space.lg, marginBottom: space.sm },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bannerTitle: { flex: 1, fontWeight: '600' },
  bannerButton: { alignSelf: 'flex-start', minHeight: 38 },
  toast: { position: 'absolute', left: space.xl, right: space.xl, paddingVertical: space.md, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center' }
})
