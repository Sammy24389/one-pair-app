# Changelog

All notable changes to OnePair are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).
Each `## [x.y.z]` section becomes the GitHub Release notes for tag `vx.y.z`.

## [Unreleased]

### Added
- Searchable Unicode 17.0 emoji catalogue with categories, flags, skin tones and joined sequences.
- Photo/video statuses with optional captions and a combined feed for all paired users.
- Private multiplayer rooms with expiring 12-character invite codes and group calls for up to four devices.
- Eight turn-based games: darts, word chain, basketball, paintball, four in a row, checkers, mancala, and cup pong.
- Text statuses that expire after 24 hours and bounded background reconnection.
- Separate emoji/sticker tabs, visible received-sticker saving, and a minimized participant video grid while chatting.
- Minimize outgoing and active calls to keep chatting, with return, mute, and hang-up controls.
- Import static PNG/JPEG/WebP stickers, send them in chat, and save received stickers to a local library.
- Bounded sticker storage, validation, loading/error states, and library management that preserves sent copies.
- Web regression tests for call lifecycle, call UI, sticker storage, and sticker picker, enforced in CI.

### Fixed
- Compact call framing and controls, with draggable private/group call panels and viewport bounds.
- Stop late media permission results from reviving ended calls or leaving camera/microphone tracks open.
- Release call visibility subscriptions and late wake locks when their owners are destroyed.
- Subscribe to incoming calls for pairs added while the app is already open.
- Wait for IndexedDB transactions to commit before reporting successful storage writes.

## [1.2.2] - 2026-10-17

### Fixed
- **Backup export now saves a file on Android.** Export opens the system "Save as" picker so you choose where the backup goes, and confirms with "Backup saved". Before, nothing was written on Android.
- Saving chat files and attachments works on Android too, through the same picker.

### Changed
- The **Support OnePair** card moved from Settings to the **More** page (it stays on About too). PayPal now opens a regular PayPal payment instead of PayPal Donate, which isn't available in every country.

## [1.2.1] - 2026-10-17

### Added
- **Support OnePair:** a donate card in Settings and About with PayPal (ssuvamm@gmail.com) and UPI (ssuvamm@oksbi). Tap to open PayPal or your UPI app, or copy the ID.

## [1.2.0] - 2026-10-14

### Added
- **Choose the start page:** Home, Chat, Moments or Play. You pick it during onboarding and can change it in Settings → "Open OnePair on". After pairing and on every launch the app opens there, and the Android back button returns to it from other pages before exiting.
- **Notifications open the right place:**
  - A message notification opens that pair's chat, scrolls to the message (loading older history if needed) and briefly highlights it.
  - A missed call opens the chat.
  - Nudges open their screen with the item highlighted: the daily question with the answer box focused, photo of the day, the specific countdown in Moments, the letter, the game, or the touch/mood card.
  - In-app toasts and nudge cards behave the same way.
- Opening the chat clears that chat's notifications from the shade.

### Changed
- **Chat is a normal tab** with the tab bar visible, so it's always clear how to reach the other pages. The tab bar steps aside while the keyboard is open.
- The keyboard stays open after you send a message.
- The Chat tab no longer shows an unread badge while you're on it.

## [1.1.0] - 2026-10-14

### Added
- **Choose Friends or Couple during onboarding.** It pre-selects the mode when you share your code, and you can switch any time in **Settings → Your space**. The change syncs to both phones, along with the "since" date.
- **Calls ring when the app isn't open.** A low-priority background service keeps OnePair reachable, so Android no longer freezes it. Incoming calls show a proper ringing call notification with **Answer / Decline**, play your ringtone, and open full-screen on the lock screen where allowed. Missed calls leave a notification.
- **Unrestricted battery prompt** (Home card and Settings → Connection → Reachability) so calls still ring with the screen off.
- **Calls continue in the background.** The microphone and camera keep working if you switch apps mid-call.
- A "OnePair was closed" notice if the app is swiped away from recents, since it can't receive calls until reopened.
- Calling a partner who is offline sends an ntfy wake-up ping, if enabled.

### Changed
- **The app lock has three options: Off, PIN, Biometric.** Biometric always has your PIN as fallback. The separate "Biometric + PIN" mode is removed, and existing users are migrated to Biometric.
- Calls can be answered while the app is locked; the lock comes back after the call.

### Fixed
- Answered calls were hung up about 47 seconds after they started ringing.
- The biometric lock re-prompted in a loop and never reached the app. The prompt briefly backgrounds the app, and that was mistaken for "user left". Photo/camera pickers and permission dialogs no longer trigger auto-lock either.
- Switching to the back camera during a video call failed on phones that can't open two cameras at once.
- The mood cards and the Call/Video/Location buttons on Home had uneven heights; grid cards are now always the same height.

## [1.0.0] - 2026-10-13

### Added
- **Serverless pairing**: share your code (or show it as a **QR code**) or enter / **scan** theirs. ECDH key exchange with emoji verification on both screens, and no accounts or sign-up.
- **Peer-to-peer core**: WebRTC over public Nostr signaling (encrypted), configurable STUN/TURN, HMAC-authenticated private rooms.
- **Two-device sync**: CRDT (Yjs) document stored on both phones. It works offline and merges automatically when you reconnect. Re-pairing a reinstalled phone restores the full history from the other device.
- **Friends and Couple modes**, plus support for multiple pairs.
- **Chat**: text, emoji, stickers, replies, reactions (double-tap ❤️), delete for both, read receipts, typing indicator, link cards, photos, videos, files, voice notes, locations.
- **Voice and video calls**: ringing, mute, camera on/off, camera flip, upgrade from audio to video, call log.
- **Home dashboard**: days-together counter, live online status, battery, partner's local time, distance, mood check-ins and status.
- **"Thinking of you" touches** with haptic patterns and floating-emoji animations.
- **Moments**: anniversaries, birthdays, countdowns, auto milestones, memories timeline with photos, "On this day".
- **Play**: daily question (answer to reveal), photo of the day (blurred until you share yours), tic-tac-toe, Would You Rather, This or That, Truth or Dare, shared doodle canvas, date and hangout idea spinner.
- **Together**: shared lists (bucket, watch, ideas, places, wishlist), love jar, open-when letters, time capsules, shared gallery, links collection.
- **Location**: live location sharing on an OpenStreetMap map, distance apart, one-off location messages.
- **Psychology-informed nudges**: rhythm-aware, quiet hours, daily caps, no guilt or streak pressure.
- **Security**: PIN, biometrics, or biometrics + PIN, auto-lock, app-switcher privacy blur, PIN back-off, no cloud backup of secrets.
- **Themes**: Material, Glass, Soft UI (neumorphism), AMOLED, Paper and Aurora, each with light and dark modes, accent colours, gradient, daily, custom or shared wallpapers, dim and blur.
- **Optional ntfy wake-up pings** for when your pair is offline (they contain no message content).
- **Encrypted backup** export and import, including **restore on a fresh install** from the welcome screen.
- **Instant Android notifications** for messages, touches and incoming calls while the app is in the background, using separate "Messages & calls" and "Gentle nudges" channels.
- **CI and release automation**: GitHub Actions build the APK and PWA, publish a Release with these notes, and deploy to GitHub Pages.

[Unreleased]: https://github.com/OWNER/REPO/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/OWNER/REPO/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/OWNER/REPO/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/OWNER/REPO/releases/tag/v1.0.0
