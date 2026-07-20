# Translation Mode

Read this file when the user asks to translate an existing `.pptx` while
preserving the original layout, visual hierarchy, objects, animations, and
deck structure.

Translation is an edit workflow, but it has stricter coverage and visual
fidelity requirements than ordinary text replacement. The goal is not only
"all visible text is in the target language"; the translated deck must still
look like the same deck.

## Required Inputs

- Source PPTX path.
- Target language.
- Output PPTX path.
- Any requested terminology policy, tone, or locale. If none is provided,
  keep technical terms literal and concise.

The source deck is read-only. Always write candidates inside the run directory
first, validate them, then publish to the requested output path.

## Style Fidelity Invariant

Translation mode is a style-preserving workflow. The translated deck should be a
copy of the source deck with text content replaced in place.

The following properties must remain unchanged unless the user explicitly asks
otherwise or the controlled fitting-repair policy below allows a narrower
exception:

- text bold / italic / underline / strikethrough
- paragraph alignment, bullets, indentation, line spacing, tab stops, columns
- text box geometry, margins, auto-fit, vertical alignment, rotation
- run color, font face, hyperlinks, speaker notes, animations, transitions
- table cell style, chart style, shape fills/lines/effects, z-order

Automatic layout repair must use the narrowest change that preserves both
meaning and layout fidelity:

1. First shorten the translation without changing meaning. Record this as
   `meaning-preserving compact wording`.
2. If compact wording still does not fit, make the smallest practical
   font-size adjustment inside the original visual hierarchy and record it in
   the bilingual audit.
3. Only when the slide has clear unused space may you make a minimal geometry
   adjustment such as increasing a text box width/height. Geometry repair is a
   last resort, not the default response to `vision-check` `fixPatch` output.
   It is allowed only when the adjusted shape does not overlap other shapes,
   does not touch the slide edge, and does not make neighboring spacing look
   cramped. Record the exact shape, before/after size or position, and reason
   in the bilingual audit and visual review.

Do not apply a geometry `fixPatch` automatically in translation mode. Inspect
the slide context first, prefer compact wording, and use geometry only when
rendered before/after PNGs prove the page still has adequate spacing.

Avoid whole-shape text replacement as the default. Operations such as
`set-text-frame` or `set-table` cell text can rebuild text bodies or runs and may destroy
mixed formatting. Use them only when dry-run plus rendered before/after review
proves the target object has uniform formatting or the operation preserves the
relevant OOXML style properties.

## Standard Flow

The preferred preparation entry point owns scan, bound language review,
deduplicated translation memory, plan materialization, guarded dry-runs, and
sequential apply:

```bash
node <skill-root>/scripts/pptx-nova-translation-prepare.mjs \
  --source source.pptx \
  --source-lang <multi|zh|en> \
  --target-lang <target-lang> \
  --run-dir <run-dir> \
  --json
```

If it returns `needs-review-decisions`, fill the emitted hash-bound decision
template and resume the same run with `--review-decisions <path>`. The template
groups language-review units by exact source text: fill each `byText[]` entry
once (`decision` plus `reason` cover every unit carrying that text; `context`
reports the covered unit count, categories, and slides), and add `decisions[]`
entries only when one specific unit needs a different decision — a per-unit
entry overrides the matching `byText[]` rule for that unit alone. If it returns
`needs-translations`, fill each unique `translation-memory.json` entry once.
Exact repeated source strings share one target; use `unitOverrides[]` only when
a context needs different wording, target segments, anchors, or an explicit
review choice. A reviewed executable unit must use
`reviewDecision: "translate"`; use `reviewDecision: "preserve"` to omit it.
Then resume with `--apply`. The runner revalidates source bytes, classified-unit
bytes, languages, and every source hash before producing a stable prepared
candidate. Feed that candidate, the emitted classified scan, and
`translations.json` to the finalizer in `references/translation-runner.md`.
If the planner emits target-segment repairs, preparation stops with
`needs-target-segments` and writes `translation-memory.repair.json`, merging
each fillable template into the existing `unitOverrides[]` by `unitId`. Fill
every null segment, preserve the contract id, and resume with
`--memory <repair-file> --apply --overwrite`.

The memory exposes only counts for `languageUncertain`, `shared`,
`embeddedWorkbook`, and `other` review partitions. Add
`--expand-review embeddedWorkbook` (or `languageUncertain`, `shared`, `other`)
only for the partition currently being decided; the runner persists a bound
`review-inventory-<name>.json` without expanding the others. Do not paste the
entire inventory into agent context. The manual commands below remain the
authoritative lower-level contract and debugging path.

1. Create a run directory and capture `xdoc-capabilities.json`.
2. Inspect the source deck:
   ```bash
   xdoc pptx inspect source.pptx --daemon --json > <run-dir>/source-inspect.json
   ```
3. Extract visible text from multiple evidence sources:
   - `inspect.slides[].shapes[].textPreview` for editable shape text.
   - `xdoc convert source.pptx --to text` for rendered text order.
   - Choose the native source-language detector deliberately:
     - Use `multi` for mixed Chinese/English source decks translated into a
       non-English target such as German.
     - Use `zh` for Chinese-only source decks, especially when the target is
       English.
     - Use `en` for English-only source decks.
   - Native source-language classification scan:
     ```bash
     xdoc pptx i18n-scan \
       --source source.pptx \
       --source-lang <source-lang> \
       --mode source \
       --output <run-dir>/i18n-scan-source.json \
       --json
     ```
     Treat `i18nUnits.units[]` as the primary translation inventory. `hits[]`
     are diagnostic evidence only. For `multi`, use `detectedLangs` and
     `detectedScripts` to audit whether Chinese and English source text were
     both covered. Do not derive selectors or replacement indexes from
     `hits[].location`.
4. Build `<run-dir>/translations.json` using
   `pptx-i18n-translations/v1`. Create one record for every
   `i18nUnits.units[]` item with `action: "translate"`:
   ```json
   {
     "schemaVersion": "pptx-i18n-translations/v1",
     "sourceLang": "multi",
     "targetLang": "de",
     "translations": [
       {
         "unitId": "ppt/slides/slide1.xml#shape:12#p:0",
         "sourceHash": "sha256:...",
         "sourceText": "源文本 / Source text",
         "targetText": "Zieltext"
       }
     ]
   }
   ```
   Set `sourceLang` to the same normalized value returned by the source
   `i18n-scan` report; `i18n-plan` rejects mismatches.
   Translate `visibleBody`, `visibleTextAttr`, and `chartVisibleCache`.
   Preserve `themeFontMetadata`, `relationshipPath`, `shapeInternalName`, and
   `chartMetadata` by default. Treat `embeddedWorkbook` and other review units
   as manual review items unless the user explicitly approves a workbook sync
   strategy.
5. Copy the source PPTX into the run directory and use that copy as the first
   candidate. Do not reconstruct slides, duplicate objects, or generate new
   text boxes for existing content.
6. Generate the native i18n plan:

   ```bash
   xdoc pptx i18n-plan \
     --source source.pptx \
     --units <run-dir>/i18n-scan-source.json \
     --data <run-dir>/translations.json \
     --output <run-dir>/i18n-plan.json \
     --json
   ```

   `i18n-plan` validates `unitId`, `sourceHash`, and `sourceText`, then routes
   units to the safest available execution primitive:
   - `textPlan.translations[]` for DrawingML shape and table paragraph/run planning.
     This sub-artifact is labelled `pptx-i18n-text-plan-input/v1` and is the only
     valid `--data` input for `xdoc pptx i18n-text-plan`; the top-level
     unitId-based `pptx-i18n-translations/v1` document is rejected there with a
     targeted error.
   - `replaceText.replacements[]` for user-visible text attributes and table
     paragraph text-node replacements materialized by the shared text-plan route.
   - `replaceChartText.replacements[]` for chart visible cache labels.
   - `patch.ops[]` for generated run-level `set-run` operations and atomic
     `replace-paragraph-text` operations on shape text.

   Use the planner-emitted semantic `nodePath` as the primary locator and copy
   it unchanged into execution inputs. `sourceText`, `sourceHash`, and `index`
   are guards; they do not replace semantic location. Do not derive `nodePath`
   from XML array positions or reconstruct it from the unit id.

   Treat `applyGate.passed=false`, non-empty `conflicts[]`, non-empty
   `missingTranslations[]`, or apply-blocking `reviewRequired[]` as an
   automation blocker. Triage from the gate's aggregated fields first:
   `applyGate.blockingReviewCount`, `applyGate.conflictCount`,
   `applyGate.missingTranslationCount`, and `applyGate.blockersByCategory`
   name what actually holds the gate closed, and `reviewRequired[]` lists
   apply-blocking items first — repair top-down instead of filtering the full
   array (non-blocking reviews never block this gate). Add missing
   translations, refresh stale source hashes,
   add reliable styled-token anchors, broaden shared-part scope, or route the
   item to manual review before applying changes.

   When an apply-blocking review contains `reviewRequired[].repair` with
   `kind=target-segments`, use that object as the authoritative repair material:
   - Read `sourceRunGroups[]` and `sourceSequence[]`; do not run a local XML
     scanner or guess `sourceRunGroupId` from run positions.
   - Copy `translationPatchTemplate` and merge it into the existing
     `translations[]` record matched by `unitId`. Do not append a second record.
   - Replace every `targetSegments[].text: null` with the translated text for
     that exact group. Empty string is valid when the target intentionally
     clears a group; `null` or a missing field is not.
   - Preserve `targetSegmentsContractId`. It binds the mapping to the current
     hyperlink/style/field/break/tab topology even when the concatenated source
     text did not change.
   - Rerun `i18n-plan`. Never apply a template with `ready=false`; only the new
     plan with `applyGate.passed=true` authorizes execution.

   A unique ordered `anchors[]` mapping may allow `i18n-plan` to resolve simple
   hyperlink groups automatically. Repeated, missing, reordered, or otherwise
   ambiguous anchors remain review-required and must use the explicit repair
   template.

7. Replace text in place while preserving OOXML structure:
   - Apply generated artifacts only when `i18n-plan.applyGate.passed=true`.
     The planner is read-only; it does not write a candidate PPTX.
   - Apply execution artifacts sequentially. Each command reads the latest
     candidate and writes a new candidate path; never rerun every helper from
     `source.pptx` into the same output because that can overwrite earlier
     replacements.
   - For chart labels, run the translation-safe top-level helper first instead
     of a handwritten OOXML fallback:
     ```bash
     xdoc pptx replace-chart-text \
       --source <current-candidate-or-source.pptx> \
       --data <run-dir>/replace-chart-text-input.json \
       --output <run-dir>/candidate-chart.pptx \
       --visible-cache-only \
       --dry-run \
       --json > <run-dir>/replace-chart-text-dry-run.json
     ```
     Materialize `<run-dir>/replace-chart-text-input.json` from
     `i18n-plan.replaceChartText`. Then rerun without `--dry-run` only when
     the dry-run report passes. This helper changes only chart visible cache
     labels (`title`, `series`, `category`, `dataLabel`) in
     `ppt/charts/*.xml`; it does not write external workbook paths,
     relationship targets, embedded workbook data, or `formatCode`.
     Classic Chart and ChartEx may expose the application-generated default
     title `Chart Title` without storing it as an ordinary visible text node.
     `i18n-scan` inventories that semantic default with
     `sourceState=generated-default-title`, `chartDialect`, and
     `structureSignature`; preserve all three fields verbatim through
     `i18n-plan.replaceChartText`. The helper revalidates those guards and
     materializes only the dialect-appropriate title text subtree while
     preserving layout, overlay, shape, and text-style children.
     This generated-title route is intentionally limited to title containers
     with no existing dialect `tx` child. If any `tx` child already exists,
     even an empty rich-text container, keep the unit preserve/manual-review
     rather than synthesizing text or using a run-local OOXML fallback.
   - Prefer run/text-node replacement that changes only `<a:t>`, `<c:v>`,
     `<cx:pt>`, or equivalent visible cache text, leaving neighboring
     `a:rPr`, `a:pPr`, `a:bodyPr`, table cell properties, and chart styling
     untouched.
   - Prefer native `xdoc pptx replace-text` for direct OOXML replacements. It
     copies the current candidate, changes only existing text-node or
     text-attribute values, and blocks when `sourceText`/`sourceHash`/`index`
     cannot identify a unique target:
     ```bash
     xdoc pptx replace-text \
       --source <current-candidate.pptx> \
       --data <run-dir>/replace-text-input.json \
       --output <run-dir>/candidate-attrs.pptx \
       --json > <run-dir>/replace-text.json
     ```
     Materialize `<run-dir>/replace-text-input.json` from
     `i18n-plan.replaceText`. Do not hand-derive `kind`, `part`, `tag`,
     `attrName`, `index`, or `nodePath`. Preserve planner-emitted semantic
     `nodePath` values exactly.
     `replace-text` currently does not support `--dry-run`; do not pass
     `--dry-run`, `--compile`, or `--allow-raw-xml`. Its safety comes from
     writing to a run-directory candidate plus `sourceText`/`sourceHash`/`index`
     conflict and ambiguity checks. If you need to iterate the same current-run
     candidate path, overwrite only that run-generated candidate:
     ```bash
     xdoc pptx replace-text \
       --source <current-candidate.pptx> \
       --data <run-dir>/replace-text-input.json \
       --output <run-dir>/candidate-attrs.pptx \
       --overwrite \
       --json > <run-dir>/replace-text.json
     ```
   - For DrawingML shape paragraphs, apply only the `set-run` and
     `replace-paragraph-text` patch ops emitted under
     `i18n-plan.patch.ops[]`. Each paragraph patch op must carry `unitId`,
     `sourceText`, and `sourceHash` guards. The structured operation additionally
     carries `expectedNodes[]` and applies all ordinary-run replacements as one
     guarded operation; never hand-edit or weaken those fields.
     ```bash
     xdoc pptx apply \
       --input <current-candidate.pptx> \
       --patch <run-dir>/patch.json \
       --output <run-dir>/candidate-text.pptx \
       --dry-run \
       --json > <run-dir>/patch-dry-run.json
     ```
     Materialize `<run-dir>/patch.json` from `i18n-plan.patch`, then apply
     without `--dry-run` only after the dry-run report passes.
   - Table paragraphs use the same text-plan strategies as shape paragraphs.
     Same-style multi-run paragraphs normally need only `targetText`; the first
     run receives the target and continuation runs are cleared while their
     properties remain intact. The planner materializes the result as guarded
     `replaceText.replacements[]` because table cells are addressed through
     semantic text-node paths rather than shape `set-run` ops.
   - Use optional `targetSegments[]` only when hyperlink boundaries or mixed
     styles cannot be mapped safely from `targetText` and `anchors[]`. Every
     `sourceRunGroupId` must come verbatim from
     `i18n-plan.reviewRequired[].repair.sourceRunGroups[]`; never guess ids or
     infer them from run order. Preserve the repair's
     `targetSegmentsContractId`. Missing, duplicated, unknown, out-of-order,
     stale-contract, or targetText-reconstruction-mismatched segments must fail
     closed.
   - Break and tab nodes are structural delimiters. Preserve the corresponding
     `\n` and `\t` delimiters in `targetText`; the planner partitions translated
     text around them and keeps the original OOXML nodes unchanged. A missing,
     added, or reordered delimiter is `review-required`, not permission to
     collapse the paragraph.
   - Fields are immutable structural placeholders by default. When a translated
     paragraph contains fields, represent them as `{{field:0}}`,
     `{{field:1}}`, ... in source order. Do not translate field cached text or
     modify field `id`, `type`, run properties, or position. Never infer a field
     placeholder from a cached value such as `1` or a date; regenerate the
     translation record with explicit placeholders instead.
   - If the planner reports `source-text-mismatch` after a current xdoc upgrade,
     regenerate `i18n-scan` units and `translations.json` from the current source
     deck. In particular, never copy paragraph tab-stop definitions from
     `<a:pPr>/<a:tabLst>` into visible text as leading `\t` characters.
   - Preserve run boundaries when they encode style. If one source sentence is
     split across multiple styled runs, follow the plan strategy:
     `uniform`, `preserve-run-boundaries`, or
     `preserve-styled-token-boundaries`. If the plan returns
     `review-required`, do not collapse the paragraph into one run.
   - Preserve hyperlink runs and field runs. Do not remove `<a:hlinkClick>`,
     `<a:fld>`, footer/date/page number placeholders, or speaker-note
     structure while translating visible labels around them.
   - Use `set-text-frame`, `set-table` cell text, or other high-level text ops only for
     uniform-format objects, or when the op has a style-preservation report that
     proves bold/italic/underline/strike/alignment and run formatting survive.
8. Dry-run generated patch ops before applying them. For direct OOXML fallback, write a
   machine-readable replacement report and run ZIP/XML validation immediately
   after packaging.
9. Run the native translation style gate and block on any style blocker:
   ```bash
   xdoc pptx i18n-style-diff \
     --source source.pptx \
     --candidate candidate.pptx \
     --json > <run-dir>/i18n-style-diff.json
   ```
   If translation intentionally changes user-visible text attributes such as
   hyperlink `tooltip` or alt text `descr`/`title`, run the gate with an
   explicit typed allowlist:
   ```bash
   xdoc pptx i18n-style-diff \
     --source source.pptx \
     --candidate candidate.pptx \
     --allow-text-attrs tooltip,descr,title \
     --json > <run-dir>/i18n-style-diff.json
   ```
   `--allow-text-attrs` only applies in typed user-visible contexts: hyperlink
   `tooltip` on `hlinkClick`/`hlinkHover`/`hlinkMouseOver` and alt text
   `descr`/`title` on `cNvPr`. It does not waive metadata such as language
   tags, theme typefaces, relationship paths, chart `formatCode`, or shape
   internal names.
   For scoped repair loops, add `--slides <changed>`, then rerun the full-deck
   gate before delivery. Treat `agentGate.passed=false`, non-empty
   `styleBlockers[]`, or non-empty compatibility `blockers[]` as delivery
   blockers. Font-size-only differences are allowed only when they appear under
   `allowedChanges.fontSize[]` and are recorded as layout repair in the
   bilingual audit. User-visible text attribute translations are allowed only
   when they appear under `textAttrChanges[]` /
   `allowedChanges.textAttributes[]` and are recorded in the audit.
10. Run the authoritative candidate target-consistency gate. It consumes the
    source units and translations and verifies that every translated unit's
    current candidate text exactly equals its `targetText`:

    ```bash
    xdoc pptx i18n-scan \
      --source candidate.pptx \
      --mode candidate \
      --units <run-dir>/i18n-scan-classified.json \
      --data <run-dir>/translations.json \
      --output <run-dir>/i18n-scan-candidate.json \
      --json
    ```

    Candidate mode takes the source language and scope from `--units`; it rejects
    `--source-lang` and `--slides` so the command line cannot disagree with the
    contract files. Use the same `--units` file you fed to `i18n-plan` (the
    classified scan when review units exist, otherwise `i18n-scan-source.json`)
    and the same `translations.json`.

    This is the single authoritative source-leakage gate. It replaces the old
    external residual matcher: it does not run the heuristic language classifier,
    so a `multi` source translated to French, German, Spanish, or another
    Latin-script target is never blocked merely because valid target text looks
    like English. Treat `agentGate.passed=false` or any non-empty `blockers[]` as
    a delivery blocker.

    Each blocker carries a stable `kind`:
    - `source-residual`: the candidate still contains the original source text;
      re-apply the translation for that unit.
    - `target-mismatch`: the current text is neither source nor target; fix the
      candidate or refresh the contract from the current source deck.
    - `selector-missing` / `selector-ambiguous` / `part-missing` /
      `part-unreadable` / `unsupported-selector`: the source selector could not
      resolve a unique candidate value; repair the selector or re-apply so it
      resolves exactly once. Never fall back to the candidate inventory or a
      language heuristic to hide the gap.

    Translation records with `targetText === sourceText` are explicit approvals
    to preserve product names, URLs, code tokens, or equivalent text; the gate
    still requires the candidate to keep that exact text (`approvedUnchangedCount`
    in the summary). `embeddedWorkbook` still needs chart/workbook sync review
    but stays out of the automatic translation set. Preserve `themeFontMetadata`,
    `relationshipPath`, `shapeInternalName`, and `chartMetadata` unless the user
    explicitly asks to localize or relink them.

11. Run scoped and full visual gates:

- `vision-diff` on changed slides, with source as the baseline:
  ```bash
  xdoc pptx vision-diff \
    --source source.pptx \
    --candidate candidate.pptx \
    --slides <changed> \
    --json > <run-dir>/vision-diff.json
  ```
  Treat `agentGate.passed=false` as a delivery blocker. Source issues inherited
  unchanged are allowed; new high/medium issues and inherited issues worsened to
  high/medium are blockers. `newIssues[]` and `worsenedIssues[]` are the
  primary machine repair queue. When `--slides` is used, check
  `deckResidualRisk` before final delivery so outside-scope source noise is
  disclosed but does not hide candidate regressions.
  The two repair-queue arrays have different shapes; do not parse them with one
  shared record type:
  - `newIssues[]` entries are flat issue objects. The category lives in `kind`
    (not `code`), alongside `severity`, `slideIndex` (0-based), `message`,
    `metrics{}`, and optional `shapeId`/`shapeName`/`fix`.
  - `worsenedIssues[]` entries are nested change objects:
    `{ "sourceIssue": <issue>, "candidateIssue": <issue>, "changedFields": [...] }`,
    where both inner issues use the same flat shape as `newIssues[]`. Read the
    candidate severity from `candidateIssue.severity` and the baseline from
    `sourceIssue.severity`.
    Current xdoc evaluates this as a rendered gate: renderer-visible text regions
    provide chart-title collision evidence, while PDFium checks final glyph/page
    bounds. Every issue carries an `evidenceClass`
    (`rendered` / `review-only` / `estimator` / `static-geometry`) and
    `agentGate.blockersByEvidenceClass` counts the blocking issues per class —
    read it first so estimator noise cannot hide rendered hard blockers:
  - `rendered` blockers are proven on final output and are never eligible for
    the multi-column human-review exception.
  - `review-only` blockers resolve through the bound multi-column review
    record.
  - `estimator` blockers (`text-overflow-estimate`,
    `multi-column-text-overflow`) are static text-fit estimates; confirm
    against rendered evidence and the final PNG before rewording text.
  - `static-geometry` blockers come from authored-geometry heuristics
    evaluated without rendering.
    New or worsened `chart-title-external-text-collision`,
    `rendered-text-outside-page-horizontal`, and
    `rendered-text-outside-page-vertical` high/medium issues require repair and
    are not eligible for the multi-column human-review exception. Do not treat
    text extending beyond an authored shape box as clipping when its final glyphs
    remain visible.
- `vision-check` on the candidate changed slides as a diagnostic report, not as
  the primary pass/fail gate when the source deck is already noisy.
- Source and candidate PNG/contact sheets for changed slides.
- `contact-diff` for before/after layout consistency.
- A high-DPI full-deck translation comparison artifact set for delivery. During repair
  loops you may pass `--slides <changed>` to the helper for local review, but
  the final delivery artifact must be generated without `--slides` so it covers
  every slide in source/candidate order. Decks up to 20 slides use one PNG;
  larger decks use the complete numbered multipart set.

12. Fix visual regressions at the translation source:

- First preserve meaning with concise wording. This is the default repair for
  translated labels, badges, table headers, legends, and narrow callouts.
- If concise wording still does not fit, make the smallest acceptable
  font-size adjustment within the original hierarchy.
- If the slide has real unused space, a minimal geometry size adjustment is
  allowed after checking neighboring objects. Do not move objects or resize
  boxes into other shapes, slide edges, chart labels, legends, footers, page
  numbers, or decorative chrome.
- Treat `vision-check` geometry `fixPatch` suggestions as candidates, not
  instructions. Apply them only after a space check and rerun `vision-diff`,
  preview/contact sheet review, and any relevant style/semantic diff.
- Do not split pages, change font weight/style, or shrink fonts below
  readability thresholds just to avoid editing the translation.

13. Write `bilingual-translation-audit.md` and `.json` with source text,
    target text, and notes for any meaning-preserving compression.
14. Run structure checks, `pptx diff`, preview, high-DPI full-deck comparison,
    and clean-open when available.
15. Publish the validated candidate and comparison artifact set next to the
    final PPTX. Decks up to 20 slides use
    `<output-stem>-translation-compare-<MMDDhhmmss>.png`; larger decks use the
    complete numbered
    `<output-stem>-translation-compare-<MMDDhhmmss>-01.png`, `-02.png`, ...
    sibling set. Keep the run-directory comparison manifest, part reports, and
    PNGs as audit evidence, and list the final PPTX plus every published
    comparison sibling in the final response.

## Style Signature Gate

`xdoc pptx i18n-style-diff` is mandatory for translation delivery. It
compares source and candidate PPTX parts using textless OOXML style signatures:
visible text-node content is ignored, while run, paragraph, textbox, table,
chart, relationship, animation, theme, layout, and master structure remains in
the signature.

Required interpretation:

- `status=pass` and `agentGate.passed=true`: style gate passed.
- `styleBlockers[]` non-empty: stop and repair the candidate before any visual
  delivery. `blockers[]` is the compatibility alias and must be treated the
  same way.
- `textAttrChanges[]` non-empty: user-visible text attributes changed under an
  explicit typed allowlist. Record them in the bilingual audit; they are not
  style blockers.
- `allowedChanges.fontSize[]` non-empty: acceptable only for fitting repair;
  record the reason and keep the source meaning unchanged.
- Deliberate geometry repairs must be backed by the repair patch, semantic diff
  or inspect evidence, and before/after PNG review. Do not waive unrelated
  style blockers as "geometry"; if a report cannot isolate the change to the
  intended textbox size/position, stop and repair by wording or font size.
- Missing or added style-relevant parts are blockers.
- A failure in slide/chart relationship parts means possible hyperlink or
  embedded-object loss; do not waive it based only on PNG appearance.

This gate does not prove translation completeness or rendered fit. It must be
paired with bilingual text audit, source-language scan, preview/contact-diff,
and visual review.

## I18n Plan Gate

`xdoc pptx i18n-plan` is mandatory before applying automated translation
changes. It is a read-only planner: it validates the scan inventory and
translations, then emits executable sub-artifacts for the lower-level commands.
Use `--output <run-dir>/i18n-plan.json --json`: stdout is the compact gate and
next-action result, while the persisted report contains executable arrays.
`--json-full` is for small-report debugging, not the normal agent path.

Required interpretation:

- `applyGate.passed=true`: the generated `replaceText`, `replaceChartText`, and
  `patch.ops` artifacts may be dry-run and applied to the copied candidate
  deck. Shape and table paragraphs share the text-plan route; only their final
  execution artifact differs.
- `conflicts[]` non-empty: stop automation. Typical causes are unknown
  `unitId`, stale `sourceHash`, source text mismatch, or a target supplied for a
  preserve-only unit.
- `missingTranslations[]` non-empty: translate the missing `action=translate`
  units before applying.
- `reviewRequired[]` with `blocksApply=true`: add anchors, broaden shared-part
  scope, consume `reviewRequired[].repair` when present, or handle the unit
  manually before applying. A target-segments repair is a fillable template,
  not an executable patch.
- `deliveryGate.passed=false`: this is expected when non-applied review signals
  remain. It means final delivery still needs candidate scan, style diff,
  preview/vision review, and text overflow checks.

The lower-level `xdoc pptx i18n-text-plan` remains an execution primitive and
debugging fallback for directly addressed DrawingML shape text. Its `--data`
input must be the `pptx-i18n-text-plan-input/v1` textPlan sub-artifact from
`i18n-plan` (slide/paragraph/shapeId records), never the top-level unitId-based
`translations.json`. `i18n-plan`
reuses the same strategies for table paragraphs. The strategies mean:

- `uniform`: a single source run receives the full target text.
- `preserve-run-boundaries`: source runs share the same style; the first run
  receives the target and continuation runs are cleared while style nodes
  remain.
- `preserve-styled-token-boundaries`: styled anchors remain in their original
  runs and surrounding translated text is assigned to adjacent plain runs.
- `preserve-structural-boundaries`: break/tab/field nodes partition the
  paragraph into ordinary-run segments. The planner emits one atomic operation
  that validates the complete typed node sequence and field identity before
  changing text.
- `review-required`: stop automation for that unit. Add explicit anchors,
  produce a manual run-level mapping, or request human review.

For table paragraphs, the planner normally derives the target run mapping from
`targetText` and optional anchors, then emits guarded text-node replacements.
When explicit `targetSegments[]` are necessary, the mapping must cover the
complete `sourceRunGroupId` inventory in planner order; partial, duplicated,
unknown, or reordered mappings are blockers. Prefer the self-contained
`reviewRequired[].repair.translationPatchTemplate` over invoking the lower-level
planner merely to discover group ids. Fill every null segment, merge by
`unitId`, preserve `targetSegmentsContractId`, and rerun `i18n-plan`; the shared
validator also requires the completed segments to reconstruct `targetText`
exactly.

The i18n plan does not replace the style diff. After applying generated
artifacts, still run `i18n-style-diff` to prove bold/italic/underline/strike,
alignment, chart/table structure, and other style signatures were not changed.

## Translation Quality Rules

- Preserve technical semantics over literal phrasing when the target language
  requires shorter wording.
- Keep labels, chart legends, badges, and table headers short enough for their
  original containers.
- Do not translate code tokens, OOXML element names, URLs, file extensions,
  command names, enum values, or product names unless the source clearly uses
  them as prose.
- Preserve punctuation that carries technical meaning, such as `a:tabLst`,
  `ppaction://hlinksldjump`, `dir="l"`, `numCol`, and `spcCol`.
- For Chinese to English, expect English labels to become wider even when the
  character count is lower. Mark narrow cards, legend entries, rotated axis
  labels, and multi-column text as high fitting risk before applying.
- When translating into typically longer target languages (German, French,
  Spanish, Italian, Portuguese, Russian, Dutch, Polish), budget a 20-25%
  average length expansion over English source (more over Chinese) before the
  first apply. Build the dictionary with compact wording up front — for tight
  containers keep the target within roughly 1.25x the source length, prefer
  established abbreviations (`Jan.`, `Nr.`, `z. B.`), and reserve full phrasing
  for body paragraphs with real whitespace. Overflow surfaces only in the
  post-apply estimator and `vision-diff` gates, and every dictionary rework at
  that stage repeats the whole plan/apply/gate chain.
- Any changed multi-column text is subject to the fail-closed
  `multi-column-text-layout-review` gate, even when no ordinary overflow is
  detected or the translation has the same character count. `vision-diff`
  uses changed-text fingerprints to prevent equal-length translations from
  bypassing this review. Inspect the affected slide at full-size PNG resolution,
  repair wording/font/layout if needed, and rerun `vision-diff`; do not treat
  this gate as an automatically fixable overflow warning. Once the final PNG is
  acceptable, record the review with the candidate, final `vision-diff`, exact
  `slideIndex` / `shapeId`, PNG SHA-256 and dimensions, reviewer, conclusion,
  and all required checks, then run the multi-column review gate described
  below.
- Do not normalize styled mixed text into a single style. If the source has
  mixed bold/italic/underline/strikethrough runs, the target must keep the same
  style pattern unless a human approves a simplification.
- When shortening is required, record the original and final text in the
  bilingual audit and use a note such as `meaning-preserving compact label`.

## Chart And Table Coverage

Charts are a frequent translation blind spot.

- `inspect` can report chart objects without exposing chart title, series,
  categories, data labels, or workbook cache text.
- Always compare `xdoc convert --to text` and `i18n-scan` `i18nUnits` against
  `inspect`; any source-language text found only in chart parts still needs a
  translation unit.
- Audit short visible labels explicitly. xdoc inventories structurally visible
  body, attribute, and chart text even when language classification is
  uncertain. Confident source-language units use `action: "translate"`; short
  words, acronyms, and other ambiguous Latin text use `action: "review"`
  instead of disappearing from the inventory. Classify every review unit using
  its slide/chart role, sibling sequence, source/target language, and
  terminology policy. Do not use a fixed weekday/OHLC/business-term dictionary
  as the primary decision rule.

  Save decisions as `pptx-nova-i18n-review-decisions/v1`, bind them to the scan
  SHA-256, then materialize a classified scan artifact:

  ```bash
  node <skill-root>/scripts/pptx-nova-i18n-classify-review-units.mjs \
    --scan <run-dir>/i18n-scan-source.json \
    --decisions <run-dir>/i18n-review-decisions.json \
    --output <run-dir>/i18n-scan-classified.json \
    --report <run-dir>/i18n-review-classification.json \
    --overwrite --json
  ```

  The decisions document supports two channels. `byText[]` entries carry
  `sourceText`, `decision` (`translate` or `preserve`), a non-empty contextual
  reason, and optionally `sourceHash`; one entry classifies every
  language-review unit whose source text matches exactly, so patterned tokens
  (months, weekdays, `Day N`, series labels) need one rule instead of one
  record per unit. `decisions[]` entries carry `unitId`, `sourceHash`,
  `decision`, and a non-empty reason; they remain the per-unit channel and
  override the matching `byText[]` rule for that unit alone. The helper fails
  closed on stale hashes, missing decisions, duplicate unitIds, duplicate
  `byText[]` source texts, `byText[]` rules matching zero language-review
  units, or decisions targeting anything other than a language-uncertain
  visible-text review unit. The classification report records each unit's
  `decisionSource` (`byText` or `unit`) for audit. Feed
  `i18n-scan-classified.json`, not the
  unclassified scan, into `i18n-plan`. If structurally visible chart text is
  absent from the inventory entirely, stop and update/rebuild xdoc; do not hide
  the coverage gap with a run-local XML scanner.

  The older `pptx-nova-i18n-classify-chart-units.mjs` remains available only
  for replaying historical runs whose review inventory is chart-only.

  Review units outside the language-classification scaffold — typically
  slideLayout/slideMaster shared visible text that the scan keeps as
  `action: "review"` — do not need run-local glue either. After reviewing such
  a unit, add its record to `translations[]` with
  `reviewDecision: "translate"` plus the unit's `sourceHash`; `i18n-plan`
  selects the unit's existing executable selector and routes the reviewed
  target through the same guarded textPlan, replaceText, or replaceChartText
  artifacts. This applies equally to slide, slideLayout, and slideMaster
  review units and is counted under `summary.reviewedTranslationCount`. A review
  unit given `targetText` without `reviewDecision` stays a `review-target`
  conflict, and `reviewDecision` without `sourceHash` is rejected as
  `review-decision-unbound`. Do not hand-build replace-text inputs for
  reviewed units.

- Use top-level `xdoc pptx replace-chart-text --visible-cache-only` for chart
  title, series, category, and data-label translations, but feed it from
  `i18n-plan.replaceChartText` rather than handcrafted selectors. Its dry-run
  report lists `changedNodes[]`, `changedParts[]`, and `structureChecks[]`;
  block on any conflict, ambiguity, `formatCode` change, or failed structure
  check.
- The top-level helper natively handles classic charts and namespace-aware
  ChartEx direct/nested point text, plus generated default titles in both
  dialects. Never search the package for the literal `Chart Title` or hand-build
  a replacement for a generated title: consume the inventory selector and keep
  its `sourceState`, `chartDialect`, and `structureSignature` guards. Unknown
  extension structures and titles with any existing `tx` child remain
  preserve-only; do not bypass that boundary with a targeted OOXML fallback.
- Do not use the patch op `set-chart-text` as the default translation path:
  that op may synchronize embedded workbook labels and is intended for ordinary
  chart editing, not visible-cache-only i18n.
- If the planner or top-level helper cannot identify a unique visible cache
  node, do not ignore the chart. Refresh the scan, keep the unit in manual
  review, or use a targeted OOXML fallback only for visible cache text,
  followed by ZIP/XML validation, preview, and clean-open.
- Do not translate external workbook relationship targets or local filesystem
  paths; changing them can break links.

Tables require style-preserving cell-level handling:

- `inspect` may summarize a table as one object with no cell text. Use
  `i18nUnits` plus text export to build table cell translations.
- Prefer replacing the cell's existing text nodes while keeping `a:tcPr`,
  paragraph properties, and run properties intact. Use `set-table` cell text only
  when the cell has uniform formatting or the op is proven style-preserving.
- After translating table text, review PNGs because small header cells and
  formatted emphasis runs often overflow before `vision-check` catches the
  real rendered issue.

## Visual Parity Gate

A translation delivery must include a before/after visual review:

```bash
xdoc pptx preview source.pptx --slides <changed> \
  --output-dir <run-dir>/previews-source \
  --contact-sheet <run-dir>/previews-source/contact-sheet.png \
  --overwrite --json > <run-dir>/preview-source.json

xdoc pptx preview candidate.pptx --slides <changed> \
  --output-dir <run-dir>/previews-candidate \
  --contact-sheet <run-dir>/previews-candidate/contact-sheet.png \
  --overwrite --json > <run-dir>/preview-candidate.json

xdoc pptx contact-diff --source source.pptx --candidate candidate.pptx \
  --slides <changed> \
  --output <run-dir>/contact-diff.png --json > <run-dir>/contact-diff.json

node <skill-root>/scripts/pptx-nova-multi-column-review-gate.mjs \
  --candidate candidate.pptx \
  --vision-diff <run-dir>/vision-diff.json \
  --review <run-dir>/multi-column-review.json \
  --output <run-dir>/multi-column-review-gate.json \
  --overwrite --json

node <skill-root>/scripts/pptx-nova-compare.mjs \
  --source source.pptx \
  --candidate candidate.pptx \
  --run-dir <run-dir> \
  --kind translation \
  --slide-count <count> \
  --compare-chunk-size 20 \
  --output <run-dir>/translation-compare.png \
  --report <run-dir>/translation-compare.json \
  --dpi 192 \
  --fallback-dpi 144 \
  --cache-dir <run-parent>/.render-cache \
  --json

node <skill-root>/scripts/pptx-nova-compare-gate.mjs \
  --run-dir <run-dir> \
  --final-pptx translated.pptx \
  --final-pptx-source candidate.pptx \
  --kind translation \
  --publish \
  --overwrite \
  --json > <run-dir>/translation-compare-gate.json
```

Generate the review record instead of copying evidence metadata by hand:

```bash
node <skill-root>/scripts/pptx-nova-multi-column-review-scaffold.mjs \
  --candidate translated.pptx \
  --vision-diff <run-dir>/vision-diff.json \
  --preview <run-dir>/preview-candidate.json \
  --output <run-dir>/multi-column-review.json \
  --overwrite --json
```

When regenerating only evidence paths, add
`--carry-review-from <old-review.json>`. Judgments are copied as an all-or-nothing
operation only when candidate bytes, every PNG hash/dimension, the complete
slide/shape finding set, and the normalized path-independent vision identity all
match. Any mismatch leaves every entry pending and records the rejection reasons.

The scaffold helper verifies that candidate, vision-diff, and preview all refer
to the same final PPTX. It maps zero-based `vision-diff.slideIndex` values to
one-based preview slides, checks the manifest hash and dimensions against each
actual PNG, and creates one entry per required slide/shape pair. It deliberately
sets `decision: "pending"`, all checks to `false`, and leaves reviewer/note empty;
inspect the full-size PNG and fill those judgment fields before running the gate.
Do not edit the generated candidate, vision-diff, or PNG binding fields.

The generated file uses `pptx-nova-multi-column-review/v1`:

```json
{
  "schemaVersion": "pptx-nova-multi-column-review/v1",
  "candidate": {
    "path": "/absolute/run/candidate.pptx",
    "sha256": "sha256:..."
  },
  "visionDiff": {
    "path": "/absolute/run/vision-diff.json",
    "sha256": "sha256:..."
  },
  "reviews": [
    {
      "slideIndex": 8,
      "shapeId": 9,
      "reviewer": "human",
      "decision": "pass",
      "png": {
        "path": "/absolute/run/previews-candidate/slide-009.png",
        "sha256": "sha256:...",
        "width": 1920,
        "height": 1080
      },
      "checks": {
        "noClipping": true,
        "columnFlowReadable": true,
        "noOverlap": true,
        "marginsAcceptable": true
      },
      "note": "Reviewed at full PNG resolution; translated copy fits both columns."
    }
  ]
}
```

This is a narrow combined gate. A final `vision-diff.agentGate.passed=false`
may be closed only when every new or worsened high/medium blocker is exactly
`multi-column-text-layout-review` and
`multi-column-review-gate.json.agentGate.passed=true`. The helper fails closed
when candidate, `vision-diff`, or PNG hashes are stale; when PNG dimensions or
slide/shape coverage do not match; or when any required manual check is not
true. It never exempts `multi-column-text-overflow`, `text-overflow-estimate`,
`geometry-overlap`, `text-edge-margin`, or any other new/worsened high or medium
issue. If no multi-column review finding exists, use the ordinary
`vision-diff.agentGate` result and do not create a speculative review record.

Treat `contact-diff.agentGate.passed=false` as a review artifact blocker:
the PNG did not contain complete source/candidate pairs for the requested
scope. `agentGate.passed=true` means the scoped contact sheet is safe for
human visual review, not that visual parity is automatically approved. Before
final delivery, rerun without `--slides` when full-deck before/after parity is
required.

Treat the translation comparison as a delivery artifact, not merely internal
QA. Decks up to 20 slides keep the compatible single `translation-compare.png`.
Larger decks produce numbered `translation-compare-01.png`, `-02.png`, ...
parts plus a `pptx-nova-compare-manifest/v1` report. Every part places the
source page on the left and translated page on the right, starts at 192 DPI,
and may retry once at 144 DPI only after an explicit retryable `RenderError`.
Any second or non-retryable failure blocks delivery. Do not upscale a failed
low-resolution image after rendering.

The compare helper uses a shared content-addressed cache by default at
`<run-parent>/.render-cache`. Its key binds source bytes, candidate bytes,
slide selector, DPI, and the xdoc executable bytes. A valid hit copies the
already validated PNG, rebinds report paths to the current run, and records
`cache.status="hit"`; corrupt, partial, or mismatched entries are ignored and
rendered again. Use `--cache-dir` to choose a stable shared location or
`--no-cache` for diagnostic rerenders. Cache hits count as zero render
invocations in performance summaries.

The same cache root also contains `page-bitmap-v1` entries keyed by
`(pptxSha256, slide, dpi, rendererVersion)`. The 192 DPI candidate preview
populates these entries; multipart compare reuses those candidate pages and
populates each source page once. Both the page cache and the validated pair-level
cache survive a failed finalize run. Corrupt page entries are ignored and repaired;
144 DPI retries use a separate key space.

With `--json`, `pptx-nova-compare.mjs` writes the same report to stdout that it
writes to `--report`. For multipart runs (deck larger than the chunk size) this
is the `pptx-nova-compare-manifest/v1` manifest; single-PNG runs emit the
underlying contact-diff report instead and have no `parts[]`. Manifest
`parts[]` entries use these keys (there is no `part` or per-part `status`
field; part success is implied by presence plus `agentGate`):

```json
{
  "schemaVersion": "pptx-nova-compare-manifest/v1",
  "status": "success",
  "parts": [
    {
      "partNumber": 1,
      "selector": "1-20",
      "slides": [1, 2, "... up to 20 slide numbers"],
      "pairCount": 20,
      "dpi": 192,
      "width": 7680,
      "height": 43200,
      "path": "<run-dir>/translation-compare-01.png",
      "reportPath": "<run-dir>/translation-compare-01.json",
      "byteLength": 12345678,
      "sha256": "sha256:...",
      "agentGate": { "passed": true },
      "attempts": [{ "dpi": 192, "status": "success" }]
    }
  ],
  "coverage": { "missingSlides": [], "duplicateSlides": [], "outOfRangeSlides": [] },
  "agentGate": {
    "passed": true,
    "status": "pass",
    "pairCount": 48,
    "partCount": 3,
    "requiresHumanReview": true
  }
}
```

JSONL progress events (`compare-part-complete`) use the same `partNumber` /
`partCount` naming as the final manifest.

After the comparison set passes validation, publish the final PPTX and the
single PNG or complete numbered sibling set as one delivery bundle so reviewers
can find it without opening the run directory. Preserve the run-directory
manifest, part reports, and PNGs as audit evidence. Run
`pptx-nova-compare-gate.mjs --kind translation --publish --final-pptx-source
<candidate>` after the candidate is stable, and block delivery unless
`translation-compare-gate.json.status` is `pass` and
`finalBinding.status=bound`. The gate rejects scoped final reports, requires
complete non-duplicated slide coverage, verifies xdoc's candidate SHA-256,
publishes compare siblings before the final PPTX, and re-hashes every
destination. Do not copy or overwrite the final PPTX after the gate passes.

Review the changed-slide contact sheets and the full-size PNGs for:

- text clipped by its shape or table cell
- translated labels touching neighboring labels
- any geometry repair causing shape overlap, cramped spacing, edge contact, or
  collision with chart/table labels, footer, page number, or decorative chrome
- line breaks that change the intended hierarchy
- text that lost bold, italic, underline, strikethrough, color, or alignment
- chart legend/category labels becoming unreadable
- cards, tables, and diagrams no longer matching the source rhythm
- `_x000D_` or escaped control characters introduced by patch text

The final summary should state whether the source/candidate layouts are highly
consistent and list any deliberate text compression.

## Final Artifacts

Keep these translation-specific artifacts in the run directory when available:

- `translations.json`
- `i18n-plan.json`
- `replace-text-input.json`
- `replace-text.json`
- `replace-chart-text-input.json`
- `replace-chart-text-dry-run.json`
- `replace-chart-text.json`
- `patch.json`
- `patch-dry-run.json`
- `i18n-text-plan.json`
- `i18n-scan-source.json`
- `i18n-chart-decisions.json` and `i18n-scan-classified.json` when chart review units exist
- `i18n-chart-classification.json` when chart review units exist
- `i18n-scan-candidate.json`
- `bilingual-translation-audit.md`
- `bilingual-translation-audit.json`
- `i18n-style-diff.json`
- source and candidate inspect reports
- dry-run/apply reports
- `vision-diff.json`
- `multi-column-review.json` when final `vision-diff` reports changed multi-column text
- `multi-column-review-gate.json` when a multi-column review record is required
- candidate `vision-check` reports when used for diagnostics
- source/candidate previews and contact sheets
- `contact-diff.json` and `contact-diff.png`
- `translation-compare.png` or numbered `translation-compare-*.png` parts
- `translation-compare.json`
- `translation-compare-gate.json`
- `pptx-diff.json`
- `clean-open.json`
