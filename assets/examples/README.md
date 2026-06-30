# pptx-nova DeckKit Examples

This directory contains committed, user-facing DeckKit showcase assets. These
examples are synthetic/generated showcase decks, not customer materials.
Each subdirectory is named after a DeckKit id and includes a native editable
`deck.pptx`, a compact `contact-sheet.webp`, the source `content.json`,
a short `brief.md`, and a stable `summary.json`.

Public release rule: only redistributable examples may live here. Do not commit
real customer PPTX files, private brand assets, screenshots from internal
systems, or reference decks copied from non-redistributable sources.

Update the showcase decks with:

```bash
just deckkit-examples
```

Update one DeckKit showcase by id:

```bash
just deckkit-examples -d broadside
```

Check that committed assets are in sync without writing files:

```bash
just deckkit-examples check
```

When DeckKit code, content, or xdoc output logic has not changed, repeating
`just deckkit-examples` should not create git-visible changes. A repeated
change in `deck.pptx`, `contact-sheet.webp`, `summary.json`, or
`manifest.json` is treated as a reproducibility bug.
