// A release build makes one APK per architecture rather than one carrying them all, so a phone
// downloads only its own. The architectures are those app.json builds (expo-build-properties
// buildArchs, which lands in gradle.properties as reactNativeArchitectures). Debug builds stay one
// APK, the one `expo run:android` installs.
const { withAppBuildGradle } = require('expo/config-plugins')

const SPLITS = `
    splits {
        abi {
            enable gradle.startParameter.taskNames.any { it.toLowerCase().contains('release') }
            reset()
            include(*(findProperty('reactNativeArchitectures') ?: 'arm64-v8a').split(',').collect { it.trim() })
            universalApk false
        }
    }

`

module.exports = function withAbiSplits(config) {
  return withAppBuildGradle(config, (gradle) => {
    const { contents } = gradle.modResults
    if (contents.includes('splits {')) return gradle
    const next = contents.replace(/^android \{\n/m, (start) => `${start}${SPLITS}`)
    if (next === contents) throw new Error('abi-splits: no android block in app/build.gradle')
    gradle.modResults.contents = next
    return gradle
  })
}
