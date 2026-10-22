# Play, rooms and media verification - 22 October 2026

Release 1.3.0 builds on c585c95. Commit, CI, deployment and APK provenance are recorded with its GitHub release artifacts; local checks do not by themselves prove physical-device behavior.

| Request | Implementation | Evidence |
| --- | --- | --- |
| GamePigeon-like interactive games | Original 2D sports scenes, swipe throws, ballistic animation, dimensional boards | Real390px basketball drag submitted a shot; rule/gesture regression tests |
| Fairer turns | Equal rounds/replies for words, darts and cup pong; shuffled seating; Race to21 removed from catalog | Rule regressions; board-game opening advantages remain explicit |
| Screen sharing | Pair call display-track replacement and independent room presentation streams | Permission/cancel/restore/cleanup tests; real OS chooser and two-device media still require manual testing |
| Watch/listen together | Live local video/audio streaming, host playback controls, explicit receiver playback | Real MP4 and MP3 start/stop; MP4 restart; lifecycle/cancellation tests. Fixture transport isolated, not proof of two-device WebRTC |
| Emoji ease | Direct category icon tabs and search, scrollable results | Phone rendered review and category tests |
| Video sticker crop | Real preview, border drag/keyboard handles, actual encoded crop | Real320x320MP4 exported and saved as playable256x320,1.96s; encoder/cancel tests |
| Group UI/chat | Separate Games/Chat/Watch tabs, own/peer bubbles, compact call toolbar | Phone and desktop rendered checks, contrast correction |
| Group call notices/tones | Authenticated caller events, foreground toast, background private system notice, bounded cooldown;4tones | Author/dedup/privacy tests, native argument/fallback tests. Physical notification audio pending |
| Home statuses/10daily | Row below anniversary hero, original-aspect viewer, atomic persisted local-day quota | Home390px review; viewer/quota/concurrency/deletion tests |

Release verification:220 tests across33files passed, including PWA installation and native screen-capture regression tests. Typecheck passed as part of production build. Web/PWA build passed. Android web build and Capacitor sync passed. git diff whitespace check passed. No ESLint configuration exists. Version metadata changed to1.3.0; dependency versions remain unchanged, and a clean locked npm ci completed successfully.

Gradle8.14.3-all is fully downloaded and SHA256-verified against the official distribution. The Android APK now originates screen sharing using explicit MediaProjection consent, bounded in-memory JPEG frames and a canvas WebRTC video track. Internal app audio is not captured. Android Java compile/APK assembly is a release gate; physical screen capture, rotation, backgrounding, stopping and notification sounds still require phone testing even after successful compilation. DRM streaming apps may block capture. This is an original2D game presentation, not a3D engine.

Production layers: frontend/storage/peer contracts are implemented and locally verified. No new backend API, authentication service, cloud storage, schema migration, queue or paid service was introduced. Existing authenticated WebRTC/signaling/TURN and four-person cap remain. Private streams are not CDN assets. Phone CPU/battery, real peer bandwidth/latency and background delivery are not proven by local tests. Closed-app delivery is not guaranteed. Daily quota trusts device clock/storage; expired blobs retain existing local retention. Both devices should update together because game scoring changed. Rollback is code revert with no schema migration.

Design review: a pragmatist can accept the usable2D games and clearer room flow for paired-device testing. A perfectionist would still ask for richer game art, long-device native-capture testing and audiovisual latency measurements before calling it GamePigeon-level polish. These are explicit limitations, not hidden completed work.

Next device checklist: PC and phone join the same room; play a full match including ties; start calls while the other device is in a game; check notification tone/silent/background privacy; share a screen from PC and from the Android APK, deny consent, rotate, and stop at OS level; watch/listen to a long local clip with pause/seek/rejoin; import/crop/play a video sticker on phone; upload10statuses, delete one, confirm11th still rejected, reload and check viewer aspect ratio. Use test data. Release actions require successful checks and source/artifact provenance.
