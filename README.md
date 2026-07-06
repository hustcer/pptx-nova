# pptx-nova

`pptx-nova` is an agent skill for creating, editing, refurbishing, and checking
PowerPoint presentations. It is designed to deliver real, editable `.pptx`
files, not slide screenshots pasted into a deck.

Use it when you want an AI agent to turn a brief, outline, Markdown/text
document, pasted table, CSV/JSON data, reference deck, or existing presentation
into an editable PowerPoint file. The primary target is PowerPoint; Keynote and
other compatible office suites can usually open the result, subject to their
PPTX compatibility.

## What pptx-nova can do

- Create a new presentation from a short brief, structured outline,
  Markdown/text document, PDF, web page, pasted table, or CSV/JSON data.
- Refurbish an existing deck with the goal of preserving the original content
  while making the visual system cleaner and more consistent.
- Translate an existing `.pptx` into another language while aiming to preserve
  original deck structure, layout, styles, objects, notes, animations, and
  visual hierarchy.
- Edit existing decks, including titles, copy, slide order, visuals, colors,
  charts, tables, and selected page elements.
- Use a company template or reference deck as a guide while avoiding
  unapproved reuse of private or non-redistributable assets.
- Generate data-driven slides from CSV/JSON data, using editable tables,
  charts, diagrams, and shapes where supported.
- Export PDF or PNG previews for review.
- Run quality checks that look for overlap, clipped text, layout drift,
  template violations, content-preservation issues, and visual defects.

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

Or translate a presentation in place:

```text
Translate product-launch.pptx from Chinese to English. Preserve the original
layout, formatting, charts, speaker notes, animations, and slide count. Use
concise US English terminology and write product-launch-en.pptx.
```

## What to provide

You can give a single sentence, but results are usually better when you include:

- Purpose: pitch, board update, QBR, sales deck, training, proposal, lecture, or
  workshop.
- Audience: executives, customers, investors, sales teams, students, internal
  teams, or public conference attendees.
- Length: exact slide count or an approximate range.
- Language: English, Chinese, bilingual, or another target language.
- Source material: outline, notes, Markdown/text content, existing PPTX, PDF,
  CSV/JSON, screenshots, links, product copy, brand assets, or a template deck.
- Translation target, when translating: source language if mixed or ambiguous,
  target language and locale, terminology preferences, tone, and whether chart
  labels, alt text, link text/tooltips, or speaker notes should be localized.
- Style direction: formal, minimal, consulting, technical, editorial, product
  marketing, training-oriented, or strict brand template.
- Constraints: content that must not change, slides that must be preserved,
  whether restructuring is allowed, and the required output path.

By default, pptx-nova should not overwrite your original deck. Ask for a new
output filename unless you intentionally want to replace a file.

HTML, web pages, and PDFs are treated as source material. They are first
normalized into text or Markdown and then routed through the deck workflow;
pptx-nova does not promise to copy their original page layout, imagery, or
styles into PowerPoint one-to-one.

## Outputs

A normal run can produce:

- A final editable `.pptx` file.
- Optional PDF and per-slide PNG previews.
- Optional validation reports for visual checks, template checks, and
  content-preservation checks.
- For translation runs, optional bilingual review notes that show what was
  translated, what was intentionally shortened, and any layout risks that still
  deserve human review.
- A short summary of what changed and any remaining review risks.

For high-stakes decks, treat the generated file as a strong draft and still do a
human review of facts, claims, numbers, brand compliance, and legal language.

## How it works

pptx-nova uses a DeckKit-first workflow. A DeckKit is a reusable visual system
with page types, layout rules, typography, color rules, and quality checks. The
normal production path is:

```text
brief / source material
  -> outline and slide content
  -> visual system selection
  -> editable PowerPoint build
  -> quality checks and previews
  -> editable .pptx
```

This structure keeps the deck generation path repeatable. It also makes it
easier to catch overloaded slides, missing content, style mismatches, and visual
defects before the final PPTX is delivered.

## Translating presentations

Translation is handled as a style-preserving edit, not as deck recreation. The
source deck stays read-only, and the translated file is written to a separate
output path.

For translation requests, provide at least:

- Source `.pptx` path.
- Target language, and source language when the deck is mixed-language or
  ambiguous.
- Output `.pptx` path.
- Terminology, locale, tone, or brand wording requirements.

Translation aims to preserve bold, italic, underline, strikethrough, colors,
fonts, alignment, bullets, indentation, text box geometry, table and chart
styling, hyperlinks, notes, animations, and transitions unless you explicitly
ask for a broader redesign.

Because translated text often expands or wraps differently, fitting fixes should
be conservative: first use shorter wording without changing the meaning, then
make small font-size adjustments if needed, and only change text box geometry
when the slide clearly has room.

Translation checks should cover more than ordinary slide text. Chart titles,
series names, category labels, data labels, table cells, alt text, hyperlink
tooltips, and speaker notes can also contain user-visible text and may need
translation.

Do not treat a translated deck as complete just because text replacement
succeeded. The final review must confirm that the target-language deck still
looks like the source deck, has no remaining source-language visible text that
should have been translated, and has no new clipping, overlap, broken chart
labels, lost formatting, or PowerPoint repair issues.

## Repository layout

```text
.
+-- pptx-nova/                 # The main publishable pptx-nova skill
|   +-- README.md              # Chinese user guide
|   +-- assets/                # DeckKits, examples, themes, icons, schemas
|   +-- benchmarks/visual/     # Visual benchmark cases and baselines
|   +-- references/            # Workflow references for agents and maintainers
|   +-- scripts/               # Skill runtime scripts and helper gates
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

## Acknowledgments

- [Tabler Icons](https://github.com/tabler/tabler-icons)
- [PPT Master](https://github.com/hugohe3/ppt-master)
- [Beautiful HTML Templates](https://github.com/zarazhangrui/beautiful-html-templates)

## More documentation

- [pptx-nova user guide](pptx-nova/README.md)
- [pptx-nova scripts](pptx-nova/scripts/README.md)
- [Translation workflow](pptx-nova/references/translation-mode.md)
- [pptx-nova assets](pptx-nova/assets/README.md)
- [DeckKits](pptx-nova/assets/deckkits/README.md)
- [DeckKit examples](pptx-nova/assets/examples/README.md)
