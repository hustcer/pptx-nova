# HTML Template Reference Workflow

Use this supplement when the reference source is an HTML presentation template instead of a `.pptx` file.

## Goal

Turn browser-rendered HTML slide evidence into the same Phase 0 artifacts required for PPTX-derived DeckKits:

- `ref-previews/slide-XX.png` and `contact-sheet.png`
- `style-spec.md`
- `slide-inventory.md`
- `fidelity-scope.md`

The browser is the visual fact source. The HTML/CSS is the token and structure fact source.

## Capture Baseline Screenshots

Use `agent-browser` after reading its current `skills get core` output.

Recommended local-file flow:

```bash
agent-browser --session <id>-html set viewport 1440 810
agent-browser --session <id>-html --allow-file-access open "file:///abs/path/template.html"
agent-browser --session <id>-html wait --load networkidle
```

Before screenshots, inject a capture stylesheet/script that:

- waits for `document.fonts.ready`
- hides `#nav-dots`, slide counters, browser-only controls, and pagination UI
- disables deck transition and entry animation
- makes `[data-anim]` elements visible
- moves to each slide by changing the deck transform or clicking the real navigation

Use absolute screenshot output paths. Some browser tools can treat relative `.tmp/...` paths as selectors or resolve them
against their own working directory.

The bundled `capture-html-slides.mjs` also creates `contact-sheet.png` with ImageMagick when `magick` or `montage` is
available. On macOS, do not rely on ImageMagick's empty/default font; pass `--contact-sheet-font` or set
`DECKKIT_CONTACT_SHEET_FONT` when needed. The script's default fallback checks the common macOS Arial/Helvetica font
paths before falling back to font names.

## Extract Structure

Record:

- Actual slide count from DOM, e.g. `document.querySelectorAll('.slide').length`
- Source order and classes, e.g. `slide--cover`, `slide--stats`
- Text samples per slide
- CSS variables for palette, fonts, type scale, spacing, motion
- Metadata mismatches between `template.json` and DOM

If metadata and DOM disagree, DOM + screenshots win; record the mismatch in `findings.md` and catalog `knownLimits`.

## Transfer Decisions

Transfer:

- static composition, palette, typography, spacing, chrome
- reusable page structures and content slots
- chart, process, comparison, list, image-shell, and diagram semantics
- placeholders/asset slots for image-bearing regions

Do not transfer:

- pagination dots, slide counters, keyboard handlers, scroll transforms
- entry/hover animations, JS transition timing, click-only affordances
- HTML-only responsive behavior that has no PPTX editing equivalent
- one-off remote images, screenshots, CSS background images, or decorative media
- full-slide SVG/bitmap texture backgrounds as direct `add-image` layers unless a minimal xdoc render experiment
  proves they do not create placeholder overlays or cover editable content

For paper grain, hatch, noise, SVG pattern, or CSS texture effects, prefer editable PPTX approximations: flat fills,
thin rules, repeated native shapes, low-density hatch marks, or an explicit known limit. If a picture background is
unavoidable, validate layer order in the rendered PNG and in PowerPoint before freezing the kit.

## Unit Mapping

Use a 16:9 capture viewport so ratios map cleanly to PPTX:

- `1440×810` px -> `13.333×7.5in`
- `x_px / 1440 * 13.333` -> inches
- `y_px / 810 * 7.5` -> inches
- `vw` font sizes can be mapped from `1440 * vw / 100` px, then approximated to PPTX points.

Do not preserve viewport-scaled type blindly. PPTX needs text to pass dry-run and vision gates; use the HTML scale as a
visual reference, then choose stable PPTX point sizes and text box heights.

## Phase 2 Notes

- Use the HTML example text only in `examples/<id>-content.json` and benchmark fixtures.
- Run content leak audit against a non-reference content patch, not the golden example patch. The golden patch is
  expected to contain reference text because its content fixture is the HTML example; it cannot distinguish legitimate
  content output from `.kit.mjs` hard-coded leaks.
- For HTML templates, catalog `knownLimits` should disclose:
  - source is HTML, not PPTX
  - browser-only interactions were excluded
  - any metadata vs DOM slide-count mismatch
  - any CSS-only visual that was approximated with editable PPTX shapes
