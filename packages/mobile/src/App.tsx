import { useEffect, useState } from 'react'
import { BackHandler, Linking, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { Fingerprint } from 'lucide-react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import { Button } from './components/ui'
import { t } from './i18n'
import { decodePairingCode } from '@antumi/protocol'
import { pop, push, reset, useNavigation } from './navigation'
import { boot, unlock, useSession } from './session'
import { useTheme } from './theme'
import { ChatScreen } from './screens/ChatScreen'
import { ComputersScreen } from './screens/ComputersScreen'
import { ConversationsScreen } from './screens/ConversationsScreen'
import { NewConversationScreen } from './screens/NewConversationScreen'
import { PairScreen } from './screens/PairScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { NewTaskScreen } from './screens/NewTaskScreen'
import { TaskScreen } from './screens/TaskScreen'
import { TasksScreen } from './screens/TasksScreen'

function CurrentScreen() {
  const route = useNavigation((state) => state.stack.at(-1)!)
  switch (route.name) {
    case 'computers': return <ComputersScreen />
    case 'pair': return <PairScreen key={route.link ?? ''} link={route.link} />
    case 'conversations': return <ConversationsScreen />
    case 'chat': return <ChatScreen id={route.id} />
    case 'new': return <NewConversationScreen />
    case 'tasks': return <TasksScreen />
    case 'task': return <TaskScreen id={route.id} />
    case 'newTask': return <NewTaskScreen />
    case 'settings': return <SettingsScreen />
  }
}

function LockScreen() {
  const theme = useTheme()
  const [failed, setFailed] = useState(false)
  const ask = async () => {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: t('unlockReason') })
    if (result.success) unlock()
    else setFailed(true)
  }
  useEffect(() => { void ask() }, [])
  return (
    <View style={[styles.lock, { backgroundColor: theme.bg }]}>
      <View style={[styles.lockIcon, { backgroundColor: theme.accentSoft }]}><Fingerprint size={34} color={theme.accent} strokeWidth={1.6} /></View>
      <Text style={[styles.lockTitle, { color: theme.text }]}>{t('appName')}</Text>
      {failed ? <Button label={t('unlock')} kind="primary" onPress={() => void ask()} /> : null}
    </View>
  )
}

export function App() {
  const ready = useSession((s) => s.ready)
  const locked = useSession((s) => s.locked)
  const theme = useTheme()
  useEffect(() => {
    // A pairing link tapped on the phone (antumi://pair?…) opens the app on it.
    const opened = (url: string | null | undefined) => {
      if (url && decodePairingCode(url)) push({ name: 'pair', link: url })
    }
    void boot().then(async () => {
      if (useSession.getState().current) reset({ name: 'conversations' })
      opened(await Linking.getInitialURL())
    })
    const back = BackHandler.addEventListener('hardwareBackPress', pop)
    const links = Linking.addEventListener('url', ({ url }) => opened(url))
    return () => {
      back.remove()
      links.remove()
    }
  }, [])
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <StatusBar style="auto" />
        <View style={[styles.app, { backgroundColor: theme.bg }]}>
          {!ready ? null : locked ? <LockScreen /> : <CurrentScreen />}
        </View>
      </KeyboardProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  lock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  lockIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  lockTitle: { fontSize: 22, fontWeight: '600' }
})
