import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync, existsSync} from 'node:fs'

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8')
const native = 'vendor/openpigeon/app/src/main/java/com/openbubbles/openpigeon/'

test('bundled game activities and Binder services are private and Godot is isolated', () => {
  const manifest = read('android/openpigeon/src/main/AndroidManifest.xml')
  const components = manifest.match(/<(?:activity|service)\b[^>]*>/g) || []
  assert.ok(components.length >= 12)
  for (const component of components) assert.match(component, /android:exported="false"/)
  assert.match(components.find(c => c.includes('GodotGameActivity')), /android:process=":godot"/)
  assert.doesNotMatch(manifest, /MAIN|LAUNCHER|Crazy8Activity/)
})

test('OnePair binds its bundled engine and rejects views from other packages', () => {
  const host = read('android/app/src/main/java/app/onepair/p2p/OpenPigeonPlugin.java')
  assert.match(host, /new ComponentName\(getContext\(\)\.getPackageName\(\), SERVICE\)/)
  assert.match(host, /getPackageName\(\)\.equals\(views\.getPackage\(\)\)/)
  assert.doesNotMatch(host, /getLaunchIntentForPackage|market:\/\/|PackageManager\.getPackageInfo/)
  assert.match(read(native + 'godot/GameSessionIPC.kt'), /Intent\(context, GameSessionService::class\.java\)/)
  assert.doesNotMatch(read(native + 'MadridExtension.kt'), /FLAG_ACTIVITY_CLEAR_TASK/)
})

test('unsupported server-backed Crazy8 is excluded and removed games cannot be selected', () => {
  const build = read('android/openpigeon/build.gradle')
  assert.ok(build.includes("java.exclude '**/crazy8/**'"))
  assert.doesNotMatch(build, /implementation.*(?:PlayerIO|mixpanel)/i)
  assert.doesNotMatch(read(native + 'MadridExtension.kt'), /(?:Crazy8|Battleship|Reversi)Game\(\)/)
  assert.doesNotMatch(read(native + 'GameNotFound.kt'), /MixpanelAPI/)
})


test('native physics inputs and license assets are available to reproducible packaging', () => {
  const cmake = read('android/openpigeon/CMakeLists.txt')
  const inputs = [...new Set(cmake.match(/vendor\/openpigeon\/app\/src\/main\/cpp\/[a-zA-Z0-9/]+\.cpp/g))]
  assert.ok(inputs.length >= 16)
  for (const input of inputs) assert.ok(existsSync(new URL('../' + input, import.meta.url)), input)
  for (const name of ['LICENSE', 'LICENSE.exceptions', 'NOTICE', 'vendor/openpigeon/LICENSE', 'vendor/openpigeon/LICENSE.exceptions', 'vendor/box2d/Box2D/CMakeLists.txt', 'vendor/openpigeon/app/src/main/assets/attributions.html']) {
    assert.ok(existsSync(new URL('../' + name, import.meta.url)), name)
  }
  const build = read('android/openpigeon/build.gradle')
  for (const name of ['attributions.html', 'LICENSE.exceptions', 'NOTICE']) assert.ok(build.includes(name), name)
  const archive = read('scripts/package-android-source.mjs')
  assert.match(archive, /Unexpanded submodule/)
  assert.match(archive, /Sensitive\/generated tracked path/)
})

test('dead Godot callbacks release locks without clearing a newer registration', () => {
  const service = read(native + 'godot/GameSessionService.kt')
  assert.match(service, /linkToDeath\(registration\.death/)
  assert.match(service, /registration !== expected/)
  assert.match(service, /registration\.session\.unlock\(\)/)
  assert.match(service, /registration\.session\.handle\.setSuppressNotifications\(false\)/)
  assert.match(service, /override fun onDestroy\(\)/)
})

test("Android packaging retains Godot imported textures and scripts", () => {
  const app = read("android/app/build.gradle")
  const pattern = /ignoreAssetsPattern\s*=\s*'([^']+)'/.exec(app)[1]
  assert.ok(!pattern.split(":").includes(".*"), "Godot .godot resources must remain in APK")
})
