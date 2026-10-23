# OpenPigeon in the OnePair Android build

## Selected distribution

The owner approved a single-install Android build using OpenPigeon's archived `v1-final-agpl` release, pinned to commit `50863e937beca3859c01ad04af29bcbf837f650e`. Install OnePair once and open its bundled OpenPigeon picker and games from a room. A second OpenPigeon installation is not required by this design. Browser/PC integration is outside this phase.

This replaces the separate-installed-app Madrid host route. An APK built before this change remains a separate-app host. Compilation does not prove game rendering, turn handoff or two-device play.

Only this pinned archived source is approved. Do not update code or assets from the current `wordhunt` branch without reviewing its licenses. Private/noncommercial use is not the licensing basis for this build; the owner's reported upstream conversation is not treated as a general redistribution exception.

## Licensing and attribution

Preserve upstream LICENSE, exceptions and notices in the vendor directory. The owner approved compatible AGPL terms and corresponding-source delivery for the combined Android build and this fork's modifications. This relies on the owner's reported original-author permission to modify/redistribute OnePair. It does not assert ownership of upstream authors' rights or erase third-party terms. See `../NOTICE`.

Keep original OnePair author/support attribution. Credit OpenPigeon and contributors visibly in the game entry and About/source information. Do not imply endorsement or replace OpenPigeon authorship with OnePair authorship.

Pinned source: https://github.com/OpenBubbles/OpenPigeon/tree/50863e937beca3859c01ad04af29bcbf837f650e

## Corresponding source delivery

Every shared bundled APK must have matching corresponding source available to its recipients at the same time. For GitHub Releases, attach it beside the APK and link it in release notes. A different repository commit, only an upstream link or only the compiled JavaScript bundle is insufficient.

Include OnePair frontend/native source, exact vendored OpenPigeon/Box2D source and local modifications, licenses/exceptions/third-party notices, Gradle wrapper, Android configuration, dependency manifests/lockfiles and build/install scripts. Record source commit, pinned upstream commit, build commands, APK checksum and source checksum together.

Exclude private keys, passwords, machine credentials, local.properties, device data and logs. Public signing fingerprints may be included. Review source obligations for other dependencies; a lockfile alone does not satisfy every third-party license.

Run `node scripts/package-android-source.mjs` after committing the release source. It requires a clean tracked tree, includes tracked vendor sources, rejects sensitive paths and writes an archive/provenance under ignored `release/`. It does not upload or establish license compliance by itself.

## Release gates

Inspect pinned assets, fonts, audio, models, imported libraries, submodules and nested licenses. Preserve required notices and document exclusions. The archive label alone does not establish every included asset's license.

Verify actual vendor code/assets and changes are in the source package. Clean-build from that package, record APK/source checksums, verify recipients can retrieve both, and check visible in-app credit and source instructions. Publication, clean-source rebuild and physical two-phone acceptance remain pending until separately evidenced.
