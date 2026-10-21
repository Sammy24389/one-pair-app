# Bundled emoji data

The picker uses Unicode Emoji **17.0**, pinned to the released repertoire rather than the changing latest URL. All 3,953 fully-qualified emoji and standalone emoji components are included, with Unicode's English names and ten groups. Flags (including subdivision flags), skin-tone variants and multi-codepoint ZWJ sequences remain intact. Minimally-qualified duplicate spellings are intentionally omitted.

Source: https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt

Source SHA-256: 1D8A944F88D7952F7EF7C5167FEF3C67995BCAE24543949710231B03A201ACDA

License: Unicode License V3, retained at public/licenses/unicode.txt and linked from the picker. Copyright Unicode, Inc. No runtime fetch, tracking or external image CDN is used. The JSON is bundled with the app and APK. Device fonts determine glyph appearance; older systems may show unsupported new sequences as boxes or separate symbols.

To reproduce: download the pinned source, then run `node scripts/generate-emoji.mjs path/to/emoji-test.txt`. The generator rejects an unexpected version/count. src/lib/emoji-data.json is generated, so edit the generator when upgrading. Review official source/license changes before updating.

The UI searches English names and exact glyphs across all categories, offers category selection, and renders 120 entries at a time with a Show more button to avoid a 3,953-button initial DOM on phones. All entries remain reachable. Each emoji uses a labeled native button with a 44px minimum target, keyboard navigation via native controls, and the existing Emoji/Stickers tabs.
