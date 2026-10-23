# OpenPigeon Android host

## Outcome and scope
Android Padi room creators choose two to four connected Android participants and open the original, separately installed OpenPigeon picker. A selected game determines its supported player count. Browser users retain built-in games and read-only match summaries. OpenPigeon controls its original catalogue, which can include games removed from Padi's built-in list.

No OpenPigeon game code or assets are redistributed. No iMessage/OpenBubbles backend is introduced. Existing peer signaling and connectivity dependencies still apply; this is not guaranteed offline delivery to a disconnected device.

## Contracts and storage
The Capacitor OpenPigeon plugin binds explicitly to com.openbubbles.openpigeon.MadridExtensionService. Madrid AIDL declarations and Apache attribution are in android/. External data is validated on the native, adapter and peer boundaries. Opaque data:? URLs and session identifiers are preserved. Image previews are omitted from transport. URLs are bounded to 90 KB, selected participants to 2-4, active native pending updates to 8, and saved room sessions to 24 for seven days.

The adapter persists at most eight unsent updates in IndexedDB under openpigeon.outbox.v1 for seven days. This is local device storage, cleared with app data; no cloud backup is added. Retries are bounded and resume on room events/foreground. The room owner validates roster and revision, persists accepted state and sends it only to selected participants. Guests wait for owner acceptance before acknowledging native completion. Native callbacks capture the original room to prevent cross-room routing. Friendly peers still trust OpenPigeon game logic; Padi does not decode its private turn format or prevent cheating inside it.

## User flow and failures
Install OpenPigeon independently on every participating Android device. In Padi, join the same room, check installation, select connected players and choose a game. Guests open the resulting match card. Failed delivery stays pending locally with a reconnect message. A bridge capability badge means the Padi Android version supports the bridge, not proof that the remote OpenPigeon app is installed. Native bind and call waits have bounded timeouts; disconnected devices cannot immediately receive turns.

## Acceptance and remaining verification
Automated checks cover protocol/roster validation, owner acceptance, reconnect replay, spectator isolation and UI installation/launch states. Native unit tests cover payload limits. Required device acceptance: install both apps on two Android devices; start Basketball; complete alternating turns; verify unchanged session state, background/foreground recovery, reconnect delivery, app/service restart, removed-room isolation, and readable portrait/landscape picker. Repeat a supported multiplayer game with additional participants. Actual external-app gameplay and hardware performance remain unverified until these device checks pass.

No database, API, cloud storage or new paid compute is introduced. Existing room event rate limits remain in effect. Scaling is intentionally bounded to the existing small rooms; connectivity through different mobile networks remains a deployment risk. Rollback removes the native card/bridge registration and retains built-in games; do not clear IndexedDB merely to roll back. No new release has been published by this implementation step.

## Windows build verification
Use the installed Android Studio JBR and Android SDK. On this workstation Java could not write compiler/cache files inside the project reliably. The ignored release/gradle-download/host-build-output.gradle init script redirects build output to the user Gradle directory. The successful compilation path uses a user-home project cache and in-process Kotlin compilation rather than the failing daemon/fallback subprocess. From android/:

```powershell
./gradlew.bat :app:testDebugUnitTest --no-daemon --max-workers=1 '-Pkotlin.compiler.execution.strategy=in-process' '-Pkotlin.project.persistent.dir=C:/Users/XERXES/.gradle/onepair-kotlin' --project-cache-dir C:/Users/XERXES/.gradle/onepair-native-project-cache -I ../release/gradle-download/host-build-output.gradle
```

The ignored init script can be recreated with this content:

```groovy
gradle.beforeProject { project ->
    def key = project.path == ':' ? 'root' : project.path.substring(1).replace(':', '_')
    project.layout.buildDirectory.set(new File(System.getProperty('user.home'), '.gradle/onepair-native-build/' + key))
}
```

This workaround is local build configuration, not a runtime app requirement. Standard CI can use its normal writable workspace. No ESLint configuration exists in this project; TypeScript, Vitest, Vite and Gradle are the configured checks.

## Verification checkpoint: 2026-10-23
- TypeScript and production Vite/PWA build passed.
- All 350 Vitest tests across 48 files passed with --maxWorkers=2 --testTimeout=20000. The default 5-second emoji test timeout was too short under this workstation load; the same test passed without assertion changes.
- Android :app:testDebugUnitTest passed with the command above: four OpenPigeon payload tests and the existing example test, zero failures. This compiled the new AIDL and Java host.
- Local development server returned HTTP 200. Browser automation was unavailable, so no new visual or external-app gameplay verification is claimed.
- No ESLint configuration exists. No new commit, deployment or APK release was published. Physical two-device Android acceptance remains pending.

Review trade-off: the separate-app host retains upstream graphics and mechanics without maintaining a port, but installation of both apps and actual external-app lifecycle testing are required. The built-in collection remains available for rollback and browser use.

## Shared Android test build
Version 1.4.0-test.1 uses versionCode 10400. Keep this build on both phones while testing; its room protocol differs from old game builds. Install OpenPigeon independently on both phones, pair in Padi, open More > Groups, join the same room, and let the room creator select players and choose an OpenPigeon game. The installed game controls how many players it supports. Start with Basketball and one opponent, then test background/foreground and reconnecting.

Build with -PonepairTestBuild=true to install as app.onepair.p2p.openpigeontest, labelled Padi OpenPigeon Test. This avoids the confirmed certificate mismatch with the previous CI APK and preserves the existing app and its data. Both partners pair afresh inside the separate test app. Without this flag the standard application ID and labels are retained. Keep the local debug keystore for future updates to this test installation; do not commit it.

Android 14+ requires BIND_ALLOW_ACTIVITY_STARTS for a visible client to let its bound external service open a game activity. The bridge opts in only for the explicit OpenPigeon service; the OS still applies visibility rules. This prevents a user tapping Open / Resume from being silently blocked by the platform. Source: https://developer.android.com/about/versions/14/behavior-changes-14#background-activity-starts
