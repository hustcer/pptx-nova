# Repository Guidelines

## Project Structure & Module Organization

This repository packages two agent skills. `pptx-nova/` is the main publishable skill for creating, editing, translating, refurbishing, and checking editable PowerPoint decks. Its runtime scripts live in `pptx-nova/scripts/`, reusable assets in `pptx-nova/assets/`, visual benchmark cases in `pptx-nova/benchmarks/visual/`, and workflow references in `pptx-nova/references/`. `deckkit-maker/` is a developer-side helper skill for creating or repairing DeckKits used by `pptx-nova`. Repository-level release checks are in `tools/`.

## Build, Test, and Development Commands

There is no root package manifest or build step. Run scripts directly with Node.js 20 or later:

```bash
node tools/pptx-nova-smoke-test.mjs
node tools/pptx-nova-audit-public.mjs --strict
node tools/run-tests.mjs deckkits maintenance/deckkit-layout.test.mjs
```

The smoke test validates bundled DeckKit content, patch generation, icon lookup, and DeckKit selection. The public audit checks for private paths, unexpected binaries, missing licenses, and release blockers.

For DeckKit change validation, run the benchmark before readiness, using a fresh output directory for the current iteration. Replace `<id>` and `<run>` below; use `--target candidate` for a new kit and `--target delivery` for an existing production/default kit:

```bash
node pptx-nova/scripts/cli/deckkits/benchmark.mjs \
  --deckkit <id> --all --out .tmp/deckkit-<id>-<run>/benchmark/01
node pptx-nova/scripts/cli/deckkits/readiness.mjs \
  --deckkit <id> --target delivery --benchmark-mode required-live \
  --out .tmp/deckkit-<id>-<run>/benchmark/01 --json
```

Use the same `--out` for benchmark, readiness, and any `catalog-update.mjs` invocation. Catalog-mode readiness is appropriate for selection and CI metadata checks; it does not validate a changed kit against current-run benchmark evidence. Detailed commands and contribution requirements are in [CONTRIBUTING.md](CONTRIBUTING.md#deckkit-contributions).

## Coding Style & Naming Conventions

Repository-only skill-development, validation, inspection, release-check, and maintenance scripts may use Nushell when it is a good fit. Keep these Nushell tools under the repository-root `tools/` directory, outside the published `pptx-nova/` skill. Use `.mjs` when Node is a better fit.

**All scripts shipped anywhere inside `pptx-nova/` must be plain JavaScript ES modules (`.mjs`) running directly on Node.js 20 or later.** This includes CLI entries, library modules, DeckKit build helpers, and optional or platform-specific integrations. The skill already depends on Node.js; do not add Python or Nushell as another user dependency, since users cannot be assumed to have them installed. Do not add `.py`, `.nu`, shell wrappers, or other script formats, and do not invoke Python or Nushell from `.mjs` as a workaround. Use only Node built-in modules, without package installation or third-party runtime dependencies; the published `xdoc` binary is the only allowed external runtime dependency. Existing non-`.mjs` helpers are migration debt that must be ported to dependency-free `.mjs`, not policy exceptions or precedents for new scripts.

Keep files self-contained inside the publishable skill when they are part of `pptx-nova`; runtime code must not depend on repository-root `tools/` or local machine paths. Use kebab-case for DeckKit ids and file names, for example `consulting-dark/consulting-dark.kit.mjs` and `cli/create/build.mjs`. Prefer JSON catalogs and schemas over undocumented loose files.

Keep each DeckKit under `pptx-nova/assets/deckkits/<id>/`: `<id>.kit.mjs`, `design.json`, `intent.md`, `layouts.mjs`, optional `components.mjs`/`registry.mjs`, `schemas/`, and `examples/content.json` plus `examples/build.mjs`. Common runtime modules belong in `deckkits/shared/`; only the common content/design schemas belong in `deckkits/schemas/`. Suite modules must not import another suite directly. Catalog paths are relative to `deckkits/`. Run the directory-policy test and public audit after adding or moving DeckKit files; update `deckkit-maker` authoring conventions with any layout-policy change.

## DeckKit Development Rules

- Before creating or migrating a kit, read [deckkit-maker](deckkit-maker/SKILL.md), its [componentization workflow](deckkit-maker/references/componentize.md), the [design contract reference](pptx-nova/references/create/design-contracts.md), and the [DeckKit conventions](pptx-nova/assets/deckkits/README.md). Review the reference-based visual baseline before componentizing a new kit. Existing-kit repairs extend the registered kit and its tests rather than rerunning new-kit initialization.
- Treat `design.json` as design facts, `intent.md` as design judgment, and `<id>.kit.mjs` as the thin public entry. Layout resolution must check actual content capacity; new visual families register through `shared/design-family-registry.mjs`. After changing a registered design, run `node tools/generate-pptx-design-projections.mjs <id>` and then the same command with `--check`; do not hand-edit generated budgets or catalog projections. Preserve asset-slot metadata and independently registered refurbishment mappings; generator support does not imply native skinning or source-preservation support.
- Keep schema fields, slot budgets, layout contracts, rendering, and catalog coverage aligned. Register new page types in the common content schema. Reject blank required text and excessive item counts; do not silently truncate input or accept fields that rendering ignores. Add page-type tests for minimal valid input, non-reference-topic content, capacity boundaries, and relevant asset/rich-text behavior. Run content validation, slot consistency, and the DeckKit test group for affected kits.
- Keep reference titles, claims, metrics, entities, dates, sources, and callouts in content, never hard-coded into reusable kit logic or fallback text. Audit leakage with non-reference-topic content and a reference-specific denylist, supplementing the audit's bounded coverage with emitted-text regression checks and PPTX readback. Do not bundle one-off reference images in kits, examples, or assets; reusable brand assets require clear authorization and user confirmation. Document asset-slot or placeholder behavior instead.
- Keep `shared/core-primitives.kit.mjs` focused on geometry safety and op generation; kit-specific colors, spacing, chrome, and layouts stay in the kit. Shared-core changes require evidence of cross-kit reuse or a general geometry/op-generation need, plus user confirmation. Run all existing DeckKit validation tests and affected benchmarks after such changes.
- New kits start as `experimental` and normally advance only to `candidate`. Promotion to `production`/`default` requires the applicable quality gates, completed per-page PNG review, zero manual hard defects, user confirmation, and `--confirm-manual-png-review`; catalog updates do not infer manual review. Preserve an existing kit's readiness during routine repair rather than copying a new-kit downgrade. Apply the DeckKit README's semver policy, including major versions for removed/renamed fields, newly rejected inputs, or changed layout capacity. Record migration guidance and known limits.

## Testing Guidelines

Group `pptx-nova/references/` by `create/`, `edit/`, `translation/`, `runtime/`, `review/`,
`content/`, and `policies/`. Keep only the index `README.md` and `common-workflow.md` at its
root. Refurbishment and template-following belong under `edit/`. Preserve filenames and section
headings when moving guidance; update skill routing, relative reading paths, external callers,
and runtime `requiredReferences[]` paths together. Markdown links and reading paths are relative
to their containing document; explicit `references/...` paths are relative to the skill root.
The public audit and references-layout test enforce layout, target existence, and discoverability.

Group `pptx-nova/assets/examples/` by purpose: curated showcases plus their generated README/manifest under `deckkits/`, the exploratory template and generated theme dependency together under `generator/`, and creation/edit input examples under `create/` and `edit/`. Keep the root README as the maintained index. The DeckKit example updater owns only `examples/deckkits/` and its deck-catalog entries; update paths, hashes and the examples-layout audit when relocating assets.

Published CLI entries belong under `pptx-nova/scripts/cli/<workflow>/` and internal modules under `pptx-nova/scripts/lib/<domain>/`. Keep the scripts root limited to README plus these two roles. Use concise file names within each namespace; internal modules must not import CLI entry points or execute a CLI when imported. Resolve shared resources and child commands through `scripts/lib/runtime/skill-paths.mjs`.

Keep tests under `tools/tests/{deckkits,workflows,contracts,evidence,runtime,maintenance}/`, with support code in `helpers/` and data in `fixtures/`. Run all suites with `node tools/run-tests.mjs`; CI and `just t` must use this same recursive discovery entry point. Do not restore flat test globs. Preserve test names and conditional integration coverage when splitting suites.

Before changing runtime scripts, DeckKits, schemas, examples, or assets, run the smoke test and public audit; rerun them and the affected tests after changes. For DeckKit changes, also run targeted benchmark and required-live readiness checks for the affected id.

Keep each DeckKit run under a fresh `.tmp/deckkit-<id>-<run>/` with numbered iterations. Record the exact runtime version/capabilities and freeze `XDOC_FIELD_DATE` across reference, candidate, and benchmark renders. Retain previous iterations; do not use `--clean` to delete earlier evidence. New kits need a committed golden benchmark plus recorded stress-density and mixed-language reviews; the latter may stay in the run directory unless they justify permanent fixtures. Every indexed case remains gated.

Benchmark success and historical low baselines do not replace the full golden PPTX's canonical Create gate and per-page PNG review under the same runtime and frozen date. Keep vision high/medium at zero; review new/changed low findings before updating their baseline, and do not treat a successful benchmark exit as delivery/promotion approval. Retain review findings and critical-detail evidence in the current run; follow the [visual acceptance checklist](deckkit-maker/references/visual-acceptance.md).

For intentional curated showcase changes, use `just deckkit-examples -d <id>` and `just deckkit-examples check -d <id>` to synchronize PPTX, preview, summary, manifest hashes, and deck-catalog entries. Each invocation gets a fresh temporary run by default. Do not hand-edit generated showcase metadata. Do not commit generated `.pptx`, PNG previews, contact sheets, full vision reports, or temporary run outputs unless they are intentional curated examples under `pptx-nova/assets/examples/`.

## Commit & Pull Request Guidelines

Follow Conventional Commit style as used in history: `feat(pptx-nova): ...`, `fix(pptx): ...`, `docs(deckkit-maker): ...`, or `chore: ...`. Keep commits scoped and include a detailed body when behavior, validation, or release safety changes. Pull requests should summarize the user-visible change, list validation commands run, call out changed DeckKits or assets, and include screenshots/contact sheets only when visual output changed. For DeckKit changes, include ids, versions, readiness transitions, migration guidance, and benchmark/canonical review results with stress-density and mixed-language coverage.

## Agent-Specific Instructions

Do not overwrite or delete user-provided decks, reference files, or generated evidence from unrelated runs. Keep `pptx-nova` as the primary user-facing skill; mention `deckkit-maker` only for DeckKit development workflows.

When updating user-facing documentation, keep capability claims precise. Do not imply direct `.xlsx`/`.xls` spreadsheet or arbitrary `.docx` ingestion unless that support is implemented; describe current source inputs as Markdown/text content, pasted tables, PDFs/web pages as extracted source material, existing PPTX files, and CSV/JSON data. Phrase preservation claims for refurbishment or translation as goals unless the workflow and validation gates actually prove them for the specific task.

Public xdoc documentation is executable-first. Describe only published binary distribution channels and behavior verified through the exact runtime's `xdoc --version`, `xdoc schema`, reports, and release evidence. Do not publish private build commands, MoonBit path dependencies, internal package names, unpublished artifacts, or in-process library facades as installation or integration paths.

Maintainer-generated xdoc documents may be used as trusted inputs only after their machine facts have been normalized and checked against an approved runtime contract. Copy the contract facts, not private-repository prose. Do not hand-edit generated blocks or refresh `docs/xdoc-schema.json` unless the task explicitly includes that snapshot.

Update `docs/xdoc-schema.json` only through `just schema` (capture the local runtime) or `just schema <captured-schema>` (use a captured runtime schema). Never hand-edit the snapshot or use another command as an alternative snapshot writer. For an explicit xdoc release-documentation refresh, capture `xdoc schema` from a clean approved binary and pass that file to `just schema <captured-schema>`. The recipe invokes the updater to synchronize build identity and schema counts, reject `-dirty` builds, block maintainer-only package names, source symbols, development-build claims, and unpublished service routes, and run the final consistency check. When the normalization policy needs to change, update the generator and its tests, then regenerate through `just schema`.

Keep all human-facing Nushell output in English, including stdout, stderr, `error make` messages, command help comments, warnings, and generated prose. Stable JSON keys and machine status codes remain unchanged for compatibility.
