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

Do not treat the mechanical fallback as the design itself. Inspect-driven color/font replacement
is a useful baseline; it commonly needs object-level recomposition. Do not apply a uniform
coordinate multiplier and call the retained source grid a new design. A canvas change also requires
text, equations, tables and images to be fitted independently rather than merely scaling frames.

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
