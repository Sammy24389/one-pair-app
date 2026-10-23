# OnePair integration: retained third-party notices

This supplements the archived OpenPigeon AGPL source at commit `50863e937beca3859c01ad04af29bcbf837f650e`. It does not apply the current OpenPigeon asset license to the archived code. Third-party fonts/libraries retain their own licenses. No upstream endorsement is claimed.

## Fonts

No font binary listed below was edited. `LICENSES/PINNED-FONT-METADATA.json` preserves the exact embedded copyright, version, author and license fields plus SHA256 of each pinned font. Current upstream accompanying OFL texts have later/different copyright years; keep both the original embedded notices and the supplemental texts, rather than overwriting the original notices.

| Pinned files | Embedded version / original notice | Retained text |
|---|---|---|
| `app/src/main/res/font/inter_variable.ttf` | Inter 4.001 / Copyright 2016 The Inter Project Authors | `LICENSES/ofl_inter.txt`, metadata JSON |
| `app/src/main/res/font/lexend_variable.ttf`, `lexend_medium.ttf` | Lexend 1.007 / Copyright 2019 The Lexend Project Authors | `LICENSES/ofl_lexend.txt`, metadata JSON |
| `app/src/main/res/font/jellee_roman.ttf` | Jellee 1.016 / Copyright 2015 Alfredo Marco Pradil; Reserved Font Name Jellee | `LICENSES/ofl_jellee.txt`, metadata JSON |
| `app/src/main/res/font/fivosans_black.otf`, `fivosans_bold.otf`, `fivosans_heavy.otf` | Fivo Sans 1.0 / Copyright 2017 Alexander Slobzheninov | Exact complete embedded OFL extracted to `LICENSES/FIVO-SANS-EMBEDDED-OFL.txt`; supplemental `ofl_fivosans.txt` |
| `app/src/main/assets/basketball/dseg7_classic_bold.ttf` | DSEG7 Classic 0.46 / embedded Copyright 2018 keshikan; Reserved Font Name DSEG | Accompanying `app/src/main/assets/basketball/OFL-DSEG.txt` (Copyright 2020), and complete embedded OFL in the unchanged binary |

All these fonts retain SIL OFL 1.1. Preserve Reserved Font Names and do not relicense the font binaries under AGPL. Exact retrieved text sources and SHA256 checksums are in `LICENSES/font-license-provenance.json` and `LICENSES/dseg-provenance.json`. These supplementary license files came from the official OpenBubbles/OpenPigeon repository; only the explicitly OFL DSEG binary was imported from its current branch, not current game art/code.

Font project references: https://github.com/rsms/inter ; https://github.com/googlefonts/lexend ; https://hanken.co/ ; https://www.behance.net/slobzheninov ; https://github.com/keshikan/DSEG .

## Engine and native components

- Godot Engine is MIT licensed: https://godotengine.org/license . Preserve the runtime's own license/third-party notices as well as the accompanying source/dependency information. Official runtime source: https://github.com/godotengine/godot .
- The Godot Box2D addon retains `app/src/main/assets/addons/godot-box2d/LICENSE.txt` (MIT, Ricardo Buring and Dragos Daian) and `THIRDPARTY.txt`. Do not remove either.
- The pinned native Box2D subtree is `../box2d/`, commit `950b937f0161208ae9fcb2bbd3df0fcdc9d6d50f`. Its actual `Box2D/License.txt` is the zlib-style Erin Catto 2006-2013 license, not a substituted modern Box2D MIT license. Preserve it verbatim. `../box2d/ONEPAIR-UPSTREAM.json` records archive provenance.
- Madrid interface attribution remains in `../../android/MADRID-NOTICE.md`. Android dependencies retain their own licenses; bundling does not change those licenses.

## Creative Commons assets

The pinned `app/src/main/assets/attributions.html` is retained and must remain accessible from the game attribution screen. Its credits identify:

- Sky Backdrop — bart, CC BY 3.0: https://opengameart.org/content/sky-backdrop ; license https://creativecommons.org/licenses/by/3.0/ .
- Basket Ball Texture — Downdate, CC BY 3.0: https://opengameart.org/content/basket-ball-texture ; license https://creativecommons.org/licenses/by/3.0/ .
- Arrow — Boy Best, CC BY 4.0: https://sketchfab.com/3d-models/arrow-c46f8feb96044a95967feee111488e03 ; license https://creativecommons.org/licenses/by/4.0/ .
- Red Cup — plaggy: https://www.fab.com/listings/80c49aa6-cff1-4335-9915-a02f32589b97 . The pinned credit labels it CC0 but links CC BY 4.0; preserve the credit and attribution link rather than deleting it based on the CC0 label.

No changes to those third-party graphics/models are made by this notice addition. Original artwork, sound and game source remain under the pinned upstream licensing except identified third-party components. This inventory is not a warranty of authorship of every upstream asset.

## Local exclusions and replacements

The following are intentional changes to the pinned source, not upstream work:

1. Removed `basketball/segment-eglas.ttf` and its import descriptor. Its embedded license says FontStruct Non-Commercial License, author luthmna, source https://fontstruct.com/fontstructions/show/2202910/segment-eglas . Replaced its sole basketball scene reference with unmodified OFL DSEG7 Classic Bold. The scoreboard may render slightly differently; game behavior is unchanged by this resource substitution.
2. Removed `basketball/AdobeStock_530856469.png` and its import descriptor because redistribution provenance was not established. Replaced the same scene texture/material resource with `basketball/onepair-hoop.svg`, original geometric OnePair integration artwork licensed under the combined GNU AGPL-3.0 terms. It is not traced or derived from the omitted image. Its 1024-by-1024 canvas and scene positioning are retained.
3. Updated `basketball/basketball.tscn` resource paths and replacement import descriptors. The original game logic and physics are untouched by these two compliance substitutions. Full visual/gameplay acceptance remains pending actual runtime testing.

`ONEPAIR-UPSTREAM.json` records the original archive hash; Git records the local patches. Corresponding source must include replacements, local module/adapter changes and this notice, not only a link to upstream.
