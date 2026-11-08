# Contributing

Thanks for helping improve `pptx-nova`. This repository packages two agent
skills:

- `pptx-nova/`: the main publishable skill for creating, editing, translating,
  refurbishing, and checking editable PowerPoint decks.
- `deckkit-maker/`: a developer-side helper skill for creating or repairing
  DeckKits used by `pptx-nova`.

Keep `pptx-nova` as the primary user-facing skill. Mention `deckkit-maker` only
when the work is about DeckKit development.

## Repository Layout

```text
.
+-- pptx-nova/                 # Main publishable skill
|   +-- assets/                # DeckKits, examples, themes, icons, schemas
|   +-- benchmarks/visual/     # Visual benchmark cases and baselines
|   +-- references/            # Workflow references
|   +-- scripts/               # Skill runtime scripts and helper gates
|   `-- evals/                 # Skill evaluation metadata
+-- deckkit-maker/             # DeckKit development helper skill
`-- tools/                     # Repository-level checks and maintenance tools
```

There is no root package manifest or build step. Runtime scripts that ship with
the skill should stay under `pptx-nova/scripts/`. Repository-only maintenance
tools belong under `tools/`.

Workflow references are grouped under `pptx-nova/references/{create,edit,translation,runtime,review,content,policies}/`.
The reference root contains only its index and shared `common-workflow.md`. Refurbishment and
template-following belong to `edit/`. When moving references, preserve filenames and section
headings and update skill routing, relative reading paths, runtime `requiredReferences[]`, and
repository callers together. The public audit checks reference layout, links and discoverability;
the maintenance suite also checks callers in repository documentation and `deckkit-maker`.

## Development Guidelines

- Keep publishable skill files self-contained inside `pptx-nova/`.
- Do not make runtime code depend on repository-root `tools/`, local machine
  paths, private checkouts, or generated files outside the skill directory.
- All scripts shipped anywhere inside `pptx-nova/` must be plain JavaScript ES
  modules (`.mjs`) running directly on Node.js 20 or later, using only Node
  built-ins. Node.js is already a dependency; do not add Python or Nushell, which
  users may not have installed. The published `xdoc` binary is the only allowed
  external runtime dependency; do not require package installation.
- Prefer Nushell for repository maintenance scripts when structured file
  inspection or release checks benefit from it; use `.mjs` when Node is a better
  fit. Keep maintenance scripts under `tools/` by default and all human-facing
  Nushell output, help, and generated prose in English.
- Optional and platform-specific helpers follow the same `.mjs` rule. Do not add
  `.py`, `.nu`, shell wrappers, or other script formats inside `pptx-nova/`, or
  invoke Python/Nushell from `.mjs` to bypass the rule. Repository-only Nushell
  tools stay under `tools/`, outside the published skill.
- Use kebab-case for DeckKit ids and file names, for example
  `consulting-dark/consulting-dark.kit.mjs` and `cli/create/build.mjs`.
- Prefer JSON catalogs and schemas over undocumented loose files.

Existing non-`.mjs` helpers are migration debt and must be ported to
dependency-free `.mjs`; they do not create exceptions for new scripts.

## Documentation Guidelines

Keep user-facing capability claims precise.

- Current source inputs should be described as Markdown/text content, pasted
  tables, PDFs or web pages as extracted source material, existing PPTX files,
  and CSV/JSON data.
- Do not imply direct `.xlsx`/`.xls` spreadsheet ingestion unless that support
  is implemented.
- Do not imply arbitrary `.docx` ingestion unless that support is implemented.
- Phrase refurbishment and translation preservation as goals unless validation
  for a specific workflow proves the claim.
- Avoid exposing low-level command sequences in user-facing docs unless the
  section is explicitly for maintainers.

Public xdoc documentation must describe published binaries and behavior verified
through the exact runtime's `xdoc --version`, focused `xdoc schema`, reports, and
release evidence. Do not expose private build instructions, package names, or
unpublished integration routes. Normalize and validate maintainer-provided facts
against the approved runtime contract before using them in public docs.

Do not hand-edit generated documentation blocks or `docs/xdoc-schema.json`.
Refresh that snapshot only when the task explicitly includes it, through
`just schema` or `just schema <captured-schema>`. For a release-documentation
refresh, capture schema from a clean approved binary and pass that file to
`just schema <captured-schema>`; the recipe normalizes the facts and checks
consistency. Change the generator and its tests when normalization policy changes.

## DeckKit Contributions

Use [deckkit-maker](deckkit-maker/SKILL.md) for DeckKit development. Read its
[componentization workflow](deckkit-maker/references/componentize.md), the
[design contract reference](pptx-nova/references/create/design-contracts.md), and
the [DeckKit conventions](pptx-nova/assets/deckkits/README.md) before adding or
migrating a kit. Ordinary presentation delivery uses `pptx-nova`.

### Files and Responsibilities

Keep each kit under `pptx-nova/assets/deckkits/<id>/`:

| File or directory                             | Responsibility                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `<id>.kit.mjs`                                | Thin public entry; `createDeck(content)` returns `{ patch, warnings }`  |
| `design.json`                                 | Design tokens, rules, roles, and composition contract                   |
| `intent.md`                                   | Design decisions, content guidance, migration notes, and editing limits |
| `layouts.mjs`                                 | Layout selection and capacity checks for actual content instances       |
| `components.mjs`, `registry.mjs`              | Component execution and visual-family registration, when needed         |
| `schemas/`                                    | This kit's page-type schemas and visible-text slot budgets              |
| `examples/content.json`, `examples/build.mjs` | Main content example and development/benchmark build adapter            |

Keep common runtime helpers in `deckkits/shared/`; only common content/design
schemas belong in `deckkits/schemas/`. Kits must not import another kit's
implementation directly. New visual families register through
`shared/design-family-registry.mjs` and reuse shared validation and execution gates.
Catalog paths are relative to `assets/deckkits/`; visual index paths are relative
to `benchmarks/visual/`. The example build adapter must resolve its default
`content.json` from its own directory, independently of the caller's working directory.

Distinguish three kinds of examples and evidence:

- `assets/deckkits/<id>/examples/`: content and build inputs.
- `benchmarks/visual/cases/<id>/`: regression fixtures, expectations, and dated reviews;
  reviewed low-severity baselines live in `benchmarks/visual/baselines/`.
- `assets/examples/deckkits/<id>/`: curated, redistributable PPTX showcases and previews.

### Content and Design Contracts

Freeze reusable visual rules in the kit; keep titles, claims, metrics, entities,
dates, sources, and callout text in content. Neutral structural labels may have
content overrides. Do not hard-code reference business text or use it as a fallback.
One-off reference photos, screenshots, illustrations, and background images must
not enter the kit, examples, or bundled assets; document asset slots or placeholder
behavior instead. Reusable brand assets require clear authorization and user confirmation.

Keep schema fields, `layoutContract`, slot budgets, actual rendering, and catalog
coverage aligned. Reject blank required text and excessive item counts; do not
silently truncate content or accept fields the renderer ignores. Keep chart values
numeric and display formatting separate. Document when derived shapes or labels
require regeneration after manual data edits.

Edit the design contract rather than generated budgets or catalog projections.
After changing a registered design, regenerate and check its projections:

```bash
node tools/generate-pptx-design-projections.mjs <deckkit-id>
node tools/generate-pptx-design-projections.mjs <deckkit-id> --check
```

Preserve existing asset-slot metadata and independently registered refurbishment
mappings. Passing generator checks does not establish native skinning, arbitrary
existing-deck refurbishment, or source-preservation support.

Add meaningful tests under `tools/tests/deckkits/` for each page type: minimal
valid input, non-reference-topic content, capacity boundaries, blank required fields,
and any asset or rich-text behavior. Audit content leakage using a patch built from
non-reference-topic content and a reference-specific denylist; retain the report
and cover emitted text carriers in regression tests. The
[content leak audit](deckkit-maker/scripts/content-leak-audit.mjs) has bounded
coverage, so supplement it with PPTX text readback and visual review.

Keep `shared/core-primitives.kit.mjs` focused on geometry safety and op generation.
Kit-specific palettes, spacing, chrome, and layouts stay in the kit. Shared-core
changes require reusable evidence and user confirmation; run all existing DeckKit
validation tests and affected benchmarks afterward.

### Creation, Repair, and Readiness

For a new kit, establish and review the reference-based visual baseline before
componentizing it. Record sources, font substitutions, asset decisions, coverage,
and known limits. Use a fresh `.tmp/deckkit-<id>-<run>/` and numbered iterations;
keep references and earlier evidence read-only. Existing-kit repairs extend the
registered kit and its tests instead of repeating new-kit initialization.

Register the entry, design contract, schemas, examples, coverage, visual grammar,
density limits, and quality metadata together. A new page type must also be
registered in the common content schema. Follow the DeckKit README's semver rules:
compatible fixes are patch changes, additive page types/optional fields are minor,
and removed/renamed fields, newly rejected inputs, or changed layout capacity are major.

| Catalog readiness | Contribution expectation                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `experimental`    | Initial registration; no automatic delivery eligibility                                   |
| `candidate`       | Indexed benchmarks pass; creation workflow normally stops here                            |
| `production`      | Delivery-eligible after quality gates, zero manual hard defects, and confirmed PNG review |
| `default`         | Meets delivery gates and is explicitly registered for default selection                   |

Readiness is separate from versioning. Do not downgrade a repaired production kit
merely because a new-kit example uses `candidate`. Use the current catalog and
readiness audit for eligibility; dated benchmark reviews describe their acceptance
run. Production promotion in the deckkit-maker workflow requires user confirmation
after review, plus `--confirm-manual-png-review` in the catalog update command.

## Validation

Run the following commands from the repository root. The direct Node commands
do not require `just` or Nushell; the repository's `just` recipes use Nushell.

List all DeckKits with their catalog readiness, version, and committed PPTX example location using
`just ls`. Narrow terminals use a text list so columns are not hidden. PPTX paths are relative to
the printed example root. Use `just ls --json`
for full repository-relative PPTX, preview and content paths, supported slide-type counts, and
explicit `available`, `missing`, or `unregistered` PPTX availability. The read-only Nushell helper lives
at `tools/list-deckkits.nu` and can also run directly from another working directory.

Run the baseline tool suite with `node tools/run-tests.mjs` or `just t`. Tests are grouped by
domain under `tools/tests/`; select a group with `node tools/run-tests.mjs deckkits` and inspect
discovery with `node tools/run-tests.mjs --list`. CI uses this same recursive entry point.

Published CLI entries live in `pptx-nova/scripts/cli/<workflow>/` and reusable internal modules
in `pptx-nova/scripts/lib/<domain>/`. Keep internal modules independent of CLI entry points and
anchor skill resources through `lib/runtime/skill-paths.mjs`. See the scripts and tests READMEs
for ownership and naming rules; the public audit and layout tests enforce these conventions.
The five remediation tests that execute a real xdoc binary are opt-in and report
an explicit skip by default; the remediation unit test still runs. To include
the integration tests, set `XDOC_TEST_BIN` to the absolute path of an approved
xdoc executable publishing the remediation contract, then run
`node --test tools/tests/runtime/remediation.test.mjs`. An explicitly configured
missing or incompatible binary fails the tests.

Before changing runtime scripts, DeckKits, schemas, examples, or assets, run:

```bash
node tools/pptx-nova-smoke-test.mjs
node tools/pptx-nova-audit-public.mjs --strict
```

Also run the smoke test before publishing or packaging the skill, and the strict
public audit when preparing a public release.

The smoke test validates bundled DeckKit content, patch generation, icon lookup,
DeckKit selection, session-rules normalization/resolution, and Edit Contract
source and evidence bindings. The public audit checks for private paths,
unexpected binaries, missing licenses, and release blockers.

### DeckKit Checks

For DeckKit changes, validate the example, inspect slot consistency, and run the
DeckKit tests. Adding or moving kit files also requires the directory-policy test
and strict public audit; keep deckkit-maker authoring guidance aligned with any
layout-policy change.

```bash
node pptx-nova/assets/deckkits/validate-content.mjs \
  pptx-nova/assets/deckkits/<deckkit-id>/examples/content.json \
  --deckkit <deckkit-id> --mode delivery --json
node pptx-nova/scripts/cli/deckkits/slots.mjs --deckkit <deckkit-id>
node pptx-nova/scripts/cli/deckkits/slot-consistency.mjs --deckkit <deckkit-id> --json
node tools/run-tests.mjs deckkits maintenance/deckkit-layout.test.mjs
```

New kits require a committed golden case in `benchmarks/visual/index.json`, plus
recorded stress-density and mixed-language reviews. Keep the latter in the current
run unless they justify permanent visual fixtures. Every indexed case remains a
gate, including existing stress/mixed-language cases.

Record the runtime version/capabilities and freeze `XDOC_FIELD_DATE` for comparable
renders. Replace the placeholders below and use the same fresh `--out` for the
benchmark, readiness audit, and catalog update:

```bash
XDOC_FIELD_DATE=<YYYY-MM-DD> node pptx-nova/scripts/cli/deckkits/benchmark.mjs \
  --deckkit <deckkit-id> --all --out .tmp/deckkit-<id>-<run>/benchmark/01
node pptx-nova/scripts/cli/deckkits/readiness.mjs \
  --deckkit <deckkit-id> --target candidate --benchmark-mode required-live \
  --out .tmp/deckkit-<id>-<run>/benchmark/01 --json
node pptx-nova/scripts/cli/deckkits/catalog-update.mjs \
  --deckkit <deckkit-id> --out .tmp/deckkit-<id>-<run>/benchmark/01 --json
```

The environment assignment above is POSIX shell syntax; Nushell uses
`with-env { XDOC_FIELD_DATE: '<YYYY-MM-DD>' } { ... }`.
The final command previews the catalog update; add `--write` after inspecting it.
For a new kit advancing to candidate, also add `--readiness candidate`.
Use `--target delivery` to check a production/default kit. Readiness without
`required-live` defaults to catalog evidence (or live mode when `--out` is supplied)
and does not require fresh benchmark output. Use `required-live` for change validation.
Move the next iteration to `benchmark/02`; do not use `--clean` to delete earlier evidence.

Benchmark success does not replace the full golden PPTX's canonical Create gate
and per-slide PNG review under the same runtime and frozen field date. Review
contact sheets, individual pages, and critical details; keep vision high/medium
at zero. New or changed low findings block delivery/promotion even when the
benchmark exits successfully. Update a low baseline only after reviewing and
accepting those findings, never just to make a check green. See the
[benchmark guide](pptx-nova/benchmarks/visual/README.md) and
[visual acceptance checklist](deckkit-maker/references/visual-acceptance.md).

Catalog updates do not infer manual review. After completing the required reviews
and obtaining promotion confirmation, production promotion additionally needs
`--manual-hard-defects 0 --readiness production --confirm-manual-png-review --write`
on the catalog update using this same `--out`; then rerun delivery readiness.

### Curated DeckKit Examples

When an intentional showcase's content, visuals, or catalog metadata changes, use
the updater to refresh its PPTX, preview, summary, manifest hashes, and deck-catalog
entry together:

```bash
just deckkit-examples -d <deckkit-id>
just deckkit-examples check -d <deckkit-id>
```

These maintainer commands require the rendering toolchain. Each `just` invocation
allocates a fresh temporary run by default. The updater owns
`assets/examples/deckkits/` and its `assets/decks/catalog.json` entries; preserve
the examples root index and the `generator/`, `create/`, and `edit/` examples.
See the [examples index](pptx-nova/assets/examples/README.md).

### Native xdoc Contract Tests

Some metadata validation and DeckKit selection scripts can run without `xdoc`,
but real PPTX apply, conversion, preview, diff, and vision-check workflows require
the CLI.

To check an installed xdoc's native edit, autofit, translation, sidecar-publication,
and asset-boundary contracts, including the Edit Contract gate with real
semantic/style/visual reports, run the opt-in executable suite:

```bash
XDOC_TEST_BIN=/absolute/path/to/xdoc node --test tools/tests/contracts/native-contracts.test.mjs
```

The default test suite skips these cases when `XDOC_TEST_BIN` is absent. Set
`XDOC_TEST_EVIDENCE_DIR` to retain the independently allocated scenario outputs;
these maintainer tests are not dependencies of the published skill.

Add `XDOC_TEST_VISUAL=1` to also check every Cartesian stock page through
canonical PDF/PNG Create gates. This additional case uses the installed
authorization and requires an unwatermarked CLI License; the ordinary native
cases keep isolated configuration. Evidence directories may be relative or absolute.

## Generated Files

Do not commit generated `.pptx`, PNG previews, contact sheets, full vision
reports, or temporary run outputs unless they are intentional curated examples
under `pptx-nova/assets/examples/`.

Do not overwrite or delete user-provided decks, reference files, or generated
evidence from unrelated runs.

## Commits And Pull Requests

Use Conventional Commit style:

```text
feat(pptx-nova): add translation audit artifact
fix(pptx): preserve chart labels during translation
docs(deckkit-maker): clarify DeckKit readiness workflow
chore: update public audit fixture
```

Keep commits scoped. Include a detailed body when behavior, validation, or
release safety changes.

Pull requests should include:

- A concise summary of the user-visible change.
- Validation commands run.
- Changed DeckKit ids, versions, readiness transitions, or other assets; include
  migration guidance for breaking content-schema changes.
- For DeckKit visual changes, benchmark/readiness results and canonical per-page
  review evidence, including stress-density and mixed-language coverage.
- Screenshots or contact sheets when visual output changed.
- Any known risks, skipped checks, or follow-up work.

Do not add `Co-Authored-By` trailers unless they are explicitly required by the
human contributor.
