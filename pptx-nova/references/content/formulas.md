# Formulas

`pptx-nova` treats mathematical formulas as first-class semantic assets, not as
ordinary decorative pictures. The goal is to preserve the author's math intent
while choosing the most reliable PowerPoint representation for the task.

## Formula policy

Record the formula policy in `deck_lock.json.typography.formulaPolicy`:

| policy        | Use when                                                                                            | Output behavior                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `mixed`       | Default for technical, academic, and training decks                                                 | Keep simple inline math as editable text/Unicode; render complex formulas as formula assets.                                         |
| `text-only`   | Business decks or user explicitly values editability over typesetting                               | Use ordinary text boxes and Unicode symbols; no rendered formula assets.                                                             |
| `rendered`    | Formula-heavy decks where visual fidelity matters                                                   | Use the runtime's disclosed SVG typesetter or supply a typeset SVG through `add-equation.assetSource`.                               |
| `native-omml` | User explicitly requests editable PowerPoint equations and the expression fits the supported subset | Use `add-equation` with `mode: "native-omml"`; use SVG for unsupported formulas only when the task permits that loss of editability. |

Default to `mixed` when the prompt contains LaTeX, `$...$`, `$$...$$`, equation-heavy
source text, or terms like formula / equation / 数学公式 / LaTeX / OMML. In Studio
or high-risk decks, include the formula policy in the one-time design lock confirmation.

Do not invent equations to make a slide look more technical. Formula assets must come
from the user prompt, source material, data, or a clearly stated derivation needed by the deck.

## Lock and manifest

When any formula is rendered or inserted natively, write formula intent into the run files:

`deck_lock.json`:

```json
{
  "typography": {
    "formulaPolicy": "mixed",
    "formulaFallback": "rendered",
    "mathFont": "Cambria Math, Latin Modern Math, Noto Sans Math"
  },
  "slides": [
    {
      "index": 2,
      "title": "Model objective",
      "slideType": "formulaSlide",
      "rhythm": "breathing",
      "formulas": ["objective_loss"]
    }
  ]
}
```

`assets_manifest.json`:

```json
{
  "schemaVersion": "pptx-nova-assets-manifest/v1",
  "assetRoot": "assets",
  "entries": [
    {
      "id": "objective_loss",
      "kind": "formula",
      "status": "rendered",
      "path": "assets/formulas/objective_loss.svg",
      "source": {
        "kind": "formula",
        "latex": "L(\\theta)=\\sum_{i=1}^{n}(y_i-f_\\theta(x_i))^2",
        "display": "block"
      },
      "pptxUse": {
        "role": "formula-block",
        "crop": "contain",
        "noCrop": true,
        "altText": "L(theta)=sum residual squared"
      }
    }
  ]
}
```

Formula entries use `kind: "formula"` and one of these statuses:

| status        | Meaning                                                       | Blocks delivery         |
| ------------- | ------------------------------------------------------------- | ----------------------- |
| `available`   | User supplied or existing formula asset is available          | No                      |
| `rendered`    | This run materialized an SVG; verify its provider and content | No                      |
| `native`      | This run inserted a native PowerPoint equation                | No                      |
| `placeholder` | Visual placeholder only                                       | Yes for formal delivery |
| `needs-user`  | Needs user source, approval, or missing LaTeX                 | Yes                     |
| `missing`     | Declared path does not exist                                  | Yes                     |

Always set `pptxUse.noCrop: true` for formulas. Cropping a formula is almost always a
semantic error.

For native equations or SVGs generated inside the PPTX by the CLI, retain the expression,
chosen mode, patch and output evidence. A manifest `path` must name a real materialized file;
omit it for a semantic-only formula record rather than inventing a separate SVG path.
Such a record is not an image-slot asset until a real image file is available.

## Patch guidance

First inspect the installed runtime, then dry-run the exact expressions against the intended deck:

```bash
xdoc --version
xdoc schema --mode ops --ops add-equation
xdoc pptx apply --input candidate.pptx --patch formulas.patch.json --dry-run --json
```

Use the runtime's capability disclosure and actual results, not its version number or an
older schema snapshot. When it discloses built-in SVG typesetting, `rendered` (also the default)
produces mathematically typeset vector SVG:

```json
{
  "op": "add-equation",
  "slide": 2,
  "x": "1.2in",
  "y": "2.0in",
  "w": "5.8in",
  "h": "0.9in",
  "latex": "\\frac{\\partial L}{\\partial \\theta}=0",
  "display": true,
  "name": "S3_Formula_Objective"
}
```

For syntax outside the disclosed subset, or when another renderer is needed for typography,
supply an SVG actually produced by that renderer. Supplied SVG bypasses the built-in LaTeX
parser; retain the LaTeX as semantic metadata and verify that it matches the image:

```json
{
  "op": "add-equation",
  "slide": 2,
  "x": "1.2in",
  "y": "2.0in",
  "w": "5.8in",
  "h": "0.9in",
  "latex": "\\frac{\\partial L}{\\partial \\theta}=0",
  "mode": "rendered",
  "display": true,
  "assetSource": {
    "path": "formulas/s3-objective.svg",
    "mimeType": "image/svg+xml"
  },
  "name": "S3_Formula_Objective"
}
```

Preferred patch op for an editable PowerPoint equation when the formula fits the
native subset:

```json
{
  "op": "add-equation",
  "slide": 2,
  "x": "1.2in",
  "y": "2.0in",
  "w": "3.2in",
  "h": "0.7in",
  "latex": "E=mc^2",
  "mode": "native-omml",
  "name": "S3_Formula_Energy"
}
```

In `mode: "native-omml"`, `display` is ignored. In built-in SVG typesetting it selects
the math style; `display: false` requests inline style. The rendered `x/y/w/h` frame is
a centered contain box when the SVG has a known intrinsic aspect ratio. Supplied SVG
bytes remain unchanged; without an intrinsic ratio, the explicit frame is retained.

If an older runtime emits literal LaTeX text or reports `formula-fallback-svg`, that is
draft output, not mathematical typesetting. Use a supplied typeset SVG for final output,
or an appropriate current runtime whose disclosure and dry-run confirm the required behavior.

## Render manifest

Only when a literal-LaTeX draft SVG is intended, use the bundled helper with a dedicated
`formula-drafts.json` manifest containing just those entries and fresh output paths:

```bash
node <skill-root>/scripts/cli/assets/formula-render.mjs formula-drafts.json
```

Useful variants:

```bash
node <skill-root>/scripts/cli/assets/formula-render.mjs formula-drafts.json --dry-run
node <skill-root>/scripts/cli/assets/formula-render.mjs formula-drafts.json --out formula-drafts.rendered.json
node <skill-root>/scripts/cli/assets/formula-render.mjs formula-drafts.json --asset-root assets
```

The current bundled provider is `text-svg`: a deterministic offline SVG text wrapper.
It escapes and displays the literal LaTeX source; it does not typeset fractions,
radicals, matrices, or other LaTeX notation. Its `rendered` status means that an
SVG file was materialized, not that the formula was mathematically typeset.
It writes SVG files, updates formula entries to
`status: "rendered"`, records `render.mime: "image/svg+xml"`, and enforces
`pptxUse.noCrop: true`. This helper is separate from the CLI's disclosed math typesetter.
For final formulas, choose native OMML, built-in CLI typesetting, or externally typeset
SVG according to the task and keep the corresponding formula evidence.

The helper processes every formula entry regardless of `available`, `rendered`, or `native`
status and overwrites the resolved SVG path. Do not pass a mixed manifest containing supplied,
externally typeset, or native formulas. `--out` redirects only the updated manifest, not the SVG
writes. After reviewing draft outputs, merge only their intended entries into the run's main
manifest; preserve other assets and formula records.

Simple inline formulas can stay in ordinary text when all of these are true:

- The expression is readable in plain text or Unicode (`E = mc^2`, `p < 0.05`, `A/B`).
- It does not need stacked fraction, large operator limits, matrix/cases, radical, or aligned equations.
- The user did not ask for formal mathematical typesetting.

Use rendered/native formula assets for:

- Fractions, matrices, cases, radicals, large operators with limits, aligned equations.
- Formula-heavy academic or engineering slides.
- Any expression where plain text would change meaning or readability.

## Supported expression planning

When the runtime discloses the bounded compositional subset, native OMML and built-in
SVG typesetting share its parser. Pass the expression body without `$` delimiters;
escape literal TeX reserved characters, such as `100\%`. Respect the disclosed length
and nesting limits, fixed symbol vocabulary and exact-expression dry-run result.

| Expression shape                                                 | Examples                                              | Disclosed compositional subset                       |
| ---------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| Rows with fractions or roots, including nested arguments         | `E=\frac{a}{b}`, `\sqrt{a^2+b^2}`, `\frac{a}{b}\le 1` | Native or built-in SVG                               |
| Local scripts followed by more arithmetic                        | `a^2+b^2=c^2`, `W_a=W_b`                              | Native or built-in SVG                               |
| Both script orders and grouped bases                             | `x_i^2`, `x^2_i`, `{a+b}_i^2`                         | Native simultaneous sub/superscripts or built-in SVG |
| Sum/product/integral operators and limits                        | `\sum_{i=1}^{n}w_i`, `\int_0^T v(t)\,dt`              | Native n-ary structure or built-in SVG               |
| TeX environments, matrices/cases, user-defined or unknown macros | `\begin{matrix}...\end{matrix}`, `\custom{x}`         | Supply externally typeset SVG                        |

Scripts attach to the preceding atom or explicit group, preserving the rest of the row.
Keep an accepted composed expression in one equation so later edits and translation retain
its structure. In this subset, an n-ary operator's body consumes the following product up
to the next top-level additive/relation operator. Use braces for a larger body, such as
`\sum_{i=1}^{n}{a_i+b_i}`, and review that boundary in the output.

Unknown macros or malformed structures are rejected without substituting literal text.
Changing only `mode` to `rendered` does not bypass the shared parser. Use `mode: "rendered"`
with a supplied, typeset SVG for syntax beyond the subset; switching representation must
still satisfy the task's editability requirement. Older runtimes may support a narrower
subset, so use their actual results to select the representation.

## Verification

For imported MathType/OLE equations, keep the embedded object and its preview
relationship/crop. WMF comments carry baseline metadata, not horizontal padding;
the current renderer uses saved text alignment and window/viewport mapping.
Re-render the unchanged source before adding offsets, removing crop or replacing
the equation. A corrected preview is not native OMML conversion or newly editable
math. Follow `../edit/native-shape-editing.md` for host geometry and resource ownership.

Formula decks still pass the normal gates:

```
check-lock -> dry-run -> vision-check -> PNG/contact-sheet
```

Add formula-specific checks during PNG review:

1. Formula is not cropped and has enough padding.
2. Formula color has sufficient contrast on the slide background.
3. Inline formulas align with surrounding text baseline closely enough to read.
4. Block formulas have stable visual rhythm and do not overpower the slide title.
5. The final summary mentions whether formulas are editable text, rendered assets, or native equations.

For composed or dense math, also check operators, literal percent signs, both script slots,
grouped bases and n-ary body boundaries in the actual target consumer. A structurally valid
PPTX does not prove mathematical correctness. When a discrepancy needs an independent
reference, compare the same candidate in PowerPoint and the target preview/export;
record font/size differences separately from lost content or collisions.

For an imported native equation, retain attributed OMML text, including `m:t`
with `xml:space` or other attributes, whitespace, fractions and sub/superscript
structure. Re-render the same source with the current runtime before diagnosing
missing math text or replacing it with an image. Restored content and remaining
math metric differences are separate findings.

When exporting to PDF, run `xdoc check --checks fonts,links,compat` if the deck uses
native equations or math fonts, then review actual glyphs; the font preflight
does not prove codepoint coverage. SVG formula/image text needs resolved PDF font
bytes independently of browser CSS font readiness; inspect local SVG text and
inherited inline styles, and do not assume external images/stylesheets were
fetched. See `../review/export-and-check.md` for the distinct font-evidence boundaries.

## Diagnose native equation metrics

For an imported equation, keep its OMML and authored frame while diagnosing a
preview difference. The creation policies above do not authorize converting an
existing editable equation into a formula image.

Distinguish three facts: the declared math family, the effective inherited point
size, and the glyphs/metrics actually used by each consumer. Inspect OMML run and
control properties plus paragraph/list/presentation defaults; a nearby label's
size or an end-paragraph property alone does not establish the equation's size.
A successful ordinary-font report, or no reported substitution, does not prove
that the mathematical glyph path used that family. Record missing math-font
coverage as unverified; installing the declared font need not change a renderer
that uses built-in mathematical outlines.

Compare a complete expression first, then operator ink, limits/scripts and host
anchoring separately. Display style, n-ary limit placement and physical point
size are separate decisions. Different operator variants and font-specific MATH
metrics can change height without a font-size change; repeated synthetic margins
can accumulate width without changing any authored spaces. A single crop's
width/height ratio cannot identify either cause.

For an independent comparison, retain the same PPTX hash, logical slide/object,
DPI and rasterizer identity; rasterizing both exported PDFs with the same engine
helps isolate layout from antialiasing. Reduce to one native expression in a new
diagnostic copy and retain the original OMML. Do not substitute a LaTeX rewrite,
shrink the authored font or scale the screenshot to make the evidence agree.
Report a corrected spacing defect separately from remaining font/variant or
script-layout differences; neither a passing structural check nor one improved
bounding box establishes PowerPoint-equivalent mathematics.
