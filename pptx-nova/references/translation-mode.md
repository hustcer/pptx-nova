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
otherwise:

- text bold / italic / underline / strikethrough
- paragraph alignment, bullets, indentation, line spacing, tab stops, columns
- text box geometry, margins, auto-fit, vertical alignment, rotation
- run color, font face, hyperlinks, speaker notes, animations, transitions
- table cell style, chart style, shape fills/lines/effects, z-order

Only font size may be adjusted as an automatic layout repair, and only after
preserving the translation meaning. Record every font-size adjustment in the
bilingual audit. If a translation still does not fit after reasonable font-size
adjustment, shorten the wording without changing meaning and record it as
`meaning-preserving compact wording`.

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
   - OOXML text node scan for `<a:t>`, `<c:v>`, `<cx:pt>`, and chart/title
     caches that `inspect` may not expose.
4. Build `translation-map.json` with one record per translatable unit:
   `slide`, `object kind`, stable selector or OOXML target, source text,
   translated text, length ratio, fitting risk, and style-preservation method.
5. Copy the source PPTX into the run directory and use that copy as the first
   candidate. Do not reconstruct slides, duplicate objects, or generate new
   text boxes for existing content.
6. Replace text in place while preserving OOXML structure:
   - Prefer run/text-node replacement that changes only `<a:t>`, `<c:v>`,
     `<cx:pt>`, or equivalent visible cache text, leaving neighboring
     `a:rPr`, `a:pPr`, `a:bodyPr`, table cell properties, and chart styling
     untouched.
   - Preserve run boundaries when they encode style. If one source sentence is
     split across multiple styled runs, either distribute the translation across
     the existing runs or use the dominant run only after proving the source
     runs share the same style.
   - Preserve hyperlink runs and field runs. Do not remove `<a:hlinkClick>`,
     `<a:fld>`, footer/date/page number placeholders, or speaker-note
     structure while translating visible labels around them.
   - Use `replace-chart-text` for chart title, series, and categories only when
     dry-run proves the chart has a supported data shape and the op preserves
     chart formatting. Otherwise use a targeted OOXML cache-text fallback and
     validate with ZIP/XML, preview, and clean-open.
   - Use `set-text`, `set-table-cell`, or other high-level text ops only for
     uniform-format objects, or when the op has a style-preservation report that
     proves bold/italic/underline/strike/alignment and run formatting survive.
7. Dry-run when using xdoc patch ops. For direct OOXML fallback, write a
   machine-readable replacement report and run ZIP/XML validation immediately
   after packaging.
8. Run the native translation style gate and block on any non-size style
   change:
   ```bash
   xdoc pptx i18n-style-diff \
     --source source.pptx \
     --candidate candidate.pptx \
     --json > <run-dir>/i18n-style-diff.json
   ```
   For scoped repair loops, add `--slides <changed>`, then rerun the full-deck
   gate before delivery. Treat `agentGate.passed=false` or non-empty
   `blockers[]` as delivery blockers. Font-size-only differences are allowed
   only when they appear under `allowedChanges.fontSize[]` and are recorded as
   layout repair in the bilingual audit.
9. Scan the candidate for remaining visible source-language text. Treat
   theme font names, language tags, and external relationship paths as metadata
   unless the user explicitly asks to localize them.
10. Run scoped and full visual gates:

- `vision-check` on changed slides.
- Source and candidate PNG/contact sheets for changed slides.
- `contact-diff` for before/after layout consistency.

11. Fix visual regressions at the translation source:

- First adjust font size within the original visual hierarchy.
- If the text still does not fit, preserve meaning with concise wording.
- Do not move objects, split pages, change font weight/style, or shrink fonts
  below readability thresholds just to avoid editing the translation.

12. Write `bilingual-translation-audit.md` and `.json` with source text,
    target text, and notes for any meaning-preserving compression.
13. Run structure checks, `pptx diff`, preview, and clean-open when available.
14. Publish the validated candidate to the requested output path.

## Style Signature Gate

`xdoc pptx i18n-style-diff` is mandatory for translation delivery. It
compares source and candidate PPTX parts using textless OOXML style signatures:
visible text-node content is ignored, while run, paragraph, textbox, table,
chart, relationship, animation, theme, layout, and master structure remains in
the signature.

Required interpretation:

- `status=pass` and `agentGate.passed=true`: style gate passed.
- `blockers[]` non-empty: stop and repair the candidate before any visual
  delivery.
- `allowedChanges.fontSize[]` non-empty: acceptable only for fitting repair;
  record the reason and keep the source meaning unchanged.
- Missing or added style-relevant parts are blockers.
- A failure in slide/chart relationship parts means possible hyperlink or
  embedded-object loss; do not waive it based only on PNG appearance.

This gate does not prove translation completeness or rendered fit. It must be
paired with bilingual text audit, source-language scan, preview/contact-diff,
and visual review.

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
- Always compare `xdoc convert --to text` and an OOXML text-node scan against
  `inspect`; any source-language text found only in chart parts still needs a
  translation plan.
- Use `replace-chart-text` only when dry-run proves the chart has a supported
  data shape. If it fails because externalData does not target an embedded
  workbook, do not ignore the chart. Record the limitation and use a targeted
  OOXML fallback only for visible cache text, followed by ZIP/XML validation,
  preview, and clean-open.
- Do not translate external workbook relationship targets or local filesystem
  paths; changing them can break links.

Tables require style-preserving cell-level handling:

- `inspect` may summarize a table as one object with no cell text. Use OOXML or
  text export to build table cell translations.
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
  --output <run-dir>/contact-diff.png --json > <run-dir>/contact-diff.json
```

Review the changed-slide contact sheets and the full-size PNGs for:

- text clipped by its shape or table cell
- translated labels touching neighboring labels
- line breaks that change the intended hierarchy
- text that lost bold, italic, underline, strikethrough, color, or alignment
- chart legend/category labels becoming unreadable
- cards, tables, and diagrams no longer matching the source rhythm
- `_x000D_` or escaped control characters introduced by patch text

The final summary should state whether the source/candidate layouts are highly
consistent and list any deliberate text compression.

## Final Artifacts

Keep these translation-specific artifacts in the run directory when available:

- `translation-map.json`
- `bilingual-translation-audit.md`
- `bilingual-translation-audit.json`
- `i18n-style-diff.json`
- source and candidate inspect reports
- remaining source-language scans
- dry-run/apply reports
- `vision-scoped.json`
- source/candidate previews and contact sheets
- `contact-diff.json` and `contact-diff.png`
- `pptx-diff.json`
- `clean-open.json`
