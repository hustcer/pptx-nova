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
`set-text` or `set-table-cell` can rebuild text bodies or runs and may destroy
mixed formatting. Use them only when dry-run plus rendered before/after review
proves the target object has uniform formatting or the operation preserves the
relevant OOXML style properties.

## Standard Flow

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
       --json > <run-dir>/i18n-scan-source.json
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
     --json > <run-dir>/i18n-plan.json
   ```

   `i18n-plan` validates `unitId`, `sourceHash`, and `sourceText`, then routes
   units to the safest available execution primitive:
   - `textPlan.translations[]` for DrawingML paragraph/run planning.
   - `replaceText.replacements[]` for user-visible text attributes.
   - `replaceChartText.replacements[]` for chart visible cache labels.
   - `patch.ops[]` for generated run-level `set-run` operations.

   Treat `applyGate.passed=false`, non-empty `conflicts[]`, non-empty
   `missingTranslations[]`, or apply-blocking `reviewRequired[]` as an
   automation blocker. Add missing translations, refresh stale source hashes,
   add reliable styled-token anchors, broaden shared-part scope, or route the
   item to manual review before applying changes.

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
     `attrName`, or `index`.
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
   - For DrawingML shape/table paragraphs, apply only the `set-run` patch ops
     emitted under `i18n-plan.patch.ops[]`. Each paragraph patch op must carry
     `unitId`, `sourceText`, and `sourceHash` guards.
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
   - Preserve run boundaries when they encode style. If one source sentence is
     split across multiple styled runs, follow the plan strategy:
     `uniform`, `preserve-run-boundaries`, or
     `preserve-styled-token-boundaries`. If the plan returns
     `review-required`, do not collapse the paragraph into one run.
   - Preserve hyperlink runs and field runs. Do not remove `<a:hlinkClick>`,
     `<a:fld>`, footer/date/page number placeholders, or speaker-note
     structure while translating visible labels around them.
   - Use `set-text`, `set-table-cell`, or other high-level text ops only for
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
10. Scan the candidate for remaining source-language text with the native gate:
    ```bash
    xdoc pptx i18n-scan \
      --source candidate.pptx \
      --source-lang <source-lang> \
      --mode candidate \
      --json > <run-dir>/i18n-scan-candidate.json
    ```
    Treat `agentGate.passed=false` or non-empty `blockers[]` as delivery
    blockers. `visibleBody`, `visibleTextAttr`, and `chartVisibleCache` are
    blocker classes in candidate mode. `embeddedWorkbook` appears under
    `reviewRequired[]` and needs chart/workbook sync review, but is not a
    default blocker. Preserve `themeFontMetadata`, `relationshipPath`,
    `shapeInternalName`, and `chartMetadata` unless the user explicitly asks to
    localize or relink them.
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
- `vision-check` on the candidate changed slides as a diagnostic report, not as
  the primary pass/fail gate when the source deck is already noisy.
- Source and candidate PNG/contact sheets for changed slides.
- `contact-diff` for before/after layout consistency.
- A high-DPI full-deck translation comparison PNG for delivery. During repair
  loops you may pass `--slides <changed>` to the helper for local review, but
  the final delivery artifact must be generated without `--slides` so one image
  contains every slide in source/candidate order.

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
15. Publish the validated candidate and copy `translation-compare.png` next to
    the final PPTX using `<output-stem>-translation-compare-<MMDDhhmmss>.png`.
    Keep the run-directory comparison PNG/JSON as audit evidence, and clearly
    list both the final PPTX and sibling comparison PNG in the final response.

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

Required interpretation:

- `applyGate.passed=true`: the generated `replaceText`, `replaceChartText`,
  and `patch.ops` artifacts may be dry-run and applied to the copied candidate
  deck.
- `conflicts[]` non-empty: stop automation. Typical causes are unknown
  `unitId`, stale `sourceHash`, source text mismatch, or a target supplied for a
  preserve-only unit.
- `missingTranslations[]` non-empty: translate the missing `action=translate`
  units before applying.
- `reviewRequired[]` with `blocksApply=true`: add anchors, broaden shared-part
  scope, or handle the unit manually before applying.
- `deliveryGate.passed=false`: this is expected when non-applied review signals
  remain. It means final delivery still needs candidate scan, style diff,
  preview/vision review, and text overflow checks.

The lower-level `xdoc pptx i18n-text-plan` remains an execution primitive and
debugging fallback for DrawingML shape/table text. Its strategies mean:

- `uniform`: a single source run receives the full target text.
- `preserve-run-boundaries`: source runs share the same style; the first run
  receives the target and continuation runs are cleared while style nodes
  remain.
- `preserve-styled-token-boundaries`: styled anchors remain in their original
  runs and surrounding translated text is assigned to adjacent plain runs.
- `review-required`: stop automation for that unit. Add explicit anchors,
  produce a manual run-level mapping, or request human review.

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
- Use top-level `xdoc pptx replace-chart-text --visible-cache-only` for chart
  title, series, category, and data-label translations, but feed it from
  `i18n-plan.replaceChartText` rather than handcrafted selectors. Its dry-run
  report lists `changedNodes[]`, `changedParts[]`, and `structureChecks[]`;
  block on any conflict, ambiguity, `formatCode` change, or failed structure
  check.
- Do not use the patch op `replace-chart-text` as the default translation path:
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
  paragraph properties, and run properties intact. Use `set-table-cell` only
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

node <skill-root>/scripts/pptx-nova-translation-compare.mjs \
  --source source.pptx \
  --candidate candidate.pptx \
  --run-dir <run-dir> \
  --output <run-dir>/translation-compare.png \
  --report <run-dir>/translation-compare.json \
  --dpi 192 \
  --json
```

Treat `contact-diff.agentGate.passed=false` as a review artifact blocker:
the PNG did not contain complete source/candidate pairs for the requested
scope. `agentGate.passed=true` means the scoped contact sheet is safe for
human visual review, not that visual parity is automatically approved. Before
final delivery, rerun without `--slides` when full-deck before/after parity is
required.

Treat `translation-compare.png` as a delivery artifact, not merely an internal
QA image. It must be a single PNG, include all source and candidate slides,
place the source page on the left and the translated page on the right for
every row, and be rendered at high enough DPI for zoomed inspection. The helper
defaults to 192dpi and writes `translation-compare.json`; block delivery if the
report is missing, `status` is not `success`, `pageCount` does not match the
source/candidate slide count, `byteLength` is zero, or the image dimensions are
implausibly small. If a specific run needs higher visual fidelity, increase
`--dpi` rather than enlarging a low-resolution image after rendering.
After the comparison image passes validation, publish a copy next to the final
PPTX output so reviewers can find it without opening the run directory. Use the
final PPTX stem plus a collision-safe timestamp suffix, for example
`<output-stem>-translation-compare-<MMDDhhmmss>.png`, while still preserving the
run-directory `translation-compare.png` and `translation-compare.json` as audit
evidence.

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
- `i18n-scan-candidate.json`
- `bilingual-translation-audit.md`
- `bilingual-translation-audit.json`
- `i18n-style-diff.json`
- source and candidate inspect reports
- dry-run/apply reports
- `vision-diff.json`
- candidate `vision-check` reports when used for diagnostics
- source/candidate previews and contact sheets
- `contact-diff.json` and `contact-diff.png`
- `translation-compare.png`
- `translation-compare.json`
- `pptx-diff.json`
- `clean-open.json`
