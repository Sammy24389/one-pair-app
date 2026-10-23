# Bundled OpenPigeon Android integration

## Outcome and scope

OnePair Android bundles the archived OpenPigeon `v1-final-agpl` source at commit `50863e937beca3859c01ad04af29bcbf837f650e`. Participants install one OnePair APK; its room game entry opens the bundled picker/game activity. No separately installed OpenPigeon app is required. The selected game determines its player count; room selection remains limited to two to four participants. Browser/PC users retain built-in games and read-only match summaries.

This is an Android source integration, not an iframe or a copied current-release asset pack. Bundled source lives in `vendor/openpigeon/` and `vendor/box2d/`; the native Android module is `android/openpigeon/`. Keep pinned source and notices intact. See [licensing/source delivery](OPENPIGEON-REUSE.md).

## Transport and storage contract

The existing Capacitor OpenPigeon adapter exchanges opaque game turns with the bundled native module through the Madrid host contract. Host and game components ship inside the same installed package. Preserve independent game sessions and explicit room/participant selection; never route a native callback to whichever room happens to be active later.

The transport continues validating opaque `data:?` URLs and session IDs at native, adapter and peer boundaries. Image previews are omitted from peer transport. Existing limits are 90 KB per URL, two to four selected participants, eight unsent updates, and 24 saved room sessions for seven days. Local outbox storage is IndexedDB `openpigeon.outbox.v1`, expiring after seven days. Clearing application data deletes it; no cloud backup is added.

The room owner validates roster/revision, persists accepted state and fans it out only to selected players. Guests acknowledge native completion after owner acceptance. Retries are bounded and resume on room events/foreground. OnePair does not decode private game rules or claim cheat prevention. Devices must be online together; existing signaling and STUN/optional TURN dependencies remain. No iMessage/OpenBubbles backend is added.

## User flow and failures

Install the same bundled APK on both Android phones, pair or join the same room, and open Games. The room owner chooses connected participants and opens OpenPigeon. The partner opens the resulting match card. Keep OpenPigeon attribution visible in entry and source/About information. Missing game/module initialization must produce a recoverable error rather than an install-another-app instruction.

Native bind/call waits remain bounded. Delivery failures stay pending locally with reconnect feedback. A capability badge indicates bridge support, not proof that the other device has the same game source/version. Reject incompatible clients clearly. Background/restart behavior must be tested on actual devices.

## Build and source delivery

The bundled APK now requires **Android 8.0 or newer (API 26)** and a **64-bit ARM device (`arm64-v8a`)**. This raises the previous app's minimum Android version and excludes 32-bit ARM/x86 devices from this bundled build. Check both partner phones before installation. Browser/PC access is a separate web build and does not include the native OpenPigeon engine.

Use Node 22 with the locked npm dependencies, JDK 21, Android SDK platform 36/build-tools 36.0.0, NDK **27.2.12479018**, CMake **3.22.1**, and the pinned Gradle wrapper. Install the exact NDK/CMake versions through Android Studio SDK Manager with Show Package Details enabled. Godot is pinned to 4.6.3 in both the editor and Android runtime because the bundled Box2D extension requires the compatible 4.6 GDExtension API. Do not upgrade the editor independently of the runtime or extension. The build uses the official **Godot 4.6.3-stable editor** to import and export the bundled Godot project; setting `GODOT_BIN` is required for direct Gradle commands.

On Windows, download [Godot_v4.6.3-stable_win64.exe.zip](https://github.com/godotengine/godot-builds/releases/download/4.6.3-stable/Godot_v4.6.3-stable_win64.exe.zip), verify its SHA256 is `e39986a178d585ce7ac198fb8de6ea436366dc0cc00e594810c2e3e104c04b90`, and extract both executables into `release/tools/godot-4.6.3/`. Keep the console executable beside its editor executable. The signing helper reuses this location or an explicit `GODOT_BIN`; it does not redownload tools on each build. CI installs the same release's Linux x86_64 editor with a pinned SHA256 and the same Android toolchain versions.

Run from the repository root in PowerShell 7.2 or newer:

```powershell
$env:JAVA_HOME = 'C:/Program Files/Android/Android Studio/jbr'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
$env:GODOT_BIN = (Resolve-Path 'release/tools/godot-4.6.3/Godot_v4.6.3-stable_win64_console.exe').Path
& $env:GODOT_BIN --headless --version
npm ci
npm run typecheck
npm test -- --maxWorkers=2 --testTimeout=20000
node --test tests/android-signing.test.mjs tests/android-source-package.test.mjs tests/bundled-android.test.mjs
npm run cap:sync
cd android
./gradlew.bat testDebugUnitTest :app:assembleDebug --no-daemon --max-workers=1
```

Use the permanent signing procedure in [ANDROID-SIGNING.md](ANDROID-SIGNING.md) for shared release APKs. Do not distribute temporary debug builds as the permanent update channel. The older debug-signed main app cannot be updated by the permanent key without a deliberate one-time data/installation transition. Never uninstall or clear user data automatically.

After the source is committed, run `node scripts/package-android-source.mjs` for the default `release/source-COMMIT/` output, or pass an unused ZIP path inside the repository, such as `node scripts/package-android-source.mjs release/partner-source.zip`. Custom outputs include adjacent `.sha256` and `.provenance.json` sidecars. The source packager refuses dirty source, tracked private signing files and existing artifacts. The release helper automatically packages source beside the signed APK after a successful build; commit source before invoking it.

Share matching source, provenance and required notices alongside every bundled APK. A clean build from the extracted archive and actual recipient access remain release gates. CI must not publish an APK without that corresponding-source delivery. These build instructions do not establish that native compilation or device gameplay has passed; record the actual results separately.

## Acceptance and verification boundary

Earlier separate-app host checks do not verify this bundled build. Required automated checks: TypeScript, Vitest, signing tests, production web build, Android compilation/native tests and release signature validation. No ESLint configuration exists in this project. Check logs for native library loading, resources, service/Activity lifecycle and payload errors.

Required physical acceptance: two Android phones with no standalone OpenPigeon dependency; picker and selected game render; complete alternating turns; preserve game session after chat/app switching, reconnect, process restart and room removal; verify touch controls, portrait/landscape, Back behavior, audio interruption and background recovery. Test a supported larger-player game separately. Verify same permanently signed APK updates an existing permanent-key installation without losing data.

Device testing, hardware performance, full catalogue acceptance, clean-source rebuild and bundled APK publication are pending until evidence is recorded. Do not present compile-only evidence as successful two-device gameplay.

## Production layers and rollback

No new API, database, cloud object storage, paid compute or server-side account is introduced. Existing bounded room event limits remain. Device CPU/GPU, APK size, native ABI coverage and battery costs increase with the bundled engine and need measurement on target phones. Different mobile networks and foreground/background restrictions remain connectivity risks. Small-room capacity is intentionally bounded; wider scaling is outside this phase.

Retain dependency/license notices and inspect nested third-party materials before redistribution. Crash logs must omit chat content, turn URLs and private identifiers. Rollback disables the bundled game entry and restores built-in games while preserving persisted sessions/outbox; do not erase local storage. Code rollback does not permit downgrading installed APK version codes or crossing signing keys.

## Local verification checkpoint

Bundled debug assembly and five Android unit tests passed. TypeScript, production web build, 351 Vitest assertions (333 full-run plus 18 rerun after worker startup timeouts), and source/signing boundary checks passed. Godot4.6.3 import/export completed without errors. No ESLint configuration exists. Physical two-phone gameplay and clean-source rebuild remain pending.

The original Box2D0.9.9 Android addon was rebuilt with NDK27 for 16KB ELF alignment without changing physics code. Exact addon, godot-cpp and Box2D source pins and archive hashes are in `vendor/godot-box2d/ONEPAIR-SOURCES.json`. Install SCons4.9.1 into a local directory, then run `python scripts/build-godot-box2d.py --ndk PATH_TO_NDK27 --scons-path PATH_TO_LOCAL_SCONS`. The helper stages source under ignored release output and produces, but does not install, the Android library. Copy its output to both OpenPigeon Android jniLibs and the matching addon assets/bin path. Both tracked copies must have the same hash. Original library backups remain outside distributed source.
