# Contract-driven DeckKits

Read this reference when a selected catalog entry has `designContract`. Other DeckKits keep their
existing workflow. The pilot is `biennale-yellow`; this is an opt-in extension, not a new xdoc format.

## Agent workflow

Discover only the selected design and its layout capacities:

```bash
node <skill-root>/scripts/pptx-nova-deckkit-design.mjs --deckkit biennale-yellow
```

Read `assets/deckkits/biennale-yellow/intent.md` for design judgment and the evidence page schema under
`assets/deckkits/schemas/biennale-yellow/` for content fields. The original eight page types and content
inputs remain supported. Use `biennaleEvidenceSlide` for a native numeric chart:

```json
{
  "type": "biennaleEvidenceSlide",
  "layoutId": "auto",
  "data": {
    "title": "Participation keeps growing",
    "label": "ANNUAL REGISTER",
    "source": "Source: annual participation register",
    "seriesName": "Participants",
    "unit": "people",
    "kind": "bar",
    "points": [
      { "label": "2024", "value": 120 },
      { "label": "2025", "value": 180 },
      { "label": "2026", "value": 240, "emphasis": true }
    ],
    "stats": [
      {
        "value": "240",
        "suffix": "",
        "label": "PARTICIPANTS",
        "description": "A wider public takes part."
      },
      {
        "value": "2",
        "suffix": "×",
        "label": "GROWTH",
        "description": "Participation doubled over two years."
      }
    ]
  }
}
```

Resolve before rendering when content fit or repetition is uncertain:

```bash
node <skill-root>/scripts/pptx-nova-deckkit-design.mjs \
  --deckkit biennale-yellow --content content.json --output design-preview.json
```

The report records eligible layouts, the selected layout, actual frames, title adaptation, requested
number format, geometry fingerprint and reasons. `auto` chooses deterministically from fitting layouts
and avoids repeated resolved compositions when alternatives fit. An explicit `layoutId` can be
`chart-left`, `chart-wide` or `chart-top`; explicit choices do not bypass capacity checks.
If only one layout fits, repetition is disclosed. Do not delete data or invent another proof object
just to meet a variety target.

For decks made entirely of evidence slides, diversity is assessed from resolved compositions rather
than the legacy page-type groups. `auto` favors less-used fitting compositions and avoids consecutive
repetition when alternatives fit. Explicit repeated layouts produce a review warning. Legacy and
mixed page-type decks retain their existing group checks.

Keep using `validate-content.mjs`, `pptx-nova-build.mjs` and `pptx-nova-create-run.mjs`. Builds with an
output patch also save `design-contract.json`, `design-plan.json` and `design-check.json` beside it.
The standard create runner automatically inspects the candidate, exports its native chart data and
writes `design-readback.json`. Those artifacts are retained and bound to finalization. A changed
contract requires a new candidate. Choreography composition rechecks the design and updates the
final patch binding before apply.

For manual pipelines, after dry-run/apply save `xdoc pptx inspect ... --json` and
`xdoc convert ... --to json --output model.json`, then run:

```bash
node <skill-root>/scripts/pptx-nova-deckkit-design.mjs \
  --deckkit biennale-yellow --plan design-plan.json --patch patch.json \
  --inspect inspect.json --model model.json --output design-readback.json
```

Readback checks object identity, geometry, native chart presence, category labels, series names and
numeric values. It does not prove full chart XML/workbook equality, effective theme inheritance or
PowerPoint parity. Actual PNG/PDF review and the existing canonical visual gate remain mandatory.
Visible numeric formatting is separate from raw source values. Unsupported number formats may use
the renderer's full-value fallback; inspect the visible output rather than claiming the requested
format was applied.

## Maintainer boundary

The published runtime uses only Node built-ins and xdoc. The design schema is a bounded first-party
schema, validated by `design-contract.mjs`; this is not an exported general-purpose JSON Schema
implementation. Unknown fields/checkers and invalid token references fail. Current checks cover
palette, font families, a font floor, forbidden effects/operations and creation bounds. The public
readback report names its coverage; a rule's presence alone is never visual proof.

Legacy repeating slots are resolved per instance. Composed fields such as value+suffix share one
budget. Capacity estimates are heuristics; autofit slots explicitly require render review. Existing
design-less DeckKits retain their original checks. `core-primitives.kit.mjs` remains unchanged.

Edit the selected contract rather than hand-editing generated budgets or projected refurbishment
tokens. In a source checkout, the maintainer-only projection command is
`node tools/generate-pptx-design-projections.mjs biennale-yellow`, followed by the same command with
`--check`. That tool is not needed or distributed as a user workflow dependency. Keep new design
languages opt-in; shared semantics do not require every design to use the same visual components.
