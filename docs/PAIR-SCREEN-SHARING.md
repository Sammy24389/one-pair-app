# Pair-call screen sharing

During an active pair call, Share screen opens the browser chooser or Android native MediaProjection consent dialog. Only an explicitly selected surface is captured. The screen video replaces outgoing camera video; microphone and incoming audio continue unchanged. System/tab audio is intentionally not captured. Stop screen sharing or the browser Stop action restores the retained camera and its previous on/off state, or returns an audio-only call to audio-only. Camera controls are hidden during sharing. Camera capture remains reserved but disabled during sharing, so it can be restored without another permission request.

Supported desktop browsers over HTTPS (or secure localhost), and the Android APK through its native bridge, can start capture. Mobile browsers without getDisplayMedia can receive the ordinary video track. Protected DRM surfaces may appear blank at the browser/OS level.

No new backend APIs, storage, server, permissions persistence or dependencies. The APK adds a mediaProjection foreground service and fresh per-session Android screen permission. The existing pair WebRTC transport and media lease apply. Trystero0.26 core source peer.mjs/media.mjs/shared-peer.mjs was inspected: replaceTrack targets the sender by its old track and retains track ownership; audio-only upgrades use addTrack and removeTrack. Pending chooser results after hangup are stopped; hangup/dispose stops display and retained camera tracks. A camera restore failure ends the call to stop sharing safely. Browser cancellation leaves the call active with a visible explanation.

Verification: typecheck; call-controller permission, stale-result, microphone preservation, restoration and stop tests; call overlay regressions. Actual browser capture permission chooser and physical two-device receipt require a manual secure-context call test. Rollback is code-only, with no schema/data change.

Android capture uses the shared native MediaProjection bridge in screen-capture.ts; see ANDROID-SCREEN-SHARING.md. Mobile browser capture remains platform dependent.
