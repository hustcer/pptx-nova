# Template Following

Read this file when the user provides an existing PPTX and asks to strictly
follow it as a template: "套这个模板", "按这份 PPT 改", "保留原模板版式",
"use this deck as the template", or similar. This is not the same as
Reference Create. The goal is to preserve the source deck's structure and edit
inherited objects, not rebuild a similar-looking deck from blank slides.

## Contract

- Source PPTX is read-only unless the user explicitly asks for in-place output.
- Inspect the full source deck before planning. Do not sample only the first or
  most attractive slides.
- Every output slide must map to a source slide, an existing template
  placeholder slide, or an explicit allowed insertion.
- Prefer `duplicate-slide`, `copy-from`, `from-data`, or edits to copied source
  objects. Do not rebuild mapped slides with fresh coordinates just because the
  visual style looks easy.
- Preserve source typography, spacing, alignment, crop, brand chrome, footers,
  page markers, section rails, images, chart/table frames, and layout furniture
  unless the user explicitly asks to restyle.
- If new copy does not fit, shorten the copy, choose a better source slide, or
  split the content. Do not silently shrink text below readability floors or
  cover old content with overlay shapes.

## Run Artifacts

Place these in the run directory:

- `template-inspect.json`: full `xdoc pptx inspect` output for the source deck.
- `template-audit.json`: reusable slide patterns, placeholders, brand chrome,
  asset provenance, unsupported objects, and preserve rules.
- `template-frame-map.json`: one mapping entry per output slide.
- `template-edit-plan.json`: object-level edits, deletes, replacements, and
  intentional insertions.
- `deviation-log.json`: only when a mapped slide intentionally departs from the
  source pattern.
- `assets_manifest.json`: only when allowed external/reused/generated assets
  are used.

Minimum `template-frame-map.json`:

```json
{
  "source": "/abs/path/source-template.pptx",
  "outputSlides": [
    {
      "outputSlide": 0,
      "sourceSlide": 3,
      "reuseMode": "duplicate-slide",
      "narrativeRole": "opening thesis",
      "editTargets": [{ "shape": { "placeholder": { "type": "title" } }, "action": "rewrite" }]
    }
  ],
  "omittedSourceSlides": [{ "sourceSlide": 4, "reason": "appendix pattern not needed" }]
}
```

## Workflow

1. Inspect the source deck:

```bash
xdoc pptx inspect source.pptx --daemon --json > template-inspect.json
```

2. Review source slide images if available, or render a source contact sheet with
   `xdoc convert`. Identify slide roles, recurring chrome, typography, object
   frames, media crops, placeholder-like text, and unsupported objects.
3. Write `template-audit.json` and `template-frame-map.json`.
4. Build the starter deck by duplicating or copying mapped source slides into a
   run-dir PPTX. Do not create blank mapped slides.
5. Write `template-edit-plan.json` from inspect IDs, names, placeholders, and
   bbox evidence. Default every inherited object to `keep`.
6. Apply edits to the copied objects. Use new objects only for explicit allowed
   insertions with bounded zones and reasons.
7. Run dry-run, apply, template gate, `vision-check`, PNG/contact-sheet review,
   and the placeholder/chrome QA below.

```bash
node <skill-root>/scripts/pptx-nova-template-gate.mjs \
  --frame-map template-frame-map.json \
  --source-inspect template-inspect.json \
  --edit-plan template-edit-plan.json \
  --template-audit template-audit.json \
  --assets assets_manifest.json \
  --patch patch.json \
  --dry-run dry-run.json \
  --final-pptx out.pptx \
  --json > template-gate.json
```

Omit optional inputs only when they truly do not exist. For example, pure text
template filling may have no `assets_manifest.json`, but a deck that replaces or
keeps logos, screenshots, customer marks, product UI, or photos should include
one.

## Edit Rules

- Use the most stable selector available: inspect id, source object name,
  placeholder selector, then query. Verify `resolvedSelectors[]` in dry-run.
- `editTargets: []` means preserve-only. Do not add narrative content to that
  mapped slide unless the frame map is updated first.
- Do not blanket-clear text. Never run logic equivalent to "clear every text
  shape, then add new boxes".
- Do not use opaque or semi-opaque overlays to hide old template text, footer,
  page number, logo, or image. Remove or rewrite the inherited object itself.
- Empty structural placeholders count as objects. Fill or delete title/body/
  date/footer/slide-number placeholders explicitly.
- Source assets are not automatically licensed for reuse. If a logo, customer
  mark, screenshot, photo, or icon is copied from the template, register it in
  `assets_manifest.json` with source and permission status.

## Asset Provenance

For template following, identity assets have stricter rules than decorative
layout:

- Allowed: user-provided assets, source-deck assets the user explicitly allows
  reusing, official/verified public assets with recorded source, built-in icon
  packs with license metadata.
- Not allowed: generated lookalike logos, fake screenshots, fake product UI,
  invented customer marks, unofficial app icons, or copied third-party marks
  without permission.
- If provenance is missing, keep the template frame but replace the asset with
  a text label, neutral native shape, or `needs-user` placeholder. Formal
  delivery cannot keep `needs-user`, `missing`, or unconfirmed placeholders.

## Placeholder And Chrome QA

Before delivery, inspect or otherwise verify:

- No visible sample text remains, such as `Title goes here`, `Name goes here`,
  `Slide Number`, `Date`, `Footer`, or template authoring notes.
- No structural placeholder is empty unless it is intentionally deleted in
  `template-edit-plan.json`.
- Required inherited brand chrome, footers, page markers, section rails, and
  reusable frames remain visible unless intentionally removed.
- Added objects do not cover inherited objects except for an explicitly logged
  replacement inside the same bbox.
- Before/after slide images for changed slides preserve the source template's rhythm,
  alignment, crop treatment, and typography.

If these checks fail, fix the inherited object mapping or choose another source
slide. Do not switch to a parallel rebuild that only resembles the template.

`pptx-nova-template-gate.mjs` machine-checks the highest-risk subset:

- every mapped output slide has a valid source slide unless it is an explicit
  allowed insertion;
- unplanned `add-*` patch ops are blocked because they often indicate a
  parallel rebuild or overlay cover-up;
- added objects with coordinates are compared against source slide bboxes and
  flagged when they cover inherited objects;
- final PPTX slide XML is scanned for empty structural placeholders and common
  default prompt text;
- identity assets in `assets_manifest.json` / `template-audit.json` must have
  approved provenance and cannot be generated lookalikes.
