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
- `pptx-nova-check-lock.mjs` - validate `deck_lock.json`, `assets_manifest.json`,
  DeckKit content, and patch output before xdoc dry-run.
- `pptx-nova-refurbish-plan.mjs` - build the preflight route for existing-deck
  refurbishment: readiness exception, native skinning support, fallback strategy,
  duplicate chrome policy, and required gates.
- `pptx-nova-refurbish-fallback-patch.mjs` - generate generic inspect-driven
  fallback artifacts (`patch.json`, `deck_lock.json`, `content-audit.json`, and
  `reference-map.json`) for DeckKits without native skinning. It should use
  `refurbishProfile.fallback` when present and otherwise derive palette/fonts
  from `visualGrammar`; do not hardcode a single DeckKit id.
- `pptx-nova-refurbish-audit.mjs` - legacy supplemental Refurbish Existing Deck audit:
  use native `xdoc pptx refurbish-audit` as the default content-preservation gate;
  keep this script only for checks not yet native, especially OOXML visible text
  leaks and forbidden shape-name regex scans.
- `pptx-nova-template-gate.mjs` - validate strict template-following artifacts:
  frame-map coverage, empty placeholders, overlay-like additions, and identity
  asset provenance.

Repository-root `tools/` scripts may wrap or test these files during skill
development, but published skill users should call scripts from this directory.
