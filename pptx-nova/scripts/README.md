# pptx-nova Scripts

Bundled scripts in this directory are part of the published `pptx-nova` skill.
They must not depend on repository-root `tools/`, `Justfile`, or files outside
the skill directory.

Use these entry points from skill workflows:

- `pptx-nova-probe.mjs` - capture a compact runtime capability snapshot,
  including capability truth, schema-slicing support, patch operations, bundled
  resources, compact compatibility indexes, and the exact published daemon/
  stdio JSON-RPC/MCP Agent transport contracts. Complete contracts are retained
  at `capabilities.agentTransports.daemon.contract`,
  `capabilities.agentTransports.jsonRpc.contract`, and
  `capabilities.agentTransports.mcp.contract`. Use repeatable `--require-*`
  flags for task-specific attention or strict gates instead of inferring
  features from version strings or command presence.
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
  PNG/contact-sheet preview through the shared runner runtime, preserves every
  artifact in the run directory, then atomically publishes the final output
  after machine gates pass. Dry-run/apply require explicit zero semantic issues;
  vision requires a consistent, passing full-package semantic summary. `--json`
  emits a compact Agent result with
  performance evidence; use `--json-full` or the persisted
  `create-run-summary.json` only for full diagnostics.
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
  published. Structural copy workflows may supply native `pptx-copy-from/v2`
  evidence; the gate requires a read-only `ready` preflight whose target/donor
  whole-file SHA-256 values still match the current files, validates normalized
  package fingerprints, then validates donor/target slide
  identities, part/dependency mappings, and aggregate changed parts without
  requiring or fabricating patch `opResults`. Native copy evidence also requires
  a manifest-bound passing copy-size gate. When session rules apply, it verifies produced-object
  identity and font/fill postconditions directly from candidate PPTX bytes.
  Read its stable `agentGate.nextAction` for repair routing.
- `pptx-nova-copy-size-gate.mjs` - inspect donor and target slide dimensions,
  verify the current `pptx-copy-from/v2` whole-file SHA-256 bindings separately
  from its normalized OPC package fingerprints, and fail closed before apply
  when the dimensions differ. Current policy is identical-size-only until xdoc
  exposes an explicit copy/import size strategy; the script never asks a
  renderer to hide the mismatch.
- `pptx-nova-refurbish-plan.mjs` - build the preflight route for existing-deck
  refurbishment: readiness exception, native skinning support, fallback strategy,
  duplicate chrome policy, and required gates.
- `pptx-nova-refurbish-run.mjs` - execute the audited existing-deck refurbishment
  pipeline in a new run directory. It selects the native or fallback route, saves
  every JSON report, writes `pptx-diff.json` as the default final semantic diff,
  generates source/candidate layout snapshots, one shared
  `review-policy-evaluation.json`, and a non-governing `finding-analysis.json`
  shadow report before fidelity,
  fails closed on machine gates, renders PNG/contact-sheet evidence, and
  publishes the final output atomically. A successful run still
  reports `needs-human-review`; it never claims the visual review is complete.
  Read compact stdout first, then `refurbish-run-summary.json.agentSummary` only when deeper phase
  evidence is needed.
- `pptx-nova-finding-analysis.mjs` - replay source/candidate layout, semantic diff,
  optional operation evidence, and a complete review evaluation through the draft
  Finding Analysis contract. Standalone replay is always `advisory-replay`; only
  the refurbish runner emits `runner-observed` shadow evidence. Full analysis is
  written to disk while stdout stays compact.
- `pptx-nova-translation-prepare.mjs` - scan and classify translation units,
  bind an optional external prompt and project glossary, create the compact
  translation memory plus protected-token constraints, and resume a bound review
  partition without rescanning. Constraint violations stop before `i18n-plan`.
- `pptx-nova-translation-run.mjs` - finalize an already stable translated candidate. It snapshots
  source/candidate/translation contracts, runs style, target-consistency, vision, preview, semantic,
  full-deck comparison, and publication-binding gates, and can materialize `contact-diff` aliases
  from the same compare evidence without another render. `--json` emits a compact Agent result;
  `--json-full` or `translation-run-summary.json` provides complete diagnostics. Machine success
  remains `needs-human-review`.
- `pptx-nova-review-policy.mjs` - shared pure policy evaluator for hash-bound
  reviewed findings. It never deletes detector output: exact source SHA-256,
  slide part, shape id, placeholder type/idx, and expected state are required
  before an actionable finding can be reclassified as `reviewed`. Stale,
  duplicate, ambiguous, and unused rules fail closed. Fidelity and strict
  template gates use this same module instead of local boolean allowlists.
- `lib/layout-snapshot.mjs` - pure layout detector shared by the layout CLI and
  refurbish source/candidate adapters. `lib/finding-analysis.mjs` is the pure FA
  decision seam; neither module reads files, launches commands, or renders.
- `lib/chart-semantics.mjs` - shared classic Chart/ChartEx semantic normalizer
  used by lock checking and semantic audit. It resolves `data` versus `dataEx`,
  slide-level semantic sources, and kind-specific dimensions from one contract
  instead of duplicating divergent validation logic.
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
  the final candidate/inspect plus their existing vision/fidelity reports. It
  detects ChartEx package parts and conditionally consumes a candidate-bound
  `pptx-nova-powerpoint-snapshot.nu --method pdf-render` report. When the optional
  macOS + PowerPoint + Nushell + `mutool` route is available,
  missing/stale/incomplete ChartEx evidence blocks; otherwise the baseline
  continues with an explicit unverified warning. It writes
  `layout-final.json` and `evidence-summary.json`; it intentionally excludes
  Micro Edit and does not replace mode-specific gates or PNG review. New-deck
  modes fail on missing/failed semantic vision evidence; existing-deck modes
  disclose full-package semantic residuals without incorrectly scoping them to changed
  slides. Read
  `evidence-summary.json.agentSummary` for the stable agent-facing summary.
  It refuses to replace `layout-final.json` or `evidence-summary.json` unless
  `--overwrite` is passed for the current run.
- `pptx-nova-feedback-gate.mjs` - final-response guard for Feedback Mode. It
  detects feedback trigger phrases from the original prompt or accepts
  `--require-feedback`, checks that `<run-dir>/skill-feedback.md` exists and is
  not a TODO template, and writes `feedback-gate.json`. For `create`,
  `refurbish`, and `translation`, pass `--workflow`; the gate also validates the
  workflow's exact seven-row 0-10 process scorecard, fixed weights, evaluations,
  and weighted overall score. Use `--strict` before the final response when the
  task requested skill feedback, then print the validated scorecard in the
  terminal response.
- `pptx-nova-i18n-classify-chart-units.mjs` - convert xdoc's structurally
  inventoried but language-uncertain chart review units into explicit
  translate/preserve decisions. It binds decisions to the source scan and unit
  hashes and fails closed unless every review-only chart unit is classified.
- `pptx-nova-i18n-classify-review-units.mjs` - preferred classifier for all
  language-uncertain `visibleBody`, `visibleTextAttr`, and `chartVisibleCache`
  review units. It binds decisions to the source scan and unit hashes and fails
  closed before `i18n-plan` unless every such review unit is classified.
- `pptx-nova-multi-column-review-scaffold.mjs` - generate the structured manual
  review record from the final candidate, final `vision-diff`, and final xdoc
  preview manifest. It resolves each zero-based vision slide to the one-based
  preview page, verifies actual PNG hashes and dimensions against the manifest,
  and leaves only reviewer, decision, checks, and note for manual completion.
- `pptx-nova-multi-column-review-gate.mjs` - bind final translation candidate,
  final vision-diff, exact multi-column slide/shape findings, and full-size PNG
  human-review evidence. It can close only
  `multi-column-text-layout-review`; all other new or worsened high/medium
  vision findings remain fail-closed blockers.
- `pptx-nova-compare.mjs` - write a high-DPI full-deck before/after compare by
  delegating atomic parts to `xdoc pptx contact-diff`. With `--slide-count`,
  decks over the default 20-slide chunk size produce numbered PNGs and a
  `pptx-nova-compare-manifest/v1`; a retryable 192 DPI `render_error` retries
  only that part once at 144 DPI.
- `pptx-nova-compare-gate.mjs` - delivery guard for compare artifacts. It
  validates either the compatible single PNG or every multipart path, hash,
  report, attempt history, and exact slide coverage. It also requires the
  xdoc-reported candidate identity, staged final PPTX, and published final PPTX
  to share one SHA-256. With `--publish`, it stages the complete delivery
  bundle, publishes compare siblings first and the final PPTX last, verifies
  every destination, and writes `<kind>-compare-gate.json` only after
  `finalBinding.status=bound`.
- `pptx-nova-semantic-audit.mjs` - lightweight chart/table semantic audit for
  data-driven, Studio, structural edit, template-following, and refurbish runs
  that contain native chart/table ops. Through the shared chart normalizer it
  validates classic `data`, ChartEx `dataEx`, source/claim disclosure, and final
  native chart/table object presence without attempting a full OOXML
  equivalence audit. Existing reports require an explicit current-run
  `--overwrite`.
- pptx-nova-visual-review.mjs - structured PNG/contact-sheet review helper. It
  records required visual QA checks into visual_review.json, validates that
  visual evidence and reviewed slide counts are present, and leaves actual
  visual judgment to the human or agent reviewer.
- pptx-nova-clean-open.mjs - macOS-only live PowerPoint clean-open smoke gate;
  launches through macOS document routing and waits eight seconds by default
  so delayed chart/ChartEx Repair prompts are observable
  for deliverable PPTX files. It stages the candidate inside PowerPoint's
  sandbox tmp directory, opens that staged copy, checks System Events UI state
  for Repair dialogs, distinguishes plain Cancel buttons from repair prompts,
  and writes clean-open.json. Windows/Linux, macOS without PowerPoint, or
  missing UI scripting return `skipped` and do not block delivery.
- `pptx-nova-morph-playback.nu` - optional macOS-only PowerPoint-native Morph semantic
  playback probe. It verifies the recognized by-object/by-word/by-char entry
  effect, exact adjacent slide navigation, animation-enabled slide show, and
  required expected duration plus optional resave evidence. It does not capture
  interpolation frames and therefore does not establish visual rendering parity.
- pptx-nova-structure-check.mjs - lightweight PPTX OOXML structure check. It
  scans XML inside the PPTX for expected font declarations, expected sRGB/theme
  colors, and empty/default-text placeholder residue, then writes
  structure-check.json for the final evidence summary. Existing reports require
  an explicit current-run `--overwrite`.
- `pptx-nova-powerpoint-snapshot.nu` - optional macOS-only evidence helper that stages the exact candidate in
  PowerPoint's sandbox, render requested slides through PowerPoint PDF export,
  and emit candidate/hash/image-bound `pptx-snapshot/v1` evidence. `window`
  mode additionally fails closed unless the foreground process, presentation,
  slide, canvas, and screenshot scale remain stable before and after capture.
  It requires Nushell and, for the preferred `pdf-render` route, `mutool`; when
  unavailable, the baseline Node/xdoc workflow continues with explicit
  unverified evidence and must not claim PowerPoint-native verification.

Repository-root `tools/` contains maintainer gates for this public repository,
including `tools/pptx-nova-smoke-test.mjs` and
`tools/pptx-nova-audit-public.mjs`. Published skill users should call runtime
scripts from this directory.
