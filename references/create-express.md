# Create Express Mode

Read this file for simple prompt-to-PPTX requests, "make it quickly" requests,
and cases where the user gives a concise topic or rough outline without asking
for detailed control.

Express mode is still delivery-quality by default. It has less ceremony, not
lower quality.

## Load Order

For Express creation read:

1. `common-workflow.md`
2. `deckkit-mode.md`
3. This file
4. `express-mode.md` when you need the full golden path details

Read `recipes.md` only for recipe-only drafts or tiny hand-authored pages. Read
`patch-ops-cheatsheet.md` only when DeckKit cannot express a required local
change.

## Default Behavior

Use reasonable assumptions and continue without blocking when:

- the user gives only a short prompt
- the user asks for speed
- the output is an internal draft or normal business deck
- the topic, audience, page count, and style can be inferred safely

Still create `outline.json` and `deck_lock.json` in the run directory. List the
main assumptions in the final summary.

## Minimal Express Pipeline

1. Create run directory and check final output collision.
2. Generate or normalize `outline.json`.
3. Generate `deck_lock.json` with canvas, DeckKit, theme/style, font, color,
   language, and page-type decisions.
4. Select a production/default DeckKit through `deckkit-mode.md`.
5. Write `content.json`.
6. Validate content in delivery mode.
7. Build patch with the selected DeckKit.
8. Run check-lock, dry-run, apply, vision-check, PNG/contact-sheet review.
9. Write final output and concise completion summary.

If no production/default DeckKit fits, do not silently build a huge one-off
patch. Either ask for approval to use a candidate/draft path, or create/extend a
DeckKit following `deck-generator-workflow.md`.

## When To Pause

Even in Express, pause for user input when:

- the requested final output path already exists
- the prompt is too ambiguous to infer audience or purpose
- required data, brand assets, or source files are missing
- the request is legally/brand sensitive and assumptions would be risky
- the user explicitly asks to approve the outline first

## Output Quality

Create workflows must satisfy the common gates. `vision-check` high/medium must
be 0 before delivery. PNG/contact-sheet review is still required for generated
decks because dry-run and geometry checks do not catch all text, contrast, and
visual rhythm problems.
