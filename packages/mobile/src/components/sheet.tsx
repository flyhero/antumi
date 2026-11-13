import type { ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, X } from 'lucide-react-native'
import { IconButton, tap } from './ui'
import { t } from '../i18n'
import { radius, space, type, useTheme } from '../theme'

// A panel rising from the bottom over the page, closed by its X, the backdrop or back.
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + space.lg }]}>
        <View style={[styles.grabber, { backgroundColor: theme.borderStrong }]} />
        <View style={styles.head}>
          <Text style={[type.title, styles.flex, { color: theme.text }]}>{title}</Text>
          <IconButton icon={X} label={t('close')} onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
      </View>
    </Modal>
  )
}

export type Choice = { value: string; label: string; detail?: string | null }

// One question of a sheet: its answers in a card, the current one checked.
export function ChoiceList({ title, choices, current, onPick }: { title?: string; choices: readonly Choice[]; current: string | null; onPick: (value: string) => void }) {
  const theme = useTheme()
  if (choices.length === 0) return null
  return (
    <View style={styles.group}>
      {title ? <Text style={[type.caption, styles.groupTitle, { color: theme.textMuted }]}>{title}</Text> : null}
      <View style={[styles.card, { backgroundColor: theme.raised }]}>
        {choices.map(({ value, label, detail }, index) => (
          <Pressable key={value} onPress={() => { tap(); onPick(value) }} style={[styles.row, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.flex}>
              <Text style={[type.secondary, { color: theme.text, fontWeight: value === current ? '600' : '400' }]}>{label}</Text>
              {detail ? <Text style={[type.caption, { color: theme.textMuted }]} numberOfLines={1}>{detail}</Text> : null}
            </View>
            {value === current ? <Check size={18} color={theme.accent} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1 },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '78%', paddingTop: space.sm },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: radius.pill, marginBottom: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingBottom: space.sm },
  body: { paddingHorizontal: space.lg, gap: space.lg, paddingBottom: space.lg },
  group: { gap: space.sm },
  groupTitle: { fontWeight: '600', paddingHorizontal: space.xs },
  card: { borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 13 }
})
