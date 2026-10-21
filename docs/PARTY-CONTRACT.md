# Turn-based games and background reception contract

Outcome: while the app process and network remain available, retain P2P reception and recover interrupted connections without ending healthy calls. Extend private groups with darts, word chain, basketball, tactical paintball, four in a row, American checkers, Kalah mancala and cup pong. User selected turn-based mini-games on2026-10-21.

Rules/UX: group creator hosts and validates every move. Board games use two selected online players; suitable party games allow two to four. Other group members spectate. Display rules, current player, legal actions, outcomes and disconnection state. All aiming games support touch and keyboard; animations stop when hidden or reduced motion is enabled. No external dictionary, physics service or game server. Word chain is casual spelling without dictionary verification.

Transport contract: bounded party-state snapshots with increasing sequence; party-move carries gameid/version/move. Only owner transport can send snapshots, and only admitted current players submit moves. Reject invalid/stale/duplicate/out-of-turn actions. Pause whenever any selected player or creator disconnects. On reconnect the creator supplies the current state; a creator reload ends the in-memory match. No hidden-information or monetary stakes; trusted members and host are not cheat-proof identities.

Affected layers: deterministic rules, responsive game UI, existing group admission/data channel, connection lifecycle, Androidforeground-service copy, local browser recovery and test/build pipeline. No HTTP endpoint, database query/index, schema migration, new dependency or paid resource. Games are in-memory sessions; chat remains bounded and locally persisted. New assets are static/PWA cacheable; group data stays outside CDN caches. Recoverable connections use finite bounded retries and no healthycall teardown. No background media capture without explicit calljoin.

Platform limits: Androidforegroundservice helps keep process alive but cannot guarantee WebView/OS scheduling or network during Doze/OEMbattery restrictions. An open browser/PWA can be frozen or discarded; no serviceworker trick guarantees persistentWebRTC while suspended. Appclosing/force-stop cannot be solved without a reachable receiver or external wakeup service. Existing signaling/STUN/optionalTURN dependencies remain. No automatic cloudnotifications added.

Acceptance: all8 playable end-to-end with valid win/draw conditions; malformedmoves and invalidstate rejected; capture/mancalaseed invariants tested; reconnect race/cleanup/callpreservation covered; touch targets at least40px where practical; typecheck, fullsuite, web and Androidwebbuilds pass. Android APK/servicebehavior and cross-device suspendednetwork tests remain separately required. No ESLint configured.

Recovery: revert this phase, preserving existing pair/group chat data. No database/cloud rollback. Native code changes require rebuilding/installing APK; Vercel deployment only changes browser assets. Do not claim APKverified from a Vitebuild.


## Verification and PC/phone checks

- npm run typecheck passed;107 tests across17 files passed.
- npm run build:android and npm run build passed; final dist is the Vercel/PWA build. No dependency changes or new package install required.
- Existing Vite JSON-import warning remains nonblocking. ESLint is not configured. No APK assembled or native runtime behavior certified.
- Open Play > Multiplayer or More > Groups, create/join the same private group on both devices, select the game and connected players on the creator device. Follow the displayed rules. Two-device board games require both players; party games can select up to four. Other members spectate.
- Complete each game on PC and phone, including a forced checkers capture, mancala extra turn/capture, aiming a shot, and word-chain repetition rejection. Reconnect a player and verify pause/resume and duplicate move handling. Reloading the creator starts a new session rather than restoring the match.
- For background reception, install the Android build, enable the background service and unrestricted battery option, grant notifications, then lock the phone and send pair/group messages from the PC. Repeat on cellular and after Wi-Fi changes. Verify notification privacy, tap-to-open group, and call continuity across foreground changes.
- For the web version, leave the tab open, background it, send messages, then return. Verify catch-up after suspension. The browser may freeze/discard tabs, so this is conditional reception rather than guaranteed push.
- Browser inventory had no available surfaces, so rendered layouts, touch behavior, native locked-screen notifications and cross-device gameplay are not verified here. The implementation is suitable for a trusted-friend beta; a stricter public release still needs those device checks and revocable/verified group membership.
- No commit, push, Vercel deployment, database migration or cloud provisioning was performed in this phase. Revert this phase to recover previous behavior; persisted pair/group chat remains compatible.
