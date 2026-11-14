import { Image, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { GestureDetector, GestureHandlerRootView, usePanGesture, usePinchGesture, useExclusiveGestures, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { X } from 'lucide-react-native'
import { t } from '../i18n'
import { radius, space } from '../theme'

// A picture from the chat at full size: pinched to zoom, dragged about once zoomed, a double tap
// between fitted and zoomed in. A tap, the back button or a drag down from fitted closes it.

const MAX_SCALE = 5
const DOUBLE_TAP_SCALE = 2.5
const DISMISS_DRAG = 120
// Android's own double-tap timeout; gesture-handler's 200ms closes on a slightly slow double tap.
const DOUBLE_TAP_DELAY = 300

export function ImageViewer({ uri, width, height, onClose }: { uri: string; width: number; height: number; onClose: () => void }) {
  const screen = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const fit = Math.min(screen.width / width, screen.height / height)
  const shown = { width: width * fit, height: height * fit }
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const savedX = useSharedValue(0)
  const savedY = useSharedValue(0)
  const drop = useSharedValue(0)

  // How far the zoomed picture may move before its edge comes in from the screen's.
  const bounded = (value: number, size: number, room: number, zoom: number) => {
    'worklet'
    const limit = Math.max(0, (size * zoom - room) / 2)
    return Math.min(limit, Math.max(-limit, value))
  }
  const reset = () => {
    'worklet'
    scale.value = withTiming(1)
    savedScale.value = 1
    x.value = withTiming(0)
    y.value = withTiming(0)
    savedX.value = 0
    savedY.value = 0
  }

  const pinch = usePinchGesture({
    onUpdate: (event) => {
      'worklet'
      scale.value = Math.min(MAX_SCALE, Math.max(1, savedScale.value * event.scale))
    },
    onDeactivate: () => {
      'worklet'
      if (scale.value <= 1.02) reset()
      else {
        savedScale.value = scale.value
        x.value = withTiming(bounded(x.value, shown.width, screen.width, scale.value))
        y.value = withTiming(bounded(y.value, shown.height, screen.height, scale.value))
        savedX.value = x.value
        savedY.value = y.value
      }
    }
  })
  const pan = usePanGesture({
    onUpdate: (event) => {
      'worklet'
      if (savedScale.value > 1) {
        x.value = savedX.value + event.translationX
        y.value = savedY.value + event.translationY
      } else {
        drop.value = Math.max(0, event.translationY)
      }
    },
    onDeactivate: () => {
      'worklet'
      if (savedScale.value > 1) {
        x.value = withTiming(bounded(x.value, shown.width, screen.width, savedScale.value))
        y.value = withTiming(bounded(y.value, shown.height, screen.height, savedScale.value))
        savedX.value = bounded(x.value, shown.width, screen.width, savedScale.value)
        savedY.value = bounded(y.value, shown.height, screen.height, savedScale.value)
      } else if (drop.value > DISMISS_DRAG) {
        scheduleOnRN(onClose)
      } else {
        drop.value = withTiming(0)
      }
    }
  })
  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    maxDelay: DOUBLE_TAP_DELAY,
    onActivate: () => {
      'worklet'
      if (savedScale.value > 1) reset()
      else {
        scale.value = withTiming(DOUBLE_TAP_SCALE)
        savedScale.value = DOUBLE_TAP_SCALE
      }
    }
  })
  const tap = useTapGesture({
    onActivate: () => {
      'worklet'
      scheduleOnRN(onClose)
    }
  })
  const gesture = useSimultaneousGestures(useSimultaneousGestures(pinch, pan), useExclusiveGestures(doubleTap, tap))

  const picture = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value + drop.value }, { scale: scale.value }]
  }))
  const backdrop = useAnimatedStyle(() => ({ opacity: 1 - Math.min(0.6, drop.value / 400) }))

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]} />
        <GestureDetector gesture={gesture}>
          <View style={[styles.fill, styles.center]}>
            <Animated.View style={[shown, picture]}>
              <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            </Animated.View>
          </View>
        </GestureDetector>
        <Pressable accessibilityLabel={t('close')} onPress={onClose} hitSlop={12} style={[styles.close, { top: insets.top + space.sm }]}>
          <X size={22} color="#ffffff" />
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  // A picture is looked at against black, whatever the app's theme.
  backdrop: { backgroundColor: '#000000' },
  close: { position: 'absolute', right: space.md, width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' }
})
