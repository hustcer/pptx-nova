# Create Runner

Use this reference for the standard DeckKit-based new-deck workflow. It contains the shortest safe
path from prepared content to a machine-validated candidate. Load deeper creation references only for
the conditions listed below.

## Inputs

The standard runner requires:

- `content.json` matching the selected DeckKit content contract;
- `deck_lock.json` binding the output path, run directory, slide plan, and assumptions;
- an output `.pptx` path that does not already exist unless replacement was explicitly requested;
- an optional `assets_manifest.json` when the content uses registered external assets.

If these inputs are not prepared yet:

- read `references/create-express.md` for a simple/default deck;
- read `references/deckkit-mode.md` only when DeckKit selection or content slots are unresolved;
- read `references/create-studio.md` plus `references/design-lock-and-assets.md` for an explicitly
  high-control Studio task;
- read `references/narrative-quality.md` for persuasive decks with six or more slides.

Do not load all creation references by default.

## Standard command

```bash
node <skill-root>/scripts/pptx-nova-create-run.mjs \
  --deckkit <id> \
  --content <run-dir>/content.json \
  --lock <run-dir>/deck_lock.json \
  --output output.pptx \
  --run-dir <run-dir> \
  --json
```

Add `--assets <run-dir>/assets_manifest.json` only when the deck uses registered assets. Add
`--overwrite` only when replacing the final path was explicitly intended.

The runner owns this sequence:

```text
capability probe
-> validate content
-> build patch
-> check lock
-> dry-run
-> apply candidate
-> vision check
-> one full preview/contact sheet
-> atomic publish
```

It never marks manual visual review complete.

## Agent-facing output

`--json` prints a compact `pptx-nova-create-result/v1` document containing:

- status, run directory, output path, and review requirement;
- compact gate and artifact pointers in `agentSummary`;
- phase and preview performance in `performance`;
- exact conditional documentation routes in `requiredReferences[]`;
- the terminal error when execution stops.

The complete `pptx-nova-create-run/v1` report is saved as
`<run-dir>/create-run-summary.json` after path preflight succeeds. Read it only when the compact result
reports a failure, warning, budget exception, or a fact needed for diagnosis. Use `--json-full` only
for debugging or compatibility with a caller that explicitly needs the complete report on stdout.

Progress is emitted separately. JSONL progress contains phase names, executable names, argument
counts, elapsed time, and compact status fields; complete commands remain in the full report.

## Performance contract

The standard Create route renders the final candidate once through `preview-render`. Its performance
summary records:

- total and measured phase time;
- render time and share;
- preview render invocation and slide counts;
- estimated rendered pixels;
- the five slowest phases;
- baseline invocation and pixel-budget results.

Do not add a source/candidate compare merely to make Create resemble Translation or Refurbish. During
repair loops, render changed slides only when a separate scoped review is needed; keep one final
full-deck preview as the delivery evidence.

## Failure routing

Follow `requiredReferences[]` from the compact result or full summary. The runner currently requests
the narrative gate for decks with at least six slides. Other preparation-time routes remain explicit:

- invalid DeckKit content or unresolved slots: `references/deckkit-mode.md`;
- unclear express content construction: `references/create-express.md`;
- high-control asset/layout decisions: `references/create-studio.md` and
  `references/design-lock-and-assets.md`;
- specialized charts, tables, formulas, animations, or data binding: load only the matching reference.

Do not retry past a failed gate with stale `candidate.pptx`. Repair the authoritative input, create a
new candidate, and rerun the runner in a new or safely reusable current run directory.

## Delivery boundary

Machine success produces `status=needs-human-review`, not visual completion. Review the contact sheet
and suspicious full-size PNGs, verify narrative and brand quality, and only then report the deck as
visually delivered. Preserve `create-run-summary.json`, the final candidate, patch/sidecars, preview
manifest, contact sheet, and relevant issue-page PNGs as audit evidence.
