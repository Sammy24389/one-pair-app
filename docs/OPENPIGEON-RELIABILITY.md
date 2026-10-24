# OpenPigeon reliability corrections

Outcome: each participant receives the next turn, completed matches leave the playable list, unfinished matches expire 24 hours after creation, room Back returns to room list, and avoidable synchronization delays are removed.

Contracts: opaque game URLs stay opaque to JavaScript; native game rules expose completion as a validated optional boolean. Owner remains authority for participant roster and monotonic match revision. Creation time is fixed, including across reconnects. Legacy records use earliest locally known update time. Terminal records remain bounded locally for replay rejection; they are not playable. Offline devices apply expiry on resume.

Scope: Android native bridge, peer-group transport/storage, room navigation, and source-grounded sync review. No new servers, accounts, paid infrastructure or database migrations. Existing room limits, authentication proofs, payload limits, device storage ownership and native private-component boundaries remain.

Verification: alternating owner/guest turn regression, terminal and 24-hour boundary tests, replay/reconnect and malformed metadata, navigation regression, typecheck, full web tests and build, native unit tests/compilation. Actual phone latency and gameplay require the two physical devices; no measured speedup is claimed from source inspection alone.

Rollback: revert these changes without deleting application data or changing signing keys. Retain compatibility with records without the new metadata.

## Cause and safeguards

Incoming native state is published before listeners run. A delayed local acknowledgement commits only while the same base snapshot remains current; it cannot overwrite a newer remote turn. Catch-up revisions reach the native engine without replaying old notifications. OpenPigeon keeps its original invited-player opening turn.

Completion is derived from native OpenPigeon winner metadata, not isLive (which is true even for finished games). New matches have a fixed creation timestamp. Active matches disappear at completion or 24 hours after creation; bounded nonplayable records remain for up to 7 days, capped at 24 sessions to reject replays. Older records use the earliest update known to this device.

Media requests use 150 ms non-postponing coalescing instead of 1500 ms trailing debounce; reconnect requests use 250 ms instead of 2500 ms. Batches match the sender's 200-ID limit. Inactivity retry runs at 60 seconds and rotates across missing IDs. Progress extends the deadline; completion releases capacity. Group call peers negotiate concurrently and video targets 720p at 24 fps (30 fps cap).

No device latency benchmark has been performed. Large media transfers remain a bandwidth constraint; send deduplication, a transfer priority queue and batched media-existence reads are deferred. No new network endpoints, servers, database indexes or cloud costs are introduced. Existing peer authentication, bounded payloads/rates and room limits stay in place. Wider scaling and background-OS behavior require device testing.

## Verification result

367 web tests across 49 files passed, including expiry, completion, reconnect catch-up, room navigation, media retry and concurrent call negotiation. TypeScript, the production Android web build/Capacitor sync, 13 signing/source/package checks, 10 Android JVM tests, and native Java/Kotlin compilation passed. No ESLint configuration is present. Android compilation required relocating Kotlin temporary state to the established writable user cache; no checks were bypassed.

These corrections are being packaged as a signed Android test release with matching source. Physical two-phone turn handoff and transfer latency remain to be verified on the rebuilt APK.
