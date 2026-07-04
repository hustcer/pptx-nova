# Micro Edit Cheatsheet

Read this file instead of the full edit stack when the user asks for a small,
localized edit to an existing `.pptx`: one or two text replacements, speaker
notes, footer/date/page-number text, document metadata, a small color/font tweak,
or a single image replacement.

The goal is speed without weakening selector safety.

## Scope

Use Micro Edit only when all of these are true:

- The input is an existing PPTX.
- The requested change is localized and easy to describe.
- The edit should preserve slide count, layout, theme, and visible structure.
- No new deck narrative, DeckKit selection, brand system, or design lock is
  needed.

Escalate to `edit-mode.md` when the task touches charts/tables, many slides,
layout changes, template fidelity, brand rework, complex images/crops, ambiguous
selectors, SmartArt, animations, or any user-visible redesign.

## Minimal Flow

Create a run directory and capture xdoc capability evidence as required by
`common-workflow.md`. Then keep the loop short:

```bash
xdoc pptx inspect input.pptx --daemon --json > <run-dir>/inspect.json
xdoc pptx select input.pptx --query '{"textRegex":"old text"}' --json > <run-dir>/select.json # optional target lookup
xdoc pptx apply -p <run-dir>/patch.json -i input.pptx -o <run-dir>/candidate.pptx \
  --daemon --overwrite --dry-run --json > <run-dir>/dry-run.json
xdoc pptx apply -p <run-dir>/patch.json -i input.pptx -o <run-dir>/candidate.pptx \
  --daemon --overwrite --json > <run-dir>/apply.json
```

Before apply, verify `dry-run.json`:

- every op resolved the intended slide and object
- each selector resolved to exactly one target unless the user asked for a
  multi-object edit
- no unexpected `suggestions[].fixPatch` remains unused
- any text-fit or visual-risk warning is either fixed or triggers changed-slide
  preview

Do not write back to the user-requested final path until the run-dir candidate
has passed the relevant checks.

## Selector Preference

Use the most stable selector inspect exposes:

1. `id` from `<run-dir>/inspect.json`
2. shape `name`
3. placeholder selector such as `{ "placeholder": { "type": "title" } }`
4. query selector only when the previous selectors are not available

If the exact target text/name is known but buried in a large deck, run
`xdoc pptx select input.pptx --query '{"textRegex":"..."}' --json` first and
copy `matches[0].patchSelector` only when `summary.matchCount == 1` and the
`text`/`bbox` confirms the target.

If the selector is ambiguous, stop the micro path and use `edit-mode.md` plus
`inspect-and-edit.md`.

## Example Matrix

Use `assets/examples/micro-edit-matrix.json` as the quick fixture matrix for
the common small-edit surface:

| Case                    | Minimal success pattern                                         | Failure trigger                                                         |
| ----------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Replace text            | `set-text` on one inspect-proven `shape`                        | selector resolves multiple objects or run indexes are unknown           |
| Speaker notes           | `set-slide-notes` on one slide                                  | rich notes structure or many-slide synchronization is required          |
| Footer/date/page number | `set-text` on one footer/date/page-number placeholder           | inherited footer source or batch target set is unclear                  |
| Metadata                | `set-core-prop` only                                            | visible slide text or custom package metadata also needs reconciliation |
| Replace image           | remove one inspected picture and `add-picture` at the same bbox | crop, mask, aspect ratio, identity, or provenance is unclear            |
| Single-object color     | `set-shape-fill` or `set-shape-line` on one named object        | request is theme, brand, contrast, or deck-wide style work              |
| Delete placeholder      | `remove-shape` on one empty/default placeholder                 | placeholder contains user content or is layout/master-owned             |

The matrix examples are minimal patterns. Inspect and dry-run selector evidence
always outrank the sample selectors.

## One-Screen Op Recipes

### Replace text

Use `set-text` for whole-shape text replacement:

```json
{
  "ops": [
    {
      "op": "set-text",
      "slide": 2,
      "shape": { "id": 7 },
      "text": "Updated title"
    }
  ]
}
```

Use `set-paragraph`, `set-run`, or rich text ops only when whole-shape
replacement would destroy needed formatting. If run/paragraph counts are
unknown, inspect more deeply or escalate.

### Edit notes

Use `set-slide-notes` or `set-slide-notes-rich-text`. Notes-only edits usually do
not need PNG rendering.

```json
{
  "ops": [{ "op": "set-slide-notes", "slide": 4, "text": "Speaker note update." }]
}
```

### Footer, date, or page number

Inspect the target slide/object and use `set-text`. Do not blanket-clear footer
or page-number placeholders across the deck unless the user explicitly asked for
a batch edit and dry-run proves the target set.

### Color or font tweak

For a single text frame, prefer `set-text-style` or `set-shape-text-style` over
run-level edits:

```json
{
  "ops": [
    {
      "op": "set-shape-text-style",
      "slide": 1,
      "shape": { "name": "Subtitle 2" },
      "fontFace": "Aptos",
      "color": "1F2937"
    }
  ]
}
```

If this becomes a theme or brand change, leave Micro Edit and read
`styles-and-themes.md`.

### Replace one image

Use inspect to capture the old picture bbox and crop context. Replace only the
intended picture. Render the changed slide PNG unless the replacement is the same
asset with minor metadata changes. If crop, aspect ratio, provenance, or identity
assets matter, escalate to normal Edit and asset handling.

## Lightweight QA

Always keep these artifacts:

- `inspect.json`
- `patch.json`
- `dry-run.json`
- `apply.json`
- `xdoc-capabilities.json` when generated by the run setup

Run changed-slide PNG preview when any of these are true:

- replacement text is materially longer
- language or script changes
- title, subtitle, footer, date, page number, or tight bbox is touched
- font, color, crop, image, or visible style changes
- dry-run reports text-fit, overflow, or visual-risk warnings

Changed-slide preview command:

```bash
xdoc convert <run-dir>/candidate.pptx --to png --slide <1-based-slide> \
  -o <run-dir>/previews --overwrite
```

Run full `vision-check` only when the edit can affect layout, text fit, image
visibility, or style. Existing decks may already have unrelated issues; final
summaries should distinguish changed-slide blockers from pre-existing residual
risk.

If the edit is text-only, same-length or shorter, resolves exactly one selector,
and dry-run reports no visual risk, PNG rendering may be skipped. Say that
explicitly in the final summary.

## Final Summary

Report:

- final output path and run directory
- changed slide indexes
- selector evidence from dry-run
- whether changed-slide PNG or `vision-check` ran, or why it was skipped
- any pre-existing issue that was not caused by the micro edit
