# Home status contract

Outcome: Home shows a horizontally scrollable thumbnail strip immediately below the anniversary hero. All currently paired users appear, own replicated posts are deduplicated, and no peer updates are forwarded to another pair. Add status opens the existing composer.

Opening a thumbnail or Open status opens an accessible modal with close/Escape, focus restoration, original media aspect ratio and video controls. Thumbnails crop only for the compact preview; original files are preserved. No autoplay or audio starts on Home. Media transfer and playback failures have visible states.

Uploads are limited to ten per local calendar day per device identity. An atomic IndexedDB read/write transaction persists the count across reloads, deletion and concurrent tabs. Existing same-day posts seed the count when upgrading. The twenty-active bound permits ten yesterday and ten today within the unchanged24-hour expiry. Text, photo and video each count as one upload; sharing to multiple current pairs counts once. Media byte limits are unchanged.

This is a local application limit, not server-enforced abuse protection: changing the device clock/time zone, clearing storage or changing identity can bypass it. A failure after quota reservation can consume a slot conservatively. Expired binary files follow existing local retention; this feature introduces no cloud storage, API, database migration, account or external service. P2P transfer still requires both devices reachable. Remote malformed or excessive data remains bounded by status validation and per-owner active filtering.

Verification: typecheck, existing status/feed/UI tests, daily quota boundary/reload/deletion tests, viewer keyboard and original-aspect UI tests. Manual desktop/mobile rendering remains a release check. Rollback is code-only; the quota record can remain inert in IndexedDB.
