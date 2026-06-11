# pptx-nova Visual Benchmarks

This directory holds DeckKit-first visual regression cases. It does not store
generated PPTX files, full patches, full vision reports, or per-slide PNG images.

## Layout

```text
benchmarks/visual/
├── index.json
├── cases/
│   └── consulting-dark/
│       ├── golden-roadshow/
│       │   ├── expected.json
│       │   └── review.md
│       ├── stress-density/
│       │   ├── content.json
│       │   ├── expected.json
│       │   └── review.md
│       └── mixed-language/
│           ├── content.json
│           ├── expected.json
│           └── review.md
└── baselines/
```

Cases may reference existing DeckKit example content with `contentPath` to avoid
duplicating large JSON fixtures during the candidate phase. A future production
benchmark can materialize immutable `content.json` fixtures once the benchmark
CLI is in place.

## Minimum Gate

For each case:

1. Run shared `validateContent` schema and page-type fit diagnostics against `contentPath`.
2. Build patch with the DeckKit example build entry.
3. Apply the patch, run `vision-check`, and render PNG preview artifacts.
4. Only promote a DeckKit to `production` after golden, stress, and mixed-language
   cases pass the configured gates.

## Current CLI

```bash
node <skill-root>/scripts/pptx-nova-deckkit-benchmark.mjs \
  --deckkit consulting-dark \
  --case golden-roadshow \
  --repeat 3 \
  --clean
```

The current CLI runs validate/build, xdoc dry-run, real apply, `vision-check`,
PNG preview, and contact-sheet gates. It writes `patch.json`, `deck.pptx`,
`dry-run.json`, `apply.json`, `vision.json`, `convert-report.json`,
`previews/`, `contact-sheet.png`, `timing.json`, and `summary.json` to
`.tmp/pptx-nova-visual/<deckkit>/<case>/`.

After benchmark output exists, run the readiness audit:

```bash
node <skill-root>/scripts/pptx-nova-deckkit-readiness.mjs \
  --deckkit consulting-dark \
  --target candidate
```

The audit reads `catalog.json`, `index.json`, and the generated
`summary.json` files. It reports whether the DeckKit is ready for candidate,
delivery, and default use. Delivery/default should remain blocked when PNG
preview or contact-sheet artifacts are skipped, missing, empty, or out of sync
with the slide count.

To write machine-verifiable benchmark metadata back to `catalog.json`, run:

```bash
node <skill-root>/scripts/pptx-nova-deckkit-catalog-update.mjs \
  --deckkit consulting-dark \
  --write
```

This updates `quality.lastBenchmark`, aggregate `quality.vision`, and
`quality.benchmark` from `.tmp/pptx-nova-visual/<deckkit>/<case>/summary.json`.
It does not change readiness by default and does not invent manual review data.

Manual PNG review remains a separate human step:

1. Open each case `contact-sheet.png` and inspect the per-slide PNG files under
   `.tmp/pptx-nova-visual/consulting-dark/<case>/previews/`.
2. Fill the corresponding `review.md` with last reviewed date, reviewer, result,
   checked manual items, and notes.
3. Count hard visual defects. Only after this review is complete, write the
   manual count:

```bash
node <skill-root>/scripts/pptx-nova-deckkit-catalog-update.mjs \
  --deckkit consulting-dark \
  --manual-hard-defects 0 \
  --write
```

Promotion requires an explicit manual review confirmation:

```bash
node <skill-root>/scripts/pptx-nova-deckkit-catalog-update.mjs \
  --deckkit consulting-dark \
  --manual-hard-defects 0 \
  --readiness production \
  --confirm-manual-png-review \
  --write
```

Do not run the promotion command until all required PNG reviews are complete.

Current consulting-dark cases:

- `golden-roadshow` validates the normal delivery path.
- `stress-density` intentionally triggers soft fit warnings without hard errors.
- `mixed-language` verifies CJK, English, numbers, and compact business terms
  stay inside normal density limits.
