# Export And Check

Read this file when the user only wants conversion, extraction, preview, or
validation of an existing deck. Do not load create/edit mode details unless the
user also asks to change the PPTX.

Read `common-workflow.md` before this file. Export/check tasks still write
artifacts, so use a run directory by default and follow its `--overwrite` safety
rules.

## Semantic PPTX Diff

When the user only asks to compare two decks or audit before/after changes, use
the read-only semantic diff path:

```bash
xdoc pptx diff --source before.pptx --candidate after.pptx \
  --detail summary --json > <run-dir>/pptx-diff.json
```

The default `summary` detail is the normal Agent path. It reports
`pptx-diff/v1`, `agentGate`, `summary`, `changeRollup`, and per-slide rollups.
Only use `--detail full` when summary identifies a suspicious slide/object and
field-level evidence is needed. The command can take around 10 seconds, so do
not use it as a tight retry loop.

Use only `reliable` entries as machine-checkable facts. Treat `uncertain` and
`unsupported` as review signals. The report's `visualEvidence` block identifies
the canonical handoff; semantic diff and PNG preview remain advisory and never
authorize delivery.

## Unified Visual Evidence (Canonical Agent Gate)

`xdoc pptx visual-audit` is the only xdoc report whose `decision` is consumed
as the final Agent visual action. Run it once after the candidate is stable;
`preview`, `diff`, `vision-diff`, and `contact-diff` remain specialized
observation/review reports. The canonical transaction packages:

- final PDF text-frame fit and rendered page-bound findings;
- the actual selected-slide typeface/style resolution, attributed back to the
  PPTX objects that requested it;
- normalized same-renderer pixel changes between a reference and candidate,
  with changed regions mapped to every overlapping object candidate;
- one atomically published, hash-bound manifest with the exact PDF and PNG
  artifacts used by those checks.

Routine visual review still uses `preview`, and existing-deck diagnosis still
uses `vision-diff` or `contact-diff`; those reports explain the result but do
not create a second delivery verdict. `visual-audit` performs the governing
render transaction, does not create a contact sheet, and v1 implements neither
OCR overflow nor an independent PowerPoint/Office renderer.

Confirm the current runtime disclosed the command:

```bash
node <skill-root>/scripts/pptx-nova-probe.mjs \
  --require-command pptx.visual-audit --strict --json
```

For candidate-only final-render/font diagnosis:

```bash
xdoc pptx visual-audit \
  --candidate deck.pptx \
  --output-dir <run-dir>/visual-evidence \
  --json > <run-dir>/visual-audit.json
```

For a stable before/after same-renderer comparison, use the same 1-based scope
as the edit review:

```bash
xdoc pptx visual-audit \
  --reference before.pptx \
  --candidate after.pptx \
  --slides 2,5-7 \
  --output-dir <run-dir>/visual-evidence \
  --json > <run-dir>/visual-audit.json
```

The command atomically publishes `<run-dir>/visual-evidence/manifest.json` and
its referenced PDF/PNG files. An existing output directory requires
`--overwrite`; use it only for this current-run generated evidence directory.
The stdout JSON is the same canonical manifest and should remain outside the
output directory so shell redirection does not fail before xdoc creates it.

Interpret the result in this order:

1. A process exit code of `0` means only that the evidence transaction
   completed. First require `schemaVersion="pptx-visual-evidence/v1"` and
   `status="success"`, then read `decision.action`.
2. `stop` means a required check found a hard content problem. Inspect which
   subject owns the finding before calling it a regression: both reference and
   candidate receive static-layout, final-layout, raster, and font checks.
3. `require-human-confirmation` means review the referenced PNGs and findings;
   candidate-only runs reach this action even when all required candidate
   checks pass because regression equivalence is unavailable.
4. `proceed` proves only unchanged normalized pixels plus passing required v1
   checks under the same xdoc renderer. It does not prove PowerPoint parity or
   visual intent.

Consume the persisted manifest fail-closed:

```bash
node <skill-root>/scripts/pptx-nova-visual-evidence-gate.mjs \
  --manifest <run-dir>/visual-evidence/manifest.json \
  --output <run-dir>/visual-evidence-gate.json \
  --json
```

Only exit status `0` and `deliveryAuthorized=true` authorize an automated
delivery. Exit `4` is a content blocker. Exit `5` requires actual human
confirmation; an Agent must not reinterpret it as success. Invalid or
internally inconsistent manifests exit `3`.

`ocr-overflow=skipped` and `independent-reference=skipped` are expected v1
limitations, not passing evidence. Keep manual PNG/contact-sheet review and
PowerPoint snapshot/clean-open evidence when those policies apply. Never replace
a specialized semantic, Edit Contract, Translation, Refurbish, or Office gate
with this manifest.

## PPTX PNG Preview

For PPTX visual review, use `xdoc pptx preview` as the default PNG/contact-sheet
path:

```bash
xdoc pptx preview deck.pptx \
  --output-dir <run-dir>/previews \
  --contact-sheet --contact-output <run-dir>/previews/contact-sheet.png \
  --overwrite --json > <run-dir>/preview.json

xdoc pptx preview deck.pptx --slides 25-38 \
  --output-dir <run-dir>/previews \
  --contact-sheet --contact-output <run-dir>/previews/contact-sheet.png \
  --overwrite --json > <run-dir>/preview.json

xdoc pptx preview deck.pptx --layout 1 \
  --output-dir <run-dir>/layout-preview \
  --overwrite --json > <run-dir>/layout-preview.json
```

`--layout N` is a 1-based registered-layout preview and is mutually exclusive
with `--slides`. xdoc builds a one-slide candidate from that layout and its
master/theme inheritance chain, persists
`layout-preview-N-candidate.pptx` inside the requested output directory, and
does not mutate the input deck. Require `previewTarget.kind: "layout"`, the
requested `layoutIndex`, `candidatePersisted: true`, a readable
`candidate.status: "ok"`, and `inputMutated: false` before treating the PNG as
layout-level evidence. The manifest's `visualEvidence.command` must reference
that persisted candidate, never an already-deleted temporary path.

The stdout manifest is `pptx-preview/v1`. It is observation-only and carries a
`visualEvidence` handoff to the canonical decision. Its status fields are
two-level by design, and the two levels use different enums on purpose:

- Top-level `status` is the **command result**: `success` | `error`.
- Each `pages[].file.status` and `contactSheet.status` is a **per-artifact file
  check** (PNG written and readable): `ok` | `error`.

The top-level `status` does **not** aggregate file-level failures, so
`status=="success"` alone does not prove every page rendered. A correct
readiness gate must assert both levels:

```bash
jq -e '.status=="success"
  and (.pages | length > 0)
  and all(.pages[]; .file.status == "ok")' <run-dir>/preview.json
```

Do not gate on `pages[].status`; the per-page status lives at
`pages[].file.status`. Field semantics are authoritative from the
`pptx-preview/v1` schema — inspect it with `xdoc pptx schema` (the
`previewReportSchema` entry) rather than assuming a single shared enum.

After the gate passes, PNG filenames preserve original slide numbers, so
`slide-025.png` still refers to slide 25 even when the contact sheet only
contains a scoped range.

Read the contact sheet first to detect cross-slide issues such as rhythm, page
number jumps, inconsistent dark/light pages, and obvious layout problems. Then
inspect full-size PNGs for suspicious slides.

Use `xdoc convert --to png` only for non-PPTX or generic conversion fallback,
or when debugging the lower-level convert pipeline.

## Conversion

Use `xdoc convert` for PDF/Markdown/JSON/text exports and non-PPTX or fallback
PNG conversion:

```bash
xdoc convert deck.pptx --to pdf -o <run-dir>/out/
xdoc convert deck.pptx --to md -o <run-dir>/out/
xdoc convert deck.pptx --to json -o <run-dir>/out/
xdoc convert deck.pptx --to text -o <run-dir>/out/
xdoc convert deck.pptx --to png -o <run-dir>/previews --overwrite --contact-sheet # fallback/debug only
```

The command shape is `xdoc convert <pptx> --to <format>`, not
`xdoc <pptx> -t png`.

Do not add `--json` to top-level `xdoc convert` unless the current
`xdoc convert --help` explicitly discloses it. The structured JSON result for
PPTX visual review comes from `xdoc pptx preview --json`; generic convert may
write a manifest/report file depending on the selected output options, but it
is not the default Agent path for a machine-readable PNG preview manifest.

For PNG and multi-format outputs, path shape matters:

- `-o <run-dir>/previews` means `<run-dir>/previews` is the output root. It
  contains `slide-001.png`, `manifest.json`, and `contact-sheet.png`.
- `-o <run-dir>/previews/` means parent-directory mode. It creates
  `<run-dir>/previews/<deck>-img/` for PNG or `<deck>.xdoc/` for multi-format
  output.

Use `--overwrite` only when replacing outputs that belong to this conversion
run, usually under `<run-dir>`. If the user explicitly requests a final export
path that already exists, ask before replacing it.

## Contact Sheet

Generate contact sheets through `xdoc pptx preview` for PPTX decks. If you need
custom columns, thumbnail size, background, or a legacy contact output path,
fall back to `xdoc convert --to png --contact-sheet` and record that fallback in
the final summary:

```bash
xdoc convert deck.pptx --to png -o <run-dir>/previews --overwrite --contact-sheet
```

Adjust fallback contact sheet options only when needed:

- `--contact-cols 3` or `4` for longer decks
- `--contact-thumb 960x540` when small text must be readable
- `--contact-background EEEEEE` to see page edges better
- `--contact-output path/to/contact-sheet.png` for a custom output path

## Preflight Checks

For fonts, links, and compatibility:

```bash
xdoc check deck.pptx \
  --checks fonts,links,compat \
  --target-office 2016 \
  -o <run-dir>/check.json \
  --pretty \
  --overwrite
```

`xdoc check` is not a visual gate. It does not replace `vision-check` or PNG
review for created/edited decks.

`--target-office` accepts `2007|2010|2013|2016|2019|2021|365` and defaults to
`365`. For Agent decisions, inspect `checks.compat.details.agentGate`, not only
the command status:

- `agentGate.passed=true` means every detected OOXML feature is available in
  the requested target release.
- `unprotectedIssueCount>0` means newer markup has no recognized compatibility
  protection and is a structural interoperability risk.
- `gracefulDegradationIssueCount>0` means `mc:Ignorable`, an OOXML
  `extLst/ext` extension container, or an `AlternateContent` fallback should
  let older Office open the deck, but the
  newer feature may disappear or be replaced; this still fails exact-fidelity
  delivery to that target.
- `minimumOfficeVersion` is the derived minimum release for full semantics.
  Each issue includes a stable `ruleId`, occurrence count, and sample OOXML
  parts so an Agent can produce a focused repair or policy decision.

For a single PPTX, use `-o <run-dir>/check.json` as the canonical structured
preflight artifact. Do not add `--json` unless `xdoc check --help` discloses it.
If `--report` is available, treat it as a batch summary/report sidecar; it does
not replace the per-file diagnostic JSON written by `-o`.

For `fonts`, `missingRiskCandidates` excludes common system fonts such as
Arial, Aptos, Calibri, Times New Roman, Courier New, Helvetica, Verdana, and
Tahoma. These may appear under `systemFontCandidates`: acceptable for many
internal decks, but still a cross-machine consistency risk for strict external
delivery. Non-system `font_not_embedded` warnings should be fixed by embedding
the font or switching to an approved system/DeckKit font.

### Accessibility is outside the default list

`a11y` is deliberately excluded from the default check set, but `--checks all`
does include it. Name it explicitly:

```bash
xdoc check deck.pptx \
  --checks fonts,links,compat,assets,policy,a11y \
  --target-office 365 \
  -o <run-dir>/check.json \
  --pretty --overwrite
```

The outer report remains `preflight/v1`; the accessibility details identify
`pptx-a11y/v1`. A completed scan with findings still exits 0, so never gate on
the process status alone. Read `checks.a11y.status` and `summary.riskLevel`:

- `passed`: every rule ran and produced no in-scope finding;
- `warning`: at least one decided violation;
- `inconclusive`: no decided violation, but static package facts could not
  resolve at least one rule; this is not a pass and requires rendered/manual
  review;
- `failed`: the scan did not run and provides no accessibility evidence.

The current render-free rules cover structured slide titles, descriptions or
decorative metadata for visual objects, Office-version support for the
decorative extension, and statically resolvable text contrast. They do not
audit reading/tab order, table navigation, full WCAG conformance, screen-reader
behavior, or description quality. Gradients, pictures, and pattern backgrounds
may make contrast inconclusive.

Findings may include `patchSelector` and `patchTemplate`. The template contains
placeholder prose, has `autoApplicable: false`, and is deliberately not a
`fixPatch`; replace it with a truthful description and dry-run it, never merge
the placeholder unchanged. With `--target-office` earlier than 2019, a visual
marked only as decorative still needs a description fallback or produces
`a11y_decorative_not_supported`. Scoped `--slide` findings do not prove a
deck-wide pass; verify `details.scope.outOfScopeFindingCount` and deck coverage.

## Extract

Use extract for notes, resources, links, and fonts:

```bash
xdoc extract deck.pptx --parts notes,resources,links,fonts
```

Save extracted JSON/report files in the run directory unless the user asks for a
specific output location.

## Ingest HTML / URL / PDF (inbound)

The commands above send a PPTX outward. These two go the other way: they turn an
external HTML page, URL, or PDF into Markdown/text. Use them when the user just
wants the converted Markdown/text. If the result will become a new or edited
deck, follow `common-workflow.md` -> Source Ingestion instead.

```bash
# HTML file / glob / directory / URL -> Markdown (omit -o for stdout)
xdoc html2md page.html -o <run-dir>/page.md
xdoc html2md "https://example.com/post" -o <run-dir>/page.md
xdoc html2md ./pages --recursive --output-dir <run-dir>/md     # batch
xdoc html2md page.html --html-base-url "https://site.com/"  # resolve relative links
xdoc html2md ./pages --recursive --report <run-dir>/html2md-report.json

# PDF -> copyable text (omit -o for stdout)
xdoc pdf extract-text input.pdf -o <run-dir>/text.txt
xdoc pdf extract-text input.pdf --pages 1,3-5 --mode layout
xdoc pdf extract-text input.pdf --engine pdfium --json --pretty  # pdf-text/v1
```

Notes:

- `xdoc html2md` and `xdoc convert <input> --from html --to md` share the same
  HTML-to-Markdown engine; a URL passed to `convert` auto-detects as `html`.
- `xdoc pdf extract-text`: `--engine auto` resolves to PDFium in native builds
  (`pdflite` is not yet available); `--pages` is 1-based; `--mode layout` keeps
  visual order, `natural` is the reading flow. With `--json --pretty` inspect
  `summary` and `warnings` for dropped/reordered characters.
- `pdf extract-text --output` writes one text or JSON file. Existing files are
  preserved with exit code 9 unless `--overwrite` is explicit; use it only for
  current-run outputs. The complete result is staged before replacement. Omit
  `--output` to keep the result on stdout; no manifest sidecar is generated.
- This is text only. Images, styles, and layout from the source are not imported.
- `html2md -o file.md` also writes a `file.manifest.json` sidecar and refuses to
  overwrite an existing output; add `--overwrite` for current-run files, or use
  `--manifest false` (or stdout without `-o`) for a single clean file.

## When Export Finds A Problem

If conversion/check reveals a problem and the user asks you to fix it, switch to
`edit-mode.md` plus the relevant domain reference (`styles-and-themes.md`,
`charts.md`, `tables.md`, or `patch-ops-cheatsheet.md`).
