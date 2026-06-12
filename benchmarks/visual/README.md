# pptx-nova Visual Benchmarks

This directory holds DeckKit-first visual regression cases. It does not store
generated PPTX files, full patches, full vision reports, or per-slide PNG images.
It does store reviewed low-severity vision baselines so every DeckKit can
separate expected style noise from newly introduced visual issues.

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
    └── <deckkit>.<case>.vision-baseline.json
```

Cases may reference existing DeckKit example content with `contentPath` to avoid
duplicating large JSON fixtures during the candidate phase. A future production
benchmark can materialize immutable `content.json` fixtures once the benchmark
CLI is in place.

## Minimum Gate

For each case:

1. Run shared `validateContent` schema and page-type fit diagnostics against `contentPath`.
2. Build patch with the DeckKit example build entry.
3. Apply the patch, run `vision-check`, classify low issues against the DeckKit
   visual policy and reviewed baseline, and render PNG preview artifacts.
4. Only promote a DeckKit to `production` after golden, stress, and mixed-language
   cases pass the configured gates.

## Low-Severity Baseline Lifecycle

`vision-check` low findings are normalized into canonical Nova issues before
they are summarized. The canonical identity uses stable fields such as severity,
family, slide index, shape role/name, message key, and normalized metrics. It
does not rely on transient object ids or raw floating-point geometry.

Each low issue is assigned to one of these buckets:

- `styleAllowed`: allowed by the DeckKit catalog `qualityProfile`, such as
  intentional compact typography.
- `baselineKnown`: present in the reviewed case baseline.
- `new`: not allowed by style policy and not present in the baseline.
- `changed`: same stable issue identity as the baseline but with changed
  normalized metrics.
- `resolved`: present in the baseline but absent from the current run.

High and medium findings remain hard gates. Low findings are review gates:
`new` and `changed` low findings do not fail the benchmark by default, but they
block delivery/default readiness and production/default promotion until reviewed.

Accept the current low findings as the reviewed baseline with:

```bash
node <skill-root>/scripts/pptx-nova-deckkit-benchmark.mjs \
  --deckkit consulting-dark \
  --all \
  --update-baseline \
  --clean
```

The command writes `benchmarks/visual/baselines/*.vision-baseline.json` and the
same run summary is recomputed against the accepted baseline. Future benchmark
runs then surface only `new` or `changed` low findings for human review.

## Current CLI

```bash
node <skill-root>/scripts/pptx-nova-deckkit-benchmark.mjs \
  --deckkit consulting-dark \
  --case golden-roadshow \
  --repeat 3 \
  --clean
```

The current CLI runs validate/build, xdoc dry-run, real apply, `vision-check`,
canonical low bucketing, PNG preview, and contact-sheet gates. It writes
`patch.json`, `deck.pptx`, `dry-run.json`, `apply.json`, `vision.json`,
`convert-report.json`, `previews/`, `contact-sheet.png`, `timing.json`, and
`summary.json` to `.tmp/pptx-nova-visual/<deckkit>/<case>/`.

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
with the slide count, or when `vision.lowBuckets.new` /
`vision.lowBuckets.changed` is non-zero.

To write machine-verifiable benchmark metadata back to `catalog.json`, run:

```bash
node <skill-root>/scripts/pptx-nova-deckkit-catalog-update.mjs \
  --deckkit consulting-dark \
  --write
```

This updates `quality.lastBenchmark`, aggregate `quality.vision`, and
`quality.benchmark` from `.tmp/pptx-nova-visual/<deckkit>/<case>/summary.json`.
Aggregate vision metadata includes low buckets across all required cases. It
does not change readiness by default and does not invent manual PNG review data.

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
