# Diagnose fidelity without changing authored intent

Use this reference when an existing deck looks wrong after export, a renderer
upgrade changes pixels, or an edit appears to introduce a visual regression.
The goal is to distinguish document changes, renderer behavior and environment
differences before choosing an authorized deck repair.

## Fix the evidence boundary

Record source/candidate SHA-256, slide/object, exact xdoc binary identity,
fonts, DPI and actual export/capture method. Re-render the original bytes with
the current runtime first. Render before/after with the same environment.
Use a contact sheet to locate patterns, then inspect full pages and affected
crops. A shared symptom across pages may have one cause; independent data and
layout problems on one page may need separate findings.

Native PDF, static PNG, Web playback and PowerPoint export are different
consumers. Record the consumer actually tested. PowerPoint PDF-export-then-render
is not a slide-show screenshot; an automatic fallback must report its actual
method. Reuse an independent reference only while its source bytes and relevant
Office/environment identity remain valid.

When PowerPoint PDF export omits hidden slides, logical slide numbers differ from
PDF page numbers. Retain the snapshot's `pdf_pages` mapping; a requested hidden
slide absent from that export has no PDF evidence. A page-count mismatch is a
failed identity check, not a reason to reuse the nearest page.

## Preserve distinctions that affect rendering

| Content         | Inspect before modifying                                                                                                                                                                                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text            | Theme/master/layout/paragraph/run inheritance; omitted values versus explicit overrides; authored autofit, wrap and overflow; mixed-script fonts, bidi, casing, bullets, baseline and line metrics. A clipped fragment or hidden highlight is not necessarily lost text. Check actual zoom/DPI before trusting browser overflow measurements. |
| Charts          | Category slot and point index, sparse/missing/hidden values versus zero, linked number formats, axis crossings and degenerate domains, series connectivity/smoothing, marker and explicit no-fill, pie displacement and frame bounds. Do not compact sparse arrays, recreate a chart or convert to an image merely to improve the preview.    |
| Tables          | Explicit grid dimensions, group transforms, inherited versus explicit borders and cell picture mapping. Preserve the authored grid rather than resizing from a screenshot alone.                                                                                                                                                              |
| Pictures/shapes | Crop versus frame, saved connector routes, gradient focus and geometry, pattern scale, picture mapping, stroke/endpoints, grayscale/duotone, and nested SVG clip coverage. An intentionally empty vector is distinct from failed artwork; inspect diagnostics before inserting a replacement image.                                           |
| Equations       | Editable OMML host layout and run semantics as well as equation bounds. A PDF layout difference does not authorize replacing the formula with a raster image.                                                                                                                                                                                 |
| Package/copy    | Owner-specific master themes, chart workbooks, notes and relationships. Resolve actual relationship targets; do not assume standard part filenames or deduplicate resources solely because they look equal. Run the existing copy preflight and semantic gates plus disclosed compat package-integrity evidence.                              |

These are diagnostic distinctions, not a claim that every construct is
authorable or rendered identically to Office. Query the exact capability and
operation schema before selecting a repair. Rendering fixes do not expand
authoring support.

For the affected content, extend the check without rewriting the source:

- Histograms: retain raw repeated observations, interval closure and precise
  boundaries; counts must match the reported intervals. Stock high/low lines and
  surface height-band legends carry data meaning. Hidden ChartEx axes/gridlines
  and transparent strokes must not be restored merely to match an older preview.
- Text/tables: distinguish ordinary-shape defaults from placeholder inheritance,
  whole-table style from missing second-band styles, and solid glyph outlines from
  text fill or shape borders. Include OMML outlines when inspecting math text.
- Images/vectors: preserve video-poster frame versus crop, authored SVG stretch,
  Unicode text, stroke coordinate systems and clipping. EMF/WMF recording canvas,
  restored device context and cosmetic hairlines can explain changes after an upgrade.
- Fonts/playback: browser/SDK Calibri fallback may use Carlito when Calibri is
  unavailable; this is not a reason to rename the deck's authored font or a promise
  about native font resolution. Record resolved fonts. Character Morph playback
  has its own text-ownership behavior; static exports do not certify it.

Recent rendering changes also require these distinctions when reviewing the same bytes:

- Text/effects: preserve leading, repeated and trailing spaces, implicit versus
  explicit-zero kerning, authored gradients across adjacent equivalent runs,
  glyph glow and line-scoped colored reflections. Shape shadow/glow/soft-edge/
  reflection paint has separate geometry and clipping from glyph effects.
  Do not split runs, insert spaces or disable effects to imitate an old export.
- Fonts: record the actual resolved family/style and TTC face when disclosed,
  including Office aliases and Apple TrueType sources. A valid font file, an
  authored font declaration and an embedded PDF font are different facts.
- SmartArt: distinguish cached drawing precedence from supported cacheless
  linear-process/organization projections; keep semantic hierarchy, assistant
  branches, node/connector identities, theme paint and authored label metrics.
  A newly visible projection does not grant SmartArt authoring or universal
  layout support. Compare with the original and current capability evidence.
- Charts: examine stock category slots/markers, bubble size, hierarchy colors,
  treemap typography/plot area and 3D camera/aspect/axis/label/lighting rules.
  Automatic defaults and explicit overrides differ; do not force a generic
  chart font size or flatten 3D data to match old preview pixels. For histograms,
  retain observations and verify Office acceptance of authored bin width/count,
  not just the histogram image or a nominal XML schema pass.
- Media/3D/playback: retain authored audio icons, shape/text 3D camera and volume
  declarations, and existing wipe/Morph/chart/SmartArt timing. Improvements in
  one renderer do not change inspect/edit/preserve/verify axes. Check actual
  per-object output and independent PowerPoint evidence; do not label remaining
  camera, material, text or playback discrepancies as certified fidelity.

## A small experiment should answer one question

Keep the input and control unchanged. State the predicted result, change one
semantic variable in a new candidate, and use normal schema → dry-run → apply
→ inspect/check evidence. Retain failed experiments and rejected hypotheses.
When a diagnostic supplies a guarded remediation, follow `troubleshooting.md`;
do not apply a suggestion that changes the user's intended content.

If raw OOXML is genuinely necessary, follow `control-flow-and-raw-xml.md`.
Preserve child order, namespaces, unique IDs, relationship/content-type coverage
and valid OPC membership. Keep logs and reports outside the package. A probe
that PowerPoint repairs is an invalid control, not proof that the source deck
or renderer is broken. Preserve the failed package and diagnose structure first.
Independent OOXML validation, when available, complements clean-open evidence;
an unavailable validator or an unperformed Office check is never a pass.

Classify findings as a semantic defect, an evidenced rendering approximation,
an environment difference, or an unexplained observation. Do not call an
unexplained discrepancy a known approximation. Numeric pixel differences alone
neither prove a bug nor justify a universal tolerance. Validate representative
pages during diagnosis, then the full scope required by the task after the
candidate is stable. Report remaining differences and their evidence; use
`feedback-mode.md` when feedback was requested.
