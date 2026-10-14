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

For Web evidence, also record the actual Viewer/renderer build and loaded source
or bundled entry; `xdoc --version` does not identify the code running in a browser.
Capture after fonts are ready and layout has settled, at a recorded display scale.
When validating an upgrade, confirm the page loads the intended current build;
an old bundle cannot verify new renderer behavior.

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
- Resized cached SmartArt: distinguish a stale cache viewport from authored node
  positions. Supported, proven process/cycle/composite profiles may reflow inside
  the current host while retaining cached paint, resources, model identity and
  ordering; unsupported, authored, incomplete or ambiguous caches stay preserved.
  Compare node font fitting separately from geometry, including enclosing groups.
  Rendering reflow does not rewrite the source cache, grant SmartArt editing or
  remap document-root animation targets; verify those targets independently.
  Cache/data text identity includes decoded whitespace, paragraph boundaries and
  explicit breaks. Run/style splits alone do not change identity, but flattened
  text equality does not prove it. Stale text or ambiguous child order must retain
  the cache; do not force a reflow by normalizing or replacing the labels.
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

## Text, table and chart changes in the same source

Read only the matching diagnostic when these symptoms occur:

- **Fonts/placeholders:** concrete authored fonts are distinct from an unreferenced
  theme script inventory; ordinary text boxes do not borrow master `otherStyle`
  fonts. An explicit placeholder index matches the layout exactly; a failed match
  does not borrow another same-type shape. Omitted indices and the master-only
  sentinel have different inheritance. Preserve explicit zero-size frames and
  global text defaults. See `inspect-and-edit.md` before patching identity/fonts.
- **Columns/line breaks:** text boxes and ordinary shapes retain authored count
  and gap. Group transforms change geometry, but absolute body insets, column gaps,
  paragraph indents, run tracking and bullet metrics remain absolute; do not scale
  those values again to compensate for a resized group. Web/PDF fill the authored
  usable height before advancing; ordinary overflow can grow a shared column block, whereas explicit
  clip/ellipsis keeps the authored height. Check all columns, paragraph gaps and
  vertical alignment at final fonts. A line can fit even when its trailing
  paragraph gap does not; do not move that line to the next column or enlarge the
  frame based on the gap alone. Rendered overflow does not mean the frame was
  resized or multi-column shape-autofit became authorable. ASCII hyphen break-after
  opportunities can change line wrapping without changing text; do not insert
  manual line breaks to restore old pixels.
- **Unicode/numeric breaks:** preserve the source code points and styled run
  boundaries while diagnosing wrapping. ZWSP (`U+200B`) supplies an explicit
  break; WORD JOINER (`U+2060`) and in-text FEFF (`U+FEFF`) inhibit adjacent
  breaks, including emergency splitting. An explicit ZWSP opportunity takes
  precedence over a following joiner. Unicode hyphen (`U+2010`), nonbreaking
  hyphen (`U+2011`), soft hyphen (`U+00AD`) and mathematical minus (`U+2212`)
  are distinct; do not replace them all with ASCII `-` or promise identical
  rendering. Numeric decimal/grouping separators must stay with their numeric
  token and, during emergency splitting, with the preceding digit. PDF handles
  Unicode decimal digits as well as ASCII/fullwidth digits; verify the actual
  Web consumer separately. Path slash opportunities and numeric date slashes
  also differ. Use a narrow-frame control with a style boundary at the affected
  character; do not remove controls or insert manual breaks to fix a preview.
  Inspect/source-guard text must remain exact. PDF extraction may omit invisible
  controls or insert layout line breaks, so it cannot prove source preservation.
  Check plain and styled runs independently, including FEFF advance and
  discretionary soft-hyphen paint. Passing a ZWSP control does not certify
  ordinary hyphen/path runs or Office's line breaks. If those controls differ,
  retain both outputs and the source; do not merge runs, delete controls or
  rewrite punctuation to hide the discrepancy.
- **Math/SVG glyphs:** attributed OMML `m:t`, including `xml:space`, must retain
  its text. Inspect nested fraction/subscript content independently of math metrics.
  Local SVG text uses its own inline/inherited font styles and needs PDF glyph
  sources; browser font readiness alone is insufficient. Follow `formulas.md` and
  the font-evidence guidance in `export-and-check.md`.
- **Table edges:** use the effective bottom edge above/right edge on the left,
  including explicit noFill, and paint each physical boundary once. Merged-cell
  continuation perimeter paint survives while internal merged edges disappear;
  CSS border arbitration or overpaint from an older export is not the authority.
  Follow `tables.md` before changing borders, dash lengths or merges.
  For Web-only offsets, wait for mounting, visibility, final fonts and measured
  row/cell redistribution; capture again after those stages. Border overlays
  follow actual cell edges, not just the initial declared grid. A pre-layout or
  hidden-slide capture does not justify editing row heights or adding lines.
- **Chart domains/direction:** automatic line domains include error endpoints;
  overlap differs from stack accumulation; horizontal category direction affects
  slots and legend identity. Bubble domains use valid points and scale-dependent
  padding; explicit bounds remain authoritative. Horizontal 3D bars project axes,
  geometry, labels and gridlines together. See `charts.md`; do not reorder data,
  force zero or flatten 3D solely to match an old renderer.
- **Idle video posters:** on a current Web build, a video with an authored poster
  can hide controls at rest and reveal them on hover/focus/touch. Compare idle and
  interactive states separately, including click/key isolation from slide navigation.
  Static poster evidence does not prove playback or timing support; do not replace
  the poster to compensate for old browser chrome.

## Current-runtime checks after an upgrade

Use these only for the affected content; compare original and candidate with the same runtime.

- **Text inheritance and fields:** list counters depend on level and effective numbering
  type/start; advancing a parent resets child counters. List-marker paint can follow the first
  run. Explicit normal weight, underline-off and strike-off differ from omission; double
  underline and double strike are independent. Placeholders paint at their owning level, so a
  removed duplicate is not necessarily lost content. Supported short-date fields refresh from
  one operation-local calendar date and effective language; cached field text, ordinary text
  and displayed date are different evidence. Freeze `--field-date YYYY-MM-DD` across manual
  comparisons and check `renderContext`; standard runners retain `render-context.json` for
  resume. Date changes must invalidate cached visual evidence. Keep the native field unless
  the user asks to replace it with static text.
- **Clipping and line breaks:** horizontal overflow is independent of vertical overflow,
  including inherited settings and rotated frames. Verify visible text and link hit regions in
  the local text frame; preserve surrounding fill/outline and sibling objects. Internal colons
  stay attached during wrapping. Inspect whole emoji clusters (ZWJ sequences, modifiers and
  flags), including styled-run boundaries, rather than replacing missing components with
  separate glyphs. PDF bitmap fallback and Web font fallback need their own evidence.
- **SmartArt:** complete cached pyramids may fit a resized host only when the current parser
  admits the cache's identity, layout and ordering. Incomplete or ambiguous caches remain
  preserved. Axis-aligned cached text frames can overhang shape bounds and take precedence over
  preset guides; unsupported transforms need their fallback. Supported organization layouts
  fit implicit margins with the fitted font, while explicit body margins stay absolute through
  nested/nonuniform group transforms. Do not reset margins or rewrite cache XML from a preview.
- **Chart data and formatting:** retain blank stacked-line contributions and error-slot
  continuity, histogram raw observations/bin count and per-bin count labels, hierarchy depth
  and authored leaf labels. Number-format quotes/escapes, literal percent signs, Unicode
  currency affixes, zero/negative sections and standalone `General` have distinct meanings;
  compare displayed labels with underlying values, including large numbers and rounding ties.
  Do not rewrite values or format codes to imitate an old label. Radar scale/legend layout,
  independent fill alpha, stock up/down defaults, point-specific circular/scatter paint,
  axis-title space, negative-value headroom and log/reversed surface axes also affect pixels.
  Omitted 3D bar views use family-specific defaults; explicit camera/paint remains distinct.
  Lossless numeric fallback can lengthen labels without changing data. Extreme finite histogram
  samples must keep finite bounds/counts; automatic surface endpoints may lose phantom bands,
  while explicit or observation-bearing narrow tails remain. Use `charts.md`'s numeric checks
  before rounding values, pinning automatic axes or merging apparently equal legend labels.
- **Tables:** regional style inheritance and shared grid resolution precede cell overrides;
  an absent border can recover the default grid while explicit no-fill remains intentional.
  Check merged perimeters and explicit overrides before adding borders or replacing the table.
- **Equations:** preserve explicit n-ary limit placement, display-style operator size,
  Word run properties inside OMML, singleton child collections and equation-array delimiter
  ownership. Missing-glyph fallback metrics can change bounds across renderers. Rendering an
  imported equation does not expand the native formula-authoring subset in `formulas.md`.
- **Paint and playback:** picture opacity/outward outlines, inherited stroke geometry,
  unequal-ellipse arc angles, curved/short-path markers, physical pattern sampling, tile
  mirroring, gradient weights and rounded/reflection clips can change without source edits.
  SVG non-scaling strokes use the assigned viewport. Check these at matched scale. In Web
  Presenter, test authored navigation, pending animation builds, available-frame fitting and
  a fresh-show history reset separately; a static export cannot prove those interactions.

## Chart, SmartArt and effect regressions

For chart-label regressions, read the inheritance checklist in `charts.md`:
omitted, explicit false and explicit true are distinct for label deletion;
automatic circular-label placement and explicit no-fill lines also need separate
checks. Do not reconstruct a chart to compensate for old rendering behavior.

For SmartArt and text-effect regressions after an upgrade:

- Keep cached-drawing resources tied to the drawing part and cacheless diagram
  images/hyperlinks tied to their owning data part. Validate hierarchy identities,
  selector scopes, inherited paragraph styles and group transforms before calling
  a missing projection a lost object. Unsupported/ambiguous projections may fall
  back; rendering changes do not authorize editing the SmartArt structure.
- For cacheless hierarchy spacing, compare the currently instantiated layout scopes
  and their live anchors, including supported named spacing copies and root defaults.
  Inactive anchors, conflicting/cyclic or unsupported constraints may fall back;
  do not compensate by manually moving nodes or promise arbitrary SmartArt layouts.
  Re-render the original with the current Web/PDF consumers before changing spacing.
- Compare text after font readiness and refitting, including explicit bullet
  sizes, highlight/outline/glow coverage, clipping, 3D volume and reflection.
  Reflections and extrusions must follow their actual paragraph animation target;
  check reset/exit and fresh render separately. Preserve effect-list resets and
  2D/3D transforms; neither repeated font shrinkage nor stripping effects repairs
  a renderer lifecycle problem.
- PDF reflection decoration and foreground text extraction are separate evidence.
  A reflection may paint without contributing duplicate extracted text. Do not
  diagnose missing authored text from a decoration's extraction behavior, or
  assume a Web reflection budget/fallback applies to the PDF consumer.
- For audio controls, check open/focus/hover after their native dimensions settle,
  then while the slide moves, rotates or scales. Record host CSS transitions and
  the current Viewer build; stale screen coordinates do not justify moving the
  authored icon. For dissolve timing and playback, follow `animations.md`.

## Web clipping, reflections and display scale

Read this section only for these symptoms; ordinary native PNG/PDF checks do not
need a browser run. Confirm the fixes and fallbacks on the loaded Web build;
neither xdoc identity nor an npm package version alone proves they are present.

- **Text changes color in fullscreen/presenter/host chrome:** the rendered slide's
  default text color should be isolated from host UI CSS. Compare unresolved text
  and math separately from authored solid/gradient colors, at the same scale and
  across standalone/fullscreen/thumbnail contexts. Do not force explicit colors
  into the source or alter viewer controls to compensate for an old renderer.
- **Clipped or stale reflections:** distinguish foreground clipping/ellipsis from
  reflection paint. Reflections follow the actual text owner, including centered
  anchor and Text 3D wrappers, and refresh after clipping and font readiness.
  Check the visible foreground and its reflection after those stages, including
  restoration when the frame becomes large enough. Browser layout probes exclude
  reflection decoration; measuring a wrapper's full painted bounds is not proof
  that foreground text overflows. Do not enlarge the authored frame or shrink
  text solely because the mirrored decoration extends beyond it.
- **Large paragraphs:** where the loaded Web renderer bounds reflection work per
  paragraph, exceeding a node, UTF-16-character or measured-fragment budget omits that
  paragraph's whole reflection, clears stale reflection paint and retains the
  foreground content. These are decoration budgets, not PPTX input/text limits,
  and are not a promise about native PDF rendering. Inspect the actual loaded
  renderer or reproduce with a smaller diagnostic control before attributing a
  missing effect to this fallback; absence alone is insufficient. Preserve the
  source text, runs and effects, report the observed fallback, and obtain
  independent evidence when effect fidelity is required.
- **Shape 3D offsets:** compare the same object at the same display scale first.
  Web camera Z translation scales with the rendered element; the camera basis,
  zoom and authored 2D rotation remain separate. A displacement seen at different
  zoom levels does not authorize changing the deck's Z/position/camera values.
  A focused scale check should compare normalized geometry at more than one
  scale and retain the original declarations. Use the exact capability axes and
  independent PowerPoint evidence for fidelity claims, as for other 3D symptoms.

Record whether verification inspected DOM state, captured discrete frames, or
compared an independent renderer. Native `preview` / `visual-audit` still govern
their disclosed workflow gates, but cannot certify these Web lifecycle behaviors.

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
