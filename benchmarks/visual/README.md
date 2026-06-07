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

1. Run `validate-content` against `contentPath`.
2. Build patch with the DeckKit example build entry.
3. Record validation errors, fit diagnostics, patch op count, and timing.
4. Only promote a DeckKit to `production` after golden, stress, and mixed-language
   cases pass the configured gates.

## Current CLI

```bash
node tools/pptx-nova-deckkit-benchmark.mjs \
  --deckkit consulting-dark \
  --case golden-roadshow \
  --repeat 3 \
  --clean
```

The first CLI version runs validate/build gates and writes `patch.json`,
`timing.json`, and `summary.json` to `.tmp/pptx-nova-visual/<deckkit>/<case>/`.
Vision and PNG gates are recorded as skipped until the s8fy dry-run/vision and
preview stages are wired in.

Current consulting-dark cases:

- `golden-roadshow` validates the normal delivery path.
- `stress-density` intentionally triggers soft fit warnings without hard errors.
- `mixed-language` verifies CJK, English, numbers, and compact business terms
  stay inside normal density limits.
