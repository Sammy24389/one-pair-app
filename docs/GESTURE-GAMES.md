# Gesture game revision

User outcome: play with finger or mouse directly on the game objects, with visible pickup, release, flight, collision and result. Replace action-button-led sports; keep accessible keyboard alternatives. Remove Sea Battle and Reversi from the selectable collection; restore Paintball. The resulting collection has 13 games.

Scope: Darts flick/release; Archery draw/release; Cup Pong flick/release; Basketball a host-timed 60-second turn with repeated throws, equal time for every player and derived scores. Modern dimensional boards with direct piece drag/drop, word trace/release and Mancala scoop/hand/sow/drop animation. Use the user's permitted gesture/dimensional alternative, not a claim that CSS perspective is true WebGL 3D. Original visuals, no copied assets.

References: official GamePigeon press kit https://gamepigeonapp.com/presskit.html and official trailer https://vimeo.com/182106293; gameplay accounts https://appdrum.com/gamepigeon-basketball-gameplay-cheats-tips-tricks-79/ and https://wuerfelheld.wordpress.com/2020/06/09/gamepigeon1/. Browser tool fails before video playback; do not claim footage was watched. Actual video review and rendered-device checks are unresolved verification gates.

Boundaries: retain authenticated peer transport/room-owner authority. Protocol 3 prevents older rule clients joining new matches. No API, database, migration or application server added. Host monotonic clock stamps basketball elapsed time and ends rounds at the deadline even if no shots arrive. Pause gameplay on disconnect; elapsed round time continues, avoiding unlimited time via disconnect. Friendly owner trust remains; this is not a competitive anti-cheat server.

Paintball: two players privately choose one of three covers and aim at an opposing cover, commit salted choices before either is revealed, resolve both attacks together. First to three hits after an equal exchange wins; simultaneous winning totals draw; seven exchanges maximum. Device-local pending choice has bounded retention; withheld reveals can stall friendly matches and are explained. No hidden choice is transmitted before both commitments.

Verification: deterministic rule/clock tests, negative malformed/out-of-turn/stale tests, gesture-release/cancel/keyboard tests, animation lifecycle/reduced-motion tests, full tests/typecheck/build. Browser screenshots and PC/phone gesture/performance checks required before calling the visual result approved. No commit/deploy/APK in this phase.

Review correction: a retry after a lost Paintball acknowledgement initially replaced the pending salt/choice, making an already accepted commitment impossible to reveal. Retries now reuse the original saved choice for the game/player/exchange. Regression tests cover accepted commit, lost ack, retry and successful reveal. General rule: never replace a pending commitment secret before the authoritative state confirms the exchange has advanced.

## Verification result - 23 October 2026

Full suite `npm test -- --maxWorkers=1 --pool=threads`: 327 tests passed across 45 files. Final `npm run build` passed (TypeScript, Vite and PWA generation). Final lost-ack retry UI regression also passed in a focused four-test run. `git diff --check` passed. No ESLint configuration exists. No dependencies added in this revision. Build warnings remain for the pre-existing Vite config JSON import and the intentionally separate offline dictionary chunk.

The local review page returned HTTP 200 and includes a local host-clock simulation for Basketball; it is not a physical network session. Browser interaction/capture currently fails with missing kernel assets before page inspection, so this revision has no new rendered screenshots or watched-video evidence. Prior baseline screenshots do not validate the new visuals. Keep deployment/APK publication pending visual and physical-device playtesting. Source changes remain uncommitted, including the earlier media fixes.

Pragmatic assessment: deterministic gestures, game rules, hidden-choice exchanges and host deadlines pass automated coverage and are ready for a local playtest. Stricter assessment: projected SVG/CSS is not full WebGL 3D, and animation feel, gesture calibration, mobile performance and likeness to the reference cannot be approved from jsdom tests. Those remain explicit acceptance gaps.
