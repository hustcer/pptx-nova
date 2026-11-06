# xdoc CLI Changelog

Each release is compared with the preceding `v0.*.*` tag; v0.6.0 uses v0.5.0 as its baseline. Dates are the dates of the commits referenced by the tags.

For Agent workflows, use the installed executable's `xdoc schema` and `xdoc pptx <action> --help` to discover its actual contract. These historical notes highlight migrations, new operations, report changes, and failure boundaries. PDF rendering fixes also affect PPTX PNG previews produced through the PDF pipeline; static previews do not verify animation playback or PowerPoint fidelity.

## v0.20.0 - 2026/11/06

- Corrected `pdf` and `pptx` help routing when options precede the action. For example, `xdoc pdf -i - render --help` returns render help; help before the action, or a lone `-` in the action position, returns command help. Tokens after `--` remain literal, so `--help` there does not prevent execution.
- Unified integer option reads with the command parser and aligned completion handling. Regenerate scripts with `xdoc completions <shell>` (`bash`, `zsh`, or `fish`) after upgrading; Bash falls back to filenames when no command or option matches, while Zsh also supports attached option values and paths containing spaces.
- Restored matching examples in non-minimal operation views, such as `xdoc schema --mode ops --ops set-shape`. The index documents required/optional fields and constraints; request the operation view for its level and full schema. Minimal or explicitly field-filtered views still omit examples.
- Corrected disclosure of existing 3D model host geometry editing: recognized object-mode hosts can move or resize while retaining scene and cached raster content; window-mode resizing requiring a new raster is rejected. Inspect and dry-run the existing host before changing it. Scene, camera, and material authoring remain unsupported.
- Corrected Shape/Text 3D and surface-chart rendering limits to describe the implemented bounded paths. Reading or preserving 3D declarations does not grant a 3D writer; verify important visible results against an independent reference.
- Clarified `patch-ooxml` safety in capability discovery: ordinary raw mutations require `--allow-raw-xml` opt-in and have no source-digest guard. Guarded repairs do not require that opt-in and have action-specific preconditions; existing relationship parts require `expectedPartSha256`, retargeting additionally requires `expectedTarget`, and creating a missing relationship part accepts only add without a part digest. Validation does not establish semantic or visual safety.

## v0.19.0 - 2026/11/05

- Added `xdoc completions <shell>` for Bash, Zsh, and Fish, generated from command/action contracts, option aliases, and supported value choices. The command writes a script to stdout; loading or installing it is a separate shell operation.
- A bare `xdoc` now displays root help. Nested help topics and help requested with an unfinished integer option, such as `xdoc pptx preview --dpi --help`, are handled as discovery requests.
- Hardened integer syntax and overflow checks before dispatch, preserving product-specific range checks and published exit codes. Explicit option intent is taken from supplied arguments rather than parser defaults.
- Improved default conversion routing for leading options and literal filenames, including filenames resembling command names. Use `--` for literal operands that could otherwise be interpreted as flags.
- Restricted single-value operands such as the daemon action and completion shell to one value; remove surplus operands instead of retrying an unchanged argument error.

## v0.18.0 - 2026/11/02

- Corrected projected and top-view surface rendering for continuous gradients, alpha, lighting, reflections, camera transforms, category slots, and reversed category/depth axes. PDF rendering reuses gradient resources within each chart.
- Corrected ordinary 3D chart axis origins and category crossings, authored axis pens, deleted frame strokes, negative bar colors, and accumulation of imported stacked line ribbons.
- Adjusted automatic 3D plot fitting and surface legend rows. Re-render affected charts before retaining manual camera, axis, or label workarounds; compare the actual chart with a reference when fidelity matters.
- Restored native size optimization and kept Linux x64 release builds and packaged-executable checks on the Ubuntu 24.04 baseline.

## v0.17.0 - 2026/10/28

- Improved automatic 3D plot fitting, surface legends, tick density, and label rotation using projected reading space. Restored legacy automatic dark chart backgrounds and retained dark chart text.
- Corrected categorical label sides, horizontal bar titles and tick density, compact histogram boundary labels, logarithmic contour band density, and signed area profiles and negative domains.
- Preserved distributed text alignment and inherited Latin word-break policy, and improved table-cell paragraph layout and scaled arrowheads. Recheck wrapping and line boundaries in affected PDF/PNG output.
- Improved picture handling for supported RGB/RGBA TIFF assets, EMF alpha bitmaps, direct picture fills, and embedded SVG raster images; retained authored text frames and corrected symbol colors and mappings.
- Reduced native font discovery I/O by reading font metadata without loading complete font files during discovery.

## v0.16.0 - 2026/10/26

- Added `xdoc pptx set-font deck.pptx --chinese "Font Family" --output normalized.pptx` and the `set-font` patch operation. Choose exactly one of `--chinese` and `--east-asian`; use `--dry-run --json` to examine selections before publication.
- Chinese font selection follows inherited language and Han-text evidence while preserving Japanese/Korean text; normalization covers supported native text, table, chart, and theme font slots. Review `selectionStatus`, `inferredSelections`, `ambiguousSelections`, and `findings`: `fontAvailability` and `visualFit` remain `not-evaluated`, so preview the result.
- Preserved opaque extension payloads during font edits and language inference, and reused style snapshots during normalization.
- Corrected surface fill/outline ownership, wireframe and automatic pens, legacy gray palettes, edge-on mesh outlines, and independent axis crossings. Area paint is clipped and true out-of-range line markers are suppressed while near-boundary markers are retained.
- Improved horizontal category label fitting and explicit label spacing after plot reservations; retained ordinary-shape no-fill inheritance and direct-fill overrides.

## v0.15.0 - 2026/10/24

- Improved column, line, area, and horizontal chart label fitting, automatic narrow positive/logarithmic domains, ticks anchored to explicit bounds, and signed percentage area/3D stacks. Category abbreviation retains the underlying source labels and data positions.
- Corrected grouped text transforms and reflections, SmartArt rendering, complete glyph outlines, and legacy symbol blanks in PDF output. Review affected pages before applying additional geometry or font substitutions.
- New standard and exploded doughnut charts explicitly write a hole size of 50. Use `set-chart.plot.holeSize` to change it; 50 is the xdoc authoring default.
- Explicit doughnut data-label positions are rejected. Omit the position field and use the supported chart defaults rather than supplying a position intended for another chart family.

## v0.13.0 - 2026/10/20

- Improved PDF text tabs, saved glyph sizing, language-based font fallback, and vertical anchors for shape autofit. Corrected merged table anchors and MathType baseline handling.
- Corrected EMF picture/font semantics and WMF text alignment, viewport mapping, and font sizing under mirrored coordinates.
- Corrected contour chart geometry and lighting, and no-fill style-reference parsing. Regenerate previews of affected imported artwork and charts before deciding whether content needs editing.

## v0.12.5 - 2026/10/18

- Added `pptx apply --detail summary`, including dry runs, to limit report size. Semantic before/after strings over 1024 UTF-8 bytes are replaced with `valueSummaries` containing their JSON Pointer, byte count, SHA-256, and a preview of at most 128 Unicode scalars. Full remains the default; patches, candidate validation, and sidecars retain complete values.
- Improved daemon responsiveness through cooperative inspection, patch execution, conformance checks, and audits, while retaining serialized mutation and failure atomicity. Reused scoped theme data, byte-budgeted inspect reports, and exact-input baseline audits.
- Reloaded input bytes after external same-inode writes and serialized cold inspect model construction to bound concurrent memory. Cache hits can bypass the work lock.
- Changed large daemon response buffering to avoid repeated full-prefix copies, preserving response decoding/error behavior. Session removal also releases derived caches; existing daemon workflows can benefit without changing their report consumers.

## v0.12.3 - 2026/10/17

- Added `textLayout` to `set-run` and `replace-paragraph-text`; other text operations do not accept it. The default `respect-autofit` keeps normal authoring behavior. Both translation patch serializers explicitly emit `preserve-geometry` to retain stored coordinates, sizes, and autofit settings without requesting new implicit reflow.
- A reflow already pending for the shape, from explicit autofit or an earlier ordinary edit, still measures the final text. `preserve-geometry` does not cancel that request or guarantee text fit; inspect overflow and preview the translated deck.
- Reduced repeated XML parsing during text reflow while retaining candidate validation and atomic failure handling.

## v0.12.2 - 2026/10/16

- Applied caller intent and strict authorization constraints to PPTX slide previews through PNG conversion. Use `--require-entitlement` and `--require-unwatermarked` when required, or an explicit `--intent` document instead of those flags; argument failures are resolved before creating preview output.
- Disclosed the two modes in help and schema: ordinary slide preview binds to `convert/png`; `preview --layout` also creates an editable candidate, uses its admitted `modify/pptx` intent, and carries those frozen constraints into PNG rendering. Choose the binding for the requested mode rather than assuming every preview is an authorization-free read.

## v0.12.0 - 2026/10/16

- Improved slide-copy preservation of presentation text defaults, language, and selected slide navigation; isolated copied chart data and notes, and SmartArt data during shape duplication. Preflight and execution now share inherited-text preparation, so unsupported inherited relationships are reported before allocation.
- Resolved connector bindings from native preset/custom geometry. Each `add-connector` endpoint requires either both coordinates or a shape/site binding; a binding takes precedence over fallback coordinates. Improved group/connector geometry and synchronized existing model-host fallback bounds.
- Corrected OLE preview identities and displayed bounds, and removed unreferenced OLE relationships on removal. Ungrouping that would discard alternate content is rejected before mutation.
- Added `patch-ooxml` action `repair-preset-adjustments` for explicitly adopted, unambiguous constant-guide repairs. Supply the unchanged `expectedPartSha256` and explicit `repairs`; unknown or ambiguous content is rejected. The shared element-repair definition also supports an optional element digest for child-order repair.
- Tightened authoring validation: layout types use canonical tokens such as `cust`; ordinary slide placeholders reject notes/handout-only `hdr` and `sldImg`; invalid underline values, explicit area-chart label positions, and duplicate XML attributes are rejected. Refresh generated patches against the installed operation schemas before retrying.
- Improved chart title font updates and classic chart palette ownership, and PDF output for hierarchy text, surface outlines/height/intervals, error labels, automatic negative/zero ceilings, legend wrapping, and numerical precision.
- Reduced visual-audit false positives by excluding invisible/clip-only text and synthetic chart positioning frames from authored-frame checks while retaining visible glyph checks.

## v0.11.0 - 2026/10/14

- Added focused discovery: use `xdoc schema --command pptx.preview` for one command/action, `--report pptx-diff/v1` for one report, or `--mode capabilities` for a workflow inventory. Command/report slices include transitive root schema references and a full-contract `schemaDigest`; the inventory is not a validation schema. Command/report selectors cannot be combined with operation-mode selectors.
- Added `--field-date YYYY-MM-DD` and `XDOC_FIELD_DATE` to freeze dynamic document date fields for reproducible renders; the flag takes precedence. Render context is recorded in reports/manifests and does not change authorization time. Native bitmap cache identities are bound to actual PDF SHA-256 content.
- `pptx diff before.pptx after.pptx --json --output evidence.json` now retains full evidence from the same comparison even when stdout is a summary. Reports include input hashes and `fullEvidence` path/hash metadata. Existing evidence is left untouched: choose a new output path; this action does not accept `--overwrite`.
- Updated authorization discovery to `commands.auth.subcommands.<action>.ioContract.stdout.schemaRef` and root report references, replacing the former auth report locations. Comparison schemas now accept signed extents and describe typed summary/full structures. Refresh cached schemas; historical sidecar report objects remain embedded historical data.
- Improved PDF charts for histogram bins/counts/palettes, axis titles, hierarchy labels, negative headroom, logarithmic/reversed surfaces, 3D bar defaults, marker inheritance, and number formats with literal affixes and General sections.
- Corrected text decorations, list marker paint, grouped/overflow text geometry, regional table borders, per-picture opacity/outlines, raster tiles, short/curved endpoint markers, non-scaling SVG strokes, formulas, and complete emoji-cluster fallback. Preserved cached SmartArt text frames and margins during host reflow.
- Updated demo watermark wording to `structurify.io`. Watermarked output remains demo output; a visual comparison must account for that visible change.

## v0.10.0 - 2026/10/11

- Improved radar scale/legends, blank contributions in stacked lines, rounded SVG clips, blurred shape reflections, gradient weights, pattern/picture fill coordinates, and depth-axis font coverage in PDF output.
- Preserved explicit formula limit placement, inherited text numbering/styles, and preset arc angles on unequal ellipses.
- Improved cached pyramid fitting only for admitted complete layouts; conditional child layouts and unsupported cases retain cached geometry. Re-render resized diagrams to decide whether any manual layout adjustment is still necessary.

## v0.9.0 - 2026/10/09

- Preserved multi-column shape text and grew overflowing PDF text columns to a shared height. Retained line-break controls and authored ASCII-hyphen break opportunities; recheck long text and column admission before changing font sizes.
- Resolved shared table borders once and corrected their paint order, avoiding conflicting cell-edge rendering.
- Corrected automatic chart domains and horizontal 3D bar axes/series geometry, and reflowed supported cached SmartArt when its host is resized.
- Preserved authored fonts in plain text boxes and explicit placeholder identities during parsing.

## v0.8.0 - 2026/10/08

- `pptx inspect` now aggregates logical animation effects at effect boundaries, retaining all shape targets and raw source metadata and reporting unattributed timing separately. Use the returned effect IDs and editability diagnostics when planning updates; logical effect counts do not establish safe mergeability.
- Extended `set-slide-animations` with fixed whole-shape `box` and `dissolve` entrance/exit profiles and finite modifiers. Direction, paragraph/level builds, and indefinite repeat are outside these profiles; inspect imported variants before attempting stable-ID edits.
- Hardened safe-edit checks for complete timing sequences, duplicate IDs, surviving time-node references, wrapped/foreign/multiple timing carriers, and group compatibility. Unsupported carriers remain preserve-only; rejected shape removal and animation edits do not publish partial mutations.
- Preserved timing coordinates, conditions, exit boundaries, and unrelated extension metadata during supported edits, and restored native SmartArt hierarchy spacing.

## v0.7.0 - 2026/10/06

- **Migration:** `convert`, `extract`, and `check` use `--slides`/`-s`; the singular `--slide` is removed. Font `letterSpacing` now requires an explicit point string, such as `"1.25pt"`, or null to clear the local value. Numeric raw values are rejected; decimal values round to centipoints with exact halves away from zero.
- Resolved `slide-copy` and `apply-brand` inputs by argument position rather than equality with option values. Supply the target/input once, either positionally or with `--input`; duplicate or empty identities are rejected.
- Sidecar paths must differ from inputs and the primary PPTX, including aliases, and existing sidecars require `--overwrite`. If a late sidecar write fails, inspect `primaryOutputPublished`, `outputUntouched`, `output`, and `blockedOutput` before recovery: the primary output may already exist, and publication is not a two-file transaction.
- Preserved symlink/parent traversal semantics within asset containment checks and literal backslashes in POSIX output paths, including newly created parent directories.
- Clarified that an explicit no-fill background stops inheritance. Improved PDF rendering of stock/bubble/hierarchy charts, deleted and percentage labels, supported uncached SmartArt processes and organization layouts, authored audio icons, implicit kerning, text gradients/glow/reflections, shape effects, and bounded 3D projection.

## v0.6.1 - 2026/10/01

- Materialized requested shape autofit during native authoring using resolved font metrics. Supported horizontal single-column rectangular frames preserve constrained width and anchors; unsupported requested layouts or missing glyph metrics fail atomically, including dry runs. Untouched imported frames and theme-remap geometry stay preserved.
- Guarded `set-run` operations carrying `sourceText`, `sourceHash`, or `unitId` require a stable UInt32 shape ID from inspect, not a name/query or array index. Errors distinguish selector prerequisites from stale-content conflicts and expose `field`, `reason`, `opIndex`, and optional `unitId` details.
- Guarded text edits must be top-level operations: reached nested guarded `set-run` and nested `replace-paragraph-text` fail before mutation, including macro/loop/recipe expansion. Unguarded nested edits and normal unchosen-branch/try behavior remain supported; place translation guards in top-level `ops`.
- Routed path-backed patch assets through a bounded canonical-root reader and tightened missing/symlink/root-change diagnostics. Keep assets inside the admitted root and resolve path errors before retrying publication.
- Preserved slide-owned SmartArt identities during copying, encoded histogram bin values for Office, corrected table RGB styles/banding and WMF ellipse centers, and improved Office font resolution and exact font-collection face matching. Invalid text box lengths now identify the failing field more precisely.

## v0.6.0 - 2026/09/29

- **Migration:** use `--to md`, `--to text`, and `--checks compat`; the retired `markdown`, `txt`, and `compatibility` tokens are rejected.
- Replaced `add-freeform`'s points/scale representation with explicit `x/y/w/h` and a local `path` viewport containing integer `move`, `line`, `cubic`, and optional `close` commands. Inspect exposes modeled paths and semantic diff detects control-point changes; unmodeled geometry remains preserve-only. SVG strings, quadratic/arc commands, clipping, and automatic fitting are outside this contract.
- Added sparse `font.kern` point thresholds across supported text/table/chart targets, including direct/effective inspection. Use a point string from `0pt` through `4000pt`, or clear the local value to inherit; actual kerning depends on the font and renderer, and zero does not guarantee enabled kerning.
- Added inspection and preservation of local shape/group/text-body 3D declarations with owner identity, raw units, and diagnostics. Added bounded surface, bevel/extrusion, lighting, and text-shadow rendering paths; declaration recognition does not enable 3D authoring or complete Office visual parity.
- Extended `set-slide-animations` with finite grow/shrink, signed spin, native fly, and straight motion-path profiles. Supply the effect-specific scale, degrees, or slide-fraction offset; omit `effect` on timing-only stable-ID updates to preserve amplitude. Imported complex timing remains preserve-only.
- Extended `set-slide-transition` with 19 additional P14 types and type-specific parameter validation, including honeycomb, flash, directional families, ripple, glitter, shred, flythrough, reveal, prism, and wheel-reverse. Query each type's parameters before generation; inspection retains raw/provenance diagnostics and full UInt32 `advanceAfterMs`. Authoring, preservation, and playback coverage are separate capabilities.
- Improved OPC-based part/theme resolution, including nonstandard paths, and added full-package integrity facts to compatibility preflight. Read `checks.compat.details.packageIntegrity.scanStatus`, `passed`, and nullable `issueCount`; Markup Compatibility readability alone does not certify package/schema validity.
- Bound translation planning and anchor drafting to the source package's ordered slide parts. Shape text-plan units must retain the scan's non-empty top-level `part`; do not infer it from slide numbers or candidate filenames. Stale part identities, including equal-text slide reorders, are rejected before planning artifacts are written; rescan the changed source before rebuilding a plan.
- Improved slide-copy owner isolation, shared-image cleanup on shape removal, and layout-copy preflight. `set-theme` finds ordinary themes by OPC content type while preserving theme overrides and explicit object formatting.
- Corrected PDF chart data/labels/layouts, SVG Unicode/strokes/clipping, picture/pattern/gradient fills, table geometry/borders, mixed-script text and overflow, formulas, video posters, EMF/WMF artwork, shadows, and bounded 3D surfaces. Preview fixes apply to the supported cases; use independent visual evidence for important delivery decisions.
