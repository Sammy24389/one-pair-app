# Background reachability contract

Keep existing peer connections and local message persistence while the app is running; recover missing connections on startup, network return and app/browser resume without interrupting calls. No new backend, push provider, authentication service or recurring cost is introduced.

Recovery uses six jittered retries per connection-loss or lifecycle event, pauses while the device reports offline, and skips healthy connections and calls. It leaves the underlying signaling room available after the retry budget expires. A later resume/network event starts a new bounded recovery window. Disconnect/destroy cancels pending connection setup so stale asynchronous work cannot reopen a room.

Android retains the existing user-controlled foreground-service notification and battery settings. Browser tabs and Android WebViews can be suspended; keeping a tab installed/open does not guarantee continuous execution. No closed-app delivery guarantee is made. Persisted local messages catch up when both devices can execute and reconnect. Existing optional ntfy wake-up remains separate and unchanged.

Affected layers: frontend settings/copy, lifecycle and WebRTC connection logic, existing local persistence, and Android service copy. No schema, API, cloud resource, secret or deployment changes. Signaling/STUN/TURN availability and mobile OEM battery policy remain external dependencies. Scaling behavior unknown — production risk. Pair/group peer limits are unchanged.

Verification: scheduler fake-timer tests cover offline pause, jittered budget, healthy/call skips, wakeups and disposal. Connection tests cover concurrent connect and stale setup cancellation. Run typecheck, complete test suite and production build. Native foreground/background and locked-phone delivery need real-device testing; no native service behavior is asserted from web tests.

Primary references:
- https://developer.chrome.com/docs/web-platform/page-lifecycle-api (background pages can freeze/discard; freezable tasks stop).
- https://developer.android.com/training/monitoring-device-state/doze-standby (Doze restricts network access; foreground-service and power exemptions are conditional).
- https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start (foreground-service background start and while-in-use permission restrictions).
