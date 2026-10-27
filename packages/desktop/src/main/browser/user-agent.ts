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
