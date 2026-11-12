# Xdoc CLI CHANGELOG

Each release is compared with the preceding `v0.*.*` tag. Dates are the dates of the commits referenced by the tags.

For current Agent workflows, use the installed executable's `xdoc schema` and `xdoc pptx <action> --help` to discover its actual contract. Names and examples below describe each historical release; follow later migration entries when upgrading. These notes highlight migrations, new operations, report changes, and failure boundaries. PDF rendering fixes also affect PPTX PNG previews produced through the PDF pipeline; static previews do not verify animation playback or PowerPoint fidelity.

## v0.21.0 - 2026/11/06

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

## v0.5.0 - 2026/09/11

- Added ISO Strict support when reading namespaces and relationships, including Strict percentage values and renamed/default namespace prefixes. Parsing, inspection, editing, and compatibility checks use the same namespace identities.
- Inspect now reports `presentation.conformance`; compatibility preflight reports conformance separately from readability. Existing relationship spellings are retained. New content uses Transitional forms and can make a Strict package mixed; inspect the result when conformance matters.
- Added `part-graph` findings for invalid part relationships, missing required parts, forbidden duplicates, content types, and data references. Apply/dry-run report newly introduced issues; full semantic/vision checks report remaining package issues. These findings do not automatically repair the file.
- Corrected repeated core-properties relationship creation for package-absolute targets and reduced avoidable contract, border, and SVG allocations.

## v0.3.12 - 2026/09/10

- Added `xdoc auth install license.json`, `auth status`, `auth uninstall`, and `auth reset-clock`. Installation validates and publishes the same captured license bytes. A late failure can report uncertain publication, so check the result before retrying. Status reports credential health, with `taskAuthorization: not-evaluated`; it does not authorize a document task.
- Enabled a permission-restricted file clock for production use with non-device-bound offline Licenses. The file state is unauthenticated: device-bound credentials remain rejected, and saving it does not establish trusted time for the expiry of signed restriction policies. Resetting it is a recovery action, not an authorization override.
- Raised the Free/trial compressed PPTX input limit from 3 MiB to an inclusive 5,242,880 bytes, retaining the 10-slide limit. Existing signed limits, unlimited entitlements, and the older default for omitted signed fields retain their own semantics. Read the task decision rather than inferring limits from a plan label.
- Tightened authorization options for supported PPTX actions, including explicit intent validation during dry-run. JSON-RPC and MCP apply now accept Feature Intent objects. Intent must match the action/output and cannot be combined with the convenience authorization flags. JSON-RPC can also retrieve schema in the same session.
- Captured patch requests before execution, detecting duplicate keys and recording canonical request identity, input-byte identity, and source locations. CLI, stdio, and daemon execution share asset preparation while retaining the client's asset root and stricter resource limits.
- Separated suggestions that replace a request from repairs that apply to a document, binding each to its intended input and bytes. Follow the returned target and revalidate before execution. Unavailable identity/context or an exhausted budget produces a reason instead of an executable repair. Executable repair payloads share a 1 MiB compact UTF-8 budget per report; this is not a total report-size limit.
- Tightened chart and control-flow inputs: `add-chart.kind` determines the `dataEx` shape, hierarchy replacements must match the existing chart kind, and conditions accept only their declared operators/fields. Retired chart discriminants, combo values, gradient keys, and singular/null trendline forms are rejected. Refresh patches against the installed schemas.
- Unified `select` bounding-box lengths with explicit-unit patch lengths and retained exact integer EMU echoes. Missing/unknown bounding-box fields and negative radii are argument failures; echoed EMU numbers are output facts, not accepted unitless length inputs.
- Added shared Markup Compatibility evaluation for Choice/Fallback selection, scoped namespaces, and extension directives, while retaining the original XML branches. Preflight distinguishes Office-version support from what the parser understands; blocked content can return diagnostics without a parsed model. Readability alone does not certify rendering.
- Published complete schemas for nested operation, creation, i18n, replacement, vision-diff, and runtime-error reports. PDF actions share option/help definitions and reject inapplicable options or malformed integers before file access or output. Invalid boolean configuration returns a structured failure instead of aborting.
- Replaced `created`/`createdIds` with `createdObjects`, describing object kind, slide-scoped shape identity, parent shape IDs, and layout indexes where applicable. Update report consumers; historical reports embedded in sidecars retain their old shape.

## v0.3.11 - 2026/09/04

- Enabled local Free editable PPTX output for translation and refurbishment, using ordinary content watermarks. These Free outputs no longer require a provenance signer. Signed trial credentials and documents with existing signed watermark requirements keep their separate signature/preservation rules.
- Defined task input bytes as the sum of captured primary and secondary-source compressed PPTX files. Identical path strings count once; different aliases count separately. Patch/data/bindings files and image/video/OLE assets are excluded from this entitlement total but retain their own resource limits.
- Hardened clock, revocation-receipt, device-identity proof, and multi-credential checks before execution and at final output. PDF/PNG handoff revalidates credential sources and bindings. This does not add a live online lease, renewal, or signing service.
- Standalone production rejects commercial credentials when its required trusted clock is unavailable; Free remains available. File permissions alone are not treated as a trusted clock anchor. v0.3.12 subsequently enables a narrower offline path.
- Rejected development issuers in production authorization and tightened provenance response bounds and output-boundary checks. Credential diagnostics are not a substitute for task authorization.
- Set the macOS native release deployment target to 13.0 and added packaged-binary metadata/symbol checks for that baseline.

## v0.3.10 - 2026/08/29

- Added `--to pptx`, `--to pdf`, and `--to png` to `replace-text`, `replace-chart-text`, and `refurbish-skin`; editable PPTX remains the default. For PNG, `--output` names an output directory. PDF/PNG export does not publish an editable candidate deck.
- PDF/PNG export uses conversion authorization and watermark handling, including inherited signed watermark requirements. In this release, editable translation/refurbishment tasks needing a new provenance signature still return `provenance_signer_required`. Selecting another format still requires authorization for that output.
- `visual-audit` now authorizes its evidence rendering as a measured convert task and requires unwatermarked output. Free or other watermarked modes fail before evidence publication. This action does not expose the ordinary strict/fallback flags; follow its credential-specific denial rather than retrying with unsupported switches.
- Aligned CLI/Viewer credential diagnostics with their respective schemas and kept credential health separate from task permission. Added bounded provenance transport code without installing a production signer; its presence is not an available online service.

## v0.3.9 - 2026/08/24

- Migrated signed watermark requirements (Watermark Obligations) to the `/v2` hash-then-sign profile, without retaining the earlier obligation signature format. CLI License signatures keep their existing profile. Use the disclosed version and signing rules when verifying either document type.
- Tightened provenance request/response binding, envelope construction, malformed-input limits, and signing-core disclosure. The signing service remains reserved and not connected to the CLI host; tasks requiring new signatures still fail closed.
- Corrected Markdown export reading order, math symbols, and prose escaping. Regenerate affected exports before adding downstream text-reordering or escaping workarounds.

## v0.3.8 - 2026/08/20

- Unified editable PPTX writing around checks before execution and publication: capture inputs, measure the candidate, recheck limits, and write required watermarks. Daemon apply now performs the same final-output checks, including limits on slides added by a patch.
- Added local handling of signed watermark requirements: verify document metadata, preserve permitted signed envelopes exactly, and reject tampered, unverifiable, or unsafe rewrite/import cases. Existing requirements also follow PDF/PNG export and can require a watermark despite an otherwise unwatermarked entitlement.
- Tasks requiring a new obligation signature return `provenance_signer_required` before publication because production has no installed signer. Inspect the actual denial and preservation plan; do not remove carrier metadata to retry.
- Checked caller intent against the actual action to prevent unrelated entitlement substitution. Schema now identifies `preview --layout` as an editable product write through `productWriteCondition`. The daemon independently validates the caller's intent and execution context.
- Hardened malformed/ambiguous authorization and watermark JSON handling. Cancellation is delivered after protected publication work completes. Quality checks exclude the product's reserved Free marker shapes from user-content findings; the marker can still affect rendered comparisons.

## v0.3.7 - 2026/08/17

- Added task authorization to PPTX conversion and writing, with signed CLI credential verification and a watermarked Free limit of 3,145,728 input bytes and 10 slides. Use `--require-entitlement` or `--require-unwatermarked` for strict requirements, or `--allow-fallback` when automation permits Free fallback. Supported PPTX writes also accept `--intent`; it carries its own constraints and cannot be combined with those flags. `convert` does not accept `--intent`.
- Added PPTX/resource limit checks and stricter production trust, signed restriction-policy, and output rules. Schema exposes these through `authContract`; credential metadata or a successful dry run does not grant permission to publish output.
- Added `xdoc auth verify --license license.json` for CLI credential diagnostics, reporting verification outcome and trusted facts. A verified credential still needs to authorize the requested task and output.
- **Input migration:** patches require `schemaVersion: "pptx-patch/v1"`; recipes require `schemaVersion: "pptx-recipe/v1"`. Earlier integer or omitted versions are rejected. General lengths require unit strings such as `"12pt"` or `"1in"`. The separate numeric font-spacing compatibility form remains until v0.7.0.
- **Action migration:** `visual-verify` became `visual-audit`, `copy-from` became `slide-copy` with report `pptx-slide-copy/v1`, `from-data` became `template-fill`, and `list-themes` moved to `catalog themes`. Retired action names are rejected.
- **Option migration:** use `--units-file` and `--unit-id` instead of `--units` and `--unit`. Theme/style packs use `--theme`/`--style`; the donor deck uses `--source`. Recipes use `--recipe`, template bindings use `--bindings`, and `--patch` is reserved for apply.
- **Output migration:** `convert`, `html2md`, `extract`, and `check` use `--output-dir` instead of `--out-dir`. Preview requires `--output-dir` and rejects its old `--output` alias; `import-template` also uses `--output-dir`. Preview's `--contact-sheet` is now boolean and its path moves to `--contact-output`. Discover each action's `outputKind` before choosing output flags.
- **Index migration:** CLI `--layout`, `--from-slide`, and `--to-slide` are now 1-based, and slide copying uses 1-based `--slides` or `--all` instead of its old 0-based `--slide`. Patch indexes remain 0-based; placeholder `idx` is an OOXML identity, not a position.
- **Patch field migration:** use `add-shape.kind` instead of `preset`, transition `kind` instead of `type`, font `language` instead of `lang`, and `letterSpacing` for run tracking. Layout-placeholder styling uses `font.size`/`font.color` and `lineSpacing`; table fields spell out `columns`, `column`, `startColumn`, and `endColumn`. MIME fields use `mimeType`, `iconMimeType`, and `posterFrameMimeType`.
- **Report migration:** top-level `status` describes command completion (`success|error`); gate/audit verdicts use `outcome`. Shared PPTX failures use `pptx-error/v1`, `error.code`, and `suggestions[]`. Semantic/contact/refurbish comparisons use `baseline`/`target` path, identity, and count names. Read `agentGate.semanticStatus`; duplicated counts and policy prose have been removed from diff reports.
- **Discovery migration:** select `--mode index`, `--mode ops`, `--mode examples`, or `--mode full` with `xdoc schema`; `--ops` and `--fields` belong to ops mode, and `--defs` requires a field projection. Earlier `--index`, `--examples`, and `--op` flags are removed. RPC discovery uses `xdoc.capabilities` and `xdoc.schema`. PDF `render`, executable since v0.2.3, now has an explicitly declared subcommand contract.
- Replaced `--verbose` with `--log-level` (`trace`, `debug`, `info`, `warn`, or `error`), retaining `--quiet` as error-level shorthand. Renamed limit settings to `XDOC_MAX_*`, scoped HTML settings by purpose, and fixed daemon connections to loopback with port configuration. Check the environment contract when migrating old configuration.
- Made `--checks all` include accessibility while retaining the declared ordinary default check set. Capability outputs now separate `convertTargets`, `extractParts`, and `diagnostics`; document kinds carry status records. Reserved/future entries are not executable support.

## v0.3.6 - 2026/08/11

- Added `xdoc mcp` over stdio with protocol negotiation, schema discovery, and inspection/apply tools using the shared Agent dispatcher. Read the advertised tool schemas and negotiated version; reserve stdout for protocol messages.
- Added bounded daemon connections, separate data/control loopback ports, per-session FIFO work, and stopping/draining states. Filesystem aliases share session history. Shutdown and cancelled refreshes release session resources; inspect lifecycle status before retrying or using an allowed one-shot fallback.
- Completed cross-deck template registration for `copy-from`: `register-source` retains source layout/master/theme inheritance; `rebind-target` explicitly selects target inheritance. Inspect the dependency fingerprints with `--dry-run --json` and use `--size-strategy require-match`. Layout previews retain a one-slide candidate for review.
- Added Morph authoring and `morph-check` for exact case-sensitive `!!` name pairing. Authoring, pairing diagnostics, and fallback preservation do not establish implicit PowerPoint matching or in-house Morph playback. Pair/layout CLI indexes were still 0-based here and migrate in v0.3.7.
- Added animation timing modifiers and separate capability fields for creation, editing, inspection, preservation, rendering, and verification. Check the relevant field and its limits: recognizing an effect does not establish that it can be edited or played.
- Added schema-backed `xdoc pptx <action> --help` for action usage, options, and examples, with safer help handling before execution.
- Remote-font disabling now blocks Google Fonts CSS/binary requests while retaining local caches, system/Office fonts, and explicit font URLs. Added process-local font inventory caching and strict boolean parsing, and centralized native license discovery.

## v0.3.5 - 2026/08/05

- Added `xdoc json-rpc` with newline-delimited JSON, frame limits, progress, cancellation, and shutdown support. It shares PPTX operations/reports with the daemon. Keep the process alive for session reuse and use request IDs for mutations: notifications receive no reply, while rejected notifications are logged on stderr.
- Added read-only cross-deck copy preflight with dependency/registration evidence before writing. Use the preflight to identify incompatible layouts, masters, themes, or slide sizes before attempting a structural copy.
- Added `set-chart.view3D` scene authoring and PDF projection for supported legacy 3D bar, line, area, pie, and surface charts, plus contour rendering and axis tick marks. Inspect explicit scene settings and compare affected previews against a reference; camera/material/layout support remains bounded.
- Added `set-image` preset masks, shape picture fills, text-frame margins/anchor/wrapping, script-aware font patches, and shape title/description/decorative metadata. Fields differ in how omission and null behave; use each field's schema when preserving or clearing local settings.
- Added opt-in `xdoc check --checks a11y` for accessibility findings, with slide-scoped findings and deck-wide coverage. It is outside `--checks all` in this release. Description suggestions use `patchTemplate` placeholders that need authored text before applying; unresolved background contrast remains inconclusive.
- Centralized environment parsing and clarified blank/path rules, preserved grouped contrast evidence, rejected unsupported group formatting, and improved picture-fill rendering and 3D chart geometry/paint.
- Daemon state now identifies its process and CLI revision; foreign-revision sessions report stale and can be retired before reuse. Check the lifecycle report rather than assuming an unreachable daemon is stopped.

## v0.3.3 - 2026/07/30

- Added `pptx visual-verify` to collect a structured evidence manifest and PDF/PNG artifacts, separate command completion from check results, and reject incomplete raster output. Same-renderer comparisons support regression review, not independent Office fidelity claims. The action is renamed in v0.3.7.
- Added read-only `i18n-anchor-draft` for mixed-style planning blockers. Review ordered, unique, high-confidence anchors, merge approved draft translations by unit ID, and rerun the planner; drafts are not executable patches.
- Added capability descriptions by feature/subset, with limits, evidence, associated operations, and recommendations. Use the declared subset when choosing an operation; partial or preserve-only support does not imply full authoring support.
- Added explicit date-axis chart creation using Excel 1900 date semantics and materialization of supported ChartEx titles. Improved ordered multi-slide copying with transactional dependency reports and contrast/chrome collision handling.

## v0.3.2 - 2026/07/28

- Added staged delivery with payload checks before replacing output files, including PNG signatures/dimensions, page counts, and safe filenames. Reports also use staged writes. Build and batch reports now record PDFium provider/version/commit/hash/link mode to help reproduce rendering differences.
- Added static PDFium linking and release bundling support. Inspect the packaged build's PDFium provenance rather than assuming an external runtime library is required.
- Added guarded `patch-ooxml` relationship repair and more checks across package parts. Apply the returned repairs with their source preconditions; stale or structurally invalid proposals are rejected.
- Added date-axis time units, ordered trendline collections and labels, chart color styles, and ChartEx data-label/font edits. Ambiguous label scopes are rejected; classic and extended chart options retain separate applicability rules.
- Added SmartArt semantic summaries to inspect and explicit embedded-workbook coverage in translation gates. Visible chart-text replacement does not prove workbook synchronization; review any workbook-dependent residual separately.

## v0.3.1 - 2026/07/24

- Added Office-version compatibility checks with `--target-office`, including namespace availability, Markup Compatibility fallbacks, and structured results. Inspect the selected target and fallback evidence; version availability does not certify rendering.
- Added guarded `patch-ooxml` action `repair-child-order` for provable ordering violations, using part/rule hashes and element paths. It does not require raw XML opt-in, but rejects stale state, unknown extensions, ambiguous alternate content, and choice/cardinality conflicts. Rerun the check to obtain a fresh repair if its source has changed.
- Expanded XML child-element and semantic checks and deterministic repair suggestions. Writes distinguish new issues from existing baseline issues; a successful unrelated edit does not certify the original package clean.
- Expanded chart authoring/rendering for axis titles/ticks/gridlines, display units, trendlines, error bars, data tables, blank handling, and no-fill semantics. Unsupported date-axis tick-skip setters are rejected.
- Used rendered frame-fit evidence to downgrade applicable estimator-only overflow findings and added optional cached Agent review contact sheets. Retain actual rendered evidence when deciding whether an estimated overflow requires editing.

## v0.3.0 - 2026/07/21

- **Migration:** standardized patch operation/field names and rejected legacy aliases. This release requires integer `schemaVersion: 1`; v0.3.7 later requires a string version. Refresh patches from the operation schema before replaying older inputs.
- Centralized patch definitions and extended existing schema queries with `--fields` and `--defs summary|full`. Summary definitions help discover fields; request full referenced definitions or run dry-run to validate nested inputs.
- Control-flow operations now evaluate against the document being edited, including substitutions and recoverable branches. Added stricter chart-target and duplicate-target checks; compiling a recipe remains a separate static step.
- Added checks for attribute bounds, XML child order, relationships/content types, and semantic issues during writing. Some out-of-range values return a validated clamp/wrap `fixPatch` suggestion. Use the returned proposal and revalidate; cases without a definite valid repair remain rejected.
- Made `i18n-scan --mode candidate` an authoritative target-consistency check using source units and translations: each resolved current text must equal its target text. It no longer uses language guessing as the candidate verdict. In this version candidate mode requires `--units` and `--data` and rejects source-language/slide filters.
- Added compact persisted scan/plan workflows: `--output` retains the full report, `--json` returns a compact result, and `--json-full` is for complete stdout output. Explicitly approved review units can enter planning; a completed candidate report with blockers still fails its delivery gate.
- Preserved structured paragraph boundaries, inventoried short/generated chart titles, and improved target-segment repair information. Added rendered text/chart collision evidence, source slide numbers and input hashes to comparisons, scoped bitmap caching, and large-deck refurbishment support.
- Fixed `XDOC_FONT_CACHE` use and repeated font-discovery blocking, added scoped read-only inspection caches, and corrected percentage line spacing, connector/symbol rendering, and theme remapping that previously introduced outlines.

## v0.2.9 - 2026/07/12

- Expanded translation inventory/planning for table paragraphs, unmatched runs, uncertain chart text, ChartEx labels, and segmented replacements. Preserve the inventory's selectors and review uncertain units instead of dropping unrecognized text.
- Added configurable `--dpi` to `contact-diff`, atomic image publication, and structured render failures. Read the report before reusing an output after a failed comparison; unsupported actions reject the contact-diff-only DPI option.
- Corrected sparse chart point identities/styles, stacked bar/column and per-point labels, horizontal axes, bubble labels, and table fills/borders/row sizing. Improved slide/layout stacking order, cached SmartArt connectors, callout insets, and offline font fallback in PDF output.
- Tightened table-style identifiers and output-race handling. Re-render affected decks before compensating for old chart, layering, or font-metric defects in authored content.

## v0.2.8 - 2026/07/05

- Added `i18n-scan`, `i18n-plan`, and `i18n-text-plan`, including mixed-source-language scans. Build translations from `i18nUnits` identities and source hashes, retain units marked for preservation, and review ambiguous units before translating them.
- Added `replace-text` for guarded changes to existing OOXML text nodes/attributes without rebuilding paragraph/run structure, and `replace-chart-text --visible-cache-only` for chart-visible text. The latter does not update embedded workbooks, relationships, external paths, or number-format codes.
- Added `i18n-style-diff` to distinguish text changes, explicitly allowed text-attribute changes, style blockers, and layout repairs. Use it after editing; a successful text replacement alone does not prove visual preservation.
- Compared vision findings against a source baseline and added scoped contact-diff checks, reporting remaining deck risk outside the selected slides. A successful slide-pair integrity check still needs visual review.
- Improved multi-column overflow diagnostics, ChartEx text coverage, and output-exists recovery. Generated retry arguments retain the original comparison options; review them before permitting overwrite.

## v0.2.7 - 2026/07/03

- Added `set-chart-text` for supported title, category, and series text updates without recreating the chart. Use chart/series identities from inspect and check which chart families the operation supports.
- Corrected `vision-check --slides` JSON scoping so selected-slide issues and residual deck risk are distinguished.
- Improved ChartEx palettes/styles and cycle colors, chart label separators, sparse point identities, pie outlines, stock up/down bars, and table style/border overrides. PDF output gained vector box-drawing/marker glyphs and improved Unicode fallback; recheck affected previews before adding manual substitutes.

## v0.2.6 - 2026/06/29

- Added safe stable-ID animation-step updates and exit-animation creation, plus paragraph/level text builds. Supported edits retain effect identity and unrelated timing; unsupported timing structures are preserved or rejected instead of being silently rebuilt.
- Improved transition/animation timing inspection, scoped targets, motion-path units/transforms, and normalization of safe edits. Check inspected targets and editability before scheduling a mutation.
- Added actionable output-collision and preview error signals, including suggested retry arguments, and exposed visual-review counts more directly. Use the structured error to decide whether overwrite or a new path is appropriate; retry guidance is not overwrite consent.

## v0.2.5 - 2026/06/27

- Added read-only `pptx select` with inline/file-backed shape queries, slide scope, text/name regex, placeholders, and nearby bounds. Reports include match context and `patchSelector` hints; validate the chosen match before mutation. Bounding-box lengths also accept mm and px.
- Added `pptx preview deck.pptx --output-dir shots/ --json` for per-slide PNGs and optional contact sheets. Use the manifest to locate review artifacts; rendering alone does not establish content preservation.
- Added semantic `pptx diff before.pptx after.pptx --json`, defaulting to summary detail with explicit `--detail full` for evidence. The Agent gate separates reliable, uncertain, and unsupported changes; unstable same-kind matches are not deterministic change facts.
- Added ChartEx data authoring and PDF rendering for waterfall, funnel, histogram, treemap, sunburst, and box-whisker charts. Extended-chart `dataEx` and per-series layout options differ from classic chart settings. During `add-chart`, classic `title`/`legend` settings are skipped for ChartEx parts in this release; do not treat a successful apply as proof that those settings were written.
- Added repair-oriented parse error hints and avoided unnecessary detail/style/geometry work in summary comparisons.

## v0.2.3 - 2026/06/24

- Added PDF-to-PNG conversion and `xdoc pdf render` with 1-based `--pages`, DPI, prefix, and contact-sheet controls, plus PDF glob collection. `--pages` requires PDF sources, cannot combine with slide selection, and cannot be used for PDF passthrough output; choose PNG when extracting selected pages.
- Expanded `pdf inspect` with document metadata and per-page dimensions, rotation, page boxes, and annotation counts. Header hints and nullable metadata are diagnostics, not proof that every PDF feature can be edited.
- Added bubble/stock chart authoring and PDF rendering and improved series-scoped labels, markers, axes, legends, and layout. Rejected known-invalid area/radar label-position combinations before writing chart edits that could trigger repair.
- Added `refurbish-skin` using the native DeckKit catalog: copy the source, replace chrome/background, restyle retained objects, and check preservation metrics and new vision findings. Unsupported DeckKits and excessive complexity are rejected; run contact-diff separately for manual review.
- Added scoped PNG/contact review and vision gates with out-of-scope residual risk. Corrected SVG text/arcs, subscript baselines, Symbol text, PDF string handling, compression, and watermarking on blank output.

## v0.2.2 - 2026/06/20

- Added `vision-diff` to classify source/candidate static findings as new, resolved, inherited, or changed. It compares diagnostic issues, not rendered pixels.
- Added `contact-diff` for side-by-side source/candidate PNGs and changed/unchanged/missing/added slide pairs, including mapped split/merge/reorder comparisons. Use it for manual visual inspection alongside semantic checks.
- Added `refurbish-audit` to compare visible-text coverage, slide mapping, shape-type counts, notes, and external links. A reference map describes split/merge/reordered slides; without one, slides are paired one to one. Preservation metrics do not certify visual fidelity.
- Added `remap-theme` to restyle supported text, shapes, tables, and charts while retaining object data. Reports distinguish changed, skipped, and unsupported objects; review dry-run analysis before restyling mixed content.
- Added `chrome-detect`, `chrome-remove`, and `chrome-apply`. Detection reports evidence/confidence; removal compiles role-matched high-confidence shapes into real deletion operations. Check candidates before removing chrome and use a supported DeckKit for deterministic additions.
- Added radial gradient fills, improved SmartArt fallback/style handling, read actual presentation dimensions on open, and corrected Unicode handling in refurbishment auditing.

## v0.2.1 - 2026/06/17

- Added basic `set-slide-transition` and `set-slide-animations` authoring, including explicit timing/duration and schema disclosure. At this release the transition effect field is `type`; it becomes `kind` in v0.3.7. Supply content or `clear: true`; negative times and unsupported push/wipe corner directions are rejected.
- Corrected native animation timing, wipe entrance subtypes, and leading on-click behavior so an initial click effect waits for its click. Static previews are not playback verification.
- Added successful-slide totals and average slide throughput to batch summaries, preserving duration-only output when no successful slides are available.
- Preserved selectable math text, smoothed PNG fallbacks in PDF output, improved SmartArt classification/fallback layouts, and exposed shape-style signals useful for inspecting visual tables.

## v0.2.0 - 2026/06/15

- Added local and remote HTML-to-Markdown conversion through `xdoc html2md` and `convert --from html --to md`. Controls cover relative-link base URLs, charset/redirect handling, download limits, timeouts, User-Agent/TLS settings, and URL-based output names.
- Remote HTML fetching validates each destination and redirect and blocks private/loopback/link-local/metadata/multicast targets by default. A trusted deployment can opt into private-network access; charset/fallback warnings remain evidence to review before accepting extracted content.
- Added `xdoc pdf extract-text input.pdf --engine pdfium --pages 1,3-5 --json` with `pdf-text/v1` reports and natural/layout modes. `auto` selects PDFium here; the advertised `pdflite` alternative returns `engine_unavailable` in this release. Page numbers are 1-based.
- Changed default apply sidecars to `<output>.xdoc.json` and multi-format bundle roots to `<stem>.xdoc/`. Resolve artifacts from reports instead of assuming the older suffixes.
- Replaced the PDF output backend while retaining native streaming export, handled PPTX session-open failures, and rejected invalid presentation/shape/table geometry before authoring output.
