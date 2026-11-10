# Object integrity across workflows

Use these rules when creating or changing visible content, styling or geometry in Create, Edit,
Refurbish, Translation, template following, data filling or brand conversion. Apply the relevant
sections to authored/affected objects and their immediate layout dependencies. Notes/metadata-only
changes, licensing and read-only export do not need this authoring guide.

Creation checks the intended content and chosen design. Existing-deck work checks the authorized
changes and promised preservation against the source; a translation or local edit does not authorize
redesigning unrelated objects. Source-bound guards below require a real source and stable identities:
do not invent a source for a new deck. These rules supplement each workflow's gates, scope and review
policy; they do not require a full-deck redesign or every guard for every micro edit.

## Distinguish design paint from evidence paint

Color, weight, borders, patterns, image filters and geometry can carry subject matter: a style
specimen, before/after comparison, status encoding, map legend or branded product screenshot.
Treat these properties as content evidence alongside text/data. When authoring a specimen, make
its label true of the actual object. When restyling one, record the protected property/object in
the task's design or edit plan. Do not recolor a red-border specimen green while retaining its
“red border” caption, or flatten distinct categories into one fill.

Classify by meaning, not filename, preset or a blanket “preserve all styles” switch. An old shadow
may be expendable design paint; a mask comparison or inline-format specimen may require its original
treatment and native structure. Review before propagating a bulk style policy, and record deliberate
source-paint exceptions without presenting them as defaults of the new design system.

## Preserve the visible existence of proof shapes

Milestone dots, diagram nodes, legend keys, shape specimens and animation targets can be proof
objects even when they have no text. Retain a discernible silhouette, boundary or fill for objects
intended to be visible. Do not remove timeline markers or turn a shape demonstration into text
alone to achieve an open-layout aesthetic. Preserve deliberate animation states; static review
does not certify playback.

Object counts and text equality do not prove visibility. Check final bounds and effective
fill/line/opacity against the actual background: zero-size, off-slide, transparent and
background-matched/no-outline results need attention. Review diagrams, timelines and shape galleries
at readable size, checking nodes, markers, edges and silhouettes as well as labels.

For existing objects, establish the proof/annotation/chrome role before simplifying containers.
A short label, empty text, object id or rectangle/oval preset is insufficient evidence of chrome.
An apparently empty rectangle may demonstrate transitions, clipping, interaction or text layout.
Preserve a visible source container until its expendable role is established. For supported
source-owned proofs, use the [source-bound proof guard](#source-bound-proof-guard).

## Fit native tables internally, not only their frames

Choose the table region from the composition, then fit the native column grid, row heights, cell
margins and font roles to it. A larger graphic-frame bbox does not enlarge `a:tblGrid/a:gridCol`,
`a:tr` or cell fonts. For edits, use the disclosed `set-table.columns`, `rows` and scoped
`cells[].style.font` fields where supported. Preserve the cells, merges, inline emphasis and styles
required by the task. A specimen labelled with an absolute font size must retain that size;
“Small”, “Large” and “Bold” specimens must retain the distinction they demonstrate.

Verify final column-width/row-height sums against the final frame, allowing EMU rounding. Inspect
actual painted width/height, cell fit, merges and the balance of occupied regions at full size;
bbox-only or content-count checks are insufficient. Auto-growth, group transforms or intentional
mismatches need independent evidence, not a blanket ignore. Available native PowerPoint export
can confirm final fitting. Read [tables](../content/tables.md) for operation and semantic details.
The source-bound guard's `kind: "table"` checks frame/grid/row consistency only, not typography,
merged-cell semantics or aesthetic balance.

## Check chart inheritance and visible semantics

Creating or restyling a chart needs more than a series palette. Inspect the rendered title, axes,
data labels, legend and gridlines; inherited chart-style parts may control them. Apply only fields
supported for the actual chart dialect. Verify title presence before font-only editing, so styling
does not create an unintended title. For a scoped raw chart-style repair, preserve owner relationships
and use the [raw-XML route](../edit/control-flow-and-raw-xml.md) with fresh structural, semantic and
available PowerPoint evidence.

Choose visibility explicitly for a new chart. When restyling an existing one, preserve `noFill`,
marker-only scatter styles, marker symbols and label visibility unless a semantic change is
authorized. A `series.line.color` edit can enable a connecting line and change how data is read.
Include these visibility states in preservation checks instead of discarding all style nodes.
Background tints are not automatically suitable data-stroke colors: check every series against
its background and neighboring series; use coherent colors and line treatments for multi-series data.

Point-level label formatting can introduce a new override container. Read effective parent/point
show-value, show-percentage, category, series and legend-key flags first, preserving the intended
visible content when adding an override. Validate actual labels, not only values/caches or a preview.
Discover the exact point-edit subset; if show flags are not writable there, retain parent behavior
or use bounded raw XML with namespace/order preservation and native evidence. Read
[charts](../content/charts.md) for chart-specific contracts and rendering limits.

## Align heading companions as one typographic unit

When designing or recomposing a heading, size section numbers, badges and icons relative to its
visible headline and design roles. A Unicode circled digit may look much smaller than plain text
at the same nominal size. Put a marker and one-line title in a shared vertical band, with matching
vertical-center anchors, horizontal marker centering and controlled paragraph before/after spacing.
Matching bboxes alone do not establish optical alignment.

When renumbering Unicode badges, verify the actual new characters in the export font: support for
one circled-number range does not prove support for another. Check the authored/resolved font and
glyph coverage, and compare native evidence when available before attributing the symptom to the
deck. Without native evidence, keep PowerPoint parity unverified; do not make that optional route
a prerequisite for an otherwise authorized edit. Preserve fonts outside the requested scope.
For an authorized numbering redesign, plain digits in a native shape avoid a dependency on uncommon
circled glyphs.

Review complete headings at readable size, including long mixed-language titles. Check weight,
gap, centering and wrapping together. For a wrapped title, choose first-line or full-block alignment
explicitly; never crop the title to make its marker align. In a layout-preserving edit, verify the
existing relationship and fit without changing alignment outside the authorized scope.

## Preserve source-picture appearance

Fit new or replacement images using the declared slot/fit policy. Derive both dimensions from one
scale when preserving proportions; do not stretch a person or product to fill a slot. A permitted
crop must retain the intended subject. See [asset slots](visual-qa-and-asset-slots.md#asset-slot-manifest).

When an existing picture's appearance must be preserved, default to movement and uniform scaling,
retaining crop, mask, rotation/flip, border/effects and visible color treatment. Refurbishment follows
this default unless the user authorizes a change. For source frame `(w, h)`, derive `(s*w, s*h)`;
if it does not fit, revise the surrounding composition or leave whitespace. Use `s=1` when size is
locked. Do not silently switch a preserved picture to cover/crop. Resolve theme-bound duotones to
equivalent local colors before a theme change when necessary, retaining transforms and media.

For stable slide-local identities under that preservation policy, run on the stable candidate:

```bash
node <skill-root>/scripts/cli/review/image-geometry-gate.mjs \
  --source source.pptx --candidate candidate.pptx \
  --output <run-dir>/image-geometry-gate.json --json
```

Require `status=pass` for checked pictures before recording `assetFit=pass` as preserved. The helper freshly
inspects both hashed files, allows movement/uniform scale within one-EMU rounding, and rejects
crop/mask changes, stretching and unresolved identities. Groups, remapped identities, media bytes,
color/effects and pixel appearance need separate bound evidence. Neither `not-applicable` nor
unchanged media bytes prove preservation. Compare modified photos at full size beside the source,
including proportions, crop, mask and tint. An authorized crop/replacement needs its own declared
fit checks, not a false unchanged-appearance claim.

The automatic mask check requires a disclosed preset name on both pictures. A `null`, blank or
missing preset cannot establish unchanged geometry: custom paths can differ while both presets
are `null`. The gate fails these cases as unverified; retain separate source/candidate-bound
geometry and visual evidence rather than recording an automatic preservation pass.
The gate also reads native `prstGeom/avLst` from both PPTX files: equal preset names do not prove
equal adjustment guides. Absent and empty adjustment lists are equivalent; changed guides fail.
Other formula equivalences are not evaluated. Missing or ambiguous native geometry remains unverified.

## Review full-size composition, not only thumbnails

Check dense and sparse affected pages. For agendas/lists, inspect first and last painted lines,
row rhythm and the balance of occupied regions. When adopting a new type scale, control inherited
paragraph before/after spacing and line spacing; font size or space-after alone may leave the old
master controlling list height. Align markers with their rows and keep clearance above footers.

An in-bounds text frame, unchanged text, `vision=0` or a small contact-sheet thumbnail does not
prove the final line fits or a table is balanced. Review affected pages at readable size before
recording spacing/asset fit as passing. Use the workflow's canonical renders and changed-slide
policy; this rule does not add another full-deck render to a localized edit. Diagnose unexplained
renderer differences through [fidelity diagnosis](fidelity-diagnosis.md) before altering content.

## Verify preserved content at object scope

For source-owned editing, compare the properties promised by the task, accounting for authorized
text/data/structure changes. Use `(presentation-order slide, original object identity)` and retain
paragraph order, hard breaks and populated fields inside each retained object. Check complete
extraction, not truncated `textPreview`. `AlternateContent` choice/fallback can share an id:
distinguish branch and native kind rather than matching either arbitrarily.

Compare relevant table cells/merges, chart caches/formulas/axes/label visibility, OMML structure,
media/embedded workbook bytes or canonical resource content, notes, hyperlinks, diagram connections,
timing and owner-relative relationships. State exclusions and expected deltas. Counts or a deck-wide
text bag cannot prove per-page preservation. Keep extraction manifests, comparison method/script
and detailed differences with bound evidence so the result can be reproduced.

Empty `textPreview` may hide OMML, OLE, cached diagrams or populated slide-number/date fields;
`hasText` may mean only an empty frame. Populated fields may also have empty `fontFacts`, while
`a:fld/a:rPr` retains inherited styling after an ordinary text-frame font edit. Inspect actual
structure, field identity/type/text/style and rendered output before clearing or recoloring it.
Layout/master objects may be absent from the
slide-local inventory. Prefer disclosed field-aware operations; scoped raw repairs retain native
identity and use the raw-XML evidence route. Exact finding-bound review policies may close verified
diagnostic gaps; never globally suppress placeholders or delete evidence objects to pass a check.

Reserve new chrome against populated field output, including an apparently empty slide-number
placeholder. Review source footer/date/number fields beside any added counter at readable size;
an empty inspected string can still paint a number and collide after rendering.

## Source-bound proof guard

Use this guard when restyling/resizing retained proof shapes or tables risks erasing silhouettes
or desynchronizing native table dimensions. Put the supported subset at `<run-dir>/proof-objects.json`.
Text-only changes do not by themselves require it. New-deck creation uses intent, semantic and PNG
checks above; this source-identity guard is not applicable without a source.

For a standard Refurbish runner, prepare the map outside the fresh run directory and pass
`--proof-map <path>`. The runner validates its source binding and nonempty declarations, then
archives it as `proof-objects.json` before probing xdoc. Both native and fallback routes retain
the publication check; a missing or changed archive blocks publication. Do not prepopulate the
fresh run directory with the map.
The runner persists the snapshot requirement in `refurbish-run-summary.json` before probing.
Refurbish comparisons also capture it before rendering in the single/multipart compare report's
`pptxNovaCompare.proofMapBinding`. Independent publication checks both records; losing the summary
and map together cannot erase the report's requirement. Comparison regeneration, including cache
hits and `--overwrite`, retains an existing required binding and checks it before rendering; changing
the output kind does not disable that contract. Retain all three artifacts. Legacy reports
without the embedded binding still consume the runner snapshot when available; absence of every
historical requirement record cannot prove that no protected objects were declared.

```json
{
  "sourceSha256": "<source PPTX SHA-256>",
  "proofObjects": [{ "slideNumber": 1, "shapeId": 7, "role": "milestone-node" }]
}
```

Declare tables with `kind: "table"` and a role such as `"evidence-table"`.

```bash
node <skill-root>/scripts/cli/review/proof-visibility-gate.mjs \
  --source source.pptx --candidate candidate.pptx --proof-map <run-dir>/proof-objects.json \
  --output <run-dir>/proof-visibility-gate.json --json
```

`pass` covers only declared bounds/direct paint contrast for unadjusted `rect`, `roundRect` and
`ellipse` silhouettes, or table frame/grid/row consistency. Explicitly hidden proofs fail. The
1.2 contrast threshold is a coarse disappearance check, not readability, apparent size, pixel
occlusion or playback certification. Other/custom geometry, effects, background-fill overrides,
undisclosed outline thickness, inherited/theme/gradient paint, groups, rotations and unresolved
backgrounds require review. Ambiguous `AlternateContent` identities remain unresolved.
Even a unique shape/table inside a single `Choice` or `Fallback` requires branch review on either
the source or candidate; ordinary bounds/paint cannot establish consumer branch selection.

Keep unsupported proofs in a separate manual checklist with identities/branch, roles, concrete
automatic-check exclusions, candidate hash and reviewed PNG hashes. Automatic/manual lists together
cover the protected objects. Review unsupported proofs beside the source; do not call them chrome
or claim an automatic pass. Do not create an empty automatic map for a manual-only run.

Refurbish compare publication recomputes a run-local `proof-objects.json` from actual source/candidate
bytes and blocks every non-`pass`, including `review-required`. Manual review cannot override that
status: repair, or document an unsupported entry in the manual list and rerun the supported subset.
The separate manual checklist remains a workflow review obligation; the publication guard does not
consume it. Other workflows may use the standalone guard, but it does not replace their own gates
or automatically become their publication contract.
