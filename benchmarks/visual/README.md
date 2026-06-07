# pptx-nova Visual Benchmarks

This directory holds DeckKit-first visual regression cases. It does not store
generated PPTX files, full patches, full vision reports, or per-slide PNG images.

## Layout

```text
benchmarks/visual/
├── index.json
├── cases/
│   └── consulting-dark/
│       └── golden-roadshow/
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
