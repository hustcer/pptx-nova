# pptx-nova DeckKit Examples

This directory contains committed, user-facing DeckKit showcase assets.
Each subdirectory is named after a DeckKit id and includes a native editable
`deck.pptx`, a compact `contact-sheet.webp`, the source `content.json`,
a short `brief.md`, and a stable `summary.json`.

Update the showcase decks with:

```bash
just deckkit-examples
```

Check that committed assets are in sync without writing files:

```bash
just deckkit-examples check
```

When DeckKit code, content, or xdoc output logic has not changed, repeating
`just deckkit-examples` should not create git-visible changes. A repeated
change in `deck.pptx`, `contact-sheet.webp`, `summary.json`, or
`manifest.json` is treated as a reproducibility bug.
