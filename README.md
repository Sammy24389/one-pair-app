# OnePair 💞

A private little world for two: best friends or couples. **No backend, no accounts, no cloud.** Your two phones talk directly to each other over WebRTC, and everything you share lives only on those two devices, kept in sync automatically.

<p align="center">
  <img src="docs/screenshots/hero.jpg" alt="OnePair: Home, Chat, Moments and Play screens" width="100%">
</p>

<p align="center">
  <a href="https://github.com/ssuvamm/one-pair-app/releases/latest"><b>⬇️ Download the Android APK</b></a> ·
  <a href="https://ssuvamm.github.io/one-pair-app/"><b>🌐 Open the web app</b></a>
</p>

- **Pair with a code or QR code**: no sign-up, no email, no phone number
- **Chat**: text, photos, videos, voice notes, files, links, locations, reactions, replies
- **Voice and video calls**, peer-to-peer over STUN/TURN, ringing even while the app is in the background (Android)
- **Moments**: days together, anniversaries, birthdays, countdowns, a memories timeline, "On this day"
- **Play**: daily question (answer to reveal theirs), photo of the day, tic-tac-toe, Would You Rather, This or That, Truth or Dare, shared doodle canvas
- **Together**: shared lists, love jar, open-when letters, time capsules, gallery, links
- **Live location**, distance apart, partner's local time and battery
- **"Thinking of you" touches** with haptics
- **Gentle nudges** designed with psychology in mind (see [docs/RESEARCH.md](docs/RESEARCH.md)); notifications open the exact message or item
- **App lock**: PIN, or biometric with PIN fallback, plus a privacy cover in the app switcher
- **Six themes** (Material, Glass, Soft UI, AMOLED, Paper, Aurora), accent colours, daily, custom or shared wallpapers
- **Friends mode and Couple mode**, a start page you choose, and multiple pairs supported

## Profile media and stickers

Choose **More → Profile → photo/video** for a display photo (up to 10 MB) or a muted looping MP4/WebM profile video (up to 5 MB, 15 seconds, 720p). Profile videos are stored on-device and sync to paired devices when connected. Old photo profiles remain compatible.

In a chat, open **Emoji → Stickers → Add sticker**. Still PNG/JPEG/WebP images open a crop preview with draggable borders and keyboard controls, Crop and add, Keep full image and Cancel. Animated WebP/GIF/APNG files retain their frames (up to 2 MB / 512 px); silent MP4/WebM stickers support up to 5 MB / 15 seconds / 720 px. The library is capped at 32 items / 32 MB. Received stickers can be saved again. Device codec support applies.

For WhatsApp files, see [manual import instructions](docs/WHATSAPP-STICKERS.md). Import original individual files; copying a favourite or pack link alone does not import the sticker. Older clients must update to display video profiles/stickers.

## P2P additions in this fork

Existing 12-character pairing stays unchanged. **More → Status** shows updates from every paired user. Share text, photos (JPG/PNG/WebP, up to 10 MB) or videos (MP4/WebM, up to 25 MB) with all current pairs for 24 hours. Add an optional caption of up to 500 characters; share up to 10 updates per local calendar day, with at most 20 active updates spanning the 24-hour expiry window. Files transfer when both peers are online. Feed expiry does not automatically erase downloaded files from device storage. Older app versions need updating to view media statuses. Chat has separate Emoji and Stickers tabs, with a searchable local Unicode 17.0 catalogue (3,953 emoji/components including skin tones, flags and ZWJ sequences). New glyphs depend on device font support. Tap Add to stickers below an image sticker to save it; Keep chatting keeps video calls visible in a compact panel. Drag its grip/name header to move it; arrow keys also reposition it and Home resets placement. Full video frames stay visible without tight cropping.

**Play → Multiplayer → Start a room** shows a 12-character invite code. Friends choose Join with code; a separate private pairing is not required. New users can choose Multiplayer & group calls on the initial connection screen. Codes expire after ten minutes, and the inviter must stay online. Share codes only with intended participants. Older full invitations still work. Groups support text chat, direct voice/video calls, and a turn-based game library: darts, word chain, basketball, tactical paintball, four in a row, American checkers, Kalah mancala, and cup pong. Board games use two players; party games support two to four. Each participant explicitly joins a call; minimize it to keep chatting or navigate elsewhere. The group creator hosts the game and must remain connected. Games pause for disconnected participants; reloading the creator ends the in-memory match.

No application backend or cloud account is needed. Public signaling relays and STUN/optional TURN still connect devices. Devices must be online together for delivery; group messages are bounded to the latest 300 on each device. This version has no member revocation or verified individual accounts. Pair backups do not include group history. Changing the Vercel domain creates a separate browser storage origin.

Android users can enable **More → Connection → Stay reachable in background** and the battery exemption. Resume/network recovery now retries missing connections with a bounded backoff and preserves calls. Browser tabs can still be suspended; open does not mean continuously running. Fresh group messages use local notifications when permitted, with private previews while locked.

See [the P2P scope and test checklist](docs/P2P-CONTRACT.md), [game contract](docs/PARTY-CONTRACT.md), and [background behavior](docs/BACKGROUND-CONTRACT.md). Real PC/phone calls and four-device network quality must be tested before public rollout.

## Support OnePair ☕

OnePair is free, ad-free and open source. If you'd like to support development:

- **PayPal:** [ssuvamm@gmail.com](https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=ssuvamm%40gmail.com&item_name=Support%20OnePair&currency_code=USD&no_shipping=1)
- **UPI (India):** `ssuvamm@oksbi`

You can also find these in the app under **More → Support OnePair** and **About**.

## Screenshots

| Home | Chat | Moments | Daily question | Pairing |
|:---:|:---:|:---:|:---:|:---:|
| <img src="docs/screenshots/home.jpg" width="180" alt="Home: days together, live status, touches, moods"> | <img src="docs/screenshots/chat.jpg" width="180" alt="Chat with photo, link card and voice note"> | <img src="docs/screenshots/moments.jpg" width="180" alt="Countdowns, anniversaries and memories"> | <img src="docs/screenshots/daily.jpg" width="180" alt="Daily question, revealed once both answered"> | <img src="docs/screenshots/pair.jpg" width="180" alt="Pairing with a code or QR"> |

**Six themes, each with light and dark modes:** Material, Glass, Soft UI, AMOLED, Paper, Aurora

<img src="docs/screenshots/themes.jpg" alt="The six themes side by side" width="100%">

## How it works

```
 Phone A                                                    Phone B
┌──────────────┐   encrypted WebRTC offer/answer (SDP)    ┌──────────────┐
│ Yjs document │ ───────► public Nostr relays ◄────────── │ Yjs document │
│ (IndexedDB)  │                                          │ (IndexedDB)  │
│              │ ◄══════ direct P2P data + media ═══════► │              │
└──────────────┘    (DTLS/SRTP; via TURN if NAT blocks)   └──────────────┘
```

1. **Pairing.** Person A shares a 12-character code. Person B enters it. Both join a rendezvous room derived from the code and run an ECDH key exchange. Both screens show the same 5 emojis, and A taps Accept. A then sends a random 256-bit **pair secret**, encrypted with the ECDH key.
2. **Private room.** The room id, signaling password and an HMAC key are all derived from the pair secret with HKDF. Signaling messages are AES-GCM encrypted, and a mutual challenge-response handshake lets only the paired device in.
3. **Sync.** All shared state (messages, days, lists, games, moods, locations…) is one [Yjs](https://yjs.dev) CRDT document per pair, persisted in IndexedDB. When the phones connect they exchange state vectors and send each other only what's missing. Edits made offline merge automatically.
4. **Media** is stored as blobs in IndexedDB and streamed over the data channel. Anything the other phone is missing is requested automatically on reconnect.
5. **Calls** use the same peer connection: ring, accept and end signals go over the data channel, and audio/video go over SRTP.

**Restore.** If someone reinstalls, the other person shares their code again, and when accepting picks **"Restore space with …"**. The full history syncs back. An encrypted backup file can also be exported from Settings.

**Limitations of having no server.** Messages are delivered when both apps are online at the same time; until then they wait on the sender's device. For a heads-up while the app is closed, enable optional **ntfy wake-up pings** (Settings → Connection). These are content-free notifications through [ntfy.sh](https://ntfy.sh) or your own ntfy server.

## Tech stack

| Concern | Choice |
|---|---|
| UI | React 19 + TypeScript, Vite, hand-written CSS themes (no UI framework, so the bundle stays small) |
| Native | Capacitor 8 (Android), plus an installable PWA |
| P2P | [Trystero](https://github.com/dmotz/trystero) (Nostr signaling) on WebRTC |
| Sync | Yjs + y-indexeddb |
| Crypto | WebCrypto: ECDH P-256, HKDF, AES-GCM, HMAC, PBKDF2 |
| Biometrics | `@aparajita/capacitor-biometric-auth` (native), WebAuthn platform authenticator (web) |
| Maps | Leaflet + OpenStreetMap |

The first load is about 150 KB gzipped. Every secondary screen is lazy-loaded, and chat renders a window of recent messages.

## Develop

```bash
npm install
npm run dev            # http://localhost:5173
npm run typecheck
npm test               # web regression suite
npm run build          # PWA build into dist/
```

To test pairing locally, open the dev server at two **different origins** (for example `http://localhost:5173` and `http://127.0.0.1:5173`) so each has its own storage.

### Calls and image stickers

During an outgoing or active call, choose **Keep chatting** to collapse the call.
The compact bar lets you return, mute, or hang up while using the rest of the app.
The app lock still protects chat. Microphone/camera access continues until hang-up;
minimizing is not muting. Voice-note recording is disabled during a call.

Open **Chat → Stickers → Add image sticker** to import PNG, JPEG, or WebP (up to
2 MB). Imports become static images up to 512 pixels and 512 KB; transparency is
preserved. The local library holds up to 32 stickers / 32 MB. **Manage** removes a
library entry without deleting already-sent copies. Long-press a received image
sticker and choose **Add to stickers** to save it. Old emoji stickers still work.
The library stays on this browser/device and is not included in pair backups.
Both devices need the updated app to render image stickers. Like other messages,
sent stickers wait locally until both devices are online.

See [implementation notes](docs/IMPLEMENTATION.md) for scope, verification gaps,
rollback, and the planned move to reliable offline delivery and groups.

### Android

Requires JDK 21 and the Android SDK.

```bash
npm run cap:sync       # web build for Capacitor + copy into android/
npm run android:open   # open in Android Studio, or:
cd android && ./gradlew assembleDebug
```

## Releasing

Releases are fully automated by GitHub Actions. You only commit, tag and push.

1. Add your changes under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
2. Run `npm run release -- 1.1.0`. This bumps the version and turns *Unreleased* into `## [1.1.0] - date`.
3. Commit, tag and push:
   ```bash
   git add -A && git commit -m "Release v1.1.0"
   git tag v1.1.0 && git push && git push origin v1.1.0
   ```

The **Release** workflow then:
- checks that the tag matches `package.json`, typechecks, and builds the PWA and the Android release APK (versionCode = `major*10000 + minor*100 + patch`)
- publishes a GitHub Release whose notes are the matching CHANGELOG section, with `OnePair-vX.Y.Z.apk`, `OnePair-vX.Y.Z-web.zip` and `SHA256SUMS.txt` attached
- deploys the PWA to GitHub Pages

The **CI** workflow runs on every push and PR: it typechecks, builds the web app, checks Android compilation without distributing its debug APK, and validates the changelog.

### One-time repository setup

1. **Pages.** Go to Settings → Pages → Source and choose **GitHub Actions**.
2. **APK signing.** Local releases and GitHub releases use one permanent key pinned by `android/release-signing.sha256`. Release builds fail if signing credentials are absent, invalid or belong to another certificate; there is no debug fallback. Follow [the signing runbook](docs/ANDROID-SIGNING.md) to initialize, configure GitHub secrets, build locally and make an encrypted backup. Never commit the keystore or passwords. Development debug builds are not updateable release downloads.
3. Replace `OWNER/REPO` in the links at the bottom of `CHANGELOG.md`.

## Connectivity

STUN servers (Google, Cloudflare, Twilio) are built in. Most home Wi-Fi works directly. Strict mobile networks need a **TURN** relay:
- A free community relay (Open Relay Project) is enabled by default. It's rate-limited and best-effort.
- For reliability, add your own under **More → Connection** (for example a self-hosted [coturn](https://github.com/coturn/coturn), Cloudflare Calls TURN, or a Metered.ca free-tier account). The **Test connectivity** button reports whether STUN and TURN are reachable.

Relayed traffic stays end-to-end encrypted. A TURN server only forwards encrypted packets.

## Privacy and security

- No analytics and no accounts. The only network peers are Nostr relays (which see encrypted, rotating signaling blobs), STUN/TURN servers, OpenStreetMap tiles, Picsum (daily images) and, if you enable it, ntfy.
- Android cloud backup and device-transfer are disabled for app data, so pair secrets never leave the phone.
- The PIN is a salted PBKDF2-SHA256 hash (210k iterations) with exponential back-off after 5 wrong attempts.

## Project layout

```
src/
  lib/            core: crypto, pairing, space (sync + P2P), calls, nudges, security, location…
  screens/        Home, Chat, Moments, Play, Games, Daily, PhotoOfDay, Doodle, Lists, Notes, Map, Settings…
  components/     shared UI and effects
  styles/app.css  design tokens and the six themes
android/          Capacitor Android project
scripts/          release helpers (changelog extraction, version checks)
.github/workflows CI + release
docs/RESEARCH.md  competitive research and nudge psychology
```
