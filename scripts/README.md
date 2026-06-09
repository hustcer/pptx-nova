# pptx-nova Scripts

Bundled scripts in this directory are part of the published `pptx-nova` skill.
They must not depend on repository-root `tools/`, `Justfile`, or files outside
the skill directory.

Use these entry points from skill workflows:

- `pptx-nova-deckkit-select.mjs` - select an eligible DeckKit from the bundled catalog.
- `pptx-nova-deckkit-readiness.mjs` - audit catalog and visual benchmark readiness.
- `pptx-nova-deckkit-benchmark.mjs` - run bundled visual benchmark cases.
- `pptx-nova-deckkit-catalog-update.mjs` - update bundled DeckKit quality metadata.
- `pptx-nova-icons.mjs` - query and generate the bundled Tabler icon pack.

Repository-root `tools/` scripts may wrap or test these files during skill
development, but published skill users should call scripts from this directory.
