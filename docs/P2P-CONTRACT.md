# P2P improvement contract - 2026-10-21

The user chose to retain 12-character device pairing and avoid a new application backend. The unfinished Supabase/LiveKit work is preserved in git stash on codex/cloud-groups; it is outside this build.

Outcome: paired friends can share expiring text statuses, use existing image stickers and minimized calls, and explicitly join small groups for chat, calls, and multiplayer play.

Scope: private pair text statuses (24-hour visibility); separate opt-in groups with bounded local history; direct mesh calls capped at four participants; a turn-based multiplayer game. Existing pair history and pairing protocol remain compatible. Groups require a secret invitation, shared only with intended participants. No accounts, cloud message inbox, push delivery, SFU, or guarantee of background mobile calls.

Acceptance: validate invitation and message bounds; peers explicitly join media calls; ended calls stop tracks including late permission results; calls remain mounted while navigating/chatting; group games reject invalid/out-of-turn moves; status deletion checks ownership and hides expired entries; UI provides labels, empty/error states, and responsive controls.

Affected layers: React screens/navigation, P2P signaling/WebRTC, IndexedDB/localStorage persistence, local identity and group admission, build/test pipeline. Vercel hosts static assets. Existing third-party signaling, STUN and optional TURN remain network dependencies. No new HTTP API, database migration, queue, or paid resource is introduced.

Limits: devices must be online together to synchronize; delivery is not a durable offline inbox. Group membership secrets confer access: invitations must be treated as private. Mesh bandwidth grows with participants; four-person cross-network/mobile quality needs real-device testing. IndexedDB/localStorage are not encrypted backups; clearing browser data loses local identity/history. Expiry uses device clocks and is not remote cryptographic erasure. Scaling beyond the stated four-device limit is out of scope.

Verification: typecheck, configured test suite, production web build and Android web build; browser smoke where available, followed by PC + phone pairing, status sync, sticker transfer, minimize/restore, group call/chat and game tests. No ESLint configuration currently exists. Mocked media tests cannot certify real-network calls.

Recovery: revert this branch to the previously deployed merge b91bd26. New group/status records remain local and can be ignored by the previous version. No production database changes require reversal. Do not publish until checks pass; live rollout and real-device verification are separate from a local rebuild.
## PC and phone acceptance check

1. Deploy the same rebuilt commit to both clients; reload the PWA so its service worker activates the new assets. Keep the existing Vercel origin to retain device identity.
2. Pair using the normal 12-character code and compare the displayed authentication emojis. Send text and an imported image sticker in both directions.
3. Start a pair call, minimize it, send chat messages, restore it, then end it. Confirm microphone/camera indicators turn off. Try denying permission and cancelling while permission is pending.
4. Open More > Status. Publish and delete an update. Disconnect the phone, publish another, reconnect both apps and confirm synchronization. Expiry is also covered by clock-controlled tests; do not change the PC clock.
5. On the PC open More > Groups, create a group, copy its invitation, and send it through the existing private pair chat. On the phone paste it into Join group. Never publish the invitation or include it in screenshots.
6. Send group messages in both directions. Disconnect/reconnect one device and check retained history. The latest300 records are retained per device; there are no delivery/read receipts.
7. Both devices explicitly join a group voice/video call. Minimize, send messages, navigate to another screen, restore, mute, turn camera off, and leave. Check that leaving stops local media. Try starting a pair call during the group call: capture must be refused.
8. Start Race to21 on the creator device. Alternate legal moves until exactly21; wrong-turn and stale-version moves must not advance the game. A third/fourth device is required to verify conference and multiplayer behavior beyond two participants. Test Wi-Fi to cellular; TURN may be required by the networks.

Release limits: text statuses only; the initial Race to 21 slice is now extended by the eight games in PARTY-CONTRACT.md; group chat currently text only (pair chat retains stickers/media). Group members hold a shared admission secret and are trusted for replayed history and claimed identity. There is no member removal/revocation; to exclude someone create a new group with a new invitation. No APK has been assembled by the web build commands. No automated browser surface was available for the final visual walkthrough, so responsive rendering and real media quality remain release checks.

## Initial P2P slice verification - 2026-10-21

- Clean npm ci completed with the P2P lockfile (535 packages); no new dependencies added.
- npm run typecheck passed.
- npm test:55 tests across11 files passed, including real Yjs status sync, status UI, invitation validation, move validation, retained-history batches, flood limits, targeted media, cancellation and overlay lock/minimize behavior.
- npm run build:android passed (web assets only); npm run build passed last, leaving the Vercel/PWA build in dist.
- Local Vite preview returned HTTP200 for HTML,10 entry assets, and the service worker. Groups, Status and Chat production chunks exist.
- git diff --check passed. ESLint is not configured. Existing Vite JSON import warning remains nonblocking.
- No browser surface was available for visual verification; PC/phone calls, network traversal, mobile layout, background behavior and a four-device conference are unverified.
- No commit, push, production deployment, cloud provisioning, or database migration was performed for this phase.

Review tradeoff: a pragmatist can use this as a locally verified beta for trusted friends. A stricter public release needs real-device evidence, revocable membership/verified identities, recovery/export for groups, storage/retention hardening and operational monitoring. Existing pair/Yjs ownership and attachment-limit risks documented in IMPLEMENTATION.md remain outside this change.
