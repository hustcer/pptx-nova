# PPTX Nova Assets

This directory is the local asset catalog used by `skills/pptx-nova`.

The catalogs are intentionally small and metadata-first. They define stable IDs,
selection hints, and generator/patch entry points before large binary assets are
introduced.

## Directories

- `brands/` - brand profiles, logo references, and font preferences.
- `layouts/` - reusable grid systems and layout-contract mappings.
- `decks/` - complete sample deck generators or patch bundles.
- `themes/` - themePack/stylePack catalog consumed by `list-themes`.
- `charts/` - native chart/table/diagram presets, not SVG-only templates.
- `icons/` - icon metadata and migration policy for vector/native assets.
- `examples/` - end-to-end examples and generator templates.

## Rules

- Prefer JSON catalogs over undocumented loose files.
- Treat `themes/catalog.json` as the source of truth for built-in
  themePack/stylePack data. After editing it, run
  `just theme -g` from the repo root; use `just theme` to detect stale
  generated MoonBit/JS catalogs.
- Keep binary and licensed assets out until their license source is recorded.
- Tabler high-frequency icons are vendored as
  `icons/tabler-icons.generated.json`, a pure `{ "icon-name": "<svg>" }` map
  generated from `icons/tabler-icons.manifest.json`. Refresh it from the local
  Tabler checkout with:

  ```bash
  nu tools/generate-pptx-nova-tabler-icons.nu
  nu tools/generate-pptx-nova-tabler-icons.nu --check
  ```

  During PPTX generation, DeckKit code should consume this fixed JSON through
  `assets/deckkits/icon-assets.kit.mjs`; do not fetch icons from the network or
  scan the Tabler checkout in the deck generation path.

- Use `s8fy pptx extract-style reference.pptx --output style.json --json` to
  create a draft profile before adding a new brand or theme entry.
- Use `s8fy pptx import-template reference.pptx --name stable-id --output skills/pptx-nova/assets --json`
  to copy a reference PPTX into `decks/<id>/`, write brand/layout/theme/style
  profiles, and register the imported entries in the local catalogs.
- Use `s8fy pptx copy-from target.pptx --from source.pptx --slide 0 --output out.pptx`
  when you only need to reuse one slide in another deck.
- Use `node tools/generate-pptx-nova-examples.mjs --clean --render-previews`
  from the repo root to materialize the preset/theme showcase decks, persist
  their `pptx-vision/v1` reports under `decks/examples/`, and render local
  PNG previews plus contact sheets for visual review. The `.pptx`, patch,
  dry-run, full vision, PNG preview, and contact sheet files are generated
  local artifacts and remain ignored by git; README/index files and per-sample
  `summary.json` files are the committed audit trail.
- Commit lightweight example audit files only: README/index and `summary.json`.
  Do not commit generated `.pptx`, PNG previews, contact sheets, regenerated
  `patch.json`, `dry-run-summary.json`, or full `vision*.json` files unless a
  future review explicitly needs a frozen full artifact.
