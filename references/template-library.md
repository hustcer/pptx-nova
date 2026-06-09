# Template Library

Use this reference when choosing or adding local assets under
`skills/pptx-nova/assets/`.

## Catalogs

| Directory  | Catalog                | Purpose                                                  |
| ---------- | ---------------------- | -------------------------------------------------------- |
| `brands/`  | `brands/catalog.json`  | Brand profiles and apply/check commands                  |
| `layouts/` | `layouts/catalog.json` | Layout patterns, grid systems, and layout-contract hints |
| `decks/`   | `decks/catalog.json`   | Complete generators, outlines, and patch bundles         |
| `themes/`  | `themes/catalog.json`  | themePack/stylePack entries for `list-themes`            |
| `charts/`  | `charts/catalog.json`  | Native chart/table/diagram presets                       |
| `icons/`   | `icons/catalog.json`   | Native shape icons, Tabler bundle, and vector policy     |

## Selection Flow

1. Pick theme/style first with `s8fy pptx list-themes --json`.
2. If the user provided a reference deck and a new outline/content goal, follow
   `reference-create.md` first. If the reference deck is only for style study, run:

```bash
s8fy pptx extract-style reference.pptx --output style.json --json
```

3. If the reference deck should become a reusable local template asset, run:

```bash
s8fy pptx import-template reference.pptx --name stable-id --output skills/pptx-nova/assets --json
```

This writes `decks/<id>/template.pptx`, `decks/<id>/profile.json`,
brand/layout/deck profile JSON, theme/style pack JSON, and updates
`brands/`, `layouts/`, `decks/`, and `themes/` catalog files. Use
`--overwrite` only when replacing the same imported id.

4. For whole-slide reuse, use:

```bash
s8fy pptx copy-from target.pptx --from reference.pptx --slide 0 --output out.pptx
```

5. For generated decks, start from `assets/examples/deck-generator-template.mjs`
   and pass selected theme/style IDs.

## Adding Assets

- Add metadata to the relevant `catalog.json` before adding binaries.
- Prefer `import-template` for reference PPTX ingestion so catalog entries and
  extracted profiles stay consistent.
- Record license/source before committing any logo, icon, image, or template file.
- Prefer native editable objects over SVG/image-only assets.
- For common deck icons, use the Tabler full icon pack:
  `icons/tabler-icons.pack.br` contains outline and filled icons, and
  `icons/icon-license` carries the Tabler MIT license. Agents should search or
  fetch icon names through `node <skill-root>/scripts/pptx-nova-icons.mjs ...`; DeckKit
  generators should read icons through `assets/deckkits/icon-assets.kit.mjs`
  instead of fetching icons online or reading the Tabler checkout during PPTX
  generation.
- Keep chart/table/diagram presets themePack-aware so `swap-theme` can recolor
  the resulting deck without regeneration.
