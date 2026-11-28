import { AppState, PermissionsAndroid, Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo'
import { create } from 'zustand'
import { MobilePushSubscription } from '@antumi/protocol'
import type { MobileConnection } from '@antumi/protocol/mobile'

// The phone's own pushes (docs/MOBILE.md, 通知): UnifiedPush through a distributor app such as
// ntfy, one registration per paired computer, signed for with that computer's VAPID key. The
// native module (modules/antumi-push) receives, decrypts and shows them with the app closed; here
// the user turns them on, and each computer is given its endpoint when the phone connects.

type Native = {
  distributors(): string[]
  distributor(): string | null
  useDistributor(): Promise<boolean>
  register(instance: string, vapid: string): void
  unregister(instance: string): void
  stop(): void
  registration(instance: string): Record<string, unknown> | null
  setOnScreen(conversation: string | null): void
  notificationsAllowed(): boolean
  openAppSettings(): void
  addListener(event: 'changed', listener: (event: { instance: string }) => void): { remove(): void }
}

// Absent on iOS, and from a build made before the module.
const native = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('AntumiPush') : null

// For the computer connected to: on, waiting on the distributor, failed with its reason, off, or
// unsupported by that computer's core.
export type PushState = { kind: 'off' } | { kind: 'pending' } | { kind: 'on' } | { kind: 'failed'; reason: string } | { kind: 'unsupported' }

// Until a computer connects, on is as far as the phone knows.
export const usePush = create<{ state: PushState }>()(() => ({ state: native?.distributor() ? { kind: 'on' } : { kind: 'off' } }))

export function pushAvailable(): boolean {
  return native !== null
}

function registration(instance: string): MobilePushSubscription | { failed: string } | null {
  const raw = native?.registration(instance)
  if (!raw) return null
  if (typeof raw.failed === 'string') return { failed: raw.failed }
  return MobilePushSubscription.safeParse(raw).data ?? { failed: 'INVALID' }
}

// Asks for what pushes need, then takes the distributor. null once on, else why not.
export async function startPush(): Promise<'no-distributor' | 'denied' | 'cancelled' | null> {
  if (!native) return 'cancelled'
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const answer = await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS')
    if (answer !== PermissionsAndroid.RESULTS.GRANTED) return 'denied'
  }
  if (!native.distributors().length) return 'no-distributor'
  return (await native.useDistributor()) ? null : 'cancelled'
}

// Every registration ends; the connected computer is told now, others find their endpoint gone.
export async function stopPush(link: MobileConnection | null): Promise<void> {
  native?.stop()
  usePush.setState({ state: { kind: 'off' } })
  if (link?.welcome.features.includes('mobile-push')) await link.call('mobile.setPush', { subscription: null }).catch(() => {})
}

// On each connection (register), and whenever the distributor answers: hand the computer the
// endpoint, or register with its key when there is none. Only a connection registers, so a
// distributor that keeps failing is not asked again in a loop.
export async function syncPush(link: MobileConnection, computerKey: string, register: boolean): Promise<void> {
  if (!native) return
  if (!native.distributor()) return usePush.setState({ state: { kind: 'off' } })
  if (!link.welcome.features.includes('mobile-push')) return usePush.setState({ state: { kind: 'unsupported' } })
  const current = registration(computerKey)
  if (current && !('failed' in current)) {
    await link.call('mobile.setPush', { subscription: current })
    return usePush.setState({ state: { kind: 'on' } })
  }
  if (current && (!register || current.failed === 'ACTION_REQUIRED')) return usePush.setState({ state: { kind: 'failed', reason: current.failed } })
  if (!register) return
  usePush.setState({ state: { kind: 'pending' } })
  const { key } = await link.call('mobile.pushKey', {})
  native.register(computerKey, key)
}

// A computer unpaired or that revoked this phone: its registration goes too.
export function forgetPush(computerKey: string): void {
  native?.unregister(computerKey)
}

export function onPushChanged(listener: (computerKey: string) => void): () => void {
  const subscription = native?.addListener('changed', ({ instance }) => listener(instance))
  return () => subscription?.remove()
}

export function openAppSettings(): void {
  native?.openAppSettings()
}

// No push for the conversation the user is looking at, while the app is in front.
let onScreen: string | null = null
export function showingConversation(id: string | null): void {
  onScreen = id
  native?.setOnScreen(AppState.currentState === 'active' ? id : null)
}
if (native) AppState.addEventListener('change', (state) => native.setOnScreen(state === 'active' ? onScreen : null))
