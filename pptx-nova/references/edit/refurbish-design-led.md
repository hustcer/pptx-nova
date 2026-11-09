# Design-led refurbishment

Use this method when the user names a target DeckKit or asks for the result to look as though it
was created with that kit. Preserve the source's meaning and editable objects while adopting the
target's visual language. Keep this design work inside the standard refurbishment evidence flow.

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

Classify the source's visual properties before emitting a bulk style patch. Color, weight, borders,
patterns, image filters and geometry sometimes carry the subject matter: a style specimen, a
before/after comparison, a status encoding, a map legend, or a branded product screenshot. Treat
those properties as **content evidence**, alongside its text/data. Record the protected property
and the source object in the design map. Preserve that local treatment while rebuilding its
surrounding hierarchy, spacing and annotations in the target language. Do not recolor a red-border
specimen green while retaining its “red border” caption, or flatten distinct categories into one fill.

Apply this distinction by meaning, not by deck filename or a blanket “preserve all styles” switch.
An old container shadow or orange page divider is usually disposable design paint; an image-mask
comparison or inline-format specimen may need its original paint and native structure. Review the
representative page beside both the source and the kit showcase before propagating either policy.
Record deliberate source-paint exceptions in the final visual review so target identity is judged
against the redesigned presentation system without misrepresenting those exceptions as kit defaults.

### Preserve the visible existence of proof shapes

Object count, text equality and unchanged timing do not prove that a diagram survived. A source
node can remain editable yet disappear when its fill matches the background and its outline is
removed. Classify original shapes as proof objects, annotations or expendable chrome in the design
map **before** simplifying containers. Milestone dots, diagram nodes, legend keys, shape specimens
and animation targets are proof objects, including those with no text. Retain a discernible native
silhouette, boundary or fill in the target palette. Do not turn an animation specimen into text alone
or remove the markers from a timeline to achieve an open-layout aesthetic.
Do not infer page chrome from a shape's short label, oval/rectangle preset, object id or empty text
alone; a compact “1A” node and an empty milestone dot can be essential diagram content.
Preserve a visible source container by default until its expendable chrome role is established.
In feature demonstrations, a seemingly empty rectangle may be the transition, clipping, interaction
or text-layout specimen. An open-layout kit does not authorize erasing that subject matter.

For each retained proof object, compare its final bbox and effective fill/line/opacity against the
background; flag zero-size, off-slide, transparent or background-matched/no-outline results. Bind
the check to source/candidate hashes and original identities. Source paths/IDs with no resolved
paint evidence require visual verification, not an automatic pass. Declared chrome simplifications
need a recorded role/reason; missing text is never enough to classify a shape as chrome.

Review every diagram, timeline and shape/animation gallery at readable size beside the source,
checking visible nodes, markers, edges and silhouettes as well as labels. A full-deck thumbnail
and a native object inventory are insufficient. Include the exact original proof-object checklist
and per-object visibility result in the content audit; confirm the target kit treatment only after
those proof shapes remain distinguishable. Static review does not certify animation playback.

For the supported subset of source-owned native proofs, put the hash-bound automatic checklist
at `<run-dir>/proof-objects.json` and run the bundled guard:

```json
{
  "sourceSha256": "<source PPTX SHA-256>",
  "proofObjects": [{ "slideNumber": 1, "shapeId": 7, "role": "milestone-node" }]
}
```

```bash
node <skill-root>/scripts/cli/review/proof-visibility-gate.mjs \
  --source source.pptx --candidate candidate.pptx --proof-map proof-objects.json \
  --output <run-dir>/proof-visibility-gate.json --json
```

`pass` proves only the declared bounds and direct paint contrast for unadjusted `rect`, `roundRect`
and `ellipse` silhouettes, or table frame/grid/row consistency. Explicitly hidden proofs fail.
The guard uses a 1.2 fill/outline contrast threshold as a coarse disappearance check, not a
readability, apparent-size or pixel-occlusion certificate. Other/custom geometry, effects,
background-fill overrides, undisclosed outline thickness, inherited/theme/gradient paint, groups,
rotations or unresolvable
backgrounds return `review-required` instead of assuming white or passing. Duplicate identities
across `AlternateContent` branches are unresolved; the guard does not choose a renderer's branch.

Keep unsupported proofs in a separate manual checklist with original identities (including branch
when needed), roles, concrete automatic-check exclusions, candidate hash and reviewed PNG hashes.
Review all of them beside the source before delivery; do not relabel them as expendable chrome.
The automatic and manual checklists together must cover the protected objects. An incomplete
automatic checklist cannot prove the rest of the diagram, and a manual-only run must not claim
an automatic pass. These checks complement native object, content and PNG review gates.
For a refurbishment run containing `proof-objects.json`, the compare publication gate recomputes
the declared proofs from the actual source/candidate bytes and refuses every non-passing result,
including `review-required`; manual review cannot override that status. Repair the candidate or
document an unsupported entry in the manual checklist and rerun the supported automatic subset.
Do not create an empty automatic map when only manual checks apply. The publication guard does
not consume the separate manual checklist; its closure remains a workflow review obligation.

### Fit native tables internally, not only their frames

Choose the table's target region from the kit composition, then fit the native column grid, row
heights, cell margins and font roles to that region. A larger graphic-frame bbox does not enlarge
`a:tblGrid/a:gridCol`, `a:tr` or the cell fonts. Use the disclosed `set-table.columns`, `rows` and
scoped `cells[].style.font` fields where supported; preserve cells, merges, inline emphasis and
meaningful styles. A specimen labelled with an absolute font size needs that declared size retained.
Relative style specimens such as “Small”, “Large” or “Bold” must retain the stated distinction too;
do not normalize away the very property the table demonstrates to satisfy a generic type scale.

Verify the final sum of column widths and row heights against the final table frame, allowing only
EMU rounding. Check actual painted table width/height, cell readability and the balance of occupied
regions at full size; no bbox-only or content-count pass. Table auto-growth, grouped transforms or
intentional mismatches need independent evidence instead of a blanket ignore. Native PowerPoint
export is useful for confirming final row/cell fitting when available.

Declare edited native tables in the same proof map with `kind: "table"` and a role such as
`"evidence-table"`. The guard checks frame/grid/row consistency; it does not certify font size,
text fit, merged-cell semantics or aesthetic balance. Those remain content/PNG review obligations.

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
Freeze source-picture color/effect roles before changing their theme context: resolve theme-bound
duotones to equivalent local colors when necessary, retaining the original transforms and media.
Repair mismatches in the current authoring patch before judging target identity. A valid fallback
report proves execution, not equivalence to the kit's complete theme contract.

Chart recoloring needs an inheritance check as well as a series palette. Inspect the rendered
title, axis labels, data labels, legend and gridlines after the theme change; source chart-style
parts may still control them. Apply only fields supported for the actual chart dialect. A font-only
title mutation can create a missing title, so verify title presence first rather than adding a
placeholder while trying to style it. Preserve hidden/automatic title semantics. For a scoped
chart-style raw repair, retain the original owner relationship and use the raw-XML route with
fresh structural, semantic and available PowerPoint evidence; a successful palette edit alone
does not establish the target typography.

Recolor visible paint without enabling hidden paint: preserve explicit `noFill`, marker-only
scatter styles, marker symbols and label visibility. A `series.line.color` edit can turn a hidden
line into a connecting line, changing how the data is read even when every value is unchanged.
Include those visibility states in the content comparison instead of discarding all style nodes.
Respect palette roles: background tints are not automatically suitable data-stroke colors. Check
every series against its background and neighboring series; use legible target colors and coherent
line treatments where a multi-series source exceeds the target kit's default single-series palette.
Creating point-level label formatting can also introduce a new override container. Read the
effective parent/point show-value, show-percentage, category, series and legend-key flags first;
preserve them explicitly when a new point override is needed. Validate the actual native labels,
not only caches or a preview: unchanged values do not prove unchanged visible label content.
Discover the exact point-edit subset first. If show flags are not writable at that scope, preserve
the parent behavior or use the bounded raw-XML route with original namespace/order preservation
and native evidence; do not send unsupported fields or assume formatting-only edits are semantic no-ops.

Do not treat the mechanical fallback as the design itself. Inspect-driven color/font replacement
is a useful baseline; it commonly needs object-level recomposition. Do not apply a uniform
coordinate multiplier and call the retained source grid a new design. A canvas change also requires
text, equations, tables and images to be fitted independently rather than merely scaling frames.

### Align heading companions as one typographic unit

Size section numbers, badges and icons relative to the visible headline, not an unrelated label
role. Use the target kit's appropriate index/heading scale and review the actual glyph: a Unicode
circled digit can appear much smaller than plain text at the same nominal size. Put a number or
badge and a one-line title in a shared vertical band, use matching vertical-center anchors, center
the marker horizontally, and reset paragraph before/after spacing. Do not mix a top-anchored
headline with an independently positioned tiny marker and assume bbox alignment is optical alignment.

Review the complete heading at readable size, including long mixed-language titles. Check visual
weight, gap, centering and title wrapping together. For a wrapped title, explicitly choose alignment
to its first line or full block and check fit; never crop the title just to make the marker align.

### Preserve source-picture appearance

Default to movement and **uniform** scaling of source pictures. Preserve their original crop, mask,
rotation/flip, border/effects and visible color treatment unless the user authorizes a change. A
new DeckKit is permission to recompose the page, not to fill every image slot by independently
setting width and height. For a source frame `(w, h)`, choose one scale `s` and derive `(s*w, s*h)`;
if it does not fit, change the surrounding composition or leave whitespace. If the user requires
unchanged size, use `s=1`. Do not silently switch to cover/crop or alter a person's proportions.

For source-preserving refurbishment with slide-local pictures, run after the stable candidate:

```bash
node <skill-root>/scripts/cli/review/image-geometry-gate.mjs \
  --source source.pptx --candidate candidate.pptx \
  --output <run-dir>/image-geometry-gate.json --json
```

Require `status=pass` for the checked pictures before recording `assetFit=pass`. The helper freshly
inspects both hashed files, allows translation and uniform scale within one-EMU rounding, and rejects
changed crop/mask, stretching and unresolved original identities. It covers slide-local pictures;
group transforms, remapped identities, media bytes, color/effects and pixel appearance need separate
bound evidence. Do not treat excluded coverage or `not-applicable` as image-preservation proof.
Compare every modified photograph beside the original at full size: faces/body proportions, crop,
mask and tint must agree. Theme changes can recolor a picture even when its bytes and crop match.

An empty `textPreview` does not prove that an object is disposable: it may contain native OMML,
OLE or a cached diagram. Conversely, `hasText` may only mean an empty text frame exists. Classify
decorative frames using their actual structure and role before clearing their visual styling.
Inherited layout/master shapes may be absent from the slide-local object list. Preserve content
and resource ownership when using a scoped raw-XML repair; follow the raw-XML reference and retain
the exact input, patch, dry-run/apply and structural evidence.

Dynamic text fields need the same distinction. A populated slide-number/date field can have empty
`textPreview` and `fontFacts`, and its `a:fld/a:rPr` may retain inherited styling after an ordinary
text-frame font edit. Check the actual field text/style and rendered output before calling it empty
or successfully recolored. Prefer a disclosed field-aware operation; if a bounded raw repair is
needed, preserve the field identity/type/text and follow the raw-XML evidence route. For a diagnostic
that still labels verified fields, pictures or tables as empty, use the existing exact finding-bound
review policy with XML/readback and PNG evidence; do not suppress all placeholders or delete them.

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

For agendas, lists and other sparse pages, full-size review must check the **first and last painted
lines**, list rhythm and the balance of occupied regions. Reset inherited paragraph before/after
spacing and line spacing when adopting a new type scale; changing only font size or space-after
can leave the old master controlling the list height. Use a coherent row pitch or open ledger,
align numbers with their corresponding rows, and reserve clear breathing room above footer rules.
A text frame inside the page, unchanged text, `vision=0`, or a small contact-sheet thumbnail does
not prove the final line has enough space. Review every changed sparse page at readable size,
not only the densest page; never mark spacing/assetFit as pass from a contact sheet alone.

## 4. Verify content independently of appearance

Export candidate JSON/Markdown and compare **content**, not complete JSON bytes:

```bash
xdoc convert <candidate.pptx> --to json,md --output-dir <run-dir>/readback-candidate --pretty
```

Use stable source slide/object identity where available. Exclude only deliberately added page
chrome; compare original paragraphs, table cells, chart categories/series/values, notes and links.
Allow intentional geometry/font/color changes. Preserve the original sequence within each
content object; a deck-wide text bag could hide content moved to the wrong slide.

Retain `content-equivalence.json` with source/candidate hashes, per-slide coverage, comparison
method, differences and unverified object classes. JSON/Markdown extraction is supplementary:
also compare OMML operator/fraction/script structure and text, embedded/media bytes or canonical
resource content, and owner-relative relationships when the extractors omit those facts. Style-only
changes may alter part bytes, so compare the preserved semantics rather than claiming all XML is
byte-identical. A rendered fallback does not establish native equation or chart preservation.

For source-owned editing, use `(presentation-order slide, original object identity)` as the
comparison key and retain paragraph order, hard breaks and populated fields within each object.
Check the complete extraction, not `textPreview`, which may be truncated. An OOXML
`AlternateContent` choice and fallback can share an object id: distinguish their branch and native
element kind instead of treating them as duplicate content or matching either arbitrarily.
Compare table cells/merges, chart caches/formulas/axes/label visibility, media and embedded
workbook bytes, notes, hyperlinks, diagram connections and timing where present. State exclusions
explicitly. Added page chrome is separate from the original objects; a deck-wide text bag or
equal total counts cannot prove per-page preservation. Keep the extraction manifest, comparison
script and detailed differences with the run so a future pass can reproduce the result.

Run the normal semantic diff, refurbishment audit and fidelity gate too. If an audit treats every
geometry change as a failure, inspect its exact content policy; do not weaken it globally or invent
passed evidence. Fix the map or use the workflow's documented scoped evidence path.

## 5. Close one stable candidate

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

When Feedback Mode is active, separate skill guidance/tooling gaps, operator mistakes and confirmed
xdoc problems. Keep one-off content/layout choices in the run. Only general, demonstrated workflow
improvements belong in the skill, with targeted regression checks for executable changes.
