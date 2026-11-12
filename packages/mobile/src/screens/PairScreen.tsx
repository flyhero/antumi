import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Clipboard from 'expo-clipboard'
import { Camera, ClipboardPaste, ShieldCheck } from 'lucide-react-native'
import { decodePairingCode } from '@antumi/protocol'
import { Button, Card, Screen, confirmTap } from '../components/ui'
import { t } from '../i18n'
import { pop, reset } from '../navigation'
import { pair } from '../session'
import { mono, radius, space, type, useTheme } from '../theme'

function CodeBoxes({ code }: { code: string }) {
  const theme = useTheme()
  return (
    <View style={styles.boxes} accessibilityLabel={code.split('').join(' ')}>
      {code.split('').map((digit, index) => (
        <View key={index} style={[styles.box, index === 3 && styles.gap, { backgroundColor: theme.raised }]}>
          <Text style={[styles.digit, { color: theme.text }]}>{digit}</Text>
        </View>
      ))}
    </View>
  )
}

export function PairScreen({ link: opened }: { link?: string | undefined }) {
  const theme = useTheme()
  const [permission, requestPermission] = useCameraPermissions()
  const [link, setLink] = useState(opened ?? '')
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  const start = async (text: string) => {
    if (started.current) return
    if (!decodePairingCode(text)) {
      setError(t('notAPairingCode'))
      return
    }
    started.current = true
    confirmTap()
    setBusy(true)
    setError(null)
    const failed = await pair(text, setCode)
    setBusy(false)
    started.current = false
    if (failed) {
      setCode(null)
      setError(failed)
      return
    }
    reset({ name: 'conversations' })
  }

  useEffect(() => {
    if (opened) void start(opened)
  }, [opened])

  if (code) {
    return (
      <Screen title={t('pairTitle')} onBack={() => pop()}>
        <Card style={styles.codeCard}>
          <View style={[styles.shield, { backgroundColor: theme.accentSoft }]}><ShieldCheck size={26} color={theme.accent} /></View>
          <Text style={[type.title, styles.centered, { color: theme.text }]}>{t('confirmOnComputer')}</Text>
          <CodeBoxes code={code} />
          <Text style={[type.secondary, styles.centered, { color: theme.textMuted }]}>{t('confirmOnComputerHint')}</Text>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen title={t('pairTitle')} onBack={() => pop()}>
      <Text style={[type.secondary, { color: theme.textMuted }]}>{t('scanHint')}</Text>
      <View style={[styles.camera, { backgroundColor: theme.raised }]}>
        {permission?.granted ? (
          <>
            <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={busy ? undefined : ({ data }) => void start(data)} />
            <View style={styles.frame} pointerEvents="none">
              {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => <View key={corner} style={[styles.corner, styles[corner]]} />)}
            </View>
          </>
        ) : (
          <View style={styles.cameraOff}>
            <Camera size={30} color={theme.textMuted} strokeWidth={1.6} />
            <Text style={[type.secondary, styles.centered, { color: theme.textMuted }]}>{permission && !permission.canAskAgain ? t('cameraDenied') : t('cameraNeeded')}</Text>
            <Button label={t('allowCamera')} onPress={() => void requestPermission()} />
          </View>
        )}
      </View>
      <View style={styles.or}>
        <View style={[styles.line, { backgroundColor: theme.border }]} />
        <Text style={[type.caption, { color: theme.text3 }]}>{t('orPaste')}</Text>
        <View style={[styles.line, { backgroundColor: theme.border }]} />
      </View>
      <View style={[styles.field, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TextInput
          style={[type.secondary, styles.fieldInput, { color: theme.text }]}
          placeholder={t('pasteLink')}
          placeholderTextColor={theme.text3}
          value={link}
          onChangeText={setLink}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button label={t('paste')} icon={ClipboardPaste} kind="ghost" onPress={() => void Clipboard.getStringAsync().then(setLink)} style={styles.pasteButton} />
      </View>
      <Button label={t('pair')} kind="primary" wide busy={busy} disabled={!link.trim()} onPress={() => void start(link)} />
      {error ? <Text style={[type.secondary, styles.centered, { color: theme.danger }]}>{error}</Text> : null}
    </Screen>
  )
}

const CORNER = 28
const styles = StyleSheet.create({
  centered: { textAlign: 'center' },
  codeCard: { alignItems: 'center', paddingVertical: space.xxl, gap: space.lg },
  shield: { width: 56, height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  boxes: { flexDirection: 'row', gap: 6 },
  box: { width: 42, height: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  gap: { marginLeft: space.md },
  digit: { fontFamily: mono, fontSize: 26, fontWeight: '700' },
  camera: { height: 320, borderRadius: radius.xl, overflow: 'hidden' },
  cameraOff: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xxl },
  frame: { position: 'absolute', top: 48, left: 48, right: 48, bottom: 48 },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#FFFFFF' },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },
  or: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  field: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingLeft: space.md },
  fieldInput: { flex: 1, paddingVertical: space.md },
  pasteButton: { minHeight: 44 }
})
