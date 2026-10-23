# Media display corrections

Outcome: profile photo/video remains inside its avatar bounds; status videos display a real decoded preview; watch-together sends only selected media and offers an uncluttered receiver view.

Scope: shared avatar layout, status video frame loading, watch/listen source selection and receiver presentation. Games and deployment are outside this change. Existing local storage and authenticated peer transport stay in use; no API, account, migration or cloud resource is added.

Design: keep avatar badges outside the clipped media circle; use a muted first-frame status preview with explicit playback controls only in the viewer; make Choose video or music the primary watch action and clearly distinguish whole-screen capture. Receiver Join playback opens a bounded black cinema view with original aspect video, a visible Back action, Escape and keyboard focus containment. The same video element stays mounted so audio does not restart on view changes.

Acceptance: large portrait/landscape images and video never exceed avatar bounds at small/large sizes; uploaded and received status videos decode an actual frame without playing audio; local playback capture draws only the video element, never the page; viewers can enter/exit cinema without disconnecting playback; permission/load/play errors are visible and all owned listeners, URLs and streams are released.

Verification: regression tests for lifecycle/geometry contracts, typecheck, full suite, web/PWA build, mobile and desktop rendered checks using synthetic local media. Physical PC/phone audiovisual behavior remains a device check. Explicit screen sharing still captures the user-selected display/window; arbitrary external streaming-app video-only extraction is outside browser control and protected content may be blocked.

Risks/rollback: no media data migration; revert UI/helper changes together. Device codecs and browser autoplay rules vary, so previews have loading/error fallbacks and receiver sound requires a tap. Existing four-person cap and peer network dependencies remain.

Verified locally: 243 tests across 35 files passed, including actual stylesheet containment checks, status decoder timeout/error/source-change cleanup, media-only capture and cinema focus/exit regressions. Typecheck and production/PWA build passed; no ESLint configuration exists. A real local MP4 produced a thumbnail in the compact status tile and full player. Phone-size browser geometry confirmed 28/40/96px video bounds with object-fit cover and visible presence dots. Receiver cinema filled 390x844 and 1280x900 viewports with object-fit contain, played successfully and continued after returning to the room. Local movie broadcast started/stopped without a display picker. The synthetic fixture isolates transport, so this is not evidence of physical two-device WebRTC or Android/iOS decoding.

Cause/prevention: intrinsic profile media was not clipped independently of the presence badge; shared avatar CSS now owns both media types. Metadata-only status videos did not guarantee a decoded poster; the shared status player now requests and bounds a real frame. Watch UI placed display capture before media selection; file sharing is now primary, with explicit whole-screen wording in a secondary disclosure. Cinema uses a stable portal host outside themed cards so blur/transform cannot contain the viewport overlay.

Design review: the practical release outcome is clear bounds, visible previews and a focused receiver. Further codec/device testing is warranted before claiming universal platform support; local tests cannot establish external streaming-app capture permissions or physical peer latency. These changes are local on codex/media-framing and have not been deployed or included in a new APK.
