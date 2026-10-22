# HTML Template Reference Workflow

Use this supplement when the reference source is an HTML presentation template instead of a `.pptx` file.

## Goal

Turn browser-rendered HTML slide evidence into the same Phase 0 artifacts required for PPTX-derived DeckKits:

- `ref-previews/slide-XX.png` and `capture-manifest.json` (contact sheet when ImageMagick is available)
- `style-spec.md`
- `slide-inventory.md`
- `fidelity-scope.md`

The browser is the visual fact source. The HTML/CSS is the token and structure fact source.

## Capture Baseline Screenshots

Use `agent-browser` after reading its current `skills get core` output.

Recommended local-file flow (a new or empty output directory):

```bash
node deckkit-maker/scripts/capture-html-slides.mjs \
  --url /abs/path/template.html --out .tmp/deckkit-<id>/ref-previews \
  --viewport 1440x810 --json
```

The helper uses a unique session, freezes animation/transitions, hides common navigation UI,
activates slides via `.active`, and preserves their grid/flex display. It waits for fonts, decodes active-slide
`img` elements and waits two animation frames before checking slide bounds. Resource errors, timeouts,
hidden/offscreen/clipped slides and nonempty output directories fail instead of producing a successful manifest.
`--timeout-ms` defaults to 30000 per browser command. `--active-display` is only for templates that leave slides hidden.

This generic adapter does not drive arbitrary application state or deck transforms. For those templates,
use a dedicated session and record a template-specific activation script that:

- waits for `document.fonts.ready`
- decodes images and checks delayed CSS backgrounds, canvas, video/poster and application-rendered content as needed
- hides `#nav-dots`, slide counters, browser-only controls, and pagination UI
- disables deck transition and entry animation
- makes `[data-anim]` elements visible
- moves to each slide by changing the deck transform or clicking the real navigation

Do not use a fixed sleep or `networkidle` as proof of font/image readiness. The helper does not automatically
make `[data-anim]` descendants visible or verify CSS backgrounds/canvas; inspect each PNG and adapt templates
that need it. `fonts.ready` cannot prove that an unavailable system font has not fallen back: record actual font
substitution in the style spec. A geometrically valid slide can still have incomplete content.

Use absolute screenshot output paths. Some browser tools can treat relative `.tmp/...` paths as selectors or resolve them
against their own working directory.

The bundled `capture-html-slides.mjs` also creates `contact-sheet.png` with ImageMagick when `magick` or `montage` is
available. On macOS, do not rely on ImageMagick's empty/default font; pass `--contact-sheet-font` or set
`DECKKIT_CONTACT_SHEET_FONT` when needed. The script's default fallback checks the common macOS Arial/Helvetica font
paths before falling back to font names.

Read `contactSheet.generated` and `warning`; absence of ImageMagick is an explicit optional evidence gap.
The manifest records the local entry HTML hash (not a hash of all linked assets), browser user agent/DPR,
session, capture CSS, viewport, per-slide readiness/bounds and PNG hashes. For remote sources also retain
the DOM/CSS and linked asset identities used in the run; a URL alone cannot freeze mutable web content.
Use new directories for recapture. A supplied `--session` must belong to this task; it is closed on completion
unless `--keep-open` is set.

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
  verifies their current rendering, layer order and editable content visibility

For paper grain, hatch, noise, SVG pattern, or CSS texture effects, prefer editable PPTX approximations: flat fills,
thin rules, repeated native shapes, low-density hatch marks, or an explicit known limit. If a picture background is
unavoidable, validate layer order in the rendered PNG and in PowerPoint before freezing the kit.

A native pattern fill also needs that visual comparison: accepted schema/dry-run and a clean canonical report
do not prove the paper color survived. In the Long Table migration, `pct5` with explicit cream background rendered
white in canonical PNGs while PowerPoint displayed cream and dots. Preserve both samples, identify the renderer
boundary, and use an acceptable flat-fill approximation when the texture cannot survive the delivery route.
Do not turn this observed combination into a permanent ban on all native patterns.

## Unit Mapping

Use a 16:9 capture viewport so ratios map cleanly to PPTX:

- `1440×810` px -> `13.333×7.5in`
- `x_px / 1440 * 13.333` -> inches
- `y_px / 810 * 7.5` -> inches
- For this viewport, rendered font px maps proportionally via `px / 1440 * 13.333 * 72` to PPTX pt;
  first resolve `vw/rem` with browser computed styles. Do not apply an unrelated fixed 96-DPI conversion.

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
