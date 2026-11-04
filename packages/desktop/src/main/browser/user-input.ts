const USER_INPUT = new Set(['mouseDown', 'rawKeyDown', 'keyDown', 'gestureTap'])
// Often enough to keep a tab the user is working in theirs, which core holds for a few seconds.
const TELL_EVERY_MS = 1_000
// A page's window.open answers the click that asked for it at once; one long after came of itself.
const OPENED_BY_INPUT_MS = 2_000

// The user's clicks and keys in tabs' pages, apart from an agent's own actions: what core is told
// so the tab is the user's to take somewhere, and whether a tab a page opens was opened by them.
export class UserInputs {
  private readonly told = new Map<string, number>()
  private readonly last = new Map<string, number>()

  // An input in a tab's page: true when core should hear of it now.
  note(tabId: string, type: string, agentActing: boolean, now: number): boolean {
    if (agentActing || !USER_INPUT.has(type)) return false
    this.last.set(tabId, now)
    if (now - (this.told.get(tabId) ?? -Infinity) < TELL_EVERY_MS) return false
    this.told.set(tabId, now)
    return true
  }

  // A link the user just clicked opens its own tab: that tab is theirs to take too.
  opensForUser(openerId: string, agentActing: boolean, now: number): boolean {
    return !agentActing && now - (this.last.get(openerId) ?? -Infinity) < OPENED_BY_INPUT_MS
  }

  forget(tabId: string): void {
    this.told.delete(tabId)
    this.last.delete(tabId)
  }
}
