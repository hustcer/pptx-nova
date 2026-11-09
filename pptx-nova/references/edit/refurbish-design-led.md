# Design-led refurbishment

Use this method when the user names a target DeckKit or asks for the result to look as though it
was created with that kit. Preserve the source's meaning and editable objects while adopting the
target's visual language. Keep this design work inside the standard refurbishment evidence flow.
Use [shared object integrity](../review/object-integrity.md) for cross-workflow authoring and
preservation rules. This reference adds the target-kit mapping and refurbishment-specific closure.

## 1. Establish the two sources of truth

- **Content:** freeze the source PPTX and inspect it once. Retain its slide/object identities,
  notes, links, tables/charts, formulas and media. Export JSON/Markdown when the content is dense:

  ```bash
  xdoc convert <source.pptx> --to json,md --output-dir <run-dir>/readback-source --pretty
  ```

- **Design:** open the selected kit's actual showcase contact sheet and representative full pages.
  Read its `design.json` and `intent.md`, using catalog paths rather than guessing a theme alias.
  Structured colors, font roles and geometry take priority over prose color names. Read another
  page only when its composition is relevant; no need to preload every kit or creation reference.

Record a short `refurbish-design-map.json`: target showcase/contract paths, recognizable signatures,
source slide → target composition role, source object → retained proof/content role, and any
specialized preservation checks. Keep source text/data in readback or the source, not duplicated
inside reusable kit code. This map is an authoring aid, not a substitute for the fidelity gate.

## 2. Map meaning to composition

For each source page, identify its main statement, proof object and supporting explanation. Match
those responsibilities to the target's actual composition: cover, methods/process, finding,
comparison, mechanism, table, case or closing. A formula is a proof object, not an illustration to
replace with an unrelated chart. A percentage component requires real percentage data.

Reuse registered target components when their meanings and capacities fit. Otherwise retain native
source objects and recompose them using the target grid and component treatments. Extend the kit
only when a reusable authored page type/component contract is actually needed; do not silently
truncate content to fit an existing slot. Preserve exact content unless rewriting is authorized.

### Distinguish design paint from evidence paint

Follow the [shared evidence-paint rule](../review/object-integrity.md#distinguish-design-paint-from-evidence-paint).
Record protected properties and source-paint exceptions in `refurbish-design-map.json`; judge the
surrounding redesign against the actual kit showcase without misrepresenting those exceptions as defaults.

### Preserve the visible existence of proof shapes

Use the [shared proof-visibility rule](../review/object-integrity.md#preserve-the-visible-existence-of-proof-shapes)
and [source-bound guard](../review/object-integrity.md#source-bound-proof-guard). Include the protected
source identities and per-object results in the content audit before judging the target kit treatment.

### Fit native tables internally, not only their frames

Use the [shared native-table fitting rule](../review/object-integrity.md#fit-native-tables-internally-not-only-their-frames)
inside the target kit's chosen proof region, retaining any source formatting that is itself evidence.

### Apply the complete target design

Apply the design at all these layers:

| Layer       | What must come from the target                                                        |
| ----------- | ------------------------------------------------------------------------------------- |
| Composition | Canvas, margins, title/body regions, proof placement, whitespace and page rhythm      |
| Typography  | Visible title/body/label roles, sizes, weights, alignment and line spacing            |
| Evidence    | Open notes or functional containers, native table/chart styling, annotation hierarchy |
| Identity    | The kit's real signature geometry, markers, palette and chapter/closing treatments    |
| Inheritance | Theme plus visible master/layout artwork, explicit cell/run styles and old chrome     |

When a mechanical fallback derives a theme from its small refurbishment palette, compare the emitted
`set-theme` colors and major/minor font families with `design.json.theme`. Resolve the declared color
and font role references, including each role's East Asian family; a generic accent order or a single
CJK fallback can change inherited artwork, tables, photos with theme-bound duotones and body text.
Repair mismatches in the current authoring patch before judging target identity. A valid fallback
report proves execution, not equivalence to the kit's complete theme contract.

Apply the [shared chart inheritance and visibility checks](../review/object-integrity.md#check-chart-inheritance-and-visible-semantics)
when applying the target palette; a successful palette edit alone does not establish its typography.

Do not treat the mechanical fallback as the design itself. Inspect-driven color/font replacement
is a useful baseline; it commonly needs object-level recomposition. Do not apply a uniform
coordinate multiplier and call the retained source grid a new design. A canvas change also requires
text, equations, tables and images to be fitted independently rather than merely scaling frames.

### Align heading companions as one typographic unit

Use the target kit's index/heading roles with the
[shared optical alignment rule](../review/object-integrity.md#align-heading-companions-as-one-typographic-unit).

### Preserve source-picture appearance

Use the [shared source-picture policy and image-geometry gate](../review/object-integrity.md#preserve-source-picture-appearance).
Adopting a new DeckKit authorizes recomposition, not silent stretching, recropping or photo recoloring.
Use [object-scope preservation checks](../review/object-integrity.md#verify-preserved-content-at-object-scope)
for fields, non-text objects and inherited content before treating an apparently empty frame as chrome.

## 3. Test representative pages before the full pass

Review a cover/section, a typical evidence page and the densest or most specialized page beside
the target showcase. Use the same current runtime and frozen field date. Resolve the shared
composition first, then apply it to the remaining pages. Do not ask the user to approve routine
reversible choices when the target design and task scope already authorize them.

For formula-heavy pages, review large operators, limits, fractions and scripts inside their complete
authored frames. When the optional PowerPoint evidence route is available, compare a representative
native export before propagating the layout. Different metrics can be a renderer/font-resolution
issue; preserve same-input, same-DPI evidence and follow [fidelity diagnosis](../review/fidelity-diagnosis.md)
rather than silently treating every discrepancy as insufficient deck spacing.

Ask three concrete questions:

1. With filenames hidden, would this page plausibly sit beside newly created pages from the kit?
2. Does its proof object lead the page, with the same hierarchy, spacing and visual treatment?
3. Is any source card wall, accent stripe, inherited bar or old typography still controlling it?

When the answer fails, repair the composition/source mapping. Do not add more decoration or
declare `targetDeckkitApplied=pass` merely because machine gates passed.

Apply the [shared full-size review](../review/object-integrity.md#review-full-size-composition-not-only-thumbnails)
to sparse pages as well as dense ones; check that their rhythm also matches the target kit.

## 4. Verify content independently of appearance

Export candidate JSON/Markdown and compare **content**, not complete JSON bytes:

```bash
xdoc convert <candidate.pptx> --to json,md --output-dir <run-dir>/readback-candidate --pretty
```

Retain `content-equivalence.json` with source/candidate hashes, per-slide coverage, comparison
method, differences and unverified object classes. Follow the
[shared object-scope preservation checks](../review/object-integrity.md#verify-preserved-content-at-object-scope),
including facts omitted by JSON/Markdown extraction. The default remains exact source-content
preservation with deliberate new chrome separated from original objects. Allow authorized
geometry/font/color changes without claiming all XML is byte-identical; a rendered fallback
does not establish native equation or chart preservation.

Inventory all proof objects within a page before allocating regions. A single-chart layout cannot
place several retained charts in the same frame: equal counts/data can still hide an entire chart.
Check pairwise proof visibility and give each object a distinct region or an intentional shared-axis
composition. After a theme change, inspect labels on every inherited palette region, particularly
white labels on theme-bound light fills. Prefer the chart's disclosed `colorStyle`/label operations
for a scoped contrast repair; retain data and label visibility, then renew native evidence as needed.

Run the normal semantic diff, refurbishment audit and fidelity gate too. If an audit treats every
geometry change as a failure, inspect its exact content policy; do not weaken it globally or invent
passed evidence. Fix the map or use the workflow's documented scoped evidence path.

## 5. Return authored composition to the runner

Keep the inspect-generated fallback as the mechanical baseline. For a full redesign, produce a
**complete replacement** `pptx-patch/v1` patch from the original source, with
`metadata.deckkit` and `metadata.refurbishSourceSha256` bound to the selected kit and exact source
bytes. Keep its generator, design map and specimen exceptions in the task run, not the reusable kit.
Review representative pages, then pass it as `--authoring-patch <path>` to the standard runner in a
fresh run. This forces the fallback route, archives the mechanical baseline and applies the authored
patch through the existing lock, dry-run, apply, audit, fidelity, comparison and publication gates.
It does not authorize content loss or waive a visual finding. For file-backed resources, pass
`--assets <assets_manifest.json>` with the authored patch. The runner passes the manifest to lock
validation and uses its directory as `--asset-root` for dry-run and apply. Keep `assetSource.path`
relative to that directory, including any manifest `assetRoot` prefix (for example `assets/proof.svg`);
xdoc rejects absolute paths. Keep these resource files stable through the run. The runner archives
the source-bound patch before probing and preserves handoff flags in its recovery command.
Pass the supported protected-object subset separately as `--proof-map <path>`; the runner archives
that source-bound map before probing and checks it again at publication. Keep the input map outside
the fresh run directory and unsupported objects in the separate manual checklist.
Raw operations additionally require explicit `--allow-raw-xml` with `--authoring-patch`; prefer typed operations first and
retain the raw route's structural/native checks. A supplied patch never enables raw XML implicitly.

When only `multi-column-text-layout-review` findings remain, use the existing
`scripts/cli/review/multi-column-scaffold.mjs` and `multi-column-gate.mjs` against the representative
candidate/vision/preview. Read the complete columns and fill the scaffold judgments after visual
review. Pass that reviewed file with `--multi-column-review <path>` on the final run. This selects
fallback; an explicit `--route native` is rejected. The runner
re-renders the affected pages and carries judgments only when candidate bytes, PNGs, finding coverage
and normalized vision identity match. Stale reviews and every other new/worsened high/medium issue
still block, including inconsistent blocker counts and detailed findings. A changed candidate needs
a fresh visual review, never edited binding hashes.

Use `effect: { inherit: false }` to avoid importing theme effects when authoring new paint; do not
assume an empty effect patch clears an existing local shadow. Inspect effective effects and render
the result. For a protected specimen, retain its effect; for expendable chrome, use a supported
explicit override and verify the actual appearance.

## 6. Close one stable candidate

After the final repair, retain one clearly named candidate. Refresh inspect, layout, semantic diff,
review evaluation, fidelity, applicable structural/compatibility evidence and the canonical
comparison against the original source. Old reports still describe their old candidate; do not
edit their paths or hashes to make them appear current. Use the runner's commands and the
[refurbish runner's repair/finalization guidance](refurbish-runner.md#review-and-delivery).

Inspect the candidate-only overview end to end and all Agent comparison parts. Open full-size
pages for dense formulas/tables, suspected clipping, changed inheritance and the weakest composition.
Record page-specific design observations and content-equivalence results. Compare/clean-open
proves different facts from design identity; each applicable gate must close on the same bytes.
Publish through the compare gate and list the actual bound deliverables.
Native render evidence must live in that final run and name the exact candidate path checked by
the finalizer. For post-publication checks, capture the published path into the final run; an earlier
authoring-path report is not interchangeable merely because its PPTX hash matches.

When Feedback Mode is active, separate skill guidance/tooling gaps, operator mistakes and confirmed
xdoc problems. Keep one-off content/layout choices in the run. Only general, demonstrated workflow
improvements belong in the skill, with targeted regression checks for executable changes.
