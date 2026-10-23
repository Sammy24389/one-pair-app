# Gameplay references and source reuse audit

## Required reference gate

The user supplied six specific Shorts and requested matching graphics, camera, motion and interactions, plus Shorts for the other selected games. These exact clips supersede guesses based on generic genre descriptions. No further visual implementation should be called reference-matched until the footage has actually been inspected.

| Game | User reference | Inspection state |
|---|---|---|
| Basketball | https://www.youtube.com/shorts/qR8hXcMK_d8 | Title retrieved; motion not viewed |
| Paintball | https://www.youtube.com/shorts/xUfVxepUJg0 | Text fetch failed; motion not viewed |
| Four in a Row | https://www.youtube.com/shorts/Y0zEdMHXswI | Text fetch failed; motion not viewed |
| Mancala | https://www.youtube.com/shorts/IIQPIhhFIbw | Title retrieved; motion not viewed |
| Checkers | https://www.youtube.com/shorts/PI4Da8DbRPc | Text fetch failed; motion not viewed |
| Cup Pong | https://www.youtube.com/shorts/X7fw_XOGS38 | Text fetch failed; motion not viewed |

Remaining games requiring verified Shorts: Chess, Gomoku, Word Hunt, Anagrams, Word Bites, Darts and Archery. Searches attempted with game name + GamePigeon iOS + YouTube Shorts, including site-filtered searches; the accessible search results did not establish verified playable Shorts. Do not label search result text or thumbnails as watched footage.

Browser blocker: cua_repl fails before browser access with `failed to write kernel assets: The system cannot find the path specified. (os error 3)`. YouTube text retrieval returns footer-only pages or cache misses. This is an execution-tool blocker, not evidence about the videos. Directly attached playable clips or repaired browser access are needed to complete this gate.

After access: record actual camera/perspective, relative object sizes, drag origin, gesture distance/speed, release behavior, simultaneous projectile count, flight/bounce timing, impact effects, score/timer presentation, board piece transitions, hand/pot sowing sequence, sound and result/replay behavior. Capture reference timestamps and compare an implemented clip side by side. Keep the user's requested 60-second Basketball round unless explicitly changed; a reference's different time does not override that instruction.

## Reuse candidates inspected - 23 October 2026

### OpenPigeon - not imported
https://github.com/OpenBubbles/OpenPigeon
Current README and LICENSE: PolyForm Shield 1.0.0; competing reuse restricted. LICENSE-ASSETS separately prohibits redistribution of artwork/audio/3D models. The project is an Android/OpenBubbles game pack, not an embeddable browser game set. Its older `v1-final-agpl` release is separately described as AGPL-3.0 with an interoperability exception; that is not a permissive drop-in license for this app, and asset rights would still require checking at the exact tag. Current code and art were not copied.
License sources:
- https://github.com/OpenBubbles/OpenPigeon/blob/wordhunt/LICENSE
- https://github.com/OpenBubbles/OpenPigeon/blob/wordhunt/LICENSE-ASSETS

### React Three Basketball - reusable 3D reference, not a finished replacement
https://github.com/benjaminmiles/react-three-basketball
Inspected commit: 31962febdb32a596e9e820624e11b3df004dae54. MIT, copyright Benjamin Miles 2022, notice must be retained. Read-only source snapshot is under ignored release/reference-sources/react-three-basketball. No install/build scripts executed and no dependencies added to Padi.

Actual source `src/App.jsx`: balls are genuine Three.js spheres with Cannon bodies, torus rim and compound spherical collision segments, perspective/orthographic cameras and lights. Shooting is `onPointerDown` with fixed impulse [0,15,-10], not swipe release. Every click adds another ball to an unbounded array. The velocity cleanup returns an array rather than invoking subscription cleanup; scoring bodies' refs are not attached to rendered objects in the inspected source. ROUND_DURATION is 10 seconds, local-only. Dependencies target React 18.2 / React Three Fiber 8.9 / Three 0.146; Padi currently uses React 19.3. These are concrete adaptation/performance/correctness gaps, not a verified GamePigeon match. Can reuse mesh/material ideas or properly attributed code once the target clip is actually viewed; do not install old package versions wholesale.

### Mancala low-poly asset pack - candidate, file-level audit pending
https://ejgarner118.itch.io/mancala-asset-pack
Creator offers wooden board and four marble styles in Blend/FBX/Unity formats. The creator's page comment explicitly permits commercial use, but the downloaded archive/file-level license and provenance have not been inspected. No files imported. It is a model pack, not a finished hand/sowing animation or network game.

## Current work state

This pass changed research documentation only. Existing gesture/game/media implementation remains uncommitted. No claim that the six clips were watched, no new visual fidelity claim, and no commit/deploy/APK release. The reference-matched implementation remains pending the required visual evidence.
