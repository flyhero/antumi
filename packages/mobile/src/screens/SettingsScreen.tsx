import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Linking, StyleSheet, Switch, Text, View } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import { BatteryCharging, Bell, Download, Fingerprint, Info, Laptop, LogOut, RefreshCw, Shield } from 'lucide-react-native'
import { ListGroup, ListRow, Muted, Screen } from '../components/ui'
import { t } from '../i18n'
import { pop, reset } from '../navigation'
import { computerOf, forget, pushTurnedOff, pushTurnedOn, setLock, useSession } from '../session'
import { openAppSettings, pushAvailable, startPush, usePush, type PushState } from '../push'
import { radius, type, useTheme } from '../theme'
import { checkNow, currentVersion, useUpdate, type Update } from '../updates'

function RowIcon({ icon: Icon, tone = 'plain' }: { icon: typeof Info; tone?: 'plain' | 'danger' | 'accent' }) {
  const theme = useTheme()
  const color = tone === 'danger' ? theme.danger : tone === 'accent' ? theme.accent : theme.text
  const background = tone === 'danger' ? theme.dangerSoft : tone === 'accent' ? theme.accentSoft : theme.raised
  return <View style={[styles.icon, { backgroundColor: background }]}><Icon size={18} color={color} strokeWidth={1.9} /></View>
}

function pushText(state: PushState, refused: string | null): string {
  if (refused) return refused
  switch (state.kind) {
    case 'off': return t('pushOff')
    case 'pending': return t('pushPending')
    case 'on': return t('pushOn')
    case 'unsupported': return t('pushUnsupported')
    case 'failed': return state.reason === 'ACTION_REQUIRED' ? t('pushActionRequired') : t('pushFailed', { reason: state.reason })
  }
}

// Push notifications through the phone's UnifiedPush app, for whichever computer is connected.
function PushGroup() {
  const theme = useTheme()
  const state = usePush((s) => s.state)
  const [refused, setRefused] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const turn = async (on: boolean) => {
    setBusy(true)
    setRefused(null)
    try {
      if (!on) return await pushTurnedOff()
      const why = await startPush()
      if (why === 'no-distributor') setRefused(t('pushNoDistributor'))
      else if (why === 'denied') setRefused(t('pushDenied'))
      else if (why === null) await pushTurnedOn()
    } finally {
      setBusy(false)
    }
  }
  const on = state.kind !== 'off'
  return (
    <ListGroup title={t('notifications')}>
      <ListRow leading={<RowIcon icon={Bell} />} title={t('pushTitle')} subtitle={pushText(state, refused)} subtitleLines={4} chevron={false}
        trailing={<Switch value={on} disabled={busy} onValueChange={(value) => void turn(value)} trackColor={{ true: theme.accent, false: theme.sunken }} thumbColor="#FFFFFF" />} />
      {on ? <ListRow leading={<RowIcon icon={BatteryCharging} />} title={t('pushBackground')} subtitle={t('pushBackgroundHint')} subtitleLines={4} onPress={openAppSettings} /> : null}
    </ListGroup>
  )
}

export function SettingsScreen({ app }: { app: boolean }) {
  const theme = useTheme()
  const settings = useSession((s) => s.settings)
  const current = useSession(computerOf)
  const computer = app ? null : current
  const [lockable, setLockable] = useState<boolean | null>(null)
  const [checked, setChecked] = useState<Update | null | 'checking' | 'none' | 'failed'>(null)
  // One the daily check found shows here before anything is checked by hand.
  const found = useUpdate((s) => s.found)
  const update = checked ?? found
  useEffect(() => {
    void Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.getEnrolledLevelAsync()])
      .then(([hardware, level]) => setLockable(hardware && level !== LocalAuthentication.SecurityLevel.NONE))
  }, [])
  const check = async () => {
    setChecked('checking')
    try {
      setChecked((await checkNow()) ?? 'none')
    } catch {
      setChecked('failed')
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
      {pushAvailable() ? <PushGroup /> : null}
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
