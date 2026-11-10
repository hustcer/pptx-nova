# Translation Finalization Runner

Finalize a stable translated candidate with machine gates, comparison and publication binding; this
runner does not translate, repair or certify human review. Apply [object integrity](../review/object-integrity.md)
within the translation contract, without authorizing redesign or unrelated source-object guards.

## Inputs

The finalizer requires:

- the read-only source `.pptx`;
- the stable translated candidate `.pptx`;
- the effective source `pptx-i18n-scan/v1` inventory consumed by the translation plan
  (classified when review classification was needed);
- the matching `pptx-i18n-translations/v1` data;
- a new or empty run directory and a final output path.

Preserve the planner's complete source inventory, including every shape `textPlan` unit's top-level `part`.
On identity `invalid_data`, rescan the bound source and rebuild the plan. Never infer parts from
logical slide filenames/candidate data or consume a stale candidate report.

Before these inputs exist, read `references/translation/translation-mode.md` for scan, classification, planning,
apply, repair, chart/table coverage, and multi-column review preparation. Do not invoke the finalizer
with an intermediate candidate.

For a new translation, prefer `cli/translation/prepare.mjs`. It creates a hash-bound,
content-deduplicated translation memory, resumes bound review classification, and sequentially applies
the planner artifacts. When supported by the current xdoc contract, preparation also consumes
high-confidence `i18n-anchor-draft` merge material and reruns `i18n-plan`; it never treats the draft
as apply authorization. This finalizer begins only after that preparation result is `prepared`.
Preparation keeps partitions count-only; `--expand-review <languageUncertain|shared|embeddedWorkbook|other>`
persists one bound partition when its individual units are needed.
Retain the planner's disclosed `textLayout: "preserve-geometry"`; see `translation-mode.md` for pending reflow, fitting and older runtimes. Keep all gates; avoid a default geometry-restoration pass.
Use `artifacts.units`: the inventory and SHA-256 recorded in `summary.units` and used by planning,
including when `--apply` reuses approved classification. With older preparation scripts, use
`artifacts.classifiedScan` when non-null, otherwise `artifacts.scan` after checking the translation
memory's bound units path/hash. No classification work means no `i18n-scan-classified.json`; do not
invent that file or reclassify to satisfy a filename. Use the same effective inventory as the
successful plan, plus `artifacts.candidate` and `artifacts.translations`.

## Fit and review before publication

`prepared` proves guarded text application, not rendered fit. If the deck contains tight labels or
changed multi-column text, use the [pre-finalization review](translation-mode.md#visual-parity-gate)
before starting this runner. Inspect the vision delta once, repair actual fit regressions through
the completed translation memory, and render only the slides needed for the bound multi-column
review. Pass that review gate to the finalizer; do not start a deliberately incomplete finalize run
just to discover the review scaffold. A wording revision invalidates the old candidate-bound review.
For native tables and dense chart labels, inspect readable-size PNGs even when the vision delta has
no blockers: a long compound label can be clipped inside a cell without a shape-level fit warning.
Reuse the canonical audit's page PNGs when available. Compact the wording before the expensive full
comparison rather than treating a clean estimator or contact-sheet thumbnail as proof of cell fit.

Run the [canonical visual gate](../review/export-and-check.md#unified-visual-evidence-canonical-agent-gate)
on the stable candidate against the source using the frozen field date **before invoking this runner**.
The runner neither pauses before publication nor consumes the canonical decision. Its specialized
gates can pass and publish a hash-bound bundle while the independent canonical decision still blocks
delivery. Keep those results separate: `machineGatesPassed=true`, a compare-gate pass, and a
PowerPoint clean-open pass do not turn a canonical `stop` into delivery authorization. Diagnose
reference-owned findings separately from candidate regressions and report any unresolved limitation;
do not alter preserved source objects merely to clear inherited diagnostics. Retain this manifest
and its consumer result for the delivery boundary below; unchanged evidence needs no second render.

## Standard command

```bash
node <skill-root>/scripts/cli/translation/run.mjs \
  --source source.pptx \
  --candidate <run-dir>/candidate-final.pptx \
  --units-file <effective-units-file> \
  --translations <run-dir>/translations.json \
  --output translated.pptx \
  --run-dir <run-dir>/finalize \
  --json
```

Add `--allow-text-attrs tooltip,descr,title` only for explicitly translated typed text attributes.
Add `--multi-column-review-gate <path>` only when the final `vision-diff` contains exclusively bound
`review-only` multi-column findings and the gate belongs to the same candidate bytes. Add
`--contact-diff` when compatibility aliases are needed; aliases are copied from the final compare and
must not trigger another full-deck render.

Before creating the run directory or starting xdoc, the finalizer reads the
bound units and translations and derives the exact changed
`visibleTextAttr` attribute names. If the explicit `--allow-text-attrs` list
does not cover them, it fails with the changed attribute names, unit counts,
and a copyable retry flag. It never grants the authorization automatically;
this avoids a full finalizer rerun caused by a late style-gate failure.

Compare parts render concurrently (`--compare-concurrency`, default 3). `--prompt-text`/`--prompt-file`
archive the original user request to `<run-dir>/prompt.txt` for the feedback gate. The full progress
event stream is archived to `<run-dir>/progress.jsonl` by default (`--progress-file none` disables);
while active, stderr carries only single-line phase-boundary summaries.

The finalizer reruns supplied multi-column gates and checks candidate bytes, exact findings, PNG
hashes/dimensions and decisions. Report identity ignores only run-local source/candidate paths,
including matching `--candidate` / `--reference` operands in the suggested audit command; all flags,
findings and other fields must match. Stale gates fail closed.

The finalizer owns this sequence:

```text
snapshot immutable inputs
-> source inspect
-> i18n style diff
-> candidate target consistency
-> vision diff and optional bound review-only exception
-> one candidate full preview/contact sheet
-> semantic diff
-> one full translation compare
-> optional contact aliases from the same evidence
-> compare publish gate and final hash binding
```

## Agent-facing output

`--json` prints a compact `pptx-nova-translation-result/v1` result with status, paths, machine-gate
summary, performance, conditional `requiredReferences[]`, and terminal error. The complete
`pptx-nova-translation-run/v1` report is persisted as
`<run-dir>/translation-run-summary.json`; read it only for diagnosis or evidence inspection. Use
`--json-full` only when complete stdout compatibility is explicitly required.

Successful machine finalization returns `status=needs-human-review`,
`machineGatesPassed=true`, and `deliveryReady=false`. The runner never records manual review as
completed.

## Visual evidence and performance

The candidate preview and translation compare serve different policies:

- preview proves every candidate slide rendered and supplies the candidate contact sheet;
- compare binds every source/candidate slide pair for final visual review;
- optional `contact-diff` files are compatibility aliases of compare evidence, not a second render.

Performance records preview invocations, compare parts, actual retry attempts, estimated pixels,
pair-cache hits, page-bitmap hits/misses/population, saved render invocations, saved alias invocations,
render share, and invocation/pixel budgets. Multipart compare must cover
every slide without overlap or gaps. A 192 DPI part may retry once at 144 DPI; every retry remains
visible in the report. Compare evidence is content-addressed by source/candidate bytes, selector, DPI,
and xdoc executable bytes. Below that pair-level cache, preview and compare share page bitmaps keyed by
PPTX SHA-256, one-based slide, DPI, and the xdoc renderer binary SHA-256. The default cache is shared
beside the run directory and survives failed finalize runs. A validated pair-cache hit is rebound to the
current artifact paths and counts as zero actual render invocations.

## Failure routing

Always follow `requiredReferences[]` first. For visual blockers without a supplied review gate, load
the named `Visual Parity Gate` section in `references/translation/translation-mode.md`. Load deeper sections only
for the detected problem:

- missing or inconsistent target text: `I18n Plan Gate` and translation repair rules;
- changed style signatures: `Style Signature Gate`;
- charts or tables: the matching translation-mode section plus `../content/charts.md` or `../content/tables.md`;
- multi-column review-only findings: `Visual Parity Gate` and the scaffold/gate workflow;
- real overflow, overlap, edge, or other high/medium regressions: repair the candidate; they cannot be
  waived by a multi-column review gate.

Never retry finalization with stale review evidence. Recreate any gate whose candidate, vision report,
page PNG, byte length, dimensions, or SHA-256 no longer matches.

## Delivery boundary

The compare gate binds exact candidate bytes before machine publication. Review the candidate contact
sheet, every compare part and all bound review-only full-size pages; retain the summary, scans,
style/vision reports, semantic diff, preview manifest, comparison reports/images/gate and final binding.

Compare publication does not authorize visual delivery. Reuse the pre-publication
[canonical visual gate](../review/export-and-check.md#unified-visual-evidence-canonical-agent-gate)
manifest and consumer result only while their source, candidate, renderer and render-context bindings
remain current. Rebuild evidence when a binding changes; a completed finalizer alone does not require
another render.
Never override `stop` or `require-human-confirmation` with a specialized pass. Diagnose inherited
findings and renderer differences before changing source geometry or typography.
