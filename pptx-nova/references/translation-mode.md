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
   translated text, length ratio, and fitting risk.
5. Generate a minimal patch. Prefer stable selectors and semantic ops:
   - `set-text` for text boxes and simple shapes.
   - `set-table-cell` for table cells.
   - `replace-chart-text` for chart title, series, and categories when it
     dry-runs cleanly.
6. Dry-run, apply, and inspect the candidate.
7. Scan the candidate for remaining visible source-language text. Treat
   theme font names, language tags, and external relationship paths as metadata
   unless the user explicitly asks to localize them.
8. Run scoped and full visual gates:
   - `vision-check` on changed slides.
   - Source and candidate PNG/contact sheets for changed slides.
   - `contact-diff` for before/after layout consistency.
9. Fix visual regressions at the translation source:
   - First preserve meaning with concise wording.
   - If meaning would be lost, adjust text box size or font size within the
     existing visual hierarchy.
   - Do not move objects, split pages, or shrink fonts below readability
     thresholds just to avoid editing the translation.
10. Write `bilingual-translation-audit.md` and `.json` with source text,
    target text, and notes for any meaning-preserving compression.
11. Run structure checks, `pptx diff`, preview, and clean-open when available.
12. Publish the validated candidate to the requested output path.

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

Tables require cell-level handling:

- `inspect` may summarize a table as one object with no cell text. Use OOXML or
  text export to build table cell translations, then patch with
  `set-table-cell`.
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
- source and candidate inspect reports
- remaining source-language scans
- dry-run/apply reports
- `vision-scoped.json`
- source/candidate previews and contact sheets
- `contact-diff.json` and `contact-diff.png`
- `pptx-diff.json`
- `clean-open.json`

