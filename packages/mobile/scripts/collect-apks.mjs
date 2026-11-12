// Copies the release APKs Gradle made, one per architecture, into dist/ under the names a GitHub
// release carries: Antumi-<version>-android-<abi>.apk (docs/RELEASING.md, Android 手机端).
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const version = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')).expo.version
const outputs = path.join(root, 'android/app/build/outputs/apk/release')
const dist = path.join(root, 'dist')

const apks = readdirSync(outputs).flatMap((name) => {
  const abi = /^app-(.+)-release\.apk$/.exec(name)?.[1]
  return abi ? [{ name, abi }] : []
})
if (apks.length === 0) throw new Error(`No per-architecture APK in ${outputs}: run ./gradlew assembleRelease in android/ first.`)

// dist/ also holds what `expo export` writes; only an earlier build's APKs go.
mkdirSync(dist, { recursive: true })
for (const name of readdirSync(dist)) if (/^Antumi-.+-android.*\.apk$/.test(name)) rmSync(path.join(dist, name))
for (const { name, abi } of apks) {
  const target = path.join(dist, `Antumi-${version}-android-${abi}.apk`)
  copyFileSync(path.join(outputs, name), target)
  console.log(`${path.relative(root, target)}  ${(statSync(target).size / 1048576).toFixed(1)} MB`)
}
