import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Download, X } from 'lucide-react-native'
import { t } from '../i18n'
import { radius, space, type, useTheme } from '../theme'
import { dismissUpdate, useUpdate } from '../updates'
import { tap } from './ui'

// A newer version, on the pages the app opens on, until it is downloaded or closed for it.
export function UpdateBanner() {
  const theme = useTheme()
  const found = useUpdate((s) => s.found)
  const dismissed = useUpdate((s) => s.dismissed)
  if (!found || found.version === dismissed) return null
  return (
    <View style={[styles.banner, { backgroundColor: theme.accentSoft }]} accessibilityLiveRegion="polite">
      <Pressable accessibilityRole="link" onPress={() => { tap(); void Linking.openURL(found.url) }} style={styles.body}>
        <Download size={18} color={theme.accent} strokeWidth={2} />
        <Text style={[type.secondary, styles.text, { color: theme.text }]} numberOfLines={1}>{t('updateAvailable', { version: found.version })}</Text>
        <Text style={[type.secondary, styles.action, { color: theme.accent }]}>{t('download')}</Text>
      </Pressable>
      <Pressable accessibilityLabel={t('close')} hitSlop={8} onPress={() => dismissUpdate(found.version)} style={styles.close}>
        <X size={16} color={theme.textMuted} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, paddingLeft: space.md, paddingRight: space.sm },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  text: { flexShrink: 1 },
  action: { fontWeight: '600', marginLeft: 'auto' },
  close: { padding: space.sm }
})
