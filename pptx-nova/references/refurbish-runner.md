# Refurbish Runner

Use this compact route when the user wants to restyle an existing PPTX while preserving its content.
The standard runner is the execution boundary: it chooses native or catalog-driven fallback, validates
content fidelity, creates one canonical high-DPI comparison, binds publication, and leaves human visual
judgment explicit.

## Non-skippable contract

- Treat the source PPTX as read-only content truth.
- Preserve slide ownership, visible text, tables, charts, diagrams, media, notes, links, and editable
  object semantics unless the user approves a specific change.
- Apply the requested DeckKit visibly. A light chrome-only change is not a completed refurbishment.
- Never preserve content by inserting source-slide screenshots or opaque page overlays.
- Let the compare gate publish the final PPTX. Do not copy or overwrite it afterward.

## Standard command

Check that the requested final path does not already exist, then run:

```bash
node <skill-root>/scripts/pptx-nova-refurbish-run.mjs \
  --deckkit <id> \
  --source source.pptx \
  --output out.pptx \
  --prompt-text "<original user request>" \
  --json
```

Add `--explicit` only when the user explicitly selected a non-production/non-default DeckKit. Add
`--review-policy` only for an exact source-hash-bound reviewed finding. `--prompt-text` (or
`--prompt-file`) archives the original request to `<run-dir>/prompt.txt` so the feedback gate can
consume it directly. Compare parts render concurrently (`--compare-concurrency`, default 3); lower
it to 1 only when diagnosing render issues on a constrained machine.

Do not add `--contact-diff` for ordinary full-deck review. The mandatory `refurbish-compare` already
contains the complete source/candidate comparison. `--contact-diff` exists for compatibility or when a
caller explicitly requires that artifact name; the runner materializes it from the same final compare
evidence without another render.

## Agent-facing output

`--json` prints a compact `pptx-nova-refurbish-result/v1` document containing only the decision surface:

- status, run directory, output path, and human-review requirement;
- `agentSummary` with gate results and artifact pointers;
- `agentSummary.findingAnalysis` with the shadow proposed status, compact findings, and
  `effectiveStatus=not-applied`;
- `performance` with total time, render share, top phases, a single nested `render` object, a single
  nested `budget` object, and Finding Analysis time/additional inspect/render counts;
- the terminal error when the run fails.

Compact Agent artifact paths are relative to `runDir`; published files outside it remain absolute. The
full report and `--json-full` retain compatibility fields and absolute paths.

After path preflight succeeds, the complete `pptx-nova-refurbish-run/v1` report is saved as
`<run-dir>/refurbish-run-summary.json`. A preflight error that prevents run-directory initialization is
returned directly and cannot create that file. Read the full report only when the compact result reports
a warning, failure, unsupported region, or a fact needed for diagnosis. Use `--json-full` only for debugging or a
consumer that explicitly requires the complete phase history.

Progress is archived to `<run-dir>/progress.jsonl` by default; `--progress-file` overrides it and
`none` disables it. Stderr carries only phase summaries. Read JSONL on failure or for performance.

## Progressive failure routing

Read `refurbish-plan.json.requiredReferences[]` after route selection. Those references are the only
additional workflow documents required for the current route:

- Native route with production/default readiness normally requires no deeper reference.
- `manual-fallback` or `explicit-manual-fallback` loads the named Refurbish section from
  `reference-create.md` before inspecting or repairing fallback artifacts.
- A readiness exception or missing DeckKit loads the named selection section from `deckkit-mode.md`.
- Load `inspect-and-edit.md` only for a page-local repair with ambiguous selectors.
- Load `export-and-check.md` only for a nonstandard export or compatibility investigation.

Do not preload `common-workflow.md`, all of `reference-create.md`, and all of `deckkit-mode.md` for a
standard runner invocation. The runner already enforces run isolation, output collision safety,
capability probing, audit gates, comparison coverage, and publication binding.

## Canonical evidence flow

```text
plan and readiness
  -> capability probe and source inspect
  -> native skin or generated fallback patch
  -> vision-diff and refurbish-audit
  -> source/candidate layout snapshots
  -> one semantic diff
  -> one review-policy evaluation
  -> Finding Analysis shadow (never changes the current gate)
  -> fidelity gate consuming that same review evaluation
  -> candidate preview
  -> one high-DPI refurbish comparison plus a low-layout-DPI Agent review assembled from its page cache
  -> optional contact-diff aliases from the same comparison
  -> compare publication gate
```

The high-DPI comparison is the visual source of truth. In the same xdoc invocation, the runner
assembles lower-layout-DPI `refurbish-agent-review*.png` from the same page bitmap cache, without
another PDF conversion or page render. Do not rerender merely to create another artifact name.

`finding-analysis.json` is calibration evidence in this release. Read its proposed status and top
findings, but never treat `effectiveStatus=not-applied` as a pass or use it to weaken fidelity,
comparison, publication, or human-review requirements.

## Review and delivery

A successful machine run returns `needs-human-review`. Scale the visual review to the deck size
instead of always opening every published byte:

- Always open the candidate contact sheet end to end; it is the candidate-only full-coverage overview.
- Open every path in `agentSummary.artifacts.refurbishAgentReviewParts` for the full source/candidate
  overview. These lower-resolution files are inspection proxies; the published high-DPI compare parts
  remain the delivery evidence.
- Always open the full-size previews named by actionable layout findings
  (`layout.actionablePreviewFiles`), plus any page that looks wrong on the contact sheet.
  `layout.topActionable[].deltaStatus` distinguishes inherited source findings
  (`unchanged`) from refurbish-introduced ones (`introduced`/`mixed`); inherited findings
  still need eyes but are not refurbish regressions.
- Open full high-DPI parts for actionable/suspicious slides, then spot-check the first and last parts.
  Do not load every high-DPI part after all Agent review parts have been inspected.
- When a part's thumbnails are too small to judge a suspicious page, render a focused
  high-resolution excerpt instead of enlarging the whole part:

  ```bash
  node <skill-root>/scripts/pptx-nova-compare.mjs \
    --source source.pptx --candidate candidate.pptx \
    --run-dir . --kind refurbish --slides <n>[,<n>...] \
    --output focused-review.png --report focused-review.json --overwrite --json
  ```

  Run this from the run directory. When actionable slides are known, the compact result exposes the
  copyable command as `agentSummary.nextSteps.focusedReviewCommand`. The excerpt reuses the run's page
  bitmap cache, so it costs assembly time only, not a re-render. Do not substitute it for the published
  compare parts in delivery evidence.

Confirm:

- the target DeckKit is visually apparent across the deck;
- titles, body text, tables, charts, diagrams, and assets remain legible;
- no source content disappeared or became a screenshot substitute;
- no new overlap, clipping, weak contrast, placeholder residue, or broken page chrome is visible.

Write `visual_review.json`. When macOS PowerPoint is available for a deliverable, run the bundled
clean-open helper. Feedback requests additionally require `skill-feedback.md` and the feedback gate.

Deliver only after compare and binding pass; list only key outputs, gates, evidence, and risks.
