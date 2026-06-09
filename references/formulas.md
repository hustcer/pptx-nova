# Formulas

`pptx-nova` treats mathematical formulas as first-class semantic assets, not as
ordinary decorative pictures. The goal is to preserve the author's math intent
while choosing the most reliable PowerPoint representation for the task.

## Formula policy

Record the formula policy in `deck_lock.json.typography.formulaPolicy`:

| policy        | Use when                                                                                            | Output behavior                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `mixed`       | Default for technical, academic, and training decks                                                 | Keep simple inline math as editable text/Unicode; render complex formulas as formula assets.                                                |
| `text-only`   | Business decks or user explicitly values editability over typesetting                               | Use ordinary text boxes and Unicode symbols; no rendered formula assets.                                                                    |
| `rendered`    | Formula-heavy decks where visual fidelity matters                                                   | Render every formula-worthy expression as SVG/PNG formula assets.                                                                           |
| `native-omml` | User explicitly requests editable PowerPoint equations and the expression fits the supported subset | Use native equation insertion when `s8fy schema --op add-formula` documents native/OMML support; otherwise fall back according to the lock. |

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

| status        | Meaning                                              | Blocks delivery         |
| ------------- | ---------------------------------------------------- | ----------------------- |
| `available`   | User supplied or existing formula asset is available | No                      |
| `rendered`    | This run rendered the formula asset from LaTeX       | No                      |
| `native`      | This run inserted a native PowerPoint equation       | No                      |
| `placeholder` | Visual placeholder only                              | Yes for formal delivery |
| `needs-user`  | Needs user source, approval, or missing LaTeX        | Yes                     |
| `missing`     | Declared path does not exist                         | Yes                     |

Always set `pptxUse.noCrop: true` for formulas. Cropping a formula is almost always a
semantic error.

## Patch guidance

Preferred patch op once supported by the installed `s8fy`:

```json
{
  "op": "add-formula",
  "slide": 2,
  "x": "1.2in",
  "y": "2.0in",
  "w": "5.8in",
  "h": "0.9in",
  "latex": "\\frac{\\partial L}{\\partial \\theta}=0",
  "display": "block",
  "mode": "rendered",
  "color": "1F1F1F",
  "name": "S3_Formula_Objective"
}
```

Until `s8fy schema --op add-formula` is available, render the formula asset into the
run directory and insert it with `add-picture` using `assetSource.path`; still keep the
formula metadata in `assets_manifest.json`.

Simple inline formulas can stay in ordinary text when all of these are true:

- The expression is readable in plain text or Unicode (`E = mc^2`, `p < 0.05`, `A/B`).
- It does not need stacked fraction, large operator limits, matrix/cases, radical, or aligned equations.
- The user did not ask for formal mathematical typesetting.

Use rendered/native formula assets for:

- Fractions, matrices, cases, radicals, large operators with limits, aligned equations.
- Formula-heavy academic or engineering slides.
- Any expression where plain text would change meaning or readability.

## Verification

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

When exporting to PDF, run `s8fy check --checks fonts,links,compat` if the deck uses
native equations or math fonts; font fallback issues can change glyph coverage.
