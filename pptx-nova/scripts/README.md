# pptx-nova Scripts

Bundled scripts in this directory are part of the published `pptx-nova` skill.
They must not depend on repository-root `tools/`, `Justfile`, or files outside
the skill directory.

Use these entry points from skill workflows:

- `pptx-nova-deckkit-select.mjs` - select an eligible DeckKit from the bundled catalog.
- `pptx-nova-deckkit-readiness.mjs` - audit catalog and visual benchmark readiness.
  It uses persisted catalog benchmark evidence by default; pass `--out <dir>`
  for a live benchmark check or `--benchmark-mode required-live` for strict
  promotion gates after a benchmark run.
- `pptx-nova-deckkit-benchmark.mjs` - run bundled visual benchmark cases.
- `pptx-nova-deckkit-catalog-update.mjs` - update bundled DeckKit quality metadata.
- `pptx-nova-create-run.mjs` - execute the standard DeckKit-first create
  pipeline from existing `content.json` and `deck_lock.json`. It runs
  validate-content, build, check-lock, dry-run, apply, vision-check, and
  PNG/contact-sheet preview, preserves every artifact in the run directory, then
  atomically publishes the final output after machine gates pass. A successful
  run reports `needs-human-review`; read `create-run-summary.json.agentSummary`
  for the stable agent-facing gate and artifact summary.
- `pptx-nova-deckkit-refurbish-profile-fill.mjs` - generate missing
  `refurbishProfile` catalog entries for delivery DeckKits. It uses
  DeckKit-specific palette/font overrides where available, preserves true native
  skinning declarations, defaults to dry-run, and supports `--check` for CI.
- `pptx-nova-icons.mjs` - query and generate the bundled Tabler icon pack.
- `pptx-nova-check-lock.mjs` - validate `deck_lock.json`, `assets_manifest.json`,
  DeckKit content, and patch output before xdoc dry-run.
- `pptx-nova-session-rules.mjs` - normalize explicit current-deck rules against
  the current PPTX revision, or advance a verified rule artifact after an
  accepted candidate. The default artifact name is `session-rules.json`.
- `pptx-nova-session-rules-resolve.mjs` - resolve active rules against a
  structured operation plan and emit the deterministic Edit Contract overlay,
  conflicts, and stable `agentGate.nextAction`.
- `pptx-nova-edit-contract.mjs` - normalize an agent-authored existing-deck edit
  contract and bind it to the current source PPTX SHA-256 before patch/apply;
  optionally merge and hash-bind a passed session-rules resolution.
- `pptx-nova-edit-evidence-manifest.mjs` - bind the stable candidate SHA-256 to
  the exact post-apply evidence hashes before the final contract gate.
- `pptx-nova-edit-contract-gate.mjs` - verify source freshness, dry-run target
  coverage, reliable semantic-diff locality, optional text style fidelity, and
  scoped preview/vision-diff/structure evidence before an Edit or Micro Edit is
  published. When session rules apply, it also verifies produced-object identity
  and font/fill postconditions directly from candidate PPTX bytes. Read its
  stable `agentGate.nextAction` for repair routing.
- `pptx-nova-refurbish-plan.mjs` - build the preflight route for existing-deck
  refurbishment: readiness exception, native skinning support, fallback strategy,
  duplicate chrome policy, and required gates.
- `pptx-nova-refurbish-run.mjs` - execute the audited existing-deck refurbishment
  pipeline in a new run directory. It selects the native or fallback route, saves
  every JSON report, writes `pptx-diff.json` as the default final semantic diff,
  fails closed on machine gates, renders PNG/contact-sheet evidence, and
  publishes the final output atomically. A successful run still
  reports `needs-human-review`; it never claims the visual review is complete.
  Read `refurbish-run-summary.json.agentSummary` for the stable agent-facing
  status, gate counts, and artifact pointers.
- `pptx-nova-refurbish-fallback-patch.mjs` - generate generic inspect-driven
  fallback artifacts (`patch.json`, `deck_lock.json`, baseline
  `content-audit.json`, and `reference-map.json`) for DeckKits without native
  skinning. It should use `refurbishProfile.fallback` when present, otherwise
  derive palette/fonts from `visualGrammar`, and consume `chrome-detect.json`
  for existing chrome restyling; do not hardcode a single DeckKit id.
- `pptx-nova-refurbish-audit.mjs` - legacy supplemental Refurbish Existing Deck audit:
  use native `xdoc pptx refurbish-audit` as the default content-preservation gate;
  keep this script only for checks not yet native, especially OOXML visible text
  leaks and forbidden shape-name regex scans.
- `pptx-nova-template-gate.mjs` - validate strict template-following artifacts:
  frame-map coverage, empty placeholders, overlay-like additions, and identity
  asset provenance.
- `pptx-nova-finalize-evidence.mjs` - finalize existing high-risk routes from
  final inspect plus their existing vision/fidelity reports. It writes
  `layout-final.json` and `evidence-summary.json`; it intentionally excludes
  Micro Edit and does not replace mode-specific gates or PNG review. Read
  `evidence-summary.json.agentSummary` for the stable agent-facing summary.
- `pptx-nova-feedback-gate.mjs` - final-response guard for Feedback Mode. It
  detects feedback trigger phrases from the original prompt or accepts
  `--require-feedback`, checks that `<run-dir>/skill-feedback.md` exists and is
  not a TODO template, and writes `feedback-gate.json`. Use `--strict` before
  the final response when the task requested skill feedback.
- `pptx-nova-i18n-residual-gate.mjs` - target-language-independent translation
  leakage gate. It compares the mandatory source scan, candidate scan, and
  translation records by stable unit id plus original text/hash, so valid
  French or other Latin-script target text does not become a false English
  blocker. Native candidate language-classification blockers remain in the
  report as diagnostic evidence.
- `pptx-nova-compare.mjs` - write a high-DPI full-deck before/after compare
  PNG for workflows such as translation and refurbish by delegating to
  `xdoc pptx contact-diff --dpi`. Use `--kind translation` or
  `--kind refurbish` to get the expected artifact names.
- `pptx-nova-compare-gate.mjs` - delivery guard for compare artifacts. It
  validates run-directory `<kind>-compare.png` / `.json`, rejects scoped
  comparison reports for final delivery, and with `--publish` copies the PNG
  next to the final PPTX as
  `<output-stem>-<kind>-compare-<MMDDhhmmss>.png` before writing
  `<kind>-compare-gate.json`.
- pptx-nova-semantic-audit.mjs - lightweight chart/table semantic audit for
  data-driven, Studio, structural edit, template-following, and refurbish runs
  that contain native chart/table ops. It validates data shape, source/claim
  disclosure, and final native chart/table object presence without attempting a
  full OOXML equivalence audit.
- pptx-nova-visual-review.mjs - structured PNG/contact-sheet review helper. It
  records required visual QA checks into visual_review.json, validates that
  visual evidence and reviewed slide counts are present, and leaves actual
  visual judgment to the human or agent reviewer.
- pptx-nova-clean-open.mjs - macOS-only live PowerPoint clean-open smoke gate
  for deliverable PPTX files. It stages the candidate inside PowerPoint's
  sandbox tmp directory, opens that staged copy, checks System Events UI state
  for Repair dialogs, distinguishes plain Cancel buttons from repair prompts,
  and writes clean-open.json. Windows/Linux, macOS without PowerPoint, or
  missing UI scripting return `skipped` and do not block delivery.
- pptx-nova-structure-check.mjs - lightweight PPTX OOXML structure check. It
  scans XML inside the PPTX for expected font declarations, expected sRGB/theme
  colors, and empty/default-text placeholder residue, then writes
  structure-check.json for the final evidence summary.

Repository-root `tools/` contains maintainer gates for this public repository,
including `tools/pptx-nova-smoke-test.mjs` and
`tools/pptx-nova-audit-public.mjs`. Published skill users should call runtime
scripts from this directory.
