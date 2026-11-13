# Translation Finalization Runner

Finalize a stable translated candidate with machine gates, comparison and publication binding;
record only supplied, bound Agent review. Apply [object integrity](../review/object-integrity.md)
within the translation contract, without authorizing redesign or unrelated source-object guards.

## Inputs

The finalizer requires:

- the read-only source and stable translated candidate `.pptx`;
- the effective source `pptx-i18n-scan/v1` inventory consumed by the translation plan
  (classified when review classification was needed);
- the matching `pptx-i18n-translations/v1` data;
- a new or empty run directory and a final output path.

Preserve the planner's complete source inventory, including every shape `textPlan` unit's top-level `part`.
On identity `invalid_data`, rescan the bound source and rebuild the plan. Never infer parts from
logical slide filenames/candidate data or consume a stale candidate report.

Before inputs exist, read `translation-mode.md` for scan, classification, planning, apply, repair,
chart/table coverage and multi-column review. Never finalize an intermediate candidate.

Prefer `cli/translation/prepare.mjs`: it builds hash-bound, content-deduplicated memory, resumes bound
classification and sequentially applies planner artifacts. Supported `i18n-anchor-draft` material
feeds a fresh `i18n-plan`, never apply authorization. Finalize only a `prepared` result.
Partitions remain count-only until `--expand-review <languageUncertain|shared|embeddedWorkbook|other>`.
Retain `textLayout: "preserve-geometry"` and all gates; see `translation-mode.md` for fitting/reflow
and older runtimes. Avoid a default geometry-restoration pass. Use `artifacts.units`, whose inventory
and SHA-256 are recorded in `summary.units`, including approved classification reused by `--apply`.
For older scripts, use non-null `artifacts.classifiedScan`, otherwise `artifacts.scan`, after checking
the memory's bound units path/hash. Do not invent `i18n-scan-classified.json` or reclassify for a filename.
Use that successful plan's inventory with `artifacts.candidate` and `artifacts.translations`.

## Fit and review before publication

`prepared` proves guarded application, not exact target-text consistency or rendered fit. Before
expensive visual evidence, run the [candidate target-consistency gate](translation-mode.md#standard-flow)
with that preparation's effective units and translations. Repair every mismatch through the complete
memory and rerun preparation; unchanged code and identifiers must also match byte-for-byte text.
The finalizer still reruns this gate against its immutable snapshots.
For tight labels or changed multi-column text,
complete [pre-finalization review](translation-mode.md#visual-parity-gate) first. Inspect the vision
delta once, repair fit through the translation memory, render only needed multi-column pages and pass
the bound review gate. Do not start an incomplete finalize run to discover a scaffold; revised wording
invalidates old review. Inspect native tables/dense chart labels at readable size even without vision
blockers: cell clipping may lack a shape-level warning. Reuse canonical page PNGs and compact wording
before full comparison; a clean estimator or contact-sheet thumbnail does not prove cell fit.

Run `xdoc pptx visual-audit` on the stable candidate against the source, using the frozen field date,
**before invoking this runner**. Review its exact candidate PNGs and findings, then record a passing
`visual-review.mjs --mode translation --candidate <candidate> --manifest <manifest>
--previews <review-dir>/visual-evidence/candidate` record with the
full slide count and every required check. Supply it with `--visual-manifest` and `--visual-review`
below. This is Agent visual review; it does not require user approval. Follow
[the style mapping gate](translation-mode.md#style-signature-gate) for required `--style-diff`, `textStyleAlignment=pass` and bound paragraph judgments via `--text-style-review`.

Translation acceptance consumes the original regression manifest and freshly generated, hash-bound
source, candidate, inventory, translations, style, consistency and full-deck vision evidence. Complete
bound Agent review accepts `same-renderer-change-detected`, reviewed low static estimates and the
separately bound multi-column exception. Static findings marked `contradicted-by-rendered-layout`
are resolved; their original severity remains recorded. The native manifest is unchanged; acceptance
does not claim unchanged pixels or PowerPoint parity.

Expected translated glyphs, normal wrapping and pixel diffs need no user approval. Finish missing Agent
review; regenerate missing/stale evidence. Repair or diagnose overflow, overlap, page-bound errors,
style/coverage failures, unexplained findings and canonical `stop`; never ask to waive a defect.
Preserve genuinely environment-dependent font/fidelity decisions, which may need user input after
diagnosis. Do not alter unrelated source objects to clear inherited diagnostics.

## Standard command

```bash
node <skill-root>/scripts/cli/translation/run.mjs \
  --source source.pptx \
  --candidate <run-dir>/candidate-final.pptx \
  --units-file <effective-units-file> \
  --translations <run-dir>/translations.json \
  --visual-manifest <review-dir>/visual-evidence/manifest.json \
  --visual-review <review-dir>/visual_review.json \
  --output translated.pptx \
  --run-dir <run-dir>/finalize \
  --json
```

The two visual flags must be supplied together. Preflight checks fresh translation and visual evidence
before preview/compare publication; `visualReviewPassed=true` alone never authorizes delivery.
Add `--allow-text-attrs tooltip,descr,title` only for explicitly translated typed text attributes.
Add `--multi-column-review-gate <path>` only when the final `vision-diff` contains exclusively bound
`review-only` multi-column findings and the gate belongs to the same candidate bytes. Add
`--contact-diff` when compatibility aliases are needed; aliases are copied from the final compare and
must not trigger another full-deck render.

Before creating the run directory or starting xdoc, derive changed `visibleTextAttr` names from bound
units/translations. An incomplete explicit `--allow-text-attrs` fails with names, counts and a retry
flag; authorization is never automatic. This avoids discovering the omission after expensive checks.

Compare concurrency defaults to 3 (`--compare-concurrency`). `--prompt-text`/`--prompt-file` archive the
request to `<run-dir>/prompt.txt` for feedback. Full progress defaults to `<run-dir>/progress.jsonl`
(`--progress-file none` disables); stderr carries single-line phase-boundary summaries.

The finalizer reruns supplied multi-column gates and checks candidate bytes, exact findings, PNG
hashes/dimensions and decisions. Report identity ignores only run-local source/candidate paths,
including matching `--candidate` / `--reference` operands in the suggested audit command; all flags,
findings and other fields must match. Stale gates fail closed.

The finalizer owns this sequence:

```text
snapshot immutable inputs -> source inspect -> i18n style diff -> candidate target consistency
-> vision diff and optional bound review-only exception
-> freeze translation-evidence.json and consume supplied canonical/Agent review
-> one candidate full preview/contact sheet -> semantic diff -> one full translation compare
-> optional contact aliases from the same evidence
-> revalidate translation acceptance against current evidence
-> compare publish/final hash binding -> seal machine completion -> final delivery acceptance
```

## Agent-facing output

`--json` prints compact `pptx-nova-translation-result/v1`: status, paths, machine gates, performance,
conditional `requiredReferences[]` and terminal error. Read the complete `pptx-nova-translation-run/v1`
at `<run-dir>/translation-run-summary.json` only for diagnosis/evidence inspection; use `--json-full`
only when complete stdout compatibility is explicitly required.

With valid supplied visual evidence, successful finalization returns `status=completed`,
`machineGatesPassed=true`, `deliveryReady=true`, and `needsHumanReview=false`. It retains
`translation-visual-acceptance.json` with the original machine decision and the separate Skill
acceptance result. Review the complete compare set before delivering the bundle.

Without visual flags, evidence preparation returns `status=needs-visual-review`, `needsVisualReview=true`,
`needsHumanReview=false` and `deliveryReady=false`. It retains evidence without publishing the final
PPTX or siblings. Complete bound review, then finalize the same candidate with visual flags in a new
run directory; preserve the date and reuse page caches. A standalone compare gate also requires
`--translation-evidence`, `--visual-manifest` and `--visual-review` for translation publication.
Only successful reviewed bundle publication
seals the preview, full semantic diff, comparison, delivery gate and published files in `completion`.
Changed files invalidate it; without `--translation-evidence`, default semantics remain. Old runs
without completion need fresh finalization; never manufacture records or infer success.

## Visual evidence and performance

Preview proves every candidate slide rendered and supplies a contact sheet; compare binds every
source/candidate pair. Optional `contact-diff` aliases reuse that evidence without another render.
Performance records preview/compare/retry invocations, estimated pixels, pair/page cache activity,
saved render/alias invocations, render share and invocation/pixel budgets. Multipart coverage has no
gaps/overlaps; each 192 DPI part may retry once at 144 DPI, recorded in the report. Pair-cache keys
bind source/candidate bytes, selector, DPI and xdoc binary bytes. Shared page bitmaps bind PPTX SHA-256,
one-based slide, DPI and renderer SHA-256. The default cache beside the run directory survives failure;
validated pair hits rebind current paths and count as zero actual render invocations.

## Failure routing

Follow `requiredReferences[]` first. For visual blockers without a review gate, load `Visual Parity Gate`
in `references/translation/translation-mode.md`. Load deeper sections only for the detected problem:

- missing or inconsistent target text: `I18n Plan Gate` and translation repair rules;
- changed style signatures: `Style Signature Gate`;
- charts or tables: the matching translation-mode section plus `../content/charts.md` or `../content/tables.md`;
- multi-column review-only findings: `Visual Parity Gate` and the scaffold/gate workflow;
- real overflow/overlap/edge or other high/medium regressions: repair; multi-column review cannot waive them.

Recreate stale gates when candidate, vision report, PNG, byte length, dimensions or SHA-256 changes.

## Delivery boundary

The compare gate rechecks translation acceptance and exact candidate bytes before publication. Review the candidate contact
sheet, every compare part and all bound review-only full-size pages; retain the summary, scans,
style/vision reports, semantic diff, preview manifest, comparison reports/images/gate and final binding.

Compare publication alone does not authorize delivery. Require passing translation acceptance and
current source/candidate, translation-contract, canonical PDF/PNG, date and Agent-review bindings.
Rebuild changed evidence; unchanged evidence needs no second render. Never override canonical `stop`,
environment decisions or unresolved defects. Expected text pixels need Agent review, not user approval.
