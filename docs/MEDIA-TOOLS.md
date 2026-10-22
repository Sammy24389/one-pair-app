# Media tools contract

Outcome: choose emoji with direct, horizontally scrollable category icons; crop photo and video stickers by dragging four borders before adding to the local library.

The crop view preserves original aspect ratio and shows the entire source. Selected pixels are exported to a new file, with a maximum side of 512 pixels. Four 44px border controls support pointer/touch drag and keyboard arrows (1%, Shift 5%); Reset restores the full frame. Existing source files are unchanged. Static image export remains PNG before existing library compression. Animated GIF/WebP imports bypass cropping so animation is preserved.

Video crop accepts at most 15 seconds, 5 MB source and 1920px maximum side. It records the selected canvas region at 24 FPS with no audio, ≤5 MB output, codec selected from browser-supported WebM/MP4. Export occurs in real time, is cancellable, times out after 22 seconds, and releases canvas tracks/listeners/timers. Unsupported devices show an error and can keep a valid original video (existing 720px original-video limit). No server upload or external encoder is introduced. Native WebView codec support must be tested on the target Android phone; not all devices encode video.

Storage, quotas, transfer validation, authentication and public API behavior are unchanged. Crops are validated before drawing, exported output re-enters existing sticker validation, object URLs and image bitmaps are released. Processing is bounded to local clips; no new database or hosting resource is needed.

Verification: crop geometry and output dimensions; keyboard resizing, reset, save failure, cancellation and cleanup; direct category navigation/search; video recording cleanup, size/time/codec rejection. Browser verification should cover touch-sized layout and an actual cropped clip because mocked unit tests cannot prove device codec behavior.

## Android notification tones

Settings choose Chime, Bell, Soft or Silent. Run `python scripts/generate-notification-tones.py` to reproduce the three original synthesized WAV assets bundled in res/raw (24kHz mono PCM, each under one second). Immediate native messages and pair calls receive the selected tone; sounds off maps to Silent. Unknown preferences map to Chime. Android uses at most eight new channel IDs (message/call times four tones), preserving channel immutability and the user's OS overrides. Silent sets no sound/vibration and no insistent ringing. Fallback plugin notifications use a low-importance silent channel to suppress Android's default sound; ordinary tones use the matching bundled resource.

Old channels remain so foreground-service fallback notifications remain compatible. OS notification permission, volume, Do Not Disturb, per-channel overrides, and background restrictions still apply. Native compilation verifies resource/API compatibility; actual sound and notification delivery require a physical Android device. No cloud push service or new API is introduced.
