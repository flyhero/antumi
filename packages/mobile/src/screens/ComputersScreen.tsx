import { StyleSheet, Text, View } from 'react-native'
import { Laptop, Plus, QrCode, Settings } from 'lucide-react-native'
import { QuotaCards, useNow } from '../components/quota'
import { UpdateBanner } from '../components/update-banner'
import { Button, EmptyState, IconButton, ListGroup, ListRow, Screen, SectionLabel } from '../components/ui'
import { ago, t } from '../i18n'
import { push } from '../navigation'
import { connect, useSession } from '../session'
import { radius, space, type, useTheme } from '../theme'

function ComputerIcon({ online }: { online: boolean }) {
  const theme = useTheme()
  return (
    <View style={[styles.icon, { backgroundColor: online ? theme.accentSoft : theme.raised }]}>
      <Laptop size={20} color={online ? theme.accent : theme.textMuted} strokeWidth={1.8} />
    </View>
  )
}

export function ComputersScreen() {
  const theme = useTheme()
  const computers = useSession((s) => s.computers)
  const current = useSession((s) => s.current)
  const status = useSession((s) => s.status)
  const usage = useSession((s) => s.usage)
  const now = useNow()
  const connected = computers.find((computer) => computer.key === current)
  const settingsButton = <IconButton icon={Settings} label={t('settings')} onPress={() => push({ name: 'settings', app: true })} />
  if (computers.length === 0) {
    return (
      <Screen large title={t('appName')} actions={settingsButton}>
        <EmptyState
          icon={QrCode}
          image={require('../../assets/icon.png')}
          title={t('connectTitle')}
          body={t('noComputers')}
          action={<Button label={t('scanToPair')} kind="primary" icon={QrCode} onPress={() => push({ name: 'pair' })} style={styles.cta} />}
        />
      </Screen>
    )
  }
  return (
    <Screen large title={t('computers')} actions={<>{settingsButton}<IconButton icon={Plus} label={t('addComputer')} onPress={() => push({ name: 'pair' })} /></>}>
      <UpdateBanner />
      <ListGroup>
        {computers.map((computer) => {
          const live = computer.key === current ? status : null
          const detail = live === 'online' ? t('online') : live === 'connecting' ? t('connecting') : live === 'revoked' ? t('revoked')
            : computer.lastOnlineAt ? t('offlineSince', { when: ago(computer.lastOnlineAt) }) : t('offline')
          return (
            <ListRow
              key={computer.key}
              leading={<ComputerIcon online={live === 'online'} />}
              title={computer.name}
              subtitle={detail}
              subtitleTone={live === 'revoked' ? 'danger' : 'muted'}
              trailing={<Text style={[type.caption, { color: theme.text3 }]}>{computer.access === 'operate' ? t('accessOperate') : t('accessView')}</Text>}
              onPress={() => {
                if (computer.key !== current || status !== 'online') void connect(computer.key)
                push({ name: 'conversations' })
              }}
            />
          )
        })}
      </ListGroup>
      {connected && usage?.some((each) => each.status !== 'signed-out' && each.windows.length > 0) ? (
        <View style={styles.quota}>
          <SectionLabel title={computers.length > 1 ? t('quotaOn', { name: connected.name }) : t('quota')} />
          <QuotaCards usage={usage} now={now} />
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  cta: { marginTop: 8, alignSelf: 'stretch' },
  quota: { gap: space.sm }
})
