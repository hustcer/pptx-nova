# Theme Packs / Style Packs

`themePack` controls semantic color, fonts, background, chart palette, and icon style. `stylePack`
controls density/rhythm choices such as title/body sizing, card radius, stroke, shadow, image ratio,
and header/footer rhythm.

## Commands

```bash
s8fy pptx list-themes --json
s8fy pptx swap-theme deck.pptx --to corporate-blue -o out.pptx
s8fy pptx swap-style deck.pptx --to consulting -o out.pptx
s8fy pptx apply-brand deck.pptx --brand brand-profile.json -o out.pptx
s8fy pptx extract-style reference.pptx --output style.json --json
```

`swap-theme` compiles the selected themePack into `apply-corporate-rebrand`, then reuses the normal
apply/dry-run/sidecar path. `swap-style` uses the same bottom layer for master placeholder and
presentation default text style; its density/radius/shadow/image-ratio fields are also consumed by
the JS generator template. `apply-brand` uses the same compiler for one-off brand profiles when the
user provides brand colors/fonts instead of selecting a built-in pack.
`extract-style` is the reverse direction: it reads an existing deck and writes a
`pptx-style-profile/v1` JSON file with theme colors/fonts, slide/layout semantics, and draft
`themePackDraft` / `stylePackDraft` entries. Review the draft before copying fields into
`assets/themes/catalog.json`; MVP extraction does not yet infer card radius, shadow, stroke, or
chart-specific style details.

## Capability Boundary

`stylePack.generator` tokens are full-fidelity inputs for `deck-generator-template.mjs` and custom
deck generators. They are not a promise that `s8fy pptx swap-style` will re-layout an arbitrary
existing deck. Today `swap-style` intentionally stays on the safe text-style surface: it updates
master placeholder/default title and body styles through the rebrand compiler, then preserves the
user's existing shapes, coordinates, card geometry, shadows, spacing, and chart layout.

Use `swap-style` when the deck structure should remain intact and title/body styling should change
quickly. Use a generator, recipe, or explicit patch ops when you need card rhythm, spacing, shadow,
chrome, or chart/callout proportions to change. Automatically deciding which existing shapes are
safe to reshape is a separate edit-mode problem and should not be implied by generator tokens.

## Built-Ins

Theme packs:

| id                | Best For                                  |
| ----------------- | ----------------------------------------- |
| `corporate-blue`  | Enterprise reporting, QBRs, board updates |
| `consulting-grey` | Dense strategy and analysis decks         |
| `startup-vibrant` | Pitch, launch, product roadmap decks      |
| `academic-formal` | Thesis defense, lectures, research decks  |
| `gov-blue`        | Government and public-sector reports      |
| `tech-dark`       | Technical keynotes, AI, data platforms    |
| `health-soft`     | Healthcare and life-science decks         |
| `minimal-mono`    | Minimal reports, internal memos           |

Style packs:

| id           | Best For                                                |
| ------------ | ------------------------------------------------------- |
| `consulting` | Dense executive-document rhythm                         |
| `minimal`    | Quiet low-density decks                                 |
| `product`    | Balanced product update decks with room for screenshots |

The source catalog is `assets/themes/catalog.json`. MoonBit CLI built-ins and the JS generator
built-ins are generated from that file; do not hand-edit `s8fy/cmd/main/pptx_theme_catalog.generated.mbt`
or `assets/examples/theme-packs.generated.mjs`.

Built-in style packs must include a complete `generator` object with `sizes`, `layout`, `surface`,
`effects`, `chrome`, and `chart`. `just theme` validates required fields, unknown fields, numeric
ranges, allowed shapes (`rectangle` / `rounded-rectangle`), and nullable shadow effect objects.
Keep the full consulting/minimal/product visual token values in `assets/themes/catalog.json`; the
JS template only carries a small compatibility fallback for external hand-written packs.

After changing the source catalog, run from the repository root:

```bash
just theme -g
just theme
```

The CLI exposes the generated schema-backed catalog through `s8fy pptx list-themes --json`.

## Generator Usage

```bash
node skills/pptx-nova/assets/examples/deck-generator-template.mjs \
  --theme corporate-blue \
  --style consulting > patch.json
```

For custom packs:

```bash
node generate.mjs --theme-pack ./theme.json --style-pack ./style.json > patch.json
```

The template derives `C`, `F`, `S`, `FONT_LATIN`, `FONT_EA`, and chart palette from the selected
packs. `S` is the resolved stylePack token set and drives layout rhythm (`marginX`, `gridGap`,
`rowGap`, card padding), surface treatment (card/panel shape, outline), effects (card/panel shadow),
chrome, and chart/callout proportions. Keep slide functions focused on content and semantic layout;
do not hand-edit `C` unless you are intentionally creating a new themePack, and do not bypass `S`
with fixed gaps/card shapes unless a slide-specific exception is documented.
