# Contract-driven DeckKits

Read this reference when a selected catalog entry has `designContract`. Other DeckKits keep their
existing workflow. The opt-in designs are `biennale-yellow`, `black-gold`, `green-slate` and `clear-value`; this is a pptx-nova
extension, not a new xdoc format.

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

### Editorial family: Black Gold

`black-gold` uses the `editorial-ledger/v1` family with six content types: `ledgerCoverSlide`,
`ledgerSummarySlide`, `ledgerTrendSlide`, `ledgerMatrixSlide`, `ledgerRankingSlide`,
`ledgerDecisionSlide`. Discover its own contract and content schemas; do not reuse Biennale fields.
Its example is `assets/deckkits/examples/black-gold-content.json`.

Trend pages choose full-width, explanation rail or a supporting native chart. Rankings choose a
KPI rail or a lower KPI band. Matrices support bounded row densities. Content capacity and the
geometry fingerprint, rather than random positions, determine valid changes. Repetition warnings
remain review inputs. Full decks use light evidence and dark summary/action stages; an explicit
`meta.designScope: "excerpt"` allows long evidence excerpts without inventing narrative stages.

Each body page requires assertion, basis, source, as-of, unit and verdict. Cover fields differ and
do not contain unused body slots. Dual-unit trends use `chart.categories` once; `secondary` supplies
only kind/name/unit/values and inherits those categories. Current tested JSON projection omits a
combo group, so the adapter uses two independently verifiable native plots.

Matrix input has five headers and 3–5 rows (`name`, numeric `amount`, numeric `share` from 0–100,
`representative`, `thesis`), plus `totalLabel`. The native table retains every cell's text. Share bars
are editable shapes computed from the same source numbers; editing cells manually in PowerPoint
does not automatically update the bars. Regenerate from content to keep them synchronized.
Cells use one authored paragraph with automatic wrapping. Native cell style/OOXML equality is not
proved by cell-text readback.

Gold focus is counted from actual styled objects/points, with the cover rule exempt as structure.
Bar/column focus uses an outline to avoid large accent fills; line endpoints use a small gold marker.
The palette, typography, flat effects, chart kinds, axis/grid and table-rule restrictions are checked
in patch operations. Gold pixel area, assertion quality and overall aesthetics require visual review.
Native-table creation also runs the semantic audit and binds its report to finalization.

The optional [finance research policy](policies/finance-research.md) applies when requested content
requires it; skin selection does not activate financial assumptions or conclusions. The kit is a
candidate migration, not an automatic production/default choice or a verified refurbishment route.

### Strategy family: Green Slate

`green-slate` uses `strategy-report/v1`: a charcoal/forest/mint report with ten content types for
cover, summary, intervals, matrix, roadmap, value, flow, section, notice and closing. Read
`assets/deckkits/green-slate/intent.md`, discover its design and slots, and start from
`assets/deckkits/examples/green-slate-content.json`. Do not reuse another family's field names.

Rail/wide intervals and vertical/horizontal flows change geometry for the same content. Matrix
full/compact variants change density. Selection is deterministic from fit and recent layout history;
explicit `layoutId` must also fit. Matrices accept 3–6 columns and rows with column weights/alignment.
Intervals accept 2–6 categories with finite `0 <= low <= high`. Line series accept 2–8 categories;
flows accept 3–5 steps (vertical at most three); roadmaps accept 3–4 positive-duration phases with one
activity per track/phase. Exact capacities and visible fields are in the selected schema and contract.

Interval plots stack the lower bound and remaining span; exact bounds remain directly labeled.
Tiny and negative native line observations are retained without promising individual pixel visibility
on a shared linear scale. Native tables retain literal cell strings. Owned circle text is centered in
both axes, label text shares its background frame, and roadmap captions reserve space below rules.
Style checks reject unsupported chart kinds, effects, pictures and unstyled table cells; applied
readback includes shape-owned text and explicitly set frame anchors. These checks cannot establish
optical centering or replace per-page visual review.

Every body page includes title, basis, source, as-of and verdict. Full-deck/excerpt semantics follow
the declared `meta.designScope`. The skin carries no business assumptions: claims, labels, units,
dates, durations and data remain content. CJK rendering was checked with Arial Unicode MS; font
availability and regular/bold output require rechecking on another machine. Fonts are not bundled.

### Annual research family: Clear Value

`clear-value` uses `annual-research/v1`: white pages, serif headings, black rules, restrained teal
current evidence, gray history and conclusion-only terracotta. Discover its eight `value*Slide`
schemas and read `assets/deckkits/clear-value/intent.md`. The example covers cover, summary, evidence,
matrix, chart/table composite, timeline, decision and argument. The skin carries no business policy.

Evidence accepts 1–4 figures: rail/wide for one, paired for two, lead for three, quad for four.
Argument column/split and matrix full/compact change geometry or density. Capacity checks use the
actual figure count, composed series head, weighted columns, row count and positive phase duration.
Generic repeated-field budgets are discovery hints; resolved checks govern these inputs. Overflow
fails before operations rather than shrinking fonts. All pages require title, basis, source, as-of
and verdict. `meta.designScope: "excerpt"` supports standalone evidence.

Charts support bar, column, line and native doughnut, plus two data-derived editable circles.
Native JSON calls doughnut `ring`; readback normalizes only that verified alias and still checks
every category, series name and raw value. Lines show first/last values in the figure head because
selective classic endpoint value labels were not supported by the tested runtime. Forecasts use
single-series columns: `forecastFrom` is the last observed zero-based category index; subsequent
columns are dashed outlines. Stacked labels use light backgrounds and dark text. A common linear
axis does not make tiny observations separately visible. Circle area, rather than diameter, tracks
value; regenerate to synchronize these shapes after data changes.

Matrices have 2–7 weighted/aligned columns and bounded rows; exact per-type limits live in schemas.
Each cell/header is one authored paragraph with automatic wrapping. Native readback checks literal
cell text, not complete table XML or visual styling. Timeline widths encode positive durations,
with a separate risk table and reserved lower note. Actual Latin/CJK regular/bold rendering and
every accepted PNG still require review. Fonts are not bundled; no PowerPoint parity is inferred.

### Shared contract boundaries

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
