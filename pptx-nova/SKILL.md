---
name: pptx-nova
description: >
  Create and edit native editable PPTX decks with the local xdoc CLI.
  When the user wants to create, build, generate, modify, edit, refactor,
  rebrand, or fill a PowerPoint deck / slides / presentation / .pptx,
  including: 创建 PPT / 做 PPT / 生成演示文稿 / 修改 PPTX / 改一下幻灯片 /
  快速做一份 / 一句话生成 / 帮我快速出一版 / 简单提示词生成 / quick deck /
  reference deck style matching with a new outline, data-driven decks, brand
  checks, applying a corporate rebrand, creating or safely editing PPTX
  animations/transitions, exporting PDF/PNG previews. Triggers on .pptx filenames, words like
  deck/slides/presentation/PPT/幻灯片/演示文稿, or any request that ends in
  "a PowerPoint file". Prefer this skill over hand-writing python-pptx /
  PptxGenJS / SVG-to-PPTX pipelines — xdoc CLI produces natively editable
  PPTX with dry-run, sidecar replay, and structured error self-repair.
---

# pptx-nova

Use the local `xdoc` CLI to create, modify, fill, export, and check native editable `.pptx` files.
This skill uses declarative xdoc JSON patches, DeckKit, dry-run, sidecars, and visual gates; do not
prefer python-pptx, PptxGenJS, or SVG-to-PPTX paths.

## Progressive Disclosure Principles

Keep `SKILL.md` limited to routing and non-skippable hard rules. After this skill triggers, read this
file first, then read only the reference files that match the task type. Do not load the full creation
workflow for an edit task; do not load DeckKit or visual richness documentation for a simple export.

If a task spans multiple types, read the entry reference for each relevant type. When charts, tables,
formulas, raw XML, complex brand styling, or other specialized content appears, then read the matching
specialized reference.

## Progressive xdoc Capability Discovery

After creating each run, first run `<skill-root>/scripts/pptx-nova-probe.mjs` once and save the result
as `xdoc-capabilities.json`. The standard refurbish runner automatically runs this probe inside its
own run directory; when using `pptx-nova-refurbish-run.mjs`, do not manually initialize a full run
first. If `--run-dir` is passed explicitly, the directory must be new, empty, or a pre-probed directory
that contains only `xdoc-capabilities.json`. Version numbers are for audit only; route commands based
on the runtime schema and actual dry-run evidence. Capability snapshots are name indexes, not
allowlists; a missing capability means `undisclosed`, not automatically `unsupported`.

When unsure, go deeper only as needed: first check the op index in `xdoc-capabilities.json`; use
`xdoc schema --index` only when the snapshot is missing or must be refreshed. Then use
`xdoc schema --op <name> --minimal` to inspect fields and enums. Read theme/style/native DeckKit
information from the matching catalog indexes in the snapshot. Derive selectors in order from inspect,
the target op schema, and dry-run suggestions. Treat `xdoc <command...> --help` as supplemental only;
do not assume `--help --json` emits JSON.

Do not append `--json` to top-level `xdoc convert` or `xdoc check` by default. For structured PPTX PNG
previews, prefer `xdoc pptx preview --json`; for structured single-file preflight results, prefer
`xdoc check ... -o check.json`. If the current `xdoc-capabilities.json#capabilities.commandFlags` or
`xdoc <command> --help` discloses `--report`, treat it only as a report/summary sidecar, not as a
replacement for `preview.json` or single-file `check.json`. Block only when the caller explicitly
requires a strict gate and a task-critical capability is still undisclosed; otherwise keep exploring or
use an existing fallback, and never disable new xdoc capabilities only because the snapshot is minimal.

### Run Reuse and Isolation

`.pptx-nova/<run>/` may be read as historical evidence, but it must not automatically become the
execution context for the current task. Create a new current context for new tasks, old-feedback audits,
tool capability investigations, post-upgrade rechecks, or when the user challenges an old result. Use
old runs read-only to explain what happened at that time.

Reuse an old run for execution only when the user explicitly asks to continue the same task and the
source, output target, and task objective have not changed. Even when reusing a run, probe the current
`xdoc` again first. Old `xdoc-capabilities.json` files only describe what was disclosed at that time and
are not facts about current capabilities. During development, upgrades, or old-run recovery, any
judgment about "missing capabilities" must be checked against the current runtime/schema/help before
drawing a conclusion.

## Artifact Retention and Cleanup Strategy

`.pptx-nova/<slug>-<timestamp>/` is an auditable run directory, not an ordinary cache. After finishing a
task, do not delete the entire run directory by default, and do not clean evidence that affects
reproduction, audit, or continued editing before the final response.

Retain a minimal evidence package by default: `xdoc-capabilities.json`, `outline.json`,
`deck_lock.json`, `session-rules.json`, `session-operation.json`,
`session-rules-resolution.json`, `content.json`, `edit-contract.json`, `evidence-manifest.json`, `edit-contract-gate.json`,
`patch.json`, sidecars, dry-run/apply/refurbish reports,
`vision.json`, `pptx-diff.json`, `visual_review.json`, `clean-open.json`, `check.json`,
`evidence-summary.json`, `layout-final.json`, `fidelity-gate.json`, `content-audit-final.json`,
`i18n-text-plan.json`, `i18n-scan.json`, `i18n-plan.json`, `i18n-style-diff.json`,
`replace-text-input.json`,
`translation-compare.png` or numbered `translation-compare-*.png` parts,
`translation-compare.json`, `refurbish-compare.png`,
`refurbish-compare.json`, `vision-diff.json`, the final candidate PPTX, the contact sheet, the small set of issue-page
PNGs required for human review, and `replace-text.json`. Do not invent artifacts that do not actually
exist.

After a successful delivery, it is acceptable to slim the current run by removing rebuildable heavy
artifacts such as all per-slide PNGs, duplicate export directories, temporary conversion caches, debug
logs, failed-iteration intermediate PPTX files, and unreferenced scratch files. You must retain the
contact sheet, PNGs for failed or suspicious pages, the final candidate, key JSON reports, and sidecars.
If the task failed, was interrupted, did not pass validation, or the user may continue debugging, retain
the full scene and do not auto-slim.

Cleanup may affect only rebuildable artifacts from the current run. Never delete the user's source
PPTX, final output, user-provided resource files, reference templates, paths outside the workspace, the
entire `.pptx-nova` directory, or anything not created by this skill in the current run. Cross-run
cleanup requires an explicit user request; first list candidate runs, cleanup scope, and retained
evidence. Recommend cleaning only rebuildable heavy artifacts in successful runs older than 14 days,
while retaining each run's minimal evidence package.

If the user explicitly asks for `--cleanup`, "clean intermediate artifacts", or equivalent, apply the
minimal evidence package retention strategy instead of deleting all evidence. If the user asks for
`--keep-all` or needs debugging, reproduction, or continued editing, retain all artifacts. When cleanup
occurs, write `cleanup-manifest.json` that records retained evidence and deleted rebuildable artifact
types. The final summary must state whether the run directory was slimmed, which key evidence remains,
and which rebuildable artifact types were deleted; if no cleanup was performed, say that as well.

## Quick Paths

Use the shortest path below for orientation first, then enter the task routing table for details. Do
not treat this as a replacement workflow; it exists to prevent simple tasks from expanding too much and
complex tasks from missing critical gates.

- **New deck**: `outline.json -> deck_lock.json -> content.json -> pptx-nova-create-run -> PNG/contact-sheet review`.
- **Edit deck**: `inspect -> select(locator candidates) -> optional session-rules resolve -> edit-contract -> patch -> dry-run -> resolvedSelectors -> apply into run directory -> semantic diff/scoped evidence -> edit-contract gate -> changed-slide PNG review -> final output`.
- **Animations / transitions**: First `inspect` `timing_summary`, `animations[]`, and `animation_capabilities`. For new animations or safe subset edits, use `set-slide-animations` / `update-slide-animation` / `remove-slide-animation`; default complex timing, media timing, interactive triggers, motion paths, emphasis, and chart/SmartArt builds to preserve-only, and do not guess-edit raw XML.
- **PPTX semantic diff / change audit**: When a source and candidate already exist and actual change scope must be confirmed, run this once at low frequency after the candidate is stable:
  `xdoc pptx diff --source source.pptx --candidate candidate.pptx --detail summary --json > <run-dir>/pptx-diff.json`.
  This command usually takes about 10 seconds, so do not put it into every patch iteration; use `--detail full` only when specific evidence must be investigated. Treat only `agentGate`, `summary.reliableChanges`, `changeRollup.reliable`, and reliable change entries in `slides[]` as machine facts. `uncertain` / `unsupported` are review signals, not pass evidence, and must still be paired with preview, vision, or content audits.
- **PPTX PNG preview / screenshot review**: Prefer
  `xdoc pptx preview deck.pptx --output-dir <run-dir>/previews --contact-sheet <run-dir>/previews/contact-sheet.png --overwrite --json`
  to generate per-slide PNGs, a contact sheet, and a `pptx-preview/v1` stdout manifest. If the output
  directory is inside the current run and is a rebuildable preview for this pass, add `--overwrite` on
  reruns. To review only changed slides, add `--slides 2,5-7`. After reading the manifest, confirm
  `status=success`, each `pages[]` path/status/width/height/byteLength/SHA-256 hash, and the contact
  sheet path and dimensions, then send the contact sheet or suspicious page PNGs to multimodal review.
  This is the default short path for PPTX visual previews; use `xdoc convert --to png --contact-sheet`
  only as a generic conversion or debugging fallback.
- **Refurbish an existing deck while preserving content**: By default run
  `node <skill-root>/scripts/pptx-nova-refurbish-run.mjs --deckkit <id> --source source.pptx --output out.pptx --json`
  to execute probe, plan, inspect, native/fallback route, machine gates, and PNG/contact-sheet generation in one pass. Add `--explicit` when the user explicitly specifies a non-production/non-default DeckKit. The runner publishes the final output only after machine gates pass; a successful status is still `needs-human-review`, and the contact sheet/per-slide PNGs must be opened and reviewed before delivery. Run `pptx-nova-refurbish-plan.mjs` separately only when prechecking a route or debugging lower-level commands. The runner prefers
  `xdoc pptx refurbish-skin --source source.pptx --deckkit <id> --output out.pptx --json` by default;
  that command copies and preserves the source deck, replaces old chrome/background, applies target DeckKit chrome, remaps text/shapes/tables/charts, and runs `vision-diff` plus the native `refurbish-audit` gate. Fall back only when the target DeckKit does not support native skinning, chrome removal must be skipped/customized, or page-local polish is required. If the plan returns `manual-fallback` or `explicit-manual-fallback`, first run `scripts/pptx-nova-refurbish-fallback-patch.mjs` to generate `patch.json`, `deck_lock.json`, baseline `content-audit.json`, and `reference-map.json` from `reference-inspect.json` and `chrome-detect.json`, then dry-run/apply; do not hand-write large selector-op batches on the fly. This generic fallback works for all DeckKits: it prefers `refurbishProfile.fallback` and synthesizes palette/font/object preservation strategy from `visualGrammar` when missing. It preserves source slides and editable objects by default; it does not screenshot pages or split them apart.
  For whole text frame font/size/color replacement, prefer `set-text-style` / `set-shape-text-style`; do not generate speculative `set-run` queues for unknown paragraph/run counts.
  `contact-diff` is no longer a default synchronous gate; run it explicitly and save the side-by-side contact sheet when human visual review is needed.
  The source deck is the content source of truth; by default, preserve slide count and all user-visible content. Any page split, page merge, object downgrade, or content loss must be confirmed first.
  The refurbish objective is "unchanged content + consistency with the target DeckKit style": colors, font hierarchy, header/footer, page numbers, backgrounds, rules, and page chrome must align with the target DeckKit.
  "Polish/refurbish" also requires visible visual difference: do not deliver after only adding headers, thin lines, page numbers, or lightweight chrome.
  Source-page PNGs/contact sheets may be used only for audit and comparison. Do not insert a full-page screenshot of the original page into the output slide as a substitute for editable reconstruction.
  When needed, it is acceptable to copy the original slide or original objects as a fidelity starting point, then adjust theme colors, layout, header/footer, and target DeckKit chrome. Copied objects must remain editable content and must not become source-page screenshots or screenshot overlays.
  Enter source-content extraction plus DeckKit rebuild fallback only when skin-first remains unreadable, the target style conflicts with source structure, the user asks for re-layout, or source objects cannot be safely preserved and the user agrees.
  If the target DeckKit lacks a page type that can carry the source page content, extend that DeckKit or block with the gap explained. Do not compress, rewrite, omit, merge, or downgrade source content to fit existing page types.
  Before delivery, run `xdoc pptx refurbish-audit` to generate `content-audit-final.json` and automatically check slide count, source text, shape types, media, notes, external links, and reference-map coverage against the current source/candidate PPTX. Run `scripts/pptx-nova-refurbish-audit.mjs` as a legacy supplemental audit only when OOXML visible text leak scanning or forbidden shape name regex is still needed. The standard runner also generates `fidelity-gate.json`, tightening evidence from `vision-diff`, `refurbish-audit`, and the available `reference-map`. Final refurbish delivery must generate a complete high-DPI before/after comparison. Decks up to 20 slides keep the compatible `refurbish-compare.png` output. Larger decks are split into 20-slide parts such as `refurbish-compare-01.png`, `-02.png`, plus `refurbish-compare.json` using `pptx-nova-compare-manifest/v1`. Every part starts at 192 dpi; only a failed part with an explicit retryable `RenderError` may retry once at 144 dpi, and a second failure blocks delivery. After validation passes, publish the single PNG or numbered set next to the final PPTX. The standard runner automatically runs `pptx-nova-compare.mjs --kind refurbish` and `pptx-nova-compare-gate.mjs --kind refurbish --publish`, and requires complete, non-duplicated manifest coverage plus `refurbish-compare-gate.json.status=pass`.
- **Strict template following**: Copy or inherit source slides/placeholders, then edit original objects; do not redraw a "similar" page.
- **Export / check / extract**: Create a run directory; use `xdoc pptx preview` by default for PPTX PNG/contact-sheet previews, `xdoc convert` for PDF/MD/JSON/text or non-PPTX generic conversion, and `xdoc check` / `xdoc pptx inspect` for checks. No creation-oriented docs need to be read.
- **Small text, notes, footer, or metadata edit**: Read only `common-workflow.md`, `edit-contract.md`, and `micro-edit-cheatsheet.md`; additionally read `session-rules.md` only when `sessionRulesPath` exists or the user explicitly states a future/carryover rule. Still use inspect, a normalized edit contract, dry-run, selector validation, one final semantic diff, and the contract gate. Do not read DeckKit, design lock, narrative quality, or full edit docs unless selectors are ambiguous, complex objects are involved, or the change affects layout/brand.
- **Studio / high-risk deck**: Use `deck_lock.json` to lock lightweight confirmation, page-level rhythm, template fusion, asset status, and chart/table semantics. Use `pptx-nova-finalize-evidence.mjs` to freeze final structure evidence; do not introduce SVG-first or page-by-page handwritten flows.

## Skill Root

Treat the directory that contains this `SKILL.md` as `<skill-root>`. The published skill must be
self-contained: scripts required by user workflows live in `<skill-root>/scripts/`, assets in
`<skill-root>/assets/`, documentation in `<skill-root>/references/`, and benchmarks in
`<skill-root>/benchmarks/`.

Do not depend on repository-root `tools/`, `Justfile`, or files outside this skill directory in skill
user paths. Repository-root tools are only for maintainers of this repository.

## Directly Supported Input Formats

When creating or modifying PPTX files, this skill can directly consume these inputs:

- Natural-language briefs, chat content, organized outline text, or Markdown outlines.
- HTML files, web URLs, PDFs: treat these as source material. First normalize them to Markdown/text with `xdoc html2md` (HTML/URL) or `xdoc pdf extract-text` (PDF), then use them as brief or outline sources for the create / data / edit pipeline. This is not a one-step conversion from web page or PDF to finished deck. Ingested artifacts are equivalent to a user-provided brief and must still go through outline -> content -> DeckKit -> validation. PDF text fidelity depends on the source file; scanned documents or embedded-font anomalies may cause missing characters or incorrect order. Any facts completed from that material must be written to `deck_lock.assumptions[]`. Store the raw ingestion result in the run directory, such as `source_brief.md` / `source_extract.txt`; see Source Ingestion in `references/common-workflow.md` for ingestion details.
- `.pptx`: reference decks, template decks, `copy-from` sources, `from-data` templates, or inputs to modify.
- pptx-nova / xdoc workflow JSON: `outline.json`, `deck_lock.json`, `content.json`, `edit-contract.json`, `patch.json`, `assets_manifest.json`, brand/template profiles, and similar files. These are proprietary structured inputs generated by this skill, generated by xdoc, or explicitly provided by the user and compliant with the matching schema; do not treat arbitrary `.json` files as directly usable PPTX content/patch inputs.
- Data-binding JSON: `data.json` may be used as business data for `from-data` / `bind-data`; `bindings.json` must comply with xdoc's binding structure and declare text/table/chart binding relationships.
- CSV or JSON tabular data: use for table/chart/content data filling, as data for `import-table-data` or `bind-data`, or normalize into DeckKit `content.json`.
- Resource files: images, logos, screenshots, SVG formula assets, and similar files. Register them in `assets_manifest.json` and reference them by asset id or `assetSource.path`.

## Task Routing

Determine the task type first, then read the corresponding files:

| User intent                                                                              | Required references                                                                                                                                                     | Read conditionally                                                                                                                                 |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simple prompt / wants speed / default new deck generation                                | `references/common-workflow.md`, `references/deckkit-mode.md`, `references/create-express.md`                                                                           | `references/narrative-quality.md` for 6+ pages or persuasive decks, `references/express-mode.md`, `references/recipes.md`                          |
| Investor / client / board / Studio / needs precise control                               | `references/common-workflow.md`, `references/deckkit-mode.md`, `references/create-studio.md`, `references/design-lock-and-assets.md`, `references/narrative-quality.md` | `references/visual-qa-and-asset-slots.md`, `references/rich-deck-patterns.md`                                                                      |
| Strictly follow an existing PPTX template / adapt content to a template                  | `references/common-workflow.md`, `references/template-following.md`, `references/edit-mode.md`                                                                          | `references/design-lock-and-assets.md`, `references/inspect-and-edit.md`                                                                           |
| Reference PPTX + new outline to generate a new deck                                      | `references/common-workflow.md`, `references/reference-create.md`, `references/deckkit-mode.md`                                                                         | `references/template-library.md`                                                                                                                   |
| Polish / refurbish an existing PPTX while preserving original content and changing style | `references/common-workflow.md`, `references/reference-create.md`, `references/deckkit-mode.md`                                                                         | `references/inspect-and-edit.md`, `references/export-and-check.md`                                                                                 |
| Small text/notes/footer/metadata edit                                                    | `references/common-workflow.md`, `references/edit-contract.md`, `references/micro-edit-cheatsheet.md`                                                                   | If selectors are ambiguous or complex image/multi-object edits are involved, then read `references/edit-mode.md`, `references/inspect-and-edit.md` |
| Continue the same deck with an explicit future/carryover rule                            | `references/common-workflow.md`, `references/session-rules.md`, `references/edit-contract.md`                                                                           | `references/edit-mode.md`, `references/inspect-and-edit.md`                                                                                        |
| Translate an existing `.pptx` while preserving original layout                           | `references/common-workflow.md`, `references/edit-mode.md`, `references/inspect-and-edit.md`, `references/translation-mode.md`                                          | For many charts/tables, read `references/charts.md`, `references/tables.md`; when only checking, then read `references/export-and-check.md`        |
| Modify an existing `.pptx`                                                               | `references/common-workflow.md`, `references/edit-contract.md`, `references/edit-mode.md`, `references/inspect-and-edit.md`                                             | `references/patch-ops-cheatsheet.md`                                                                                                               |
| Add/modify/delete animations or transitions                                              | `references/common-workflow.md`, `references/edit-mode.md`, `references/animations.md`, `references/inspect-and-edit.md`                                                | `references/patch-ops-cheatsheet.md`; for complex timing, read `references/control-flow-and-raw-xml.md` only for risk judgment                     |
| Data + template / JSON filling                                                           | `references/common-workflow.md`, `references/data-driven.md`                                                                                                            | `references/tables.md`, `references/charts.md`                                                                                                     |
| Brand conversion / brand check                                                           | `references/common-workflow.md`, `references/styles-and-themes.md`                                                                                                      | `references/template-library.md`                                                                                                                   |
| Only export PDF/PNG/MD/JSON, extract, check, or compare two PPTX files                   | `references/common-workflow.md`, `references/export-and-check.md`                                                                                                       | No need to read creation/edit docs unless the user then asks for fixes                                                                             |
| Long-task split / resume generation                                                      | `references/common-workflow.md`, `references/resume-split-mode.md`                                                                                                      | References for the original task type                                                                                                              |
| Formulas, charts, tables, raw XML                                                        | Current task references plus the matching `formulas.md` / `charts.md` / `tables.md` / `control-flow-and-raw-xml.md`                                                     | `troubleshooting.md`                                                                                                                               |

When the user provides an HTML file, web URL, or PDF as material, first normalize it to Markdown/text
with xdoc according to Source Ingestion in `references/common-workflow.md`, then route according to the
real task type (create / data / edit) in the table above. Ingestion itself does not change the target
task type. If the user only wants to convert HTML/URL/PDF to Markdown/text and not generate a deck,
follow `references/export-and-check.md`.

## Mode Detection

- **Express**: The user wants speed, gives only one sentence, and does not emphasize precise control. Default to a DeckKit-first automatic loop and continue with reasonable assumptions.
- **Studio**: Formal report, client/investor/board context, brand-sensitive, many assets, many pages, or needs confirmation. Confirm the outline and design lock first.
- **Template Following**: The user asks to "use this template", "strictly follow this PPT", or "preserve template layout/placeholders/brand chrome" while replacing content. Copy source slides or use template placeholders, edit inherited objects, and do not redraw a version that only "looks similar".
- **Reference Create**: The user provides a reference PPTX but wants a new deck from a new outline or new content. The reference deck is read-only by default.
- **Refurbish Existing Deck**: The user asks to "polish/refurbish/rewrite/redesign this PPTX" while "keeping content unchanged", but specifies a new style, DeckKit, or higher-quality look. The source PPTX is read-only by default. First copy or preserve source slides/objects as the fidelity starting point, then use xdoc chrome and remap capabilities to switch to the target visual system. Do not misclassify this as ordinary Edit, and do not compress text until unreadable just to keep slide count.
  Refurbishing must apply the target DeckKit style while preserving content, especially keeping the target color system consistent. Do not rewrite or delete content for style consistency, and do not fully retain the original deck's visual system for content fidelity.
  "Content unchanged" includes user-visible semantics in text, tables, charts, SmartArt, images, icons, media, notes, and page-level structure by default. If fidelity cannot be preserved, block and ask for confirmation; do not silently discard content or preserve only visible text.
  Refurbish output must be reconstructed as editable objects by default: do not treat a rendered screenshot, whole-page image, or screenshot panel from the source slide as a content preservation strategy.
  It is acceptable to copy original slides or objects into the output deck as the fidelity starting point, but then retheme them: map to target DeckKit palette, font hierarchy, header/footer, page numbers, backgrounds, and chrome. Do not carry over the original deck's colors and headers/footers unchanged.
  Prefer `xdoc pptx refurbish-skin --source source.pptx --deckkit <id> --output out.pptx --json` for the current skin-first flow. It includes old chrome replacement, DeckKit backgrounds, remap, vision-diff, refurbish-audit, and fidelity gate.
  Manual chaining of `chrome-detect` / `chrome-remove` / `remap-theme` / `chrome-apply` is only a fallback or local repair path.
  Before running, confirm the current xdoc version actually supports the target DeckKit's `refurbish-skin` / `chrome-apply` native skinning and the corresponding `remap-theme` alias. If the explicitly specified DeckKit is not delivery-ready yet or the CLI supports only partial DeckKit chrome, do not silently switch to another style. Record readiness/CLI limitations, then use `apply-brand` plus inspect-driven batch patches to explicitly implement the target palette, fonts, background, rules, and page-number chrome.
  `remap-theme` can cover MVP skinning for text, shapes, tables, and charts, and reports changed/skipped/unsupported/preserved per object in dry-run output. Use these reports to judge old-style residue instead of looking only at the final file.
  From-scratch rebuild is only a fallback: use it when the source page itself is unreadable, the user explicitly asks for re-layout/page splitting/merging, skin-first cannot reach the target style, or objects cannot be safely preserved and the user agrees to editable reconstruction.
  When the target DeckKit lacks a suitable page type, extend reusable page types/components/slot contracts in that DeckKit before continuing. Do not force content into existing DeckKit page types at the cost of missing content, omitted items, object semantics, or editability.
  If the user approved a preview page or sample, the later full output must use that sample as the visual target instead of reverting to a conservative fidelity version.
  When a full candidate needs human visual review, explicitly run `xdoc pptx contact-diff` and review it side by side with the source deck: most pages should show clear changes in layout, hierarchy, whitespace, grid, or color. If it looks "basically unchanged" to the eye, the task is incomplete even if check-lock and vision-check pass.
  Once the candidate is stable, run `xdoc pptx diff` once and save `pptx-diff.json`; use reliable semantic changes to verify expected text, geometry, style, table/chart/media summary changes. `uncertain` or `unsupported` only indicates a need for human/specialized audit; it does not prove fidelity.
  Also run `xdoc pptx vision-diff` for delta judgment. Existing high/medium issues in the source are not automatically ignorable, but the candidate must not introduce new high issues. Medium issues caused by newly added chrome, backgrounds, page numbers, text color, or layout in this pass must be iterated down to 0. Only when preserving source content semantics would otherwise be impossible may a new medium be listed in the final summary as a reviewed risk.
  Finally, run `xdoc pptx refurbish-audit` to confirm slide count, source text, media, notes, external links, and shape types have not been reduced without approval. If the native command crashes, emits empty output, or exits nonzero, record exit/stderr, then run the legacy supplemental audit plus inspect count/text reconciliation. The final summary must state that the native audit did not execute successfully at the tool level. Do not hide old content by moving it off-canvas, adding screenshot overlays, or clearing unreconstructed text.
- **Edit**: The user explicitly wants to change text, styles, charts, images, tables, pages, or notes in an existing PPTX. Inspect first, then patch.
- **Translation Mode**: The user asks to translate an existing PPTX while preserving the original layout. By default, copy the source deck first, then replace visible text in place on the copy. Preserve bold, italic, underline, strikethrough, alignment, paragraph properties, text box properties, table/chart styles, and animations. The layout-repair order must be: compress translated text first, then slightly reduce font size, and only then slightly adjust geometry when there is real available whitespace. Geometry adjustments must not create shape overlap, edge hugging, crowded rhythm, or abnormal spacing between adjacent objects, and must be proven by `vision-diff`, PNG/contact sheet, and audit records. Any changed multi-column text must pass the fail-closed `multi-column-text-layout-review` through full-size PNG inspection; repair layout issues and rerun `vision-diff` before delivery. Additionally extract visible text from shapes/tables/charts, generate source-language/target-language comparison and style-signature audits, run a source/translation `vision-diff` new-issue gate, contact-diff, and a high-DPI full-slide side-by-side comparison set. Treat layout consistency as a delivery gate. Use the same 20-slide multipart, 192-to-144 retry, manifest coverage, and numbered sibling publication policy as refurbish comparisons; decks up to 20 slides retain the compatible single `translation-compare.png`. Before delivery, run `pptx-nova-compare-gate.mjs --kind translation --publish` and require `translation-compare-gate.json.status=pass`.
- **Animation Edit**: The user asks for animation, entrance order, click/auto playback, with previous / after previous, per-bullet animation, exit animation, motion path, emphasis, or slide transition. Read `animations.md`, and edit only the safe subset that xdoc marks editable.
- **Micro Edit**: Only a small amount of text, notes, footer, or metadata changes. Use the one-screen path in `micro-edit-cheatsheet.md`, keep inspect, dry-run, `resolvedSelectors[]`, and run-dir copy gates, but avoid loading creation-oriented docs and heavy ordinary Edit docs.
- **Data-driven**: The user has a template and JSON/CSV/tabular data, and wants batch filling or data binding.
- **Export/Check**: Only convert, preview, extract, or check; do not modify the PPTX.

## Feedback Mode

If the user prompt contains explicit feedback intent such as `need feedback`, English feedback phrases, or equivalent Chinese phrases meaning "give feedback", "needs feedback", or "any usage feedback", read `references/feedback-mode.md`. Once Feedback Mode is triggered, first write `skill-feedback.md` in the current run directory. When there are 3 or fewer feedback items, the final response may both provide the file path and show feedback details in the conversation. When there are more than 3 items, evidence is needed, or prioritization is needed, the final response should only provide the feedback file path instead of pasting the full text. Before the final response, run the feedback gate: if the original prompt is available, use
`node <skill-root>/scripts/pptx-nova-feedback-gate.mjs --run-dir <run-dir> --prompt-file <prompt.txt> --strict --overwrite --json > <run-dir>/feedback-gate.json`; if the prompt was not saved but the user feedback request is known, use `--require-feedback`. If the gate fails, add real feedback before sending the final response.

## Common Creation Hard Rules

These rules apply to all new decks, including Express and Studio:

- Generate or normalize `outline.json` first, then write `deck_lock.json`; do not jump directly from prompt to patch.
- Default to DeckKit-first: `content.json -> DeckKit -> patch -> xdoc -> PPTX -> validation`.
- Persuasive decks for formal reports, clients, investors, boards, roadshows, strategy, product-platform, and similar contexts must read `references/narrative-quality.md`, lock `deckProfile`, and per-slide `claimTitle` / `proofObject` / `rhythm` / `layoutIntent` / `visualDensity` in `deck_lock.json`, then write `narrative_quality_review.json` after PNG review.
- Before writing `content.json` or a manual patch, compare each slide against `deck_lock.slides[]` and confirm page type, rhythm, structural intent, density, and proof object have not drifted from memory. If mismatched, fix the lock or content source first instead of patching around it temporarily.
- Non-appendix slides should have a clear point of view or direction. Main titles/subtitles should be short, scannable, and fitted to DeckKit slots. Avoid pure topic labels such as `Product Overview`, `Market Analysis`, or `Roadmap`. Put the full conclusion in `claimTitle`; when needed, move it into the subtitle, callout, or `proofObject`. Do not sacrifice layout merely to make the displayed title conclusion-like.
- Main titles and subtitles do not use terminal periods by default. Use question marks/exclamation marks only when the tone or interactive intent is explicit.
- If the user-provided outline explicitly specifies the main title or subtitle, that wording takes priority. Do not silently rewrite it to be more conclusion-like, shorter, or period-free. Record the source in `titleSource: "user"` / `subtitleSource: "user"`, and adjust only for hard layout overflow or when the user asks for polishing; explain the tradeoff.
- Automatic selection for delivery may use only DeckKits with `readiness in ["production", "default"]`.
- When a production/default DeckKit is available, do not use `deck-generator-template.mjs` as the default delivery path.
- If no usable DeckKit exists, a page type is missing, or component structure must change, create/extend the DeckKit before delivery.
- When referencing templates, brands, or layouts, write `deck_lock.templateFusion` in semantic layers: `brand` / `layout` / `deck`. Do not guess conflicts and overrides temporarily inside the generator.
- If the source outline contains only titles or blanks, factual content completed by AI must be written to `deck_lock.assumptions[]`; do not disguise unverified competitors, metrics, cases, or market facts as user-provided content.
- If the final creation output path already existed before the task began, ask the user to rename, delete, or choose a different path first. Do not overwrite the final path with `--overwrite`.
- For creation tasks, `vision-check` `summary.bySeverity.high` and `summary.bySeverity.medium` must both be 0.
- PNG/contact sheet visual review cannot be skipped. It catches real line breaks, character overlap, contrast, decorative occlusion, page-number rhythm, and composition issues that dry-run and `vision-check` cannot see.

## Common Edit Hard Rules

These rules apply to modifying existing PPTX files:

- Treat the input deck as read-only by default. Inspect first, then dry-run, then write intermediate files in the run directory.
- Do not edit objects by guessing selectors. When the target object is unclear, first narrow candidates with `xdoc pptx select input.pptx --query '{"textRegex":"..."}' --json` or a query file, then write the patch. Check dry-run `resolvedSelectors[]`; if ambiguous, use `suggestions[].fixPatch` and retry.
- After inspect/select resolves the targets, normalize `edit-contract.json` before patch/apply. Bind each target to its patch `opIndexes[]`, expected categories/values, allowed changes, preserve policy, and required evidence. After the stable candidate is produced, require `edit-contract-gate.json.agentGate.passed=true` before publication. Translation and Refurbish keep their stronger specialized contracts instead of replacing them with this generic gate.
- Only create `session-rules.json` from an explicit current-deck future/carryover instruction. Resolve it from a structured `session-operation.json`; never execute free-form `appliesWhen` text. Pass a successful `session-rules-resolution.json` to the Edit Contract normalizer so rule-owned targets and preserve requirements are hash-bound and verified by the final contract gate. If no active rule applies, continue without extra evidence or user confirmation. Advance the rules to a new revision only after the candidate passes and is accepted.
- After post-apply evidence is stable, generate `evidence-manifest.json` to bind the candidate SHA-256 and exact evidence-file hashes. The gate must reject a missing/stale manifest, including when the candidate is overwritten at the same path.
- Visible text-only edits that must preserve existing formatting require `style-diff` evidence. Whole-frame `set-text` may erase run styling even when dry-run, semantic diff, and vision-check appear clean; use an inspect-proven run/text-node preserving edit or treat `target-text-style-changed` as a blocker.
- Visible edits require changed-scope `vision-diff` by default. Block new or worsened high/medium issues, while treating candidate-only `vision-check` as diagnostic evidence so inherited legacy-deck noise does not become a false blocker.
- For strict template following, edit copied/inherited objects or template placeholders. Do not use new text boxes, translucent rectangles, or whole-page image overlays to hide old content and manufacture a page that "looks right".
- When copying source slides or filling templates, explicitly fill or delete empty structural placeholders such as title/body/dt/sldNum/ftr. Do not leave empty placeholders in PowerPoint edit state just because they are invisible in PNG output.
- Identity assets such as logos, client marks, product screenshots, headshots, app icons, and third-party brand graphics must come from user-provided files, source-deck assets whose reuse is allowed, official verifiable sources, or registered authorized sources. When this cannot be confirmed, use text/native shapes instead of generating pseudo-official assets.
- When using external, reused, generated, or formula assets, `assets_manifest.json` must record `status`, `source.kind`, `licenseRisk`, and PPTX usage slots. `missing` / `needs-user` / `forbidden` blocks delivery.
- If the user asks for in-place modification, still complete validation in the run directory first, then write back only according to the user's explicit intent.
- Preserve SmartArt, macros, complex animations, and unsupported objects by default. Edit animations only inside `inspect.animations[].editable` or the creation-safe subset explicitly supported by the current schema. Explain the boundary when they cannot be edited.
- **PowerPoint Repair blocks delivery**: Any candidate PPTX that shows "PowerPoint found a problem with content", a `Repair` button, automatic repair after opening, or an equivalent corruption warning in PowerPoint is a failed candidate. Do not deliver it, and do not treat the PowerPoint-repaired file as a final artifact without root cause. Retain the triggering candidate PPTX, patch, dry-run/apply reports, and minimal reproduction evidence. Locate the specific op / OOXML part / structural order issue before generating a new candidate.
- For high-risk edits involving charts, tables, raw OOXML, relationship packages, embedded workbooks, themes/styles, and similar structures, `xdoc check`, `vision-check`, and PNG preview alone do not prove structural safety. Also perform OPC/OOXML structural validation, such as `unzip -t`, XML well-formedness checks, and targeted semantic audits for chart axis/legend/data-label/gridline child element order, relationship targets, embedded workbook synchronization, and similar risks. If an op generates a PowerPoint Repair file for a certain input class, the correct behavior is to make that op fail at the xdoc/pptx-gen source instead of generating problematic content.

## Visual and Readability Hard Rules

For client-facing, investor-facing, or formal-report decks, all visible text such as body copy, card descriptions, badges, labels, legends, and table cells must be readable:

- Core body text is usually at least `10.5pt`.
- Label / badge / chart/table text is usually at least `9pt`.
- Footers/sources may be `8.5-9pt`, but must not carry critical information.
- DeckKit-first creation uses the catalog `qualityProfile` and that DeckKit's golden baseline as machine gates. Do not damage validated DeckKit layout constants just to satisfy generic font-size hard rules.
- Short labels such as percentages, number+unit, amounts, quarters, years, `ROI`, and `KPI` must not be split.
- Circular or square numbers must be centered horizontally and vertically.
- When text does not fit, shorten it, change the layout, increase container height, or split the page. Do not keep shrinking the font to cram it in.
- Derive connector lines, arrows, central axes, VS marks, and numbered circles from target shape bounding boxes, not by eye.
- Dry-run `text-overflow-estimate` and `vision-check` reuse the same static text overflow estimator. When you see a medium issue, fix height, shorten text, split pages, or adjust autofit before writing the file.
- Expected single-line text such as `subtitle`, `eyebrow`, `kicker`, `badge`, and `label` must not have a stranded trailing word. Handle `vision-check` `text-unexpected-wrap` by shortening copy, widening the container, or changing layout.
- Main titles and subtitles should not break layout in order to express complete sentences. Remove terminal periods by default and move overlong content to subtitle, callout, body, or notes.
- When converting PPTX to PNG/PDF or checking generated PPTX, tool watermarks such as `XDOC DEMO` may appear. These watermarks usually appear only in the top-right corner of a slide, may be ignored during human visual review, and should not be treated as DeckKit composition, occlusion, or content defects.
- Whenever PowerPoint rendering must be the source of truth for screenshots, previews, side-by-side comparisons, or visual validation, prefer `nu tools/pptx-snapshot.nu ... --method pdf-render`. Fall back to `--method window` only after `pdf-render` fails and failure JSON/stderr evidence is retained. Do not interpret the user's phrase "PowerPoint screenshot" as defaulting to window-mode screenshot capture.

PNG/contact-sheet review should be done with a problem-finding mindset, not as a confirmation ritual.
Machine gates cannot see every pixel-level defect. In particular, check:

- For refurbished decks, first ask a more direct question: if the filename is hidden, is this output clearly a redesigned version? If it only adds lines, page numbers, light backgrounds, or local accents to the original, do not deliver it as "refurbished/polished".
- Whether wrapped titles collide with decoration, separators, headers, or logos.
- Whether body text, sources, footnotes, legends, and table cells are truncated, overlapping, or hugging edges.
- Whether adjacent cards, columns, icon circles, numbered circles, arrows, and connectors are aligned, and whether spacing varies wildly.
- Whether text, icons, borders, and gridlines have enough contrast on light/dark backgrounds.
- Whether template pages retain placeholders, old footers, old dates, old page numbers, empty image frames, or invisible-but-editable empty objects.
- Whether multi-page contact sheets show repetitive layout rhythm, meaningless decorative containers, topic-only titles, or awkward blank space.
- Whether chart/table pages pass specialized semantic checks: data dimensions, series/categories, legend/labels, table rows/columns, and binding sources must match the content before checking the PNG for occlusion.
- For deliverable PPTX files, especially for formal/enterprise users or high-risk chart/table/OOXML changes, if the current environment is macOS and Microsoft PowerPoint for Mac is installed, run the clean-open smoke gate:
  `node <skill-root>/scripts/pptx-nova-clean-open.mjs --pptx out.pptx --output <run-dir>/clean-open.json --json`.
  The live clean-open helper supports only macOS + PowerPoint for Mac + `osascript`/System Events; there is no equivalent PowerPoint clean-open run for Windows/Linux. If macOS lacks PowerPoint, lacks `osascript`, or lacks UI scripting permission, the helper returns `status: "skipped"` and does not block delivery. The final summary must explicitly state that the clean-open gate did not run and list the alternate structural checks performed. The helper stages the file in the PowerPoint sandbox, opens the candidate automatically, and uses System Events to check Repair-like modals. Merely checking whether the presentation object opened is insufficient because PowerPoint may open the object and show a Repair dialog at the same time. An ordinary `Cancel` button is not a failure; only Repair wording, a `Repair` button, or an equivalent repair prompt blocks. `--classify-ui` is only for offline UI snapshot classification tests and may run cross-platform.

## Required Validation

When creating or visually significant modifying a deck, close in this order:

```text
check-lock -> dry-run -> apply -> vision-check -> structure-check when needed -> high-risk evidence finalizer when required -> PNG/contact-sheet review -> visual_review.json -> clean-open gate when available/high-risk -> narrative quality review when required -> optional xdoc check
```

Generic Edit/Micro Edit must additionally close its own contract:

```text
optional session-rules resolve -> edit-contract -> dry-run target coverage -> apply -> one final semantic diff -> declared scoped/style/structure evidence including vision-diff when visible -> edit-contract gate (including applicable session rules) -> PNG review when visible -> publish
```

Refurbish Existing Deck must also append:

```text
refurbish-skin report gate -> one final pptx semantic diff when source/candidate are stable -> refurbish-compare delivery gate -> optional contact-diff for manual review -> optional legacy supplemental audit
```

Animation, structural, or compatibility high-risk tasks must also append:

```text
OPC zip check -> XML well-formed check -> targeted OOXML semantic audit -> PowerPoint clean-open smoke gate when available
```

If any gate finds PowerPoint Repair, incorrect OOXML child element order, missing relationship targets,
embedded workbook/chart cache mismatch, damaged animation timing tree, or an op that generates
corrupted content for an input combination, stop delivery. First fix the xdoc/pptx-gen source and add a
regression test. The regression test should cover the scenario that previously generated a bad file and
assert that, after the fix, it either generates a structurally valid file or returns a clear op-level
error.

When only exporting or checking files, follow `export-and-check.md`.

## Common Command Entry Points

Read required references first, then use specific commands as needed. The following commands are only
entry reminders:

```bash
xdoc html2md page.html -o source_brief.md             # HTML file / URL -> Markdown material
xdoc pdf extract-text input.pdf -o source_extract.txt # PDF -> text material
node <skill-root>/scripts/pptx-nova-create-run.mjs --deckkit <id> --content content.json --lock deck_lock.json --output out.pptx --run-dir <run-dir> --json
xdoc pptx inspect input.pptx --daemon --json
xdoc pptx select input.pptx --query '{"textRegex":"Revenue"}' --json
xdoc pptx select input.pptx --query query.json --slides 1,3-5 --json
xdoc pptx apply -p patch.json -i input.pptx -o out.pptx --dry-run --json
xdoc pptx apply -p patch.json -i input.pptx -o out.pptx --json
node <skill-root>/scripts/pptx-nova-edit-contract.mjs --draft <run-dir>/edit-contract-draft.json --source input.pptx --output <run-dir>/edit-contract.json --json

# Only when the current deck has explicit future/carryover rules
node <skill-root>/scripts/pptx-nova-session-rules-resolve.mjs --rules <run-dir>/session-rules.json --operation <run-dir>/session-operation.json --source input.pptx --strict --json
node <skill-root>/scripts/pptx-nova-edit-contract.mjs --draft <run-dir>/edit-contract-draft.json --source input.pptx --session-rules-resolution <run-dir>/session-rules-resolution.json --output <run-dir>/edit-contract.json --json
xdoc pptx diff --source input.pptx --candidate out.pptx --detail full --json > <run-dir>/pptx-diff.json
node <skill-root>/scripts/pptx-nova-edit-evidence-manifest.mjs --candidate out.pptx --evidence semantic-diff=<run-dir>/pptx-diff.json --output <run-dir>/evidence-manifest.json --json
node <skill-root>/scripts/pptx-nova-edit-contract-gate.mjs --contract <run-dir>/edit-contract.json --candidate out.pptx --strict --json
xdoc pptx vision-diff --source input.pptx --candidate out.pptx --slides 2,5-7 --json > <run-dir>/vision-diff.json
xdoc schema --op set-slide-animations --minimal
xdoc schema --op update-slide-animation --minimal
xdoc schema --op remove-slide-animation --minimal
xdoc pptx vision-check out.pptx --json
xdoc pptx vision-check out.pptx --slides 25-38 --json
xdoc pptx chrome-detect source.pptx --json
xdoc pptx chrome-remove source.pptx --roles header,footer,page-number,rule --output clean.pptx --json
xdoc pptx remap-theme clean.pptx --to corporate-blue --scope text,shapes,tables,charts --output remapped.pptx --dry-run --json
xdoc pptx remap-theme clean.pptx --to corporate-blue --scope text,shapes,tables,charts --output remapped.pptx --json
xdoc pptx chrome-apply remapped.pptx --deckkit mckinsey-blue --output styled.pptx --json
xdoc pptx refurbish-skin --source source.pptx --deckkit mckinsey-blue --output out.pptx --json
xdoc pptx diff --source source.pptx --candidate out.pptx --detail summary --json
xdoc pptx i18n-plan --source source.pptx --units i18n-scan-source.json --data translations.json --json
xdoc pptx i18n-text-plan --source source.pptx --data translations.json --json
xdoc pptx i18n-scan --source source.pptx --source-lang multi --mode source --json
xdoc pptx i18n-scan --source translated.pptx --source-lang multi --mode candidate --json
node <skill-root>/scripts/pptx-nova-i18n-residual-gate.mjs --run-dir <run-dir> --strict --overwrite --json
xdoc pptx replace-text --source source.pptx --data replacements.json --output updated.pptx --json
xdoc pptx replace-chart-text --source source.pptx --data chart-replacements.json --output updated.pptx --visible-cache-only --json
xdoc pptx i18n-style-diff --source source.pptx --candidate translated.pptx --json
xdoc pptx i18n-style-diff --source source.pptx --candidate translated.pptx --allow-text-attrs tooltip,descr,title --json
xdoc pptx vision-diff --source source.pptx --candidate out.pptx --json
xdoc pptx vision-diff --source source.pptx --candidate out.pptx --slides 25-38 --json
xdoc pptx contact-diff --source source.pptx --candidate out.pptx --output <run-dir>/contact-diff.png --json
xdoc pptx contact-diff --source source.pptx --candidate out.pptx --slides 25-38 --output <run-dir>/contact-diff.png --json
node <skill-root>/scripts/pptx-nova-compare.mjs --source source.pptx --candidate translated.pptx --run-dir <run-dir> --kind translation --slide-count <count> --compare-chunk-size 20 --output <run-dir>/translation-compare.png --report <run-dir>/translation-compare.json --dpi 192 --fallback-dpi 144 --json
node <skill-root>/scripts/pptx-nova-compare-gate.mjs --run-dir <run-dir> --final-pptx translated.pptx --kind translation --publish --overwrite --json > <run-dir>/translation-compare-gate.json
node <skill-root>/scripts/pptx-nova-compare.mjs --source source.pptx --candidate refurbished.pptx --run-dir <run-dir> --kind refurbish --slide-count <count> --compare-chunk-size 20 --output <run-dir>/refurbish-compare.png --report <run-dir>/refurbish-compare.json --dpi 192 --fallback-dpi 144 --json
node <skill-root>/scripts/pptx-nova-compare-gate.mjs --run-dir <run-dir> --final-pptx refurbished.pptx --kind refurbish --publish --overwrite --json > <run-dir>/refurbish-compare-gate.json
xdoc pptx refurbish-audit --source source.pptx --final out.pptx --map <run-dir>/reference-map.json --json
xdoc pptx preview out.pptx --output-dir <run-dir>/previews --contact-sheet <run-dir>/previews/contact-sheet.png --overwrite --json
xdoc pptx preview out.pptx --slides 25-38 --output-dir <run-dir>/previews --contact-sheet <run-dir>/previews/contact-sheet.png --overwrite --json
xdoc convert out.pptx --to png -o <run-dir>/previews --overwrite --contact-sheet # fallback/debug only
node <skill-root>/scripts/pptx-nova-clean-open.mjs --pptx out.pptx --output <run-dir>/clean-open.json --json
xdoc check out.pptx --checks fonts,links,compat -o check.json --pretty --overwrite
node <skill-root>/scripts/pptx-nova-feedback-gate.mjs --run-dir <run-dir> --require-feedback --strict --overwrite --json > <run-dir>/feedback-gate.json
```

## Completion Summary

After successfully generating, modifying, exporting, or checking, compress the final response into 4
blocks and avoid dumping the full checklist on the user:

1. **Output**: Absolute path to final PPTX/export file + run directory. For translation/refurbish tasks, list every published compare sibling and its run-directory source. Use the compatible unnumbered PNG for decks up to 20 slides; otherwise list the complete numbered `*-01.png`, `*-02.png`, ... set and manifest. The sibling set must be proven by the corresponding `*-compare-gate.json.status=pass`.
2. **Validation**: One line listing the key gates actually run and their statuses, for example `dry-run pass; apply pass; vision high=0 medium=0; preview reviewed; clean-open not run`.
3. **Evidence**: List only the 3-6 most important artifacts, such as `patch.json`, `vision.json`, preview manifest/contact sheet, `pptx-diff.json`, and `evidence-summary.json`; do not list artifacts that do not exist.
4. **Risks/next steps**: Include only items the user still needs to know, such as clean-open not run, fonts not embedded, external links, unsupported objects, manually unreviewed asset licensing, AI factual assumptions, or no remaining risk.

Add conditional material only when relevant: for high-risk tasks, list `evidence-summary.json` /
`layout-final.json`; for chart/table/XML risk, list the specialized audit; for refurbish/strict template
following, list fidelity/template/content audits; for formal persuasive decks, list the narrative-quality
conclusion; when cleanup occurs, state retained evidence and deleted rebuildable artifacts. When
Feedback Mode triggers, save feedback according to `references/feedback-mode.md` and list the
`skill-feedback.md` path. Show details too only when there are 3 or fewer feedback items; when there are
more than 3, list only the path. Retain `feedback-gate.json` as well. Do not output xdoc version, CLI
schema, or capability-disclosure audit details unless they affect the result, a fallback was used, or
the user explicitly asks.

Only output token information when the platform or tooling provides accurate token statistics; do not
estimate.

## Reference Index

Read the files required by routing first; do not read all references at once.

| File                                      | Purpose                                                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `references/common-workflow.md`           | Run directory, output collision avoidance, artifact retention/cleanup, common workflow                                            |
| `references/deckkit-mode.md`              | DeckKit selection, readiness, content, user-visible examples                                                                      |
| `references/create-express.md`            | Quick deck generation from a simple prompt                                                                                        |
| `references/create-studio.md`             | Confirmation, design lock, and split for high-risk/formal/precision decks                                                         |
| `references/edit-mode.md`                 | Inspect/dry-run/selector workflow for modifying existing PPTX files                                                               |
| `references/edit-contract.md`             | Existing-deck edit scope, source hash, target coverage, locality/style evidence, and final contract gate                          |
| `references/session-rules.md`             | Explicit current-deck future/carryover rules, revision lifecycle, deterministic resolver, and Edit Contract integration           |
| `references/micro-edit-cheatsheet.md`     | Fast path for small text, notes, footer, metadata, and single-object edits                                                        |
| `references/translation-mode.md`          | Existing-PPTX translation, visible text coverage, source-language/target-language comparison, and layout-consistency visual gates |
| `references/feedback-mode.md`             | Skill usage feedback, old-run feedback audit, and feedback persistence rules                                                      |
| `references/template-following.md`        | Strict template following: copy source slides, edit inherited objects, placeholder QA                                             |
| `references/export-and-check.md`          | PDF/PNG/MD/JSON export, extract, check, PPTX semantic diff                                                                        |
| `references/express-mode.md`              | Full golden path for Express mode                                                                                                 |
| `references/reference-create.md`          | Reference PPTX + new outline generation                                                                                           |
| `references/inspect-and-edit.md`          | Selectors, inspect output, and edit details                                                                                       |
| `references/design-lock-and-assets.md`    | `deck_lock.json`, `assets_manifest.json`, check-lock                                                                              |
| `references/narrative-quality.md`         | Deck profile, claim spine, contact-sheet plan, comeback review                                                                    |
| `references/patch-ops-cheatsheet.md`      | Patch op quick reference                                                                                                          |
| `references/animations.md`                | PPTX animation/transition creation, safe edits, preserve-only boundaries, validation                                              |
| `references/recipes.md`                   | Recipe op schema and examples                                                                                                     |
| `references/charts.md`                    | Chart creation/editing and OOXML chart semantics                                                                                  |
| `references/tables.md`                    | Table creation/editing, CSV, formulas                                                                                             |
| `references/formulas.md`                  | LaTeX/math formula strategy and formula assets                                                                                    |
| `references/styles-and-themes.md`         | Colors, gradients, fonts, themes, masters                                                                                         |
| `references/data-driven.md`               | `from-data` and `bind-data`                                                                                                       |
| `references/rich-deck-patterns.md`        | Rich visual patterns when no suitable DeckKit exists                                                                              |
| `references/schema-discovery.md`          | Progressive xdoc schema / dry-run --explain capability discovery                                                                  |
| `references/visual-qa-and-asset-slots.md` | Image slots, AI image prompt guard, P0/P1 QA                                                                                      |
| `references/deck-generator-workflow.md`   | Creating or extending DeckKits                                                                                                    |
| `references/template-library.md`          | Brand/layout/deck/chart/icon catalog fusion                                                                                       |
| `references/resume-split-mode.md`         | Split handoff and resume generation                                                                                               |
| `references/control-flow-and-raw-xml.md`  | `if` / `foreach` / `try` / raw OOXML                                                                                              |
| `references/daemon-sessions.md`           | Daemon tuning and troubleshooting                                                                                                 |
| `references/troubleshooting.md`           | Common errors and automatic repair suggestions                                                                                    |
