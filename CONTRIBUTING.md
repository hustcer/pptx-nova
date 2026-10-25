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
- Prefer plain JavaScript ES modules (`.mjs`) for skill runtime scripts and use
  Node built-ins when possible.
- Prefer Nushell for repository maintenance scripts when structured file
  inspection or release checks benefit from it.
- Use kebab-case for DeckKit ids and file names, for example
  `consulting-dark/consulting-dark.kit.mjs` and `cli/create/build.mjs`.
- Prefer JSON catalogs and schemas over undocumented loose files.

Do not add Python scripts unless there is a specific requirement.

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

## Validation

List all DeckKits with their catalog readiness, version, and committed PPTX example location using
`just list`. Narrow terminals use a text list so columns are not hidden. PPTX paths are relative to
the printed example root. Use `just list --json`
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

For DeckKit changes, also run targeted readiness and benchmark checks for the
affected DeckKit:

```bash
node pptx-nova/scripts/cli/deckkits/readiness.mjs --deckkit <deckkit-id> --target delivery
node pptx-nova/scripts/cli/deckkits/benchmark.mjs --deckkit <deckkit-id> --all
```

The smoke test validates bundled DeckKit content, patch generation, icon lookup,
and DeckKit selection. The public audit checks for private paths, unexpected
binaries, missing licenses, and release blockers.

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
- Changed DeckKits or assets, if any.
- Screenshots or contact sheets when visual output changed.
- Any known risks, skipped checks, or follow-up work.

Do not add `Co-Authored-By` trailers unless they are explicitly required by the
human contributor.
