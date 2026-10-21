# Messaging improvements

## First delivery

Outcome: keep talking while using chat, and import, save, and send image stickers.
Preserve the two-device protocol, existing themes, local-first storage, and attribution.
On 2026-10-20 the repository owner confirmed permission from the original author
for these improvements. No license text has been invented.

Acceptance criteria:
- Outgoing and active calls collapse and expand without stopping remote media.
- Compact controls allow mute/end; chat remains usable and app lock stays enforced.
- Late camera/microphone permission results cannot revive ended calls or leak tracks.
- Import PNG/JPEG/WebP static stickers with transparency preserved; animated formats
  and SVG are outside this slice.
- Persist a bounded local library with removal that preserves sent messages.
- Send image stickers over the existing media channel; retain old emoji stickers.
- Cover loading, empty/error states, keyboard access, and small screens.

Design: retain existing tokens, typography, and controls. Put a compact call bar
above normal content, outside the scroll area; never cover the composer. Sticker
tray: import action, saved image grid, existing emoji choices.

Affected layers: React call/chat UI; lifecycle and subscriptions; IndexedDB library
and media storage; existing P2P transport; test CI. No new HTTP APIs, server data,
auth roles, migrations, cloud services, or paid resources.

Verify: clean locked install, typecheck, regression tests, production build, browser
flows where available, mobile layout and keyboard checks. Mock tests do not prove
live cross-network WebRTC or Android background-call reliability.
Rollback: revert feature changes; existing messages and IndexedDB stores remain
compatible. Local sticker-library data may remain unused after rollback.

## Previous cloud proposal (superseded on 2026-10-21)

The user chose P2P-only delivery. The following cloud proposal is historical;
see P2P-CONTRACT.md for the current scope. Unfinished cloud files are preserved
in a git stash on codex/cloud-groups and are excluded from this build.

### Original proposal

1. Decision confirmed on 2026-10-20: reliable offline delivery and group features.
   Introduce authenticated membership and durable storage in a separate phase.
   Before implementation, define identity/account recovery, private media access,
   message encryption/key ownership, retention, provider limits/budget, and the
   explicit opt-in migration from existing local pair histories. No backend has
   been provisioned or connected by this first delivery.
2. Design group membership, invitations, permissions, revocation, and migration.
3. Add conference calls and validated multiplayer sessions with reconnect rules.
4. Add expiring statuses with audience, retention, deletion, and reply rules.
5. Release to Vercel after verification. Choose the permanent origin before real
   users; browser storage does not follow a domain change. Backup excludes media.

## Existing risks outside this slice

- App lock does not encrypt pair secrets or shared data at rest.
- Document updates lack application-level ownership/schema validation.
- General attachments need stronger quotas, input boundaries, and abuse controls.
- Full history scans and retained blobs need a storage/retention design.
- Scaling behavior unknown - production risk.
- Browser push, TURN cost/reliability, group media, monitoring, and restore
  objectives need decisions before public service launch.
- npm audit: three moderate advisories through Capacitor CLI -> xcode -> uuid
  development tooling. No force upgrade or unverified override applied.

## Verification record

- Baseline npm ci --ignore-scripts completed; typecheck passed.
- Sandboxed Vite build hit Windows spawn EPERM; permitted execution outside the
  sandbox completed the production build including the service worker.
- No baseline web test suite or ESLint configuration existed.
- Clean locked install completed (535 packages). Typecheck and all 33 regression
  tests across six files passed after reinstall. Production build (including PWA service worker), changelog validation, and
  git diff --check passed. Existing Vite JSON-import warning remains nonblocking.
- Both devices need this updated app to render newly sent image stickers. Earlier
  emoji stickers remain readable; the P2P protocol has not been replaced.
- Call-start/accept races were caused by asynchronous permission results outliving
  their call. A generation guard and disposal stop obsolete tracks before state
  mutation; delayed-result regression cases prevent recurrence.
- IndexedDB request success precedes transaction commit. Storage promises now
  resolve on commit and reject aborted writes; library updates are atomic.
- Browser onboarding loaded, but repeated browser-control timeouts blocked the
  remaining real-device walkthrough. Two-device pairing/chat/calls, responsive
  rendering, and Android background behavior remain unverified.
- No ESLint configuration exists; no lint success is claimed.
- First delivery was merged to main in b91bd26 and verified on padi-blond.vercel.app.
- The subsequent P2P additions are local until separately committed/published.
