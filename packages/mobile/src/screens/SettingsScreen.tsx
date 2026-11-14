import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Linking, StyleSheet, Switch, Text, View } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import { Download, Fingerprint, Info, Laptop, LogOut, RefreshCw, Shield } from 'lucide-react-native'
import { ListGroup, ListRow, Muted, Screen } from '../components/ui'
import { t } from '../i18n'
import { pop, reset } from '../navigation'
import { computerOf, forget, setLock, useSession } from '../session'
import { radius, type, useTheme } from '../theme'
import { checkForUpdate, currentVersion, type Update } from '../updates'

function RowIcon({ icon: Icon, tone = 'plain' }: { icon: typeof Info; tone?: 'plain' | 'danger' | 'accent' }) {
  const theme = useTheme()
  const color = tone === 'danger' ? theme.danger : tone === 'accent' ? theme.accent : theme.text
  const background = tone === 'danger' ? theme.dangerSoft : tone === 'accent' ? theme.accentSoft : theme.raised
  return <View style={[styles.icon, { backgroundColor: background }]}><Icon size={18} color={color} strokeWidth={1.9} /></View>
}

export function SettingsScreen({ app }: { app: boolean }) {
  const theme = useTheme()
  const settings = useSession((s) => s.settings)
  const current = useSession(computerOf)
  const computer = app ? null : current
  const [lockable, setLockable] = useState<boolean | null>(null)
  const [update, setUpdate] = useState<Update | null | 'checking' | 'none' | 'failed'>(null)
  useEffect(() => {
    void Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.getEnrolledLevelAsync()])
      .then(([hardware, level]) => setLockable(hardware && level !== LocalAuthentication.SecurityLevel.NONE))
  }, [])
  const check = async () => {
    setUpdate('checking')
    try {
      setUpdate((await checkForUpdate()) ?? 'none')
    } catch {
      setUpdate('failed')
    }
  }
  const unpair = () => {
    if (!computer) return
    Alert.alert(t('forget'), t('forgetConfirm', { name: computer.name }), [
      { text: t('back'), style: 'cancel' },
      { text: t('forget'), style: 'destructive', onPress: () => void forget(computer.key).then(() => reset({ name: 'computers' })) }
    ])
  }
  const updateText = update === 'checking' ? null : update === 'none' ? t('upToDate') : update === 'failed' ? t('updateFailed') : update ? t('updateAvailable', { version: update.version }) : null
  return (
    <Screen large title={t('settings')} onBack={() => pop()} linkBanner={!app}>
      <ListGroup title={t('security')}>
        <ListRow leading={<RowIcon icon={Fingerprint} />} title={t('lockOnOpen')} subtitle={lockable === false ? t('lockUnavailable') : null} subtitleLines={3} chevron={false}
          trailing={<Switch value={settings.lock} disabled={!lockable} onValueChange={(lock) => void setLock(lock)} trackColor={{ true: theme.accent, false: theme.sunken }} thumbColor="#FFFFFF" />} />
      </ListGroup>
      {computer ? (
        <ListGroup title={t('thisComputer')}>
          <ListRow leading={<RowIcon icon={Laptop} />} title={computer.name} subtitle={computer.hosts.join(' · ')} chevron={false} />
          <ListRow leading={<RowIcon icon={Shield} />} title={t('access')} chevron={false}
            trailing={<Text style={[type.secondary, { color: theme.textMuted }]}>{computer.access === 'operate' ? t('accessOperate') : t('accessView')}</Text>} />
          <ListRow leading={<RowIcon icon={LogOut} tone="danger" />} title={t('forget')} chevron={false} onPress={unpair} />
        </ListGroup>
      ) : null}
      <ListGroup title={t('about')}>
        <ListRow leading={<RowIcon icon={Info} />} title={t('appName')} chevron={false} trailing={<Text style={[type.secondary, { color: theme.textMuted }]}>{currentVersion()}</Text>} />
        <ListRow leading={<RowIcon icon={RefreshCw} />} title={t('checkUpdate')} subtitle={updateText} subtitleLines={3} chevron={false}
          trailing={update === 'checking' ? <ActivityIndicator color={theme.textMuted} /> : null} onPress={() => void check()} />
        {update && typeof update === 'object' ? (
          <ListRow leading={<RowIcon icon={Download} tone="accent" />} title={t('download')} subtitle={update.version} onPress={() => void Linking.openURL(update.url)} />
        ) : null}
      </ListGroup>
      <Muted center>{t('settingsFooter')}</Muted>
    </Screen>
  )
}

const styles = StyleSheet.create({
  icon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' }
})
