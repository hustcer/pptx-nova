# xdoc: A Native-First, Agent-Oriented Document and PPTX Execution Layer

> **Latest verified release:** `0.3.0 (91f7b66b)`
>
> **CLI contract:** `cli-agent/v1`
>
> **Verification date:** 2026-07-22

xdoc is a native-first command-line runtime for turning document files into
structured, reviewable artifacts and for creating or editing native, editable
PPTX decks. It combines conversion, extraction, preflight diagnostics, a
declarative PPTX patch bridge, static and rendered visual checks, replayable
evidence, and an optional local daemon under one versioned contract.

This document serves three audiences:

- people who need a reliable command for conversion, extraction, or a precise
  deck edit;
- agents that must discover capabilities, select objects, plan a change, and
  prove what happened; and
- technical leaders evaluating a document engine as a safe, observable execution
  layer for an AI presentation platform.

The facts below are separated into two layers:

1. **Runtime facts** come from the installed xdoc binary, especially
   `xdoc --version`, `xdoc --help`, and `xdoc schema`.
2. **Implementation notes** describe the native runtime layers and embedding
   boundaries. They explain the design and constraints, but do not replace the
   runtime contract.

## Executive overview

### The problem xdoc solves

An AI system can produce a plausible slide image in one step. A production
workflow needs more:

- a machine-readable description of what the engine can do;
- deterministic references to the exact slide objects that should change;
- a way to validate a proposed change without writing a file;
- a native PPTX result that remains editable;
- preservation of content and package parts that were not intentionally changed;
- structural, semantic, and visual evidence after the write; and
- a replayable record so another agent or a human can audit the run.

xdoc treats those requirements as part of the document-format boundary rather
than as optional application code.

### The core idea

The primary editing unit is a JSON patch, not an opaque sequence of imperative
object mutations. A patch can be inspected, schema-checked, dry-run, applied to
a copied candidate, reported, previewed, compared, and replayed. Selected bridge
APIs are also available below the CLI for native library, JavaScript, and
WebAssembly callers where the chosen backend supports them.

### A declarative delivery lifecycle

xdoc is best understood as a declarative delivery protocol for a native
document, not only as a file-writing command. A production job can make each
state explicit:

```text
plan   = source identity + schema version + patch/recipe + policy
dry-run = resolve + simulate + report predicted changes and gates
apply  = commit one candidate atomically and emit operation evidence
audit  = re-open the candidate, verify package semantics, and retain a sidecar
publish = hand off only after static, rendered, and human-review gates pass
```

The plan is durable input, the candidate is a separately addressable artifact,
and the audit is a first-class output. This lets an orchestrator retry or reject
one stage without guessing what an earlier stage changed. It also joins three
forms of truth at one boundary: native object truth, declarative control, and
rendered evidence. That separation is what makes supervision measurable instead
of dependent on screenshots or log interpretation alone.

### Current release surface

| Area                         | Runtime contract in 0.3.0                                                   |
| ---------------------------- | --------------------------------------------------------------------------- |
| Top-level CLI                | `convert`, `html2md`, `extract`, `check`, `pptx`, `pdf`, `daemon`, `schema` |
| PPTX CLI subcommands         | 35 discoverable subcommands                                                 |
| Patch operations             | 58 canonical operations                                                     |
| High-level recipes           | 18 recipe kinds                                                             |
| Shape catalog                | 182 preset shapes                                                           |
| Layout contracts             | 6 built-in content contracts                                                |
| Theme/style assets           | 9 theme packs and 4 style packs                                             |
| Gradients and chart styles   | 24 preset gradients and 48 chart styles                                     |
| Chart type catalog           | 103 `XlChartType` entries with supported/partial/unsupported status         |
| Enum families                | 20 controlled vocabularies                                                  |
| Structured errors            | 24 error codes                                                              |
| Embedded PPTX report schemas | 20 report schemas                                                           |
| Patch schema definitions     | 179 `$defs` in the current runtime schema                                   |

Counts are discovery aids, not promises that every long-tail PPTX feature is
fully editable. Each operation and capability carries its own support or
preservation status.

### What makes the system distinctive

xdoc's value comes from the combination of capabilities, not from any single
command:

- **The runtime explains itself.** Operation schemas, examples, catalogs,
  reports, errors, and capability status are emitted by the executing binary.
- **Editing is transactional and reviewable.** The patch is a durable plan,
  dry-run is non-writing, and apply produces operation-level evidence.
- **Native structure and rendered evidence stay connected.** Inspect/select
  reason about editable objects, while preview and diff expose the delivered
  visual result.
- **Preservation is observable.** Unknown and untouched package data is kept
  where possible, while preserve-only and unsupported regions are reported.
- **Repair is a protocol.** Structured findings can carry a machine-executable
  fix patch, confidence, and retry policy instead of only human prose.
- **History is portable.** Sidecars materialize the patch and its evidence so a
  later process can replay, audit, or recover the revision.

That combination makes xdoc suitable as infrastructure: it supplies the
execution contract, the mutation engine, and the evidence boundary in one
versioned system.

## What xdoc is—and is not

### It is

- a single CLI for document conversion and PPTX work;
- a native PPTX package reader/writer with a declarative bridge;
- an agent-facing contract that can be discovered at runtime;
- a preserve-first editing pipeline with explicit safety gates;
- a source of structured reports suitable for CI, orchestration, and audit; and
- a local execution layer that can keep a deck in memory across multiple agent
  steps.

### It is not

- a promise of complete parity with every feature ever emitted by a PPTX
  application;
- a replacement for human review of facts, numbers, legal text, or brand
  approval;
- a guarantee that static geometry checks prove every pixel is correct;
- a browser build of the complete CLI; or
- an implicit claim that reserved document kinds are already supported.

The current capability registry marks `docx` and `xlsx` as `reserved`. They may
be recognized as document kinds, but the 0.3.0 CLI must not be described as an
implemented general-purpose converter for them.

## Design principles

### Discoverability before mutation

An agent should not need to guess field names, enum spellings, selector shapes,
or report formats. The schema command exposes the contract progressively:

```bash
xdoc schema --index
xdoc schema --op add-text-box
xdoc schema --ops add-shape,add-table --minimal
xdoc schema --op set-shape --fields name,shape,slide --defs summary
xdoc schema --examples
```

The index is intentionally small. An agent can request the complete definition
only after it knows which operation it needs.

The full runtime schema currently includes 36 PPTX CLI examples, 18 patch
examples, and 7 recipe examples. These examples are part of the same versioned
discovery output as the field definitions.

### Deterministic targeting

Selectors can use an object id, a shape name, a placeholder, or a structured
query. Queries support `nameRegex`, `textRegex`, placeholder `type` and `idx`,
and `bboxNear`. Matching is deterministic. If a query resolves to multiple
objects where one object is required, xdoc returns an ambiguity error with
candidate information instead of choosing silently.

### Plan before write

`--dry-run` executes the patch against a candidate state, reports changed parts,
semantic changes, visual risks, selector resolutions, and operation results, and
does not write the requested output.

### Preserve by default

The package layer preserves unknown entries and untouched parts where possible.
Macro, signature, encryption, raw-XML, and zip-bomb policies are explicit. A
feature that cannot safely edit a region is surfaced as preserve-only or
unsupported rather than silently reconstructed.

### Evidence is part of delivery

A successful write is only one artifact. xdoc can also produce:

- a structured apply report;
- a portable `.xdoc.json` sidecar;
- a static vision report;
- rendered PNGs and a contact sheet;
- semantic or visual diffs; and
- specialized translation, refurbishment, brand, and preflight reports.

This makes a deck revision a chain of evidence rather than an unexplained binary
replacement.

## Architecture

At a high level, the runtime is organized as follows:

```text
xdoc CLI
  ├─ input collection, glob expansion, and batch planning
  ├─ conversion pipeline
  │    ├─ PPTX parser
  │    ├─ PDF converter
  │    └─ image converter / PDFium
  ├─ native PPTX JSON bridge
  │    ├─ OPC package reader/writer
  │    ├─ XML and OOXML model
  │    ├─ patch interpreter and recipe compiler
  │    └─ semantic and visual-risk reports
  ├─ schema, catalogs, and capability registry
  └─ deterministic artifact delivery, manifests, and reports
```

### Conversion path

For a PPTX conversion, the native pipeline is conceptually:

```text
PPTX bytes
  → structured presentation model
  → PDF converter / PDF bytes
  → image converter / PDFium / PNG bytes
```

JSON, Markdown, plain text, and extraction artifacts can be produced without
rendering. PDF and PNG outputs require the runtime backends declared in the
capability registry.

### Local, unattended rendering

When the distribution includes the declared PDF and image backends, the same
native worker can produce PDF bytes, per-slide PNGs, and contact sheets without
starting a browser, a desktop presentation application, or a full office
service. This makes the evidence path suitable for CI, containers, offline
queues, and other unattended jobs. The claim is intentionally backend-aware:
`capabilities/v1` names `pdf-backend` and `image-backend` explicitly, and a
deployment must provision the exact backends and fonts required by its build.

Keep the render manifest, backend identity, and font inventory with the output.
They explain why two otherwise identical jobs might differ in rasterized text or
pagination and give a platform a reproducible provenance record.

### Runtime and embedding boundaries

xdoc is distributed as a native-first executable. Its stable external contract
is the CLI, its versioned schema, and the documented library facade; internal
component boundaries are not a public API promise. The runtime layers cover
collection, conversion, delivery, document models, PDF text, server/daemon
support, and shared diagnostics.

Selected PPTX, parser, and PDF capabilities also have JavaScript or WebAssembly
integration paths, while the complete xdoc CLI remains native-first. Those
embedding paths should not be read as a claim that every CLI command is
browser-runnable.

### Why the architecture matters

The design keeps three concerns separate:

1. **Document truth:** the package, relationships, XML, objects, and resources.
2. **Agent control:** schemas, selectors, patches, reports, and error contracts.
3. **Human evidence:** rendered previews, contact sheets, visual diffs, and
   preservation audits.

A platform can scale each concern independently while keeping the same patch and
report contracts at the orchestration boundary.

## First run: verify the runtime

Use the installed binary or your approved distribution artifact. Do not infer
the feature set from a wrapper script or from an older schema snapshot; ask the
binary that will execute the job.

```bash
xdoc --version
xdoc schema --index
```

The expected release identity for this document is:

```text
0.3.0 (91f7b66b)
```

The top-level schema response identifies itself as:

```json
{
  "schemaVersion": "cli-agent/v1",
  "version": "0.3.0 (91f7b66b)"
}
```

The numeric `schemaVersion` inside a patch envelope is a different contract: it
is currently `1`. Keep the two version fields distinct in agent code.

## Quick-start command set

### Convert a deck

```bash
xdoc convert deck.pptx --to pdf --output deck.pdf
xdoc convert deck.pptx --to png --contact-sheet --out-dir previews
xdoc convert deck.pptx --to json --pretty --output deck.json
xdoc convert deck.pptx --to md --md-detail ai --output deck.md
```

The shorthand form is equivalent for conversion:

```bash
xdoc deck.pptx --to pdf --output deck.pdf
```

### Extract structured artifacts

```bash
xdoc extract deck.pptx --parts map,resources,notes,links,fonts --pretty --output deck-artifacts.json
```

The extraction parts are `map`, `resources`, `notes`, `links`, `fonts`, and
`all`. They have versioned artifact shapes such as `map/v1`, `resources/v1`,
`notes/v1`, `links/v1`, and `fonts/v1`.

| Part        | Typical contents                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------- |
| `map`       | Slide titles, sections, outline entries, selected slides, and per-slide element counts            |
| `resources` | Package and slide images, video, audio, charts, tables, math, diagrams, links, and font summaries |
| `notes`     | Per-slide speaker-note presence and text                                                          |
| `links`     | URL, source, kind, external/internal status, and suspicious-link signal                           |
| `fonts`     | Referenced fonts and embedded-font observations                                                   |

### Run preflight checks

```bash
xdoc check deck.pptx --checks fonts,links,compat,assets,policy --pretty --output preflight.json
```

The check registry currently covers fonts, links, compatibility, assets, and
policy. Compatibility checks can target a selected release family with
`--target-office`; the flag name is retained for contract compatibility. The
`preflight/v1` report records `passed`, `warning`, or `failed` status, severity
counts, the checks requested/executed/unsupported, and an overall risk level.

### Inspect and select before editing

```bash
xdoc pptx inspect deck.pptx --json
xdoc pptx select deck.pptx --query '{"textRegex":"Revenue"}' --json
```

`inspect` is read-only. It can expose slide, layout, master, theme, shape,
placeholder, bounding-box, text summary, semantic keywords/topics, style
heuristics, overlap estimates, and text-overflow estimates. `select` returns a
versioned `pptx-select/v1` report with the query, scope, matches, and resolved
object references.

### Apply a patch safely

```bash
xdoc pptx apply --patch patch.json --input deck.pptx --output updated.pptx --dry-run --json
xdoc pptx apply --patch patch.json --input deck.pptx --output updated.pptx --json
```

The first command produces a dry-run report and writes no PPTX. The second
creates the candidate. Existing output paths require `--overwrite`.

### Validate the candidate

```bash
xdoc pptx vision-check updated.pptx --json
xdoc pptx preview updated.pptx --output-dir updated-previews --contact-sheet updated-contact.png --json
xdoc pptx diff deck.pptx updated.pptx --json
```

Use the static check for fast geometry and package diagnostics, the preview for
actual rendered evidence, and the diff for deterministic structural comparison.

### Keep a daemon session for multi-step work

```bash
xdoc daemon start
xdoc daemon status --json
xdoc pptx inspect deck.pptx --daemon --json
xdoc pptx apply --patch patch.json --input deck.pptx --output updated.pptx --daemon
xdoc daemon stop
```

`--daemon` falls back to one-shot mode when the daemon is unavailable.
`--daemon-strict` turns that fallback into a hard failure.

## Conversion and extraction reference

### Input collection

`convert`, `html2md`, `extract`, and `check` accept a single file, multiple
files, glob patterns, and directories. Use `--recursive` to descend into
directory inputs. For batches, `--out-dir` collects outputs below one root and
`--report` writes a stable `batch/v1` summary. `--fail-fast` stops at the first
failed input.

Slide and page selectors in conversion, extraction, preflight, and PDF commands
are 1-based and accept comma-separated ranges such as `1,3,5-7`.

### Output formats

The conversion command supports:

| Input     | Output   | Status   | Notes                                                                               |
| --------- | -------- | -------- | ----------------------------------------------------------------------------------- |
| PPTX      | PDF      | enabled  | Uses the PDF backend; optional bookmarks, page labels, and speaker-note annotations |
| PPTX      | PNG      | enabled  | Uses the PDF and image backends; emits a directory of slide images                  |
| PPTX      | JSON     | enabled  | Structured presentation data                                                        |
| PPTX      | Markdown | enabled  | `human` or `ai` detail mode                                                         |
| PPTX      | text     | enabled  | Plain extracted text                                                                |
| PDF       | PNG/PDF  | enabled  | Render or inspect through the PDF command family                                    |
| HTML      | Markdown | enabled  | Local HTML file, glob, or directory input                                           |
| DOCX/XLSX | any      | reserved | Recognized in the registry, not an enabled conversion path in 0.3.0                 |

The top-level capability registry is itself machine-readable:

```bash
xdoc schema | jq '.capabilities'
```

### Output path derivation

When paths are omitted, xdoc derives them from the input stem. The important
rules are:

| Situation                        | Default                                             |
| -------------------------------- | --------------------------------------------------- |
| One input, one file format       | `<input-dir>/<input-stem>.<ext>`                    |
| PNG only                         | `<input-dir>/<input-stem>-img/`                     |
| Multiple formats                 | `<input-dir>/<input-stem>.xdoc/`                    |
| Multiple inputs with `--out-dir` | Preserve relative parents where possible            |
| PNG filenames                    | `<prefix>-<zero-padded-slide>.png`, minimum width 3 |
| Manifest for a bundle            | `<root-dir>/manifest.json`                          |
| Manifest for a single file       | `<input-dir>/<input-stem>.manifest.json`            |

An explicit `--output` path is used verbatim for a file. For PNG or multi-format
bundles, a trailing separator selects parent-directory semantics; without it,
the path is treated as the bundle root. Existing outputs are protected unless
`--overwrite` is supplied.

### Manifests and batch reports

Manifest mode is `auto` by default and can be set to `true` or `false`. A
manifest records the produced artifacts and their paths; PNG manifests also
record page dimensions, byte lengths, and hashes. A batch report records
per-input success or failure so an agent does not have to parse human log text.

### HTML to Markdown

Use the dedicated command when the source is HTML:

```bash
xdoc html2md page.html --output page.md
xdoc html2md ./pages --recursive --out-dir ./markdown
```

Relative links can be resolved with `--html-base-url`. The conversion preserves
content as Markdown; it is not a promise to reproduce the source page's visual
layout in a PPTX.

### PDF diagnostics

The PDF command family has three actions:

```bash
xdoc pdf inspect output.pdf --json --pretty
xdoc pdf extract-text input.pdf --engine pdfium --pages 1,3-5 --json --pretty
xdoc pdf render input.pdf --pages 1,3-5 --output selected-pages/
xdoc pdf render input.pdf --output all-pages/ --contact-sheet
```

`pdf inspect` reports page geometry, font embedding observations, subset
prefixes, page usage, text-object counts, and Unicode-map diagnostics.
`extract-text` emits plain text or `pdf-text/v1`; its extraction modes are
`natural` and `layout`. The native `auto` engine resolves to PDFium in the
current build.

## The PPTX patch model

### Envelope

Every patch is an object with a numeric envelope version and an ordered list of
operations:

```json
{
  "schemaVersion": 1,
  "ops": [
    {
      "op": "add-slide"
    },
    {
      "op": "add-text-box",
      "slide": 0,
      "x": "0.75in",
      "y": "0.65in",
      "w": "11in",
      "h": "0.8in",
      "name": "Title",
      "text": "Quarterly review"
    }
  ]
}
```

`slide` in patch operations is zero-based. This differs from the 1-based
`--slides` selectors used by most CLI inspection and conversion commands.
Lengths can be numeric or unit-bearing strings such as `in`, `cm`, `mm`, `pt`,
`px`, or `emu`; ask `xdoc schema --op OP_NAME` for the exact field contract.

### Operation families

The 58 canonical operations are grouped conceptually below:

**Presentation structure**

- `add-slide`, `remove-slide`, `move-slide`, `duplicate-slide`
- `add-layout`, `set-layout`, `add-layout-placeholder`
- `add-placeholder`
- `set-master`, `set-theme`, `remap-theme`, `set-slide-size`
- `set-document-properties`

**Text and paragraphs**

- `add-text-box`, `add-paragraph`, `add-run`
- `set-text-frame`, `set-paragraph`, `set-run`
- `replace-paragraph-text`, `set-default-text-style`, `fit-text`

**Shapes and media**

- `add-shape`, `set-shape`, `remove-shape`, `duplicate-shape`
- `add-group`, `ungroup-shapes`, `add-connector`, `set-connector`
- `add-freeform`, `add-image`, `crop-image`, `add-video`
- `add-equation`, `add-ole-object`

**Tables and charts**

- `add-table`, `set-table`, `set-table-data`, `merge-table-cells`
- `add-chart`, `set-chart`, `set-chart-data`, `set-chart-text`

**Notes and motion**

- `set-slide-notes`, `append-slide-notes`, `remove-slide-notes`
- `set-slide-background`, `set-slide-transition`, `set-slide-animations`

**Data and control flow**

- `bind-data`, `populate-slide`
- `define-macro`, `use-macro`, `foreach`, `if`, `try`

**Low-level escape hatch**

- `patch-ooxml`

The operation index is authoritative for required and optional fields,
categories, constraints, and support levels. The list above is a navigation aid,
not a substitute for the schema.

Control operations are declarative expansion tools, not an arbitrary code
execution surface. `define-macro` and `use-macro` reuse operation templates;
`foreach` and `if` expand data-dependent branches; `try` can select a guarded
fallback. Expansion is reported in `expandedOps` and is subject to recursion and
validation limits.

### High-level recipes

Recipes compile to ordinary patch operations. They are useful when an agent
knows the intended slide pattern but does not need to hand-author every shape.
The current 18 recipe kinds are:

- `title`
- `two-column`
- `section`
- `image-caption`
- `kpi-grid`
- `comparison-table`
- `timeline`
- `roadmap`
- `matrix-2x2`
- `process-flow`
- `funnel`
- `swot`
- `pyramid`
- `hub-spoke`
- `cycle`
- `gantt`
- `scorecard-table`
- `comparison-cards`

Compile a recipe before applying it when you want the expanded patch as an
auditable intermediate:

```bash
xdoc pptx recipe --patch recipe.json --compile --json
```

Apply reports expose the resulting `expandedOps` and created object ids.

### Catalog discovery

The bridge keeps design primitives discoverable rather than hiding them in
documentation:

```bash
xdoc pptx catalog shapes --json
xdoc pptx list-themes --json
xdoc schema | jq '.commands.pptx.catalogs'
```

The current shape catalog has 182 entries across eight categories:
`action-button`, `arrow`, `basic`, `callout`, `flowchart`, `math`, `misc`, and
`star-banner`. Each entry can expose a stable name, aliases, its OOXML preset
key, description, and text-support metadata.

The schema also publishes six layout contracts, 24 preset gradients, 48 built-in
chart styles, and a 103-entry chart-type catalog. The chart catalog labels
entries as supported, partial, or unsupported so a planner can choose a safe
representation before generating a patch. The current catalog registers two
production-ready native DeckKits without making DeckKit internals part of the
patch schema.

### Schema discovery workflow for agents

Use the smallest disclosure that answers the next question:

1. `xdoc schema --index` — discover operation names and one-line summaries.
2. `xdoc schema --op add-text-box --minimal` — inspect one operation.
3. `--fields` — project only the fields needed for planning.
4. `--defs summary` — inspect referenced definitions without pulling the full
   transitive closure.
5. `--defs full` or an unprojected operation — obtain nested selector and field
   definitions before validation.
6. `xdoc schema --examples` — copy a contract-tested patch pattern.
7. `xdoc pptx apply --dry-run --json` — validate the complete operation against
   the actual deck state.

This progressive disclosure keeps agent prompts and tool calls small while
retaining a complete validation path.

### Rich editable objects

The patch surface is broader than text boxes:

- **Charts:** create charts, replace data, edit visible text, and adjust common
  chart, axis, legend, series, point, and plot settings. Generated charts can
  carry editable chart caches plus an embedded workbook package.
- **Tables:** create and format tables, set cell data, resize data regions,
  merge cells, and change row/column dimensions.
- **Shapes and diagrams:** use preset shapes, connectors, groups, freeforms,
  fills, lines, effects, and geometric updates.
- **Media and embedded objects:** add images, video with poster frames, OLE
  objects with icons, and equations rendered as SVG or editable math where the
  selected mode is supported.
- **Presentation behavior:** edit supported transitions, entrance animations,
  notes, backgrounds, masters, layouts, placeholders, themes, and document
  properties.

Every rich-object path still follows the same rule: discover the operation,
validate the exact fields, dry-run against the deck, and report preserve-only or
unsupported structures explicitly.

## The inspect → select → plan → apply loop

A production agent should use the following loop for an existing deck.

### 1. Inspect the source

```bash
xdoc pptx inspect source.pptx --json > inspect.json
```

Record the source path, slide count, object names, ids, placeholders, and any
preserve-only observations. Do not infer geometry from a screenshot when the
editable object tree is available.

### 2. Resolve the target

```bash
xdoc pptx select source.pptx --query '{"textRegex":"Revenue"}' --slides 2 --json > selection.json
```

Prefer an id or stable name after the first inspection. Use a query when the
deck is generated dynamically, and require exactly one match for a localized
edit.

### 3. Write a minimal patch

Keep the patch narrowly scoped. For text replacement, carry source text or a
source hash when the operation supports it. For a new object, assign a stable
name so subsequent steps can resolve it without guessing.

### 4. Dry-run

```bash
xdoc pptx apply --patch patch.json --input source.pptx --output candidate.pptx --dry-run --explain --json > dry-run.json
```

Review `status`, `wouldWrite`, `changedParts`, `semanticChanges`, `visualRisks`,
`semanticIssues`, `opResults`, `resolvedSelectors`, and any schema-derived
explanations. A dry-run must not mutate the source or output.

### 5. Apply to a separate candidate

```bash
xdoc pptx apply --patch patch.json --input source.pptx --output candidate.pptx --json > apply.json
```

Keep the source read-only by policy. The bridge rejects invalid operations and
unsupported schema operations instead of reporting a partial success.

### 6. Run static and rendered checks

```bash
xdoc pptx vision-check candidate.pptx --json > vision.json
xdoc pptx preview candidate.pptx --output-dir candidate-previews --contact-sheet candidate-contact.png --json > preview.json
```

Static checks are fast and deterministic. PNG previews provide the evidence
needed for contrast, decoration, and other pixel-level or renderer-dependent
questions that geometry alone cannot settle.

### 7. Compare and publish

```bash
xdoc pptx diff source.pptx candidate.pptx --detail full --json > diff.json
```

Publish only when the requested semantic change is present, unexpected changes
are within policy, and visual gates pass. Preserve the reports and previews
alongside the candidate when the deck is important enough to audit.

The structural diff makes deterministic conclusions only for stably identified
slides and objects. Unstable matches and unsupported structures are reported as
uncertain or unsupported instead of being presented as facts.

## Selectors and object identity

### Selector forms

Most patch targets can be expressed as:

```json
{ "id": 42 }
```

```json
{ "name": "Title" }
```

```json
{ "placeholder": { "type": "title", "idx": 0 } }
```

```json
{ "query": { "textRegex": "Revenue" } }
```

Queries can be scoped to a slide with `slideIndex` (zero-based) or to a 1-based
`--slides` range at the CLI boundary. `bboxNear` is useful when a deck has
repeated text or names but a stable location.

### Ambiguity is a reportable state

If two shapes satisfy a selector that should identify one target, xdoc returns a
structured ambiguity error and lists the candidates. An agent should refine the
selector or request human input; it should not pick the first array element.

### Stable names are an operational contract

For generated decks, name important objects at creation time. Names make
follow-up patches, data bindings, translation units, and audit records easier to
correlate. Names are not a substitute for checking the current deck:
inspect/select should still be run after a deck is copied, reordered, or
refurbished.

## Reports, errors, and automatic repair

### Report families

The bridge exposes versioned JSON reports including:

- `pptx-inspect/v1`
- `pptx-select/v1`
- `pptx-preview/v1`
- `pptx-vision/v1`
- `pptx-diff/v1`
- `pptx-vision-diff/v1`
- `pptx-contact-diff/v1`
- `pptx-apply/v1`
- `pptx-dry-run/v1`
- `pptx-apply-sidecar/v1`
- `pptx-audit/v1`
- `pptx-rollback/v1`
- `pptx-i18n-*` contracts
- `pptx-brand-check/v1` and related brand reports

The exact report schema is returned by `xdoc schema`; do not hard-code
unversioned field assumptions in a long-lived agent.

### Fields that matter to an agent

Depending on the command, reports expose:

- input and output identity;
- `status` and machine-readable schema version;
- `changedParts`;
- `semanticChanges`;
- `visualRisks`;
- `semanticIssues`;
- `warnings`;
- resolved selectors and created object references;
- expanded recipe operations;
- per-operation results, traces, and duration;
- analysis objects for text fitting, layout impact, or theme remapping; and
- capability summaries showing supported, preserve-only, or unsupported areas.

At operation level, `opResults[]` can include `opIndex`, `op`, `status`,
`changedParts`, `semanticChanges`, `visualRisks`, `warnings`, `created`,
`createdIds`, `resolvedSelectors`, `expandedOps`, `analysis`, and `durationMs`.

### Structured error behavior

The current error catalog has 24 codes, including:

`InvalidJson`, `InvalidArgument`, `InvalidArguments`, `UnsupportedFeature`,
`InvalidOperation`, `InvalidPackage`, `InvalidXml`, `MissingPart`,
`MissingRelationship`, `EncryptedPackage`, `SignedPackage`, `ZipError`,
`PatchTooLarge`, `AssetTooLarge`, `InputError`, `OutputError`, `OutputExists`,
`InvalidSidecar`, `DaemonUnavailable`, `InvalidRequest`, `ProtocolError`,
`UnknownMethod`, `InternalError`, and `UnknownError`.

Errors carry a stable kind and message; operation failures can include an
`opIndex`. This allows an orchestrator to distinguish a malformed request from
an invalid deck, a policy rejection, an unavailable backend, or an internal
failure.

### Process exit codes

The top-level contract currently defines:

| Code | Stage      | Meaning                                                                                 |
| ---- | ---------- | --------------------------------------------------------------------------------------- |
| 0    | success    | Command completed successfully                                                          |
| 2    | args       | Argument parsing or validation failed                                                   |
| 3    | input      | Input was invalid, or a structured planner/gate report completed with a non-pass status |
| 5    | slide      | A requested slide selection was out of range                                            |
| 6    | parse      | PPTX parsing failed                                                                     |
| 7    | pdf        | PDF generation failed                                                                   |
| 8    | png        | PNG generation failed                                                                   |
| 9    | output     | Output validation or writing failed                                                     |
| 10   | dependency | A required backend was unavailable                                                      |
| 11   | internal   | Unexpected internal failure                                                             |
| 12   | batch      | At least one batch item failed                                                          |

Do not discard stdout automatically on a non-zero gate result. Several
JSON-producing planner and validation commands still return a complete,
parseable report when the exit code is 3; the report explains the blockers.

### Machine-executable fixes

Semantic audit findings can include a fix object with:

- a patch operation array (`fixPatch`);
- a reason;
- a confidence score;
- an `autoRetry` decision; and
- a `requiresRawXml` flag.

Some visual issues also expose applicable fixes. An agent may apply a fix only
when the confidence and policy thresholds allow it, then rerun the same gate.
The fix is a proposal, not a license to bypass review.

## Static and rendered visual validation

### `vision-check`

`xdoc pptx vision-check` emits `pptx-vision/v1`. It can detect:

- shapes outside the slide;
- text too close to the edge;
- estimated text overflow;
- multi-column overflow or layout review signals;
- unexpected wrapping in single-line roles;
- geometry overlap;
- arrangement imbalance;
- fonts below a configured threshold;
- dangling relationships or references;
- duplicate ids; and
- invalid package parts, relationships, XML, attributes, or ranges.

The report explicitly separates authored-geometry and semantic findings from
renderer-dependent observations. It is a static gate, not a substitute for a PNG
review.

### `preview`

`preview` renders per-slide PNG files and can create a contact sheet. Its
`pptx-preview/v1` manifest records slide number, file dimensions, byte length,
and a hash for each page, plus the contact sheet identity when requested.

### `vision-diff`

`vision-diff` compares source and candidate visual issues and classifies them as
`new`, `resolved`, `inherited`, or `changed`. The report's `agentGate` blocks
new high/medium issues and inherited issues that became high/medium. Existing
unchanged source issues remain visible rather than being misreported as new.

The report also records evidence classes such as rendered, estimator,
review-only, and static-geometry. This prevents a static estimate from being
treated as stronger evidence than an observed renderer result.

### `contact-diff`

`contact-diff` produces a source/candidate side-by-side PNG and a
`pptx-contact-diff/v1` report. It tracks changed, unchanged, missing, and added
slide pairs. The `agentGate` means the pairs are complete and safe to hand to a
human reviewer; changed slides are expected and do not, by themselves, fail the
gate.

## Data-driven slide generation

### `bind-data`

`bind-data` applies JSON values to named or selected text, table, and chart
objects. A binding can use a path such as `{{kpi.revenue}}`, replace a table
from an array, or map chart categories and series from structured data.

The runtime examples demonstrate a single patch that:

1. creates a title text box with placeholders;
2. creates an editable table;
3. creates an editable chart; and
4. binds a JSON object into all three.

This keeps the data source separate from the presentation structure and makes
regeneration deterministic.

### `from-data`

For a template-driven workflow, use:

```bash
xdoc pptx from-data data.json --template template.pptx --bindings bindings.json --output generated.pptx
```

The command is a convenience wrapper around the same guarded binding primitives;
it does not introduce a second data model.

### Layout contracts

The catalog currently contains six built-in layout content contracts. A layout
contract defines the required content shape for operations such as
`populate-slide`. Agents can discover the contract and validate content before
creating a slide, which is safer than relying on positional assumptions.

## Translation and localization workflows

Translation is handled as a source-preserving edit. The source deck remains
read-only, and the candidate is checked for both target text correctness and
style/layout stability.

### Recommended sequence

```bash
xdoc pptx i18n-scan --source source.pptx --source-lang multi --mode source --output i18n-source.json --json
xdoc pptx i18n-plan --source source.pptx --units i18n-source.json --data translations.json --output i18n-plan.json --json
xdoc pptx replace-text --source source.pptx --data replacements.json --output translated.pptx --json
xdoc pptx i18n-style-diff --source source.pptx --candidate translated.pptx --json
xdoc pptx i18n-scan --source translated.pptx --mode candidate --units i18n-source.json --data translations.json --output i18n-candidate.json --json
```

The planner uses stable unit ids and source hashes. It blocks unknown ids,
source mismatches, missing translations, conflicting scopes, and preserve units
that unexpectedly receive target text. It can materialize guarded `replaceText`,
`replaceChartText`, or run-level patch artifacts.

Use the full plan persisted by `--output` to materialize those artifacts; the
compact stdout result is intentionally a routing summary. `replace-text`
replaces existing text nodes or typed user-visible text attributes with source
text/hash/index guards and does not rebuild paragraph or run structure.

### Chart text

Use `replace-chart-text` only with the explicit safety boundary:

```bash
xdoc pptx replace-chart-text --source source.pptx --data chart-replacements.json --output translated.pptx --visible-cache-only --json
```

The visible-cache-only mode updates visible chart labels while leaving workbook,
relationship, external-path, and formatting-code parts untouched. Embedded
workbook findings remain review signals.

### Style gate

`i18n-style-diff` ignores approved visible text content changes but checks run
and paragraph styles, text-box structure, tables, chart XML, relationships,
hyperlinks, animation/timing parts, and style-relevant part presence. Font-size
repairs made solely to fit translated text are reported separately.

## Brand, theme, chrome, and refurbishment

### Brand profiles

A brand profile can declare approved colors, fonts, required logo markers, and
required footer text:

```bash
xdoc pptx check-brand deck.pptx --brand brand.json --json
xdoc pptx apply-brand deck.pptx --brand brand.json --output branded.pptx --json
```

`apply-brand` compiles usable brand fields into ordinary theme, master, and
default-text-style patch operations. Run `check-brand` again after applying.

### Theme and style packs

The runtime exposes theme and style catalogs:

Replace the uppercase tokens below with ids returned by `list-themes`.

```bash
xdoc pptx list-themes --json
xdoc pptx swap-theme deck.pptx --to THEME_PACK_ID --output themed.pptx
xdoc pptx swap-style deck.pptx --to STYLE_PACK_ID --output styled.pptx
xdoc pptx remap-theme deck.pptx --to THEME_PACK_ID --scope text,shapes,tables,charts --output remapped.pptx
```

Theme packs describe reusable colors, fonts, backgrounds, chart defaults, and
generator defaults. Style packs describe master/default-text styling and
density/rhythm choices. Remapping reports which native objects changed, skipped,
or remained preserve-only.

### Structural chrome

Headers, footers, page numbers, and rules are treated as identifiable structure:

Replace `DECKKIT_ID` with a registered DeckKit id from the current catalog.

```bash
xdoc pptx chrome-detect deck.pptx --json
xdoc pptx chrome-remove deck.pptx --roles header,footer,page-number,rule --output clean.pptx
xdoc pptx chrome-apply clean.pptx --deckkit DECKKIT_ID --output styled.pptx
```

Detection should precede removal. Removal uses real `remove-shape` operations,
and application adds deterministic native chrome from the selected visual
system.

### Skin-first refurbishment

For an existing deck whose content should remain intact:

```bash
xdoc pptx refurbish-skin --source old.pptx --deckkit DECKKIT_ID --output new.pptx --json
xdoc pptx refurbish-audit --source old.pptx --final new.pptx --json
xdoc pptx contact-diff --source old.pptx --candidate new.pptx --output refurbish-contact.png --dpi 192 --json
```

The audit checks slide count and preservation of source text, shapes, pictures,
tables, charts, media, notes, hyperlinks, and mapped source slides. A contact
diff is still required for human visual review.

### Template and style reuse

The bridge also supports explicit reuse workflows:

```bash
xdoc pptx copy-from target.pptx --from source.pptx --slide 0 --output combined.pptx
xdoc pptx extract-style reference.pptx --output style.json --json
xdoc pptx import-template reference.pptx --name reusable-template --output assets --json
```

`copy-from --slide` uses a zero-based source slide index. `extract-style`
produces a structured style profile for inspection or reuse. `import-template`
extracts a reusable template profile and updates the requested asset catalog
location; it is an intentional asset-development operation, not part of an
ordinary source-preserving edit.

## Preserve-first package and safety model

### Package preservation

The native PPTX package layer is an OPC/ZIP reader and writer. Its default
policy is to:

- preserve unknown parts and relationships;
- preserve untouched parts byte-for-byte where possible;
- emit deterministic ZIP output with stable entry ordering and timestamps;
- reuse identical binary assets when safe; and
- report touched package parts in apply results.

These behaviors reduce accidental collateral changes and make diffs more
meaningful.

### OOXML semantic integrity

Preserving bytes is useful only when the resulting package is still semantically
valid. Apply and dry-run therefore audit the parts that may be written, then
re-audit the resulting package. The checks cover:

- schema-derived child-element order, including the generated write-time rules;
- `r:id`, `r:embed`, and `r:link` references and their relationship targets;
- duplicate identifiers across the relevant `cNvPr`, slide, layout, and master
  identity domains;
- OPC content-type declarations, relationship parts, and part truth; and
- required attributes, legal comparisons, and attribute/value range constraints.

The current source audit corpus contains hundreds of generated child-order and
attribute rules plus more than one hundred unambiguous part-truth mappings.
Those tables are implementation data, not a versioned promise that every OOXML
feature is editable; they can grow as the pinned format facts are refreshed.
Findings retain their part, element, attribute, and rule context in
`semanticIssues[]`; a bounded `fixPatch` is only a proposal and must be
reapplied and revalidated before it can clear a gate.

### Macro, signature, and encryption policy

The current native defaults are conservative:

- encrypted packages are rejected;
- digitally signed packages are rejected on save unless signatures are
  explicitly removed through the supported policy;
- macro/VBA parts are preserved by default, with explicit preserve, strip, or
  reject policies at the library layer; and
- preserve-only observations identify complex animations, transitions,
  SmartArt-like structures, VBA, and other long-tail content that was not
  edited.

Preservation is not the same as editability. A preserve-only object can survive
an edit while remaining outside the safe high-level mutation surface.

### Raw XML escape hatch

`patch-ooxml` is disabled by default. Enable it explicitly:

```bash
xdoc pptx apply --patch raw-xml-patch.json --input source.pptx --output candidate.pptx --allow-raw-xml --json
```

Raw XML bypasses schema-v1 guarantees and should be isolated, reviewed, and
followed by `inspect`, semantic checks, and rendered checks.

### Asset boundaries

For file-backed patch assets:

- `--asset-root` defaults to the patch file directory;
- `assetSource.path` must be relative; and
- the resolved path must remain inside the asset root.

The default patch size limit is 32 MiB and the default individual asset limit is
64 MiB. They can be changed intentionally with:

```text
XDOC_PPTX_MAX_PATCH_BYTES
XDOC_PPTX_MAX_ASSET_BYTES
```

Binary payloads can also be supplied as `bytesBase64`. Picture, movie, poster
frame, image-bullet, and OLE binary data can participate in deterministic
deduplication.

### ZIP-bomb and path guards

The native package reader rejects unsafe ZIP entry paths and applies default
limits of 200 MiB uncompressed payload and 4096 package parts. These guards are
part of the document boundary, not an afterthought in the caller.

### Atomicity

One-shot apply writes a candidate only after the patch succeeds. In daemon mode,
apply works on a serialized or cloned candidate snapshot and commits the session
only after successful serialization. A failed operation does not leave the
in-memory session partially mutated.

## Sidecars, replay, audit, and rollback

Successful `new` and `apply` operations write a sidecar by default:

```text
<output>.xdoc.json
```

The sidecar schema is `pptx-apply-sidecar/v1` and records:

- the materialized patch, with path-based assets inlined;
- input and output identity;
- patch source and asset-root metadata;
- the xdoc build id; and
- the apply report and operation traces.

This is deliberately portable: an agent can replay or audit a prior change
without re-deriving selectors from the binary deck.

```bash
xdoc pptx audit --from-sidecar updated.pptx.xdoc.json --json
xdoc pptx replay --from-sidecar updated.pptx.xdoc.json --output recovered.pptx
xdoc pptx rollback --from-sidecar updated.pptx.xdoc.json --output recovered.pptx
```

Use `--no-sidecar` only when the evidence record is intentionally stored
elsewhere.

Rollback is recovery from the sidecar's recorded history, not a generic inverse
patch against an arbitrary later deck. When the recorded input exists, the
recovery strategy can copy it; a new-deck sidecar can fall back to the minimal
deck strategy defined by the contract.

## Daemon mode

The daemon is a local loopback service for multi-step agent sessions:

```text
xdoc daemon start
  → foreground loopback server
  → state file (default: $TMPDIR/xdoc-daemon-state.json)
  → in-memory deck sessions
```

Defaults in 0.3.0:

- loopback TCP address: `127.0.0.1:0`;
- idle session timeout: 300000 ms;
- maximum sessions: 64; and
- auto-spawn readiness timeout: 5000 ms.

Relevant environment variables are:

| Variable                       | Purpose                                     |
| ------------------------------ | ------------------------------------------- |
| `XDOC_DAEMON_STATE`            | Override the state-file path                |
| `XDOC_DAEMON_ADDR`             | Override the loopback listen address        |
| `XDOC_DAEMON_IDLE_MS`          | Change the idle timeout                     |
| `XDOC_DAEMON_MAX_SESSIONS`     | Change the session pool limit               |
| `XDOC_DAEMON_AUTO_SPAWN`       | Disable automatic spawn with `0` or `false` |
| `XDOC_DAEMON_SPAWN_TIMEOUT_MS` | Change auto-spawn readiness timeout         |
| `XDOC_DAEMON_LOG`              | Override the auto-spawn log path            |

Sessions are keyed by canonical input paths and, after save, by output paths.
The foreground server currently processes connections serially, which keeps deck
mutation deterministic. A higher-throughput host should add explicit per-session
locking before introducing concurrent handlers.

Use `--daemon-strict` in a workflow where a lost session would invalidate the
run's assumptions. Use plain `--daemon` when a safe one-shot fallback is
acceptable.

## Runtime and embedding guidance

### CLI integration

The CLI is suitable for a worker process, a job queue, or a tool call. For
machine callers:

1. pin the executable version;
2. capture `xdoc schema` at startup or cache it by version;
3. send JSON on stdout and treat stderr as diagnostics;
4. preserve the report and sidecar with the output;
5. enforce an output policy using `status`, `agentGate`, and selected issue
   severities; and
6. re-run the relevant gate after every automatic repair.

### Library integration

The stable root xdoc facade exposes conversion functions, while the native PPTX
bridge exposes creation and patch APIs. Internal source packages are not stable
integration points. An embedding team should wrap the root facade with its own
compatibility adapter rather than importing internal package paths.

### Deployment

The native-first executable avoids a requirement for a full office desktop
installation. It still needs the runtime backends and fonts required by the
requested conversion. PDF authorization may also require a signed license JSON
provided through `--license`, depending on the build and deployment policy.

The current source module declares `PolyForm-Noncommercial-1.0.0`. Verify the
license of the exact binary and any bundled backend before shipping a commercial
service; this document is a technical description, not legal advice.

## Command reference

### Top-level commands

| Command   | Purpose                                                                       | Typical output                             |
| --------- | ----------------------------------------------------------------------------- | ------------------------------------------ |
| `convert` | Convert document files to PDF, PNG, JSON, Markdown, or text                   | File, directory, manifest, or batch report |
| `html2md` | Convert HTML files to Markdown                                                | Markdown file/directory                    |
| `extract` | Extract PPTX map, resources, notes, links, and fonts                          | Versioned JSON artifact                    |
| `check`   | Run fonts, links, compatibility, assets, and policy checks                    | `preflight/v1` JSON                        |
| `pptx`    | Create, patch, inspect, render, compare, translate, brand, or refurbish decks | PPTX plus versioned reports                |
| `pdf`     | Inspect, extract text from, or render PDFs                                    | PDF diagnostics, text, or PNG              |
| `daemon`  | Start, inspect, or stop the local session service                             | `daemon-status/v1` or diagnostics          |
| `schema`  | Print the machine-readable CLI and patch contract                             | `cli-agent/v1` JSON                        |

### PPTX action families

| Family                   | Actions                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| Creation and mutation    | `new`, `apply`, `recipe`, `from-data`                                                               |
| Discovery                | `inspect`, `select`, `catalog`, `list-themes`, `extract-style`                                      |
| Rendering and comparison | `preview`, `vision-check`, `diff`, `vision-diff`, `contact-diff`                                    |
| Translation              | `i18n-scan`, `i18n-plan`, `i18n-text-plan`, `i18n-style-diff`, `replace-text`, `replace-chart-text` |
| Refurbishment            | `refurbish-skin`, `refurbish-audit`, `chrome-detect`, `chrome-remove`, `chrome-apply`               |
| Theme and brand          | `remap-theme`, `swap-theme`, `swap-style`, `check-brand`, `apply-brand`                             |
| Reuse and history        | `copy-from`, `import-template`, `replay`, `audit`, `rollback`                                       |

### Selector index conventions

| Boundary                                                         | Index base |
| ---------------------------------------------------------------- | ---------- |
| `convert`, `extract`, `check`, `pdf`, most `pptx --slides` flags | 1-based    |
| Patch `slide` fields                                             | 0-based    |
| `select` `slideIndex` query field                                | 0-based    |
| `copy-from --slide`                                              | 0-based    |

When in doubt, ask the command-specific schema instead of guessing.

## Versioned contracts

The following identifiers are useful when validating an integration:

| Contract                                                     | Meaning                                                  |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| `cli-agent/v1`                                               | Top-level CLI discovery response                         |
| `capabilities/v1`                                            | Document kinds, output formats, and backend requirements |
| `pptx-patch/v1`                                              | Patch operation registry and JSON schema                 |
| `pptx-inspect/v1`                                            | Read-only deck inspection                                |
| `pptx-select/v1`                                             | Deterministic selector resolution                        |
| `pptx-preview/v1`                                            | Rendered PNG manifest                                    |
| `pptx-vision/v1`                                             | Static and semantic visual-risk report                   |
| `pptx-diff/v1`                                               | Deterministic structural source/candidate diff           |
| `pptx-vision-diff/v1`                                        | Source/candidate visual issue diff                       |
| `pptx-apply/v1`                                              | Apply result                                             |
| `pptx-dry-run/v1`                                            | Non-writing apply result                                 |
| `pptx-apply-sidecar/v1`                                      | Portable patch and evidence record                       |
| `pptx-contact-diff/v1`                                       | Source/candidate contact sheet evidence                  |
| `batch/v1`                                                   | Multi-input conversion summary                           |
| `map/v1`, `resources/v1`, `notes/v1`, `links/v1`, `fonts/v1` | Structured extraction artifacts                          |
| `preflight/v1`                                               | Input diagnostics and risk summary                       |
| `pdf-inspect/v1`, `pdf-text/v1`                              | PDF diagnostics and extraction                           |

Treat a schema version as a compatibility boundary. If a worker sees an unknown
version, it should preserve the raw report and stop at the integration boundary
rather than silently coercing fields.

## Adoption guidance by role

### For a regular user

Start with conversion and inspection:

```bash
xdoc --version
xdoc convert deck.pptx --to pdf --output deck.pdf
xdoc pptx inspect deck.pptx --json
```

For an edit, ask for a separate output path and request a preview/contact sheet.
The source deck should remain untouched unless replacement is intentional.

### For an agent author

Use schema discovery and the guarded loop:

```text
schema index
  → inspect
  → select
  → patch
  → dry-run
  → apply
  → vision-check
  → preview
  → diff
  → sidecar
```

Store source hashes, selected object references, patch JSON, reports, and
rendered evidence as one job record.

### For a platform or infrastructure lead

Treat xdoc as a versioned execution service:

- run it in an isolated worker with explicit input/output roots;
- pin the binary and capture the runtime schema;
- set patch, asset, ZIP, session, and timeout limits;
- make report gates part of job state;
- retain sidecars and hashes for reproducibility;
- separate static gate failures from renderer failures; and
- expose preserve-only and unsupported capabilities to the planner.

The high-leverage property is not only that xdoc can write a deck. It is that
the same call can declare what was attempted, what package parts changed, which
objects were resolved, what risks remain, and how to replay the operation.

A practical job record can be organized into five immutable groups:

1. **Inputs:** source hash, approved asset root, policy limits, and the exact
   `cli-agent/v1` schema snapshot.
2. **Plan:** patch or recipe, resolved selector candidates, and the requested
   output identity.
3. **Candidate:** the separately written PPTX plus changed-part and operation
   results.
4. **Evidence:** dry-run, semantic, preflight, preview, visual-diff, and
   contact-sheet reports, each retaining its schema version.
5. **History:** sidecar, backend/font provenance, retention metadata, and the
   decision to publish, retry, quarantine, or roll back.

This layout lets a platform measure failure by stage, replay a deterministic
attempt, and keep a human review queue focused on the slides or findings that
actually changed.

### For an investor or product strategist

The defensible technical value is the combination of:

1. a native document model;
2. an agent-readable operation and error contract;
3. source-preserving edits;
4. deterministic static and rendered evidence; and
5. a portable history record.

Those pieces reduce the cost of supervising AI-generated documents. They do not
eliminate human review or guarantee universal PPTX compatibility, so product
claims should stay tied to the measured contract and its declared limitations.

## Explicit limitations and non-claims

1. `docx` and `xlsx` are reserved in the 0.3.0 capability registry.
2. The full CLI is native-first; parser/PDF WebAssembly paths do not imply a
   browser implementation of every command.
3. Complex animations, transitions, SmartArt-like content, VBA, and other
   long-tail structures may be preserve-only or require a specialized bridge.
4. Static vision checks are not pixel proof. Use `preview`, `contact-diff`, and
   human review for renderer-dependent questions.
5. Font availability and backend versions can change PDF/PNG output. Inspect
   fonts and retain the render manifest for high-stakes delivery.
6. Encrypted and signed packages are rejected by default under the native safety
   policy.
7. Raw OOXML is an explicit escape hatch and is outside schema-v1 safety
   guarantees.
8. The current stable library facade is intentionally small; internal package
   paths are not a public API promise.
9. Capability counts describe discoverable surfaces, not universal feature
   parity.
10. A successful command is not evidence that the content's facts, numbers,
    legal language, or brand approvals are correct.

## Evidence and release discipline

For a reproducible deployment, record at minimum:

```bash
xdoc --version
xdoc schema > runtime-schema.json
xdoc schema --index > patch-index.json
```

Then store:

- the exact input hash;
- the patch or recipe source;
- the dry-run report;
- the apply report and sidecar;
- the vision and preview manifests;
- the final diff and preflight reports; and
- the runtime backend and font inventory when visual fidelity matters.

This document is anchored to xdoc 0.3.0 (91f7b66b). Re-run the discovery
commands when upgrading; do not assume that a newer binary has the same
operation fields, report fields, or preservation defaults.

## Appendix A: complete canonical patch operation list

The current runtime index reports these 58 canonical operations:

```text
add-chart
add-connector
add-equation
add-freeform
add-group
add-image
add-layout
add-layout-placeholder
add-ole-object
add-paragraph
add-placeholder
add-run
add-shape
add-slide
add-table
add-text-box
add-video
append-slide-notes
bind-data
crop-image
define-macro
duplicate-shape
duplicate-slide
fit-text
foreach
if
merge-table-cells
move-slide
patch-ooxml
populate-slide
remap-theme
remove-shape
remove-slide
remove-slide-notes
replace-paragraph-text
set-chart
set-chart-data
set-chart-text
set-connector
set-default-text-style
set-document-properties
set-layout
set-master
set-paragraph
set-run
set-shape
set-slide-animations
set-slide-background
set-slide-notes
set-slide-size
set-slide-transition
set-table
set-table-data
set-text-frame
set-theme
try
ungroup-shapes
use-macro
```

## Appendix B: practical command recipes

### Create a minimal deck and add a title

```bash
xdoc pptx new --output blank.pptx
xdoc pptx apply --patch title-patch.json --input blank.pptx --output titled.pptx --dry-run --json
```

### Inspect a selected slide and its resources

```bash
xdoc pptx inspect deck.pptx --json > inspect.json
xdoc extract deck.pptx --parts map,resources,fonts --pretty --output resources.json
```

### Batch-convert a directory

```bash
xdoc convert ./decks --recursive --to pdf --out-dir ./converted --report ./converted-report.json
```

### Diagnose a PDF generated from a deck

```bash
xdoc pdf inspect deck.pdf --json --pretty > pdf-inspect.json
xdoc pdf extract-text deck.pdf --engine pdfium --json --pretty > pdf-text.json
```

### Review a refurbishment with an explicit mapping

```bash
xdoc pptx refurbish-audit --source old.pptx --final new.pptx --map reference-map.json --json > refurbish-audit.json
xdoc pptx contact-diff --source old.pptx --candidate new.pptx --map reference-map.json --output contact-diff.png --dpi 192 --json > contact-diff.json
```

### Check a translated candidate

```bash
xdoc pptx i18n-style-diff --source source.pptx --candidate translated.pptx --allow-text-attrs tooltip,descr,title --json > style-diff.json
xdoc pptx vision-diff --source source.pptx --candidate translated.pptx --json > vision-diff.json
```

## Appendix C: a compact agent policy

When integrating xdoc into an agent, use this policy as a starting point:

1. Verify the binary and schema version.
2. Read the operation index before constructing a patch.
3. Inspect the source before selecting an object.
4. Require deterministic selector resolution.
5. Dry-run every non-trivial patch.
6. Apply to a new candidate path.
7. Reject unsupported or ambiguous operations.
8. Run semantic and visual gates.
9. Preserve the sidecar, reports, hashes, and previews.
10. Ask for human review when a gate is review-only, preserve-only, or
    renderer-dependent.

That policy turns xdoc from a file-writing utility into a controllable,
observable document execution step.
