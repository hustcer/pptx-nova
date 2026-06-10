# DeckKit Mode

Read this file for any create workflow that can use an existing DeckKit, and for
maintaining user-facing DeckKit examples.

DeckKit is the default path for delivery-quality new decks. It keeps the visual
language, page geometry, density limits, and reusable components in a frozen
generator so ordinary creation only needs a small `content.json`.

## Selection

Before writing `content.json`, select a DeckKit from
`assets/deckkits/catalog.json`:

```bash
node <skill-root>/scripts/pptx-nova-deckkit-select.mjs --target delivery
```

Use the selected DeckKit's `visualGrammar` as the deck's visual contract:
positioning, mood, signature elements, composition rules, and avoid list.

For the selected DeckKit, run readiness:

```bash
node <skill-root>/scripts/pptx-nova-deckkit-readiness.mjs \
  --deckkit <id> \
  --target delivery
```

Delivery auto-selection only allows `readiness in ["production", "default"]`.
Use `candidate` only for drafts, migration checks, or explicit human approval.

## Production Path

Use this flow for DeckKit-first creation:

```text
outline.json
  -> deck_lock.json
  -> content.json
  -> validate-content.mjs
  -> createDeck(content)
  -> check-lock
  -> s8fy pptx apply --dry-run
  -> apply
  -> vision-check
  -> PNG/contact-sheet review
```

The important command sequence is:

```bash
node <skill-root>/assets/deckkits/validate-content.mjs \
  content.json --deckkit <id> --mode delivery
node build.mjs content.json > patch.json
node <skill-root>/scripts/pptx-nova-check-lock.mjs \
  --lock deck_lock.json --content content.json --patch patch.json --json
s8fy pptx apply -p patch.json -o out.pptx --dry-run --json
s8fy pptx apply -p patch.json -o out.pptx --json
s8fy pptx vision-check out.pptx --json
```

Build glue can be the DeckKit example build script, or a short run-dir
`build.mjs` that imports `createDeck` from the selected `.kit.mjs`. Keep the
content layer separate from the visual generator.

## Content Rules

`content.json` is the change layer. It should contain business content, page
types, and structured slide data. Do not put arbitrary `customOps` in delivery
content unless the DeckKit contract explicitly allows it.

Run validation before dry-run. In delivery mode, missing required slots,
disallowed `customOps`, blocking fit diagnostics, and diversity gate failures
must be fixed before any apply.

If validation reports density/fit warnings, prefer deleting text, splitting
slides, changing a slide type, or using a DeckKit-supported layout variant.
Avoid patching around the DeckKit with raw coordinates.

## When DeckKit Is Not Enough

Do not fall back to a one-off large patch just because a page is hard. If the
deck needs a new reusable page type, component, or visual language, read
`deck-generator-workflow.md` and create or extend a DeckKit. The old showcase examples have retired as the production path; production and regression now
flow through DeckKit plus `benchmarks/visual/`.

Use `assets/examples/deck-generator-template.mjs` only as a development starting
point for creating or extending DeckKits. Do not use it as the default delivery
path when a production/default DeckKit is available.

## User-Facing Examples

Curated examples live in:

```text
assets/examples/<deckkit>/
```

Each directory contains `deck.pptx`, `contact-sheet.webp`, `content.json`,
`brief.md`, and `summary.json`. Use them to understand the DeckKit's expected
content shape and visual output.

Maintain examples with:

```bash
just deckkit-examples
just deckkit-examples check
just deckkit-examples all
```

The update script runs golden benchmark cases, verifies gates, converts contact
sheets to WebP, and writes only changed hashes. When DeckKit code, content, and
s8fy output logic do not change, repeated `just deckkit-examples` runs should
not create git-visible changes.

## Deep References

- `express-mode.md` for quick prompt-to-deck creation.
- `deck-generator-workflow.md` for creating/extending DeckKits.
- `design-lock-and-assets.md` for `deck_lock.json` and asset manifests.
- `visual-qa-and-asset-slots.md` for image slots and visual QA.
- `rich-deck-patterns.md` only when a DeckKit is unavailable and the deck needs
  manual richness patterns.
