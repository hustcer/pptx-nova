# Repository Guidelines

## Project Structure & Module Organization

This repository packages two agent skills. `pptx-nova/` is the main publishable skill for creating, editing, translating, refurbishing, and checking editable PowerPoint decks. Its runtime scripts live in `pptx-nova/scripts/`, reusable assets in `pptx-nova/assets/`, visual benchmark cases in `pptx-nova/benchmarks/visual/`, and workflow references in `pptx-nova/references/`. `deckkit-maker/` is a developer-side helper skill for creating or repairing DeckKits used by `pptx-nova`. Repository-level release checks are in `tools/`.

## Build, Test, and Development Commands

There is no root package manifest or build step. Run scripts directly with Node:

```bash
node tools/pptx-nova-smoke-test.mjs
node tools/pptx-nova-audit-public.mjs --strict
node pptx-nova/scripts/cli/deckkits/readiness.mjs --deckkit consulting-dark --target delivery
node pptx-nova/scripts/cli/deckkits/benchmark.mjs --deckkit consulting-dark --all
```

The smoke test validates bundled DeckKit content, patch generation, icon lookup, and DeckKit selection. The public audit checks for private paths, unexpected binaries, missing licenses, and release blockers.

## Coding Style & Naming Conventions

Local skill-development, validation, inspection, release-check, and repository-maintenance scripts used only by maintainers or a small subset of users may use Nushell when it is a good fit. Prefer placing these Nushell scripts under the repository-root `tools/` directory. Place them under an individual skill's `scripts/` directory only when they must be distributed with that skill as an optional helper; this is the secondary location, not the default. Use `.mjs` when Node is a better fit.

Every script required by a published user workflow must be a plain JavaScript ES module (`.mjs`) that runs directly on Node.js 20 or later. These required runtime scripts must use only Node built-in modules and must not require Nushell, Python, a package-manager install, or any third-party runtime dependency; the published `xdoc` binary is the only allowed external runtime dependency. Nushell scripts may appear inside a published skill only for optional, platform-specific, or capability-gated enhancements whose absence does not break the baseline workflow. Existing `.nu` helpers are optional evidence integrations, not precedent for mandatory runtime dependencies. Such optional routes must detect or clearly disclose unavailability and must not silently claim that their evidence was produced. If an optional Nushell helper becomes required by a user workflow, port it to a dependency-free `.mjs` implementation before making that route mandatory. Do not add Python scripts to published user workflows.

Keep files self-contained inside the publishable skill when they are part of `pptx-nova`; runtime code must not depend on repository-root `tools/` or local machine paths. Use kebab-case for DeckKit ids and file names, for example `consulting-dark/consulting-dark.kit.mjs` and `cli/create/build.mjs`. Prefer JSON catalogs and schemas over undocumented loose files.

Keep each DeckKit under `pptx-nova/assets/deckkits/<id>/`: `<id>.kit.mjs`, `design.json`, `intent.md`, `layouts.mjs`, optional `components.mjs`/`registry.mjs`, `schemas/`, and `examples/content.json` plus `examples/build.mjs`. Common runtime modules belong in `deckkits/shared/`; only the common content/design schemas belong in `deckkits/schemas/`. Suite modules must not import another suite directly. Catalog paths are relative to `deckkits/`. Run the directory-policy test and public audit after adding or moving DeckKit files; update `deckkit-maker` authoring conventions with any layout-policy change.

## Testing Guidelines

Group `pptx-nova/assets/examples/` by purpose: curated showcases plus their generated README/manifest under `deckkits/`, the exploratory template and generated theme dependency together under `generator/`, and creation/edit input examples under `create/` and `edit/`. Keep the root README as the maintained index. The DeckKit example updater owns only `examples/deckkits/` and its deck-catalog entries; update paths, hashes and the examples-layout audit when relocating assets.

Published CLI entries belong under `pptx-nova/scripts/cli/<workflow>/` and internal modules under `pptx-nova/scripts/lib/<domain>/`. Keep the scripts root limited to README plus these two roles. Use concise file names within each namespace; internal modules must not import CLI entry points or execute a CLI when imported. Resolve shared resources and child commands through `scripts/lib/runtime/skill-paths.mjs`.

Keep tests under `tools/tests/{deckkits,workflows,contracts,evidence,runtime,maintenance}/`, with support code in `helpers/` and data in `fixtures/`. Run all suites with `node tools/run-tests.mjs`; CI and `just t` must use this same recursive discovery entry point. Do not restore flat test globs. Preserve test names and conditional integration coverage when splitting suites.

Before changing runtime scripts, DeckKits, schemas, examples, or assets, run the smoke test and public audit. For DeckKit changes, also run targeted readiness and benchmark commands for the affected id. Do not commit generated `.pptx`, PNG previews, contact sheets, full vision reports, or temporary run outputs unless they are intentional curated examples under `pptx-nova/assets/examples/`.

## Commit & Pull Request Guidelines

Follow Conventional Commit style as used in history: `feat(pptx-nova): ...`, `fix(pptx): ...`, `docs(deckkit-maker): ...`, or `chore: ...`. Keep commits scoped and include a detailed body when behavior, validation, or release safety changes. Pull requests should summarize the user-visible change, list validation commands run, call out changed DeckKits or assets, and include screenshots/contact sheets only when visual output changed.

## Agent-Specific Instructions

Do not overwrite or delete user-provided decks, reference files, or generated evidence from unrelated runs. Keep `pptx-nova` as the primary user-facing skill; mention `deckkit-maker` only for DeckKit development workflows.

When updating user-facing documentation, keep capability claims precise. Do not imply direct `.xlsx`/`.xls` spreadsheet or arbitrary `.docx` ingestion unless that support is implemented; describe current source inputs as Markdown/text content, pasted tables, PDFs/web pages as extracted source material, existing PPTX files, and CSV/JSON data. Phrase preservation claims for refurbishment or translation as goals unless the workflow and validation gates actually prove them for the specific task.

Public xdoc documentation is executable-first. Describe only published binary distribution channels and behavior verified through the exact runtime's `xdoc --version`, `xdoc schema`, reports, and release evidence. Do not publish private build commands, MoonBit path dependencies, internal package names, unpublished artifacts, or in-process library facades as installation or integration paths.

Maintainer-generated xdoc documents may be used as trusted inputs only after their machine facts have been normalized and checked against an approved runtime contract. Copy the contract facts, not private-repository prose. Do not hand-edit generated blocks or refresh `docs/xdoc-schema.json` unless the task explicitly includes that snapshot.

Update `docs/xdoc-schema.json` only through `just schema` (capture the local runtime) or `just schema <captured-schema>` (use a captured runtime schema). Never hand-edit the snapshot or use another command as an alternative snapshot writer. For an explicit xdoc release-documentation refresh, capture `xdoc schema` from a clean approved binary and pass that file to `just schema <captured-schema>`. The recipe invokes the updater to synchronize build identity and schema counts, reject `-dirty` builds, block maintainer-only package names, source symbols, development-build claims, and unpublished service routes, and run the final consistency check. When the normalization policy needs to change, update the generator and its tests, then regenerate through `just schema`.

Keep all human-facing Nushell output in English, including stdout, stderr, `error make` messages, command help comments, warnings, and generated prose. Stable JSON keys and machine status codes remain unchanged for compatibility.
