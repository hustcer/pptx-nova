# Common Workflow

Read this file before any task that writes, modifies, exports, or validates a
PPTX. It contains the shared execution contract; mode-specific files add only
task details.

## Working Directory

Use the user's current directory as the project root for the run.

Create a run directory for every workflow that writes generated artifacts,
including create, edit, export, extraction, preview, and check workflows:

```text
.pptx-nova/<slug>-<YYYYMMDD-HHMMSS>/
```

For DeckKit-first create workflows, prefer the bundled initializer so path names,
template files, and output collision checks are consistent:

```bash
node <skill-root>/scripts/pptx-nova-init-run.mjs \
  --slug <slug> \
  --deckkit <id> \
  --output <final.pptx>
```

The initializer writes `deck_lock.template.json` and `content.template.json`.
Use them as examples, then create or overwrite fresh `deck_lock.json` and
`content.json`; do not append a second JSON object to a template file.
After both files are ready, prefer the generated `commands.json.run` command or
call `pptx-nova-create-run.mjs` directly. It runs validate/build/check-lock,
dry-run, apply, vision-check, preview/contact-sheet, and final publish while
preserving every intermediate artifact.

Keep all temporary files in that run directory, including `outline.json`,
`deck_lock.json`, `session-rules.json`, `session-operation.json`,
`session-rules-resolution.json`, `assets_manifest.json`, `content.json`, `patch.json`,
intermediate `.pptx`, sidecar files, `vision.json`, `check.json`, previews,
contact sheets, logs, and generated helper scripts.

Do not scatter temporary files beside the source PPTX or final output.

## Artifact Retention And Cleanup

Treat each `.pptx-nova/<slug>-<YYYYMMDD-HHMMSS>/` run directory as an audit
record, not a disposable cache. Do not delete the run directory automatically at
the end of a task, and do not clean files before the final summary if that would
hide validation evidence, selector resolution, sidecar replay data, visual
review context, or a failure state.

Keep this minimum evidence set after successful delivery when the files exist:
`xdoc-capabilities.json`, `outline.json`, `deck_lock.json`, `content.json`,
`patch.json`, sidecar files, dry-run/apply/refurbish JSON reports,
`vision.json`, `visual_review.json`, `clean-open.json`, `check.json`,
`semantic-audit.json`, `structure-check.json`, `evidence-summary.json`,
`layout-final.json`, `fidelity-gate.json`, `content-audit-final.json`, `review-policy.json`, `catalog-readiness.json`,
optional `delivery-readiness.json`, the final candidate PPTX,
the contact sheet, and any PNGs needed to explain suspicious or manually
reviewed slides.

After a successful task, optional cleanup may remove only current-run artifacts
that are heavy and reproducible: full per-slide PNG sets once the contact sheet
and reviewed issue pages are kept, duplicate export directories, transient
conversion caches, scratch logs, failed-iteration intermediate PPTX files, and
unreferenced helper scratch files. If the task failed, was interrupted, has
unresolved validation risk, or is likely to continue in a later turn, keep the
full run directory.

Cleanup is scoped to reproducible artifacts from the current run. Never delete
the source PPTX, final output, user-provided assets, reference templates, files
outside the selected run directory, the entire `.pptx-nova` directory, or files
not created by the current `pptx-nova` workflow. Cross-run cleanup requires an
explicit user request; first list the candidate runs, cleanup scope, and
evidence that will be preserved. A safe default is to prune only reproducible
heavy artifacts from successful runs older than 14 days while keeping the
minimum evidence set.

If the user asks for `--cleanup` or "清理中间产物", apply the minimum evidence
policy instead of deleting everything. If the user asks for `--keep-all`, or if
debugging/replay/continued editing is expected, keep every artifact. Record the
cleanup decision in the final summary: full run kept, slimmed to evidence set,
or cleanup skipped, plus the artifact classes removed when slimming happened.
When slimming removes files, write `<run-dir>/cleanup-manifest.json` with the
preserved evidence list and removed artifact classes.

## Output Safety

For create workflows, if the user explicitly names a final `.pptx` output path
and that path already exists before work starts, stop and ask for a new path,
deletion, or rename. Do not dry-run, do not generate an alternate same-name
file, and do not use `--overwrite` on that final path.

For edit workflows, treat the input deck as read-only by default. Inspect,
dry-run, apply to intermediate files, and validate in the run directory first.
Only write to the requested final output after validation. If the user asks for
in-place modification, still validate through a run-dir copy before writing back.

Use `--overwrite` only for files created in the current run directory during the
current iteration.

For PPTX PNG/contact-sheet visual QA, use `xdoc pptx preview` as the canonical
path. Write to a preview directory that does not already exist, or pass
`--overwrite` when the directory is a current-run generated preview root. The
run initializer intentionally does not pre-create `<run-dir>/previews`; this
keeps the first preview command from failing on an empty existing directory
while still making reruns explicit.

Use `xdoc convert --to png` only for non-PPTX or generic conversion fallback.
For multi-format exports, `xdoc convert -o <dir>` uses `<dir>` itself as the
output root. A trailing separator, `-o <dir>/`, means parent directory mode and
creates `<dir>/<deck>-img/` or `<deck>.xdoc/`. Before regenerating any preview
or export output, make sure the output root belongs to the current run, then
replace it with `--overwrite` or clear that current-run directory so stale files
cannot be reviewed by mistake.

For export/check workflows, default output directories should also live under
the run directory unless the user explicitly requested a final output path.
Do not use `--overwrite` on user-owned export paths unless the user asked to
replace them or they are current-run intermediate outputs.

## Runtime Capability Discovery

After creating the run directory, capture one runtime capability index:

```bash
node <skill-root>/scripts/pptx-nova-probe.mjs \
  --output <run-dir>/xdoc-capabilities.json
```

Exception: the standard refurbish runner performs this probe internally. When
using `scripts/pptx-nova-refurbish-run.mjs`, do not pre-initialize a full run
directory. A caller-provided `--run-dir` may be new, empty, or contain only
`xdoc-capabilities.json`; any other existing artifact means that directory is
not a fresh runner target.

The snapshot records the xdoc version, CLI/capability schema versions, top-level
commands, PPTX subcommands, patch/recipe op names, enum registry names,
theme/style ids, and native DeckKit declarations. It intentionally omits full op
schemas; fetch those only when needed with `xdoc schema --op <name> --minimal`.
Consult this snapshot before running `xdoc schema --index`; refresh the index only
when the snapshot is missing, stale, or does not disclose a capability you need.

Treat the snapshot as runtime discovery evidence, not an allowlist. A capability
missing from the schema index is `undisclosed`, not proven `unsupported`. Continue
with targeted command help, dry-run, or a documented fallback unless the current
task explicitly requires a strict gate. Version strings are audit metadata and
must not be used to infer feature support.

For a task-specific check, add repeatable requirements such as:

```bash
node <skill-root>/scripts/pptx-nova-probe.mjs \
  --require-command pptx.apply \
  --require-op set-text-frame \
  --require-theme corporate-blue \
  --json
```

By default undisclosed requirements produce `status: attention` and exit 0 so
new or partially disclosed xdoc features remain explorable. Use `--strict` only
when the caller has already decided that an undisclosed requirement must block
this workflow. Do not assume `xdoc --help --json` is structured JSON; use
`xdoc schema` for machine-readable discovery and plain `--help` only as a
human-readable fallback.

## Shared Pipeline

Use this order unless a mode-specific file explicitly narrows the workflow:

1.  Initialize run directory and check output collision rules.
2.  Generate `<run-dir>/xdoc-capabilities.json`. Review warnings and task-specific
    undisclosed requirements, but do not turn the snapshot into an allowlist.
3.  Gather mode-specific context: - Create: `outline.json`, `deck_lock.json`, optional `assets_manifest.json`. - Formal create: also apply `narrative-quality.md` and lock `deckProfile`,
    per-slide `claimTitle`, `proofObject`, `rhythm`, `layoutIntent`, and
    `visualDensity`. - Edit: `xdoc pptx inspect <input.pptx> --json`, optional
    `select.json`; when current-deck session rules exist, resolve the structured
    `session-operation.json` according to `references/session-rules.md`; then normalize `edit-contract.json` according to
    `references/edit-contract.md` before patch/apply. - Refurbish: source inspect/extract/contact sheet, `content-audit.json`,
    `reference-map.json`, `fidelity-gate.json`, `layout-final.json`, and the
    `xdoc pptx refurbish-skin` JSON report.
    Prefer `scripts/pptx-nova-refurbish-run.mjs` for the standard route so these
    artifacts, phase failures, previews, and final publication use one run-dir
    contract. Use the lower-level commands directly only for diagnosis or
    selective page repair.
    In JSON mode the runner keeps stdout as one final JSON report and streams
    `pptx-nova-progress/v1` JSONL events to stderr. Agents should surface phase,
    compare-part, retry, and heartbeat events instead of polling a silent process.
    The runner always writes `catalog-readiness.json`; a requested live benchmark
    audit is written separately as `delivery-readiness.json`.
    Progress mode defaults to `jsonl` with `--json` and `text` otherwise; callers
    can override it with `--progress jsonl|text|off`. JSONL events use schema
    `pptx-nova-progress/v1` and include `phase-start`, `phase-complete`,
    `compare-part-start`, `compare-part-retry`, `compare-part-complete`, and
    `command-heartbeat`. Keep stdout and stderr separate: parse stdout only after
    process completion, while using stderr events for status updates and stall detection.
    JSON-mode compare failures still return one `pptx-nova-compare-error/v1`
    document on stdout and emit `compare-failed` as JSONL on stderr.
    Use lower-level `chrome-detect`, `chrome-remove`, `remap-theme --scope
text,shapes,tables,charts`, and `chrome-apply` reports only for fallback
    or page-level repair. - Data/template: template, data, bindings, and asset paths. - If the source outline only gives a slide title or leaves factual content
    blank, record any AI-filled facts, competitors, metrics, or examples in
    `deck_lock.assumptions[]` before writing `content.json`. - If the user-provided outline explicitly fixes slide titles or subtitles,
    preserve that wording in display `title` / `subtitle`, mark
    `titleSource: "user"` / `subtitleSource: "user"` in `deck_lock.slides[]`,
    and do not silently rewrite it into a claim title or house style. - If a slide contains chart/table proof, record the semantic source and
    validation expectations in `deck_lock.slides[].chart` or `.table`.
4.  Produce the smallest durable input:
    - Prefer DeckKit `content.json` for create workflows.
    - Use patch ops only when the DeckKit path cannot express the work.
    - Before writing or rebuilding `content.json` / hand-authored patch ops,
      do a slide-by-slide lock alignment pass: for each slide, compare the
      intended `slideType`, `claimTitle`, `proofObject`, `rhythm`,
      `layoutIntent` / `macroLayout`, and `visualDensity` against the current
      source content. If they disagree, update the durable source (`deck_lock` or
      `content.json`) first; do not let the patch become a hidden second plan.
5.  For standard DeckKit create workflows, prefer the bundled runner:
    ```bash
    node <skill-root>/scripts/pptx-nova-create-run.mjs \
      --deckkit <id> \
      --content content.json \
      --lock deck_lock.json \
      --output out.pptx \
      --run-dir <run-dir> \
      --json
    ```
    The runner stores `patch.json`, `quality.json`, `check-lock.json`,
    `dry-run.json`, `apply.json`, `vision.json`, `preview.json`,
    `candidate.pptx`, and the contact sheet in the run directory. It fails
    closed on non-success JSON status or non-zero exit code, only overwrites
    current-run candidate/preview artifacts, and does not overwrite an existing
    final output unless `--overwrite` is explicit.
6.  When manually debugging or running a non-standard route, run design-lock
    drift check before dry-run when `deck_lock.json` exists:
    ```bash
    node <skill-root>/scripts/pptx-nova-check-lock.mjs \
      --lock deck_lock.json --content content.json --patch patch.json --json
    ```
    Add `--assets assets_manifest.json` when assets exist. For brand-sensitive
    delivery add `--strict-colors --strict-fonts`.
7.  Run dry-run before any real write:
    ```bash
    xdoc pptx apply -p patch.json -i input.pptx -o out.pptx --dry-run --json
    ```
    Omit `-i` only for new decks. Use `--explain` when an op schema is unclear.
8.  Apply only after dry-run is clean and selectors are correct. Any validation
    that consumes the applied output (`vision-check`, `convert`, `check`,
    replay/audit) must run after the apply command has completed; do not launch
    apply-dependent checks in parallel with the write.
    Generic existing-deck Edit/Micro Edit workflows must finish the stable
    candidate with one semantic diff and every evidence kind declared in
    `edit-contract.json`, bind the stable candidate and evidence hashes in
    `evidence-manifest.json`, then require
    `pptx-nova-edit-contract-gate.mjs --strict` before publication. Visible
    text edits that preserve target formatting should require `style-diff` plus
    scoped preview and `vision-diff` evidence. Use candidate-only
    `vision-check` as a diagnostic when needed; inherited source issues are not
    edit regressions.
    If `session-rules.json` exists, pass the successful
    `session-rules-resolution.json` to the contract normalizer. The final
    contract gate must report every applicable rule as satisfied before
    publication. After successful publication, advance the rules to the accepted
    candidate revision; never advance them after a failed candidate.
9.  Run static geometry validation:

    ```bash
    xdoc pptx vision-check out.pptx --json > <run-dir>/vision.json
    ```

    For create workflows, `summary.bySeverity.high` and
    `summary.bySeverity.medium` must both be 0.
    For Studio Create, Reference Create, structural Edit, and manual Template
    Following, save a final inspect report after apply and run the bundled
    high-risk evidence finalizer before preview rendering. If the patch contains
    native chart/table data ops, run the lightweight semantic audit first so the
    finalizer can consume semantic-audit.json from the run directory:

        node <skill-root>/scripts/pptx-nova-semantic-audit.mjs \
          --deck-lock deck_lock.json \
          --patch patch.json \
          --final-inspect <run-dir>/final-inspect.json \
          --output <run-dir>/semantic-audit.json \
          --json

    For brand-sensitive or template-derived output, run the lightweight XML
    structure check before the finalizer so it can prove target fonts/colors are
    written into the PPTX and catch empty placeholder residue:

        node <skill-root>/scripts/pptx-nova-structure-check.mjs \
          --pptx out.pptx \
          --deck-lock deck_lock.json \
          --strict-placeholders \
          --output <run-dir>/structure-check.json \
          --json

    ```bash
    xdoc pptx inspect out.pptx --daemon --json > <run-dir>/final-inspect.json
    node <skill-root>/scripts/pptx-nova-finalize-evidence.mjs \
      --mode <studio-create|reference-create|structural-edit|template-following> \
      --run-dir <run-dir> \
      --final-inspect <run-dir>/final-inspect.json \
      --vision <run-dir>/vision.json \
      --json
    ```

    Template Following also passes
    `--fidelity-gate <run-dir>/fidelity-gate.json`. Refurbish runner already creates its
    mode-specific fidelity gate and layout snapshot; a manual refurbish route can
    call the finalizer with `--mode refurbish --fidelity-gate ...` and does not
    need a duplicate `vision.json`. The helper writes `layout-final.json` and
    `evidence-summary.json`. Actionable layout risks remain warnings; inspect
    fields that are merely undisclosed are counted separately and do not make the
    finalizer noisy. The helper does not replace PNG review or expand Micro Edit.

10. For existing-deck edits, template-following, and refurbish tasks, run
    semantic diff once after the candidate is stable and before final delivery:

    ```bash
    xdoc pptx diff --source source.pptx --candidate out.pptx \
      --detail summary --json > <run-dir>/pptx-diff.json
    ```

    This command is useful but comparatively slow. Do not run it after every
    patch attempt; run it at the final candidate stage, or only when debugging a
    suspected unintended change. Use `--detail full` only when summary points to
    a specific slide/object and field-level evidence is needed. Treat only
    `reliable` entries as machine facts. `uncertain` and `unsupported` entries
    require human review or a targeted audit; they are not pass evidence.

11. Render visual previews when creating or materially changing a deck:

    ```bash
    xdoc pptx preview out.pptx \
      --output-dir <run-dir>/previews \
      --contact-sheet <run-dir>/previews/contact-sheet.png \
      --overwrite --json > <run-dir>/preview.json
    ```

    Review the contact sheet for cross-slide rhythm, then inspect suspicious
    slides at full size. Record the review as visual_review.json so the final
    summary can disclose which visual checks were actually performed:

        node <skill-root>/scripts/pptx-nova-visual-review.mjs \
          --run-dir <run-dir> \
          --contact-sheet <run-dir>/previews/contact-sheet.png \
          --previews <run-dir>/previews \
          --slides-reviewed <n> \
          --check titleWrap=pass \
          --check bodyReadability=pass \
          --check alignment=pass \
          --check spacing=pass \
          --check contrast=pass \
          --check chartTableLegibility=pass \
          --check repeatedLayoutRhythm=pass \
          --check placeholderResidue=pass \
          --check footerPageChrome=pass \
          --check assetFit=pass \
          --json

    If any check is warn/fail, record it with --issue and either fix the deck or
    disclose the residual visual risk. The high-risk finalizer automatically
    consumes <run-dir>/visual_review.json when present; rerun it after visual
    review if evidence-summary.json should include this final visual QA result.
    For existing-deck refurbishment, run `xdoc pptx contact-diff` when manual
    side-by-side review is needed; `refurbish-skin` reports the suggested path
    but skips generation by default. Use `--slides` for scoped repair review
    and check `agentGate.passed=true` before relying on the PNG; rerun full-deck
    when final parity matters. A deck that visually still reads like the source
    with only light chrome added is not done.
    For existing-deck refurbishment, the standard runner writes
    `candidate-inspect.json`, `layout-final.json`, then `fidelity-gate.json`,
    the compatible `refurbish-compare.png` or numbered `refurbish-compare-*.png`
    set, `refurbish-compare.json`, and `refurbish-compare-gate.json`
    before returning. If running low-level commands manually, run
    `pptx-nova-layout-snapshot.mjs` on final inspect, then run
    `pptx-nova-fidelity-gate.mjs --mode refurbish` after `vision-diff` and final
    `refurbish-audit` so the final policy receipt can consume the raw layout findings,
    then run `pptx-nova-compare.mjs --kind refurbish --slide-count <count>
--compare-chunk-size 20 --dpi 192 --fallback-dpi 144`. Decks larger than
    20 slides become numbered parts; only an explicit retryable `RenderError`
    may lower the failed part to 144 DPI. Run
    `pptx-nova-compare-gate.mjs --kind refurbish --publish --final-pptx-source
<candidate>`; the gate must be the only final PPTX publisher. Require both
    `status=pass` and `finalBinding.status=bound`, keep the manifest and all
    part reports with the run artifacts, and list every sibling PNG in the
    final response.
    For agent-facing status and final-response facts, read
    `refurbish-run-summary.json.agentSummary` or
    `evidence-summary.json.agentSummary` first; open the underlying gate reports
    only when the short summary points to a warning, failure, or unsupported area.

12. For formal create workflows covered by `narrative-quality.md`, write
    `narrative_quality_review.json` after the PNG review. If any score is below
    4, fix the weakest 1-3 slides before delivery unless the user explicitly
    accepts a draft.
13. When running on macOS with Microsoft PowerPoint for Mac available for a
    deliverable/high-risk PPTX, run the bundled clean-open helper instead of
    hand-writing AppleScript:

```bash
node <skill-root>/scripts/pptx-nova-clean-open.mjs \
  --pptx out.pptx \
  --output <run-dir>/clean-open.json \
  --json
```

    Treat `status: "pass"` as the only passing clean-open evidence. Treat
    `status: "fail"` as a delivery blocker because a Repair dialog, Repair
    button, repair text, or PowerPoint open failure was observed. A plain
    `Cancel` button in a sign-in/update/ordinary dialog is not a repair signal.
    The live helper supports only macOS + PowerPoint for Mac + `osascript` /
    System Events. Windows/Linux, macOS without PowerPoint, missing `osascript`,
    or missing UI scripting authorization return `status: "skipped"` and must
    not block delivery. Disclose that clean-open was not run and list the
    structural replacement checks that were run. `--classify-ui` is only for
    offline saved UI snapshot classification and is platform-independent.

14. For external/customer/public delivery, run:

```bash
xdoc check out.pptx --checks fonts,links,compat -o check.json --pretty --overwrite
```

15. Copy or write the validated final deck to the requested final path.
16. Apply the artifact retention decision. Keep the full run by default; slim
    only reproducible current-run heavy artifacts when the task succeeded and
    no debug/replay continuation is expected, or when the user explicitly asked
    for cleanup. If files are removed, write `cleanup-manifest.json`.
17. If the user requested skill feedback (`need feedback`, `需要反馈`, `给反馈`,
    or equivalent), write the feedback first and run
    `pptx-nova-feedback-gate.mjs --run-dir <run-dir> --require-feedback --strict`
    or the same command with `--prompt-file`. Do not send the final response
    while `feedback-gate.json.status` is `fail`.
18. Summarize final output path, run directory, `xdoc-capabilities.json`, observed
    xdoc/schema versions, important intermediate files, validation results,
    high-risk `evidence-summary.json` / `layout-final.json` when applicable,
    `pptx-diff.json` semantic audit when run, preview/contact sheet path,
    artifact retention/cleanup status,
    discovery/fallback warnings, Feedback Mode artifact path when triggered,
    and remaining risks.

## Source Ingestion (HTML / URL / PDF)

When the user supplies a web URL, an HTML file, or a PDF as content material
(not as a deck/template), normalize it to text with `xdoc` first, then feed the
result into the normal pipeline. This applies to create, reference-create, and
data-driven workflows, and to edit workflows that need to pull in new content.

```bash
# HTML file or URL -> Markdown (omit -o to print to stdout)
xdoc html2md "https://example.com/post" -o <run-dir>/source_brief.md
xdoc html2md page.html -o <run-dir>/source_brief.md
xdoc html2md page.html --html-base-url "https://site.com/guide/"  # resolve relative links
# Equivalent path (a URL auto-detects as html):
xdoc convert "https://example.com/post" --to md -o <run-dir>/source_brief.md

# PDF -> copyable text (omit -o for stdout; --json emits pdf-text/v1)
xdoc pdf extract-text input.pdf -o <run-dir>/source_extract.txt
xdoc pdf extract-text input.pdf --pages 1,3-5 --mode layout
xdoc pdf extract-text input.pdf --engine pdfium --json --pretty
```

`--engine auto` resolves to PDFium in native builds (`pdflite` is not yet
available). `--pages` is 1-based. `--mode layout` keeps the visual reading order;
`natural` is the default reading flow.

Writing with `-o file.md` also emits a `file.manifest.json` sidecar (manifest
mode `auto`) and refuses to overwrite an existing output. Write into the current
run directory so reruns do not collide; add `--overwrite` to replace a current-run
file, or `--manifest false` (or stdout without `-o`) for a single clean file.

Pipeline integration:

- Always write the raw ingested output into the run directory (for example
  `source_brief.md` / `source_extract.txt`); do not scatter it elsewhere.
- Treat the ingested text exactly like a user-provided brief. It does not skip
  any step: still produce `outline.json` and the DeckKit `content.json` (or the
  edit-mode patch), and still run the gates in `## Visual Gates`.

Red lines:

- Fidelity first: use the source text verbatim for facts; do not invent figures,
  quotes, dates, or names that are not in the ingested material.
- Record any AI-filled facts in `deck_lock.assumptions[]` before writing
  `content.json`, same as any other create workflow.
- PDF extraction fidelity varies by source. Scanned pages or broken font
  embedding can drop or reorder characters; review `source_extract.txt` before
  relying on it, and check `summary`/`warnings` when using `--json`.
- `html2md` captures body text and links only. Images, styles, and layout are
  not imported; route any required images through the normal asset flow and
  `assets_manifest.json`.

## Visual Gates

Treat the first rendered deck as a candidate, not as proof that the work is
done. Dry-run catches schema and semantic errors. Its `text-overflow-estimate`
visual risk uses the same static text-fit estimator as `vision-check`, so fix
those medium risks before apply when possible. Dry-run still does not prove
pixel-level visual quality.
Use these gates in order:

```text
check-lock -> dry-run -> vision-check -> high-risk evidence finalizer when required -> one final pptx semantic diff for existing-deck audits when useful -> PNG/contact-sheet review -> chart/table semantic review when present -> narrative review when required -> optional xdoc check
```

For Studio Create, Reference Create, structural Edit, strict Template Following,
and Refurbish Existing Deck, keep `layout-final.json` before PNG/contact-sheet
review. The bundled finalizer makes this default for manual high-risk routes and
writes `evidence-summary.json`; Template Following and Refurbish additionally
reuse their existing `fidelity-gate.json`. The layout snapshot records final
object bbox, text, font, color, placeholder, frame, and z-order evidence. These
reports do not decide visual taste, pixel-level layout quality, or whether a
refurbished deck visibly adopted the requested DeckKit. Micro Edit stays on its
separate lightweight path.

`vision-check` high/medium issues are blockers for create workflows. Low issues
still deserve judgment, especially small fonts, unexpected subtitle/label wraps,
dense text, and alignment.

PowerPoint display-effect screenshots and comparisons:

- When a visual gate must reflect PowerPoint's display/export result, render
  with `pptx-snapshot.nu --method pdf-render` first:
  `nu tools/pptx-snapshot.nu deck.pptx --slides N-M --out <run-dir>/powerpoint/slide-%d.png --method pdf-render --json`.
- Treat phrases such as "PowerPoint 截图", "PowerPoint 显示效果", "PowerPoint
  preview", and "PowerPoint 对比" as this non-interactive PowerPoint render
  verification path, not as a request for window capture.
- Use `--method window` only after `pdf-render` fails. Preserve the failed
  `pdf-render` JSON/stderr in the run directory, record the fallback reason in
  `visual_review.json` or the final summary, and scope window capture to the
  minimum suspect slides.

PNG/contact-sheet review remains required for pixel-level concerns:

- title wraps colliding with decorative rules, logo areas, headers, or page
  chrome
- display titles/subtitles that become long sentences, end with periods, or pull
  attention away from the proof object
- characters overlapping or line wrapping into the next line
- text clipped by a shape or table cell
- source citations, footers, page numbers, and legends colliding with content
  above
- weak contrast on dark/light backgrounds
- decorative elements covering content
- cards, columns, icons, numbered circles, and comparison blocks with uneven
  alignment or inconsistent gaps
- disconnected arrows or wrong center alignment
- SmartArt/diagram groups that are visually too high, too low, or poorly
  balanced inside the content area even when no object overflows
- leftover placeholder text, empty picture frames, old dates, old footers, or
  invisible-but-editable structural placeholders in template-derived decks
- broken page number rhythm
- formal deck issues such as topic-only titles, weak proof objects, repeated
  card-grid rhythms, or decorative containers that do not encode meaning
- chart/table pages whose data dimensions are technically valid but misleading:
  missing categories, unlabeled series, inconsistent units, truncated legend,
  data labels colliding with bars/points, or table columns squeezed below
  readable width

When review finds an issue, fix the smallest durable source of truth:

- DeckKit create: edit `content.json` first; adjust the DeckKit only when the
  slot contract or reusable component is the real limitation.
- Patch-based create/edit: change `patch.json`; do not manually repair the
  generated output PPTX and leave the patch stale.
- Template edits: edit, fill, or delete the original object. Do not use opaque
  overlays or screenshots to hide bad state.

After each fix, rerun only the necessary downstream gates, but always rerender
the affected slide PNG before delivery. A text shortening fix can move line
breaks, a bbox fix can expose alignment drift, and a selector fix can change a
different object than intended.

For edit/append workflows, review changed slides first, then use the full-deck
report as residual context. A pre-existing deck can contain unrelated issues;
use `vision-diff` to block new/worsened high or medium regressions without
mistaking inherited noise for edit failure. Save before/after previews when the
edit is visual so the changed slide rhythm can be compared directly.

Use the same scope for both machine and PNG gates:

```bash
xdoc pptx vision-diff --source input.pptx --candidate out.pptx --slides 25-38 --json > <run-dir>/vision-diff.json
xdoc pptx preview out.pptx --slides 25-38 \
  --output-dir <run-dir>/previews \
  --contact-sheet <run-dir>/previews/contact-sheet.png \
  --overwrite --json > <run-dir>/preview.json
node <skill-root>/scripts/pptx-nova-finalize-evidence.mjs \
  --mode structural-edit \
  --run-dir <run-dir> \
  --final-inspect <run-dir>/final-inspect.json \
  --vision <run-dir>/vision.json \
  --changed-slides 25-38 \
  --json
```

In scoped runs, top-level `summary/issues` follow the selected changed pages.
`scopedSummary/scopedIssues` remain as compatibility aliases, while
`deckSummary/deckIssues` retain full-deck evidence and `deckResidualRisk`
discloses inherited problems outside the scope.

## Formula And Asset Handling

If the prompt/source contains LaTeX, equations, dense math symbols, screenshots,
logos, or third-party images, record the policy in `deck_lock.json` and use
`assets_manifest.json`. For formula-heavy work read `formulas.md`; for image and
asset slots read `visual-qa-and-asset-slots.md`.

## Daemon

For multi-step inspect/apply loops, pass `--daemon` to `xdoc pptx inspect` and
`xdoc pptx apply`. v10 auto-spawns the daemon on first use. Read
`daemon-sessions.md` only when tuning daemon behavior or debugging daemon errors.

## Error Handling

If dry-run returns ambiguous selectors, enum fixes, or field suggestions, prefer
`suggestion.autoRetry: true` fixes and rerun dry-run. For unclear failures read
`troubleshooting.md`. Do not silently ignore failed dry-run, failed apply, failed
vision-check, or preview conversion failures.

Some xdoc commands may still write a structured JSON report when the process
exit code is non-zero. Treat this as an inconsistency to investigate, not as a
success shortcut: inspect stderr, parse the JSON `status`, verify the expected
output file or report exists, and record the mismatch in the run artifacts. If
the JSON says `status: "success"`, stderr is empty, and the expected output is
present, it is acceptable to continue after an independent verification step
such as inspect, semantic audit, or PNG/PowerPoint preview. If the JSON status
is missing, non-success, or the output is absent, stop and fix the command.

When chaining xdoc commands in one shell block, do not rely on the shell block's
final exit code as proof that every earlier command succeeded. Either run with
`set -e` / equivalent, or read each generated JSON report immediately and fail
closed on `status in ["error", "fail", "failed", "blocked"]`. A failed
current-run `apply.json` can leave an older `candidate.pptx` in place; running
`vision-check` or `preview` afterward only proves the stale candidate, not the
current patch.

If a capability is absent from `xdoc-capabilities.json`, query the targeted op or
command and try a safe dry-run before calling it unsupported. Preserve the
distinction in logs and summaries: `undisclosed` means the runtime schema did not
advertise it; `unsupported` requires an explicit structured CLI result or a
documented compatibility boundary.
