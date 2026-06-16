# Edit Mode

Read this file when the user wants to modify an existing `.pptx`: change text,
add/remove slides, update tables/charts, replace images, add notes, rebrand an
existing deck, or copy slides from another deck.

Editing is selector-sensitive. The main risk is changing the wrong object.

## Load Order

For existing deck edits read:

1. `common-workflow.md`
2. This file
3. `inspect-and-edit.md` for selector details and common edit patterns
4. `patch-ops-cheatsheet.md` only when writing patch ops

Read `charts.md`, `tables.md`, `styles-and-themes.md`, or `data-driven.md` only
when the requested edit touches those domains.

## Standard Edit Flow

Inspect first:

```bash
xdoc pptx inspect input.pptx --daemon --json
```

Save the inspect output in the run directory. Use it to identify slide indexes,
shape IDs, names, placeholders, bounding boxes, table/chart facts, notes, and
warnings such as SmartArt or transitions.

Write a patch using the most specific stable selector available:

1. `id` from inspect
2. designer-provided `name`
3. placeholder `{ type, idx }`
4. query selector only when ID/name/placeholder are not enough

Dry-run before writing:

```bash
xdoc pptx apply -p patch.json -i input.pptx -o out.pptx \
  --daemon --dry-run --json
```

Check `resolvedSelectors[]` for every op. If a selector is ambiguous, use the
reported `suggestions[].fixPatch` and dry-run again. Do not ignore ambiguous or
unexpected selector resolution.

After dry-run is clean, apply to a run-dir output:

```bash
xdoc pptx apply -p patch.json -i input.pptx -o out.pptx --daemon --json
```

Run `vision-check` and render PNG/contact-sheet previews when the edit changes
layout, visual style, chart/table contents, images, or anything user-visible
enough to risk regression. For append or targeted edit workflows, inspect the
changed slide indexes explicitly and review their PNG images at full size before
treating the full-deck `vision-check` summary as blocking. Existing decks often
have unrelated legacy issues; separate "changed-slide blockers" from
"pre-existing residual risk" in the final summary.

## Common Edit Operations

- Text replacement: `set-text`, `set-paragraph`, `set-run`.
- Paragraph formatting: `set-paragraph-format`; do not use `set-paragraph` for
  alignment.
- Theme/font changes: `set-theme-color`, `set-theme-font`, or brand helpers.
- Slide duplication: `duplicate-slide`.
- Cross-deck whole-slide copy: `xdoc pptx copy-from`.
- Chart data: `replace-chart-data`; read `charts.md` for chart semantics.
- Table edits: `set-table-cell`, `set-table-data`, `import-table-data`; read
  `tables.md` for formulas and CSV imports.
- Image replacement: remove/add picture at the same bbox, or use crop ops when
  appropriate.
- Notes: `set-slide-notes`, `set-slide-notes-rich-text`.

## Preserve Constraints

Preserve SmartArt, VBA macros, unsupported animation/timing, and complex objects
unless the user explicitly asks for a destructive transformation and the tool
supports it. If inspect reports unsupported objects, say what can be preserved
and what cannot be edited.

## Template-Sensitive Edits

When the input deck is a template or the user asks to preserve the source deck's
look, apply the stricter `template-following.md` rules:

- Edit inherited objects in place whenever possible. New objects are allowed
  only for explicit additions, not as a cover-up for old content.
- Do not overlay opaque shapes, screenshots, or full-slide images to hide
  template text, logos, footers, page numbers, or placeholders. Rewrite,
  replace, or delete the original object.
- Do not blanket-clear all text. Default unmentioned source objects to keep.
- Treat empty structural placeholders as real objects. Fill or delete title,
  body, date, footer, and slide-number placeholders explicitly.
- If replacing logos, product screenshots, customer marks, people photos, app
  icons, or other identity assets, register provenance in `assets_manifest.json`
  or leave a `needs-user` placeholder. Do not generate lookalike official
  assets.

## In-Place Edits

If the user asks to modify the source file in place, still dry-run and validate
against a run-dir copy first. Only write back after validation succeeds.
