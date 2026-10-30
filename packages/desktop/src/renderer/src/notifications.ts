import { attentionCount, noticesBetween } from './attention'
import { openUsageCard, selectConversation, selectTask, setRoutinesOpen, useCore } from './core-store'
import { canNotify, canShowRequestPopup, notify, onNotificationClick, setBadge, setRequestPopupMode, wantRequestPopup } from './desktop-bridge'
import { currentInstalledAgents } from './installed-agents'
import { usePreferences, type Preferences } from './preferences'
import { quotaNoticesBetween } from './quota-notices'
import { newlyWaiting } from './request-popup'
import { routineNoticesBetween } from './routines'
import { scheduleNoticesBetween } from './schedules'

// Tells the user what happened while they were away: a system notification when the window is
// not in front, and the count of what waits on them on the dock icon; an agent held up on them,
// on the card at the top of the screen (request-popup.ts) when that is on. Reads the store from
// outside React, so a change is told of once however many views show it.
export function startNotifications(): void {
  startRequestPopup()
  if (!canNotify()) return
  let prev = useCore.getState()
  let badge = -1
  useCore.subscribe((next) => {
    if (next.conversations !== prev.conversations || next.tasks !== prev.tasks || next.unseen !== prev.unseen || next.routines !== prev.routines) {
      const count = attentionCount(next)
      if (count !== badge) {
        badge = count
        setBadge(count)
      }
    }
    const away = usePreferences.getState().notifications && !document.hasFocus()
    if (next.conversations !== prev.conversations && away) {
      noticesBetween(prev, next, !popupOn()).forEach(notify)
    }
    if (next.schedules !== prev.schedules && away) {
      scheduleNoticesBetween(prev.schedules, next.schedules).forEach(notify)
    }
    if (next.routines !== prev.routines && away) {
      routineNoticesBetween(prev.routines, next.routines).forEach(notify)
    }
    // Advice seen while the window is in front counts as told: the usage bar shows it there.
    if (next.usage !== prev.usage && usePreferences.getState().quotaAdvice) {
      const notices = quotaNoticesBetween(prev.usage, next.usage, Date.now(), sentAdvice, currentInstalledAgents())
      saveSentAdvice()
      if (away) notices.forEach(notify)
    }
    prev = next
  })
  onNotificationClick((target) => {
    if (target.kind === 'task') selectTask(target.id)
    else if (target.kind === 'conversation') selectConversation(target.id)
    else if (target.kind === 'usage') openUsageCard(target.agent)
    else setRoutinesOpen(true, 'routines')
  })
}

// The quota advice already told of, kept across restarts so a relaunch does not tell it again.
// Only a convenience: without storage it is told again once per launch.
const SENT_ADVICE_KEY = 'antumi.quotaAdviceSent'
const SENT_ADVICE_MAX = 200
const sentAdvice = loadSentAdvice()

function loadSentAdvice(): Set<string> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SENT_ADVICE_KEY) ?? '[]')
    return new Set(Array.isArray(saved) ? saved.filter((key) => typeof key === 'string') : [])
  } catch {
    return new Set()
  }
}

function saveSentAdvice(): void {
  try {
    localStorage.setItem(SENT_ADVICE_KEY, JSON.stringify([...sentAdvice].slice(-SENT_ADVICE_MAX)))
  } catch {
    // Storage is blocked or full; the set in memory still holds for this launch.
  }
}

const popupOn = () => canShowRequestPopup() && usePreferences.getState().island !== 'off'

// The card comes up for a request that arrives while the user is elsewhere, and goes when the
// setting is turned off; main puts it away when the window is back in front. Kept always, main
// holds the island up by itself and the card only expands it.
function startRequestPopup(): void {
  if (!canShowRequestPopup()) return
  const tell = (island: Preferences['island']) => setRequestPopupMode(island === 'always' ? 'always' : 'requests')
  tell(usePreferences.getState().island)
  useCore.subscribe((next, prev) => {
    if (next.conversations !== prev.conversations && popupOn() && !document.hasFocus() && newlyWaiting(prev.conversations, next.conversations)) {
      wantRequestPopup(true)
    }
  })
  usePreferences.subscribe((next, prev) => {
    if (next.island === prev.island) return
    tell(next.island)
    if (next.island === 'off') wantRequestPopup(false)
  })
}
