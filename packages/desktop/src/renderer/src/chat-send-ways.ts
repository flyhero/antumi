import { formatShortcut, shortcutBindings, type ShortcutAction, type ShortcutSettings } from '../../shared/keyboard-shortcuts'
import { SHORTCUT_PLATFORM } from './keyboard-shortcuts'
import { usePreferences } from './preferences'
import { IS_MAC } from './shortcut-keys'

export type SendWay = 'send' | 'interrupt' | 'queue' | 'steer' | 'newConversation'

// The ways the input can go now, the button's own first: send while the agent is idle; while it
// works, stop, then wait for the turn or go into it.
export function sendWays(state: { working: boolean; queueable: boolean; steerable: boolean; reusable: boolean }): SendWay[] {
  const now: SendWay[] = state.working
    ? ['interrupt', ...(state.queueable ? ['queue' as const] : []), ...(state.queueable && state.steerable ? ['steer' as const] : [])]
    : ['send']
  return state.reusable ? [...now, 'newConversation'] : now
}

const SEND_ACTIONS: Record<SendWay, ShortcutAction> = { send: 'send-message', queue: 'send-message', steer: 'steer-message', newConversation: 'send-new-conversation', interrupt: 'interrupt-turn' }

// Each key on its own cap, as the composer's key handler reads them.
export function sendWayKeys(way: SendWay, settings: ShortcutSettings = usePreferences.getState().panelShortcuts): string[] {
  const binding = shortcutBindings(settings, SHORTCUT_PLATFORM, SEND_ACTIONS[way])[0]
  if (!binding) return []
  const key = formatShortcut({ ...binding, ctrl: false, meta: false, alt: false, shift: false }, SHORTCUT_PLATFORM)
  return [binding.ctrl ? (IS_MAC ? '⌃' : 'Ctrl') : '', binding.meta ? '⌘' : '', binding.alt ? (IS_MAC ? '⌥' : 'Alt') : '', binding.shift ? (IS_MAC ? '⇧' : 'Shift') : '', key === 'Escape' ? 'Esc' : key === 'Enter' && IS_MAC ? '↩' : key].filter(Boolean)
}
