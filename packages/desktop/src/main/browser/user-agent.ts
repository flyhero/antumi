// What Chrome itself would send on this machine. Electron's own names the app and Electron, and
// Google's sign-in refuses a browser that says it is embedded in an app, so sites that log in
// through Google could not be used at all.
export function chromeUserAgent(electron: string, chromeVersion: string): string {
  const platform = /^Mozilla\/5\.0 (\([^)]*\))/.exec(electron)?.[1]
  const major = chromeVersion.split('.')[0]
  if (!platform || !major) return electron.replace(/ Electron\/\S+/, '')
  // The reduced form Chrome has sent since 101: the major version alone.
  return `Mozilla/5.0 ${platform} AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
}

// What Chrome on Android sends, in its reduced form, for a page held at a phone's or a tablet's
// size: many sites (Google's own) pick their mobile layout from this, not from the width. A tablet
// is told apart by leaving out "Mobile", as Chrome does.
export function mobileUserAgent(chromeVersion: string, phone: boolean): string {
  const major = chromeVersion.split('.')[0] ?? '0'
  return `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 ${phone ? 'Mobile ' : ''}Safari/537.36`
}
