# pptx-nova

`pptx-nova` is an agent skill for creating, editing, refurbishing, and checking
PowerPoint presentations. It is designed to deliver real, editable `.pptx`
files, not slide screenshots pasted into a deck.

Use it when you want an AI agent to turn a brief, outline, document, table,
reference deck, or existing presentation into a polished PowerPoint file that
can still be edited in PowerPoint, Keynote, or compatible office suites.

## What pptx-nova can do

- Create a new presentation from a short brief, structured outline, document,
  PDF, web page, table, or spreadsheet.
- Refurbish an existing deck while preserving the original content and making
  the visual system cleaner and more consistent.
- Edit existing decks, including titles, copy, slide order, visuals, colors,
  charts, tables, and selected page elements.
- Follow a company template or reference deck without copying private or
  non-redistributable assets.
- Generate data-driven slides with native tables, charts, diagrams, and
  editable shapes where the toolchain supports them.
- Export PDF or PNG previews for review.
- Run quality checks for overlap, clipped text, layout drift, template
  violations, content preservation, and visual defects.

## Typical requests

You can start with a plain-language instruction:

```text
Use pptx-nova to create an 8-slide English product strategy deck for a SaaS
leadership team. Use a clean consulting style and save it as strategy-review.pptx.
```

Or ask it to refurbish an existing deck:

```text
Refurbish qbr.pptx. Keep the content and slide count, make the visual design more
consistent and executive-ready, and export qbr-refined.pptx plus PNG previews.
```

Or make a precise edit:

```text
Update sales-review.pptx: change the title on slide 2, replace the KPI table on
slide 5 with data from metrics.csv, and write the result to sales-review-v2.pptx.
```

## What to provide

You can give a single sentence, but results are usually better when you include:

- Purpose: pitch, board update, QBR, sales deck, training, proposal, lecture, or
  workshop.
- Audience: executives, customers, investors, sales teams, students, internal
  teams, or public conference attendees.
- Length: exact slide count or an approximate range.
- Language: English, Chinese, bilingual, or another target language.
- Source material: outline, notes, existing PPTX, PDF, CSV/XLSX, screenshots,
  links, product copy, brand assets, or a template deck.
- Style direction: formal, minimal, consulting, technical, editorial, product
  marketing, training-oriented, or strict brand template.
- Constraints: content that must not change, slides that must be preserved,
  whether restructuring is allowed, and the required output path.

By default, pptx-nova should not overwrite your original deck. Ask for a new
output filename unless you intentionally want to replace a file.

## Outputs

A normal run can produce:

- A final editable `.pptx` file.
- Optional PDF and per-slide PNG previews.
- JSON evidence from validation, dry-run, visual checks, template checks, or
  content-preservation checks.
- A short summary of what changed and any remaining review risks.

For high-stakes decks, treat the generated file as a strong draft and still do a
human review of facts, claims, numbers, brand compliance, and legal language.

## How it works

pptx-nova uses a DeckKit-first workflow. A DeckKit is a reusable visual system
with page types, layout contracts, schemas, typography, color rules, and
validation gates. The normal production path is:

```text
brief / source material
  -> outline and content model
  -> DeckKit selection
  -> validated content.json
  -> patch operations
  -> xdoc applies the patch
  -> visual and structural checks
  -> editable .pptx
```

This structure keeps the deck generation path repeatable. It also makes it
easier to catch overloaded slides, missing slots, unsafe custom operations, and
style mismatches before the final PPTX is delivered.

## Repository layout

```text
.
+-- pptx-nova/                 # The main publishable pptx-nova skill
|   +-- README.md              # Chinese user guide
|   +-- assets/                # DeckKits, examples, themes, icons, schemas
|   +-- benchmarks/visual/     # Visual benchmark cases and baselines
|   +-- references/            # Workflow references for agents and maintainers
|   +-- scripts/               # Runtime and maintainer helper scripts
|   `-- evals/                 # Skill evaluation metadata
+-- deckkit-maker/             # Developer-side helper skill for DeckKit creation
`-- tools/                     # Repository-level smoke and public-release checks
```

## DeckKit examples

Committed showcase assets live under `pptx-nova/assets/examples/`. They are
synthetic, redistributable examples, not customer materials. Each example
usually includes the generated editable `deck.pptx`, a compact contact sheet,
the source `content.json`, a brief, and summary metadata.

DeckKit runtime code lives under `pptx-nova/assets/deckkits/`. Use the bundled
catalog and validation scripts instead of ad hoc one-off slide generators for
ordinary deck delivery.

## Maintainer checks

Run the repository-level smoke test before publishing or packaging the skill:

```bash
node tools/pptx-nova-smoke-test.mjs
```

Run the public-audit gate when preparing a public release:

```bash
node tools/pptx-nova-audit-public.mjs --strict
```

The smoke test validates bundled DeckKit content, builds a patch, queries the
bundled icon pack, and checks DeckKit selection. The public audit scans for
machine-local paths, private repository context, unexpected binaries, missing
license requirements, and other release blockers.

`xdoc` is the primary external CLI used by pptx-nova for PowerPoint inspection,
patch application, conversion, and visual checks. Some metadata validation and
DeckKit selection scripts can run without `xdoc`, but real PPTX apply,
conversion, and vision-check workflows require it.

## About deckkit-maker

`deckkit-maker` is included as a companion developer skill. It exists to create,
repair, and benchmark new DeckKits for pptx-nova from a reference `.pptx` file
or an HTML slide template.

It is not the main user-facing deck generation path. For normal presentation
creation, editing, refurbishment, and QA, use `pptx-nova`. Use `deckkit-maker`
only when the existing DeckKits are not enough and the reusable visual system
itself needs to be built or extended.

## More documentation

- [pptx-nova user guide](pptx-nova/README.md)
- [pptx-nova scripts](pptx-nova/scripts/README.md)
- [pptx-nova assets](pptx-nova/assets/README.md)
- [DeckKits](pptx-nova/assets/deckkits/README.md)
- [DeckKit examples](pptx-nova/assets/examples/README.md)
