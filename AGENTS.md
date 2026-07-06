# Repository Guidelines

## Project Structure & Module Organization

This repository packages two agent skills. `pptx-nova/` is the main publishable skill for creating, editing, translating, refurbishing, and checking editable PowerPoint decks. Its runtime scripts live in `pptx-nova/scripts/`, reusable assets in `pptx-nova/assets/`, visual benchmark cases in `pptx-nova/benchmarks/visual/`, and workflow references in `pptx-nova/references/`. `deckkit-maker/` is a developer-side helper skill for creating or repairing DeckKits used by `pptx-nova`. Repository-level release checks are in `tools/`.

## Build, Test, and Development Commands

There is no root package manifest or build step. Run scripts directly with Node:

```bash
node tools/pptx-nova-smoke-test.mjs
node tools/pptx-nova-audit-public.mjs --strict
node pptx-nova/scripts/pptx-nova-deckkit-readiness.mjs --deckkit consulting-dark --target delivery
node pptx-nova/scripts/pptx-nova-deckkit-benchmark.mjs --deckkit consulting-dark --all
```

The smoke test validates bundled DeckKit content, patch generation, icon lookup, and DeckKit selection. The public audit checks for private paths, unexpected binaries, missing licenses, and release blockers.

## Coding Style & Naming Conventions

Place developer-support scripts that are not used inside a published skill under `tools/`. Prefer Nushell for these support scripts, especially for file inspection, structured data pipelines, release checks, and repository maintenance tasks that Nushell handles well; use `.mjs` next when Node is a better fit. For skill-internal runtime scripts under `pptx-nova/scripts/`, prefer plain JavaScript ES modules (`.mjs`) and avoid external dependencies; Node built-in modules are acceptable so users can run the skill without extra installs. Do not use Python scripts unless there is a specific requirement.

Keep files self-contained inside the publishable skill when they are part of `pptx-nova`; runtime code must not depend on repository-root `tools/` or local machine paths. Use kebab-case for DeckKit ids and file names, for example `consulting-dark.kit.mjs` and `pptx-nova-build.mjs`. Prefer JSON catalogs and schemas over undocumented loose files.

## Testing Guidelines

Before changing runtime scripts, DeckKits, schemas, examples, or assets, run the smoke test and public audit. For DeckKit changes, also run targeted readiness and benchmark commands for the affected id. Do not commit generated `.pptx`, PNG previews, contact sheets, full vision reports, or temporary run outputs unless they are intentional curated examples under `pptx-nova/assets/examples/`.

## Commit & Pull Request Guidelines

Follow Conventional Commit style as used in history: `feat(pptx-nova): ...`, `fix(pptx): ...`, `docs(deckkit-maker): ...`, or `chore: ...`. Keep commits scoped and include a detailed body when behavior, validation, or release safety changes. Pull requests should summarize the user-visible change, list validation commands run, call out changed DeckKits or assets, and include screenshots/contact sheets only when visual output changed.

## Agent-Specific Instructions

Do not overwrite or delete user-provided decks, reference files, or generated evidence from unrelated runs. Keep `pptx-nova` as the primary user-facing skill; mention `deckkit-maker` only for DeckKit development workflows.

When updating user-facing documentation, keep capability claims precise. Do not imply direct `.xlsx`/`.xls` spreadsheet or arbitrary `.docx` ingestion unless that support is implemented; describe current source inputs as Markdown/text content, pasted tables, PDFs/web pages as extracted source material, existing PPTX files, and CSV/JSON data. Phrase preservation claims for refurbishment or translation as goals unless the workflow and validation gates actually prove them for the specific task.
