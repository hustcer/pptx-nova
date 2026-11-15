# Narrative extension acceptance

Teal Journal 1.1.0 adds a qualitative editorial responsibility without changing the original eight
roles. It registers an editable lead plus 2–4 sections with `leadLeft` rows or `columns`; no metric,
allocation, baseline/target, date or owner is required. Existing content needs no migration.

The four-page synthetic repair-library example covers both geometries, minimum/maximum section
counts and CJK/Latin text. It is independent of the product-roadshow content that motivated the role.
Tests reject blank/extra/over-capacity input and verify deterministic geometry and emitted text.

On 2026-11-15, the current runtime passed validation, dry-run/apply, native readback where applicable,
vision high/medium/low = 0, slot consistency and both golden benchmarks. Live delivery readiness
passed while retaining the existing `default` status. Core primitives were not changed.

Both complete goldens received canonical Create review under frozen field date 2026-11-15, with
candidate/manifest-bound design and visual reviews and passing evidence gates. The eight-page
handbook retained its original geometry. All four narrative PNGs were inspected at 1920×1080:

- Page 1: two open rows, legible lead, independent headings and complete descriptions.
- Page 2: two open columns, consistent top rule and deliberate heading/body space.
- Page 3: four CJK rows, complete final row and clear footer separation.
- Page 4: four English columns, normal wraps at fixed 16pt and no missing final lines.

Evidence is retained in `.tmp/deckkit-teal-journal-20261115-narrative/`: benchmark iterations 01/02,
`canonical-handbook/` and `canonical-narrative/`, including exact PNGs, manifests and review gates.
The four-section pages supply the density boundary; the Chinese page and bilingual chrome supply
mixed-language coverage. No full PowerPoint visual-parity claim is made. Fonts are not embedded,
external image ingestion remains unregistered, and manually changing text still needs fit review.

## Pre-commit review follow-up

The second golden initially made the showcase updater ambiguous. `golden-handbook` is now the
single `showcase: true`; this narrative case remains independently gated regression coverage.
Both `just deckkit-examples -d teal-journal` and its `check` mode passed after the fix.

Fresh verification is retained in `.tmp/deckkit-teal-journal-review-20261115-01/`, including the
runtime capability snapshot, executable identity and unchanged-binary post-check. The observed
runtime was `0.22.0 (ce65e639)`, executable SHA-256
`1016f8b9f7c0a3c374b423693d68ae34ec671c724741b3c365d64a2f7ac2ed89`.
Both golden benchmarks and required-live delivery readiness passed with frozen field date
2026-11-15. All twelve freshly rendered canonical PNGs were byte-identical to the inspected
authoring PNGs; current candidate/manifest-bound review gates passed.

A separate mixed-language density probe rendered nine explicit body lines in each of four columns
at the registered 16pt size; every final line remained above the footer. Regression coverage now
checks nine-line preservation, automatic column selection, rejection of the short-row layout and
rejection of a tenth line. This supplements the original minimum/maximum **item-count** tests;
it does not claim exhaustive coverage of every font, wrap pattern or host.
