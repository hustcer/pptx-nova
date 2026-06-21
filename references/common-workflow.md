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
placeholder files, and output collision checks are consistent:

```bash
node <skill-root>/scripts/pptx-nova-init-run.mjs \
  --slug <slug> \
  --deckkit <id> \
  --output <final.pptx>
```

Keep all temporary files in that run directory, including `outline.json`,
`deck_lock.json`, `assets_manifest.json`, `content.json`, `patch.json`,
intermediate `.pptx`, sidecar files, `vision.json`, `check.json`, previews,
contact sheets, logs, and generated helper scripts.

Do not scatter temporary files beside the source PPTX or final output.

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

For PNG previews and multi-format exports, `xdoc convert -o <dir>` uses `<dir>`
itself as the output root. A trailing separator, `-o <dir>/`, means parent
directory mode and creates `<dir>/<deck>-img/` or `<dir>/<deck>.xdoc/`. Prefer a
current-run root such as `<run-dir>/previews` for visual QA. Before regenerating
previews, make sure the preview root belongs to the current run, then replace it
with `--overwrite` or clear that current-run directory so stale PNG files cannot
be reviewed by mistake.

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
  --require-op set-text \
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

1. Initialize run directory and check output collision rules.
2. Generate `<run-dir>/xdoc-capabilities.json`. Review warnings and task-specific
   undisclosed requirements, but do not turn the snapshot into an allowlist.
3. Gather mode-specific context:
   - Create: `outline.json`, `deck_lock.json`, optional `assets_manifest.json`.
   - Formal create: also apply `narrative-quality.md` and lock `deckProfile`,
     per-slide `claimTitle`, `proofObject`, `rhythm`, `layoutIntent`, and
     `visualDensity`.
   - Edit: `xdoc pptx inspect <input.pptx> --json`.
   - Refurbish: source inspect/extract/contact sheet, `content-audit.json`,
     `reference-map.json`, `fidelity-gate.json`, `layout-final.json`, and the
     `xdoc pptx refurbish-skin` JSON report.
     Prefer `scripts/pptx-nova-refurbish-run.mjs` for the standard route so these
     artifacts, phase failures, previews, and final publication use one run-dir
     contract. Use the lower-level commands directly only for diagnosis or
     selective page repair.
     Use lower-level `chrome-detect`, `chrome-remove`, `remap-theme --scope
text,shapes,tables,charts`, and `chrome-apply` reports only for fallback
     or page-level repair.
   - Data/template: template, data, bindings, and asset paths.
   - If the source outline only gives a slide title or leaves factual content
     blank, record any AI-filled facts, competitors, metrics, or examples in
     `deck_lock.assumptions[]` before writing `content.json`.
   - If the user-provided outline explicitly fixes slide titles or subtitles,
     preserve that wording in display `title` / `subtitle`, mark
     `titleSource: "user"` / `subtitleSource: "user"` in `deck_lock.slides[]`,
     and do not silently rewrite it into a claim title or house style.
   - If a slide contains chart/table proof, record the semantic source and
     validation expectations in `deck_lock.slides[].chart` or `.table`.
4. Produce the smallest durable input:
   - Prefer DeckKit `content.json` for create workflows.
   - Use patch ops only when the DeckKit path cannot express the work.
   - Before writing or rebuilding `content.json` / hand-authored patch ops,
     do a slide-by-slide lock alignment pass: for each slide, compare the
     intended `slideType`, `claimTitle`, `proofObject`, `rhythm`,
     `layoutIntent` / `macroLayout`, and `visualDensity` against the current
     source content. If they disagree, update the durable source (`deck_lock` or
     `content.json`) first; do not let the patch become a hidden second plan.
5. Run design-lock drift check before dry-run when `deck_lock.json` exists:
   ```bash
   node <skill-root>/scripts/pptx-nova-check-lock.mjs \
     --lock deck_lock.json --content content.json --patch patch.json --json
   ```
   Add `--assets assets_manifest.json` when assets exist. For brand-sensitive
   delivery add `--strict-colors --strict-fonts`.
6. Run dry-run before any real write:
   ```bash
   xdoc pptx apply -p patch.json -i input.pptx -o out.pptx --dry-run --json
   ```
   Omit `-i` only for new decks. Use `--explain` when an op schema is unclear.
7. Apply only after dry-run is clean and selectors are correct. Any validation
   that consumes the applied output (`vision-check`, `convert`, `check`,
   replay/audit) must run after the apply command has completed; do not launch
   apply-dependent checks in parallel with the write.
8. Run static geometry validation:
   ```bash
   xdoc pptx vision-check out.pptx --json
   ```
   For create workflows, `summary.bySeverity.high` and
   `summary.bySeverity.medium` must both be 0.
9. Render visual previews when creating or materially changing a deck:
   ```bash
   xdoc convert out.pptx --to png -o <run-dir>/previews --overwrite --contact-sheet
   ```
   Review the contact sheet for cross-slide rhythm, then inspect suspicious
   slides at full size.
   For existing-deck refurbishment, run `xdoc pptx contact-diff` when manual
   side-by-side review is needed; `refurbish-skin` reports the suggested path
   but skips generation by default. A deck that visually still reads like the
   source with only light chrome added is not done.
   For existing-deck refurbishment, the standard runner writes
   `fidelity-gate.json`, `candidate-inspect.json`, and `layout-final.json`
   before preview rendering. If running low-level commands manually, run
   `pptx-nova-fidelity-gate.mjs --mode refurbish` after `vision-diff` and final
   `refurbish-audit`, then run `pptx-nova-layout-snapshot.mjs` on final inspect
   and keep both reports with the run artifacts.
10. For formal create workflows covered by `narrative-quality.md`, write
    `narrative_quality_review.json` after the PNG review. If any score is below
    4, fix the weakest 1-3 slides before delivery unless the user explicitly
    accepts a draft.
11. For external/customer/public delivery, run:

```bash
xdoc check out.pptx --checks fonts,links,compat -o check.json --pretty --overwrite
```

12. Copy or write the validated final deck to the requested final path.
13. Summarize final output path, run directory, `xdoc-capabilities.json`, observed
    xdoc/schema versions, important intermediate files, validation results,
    preview/contact sheet path, discovery/fallback warnings, and remaining risks.

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
check-lock -> dry-run -> vision-check -> PNG/contact-sheet review -> chart/table semantic review when present -> narrative review when required -> optional xdoc check
```

For strict Template Following and Refurbish Existing Deck, insert
`fidelity-gate.json` and `layout-final.json` before PNG/contact-sheet review.
The fidelity gate consolidates template/refurbish machine evidence. The layout
snapshot records final object bbox, text, font, color, placeholder, frame, and
z-order evidence. Neither report decides visual taste, pixel-level layout
quality, or whether a refurbished deck visibly adopted the requested DeckKit.

`vision-check` high/medium issues are blockers for create workflows. Low issues
still deserve judgment, especially small fonts, unexpected subtitle/label wraps,
dense text, and alignment.

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
report as residual context. A pre-existing deck can contain unrelated
`vision-check` high/medium issues; do not let old-slide noise hide regressions
on newly created or edited slides. Save before/after previews when the edit is
visual so the changed slide rhythm can be compared directly.

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

If a capability is absent from `xdoc-capabilities.json`, query the targeted op or
command and try a safe dry-run before calling it unsupported. Preserve the
distinction in logs and summaries: `undisclosed` means the runtime schema did not
advertise it; `unsupported` requires an explicit structured CLI result or a
documented compatibility boundary.
