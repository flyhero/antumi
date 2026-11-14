// A release build is signed with the one release key (docs/RELEASING.md), named by
// ANTUMI_RELEASE_STORE_FILE, _STORE_PASSWORD, _KEY_ALIAS and _KEY_PASSWORD in ~/.gradle/gradle.properties,
// never in the repo. A machine without them signs with the debug key, as the template does, and
// says the APK cannot be published: a phone that installed one signed otherwise must reinstall.
const { withAppBuildGradle } = require('expo/config-plugins')

const RELEASE_CONFIG = `
        release {
            if (findProperty('ANTUMI_RELEASE_STORE_FILE')) {
                storeFile file(findProperty('ANTUMI_RELEASE_STORE_FILE'))
                storePassword findProperty('ANTUMI_RELEASE_STORE_PASSWORD')
                keyAlias findProperty('ANTUMI_RELEASE_KEY_ALIAS')
                keyPassword findProperty('ANTUMI_RELEASE_KEY_PASSWORD')
            }
        }`

const RELEASE_SIGNING = `if (findProperty('ANTUMI_RELEASE_STORE_FILE')) {
                signingConfig signingConfigs.release
            } else {
                logger.warn('No ANTUMI_RELEASE_STORE_FILE: the release APK is signed with the debug key and must not be published.')
                signingConfig signingConfigs.debug
            }`

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (gradle) => {
    const { contents } = gradle.modResults
    if (contents.includes('ANTUMI_RELEASE_STORE_FILE')) return gradle
    const withConfig = contents.replace(/^(\s*signingConfigs \{\n\s*debug \{[^}]*\})/m, (debug) => `${debug}${RELEASE_CONFIG}`)
    // The template's release build type signs with signingConfigs.debug after its "Caution!" note.
    const next = withConfig.replace(/(release \{\n(?:\s*\/\/[^\n]*\n)*\s*)signingConfig signingConfigs\.debug/, (_match, start) => `${start}${RELEASE_SIGNING}`)
    if (withConfig === contents || next === withConfig) throw new Error('release-signing: app/build.gradle has no signingConfigs or release build type where expected')
    gradle.modResults.contents = next
    return gradle
  })
}
