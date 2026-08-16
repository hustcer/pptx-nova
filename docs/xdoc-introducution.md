# xdoc: The Agent-Native Runtime for Editable PPTX

> A compact native runtime for document conversion, editable PPTX execution,
> rendering, validation, and auditable delivery.

> **Runtime build verified for this document:** `v0.3.6 (5fe30221)`
>
> **CLI contract:** `cli-agent/v1`
>
> **Verification date:** 2026-08-16
>
> **Evidence policy:** A capability is described as runtime-supported only when
> the executable exposes it through its versioned schema/help surface and the
> release validation evidence provides the corresponding behavior. The counts
> below are discovery metadata from the verified binary; they are not a claim of
> universal PPTX feature parity.
>
> **Checked-in contract snapshot:** [xdoc-schema.json](./xdoc-schema.json)

The public integration boundary documented here is the distributed `xdoc`
executable, its runtime schema, and its versioned reports and artifacts. This
repository does not define a public source-build path or an in-process xdoc
library API.

The installed runtime is the authority for executable behavior. At this
verification point, the checked-in snapshot is semantically equivalent to the
runtime response for `v0.3.6 (5fe30221)`; JSON formatting may differ between the
checked-in file and the CLI output. Refresh the snapshot whenever the published
binary identity changes.

xdoc is a native-first command-line runtime for turning document files into
structured, reviewable artifacts and for creating or editing native, editable
PPTX decks. It combines conversion, extraction, preflight diagnostics, a
declarative PPTX patch bridge, static and rendered visual checks, replayable
evidence, and three published Agent process adapters (local daemon, stdio
JSON-RPC, and MCP over stdio) under versioned contracts.

This document serves three audiences:

- people who need a reliable command for conversion, extraction, or a precise
  deck edit;
- agents that must discover capabilities, select objects, plan a change, and
  prove what happened; and
- technical leaders evaluating a document engine as a safe, observable execution
  layer for an AI presentation platform.

The facts below are separated into two layers:

1. **Runtime facts** come from the installed xdoc binary, especially
   `xdoc --version`, `xdoc --help`, and `xdoc schema`.
2. **Implementation notes** describe the native runtime layers and embedding
   boundaries. They explain the design and constraints, but do not replace the
   runtime contract.

## Positioning xdoc precisely

### Recommended definition

The most complete short definition is:

> **xdoc is an agent-native document execution runtime for turning document
> inputs into structured, reviewable artifacts and for creating or editing
> native, editable PPTX decks.**

For a shorter product line:

> **The agent-native document runtime.**

For an architecture discussion:

> **The document execution and evidence layer between an Agent and the delivered
> presentation.**

These descriptions are complementary rather than competing. “Runtime” says
what the complete product is. “Execution layer” says where it sits in a larger
system. “Engine” names the native document machinery at its core. “CLI” names
the distributed public interface through which the current product is invoked
and discovered.

### Why “Runtime” is the primary category

Calling xdoc only a CLI is accurate at the packaging boundary but incomplete as
a product description. The command-line executable is the public entry point;
behind that entry point, one versioned system coordinates document collection,
conversion, native PPTX reading and writing, declarative mutation, rendering,
validation, report generation, artifact delivery, and optional local session
reuse.

Calling xdoc only an engine is also accurate but too narrow. The native PPTX
engine reads and writes the package and its editable objects, but a production
Agent workflow also needs capability discovery, deterministic selectors,
non-writing dry-runs, structured failures, visual evidence, sidecars, and
publish gates. Those surrounding contracts are part of xdoc rather than an
exercise left independently to every caller.

The terminology can therefore be used consistently:

| Term                | How it applies to xdoc                                                                                                           | Why it is or is not the primary definition                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Runtime**         | The executable plus its document engines, rendering path, schema, reports, artifacts, safety policies, and optional local daemon | Best overall product category because it covers execution behavior and the public contract                         |
| **Engine**          | The native parsing, package, OOXML/PPTX mutation, conversion, and rendering machinery                                            | Correct for the technical core, but it understates discovery, safety, evidence, and delivery                       |
| **CLI**             | The designated distribution and process-integration surface for the current public release                                       | Correct for how callers invoke xdoc, but it describes the interface rather than the whole system                   |
| **Execution layer** | The boundary that turns an Agent's declared plan into document artifacts and machine-readable proof                              | Best description of xdoc's architectural role inside an Agent platform                                             |
| **Protocol**        | The discover → inspect → plan → dry-run → apply → verify → audit lifecycle and its versioned wire artifacts                      | Describes the repeatable behavior that lets different hosts integrate safely                                       |
| **Harness**         | A workflow wrapper may use xdoc as the system under execution                                                                    | Not the right definition for xdoc itself; an Agent skill or CI workflow is closer to the harness/orchestrator role |
| **Agent**           | An Agent discovers xdoc, constructs plans, evaluates evidence, and decides whether to continue                                   | xdoc is Agent-oriented, not an autonomous planner or content-deciding Agent                                        |

### “Agent-native” is a contract property

Agent-native does not mean that a language model is embedded in the executable,
or that xdoc independently decides what a presentation should say. It means the
runtime exposes the information and control surfaces an Agent needs to operate
without guessing:

- the binary identifies its exact version and build;
- `xdoc schema` progressively discloses operations, fields, definitions,
  examples, catalogs, capability status, error contracts, and report shapes;
- inspect and select expose native object identity instead of requiring visual
  coordinate guesses;
- declarative recipes and patches make the requested change durable and
  reviewable;
- dry-run separates target resolution and predicted effects from filesystem
  mutation;
- apply writes a separate candidate by default and records operation results;
- structural, semantic, and rendered checks expose different forms of truth;
  and
- versioned reports, hashes, gates, sidecars, and artifacts give an
  orchestrator data it can retain, compare, retry, quarantine, or publish.

The Agent remains responsible for understanding intent, authoring or selecting
the plan, judging content and design, and applying the publication policy. xdoc
is responsible for making the document operation deterministic, observable,
and reviewable at the format boundary.

### One compact runtime, five connected responsibilities

The power of xdoc is the combination of responsibilities behind one contract:

| Responsibility | Representative public surface                                                                     | Value to an Agent workflow                                                     |
| -------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Discover**   | `xdoc --version`, help, `xdoc schema`, catalogs, examples, capability status                      | Negotiate the installed runtime instead of assuming support                    |
| **Understand** | conversion, extraction, `pptx inspect`, `pptx select`, preflight diagnostics                      | Build a structured view of the source and identify exact targets               |
| **Plan**       | recipes, versioned JSON patches, selectors, dry-run reports                                       | Review intent, resolution, predicted changes, and risks before writing         |
| **Execute**    | native PPTX apply, conversion, PDF export, candidate delivery, optional daemon/JSON-RPC/MCP reuse | Produce real artifacts through one local process boundary                      |
| **Prove**      | re-inspection, semantic checks, preview, vision checks, diffs, sidecars, versioned reports        | Decide whether the candidate is safe to publish and retain replayable evidence |

This is why xdoc is better described as a document execution runtime than as a
file converter or a collection of PowerPoint utilities. Conversion, mutation,
rendering, and validation share the same discovery, reporting, safety, and
artifact boundaries.

### Native-first deployment and release footprint

The verified `v0.3.5` native packages unpack to roughly 20MB each, with exact
size varying by target. That footprint includes the executable distribution
and applicable notices for the selected target. It is small enough to promote
as a pinned CI, container, managed-worker, or offline-job layer without
requiring PowerPoint, a full office installation, a headless browser, a
separate server, or an always-on background service for ordinary one-shot
execution. Multi-step sessions may optionally use the loopback-only local
daemon while retaining the documented CLI and report boundary.

The size statement is release evidence, not a stable API or compatibility
promise. Record exact bytes, archive digest, target, runtime build, rendering
backend identity, and font inventory for each promoted artifact. Current public
native builds cover supported Linux, macOS, and Windows targets rather than
every OS/architecture combination. Rendered fidelity still depends on the
declared backend and available fonts.

## Executive overview

### The problem xdoc solves

An AI system can produce a plausible slide image in one step. A production
workflow needs more:

- a machine-readable description of what the engine can do;
- deterministic references to the exact slide objects that should change;
- a way to validate a proposed change without writing a file;
- a native PPTX result that remains editable;
- preservation of content and package parts that were not intentionally changed;
- structural, semantic, and visual evidence after the write; and
- a replayable record so another agent or a human can audit the run.

xdoc treats those requirements as part of the document-format boundary rather
than as optional application code.

### The core idea

The primary editing unit is a JSON patch, not an opaque sequence of imperative
object mutations. A patch can be inspected, schema-checked, dry-run, applied to
a copied candidate, reported, previewed, compared, and replayed. Selected bridge
capabilities may also be released through separate products or runtimes, but
those surfaces have their own contracts and are not implied by this CLI guide.

### A three-level control plane

xdoc separates intent, mutation, and proof so an agent can choose the smallest
level that still preserves a complete audit trail:

| Level    | What an agent supplies                                                                  | What xdoc returns                                                                              |
| -------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Intent   | A recipe, data binding, brand profile, translation plan, or refurbishment request       | An expanded, inspectable plan that can be reviewed before mutation                             |
| Patch    | A versioned JSON envelope with deterministic selectors and ordered operations           | Schema validation, selector resolution, dry-run deltas, operation traces, and a candidate PPTX |
| Evidence | A request for inspection, semantic checks, rendered previews, diffs, or a sidecar audit | Versioned reports with report-specific hashes, findings, gates, and replay/rollback metadata   |

The three levels are deliberately composable. Many high-level requests compile
to ordinary patch operations; translation and refurbishment paths may also emit
guarded specialized artifacts or commands. All of them feed the same
candidate-and-evidence lifecycle, but not every intent is represented by one
ordinary patch or supports the same dry-run surface.

### A declarative delivery lifecycle

xdoc is best understood as a declarative delivery protocol for a native
document, not only as a file-writing command. A production job can make each
state explicit:

```text
plan    = source identity + schema version + patch/recipe + policy
dry-run = resolve + simulate + report predicted changes and gates
apply   = adopt one candidate only after all patch operations succeed
deliver = write the candidate and evidence artifacts as separate filesystem operations
verify  = re-open the candidate and run structural, semantic, and rendered gates
audit   = parse/project the recorded sidecar and retain the evidence bundle
publish = hand off only after static, rendered, and human-review gates pass
```

The plan is durable input, the candidate is a separately addressable artifact,
and verification plus history audit are first-class outputs. Patch execution is
all-or-nothing at the presentation-state boundary, but candidate delivery and
sidecar delivery are separate filesystem writes; they are not one atomic
evidence transaction. This lets an orchestrator retry or reject one stage
without guessing what an earlier stage changed, while making the remaining
delivery boundary explicit. It also joins three forms of truth at one
boundary: native object truth, declarative control, and rendered evidence. That
separation is what makes supervision measurable instead of dependent on
screenshots or log interpretation alone.

### Current release surface

| Area                           | Runtime contract in v0.3.5                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Top-level CLI                  | `convert`, `html2md`, `extract`, `check`, `pptx`, `pdf`, `daemon`, `json-rpc`, `mcp`, `schema` |
| PPTX CLI subcommands           | 37 discoverable subcommands                                                                    |
| Patch operations               | 58 canonical operations                                                                        |
| High-level recipes             | 18 recipe kinds                                                                                |
| Shape catalog                  | 182 preset shapes                                                                              |
| Layout contracts               | 6 built-in content contracts                                                                   |
| Theme/style assets             | 9 theme packs and 4 style packs                                                                |
| Gradients and chart styles     | 24 preset gradients and 48 chart styles                                                        |
| Chart type catalog             | 103 `XlChartType` entries with supported/partial/unsupported status                            |
| Enum families                  | 20 controlled vocabularies                                                                     |
| Published bridge error catalog | 24 error codes                                                                                 |
| Embedded PPTX report schemas   | 20 report schemas                                                                              |
| Patch schema definitions       | 206 `$defs` in the current runtime schema                                                      |
| Runtime examples               | 36 PPTX CLI examples, 18 patch examples, and 7 recipe examples                                 |
| Chart status breakdown         | 54 supported, 31 partial, and 18 unsupported entries in the 103-type catalog                   |

Counts are discovery aids, not promises that every long-tail PPTX feature is
fully editable. Each operation and capability carries its own support or
preservation status.

### What makes the system distinctive

xdoc's value comes from the combination of capabilities, not from any single
command:

- **The runtime explains itself.** Operation schemas, examples, catalogs,
  reports, errors, and capability status are emitted by the executing binary.
- **Patch evaluation is transactional and reviewable.** The patch is a durable
  plan, dry-run is non-writing, and apply adopts the candidate only after the
  operation set succeeds. Candidate and sidecar delivery remain separate
  filesystem steps.
- **Native structure and rendered evidence stay connected.** Inspect/select
  reason about editable objects, while preview and diff expose the delivered
  visual result.
- **Preservation is observable.** Unknown and untouched package data is kept
  where possible, while preserve-only and unsupported regions are reported.
- **Repair is a protocol.** Structured findings can carry a machine-executable
  fix patch, confidence, and retry policy instead of only human prose.
- **History is materialized with declared dependencies.** Sidecars store the
  patch and evidence so a later process can inspect or audit the record and,
  when the currently resolved input remains available, replay or recover the
  revision. They are not cryptographic commits or deck-byte archives.
- **The contract is language-neutral.** JSON schemas, exit codes, report ids,
  and artifact identities let a planner, worker, queue, or review service be
  implemented in any host language while keeping the document boundary fixed.

That combination makes xdoc suitable as infrastructure: it supplies the
execution contract, the mutation engine, and the evidence boundary in one
versioned system.

## What xdoc is—and is not

### It is

- a single CLI for document conversion and PPTX work;
- a native PPTX package reader/writer with a declarative bridge;
- an agent-facing contract that can be discovered at runtime;
- a preserve-first editing pipeline with explicit safety gates;
- a source of structured reports suitable for CI, orchestration, and audit; and
- a local execution layer that can keep a deck in memory across multiple agent
  steps.

### It is not

- a promise of complete parity with every feature ever emitted by a PPTX
  application;
- a replacement for human review of facts, numbers, legal text, or brand
  approval;
- a guarantee that static geometry checks prove every pixel is correct;
- a browser build of the complete CLI; or
- an implicit claim that reserved document kinds are already supported.

The current capability registry marks `docx` and `xlsx` as `reserved`. They may
be recognized as document kinds, but the v0.3.5 CLI must not be described as an
implemented general-purpose converter for them.

## Design principles

### Discoverability before mutation

An agent should not need to guess field names, enum spellings, selector shapes,
or report formats. The schema command exposes the contract progressively:

```bash
xdoc schema --mode index
xdoc schema --mode ops --ops add-text-box
xdoc schema --mode ops --ops add-shape,add-table --minimal
xdoc schema --mode ops --ops set-shape --fields name,shape,slide --defs summary
xdoc schema --mode examples
```

The index is intentionally small. An agent can request the complete definition
only after it knows which operation it needs.

The full runtime schema currently includes 36 PPTX CLI examples, 18 patch
examples, and 7 recipe examples. These examples are part of the same versioned
discovery output as the field definitions.

Cache the complete `xdoc schema` response for CLI discovery. In v0.3.5,
`discovery.commands` is summary metadata (it omits `html2md`), while
`xdoc schema --mode index` is specifically a patch-operation index rather than a
complete CLI inventory. Neither surface should be treated as an exhaustive
replacement for the full `.commands` map or command help. The PDF command has
one additional discovery exception documented in the PDF section below.

### Deterministic targeting

Selectors can use an object id, a shape name, a placeholder, or a structured
query. Queries support `nameRegex`, `textRegex`, placeholder `type` and `idx`,
and `bboxNear`. Matching is deterministic. If a query resolves to multiple
objects where one object is required, xdoc returns an ambiguity error with
candidate information instead of choosing silently.

### Plan before write

`--dry-run` executes the patch against a candidate state, reports changed parts,
semantic changes, visual risks, selector resolutions, and operation results, and
does not write the requested output.

### Preserve by default

The package layer preserves unknown entries and untouched parts where possible.
Macro, signature, encryption, raw-XML, and zip-bomb policies are explicit. A
feature that cannot safely edit a region is surfaced as preserve-only or
unsupported rather than silently reconstructed.

### Evidence is part of delivery

A successful write is only one artifact. xdoc can also produce:

- a structured apply report;
- a materialized `.xdoc.json` sidecar with declared path dependencies;
- a static vision report;
- rendered PNGs and a contact sheet;
- semantic or visual diffs; and
- specialized translation, refurbishment, brand, and preflight reports.

This makes a deck revision a chain of evidence rather than an unexplained binary
replacement.

## Architecture

At a high level, the runtime is organized as follows:

```text
xdoc CLI
  ├─ input collection, glob expansion, and batch planning
  ├─ conversion pipeline
  │    ├─ PPTX parser
  │    ├─ PDF converter
  │    └─ image converter / PDFium
  ├─ native PPTX JSON bridge
  │    ├─ OPC package reader/writer
  │    ├─ XML and OOXML model
  │    ├─ patch interpreter and recipe compiler
  │    └─ semantic and visual-risk reports
  ├─ schema, catalogs, and capability registry
  └─ deterministic artifact delivery, manifests, and reports
```

### Conversion path

For a PPTX conversion, the native pipeline is conceptually:

```text
PPTX bytes
  → structured presentation model
  → PDF converter / PDF bytes
  → image converter / PDFium / PNG bytes
```

JSON, Markdown, plain text, and extraction artifacts can be produced without
rendering. PDF and PNG outputs require the runtime backends declared in the
capability registry.

### Local, unattended rendering

When the distribution includes the declared PDF and image backends, the same
native worker can produce PDF bytes, per-slide PNGs, and contact sheets without
starting a browser, a desktop presentation application, or a full office
service. This makes the evidence path suitable for CI, containers, offline
queues, and other unattended jobs. The claim is intentionally backend-aware:
`capabilities/v1` names `pdf-backend` and `image-backend` explicitly, and a
deployment must provision the exact backends and fonts required by its build.

Keep the render manifest, backend identity, and font inventory with the output.
They explain why two otherwise identical jobs might differ in rasterized text or
pagination and give a platform a reproducible provenance record.

Record the exact `xdoc` and colocated backend sizes in the release manifest for
each platform artifact. Binary size is build-specific evidence, not a stable
runtime capability, so it should not be copied forward when only the schema
snapshot changes.

### Runtime and embedding boundaries

xdoc is distributed as a native-first executable. Its stable external contract
is the CLI, its versioned schema, and its documented reports and artifacts.
Internal component and library boundaries are implementation details, not a
public API promise. The runtime layers cover collection, conversion, delivery,
document models, PDF text, daemon support, and shared diagnostics.

Host applications should invoke the executable directly, keep stdout, stderr,
exit status, and filesystem artifacts separate, and pin adapters to the probed
CLI contract. A separately released JavaScript, WebAssembly, service, or
in-process surface must be evaluated against its own documentation; it does not
make the complete native CLI browser-runnable or library-embeddable.

### Why the architecture matters

The design keeps three concerns separate:

1. **Document truth:** the package, relationships, XML, objects, and resources.
2. **Agent control:** schemas, selectors, patches, reports, and error contracts.
3. **Human evidence:** rendered previews, contact sheets, visual diffs, and
   preservation audits.

A platform can scale each concern independently while keeping the same patch and
report contracts at the orchestration boundary.

### A standard path for agent execution

For the document kinds implemented by the current release, xdoc can be wrapped
as one repeatable execution protocol instead of a collection of bespoke shell
integrations:

```text
discover contract and capabilities
  → validate a typed request
  → execute against read-only inputs or a separate candidate
  → evaluate the versioned report and command-specific exit policy
  → retain artifacts, hashes, reports, and sidecars before publish
```

PPTX mutation uses the full intent/patch/evidence stack. Conversion, extraction,
PDF diagnostics, and preflight use the same discovery and artifact boundaries
without pretending that every command is a patch operation. Reserved document
kinds remain outside this path until their capability entries become
implemented rather than `reserved`.

### A path toward an ecosystem contract

xdoc is an implementation and a public contract surface, not a formal industry
standard today. Its route toward becoming a shared execution layer is concrete:
freeze the boundaries that different planners, workers, and host languages need
to agree on, then grow capability coverage without changing the meaning of a
successful report.

| Boundary         | Already observable in xdoc                                                                            | What an ecosystem profile would freeze                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Discovery        | `cli-agent/v1`, progressive `xdoc schema`, catalogs, examples, and capability status                  | How a worker negotiates supported, partial, preserve-only, and unsupported features |
| Mutation         | `pptx-patch/v1`, numeric patch envelope, selectors, ordered ops, recipe expansion                     | Selector determinism, atomicity, idempotency expectations, and extension rules      |
| Evidence         | Versioned report ids, report-specific hashes or gates, changed parts, operation traces, and sidecars  | Minimum proof required before a candidate can be published or retried               |
| Safety           | Asset roots, size and ZIP limits, raw-XML opt-in, signature/encryption policy, and exit codes         | Policy profiles that a sandbox, queue, or regulated worker can enforce consistently |
| Conformance      | Contracted examples, fixture probes, semantic-rule summaries, and replayable artifacts                | Cross-implementation test vectors and compatibility/deprecation policy              |
| Host integration | CLI, runtime schema, daemon, stdio JSON-RPC, MCP stdio, and any separately published service contract | Stable process adapters for workers, queues, containers, and service deployments    |

The important design choice is that a new host does not need to reproduce xdoc's
internal object model. It needs to preserve the wire contract, capability
negotiation, evidence semantics, and declared safety policy. The current release
ships a bundled local MCP stdio server, but it does not ship IDE-specific
installers, remote MCP exposure, or an external governance process; those remain
ecosystem work. Keeping that boundary explicit makes the standardization path
more credible than claiming a standard already exists.

## First run: verify the runtime

Use the installed binary or your approved distribution artifact. Do not infer
the feature set from a wrapper script or from an older schema snapshot; ask the
binary that will execute the job.

```bash
xdoc --version
xdoc schema --mode index
xdoc schema > runtime-schema.json
```

The expected runtime identity for this document is:

```text
0.3.6 (5fe30221)
```

The top-level schema response identifies itself as:

```json
{
  "schemaVersion": "cli-agent/v1",
  "version": "0.3.6 (5fe30221)"
}
```

The numeric `schemaVersion` inside a patch envelope is a different contract: it
is currently `1`. Keep the two version fields distinct in agent code.

For a pinned integration, compare the captured `runtime-schema.json` with the
checked-in snapshot only after normalizing JSON ordering. A matching build id is
necessary but not sufficient: operation fields, report schemas, capability
entries, and backend requirements are the parts an agent must actually cache.

## Quick-start command set

### Convert a deck

```bash
xdoc convert deck.pptx --to pdf --output deck.pdf
xdoc convert deck.pptx --to png --contact-sheet --output-dir previews
xdoc convert deck.pptx --to json --pretty --output deck.json
xdoc convert deck.pptx --to md --md-detail ai --output deck.md
```

The shorthand form is equivalent for conversion:

```bash
xdoc deck.pptx --to pdf --output deck.pdf
```

### Extract structured artifacts

```bash
xdoc extract deck.pptx --parts map,resources,notes,links,fonts --pretty --output deck-artifacts.json
```

The extraction parts are `map`, `resources`, `notes`, `links`, `fonts`, and
`all`. They have versioned artifact shapes such as `map/v1`, `resources/v1`,
`notes/v1`, `links/v1`, and `fonts/v1`.

| Part        | Typical contents                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------- |
| `map`       | Slide titles, sections, outline entries, selected slides, and per-slide element counts            |
| `resources` | Package and slide images, video, audio, charts, tables, math, diagrams, links, and font summaries |
| `notes`     | Per-slide speaker-note presence and text                                                          |
| `links`     | URL, source, kind, external/internal status, and suspicious-link signal                           |
| `fonts`     | Referenced fonts and embedded-font observations                                                   |

### Run preflight checks

```bash
xdoc check deck.pptx --checks fonts,links,compat,assets,policy --pretty --output preflight.json
```

The check registry covers fonts, links, compatibility, assets, policy, and the
accessibility check. The declared `--checks` default is the explicit list
`fonts,links,compat,assets,policy`; `--checks all` means every check, a11y
included, so accessibility arrives either by naming `a11y` or by asking for
`all`. Compatibility checks can target a selected release family with
`--target-office`; the flag name is retained for contract compatibility. The
`preflight/v1` report records `passed`, `warning`, or `failed` status, severity
counts, the checks requested/executed/unsupported, and an overall risk level.
An accessibility scan that completes with findings still exits 0. Gate on
`checks.a11y.status` (`passed`, `warning`, `inconclusive`, or `failed`) and
`summary.riskLevel`; `inconclusive` requires rendered/manual review. Its
`patchTemplate` contains non-auto-applicable placeholder prose, not a `fixPatch`.

### Inspect and select before editing

```bash
xdoc pptx inspect deck.pptx --json
xdoc pptx select deck.pptx --query '{"textRegex":"Revenue"}' --json
```

`inspect` is read-only. It can expose slide, layout, master, theme, shape,
placeholder, bounding-box, text summary, semantic keywords/topics, style
heuristics, overlap estimates, and text-overflow estimates. `select` returns a
versioned `pptx-select/v1` report with the query, scope, matches, and resolved
object references.

### Apply a patch safely

```bash
xdoc pptx apply --patch patch.json --input deck.pptx --output updated.pptx --dry-run --json
xdoc pptx apply --patch patch.json --input deck.pptx --output updated.pptx --json
```

The first command produces a dry-run report and writes no PPTX. The second
creates the candidate. Existing output paths require `--overwrite`.

### Validate the candidate

```bash
xdoc pptx vision-check updated.pptx --json
xdoc pptx preview updated.pptx --output-dir updated-previews --contact-sheet --contact-output updated-contact.png --json
xdoc pptx diff deck.pptx updated.pptx --json
```

Use the static check for fast geometry and package diagnostics, the preview for
actual rendered evidence, and the diff for deterministic structural comparison.

### Keep a daemon session for multi-step work

`xdoc daemon start` runs in the foreground. Leave it running in one terminal:

```bash
xdoc daemon start
```

Then use and stop it from another terminal:

```bash
xdoc daemon status --json
xdoc pptx inspect deck.pptx --daemon --json
xdoc pptx apply --patch patch.json --input deck.pptx --output updated.pptx --daemon
xdoc daemon stop
```

Alternatively, omit the explicit `start` command and let the first `--daemon`
request use the documented auto-spawn path.

`--daemon` falls back to one-shot mode when the daemon is unavailable.
`--daemon-strict` turns that fallback into a hard failure.

## Conversion and extraction reference

### Input collection

`convert`, `html2md`, `extract`, and `check` accept a single file, multiple
files, glob patterns, and directories. Use `--recursive` to descend into
directory inputs. For batches, `--output-dir` collects outputs below one root and
`--report` writes a stable `batch/v1` summary. `--fail-fast` stops at the first
failed input.

Slide and page selectors in conversion, extraction, preflight, and PDF commands
are 1-based and accept comma-separated ranges such as `1,3,5-7`.

### Output formats

The conversion command supports:

| Input     | Output   | Status   | Notes                                                                               |
| --------- | -------- | -------- | ----------------------------------------------------------------------------------- |
| PPTX      | PDF      | enabled  | Uses the PDF backend; optional bookmarks, page labels, and speaker-note annotations |
| PPTX      | PNG      | enabled  | Uses the PDF and image backends; emits a directory of slide images                  |
| PPTX      | JSON     | enabled  | Structured presentation data                                                        |
| PPTX      | Markdown | enabled  | `human` or `ai` detail mode                                                         |
| PPTX      | text     | enabled  | Plain extracted text                                                                |
| PDF       | PNG/PDF  | enabled  | Render or inspect through the PDF command family                                    |
| HTML      | Markdown | enabled  | Local HTML file, glob, or directory input                                           |
| DOCX/XLSX | any      | reserved | Recognized in the registry, not an enabled conversion path in v0.3.5                |

The top-level capability registry is itself machine-readable:

```bash
xdoc schema | jq '.capabilities'
```

In that registry, `status: "enabled"` means that the build exposes the code
path; it is not a live probe of every required backend, font, or host
dependency. Combine schema discovery with deployment-time readiness checks and
representative conversion probes for the formats a worker will serve.

### Output path derivation

When paths are omitted, xdoc derives them from the input stem. The important
rules are:

| Situation                           | Default                                             |
| ----------------------------------- | --------------------------------------------------- |
| One input, one file format          | `<input-dir>/<input-stem>.<ext>`                    |
| PNG only                            | `<input-dir>/<input-stem>-img/`                     |
| Multiple formats                    | `<input-dir>/<input-stem>.xdoc/`                    |
| Multiple inputs with `--output-dir` | Preserve relative parents where possible            |
| PNG filenames                       | `<prefix>-<zero-padded-slide>.png`, minimum width 3 |
| Manifest for a bundle               | `<root-dir>/manifest.json`                          |
| Manifest for a single file          | `<input-dir>/<input-stem>.manifest.json`            |

An explicit `--output` path is used verbatim for a file. For PNG or multi-format
bundles, a trailing separator selects parent-directory semantics; without it,
the path is treated as the bundle root. Existing outputs are protected unless
`--overwrite` is supplied.

### Manifests and batch reports

Manifest mode is `auto` by default and can be set to `true` or `false`. A
manifest records the produced artifacts and their paths; PNG manifests also
record page dimensions, byte lengths, and hashes. A batch report records
per-input success or failure so an agent does not have to parse human log text.

### HTML to Markdown

Use the dedicated command when the source is HTML:

```bash
xdoc html2md page.html --output page.md
xdoc html2md ./pages --recursive --output-dir ./markdown
```

Relative links can be resolved with `--html-base-url`. The conversion preserves
content as Markdown; it is not a promise to reproduce the source page's visual
layout in a PPTX.

### PDF diagnostics

The PDF command family has three actions:

```bash
xdoc pdf inspect output.pdf --json --pretty
xdoc pdf extract-text input.pdf --engine pdfium --pages 1,3-5 --json --pretty
xdoc pdf render input.pdf --pages 1,3-5 --output selected-pages/
xdoc pdf render input.pdf --output all-pages/ --contact-sheet
```

`pdf inspect` reports page geometry, font embedding observations, subset
prefixes, page usage, text-object counts, and Unicode-map diagnostics.
`extract-text` emits plain text or `pdf-text/v1`; its extraction modes are
`natural` and `layout`. The native `auto` engine resolves to PDFium in the
current build.

There is one known v0.3.5 discovery inconsistency: `xdoc pdf --help`, the
published PDF examples, and the executable all expose `pdf render`, but the
`commands.pdf.subcommands` map in `cli-agent/v1` currently lists only
`inspect` and `extract-text`. Treat this as a contract defect to be fixed, and
pin the executable build instead of inferring that `render` is absent from that
single map.

## The PPTX patch model

### Envelope

Every patch is an object with a numeric envelope version and an ordered list of
operations:

```json
{
  "schemaVersion": "pptx-patch/v1",
  "ops": [
    {
      "op": "add-slide"
    },
    {
      "op": "add-text-box",
      "slide": 0,
      "x": "0.75in",
      "y": "0.65in",
      "w": "11in",
      "h": "0.8in",
      "name": "Title",
      "text": "Quarterly review"
    }
  ]
}
```

`slide` in patch operations is zero-based. This differs from the 1-based
`--slides` selectors used by most CLI inspection and conversion commands.
Lengths can be numeric or unit-bearing strings such as `in`, `cm`, `mm`, `pt`,
`px`, or `emu`; ask `xdoc schema --mode ops --ops OP_NAME` for the exact field contract.

### Operation families

The 58 canonical operations are grouped conceptually below:

**Presentation structure**

- `add-slide`, `remove-slide`, `move-slide`, `duplicate-slide`
- `add-layout`, `set-layout`, `add-layout-placeholder`
- `add-placeholder`
- `set-master`, `set-theme`, `remap-theme`, `set-slide-size`
- `set-document-properties`

**Text and paragraphs**

- `add-text-box`, `add-paragraph`, `add-run`
- `set-text-frame`, `set-paragraph`, `set-run`
- `replace-paragraph-text`, `set-default-text-style`, `fit-text`

**Shapes and media**

- `add-shape`, `set-shape`, `remove-shape`, `duplicate-shape`
- `add-group`, `ungroup-shapes`, `add-connector`, `set-connector`
- `add-freeform`, `add-image`, `set-image`, `add-video`
- `add-equation`, `add-ole-object`

**Tables and charts**

- `add-table`, `set-table`, `set-table-data`, `merge-table-cells`
- `add-chart`, `set-chart`, `set-chart-data`, `set-chart-text`

**Notes and motion**

- `set-slide-notes`, `append-slide-notes`, `remove-slide-notes`
- `set-slide-background`, `set-slide-transition`, `set-slide-animations`

**Data and control flow**

- `bind-data`, `populate-slide`
- `define-macro`, `use-macro`, `foreach`, `if`, `try`

**Low-level escape hatch**

- `patch-ooxml`

The operation index is authoritative for required and optional fields,
categories, constraints, and support levels. The list above is a navigation aid,
not a substitute for the schema.

Control operations are declarative expansion tools, not an arbitrary code
execution surface. `define-macro` and `use-macro` reuse operation templates;
`foreach` and `if` expand data-dependent branches; `try` can select a guarded
fallback. Expansion is reported in `expandedOps` and is subject to recursion and
validation limits.

Control flow is state-aware but bounded. `if.condition` is evaluated at
execution time against the current candidate, so it can observe earlier
mutations. `foreach` substitutes each declared item and executes the resulting
operations in order. A `try.body` runs on a branch-local clone and is adopted
only after complete success; a recoverable failure discards that branch before
the declared fallback runs on the unchanged outer state.

### High-level recipes

Recipes compile to ordinary patch operations. They are useful when an agent
knows the intended slide pattern but does not need to hand-author every shape.
The current 18 recipe kinds are:

- `title`
- `two-column`
- `section`
- `image-caption`
- `kpi-grid`
- `comparison-table`
- `timeline`
- `roadmap`
- `matrix-2x2`
- `process-flow`
- `funnel`
- `swot`
- `pyramid`
- `hub-spoke`
- `cycle`
- `gantt`
- `scorecard-table`
- `comparison-cards`

Compile a recipe before applying it when you want the expanded patch as an
auditable intermediate:

```bash
xdoc pptx recipe --recipe recipe.json --compile --json
```

Apply reports expose the resulting `expandedOps` and created object ids.

### Catalog discovery

The bridge keeps design primitives discoverable rather than hiding them in
documentation:

```bash
xdoc pptx catalog shapes --json
xdoc pptx catalog themes --json
xdoc schema | jq '.commands.pptx.catalogs'
```

The current shape catalog has 182 entries across eight categories:
`action-button`, `arrow`, `basic`, `callout`, `flowchart`, `math`, `misc`, and
`star-banner`. Each entry can expose a stable name, aliases, its OOXML preset
key, description, and text-support metadata.

The schema also publishes six layout contracts, 24 preset gradients, 48 built-in
chart styles, and a 103-entry chart-type catalog. The chart catalog labels
entries as supported, partial, or unsupported so a planner can choose a safe
representation before generating a patch. The current catalog registers two
production-ready native DeckKits without making DeckKit internals part of the
patch schema.

In the verified build, all 58 canonical operation names appear in
`patchSchema.supportedOps` and `patchSchema.experimentalOps` is empty. This is
about the availability of operation entry points, not universal OOXML parity:
individual chart variants, extension parts, and long-tail objects still carry
their own supported, partial, preserve-only, or unsupported status.

### Schema discovery workflow for agents

Use the smallest disclosure that answers the next question:

1. `xdoc schema --mode index` — discover operation names and one-line summaries.
2. `xdoc schema --mode ops --ops add-text-box --minimal` — inspect one operation.
3. `--fields` — project only the fields needed for planning.
4. `--defs summary` — inspect referenced definitions without pulling the full
   transitive closure.
5. `--defs full` or an unprojected operation — obtain nested selector and field
   definitions before validation.
6. `xdoc schema --mode examples` — copy a contract-tested patch pattern.
7. `xdoc pptx apply --dry-run --json` — validate the complete operation against
   the actual deck state.

This progressive disclosure keeps agent prompts and tool calls small while
retaining a complete validation path.

### Rich editable objects

The patch surface is broader than text boxes:

- **Charts:** create charts, replace data, edit visible text, and adjust common
  chart, axis, legend, series, point, and plot settings. Generated charts can
  carry editable chart caches plus an embedded workbook package.
- **Tables:** create and format tables, set cell data, resize data regions,
  merge cells, and change row/column dimensions.
- **Shapes and diagrams:** use preset shapes, connectors, groups, freeforms,
  fills, lines, effects, and geometric updates.
- **Media and embedded objects:** add images, video with poster frames, OLE
  objects with icons, and equations rendered as SVG or editable math where the
  selected mode is supported.
- **Presentation behavior:** edit supported transitions, entrance animations,
  notes, backgrounds, masters, layouts, placeholders, themes, and document
  properties.

Every rich-object path still follows the same rule: discover the operation,
validate the exact fields, dry-run against the deck, and report preserve-only or
unsupported structures explicitly.

## The inspect → select → plan → apply loop

A production agent should use the following loop for an existing deck.

### 1. Inspect the source

```bash
xdoc pptx inspect source.pptx --json > inspect.json
```

Record the source path, slide count, object names, ids, placeholders, and any
preserve-only observations. Do not infer geometry from a screenshot when the
editable object tree is available.

### 2. Resolve the target

```bash
xdoc pptx select source.pptx --query '{"textRegex":"Revenue"}' --slides 2 --json > selection.json
```

Prefer an id or stable name after the first inspection. Use a query when the
deck is generated dynamically, and require exactly one match for a localized
edit.

### 3. Write a minimal patch

Keep the patch narrowly scoped. For text replacement, carry source text or a
source hash when the operation supports it. For a new object, assign a stable
name so subsequent steps can resolve it without guessing.

### 4. Dry-run

```bash
xdoc pptx apply --patch patch.json --input source.pptx --output candidate.pptx --dry-run --explain --json > dry-run.json
```

Review `status`, `wouldWrite`, `changedParts`, `semanticChanges`, `visualRisks`,
`semanticIssues`, `opResults`, `resolvedSelectors`, and any schema-derived
explanations. A dry-run must not mutate the source or output.

### 5. Apply to a separate candidate

```bash
xdoc pptx apply --patch patch.json --input source.pptx --output candidate.pptx --json > apply.json
```

Keep the source read-only by policy. The bridge rejects invalid operations and
unsupported schema operations instead of reporting a partial success.

### 6. Run static and rendered checks

```bash
xdoc pptx vision-check candidate.pptx --json > vision.json
xdoc pptx preview candidate.pptx --output-dir candidate-previews --contact-sheet --contact-output candidate-contact.png --json > preview.json
```

Static checks are fast and deterministic. PNG previews provide the evidence
needed for contrast, decoration, and other pixel-level or renderer-dependent
questions that geometry alone cannot settle.

### 7. Compare and publish

```bash
xdoc pptx diff source.pptx candidate.pptx --detail full --json > diff.json
```

Publish only when the requested semantic change is present, unexpected changes
are within policy, and visual gates pass. Preserve the reports and previews
alongside the candidate when the deck is important enough to audit.

The structural diff makes deterministic conclusions only for stably identified
slides and objects. Unstable matches and unsupported structures are reported as
uncertain or unsupported instead of being presented as facts.

## Selectors and object identity

### Selector forms

Most patch targets can be expressed as:

```json
{ "id": 42 }
```

```json
{ "name": "Title" }
```

```json
{ "placeholder": "title", "idx": 0 }
```

```json
{ "query": { "textRegex": "Revenue" } }
```

Queries can be scoped to a slide with `slideIndex` (zero-based) or to a 1-based
`--slides` range at the CLI boundary. `bboxNear` is useful when a deck has
repeated text or names but a stable location.

### Ambiguity is a reportable state

If two shapes satisfy a selector that should identify one target, xdoc returns a
structured ambiguity error and lists the candidates. An agent should refine the
selector or request human input; it should not pick the first array element.

### Stable names are an operational contract

For generated decks, name important objects at creation time. Names make
follow-up patches, data bindings, translation units, and audit records easier to
correlate. Names are not a substitute for checking the current deck:
inspect/select should still be run after a deck is copied, reordered, or
refurbished.

## Reports, errors, and automatic repair

### Report families

The bridge exposes versioned JSON reports including:

- `pptx-inspect/v1`
- `pptx-select/v1`
- `pptx-preview/v1`
- `pptx-vision/v1`
- `pptx-diff/v1`
- `pptx-vision-diff/v1`
- `pptx-contact-diff/v1`
- `pptx-apply/v1`
- `pptx-dry-run/v1`
- `pptx-apply-sidecar/v1`
- `pptx-audit/v1`
- `pptx-rollback/v1`
- `pptx-i18n-*` contracts
- `pptx-brand-check/v1` and related brand reports

The exact report schema is returned by `xdoc schema`; do not hard-code
unversioned field assumptions in a long-lived agent.

### Fields that matter to an agent

Depending on the command, reports may expose:

- input/output paths and command-specific metadata (not a universal content
  identity or hash);
- `status` and machine-readable schema version;
- `changedParts`;
- `semanticChanges`;
- `visualRisks`;
- `semanticIssues`;
- `warnings`;
- resolved selectors and created object references;
- expanded recipe operations;
- per-operation results, traces, and duration;
- analysis objects for text fitting, layout impact, or theme remapping; and
- capability summaries showing supported, preserve-only, or unsupported areas.

Evidence fields are report-specific. Some reports expose `agentGate`, some
expose issue severity or hashes, and others expose only command-specific status
and findings. Read the concrete versioned report schema before applying a gate;
a preview hash identifies the rendered artifact but does not prove OCR,
font-fallback, or pixel-level correctness.

At operation level, `opResults[]` can include `opIndex`, `op`, `status`,
`changedParts`, `semanticChanges`, `visualRisks`, `warnings`, `created`,
`createdIds`, `resolvedSelectors`, `expandedOps`, `analysis`, and `durationMs`.

### Structured error behavior

The published bridge error catalog has 24 codes, including:

`invalid_json`, `invalid_argument`, `invalid_arguments`, `unsupported_feature`,
`invalid_operation`, `invalid_package`, `invalid_xml`, `missing_part`,
`missing_relationship`, `encrypted_package`, `signed_package`, `zip_error`,
`patch_too_large`, `asset_too_large`, `input_error`, `output_error`, `output_exists`,
`invalid_sidecar`, `daemon_unavailable`, `invalid_request`, `protocol_error`,
`unknown_method`, `internal_error`, and `unknown_error`.

Structured error payloads carry a machine-readable kind and message; operation
failures can include an `opIndex`. Where a repair is meaningful, the payload can
also include a field `path`, `expected`, `actual`, a documentation reference, and
`suggestions[]` entries with `fixPatch`, `reason`, `confidence`, and `autoRetry`.
This allows an orchestrator to distinguish a malformed request from an invalid
deck, a policy rejection, an unavailable backend, or an internal failure while
still receiving a bounded next action.

The catalog is a published bridge contract, not a guarantee that every
implementation path has already normalized its internal kind into one of those
24 names. A worker should preserve an unknown kind as opaque data, use the
report and exit code for routing, and avoid branching on undocumented strings.
Specialized failures may also carry a command-specific `schemaVersion` that is
newer or broader than the shared error-schema enum, so error ingestion should
preserve unknown version strings instead of rejecting the diagnostic itself.

### Process exit codes

The top-level contract currently defines:

| Code | Stage      | Meaning                                                                                 |
| ---- | ---------- | --------------------------------------------------------------------------------------- |
| 0    | success    | Command completed successfully                                                          |
| 2    | args       | Argument parsing or validation failed                                                   |
| 3    | input      | Input was invalid, or a structured planner/gate report completed with a non-pass status |
| 5    | slide      | A requested slide selection was out of range                                            |
| 6    | parse      | PPTX parsing failed                                                                     |
| 7    | pdf        | PDF generation failed                                                                   |
| 8    | png        | PNG generation failed                                                                   |
| 9    | output     | Output validation or writing failed                                                     |
| 10   | dependency | A required backend was unavailable                                                      |
| 11   | internal   | Unexpected internal failure                                                             |
| 12   | batch      | At least one batch item failed                                                          |

Do not discard stdout automatically on a non-zero gate result. Several
JSON-producing planner and validation commands still return a complete,
parseable report when the exit code is 3; the report explains the blockers.

### Machine-executable fixes

Semantic audit findings can include a fix object with:

- a patch operation array (`fixPatch`);
- a reason;
- a confidence score;
- an `autoRetry` decision; and
- a `requiresRawXml` flag.

The current deterministic semantic fix generators are intentionally narrow:
they cover a dangling animation reference and a uniquely resolvable orphan
relationship. They do not make arbitrary package repair safe, and the
relationship repair may still require the raw-XML boundary.

Some visual issues also expose applicable fixes. An agent may apply a fix only
when the confidence and policy thresholds allow it, then rerun the same gate.
The fix is a proposal, not a license to bypass review.

Treat alternative candidate fixes as mutually exclusive choices even when a
top-level payload advertises `autoRetry`. If an ambiguity report contains more
than one candidate-specific suggestion, require a refined selector or an
explicit human choice; never apply the first suggestion by array order. A
semantic relationship repair may be retried automatically only when the target
is unique, and any `requiresRawXml` flag still requires the explicit raw-XML
policy boundary.

The default visual-repair policy is intentionally asymmetric: unambiguous
on-slide clamping and edge-margin nudges may be marked `autoRetry: true`, while
overlap, overflow, and alignment repairs remain review-first proposals. A
closed loop therefore means “repair, re-run, and re-measure”, not “accept the
first suggested patch”.

## Static and rendered visual validation

### `vision-check`

`xdoc pptx vision-check` emits `pptx-vision/v1`. It can detect:

- shapes outside the slide;
- text too close to the edge;
- estimated text overflow;
- multi-column overflow or layout review signals;
- unexpected wrapping in single-line roles;
- geometry overlap;
- arrangement imbalance;
- low-contrast explicit text colors on solid backgrounds;
- decoration bleed across rounded-card boundaries;
- fonts below a configured threshold;
- dangling relationships or references;
- duplicate ids; and
- invalid package parts, relationships, XML, attributes, or ranges.

The report explicitly separates authored-geometry and semantic findings from
renderer-dependent observations. It is a static gate, not a substitute for a PNG
review.

The report also includes a semantic summary with the current rule-corpus counts
(`sourceRuleCount` and `normalizedRuleCount`). These numbers make it possible
to detect an unexpectedly older or thinner validator at worker start-up without
pretending that a rule count alone proves visual correctness.

### `preview`

`preview` renders per-slide PNG files and can create a contact sheet. Its
`pptx-preview/v1` manifest records slide number, file dimensions, byte length,
and a hash for each page, plus the contact sheet identity when requested.

### `vision-diff`

`vision-diff` compares source and candidate visual issues and classifies them as
`new`, `resolved`, `inherited`, or `changed`. The report's `agentGate` blocks
new high/medium issues and inherited issues that became high/medium. Existing
unchanged source issues remain visible rather than being misreported as new.

The report also records evidence classes such as rendered, estimator,
review-only, and static-geometry. This prevents a static estimate from being
treated as stronger evidence than an observed renderer result.

### `contact-diff`

`contact-diff` produces a source/candidate side-by-side PNG and a
`pptx-contact-diff/v1` report. It tracks changed, unchanged, missing, and added
slide pairs. The `agentGate` means the pairs are complete and safe to hand to a
human reviewer; changed slides are expected and do not, by themselves, fail the
gate.

## Data-driven slide generation

### `bind-data`

`bind-data` applies JSON values to named or selected text, table, and chart
objects. A binding can use a path such as `{{kpi.revenue}}`, replace a table
from an array, or map chart categories and series from structured data.

The runtime examples demonstrate a single patch that:

1. creates a title text box with placeholders;
2. creates an editable table;
3. creates an editable chart; and
4. binds a JSON object into all three.

This keeps the data source separate from the presentation structure and makes
regeneration deterministic.

The template language is deliberately small and data-only. In addition to
scalar paths such as `{{kpi.revenue}}`, the current bridge supports `{{#each
items}}...{{/each}}` for repeated text and `{{#if path}}...{{/if}}` for
conditional content. Missing paths are reported as invalid input instead of
silently becoming empty presentation content. The patch-level `foreach`, `if`,
and `try` operations provide a separate, schema-defined control-flow layer for
choosing operations; neither layer executes arbitrary host code.

### `template-fill`

For a template-driven workflow, use:

```bash
xdoc pptx template-fill data.json --template template.pptx --bindings bindings.json --output generated.pptx
```

The command is a convenience wrapper around the same guarded binding primitives;
it does not introduce a second data model.

### Layout contracts

The catalog currently contains six built-in layout content contracts. A layout
contract defines the required content shape for operations such as
`populate-slide`. Agents can discover the contract and validate content before
creating a slide, which is safer than relying on positional assumptions.

## Translation and localization workflows

Translation is handled as a source-preserving edit. The source deck remains
read-only, and the candidate is checked for both target text correctness and
style/layout stability.

`--source-lang` is a controlled detector mode, not a general language-identification
service: the current contract normalizes `zh`, `en`, and `multi` (with the CLI's
`cjk` alias), using structural
CJK and conservative Latin heuristics. Decks dominated by other scripts should
be classified through reviewed units or an upstream localization system rather
than treated as automatically understood by the scanner.

### Recommended sequence

```bash
xdoc pptx i18n-scan --source source.pptx --source-lang multi --mode source --output i18n-source.json --json
xdoc pptx i18n-plan --source source.pptx --units-file i18n-source.json --data translations.json --output i18n-plan.json --json
# Use the planner's textPlan artifact only when that lower-level route is selected.
xdoc pptx i18n-text-plan --source source.pptx --data i18n-text-plan-input.json --output i18n-text-plan.json --json
xdoc pptx replace-text --source source.pptx --data replacements.json --output translated.pptx --json
xdoc pptx i18n-style-diff --source source.pptx --candidate translated.pptx --json
xdoc pptx i18n-scan --source translated.pptx --mode candidate --units-file i18n-source.json --data translations.json --output i18n-candidate.json --json
```

The source scan emits `i18nUnits` as the stable inventory. Its `hits[]` entries
are diagnostic evidence; do not derive replacement indexes or selectors from
`hits[].location`. The planner consumes unit ids and source hashes, then blocks
unknown ids, source mismatches, missing translations, conflicting scopes, and
preserve units that unexpectedly receive target text. Its `applyGate` is the
permission to materialize guarded `replaceText`, `replaceChartText`, or
run-level patch artifacts; a planner `pass` is not by itself final delivery
approval.

Planner status is deliberately explicit: `blocked` means conflicts exist,
`review-required` means an apply-blocking review remains, `incomplete` means a
required translation is missing, and `pass` is the only state that can open the
apply gate. Final delivery still requires the candidate, style, visual, and text
overflow gates.

For a lower-level text-only route, `i18n-text-plan` emits run-level `set-run`
operations from the planner's `pptx-i18n-text-plan-input/v1` artifact. Mixed-style
paragraphs whose anchors cannot be mapped safely remain review-required instead
of being flattened heuristically.

Review-classified units are fail-closed. A reviewed unit enters the normal
execution primitives only when its translation carries
`reviewDecision: "translate"` and a matching `sourceHash`; otherwise a supplied
target remains a review conflict. This is also how shared slide-layout and
slide-master text is explicitly authorized.

Use the full plan persisted by `--output` to materialize those artifacts; the
compact stdout result is intentionally a routing summary. `replace-text`
replaces existing text nodes or typed user-visible text attributes with source
text/hash/index guards and does not rebuild paragraph or run structure.

### Chart text

Use `replace-chart-text` only with the explicit safety boundary:

```bash
xdoc pptx replace-chart-text --source source.pptx --data chart-replacements.json --output translated.pptx --visible-cache-only --json
```

The visible-cache-only mode updates visible chart labels while leaving workbook,
relationship, external-path, and formatting-code parts untouched. Embedded
workbook findings remain review signals.

### Style gate

`i18n-style-diff` ignores approved visible text content changes but checks run
and paragraph styles, text-box structure, tables, chart XML, relationships,
hyperlinks, animation/timing parts, and style-relevant part presence. Font-size
repairs made solely to fit translated text are reported separately.

After applying a translation, run candidate mode as the authoritative
target-consistency gate. It verifies the translated units supplied in the
`translations[]` input using the source unit selectors; it does not silently
authorize omitted review units. For every unit it verifies,
`currentText == targetText` must hold as canonical raw text: no trimming, case
folding, whitespace collapsing, or Unicode normalization is performed. A
selector-missing, selector-ambiguous, source-residual, or target-mismatch
blocker therefore remains a delivery failure even when the file opens.

## Brand, theme, chrome, and refurbishment

### Brand profiles

A brand profile can declare approved colors, fonts, required logo markers, and
required footer text:

```bash
xdoc pptx check-brand deck.pptx --brand brand.json --json
xdoc pptx apply-brand deck.pptx --brand brand.json --output branded.pptx --json
```

`apply-brand` compiles usable brand fields into ordinary theme, master, and
default-text-style patch operations. Run `check-brand` again after applying.

### Theme and style packs

The runtime exposes theme and style catalogs:

Replace the uppercase tokens below with ids returned by `catalog themes`.

```bash
xdoc pptx catalog themes --json
xdoc pptx swap-theme deck.pptx --theme THEME_PACK_ID --output themed.pptx
xdoc pptx swap-style deck.pptx --style STYLE_PACK_ID --output styled.pptx
xdoc pptx remap-theme deck.pptx --theme THEME_PACK_ID --scope text,shapes,tables,charts --output remapped.pptx
```

Theme packs describe reusable colors, fonts, backgrounds, chart defaults, and
generator defaults. Style packs describe master/default-text styling and
density/rhythm choices. Remapping reports which native objects changed, skipped,
or remained preserve-only.

### Structural chrome

Headers, footers, page numbers, and rules are treated as identifiable structure:

Replace `DECKKIT_ID` with a registered DeckKit id from the current catalog.

```bash
xdoc pptx chrome-detect deck.pptx --json
xdoc pptx chrome-remove deck.pptx --roles header,footer,page-number,rule --output clean.pptx
xdoc pptx chrome-apply clean.pptx --deckkit DECKKIT_ID --output styled.pptx
```

Detection should precede removal. Removal uses real `remove-shape` operations,
and application adds deterministic native chrome from the selected visual
system.

### Skin-first refurbishment

For an existing deck whose content should remain intact:

```bash
xdoc pptx refurbish-skin --source old.pptx --deckkit DECKKIT_ID --output new.pptx --json
xdoc pptx refurbish-audit --source old.pptx --final new.pptx --json
xdoc pptx contact-diff --source old.pptx --candidate new.pptx --output refurbish-contact.png --dpi 192 --json
```

The audit checks slide count and preservation of source text, shapes, pictures,
tables, charts, media, notes, hyperlinks, and mapped source slides. A contact
diff is still required for human visual review.

Without `--map`, the default comparison is a zero-based one-to-one slide
mapping. Split, merge, reorder, or intentional slide-count changes require an
explicit reference map; approved changes belong in that map rather than being
inferred from a visual diff. This keeps preservation claims tied to an explicit
source-to-output identity relation.

The current skin-first orchestration profile is deliberately bounded: the
default guard is 2,500,000 input bytes, 120 slides, and 1,200 shapes. The limits
are a release-specific safety gate while the pipeline avoids repeated full-deck
passes; they are not a universal maximum for PPTX files or a promise that a
larger deck cannot be handled by another workflow. The command's default gates
also reject new high or medium visual issues and require the preservation audit
to pass. `refurbish-skin` reports a suggested contact-diff path but does not
render that contact sheet by default, so run `contact-diff` explicitly before
human approval.

### Template and style reuse

The bridge also supports explicit reuse workflows:

```bash
xdoc pptx slide-copy -i target.pptx --source source.pptx --slide 0 --output combined.pptx
xdoc pptx extract-style reference.pptx --output style.json --json
xdoc pptx import-template reference.pptx --name reusable-template --output assets --json
```

`slide-copy --slide` uses a zero-based source slide index. `extract-style`
produces a structured style profile for inspection or reuse. `import-template`
extracts a reusable template profile and updates the requested asset catalog
location; it is an intentional asset-development operation, not part of an
ordinary source-preserving edit.

`slide-copy` emits `pptx-slide-copy/v1`. Its dry-run is a read-only,
fingerprint-bound plan: require `status: "ready"`, matching target/donor
SHA-256 values, no `preflight.blockers`, and review `preflight.risks` plus the
planned parts/relationships before apply. It is not a patch report and does not
carry `opResults[]`.

## Preserve-first package and safety model

### Package preservation

The native PPTX package layer is an OPC/ZIP reader and writer. Its default
policy is to:

- preserve unknown parts and relationships;
- preserve untouched parts byte-for-byte where possible;
- emit deterministic ZIP output with stable entry ordering and timestamps;
- reuse identical binary assets when safe; and
- report touched package parts in apply results.

These behaviors reduce accidental collateral changes and make diffs more
meaningful.

### OOXML semantic integrity

Preserving bytes is useful only when the resulting package is still semantically
valid. Apply and dry-run therefore audit the parts that may be written, then
re-audit the resulting package. The checks cover:

- schema-derived child-element order, including the generated write-time rules;
- `r:id`, `r:embed`, and `r:link` references and their relationship targets;
- duplicate identifiers across the relevant `cNvPr`, slide, layout, and master
  identity domains;
- OPC content-type declarations, relationship parts, and part truth; and
- required attributes, legal comparisons, and attribute/value range constraints.

Exact source-rule inventory counts are maintainer evidence, not part of the
public runtime contract, and are therefore not duplicated here. Public findings
retain their part, element, attribute, and rule context in `semanticIssues[]`;
a bounded `fixPatch` is only a proposal and must be reapplied and revalidated
before it can clear a gate.

### Regression evidence is part of the product

Every published build should pair its binary smoke probe and schema snapshot
with representative PPTX fixtures and machine-readable conformance results.
Private source-file or test-declaration inventories are not release evidence.
The operational point is unchanged: an execution layer earns trust through
repeatable public probes and artifacts, not only through a long operation list.

### Macro, signature, and encryption policy

The current native defaults are conservative:

- encrypted packages are rejected;
- digitally signed packages are rejected on save; the current CLI schema does
  not expose a signature-removal switch;
- macro/VBA parts are preserved by default, and the current CLI schema does not
  expose public strip or reject switches; and
- preserve-only observations identify complex animations, transitions,
  SmartArt-like structures, VBA, and other long-tail content that was not
  edited.

Preservation is not the same as editability. A preserve-only object can survive
an edit while remaining outside the safe high-level mutation surface.

### Raw XML escape hatch

`patch-ooxml` is disabled by default. Enable it explicitly:

```bash
xdoc pptx apply --patch raw-xml-patch.json --input source.pptx --output candidate.pptx --allow-raw-xml --json
```

Raw XML bypasses schema-v1 guarantees and should be isolated, reviewed, and
followed by `inspect`, semantic checks, and rendered checks.

### Asset boundaries

For file-backed patch assets:

- `--asset-root` defaults to the patch file directory;
- `assetSource.path` must be relative; and
- the resolved path must remain inside the asset root.

The default patch size limit is 32 MiB and the default individual asset limit is
64 MiB. They can be changed intentionally with:

```text
XDOC_PPTX_MAX_PATCH_BYTES
XDOC_PPTX_MAX_ASSET_BYTES
```

Binary payloads can also be supplied as `bytesBase64`. Picture, movie, poster
frame, image-bullet, and OLE binary data can participate in deterministic
deduplication.

### ZIP-bomb and path guards

The native package reader rejects unsafe ZIP entry paths and applies default
limits of 200 MiB uncompressed payload and 4096 package parts. These guards are
part of the document boundary, not an afterthought in the caller.

### Atomicity

Patch execution is all-or-nothing at the presentation-state boundary: the
operation set runs against an isolated candidate, and the original presentation
adopts it only after every operation succeeds. In one-shot mode, PPTX delivery
and sidecar delivery are separate filesystem writes rather than one atomic
evidence transaction. In daemon mode, a failed patch does not replace the prior
presentation, but the session can advance before output-path validation,
serialization, PPTX writing, or sidecar writing completes. A later delivery
failure can therefore leave the in-memory session advanced; inspect or restart
that session before retrying.

## Sidecars, replay, audit, and rollback

Successful `new` and `apply` operations write a sidecar by default:

```text
<output>.xdoc.json
```

The sidecar schema is `pptx-apply-sidecar/v1` and records:

- the materialized patch, with path-based assets inlined;
- input and output paths plus command metadata;
- patch source and asset-root metadata;
- the xdoc build id; and
- the apply report and operation traces.

Treat this as one revision's materialized plan-and-evidence record, not a
cryptographic commit or a self-contained deck archive. Path-based patch assets
are inlined, but the source and output PPTX bytes are not; the record does not
carry input/output deck hashes, patch hashes, parent links, or a branch chain,
and path metadata can retain absolute paths. An agent can inspect the recorded
patch and report without re-deriving selectors, while replay or rollback of an
existing-deck edit still requires the currently resolved input to remain
accessible or to be remapped by the surrounding system. Replay does not verify
that the resolved input still matches the original source, so blob retention,
source/output hashes, and revision history remain orchestrator
responsibilities.

```bash
xdoc pptx audit --from-sidecar updated.pptx.xdoc.json --json
xdoc pptx replay --from-sidecar updated.pptx.xdoc.json --output recovered.pptx
xdoc pptx rollback --from-sidecar updated.pptx.xdoc.json --output recovered.pptx
```

`audit --from-sidecar` parses and projects the sidecar's recorded history; it
does not reopen the candidate or rerun a fresh semantic audit. Use `inspect`,
`vision-check`, `diff`, and rendered evidence when current candidate bytes must
be revalidated.

Use `--no-sidecar` only when the evidence record is intentionally stored
elsewhere.

Rollback is recovery from the sidecar's recorded history, not a generic inverse
patch against an arbitrary later deck. When the recorded input exists, the
recovery strategy can copy it; a new-deck sidecar can fall back to the minimal
deck strategy defined by the contract.

## Daemon mode

The daemon is a local loopback service for multi-step agent sessions:

```text
xdoc daemon start
  → foreground loopback server
  → state file (default: $TMPDIR/xdoc-daemon-state.json)
  → in-memory deck sessions
```

Defaults in v0.3.5:

- loopback TCP address: `127.0.0.1:0`;
- idle session timeout: 300000 ms;
- maximum sessions: 64;
- maximum active data-plane connections: 64; and
- auto-spawn readiness timeout: 5000 ms.

Relevant environment variables are:

| Variable                       | Purpose                                     |
| ------------------------------ | ------------------------------------------- |
| `XDOC_DAEMON_STATE`            | Override the state-file path                |
| `XDOC_DAEMON_PORT`             | Override the loopback listen port           |
| `XDOC_DAEMON_IDLE_MS`          | Change the idle timeout                     |
| `XDOC_DAEMON_MAX_SESSIONS`     | Change the session pool limit               |
| `XDOC_DAEMON_AUTO_SPAWN`       | Disable automatic spawn with `0` or `false` |
| `XDOC_DAEMON_SPAWN_TIMEOUT_MS` | Change auto-spawn readiness timeout         |
| `XDOC_DAEMON_LOG`              | Override the auto-spawn log path            |

Sessions are keyed by canonical input paths and, after save, by output paths.
Requests for the same filesystem-identity deck session are FIFO-serialized, so
symlink, hard-link, and host case/separator aliases share one history. Different
deck sessions may execute concurrently within the disclosed connection limit.

The daemon defaults to a loopback-only local RPC boundary and authenticates
requests with a 256-bit bearer token stored in its state file. State replacement
uses a temporary file and rename, with mode `0600` where supported; keep both the
state and auto-spawn log private. The daemon host is fixed to `127.0.0.1`;
`XDOC_DAEMON_PORT` changes only the port and cannot broaden that local boundary.
A cached session is authoritative for its keyed path
until eviction and is not re-stat'ed or hash-checked on every cache hit, so use
one-shot mode or exclusive path ownership when another process may replace an
input file.

The verified runtime emits `xdoc-daemon-status/v2` for status reports. It
includes separate data and control endpoints plus active-connection and
mutation counters. The internal newline-delimited daemon framing is not a
published compatibility boundary; integrate through `xdoc daemon` and the
complete `commands.daemon` schema disclosure.

Use `--daemon-strict` in a workflow where a lost session would invalidate the
run's assumptions. Use plain `--daemon` when a safe one-shot fallback is
acceptable.

Daemon state is bound to the process id and CLI revision. If status reports a
stale or revision-mismatched daemon, retire it with `xdoc daemon stop` and let
the current binary auto-spawn a new one; do not manually delete or rewrite the
state file.

## Stdio JSON-RPC mode

For an Agent host that already owns a long-lived child process, `xdoc json-rpc`
publishes `xdoc-json-rpc-contract/v1` over newline-delimited UTF-8 JSON-RPC 2.0.
There is no initialize handshake. Frames are limited to 8 MiB, execute serially
with backpressure, and stdout is protocol-only; logs and diagnostics use
stderr.

The methods are `xdoc.ping`, `xdoc.capabilities`, `pptx.inspect`, `pptx.apply`, and
`xdoc.shutdown`. `pptx.apply` and shutdown require a request id; sent as
notifications they are ignored without mutation. Non-dry-run apply requires an
`outputPath`. Results use `xdoc-json-rpc-result/v1`, preserving the exact
structured report in `value` and declaring binary outputs as artifact refs.

`progressToken` opts into best-effort begin/end `$/progress` notifications.
`$/cancelRequest` only suppresses queued work and cannot interrupt the already
dispatched synchronous method. Batch items are also serial. Retrieve the live
contract with `xdoc.capabilities`, then shut down with an id-bearing
`xdoc.shutdown` request or close stdin after the active request completes.

Daemon, JSON-RPC, and MCP are adapters over the same business handlers, not new
validation policies. Keep dry-run, apply, post-apply inspection, evidence, and
publication gates above the chosen transport.

## MCP stdio mode

For an MCP client, `xdoc mcp` publishes the tools-only
`xdoc-mcp-contract/v1` over stdio. Configure the client with command `xdoc` and
arguments `["mcp"]`, then read the complete live contract from
`commands.mcp.protocolContract` rather than inferring behavior from command
presence.

The verified runtime exposes `xdoc_schema`, `pptx_inspect`, and `pptx_apply`.
It supports the modern `2026-07-28` era and the disclosed 2025 compatibility
eras; one connection serves one era and no 2024 revision is negotiated. Result
envelopes use `xdoc-mcp-tool-result/v1`. A business failure is returned with
`isError: true` while preserving the xdoc report; it is not converted into a
JSON-RPC protocol error. The full envelope appears in `structuredContent` for
eras that support it and as compact JSON in `content` for the disclosed
content-only era.

Pass absolute paths. `overwrite` and raw-XML access default to false, artifact
bytes stay outside the protocol channel, and remote exposure is out of scope.
MCP replaces only its disclosed discover/inspect/apply adapter calls; commands
such as conversion and visual checking still use the CLI, and all dry-run,
post-apply inspection, evidence, and publication gates remain in force.

### Separately published service adapters

This repository does not currently define a public HTTP route contract. Do not
infer service endpoints, authentication defaults, queue behavior, or mutation
coverage from private deployments or source layouts. If a service adapter is
published later, version and validate it independently from the CLI contract;
the local `xdoc daemon` remains the only service-like boundary described here.

## Runtime and embedding guidance

### CLI integration

The CLI is suitable for a worker process, a job queue, or a tool call. For
machine callers:

1. pin the executable version;
2. capture `xdoc schema` at startup or cache it by version;
3. request the documented machine result and keep stdout and stderr separate;
4. preserve the report and sidecar with the output;
5. enforce an output policy using the report-specific status, gates, hashes,
   and issue severities when present; and
6. re-run the relevant gate after every automatic repair.

The process boundary is command-specific and is published in a command- or
family-level `ioContract` when one is available. Coverage is not yet uniform
across every top-level command and PPTX action; for commands without a
fine-grained contract, pin the runtime and validate the observed report and
exit behavior before integrating it.

| Channel     | Integration rule                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stdout      | Parse only the documented machine result. With `--json`, both successful and structured failure reports may be emitted on stdout; large i18n planner/scan commands use compact JSON by default and reserve `--json-full` for the complete report. Conversion, extraction, and preflight primarily write filesystem artifacts and may leave stdout unused.                                                                         |
| stderr      | Treat it as diagnostics or logs. Without JSON mode, human-readable errors are written here; in JSON mode, stderr may remain empty even when the command exits non-zero.                                                                                                                                                                                                                                                           |
| exit status | Interpret it together with the command report. Exit 0 means the command-level success condition passed, but exit 3 can still accompany a complete planner or gate report that explains why publication is blocked. Some comparison commands keep their gate verdict solely in `agentGate` while returning 0 after a completed comparison. A stopped `xdoc daemon status --json` query can also return 0 with `status: "stopped"`. |
| filesystem  | Resolve output identity from the schema, retain the produced manifest/report, and never infer success merely from the existence of a file. Existing paths normally require an explicit overwrite policy.                                                                                                                                                                                                                          |

This distinction matters in a queue worker: capture stdout, stderr, exit status,
and declared artifacts independently, then route the job from the versioned
report. Do not discard stdout simply because the process returned non-zero, and
do not treat exit 0 as a universal publish decision.

### Process integration

Public integrations should wrap the `xdoc` process or its documented daemon
commands and parse versioned machine reports. No in-process library API is
implied by this repository. If another API is published separately, give it an
independent compatibility adapter and version policy.

### Deployment

The native-first executable avoids a requirement for a full office desktop
installation. It still needs the runtime backends and fonts required by the
requested conversion. Runtime conversion authorization and distribution
licensing are separate boundaries. The verified runtime publishes this behavior
under `commands.convert.licensePolicy`: missing or inactive authorization limits
every PPTX input handled by `convert` to 2 MiB, while PDF/PNG output also carries
a visible demo watermark. A signed license JSON may be supplied through
`--license` or the documented lookup locations. Probe the exact binary because a
later release can revise the policy contract.

Verify the `LICENSE` file and bundled third-party notices in the exact binary
archive before redistribution or commercial deployment. Different bundled
components may carry different terms; this document is a technical description,
not legal advice.

### Font and cold-start determinism

Rendering provenance includes more than the PDF/PNG backend. Font lookup can
change pagination, glyph fallback, and wall-clock cost, so a worker should make
font policy explicit:

- set `XDOC_FONT_CACHE` to a controlled, persisted cache location when repeated
  jobs should share resolved fonts;
- set `XDOC_DISABLE_REMOTE_FONTS=1` or `true` for an offline-only worker; and
- when an offline cache has been fully provisioned, place the resolver's
  `.xdoc-font-cache-ready` marker in that cache so missing families do not cause
  remote probing.

Keep the cache policy, font inventory, backend identity, and render manifest with
the job record. Benchmark cold-cache, warm-cache, and daemon-reused runs
separately; `durationMs` and conversion timing fields are evidence for one build,
not a cross-machine latency SLA.

## Command reference

### Top-level commands

| Command    | Purpose                                                                       | Typical output                             |
| ---------- | ----------------------------------------------------------------------------- | ------------------------------------------ |
| `convert`  | Convert document files to PDF, PNG, JSON, Markdown, or text                   | File, directory, manifest, or batch report |
| `html2md`  | Convert HTML files to Markdown                                                | Markdown file/directory                    |
| `extract`  | Extract PPTX map, resources, notes, links, and fonts                          | Versioned JSON artifact                    |
| `check`    | Run fonts, links, compatibility, assets, and policy checks                    | `preflight/v1` JSON                        |
| `pptx`     | Create, patch, inspect, render, compare, translate, brand, or refurbish decks | PPTX plus versioned reports                |
| `pdf`      | Inspect, extract text from, or render PDFs                                    | PDF diagnostics, text, or PNG              |
| `daemon`   | Start, inspect, or stop the local session service                             | `xdoc-daemon-status/v2` or diagnostics     |
| `json-rpc` | Serve the published stdio Agent transport                                     | `xdoc-json-rpc-result/v1` NDJSON frames    |
| `mcp`      | Serve the published tools-only MCP transport over stdio                       | MCP frames with `xdoc-mcp-tool-result/v1`  |
| `schema`   | Print the machine-readable CLI and patch contract                             | `cli-agent/v1` JSON                        |

### PPTX action families

| Family                   | Actions                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| Creation and mutation    | `new`, `apply`, `recipe`, `template-fill`                                                           |
| Discovery                | `inspect`, `select`, `catalog`, `extract-style`                                                     |
| Rendering and comparison | `preview`, `vision-check`, `diff`, `vision-diff`, `contact-diff`                                    |
| Translation              | `i18n-scan`, `i18n-plan`, `i18n-text-plan`, `i18n-style-diff`, `replace-text`, `replace-chart-text` |
| Refurbishment            | `refurbish-skin`, `refurbish-audit`, `chrome-detect`, `chrome-remove`, `chrome-apply`               |
| Theme and brand          | `remap-theme`, `swap-theme`, `swap-style`, `check-brand`, `apply-brand`                             |
| Reuse and history        | `slide-copy`, `import-template`, `replay`, `audit`, `rollback`                                      |

### Selector index conventions

| Boundary                                                         | Index base |
| ---------------------------------------------------------------- | ---------- |
| `convert`, `extract`, `check`, `pdf`, most `pptx --slides` flags | 1-based    |
| Patch `slide` fields                                             | 0-based    |
| `select` `slideIndex` query field                                | 0-based    |
| `slide-copy --slide`                                             | 0-based    |

When in doubt, ask the command-specific schema instead of guessing.

## Versioned contracts

The following identifiers are useful when validating an integration:

| Contract                                                                                | Meaning                                                     |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `cli-agent/v1`                                                                          | Top-level CLI discovery response                            |
| `capabilities/v1`                                                                       | Document kinds, output formats, and backend requirements    |
| `pptx-patch/v1`                                                                         | Patch operation registry and JSON schema                    |
| `pptx-inspect/v1`                                                                       | Read-only deck inspection                                   |
| `pptx-select/v1`                                                                        | Deterministic selector resolution                           |
| `pptx-preview/v1`                                                                       | Rendered PNG manifest                                       |
| `pptx-vision/v1`                                                                        | Static and semantic visual-risk report                      |
| `pptx-diff/v1`                                                                          | Deterministic structural source/candidate diff              |
| `pptx-vision-diff/v1`                                                                   | Source/candidate visual issue diff                          |
| `pptx-apply/v1`                                                                         | Apply result                                                |
| `pptx-dry-run/v1`                                                                       | Non-writing apply result                                    |
| `pptx-apply-sidecar/v1`                                                                 | Materialized patch and evidence record (not a deck archive) |
| `pptx-audit/v1`, `pptx-rollback/v1`                                                     | Sidecar history projection and bounded recovery             |
| `pptx-contact-diff/v1`                                                                  | Source/candidate contact sheet evidence                     |
| `pptx-recipe/v1`, `pptx-recipe-compile/v1`                                              | High-level recipe input and compiled operation report       |
| `pptx-i18n-units/v1`, `pptx-i18n-translations/v1`                                       | Stable translation inventory and guarded translation input  |
| `pptx-i18n-scan-result/v1`, `pptx-i18n-candidate-result/v1`, `pptx-i18n-plan-result/v1` | Compact scan, candidate-gate, and planner results           |
| `pptx-i18n-scan/v1`, `pptx-i18n-plan/v1`                                                | Persisted translation inventory/gate and execution plan     |
| `pptx-i18n-text-plan-input/v1`, `pptx-i18n-text-plan/v1`                                | Lower-level run-mapping input and text plan                 |
| `pptx-replace-text/v1`, `pptx-replace-chart-text/v1`                                    | Guarded visible-text replacement reports                    |
| `pptx-i18n-style-diff/v1`                                                               | Translation-specific style and structure gate               |
| `pptx-refurbish-skin/v1`, `pptx-refurbish-audit/v1`                                     | Skin-first orchestration and preservation audit             |
| `pptx-chrome-detect/v1`, `pptx-chrome-remove/v1`, `pptx-chrome-apply/v1`                | Structural chrome discovery and mutation reports            |
| `pptx-brand-check/v1`, `pptx-theme-remap/v1`                                            | Brand compliance and native theme-remap reports             |
| `pptx-shape-catalog/v1`, `pptx-theme-catalog/v1`                                        | Discoverable shape and theme catalogs                       |
| `pptx-enum-registry/v1`, `pptx-error-catalog/v1`                                        | Controlled vocabularies and published bridge errors         |
| `pptx-xl-chart-type-map/v1`, `pptx-chart-style-catalog/v1`                              | Chart support-status map and style catalog                  |
| `batch/v1`                                                                              | Multi-input conversion summary                              |
| `map/v1`, `resources/v1`, `notes/v1`, `links/v1`, `fonts/v1`                            | Structured extraction artifacts                             |
| `preflight/v1`                                                                          | Input diagnostics and risk summary                          |
| `pptx-a11y/v1`                                                                          | Opt-in accessibility findings inside preflight              |
| `pptx-slide-copy/v1`                                                                    | Fingerprint-bound cross-deck structural plan/report         |
| `pdf-inspect/v1`, `pdf-text/v1`                                                         | PDF diagnostics and extraction                              |
| `xdoc-daemon-status/v2`                                                                 | Runtime daemon state, endpoint, and mutation diagnostics    |
| `xdoc-json-rpc-contract/v1`, `xdoc-json-rpc-result/v1`                                  | Stdio Agent protocol and result envelope                    |
| `xdoc-mcp-contract/v1`, `xdoc-mcp-tool-result/v1`                                       | MCP stdio tool protocol and result envelope                 |

Treat a schema version as a compatibility boundary. If a worker sees an unknown
version, it should preserve the raw report and stop at the integration boundary
rather than silently coercing fields.

## Adoption guidance by role

### For a regular user

Start with conversion and inspection:

```bash
xdoc --version
xdoc convert deck.pptx --to pdf --output deck.pdf
xdoc pptx inspect deck.pptx --json
```

For an edit, ask for a separate output path and request a preview/contact sheet.
The source deck should remain untouched unless replacement is intentional.

### For an agent author

Use schema discovery and the guarded loop:

```text
schema index
  → inspect
  → select
  → patch
  → dry-run
  → apply
  → vision-check
  → preview
  → diff
  → sidecar
```

Store source hashes, selected object references, patch JSON, reports, and
rendered evidence as one job record.

### For a platform or infrastructure lead

Treat xdoc as a versioned execution service:

- run it in an isolated worker with explicit input/output roots;
- pin the binary and capture the runtime schema;
- set patch, asset, ZIP, session, and timeout limits;
- make report gates part of job state;
- retain sidecars and hashes for reproducibility;
- separate static gate failures from renderer failures; and
- expose preserve-only and unsupported capabilities to the planner.

The high-leverage property is not only that xdoc can write a deck. It is that
the same call can declare what was attempted, what package parts changed, which
objects were resolved, what risks remain, and how to replay the operation.

A practical job record can be organized into five immutable groups:

1. **Inputs:** source hash, approved asset root, policy limits, and the exact
   `cli-agent/v1` schema snapshot.
2. **Plan:** patch or recipe, resolved selector candidates, and the requested
   output identity.
3. **Candidate:** the separately written PPTX plus changed-part and operation
   results.
4. **Evidence:** dry-run, semantic, preflight, preview, visual-diff, and
   contact-sheet reports, each retaining its schema version.
5. **History:** sidecar, backend/font provenance, retention metadata, and the
   decision to publish, retry, quarantine, or roll back.

This layout lets a platform measure failure by stage, replay a deterministic
attempt, and keep a human review queue focused on the slides or findings that
actually changed.

### For an investor or product strategist

The defensible technical value is the combination of:

1. a native document model;
2. an agent-readable operation and error contract;
3. source-preserving edits;
4. deterministic static and rendered evidence; and
5. a declared-dependency history record.

Those pieces reduce the cost of supervising AI-generated documents. They do not
eliminate human review or guarantee universal PPTX compatibility, so product
claims should stay tied to the measured contract and its declared limitations.

## Explicit limitations and non-claims

1. `docx` and `xlsx` are reserved in the v0.3.5 capability registry.
2. The full CLI is native-first; parser/PDF WebAssembly paths do not imply a
   browser implementation of every command.
3. Complex animations, transitions, SmartArt-like content, VBA, and other
   long-tail structures may be preserve-only or require a specialized bridge.
4. Static vision checks are not pixel proof. Use `preview`, `contact-diff`, and
   human review for renderer-dependent questions.
5. Font availability and backend versions can change PDF/PNG output. Inspect
   fonts and retain the render manifest for high-stakes delivery.
6. Encrypted and signed packages are rejected by default under the native safety
   policy.
7. Raw OOXML is an explicit escape hatch and is outside schema-v1 safety
   guarantees.
8. The public integration contract is the CLI and runtime schema; no in-process
   library API is promised by this repository.
9. Capability counts describe discoverable surfaces, not universal feature
   parity.
10. A successful command is not evidence that the content's facts, numbers,
    legal language, or brand approvals are correct.
11. This repository does not currently publish an HTTP service contract; do not
    infer routes or security defaults from the CLI or local daemon.
12. The supported external onboarding boundary includes the CLI, its schema,
    and the bundled local MCP stdio server described by
    `xdoc-mcp-contract/v1`. IDE-specific installers and remote MCP exposure are
    not part of the current release contract.
13. The v0.3.5 PDF discovery map omits the executable `pdf render` action even
    though CLI help and schema examples expose it. Integrations should pin the
    build and retain this exception until the discovery contract is corrected.
14. `discovery.commands`, `schema --mode index`, capability `enabled` status, and
    command `ioContract` fields are useful but not exhaustive or live host
    readiness proofs. Cache the full schema and run representative probes.
15. The runtime daemon status id is `xdoc-daemon-status/v2`; the daemon's
    internal RPC framing is not public. Direct Agent protocol access uses the
    independently published `xdoc-json-rpc-contract/v1` or
    `xdoc-mcp-contract/v1` stdio adapter.
16. Patch operations are transactional at the presentation-state boundary,
    but PPTX and sidecar writes are separate, and a daemon delivery failure can
    leave its in-memory session advanced. Sidecars do not carry deck hashes or
    cryptographic revision links.
17. Distribution licensing and runtime conversion authorization are separate.
    The current `commands.convert.licensePolicy` contract limits every PPTX
    input handled by `convert` to 2 MiB when authorization is missing or
    inactive, and PDF/PNG output also carries a visible demo watermark; verify
    the exact artifact and terms.

## Evidence and release discipline

For a reproducible deployment, record at minimum:

```bash
xdoc --version
xdoc schema > runtime-schema.json
xdoc schema --mode index > patch-index.json
```

Then store:

- the exact input hash;
- the patch or recipe source;
- the dry-run report;
- the apply report and sidecar;
- the vision and preview manifests;
- the final diff and preflight reports; and
- the runtime backend and font inventory when visual fidelity matters.

This document is anchored to xdoc 0.3.6 (5fe30221). Re-run the discovery
commands when upgrading; do not assume that a newer binary has the same
operation fields, report fields, or preservation defaults.

### Minimal release acceptance probe

A release candidate should prove more than `--help`. Use a deterministic patch
such as:

```json
{
  "schemaVersion": "pptx-patch/v1",
  "ops": [
    { "op": "add-slide" },
    {
      "op": "add-text-box",
      "slide": 0,
      "x": "0.8in",
      "y": "1.4in",
      "w": "8in",
      "h": "0.8in",
      "name": "ProbeTitle",
      "text": "xdoc release probe"
    }
  ]
}
```

Save it as `probe.patch.json`, then run the smallest end-to-end gate in a
temporary directory:

```bash
xdoc schema > runtime-schema.json
xdoc pptx apply --patch probe.patch.json --output probe.pptx --dry-run --json > dry-run.json
xdoc pptx apply --patch probe.patch.json --output probe.pptx --json > apply.json
xdoc pptx inspect probe.pptx --json > inspect.json
xdoc pptx vision-check probe.pptx --json > vision.json
xdoc pptx preview probe.pptx --output-dir preview --contact-sheet --contact-output contact.png --json > preview.json
xdoc pptx audit --from-sidecar probe.pptx.xdoc.json --json > audit.json
```

The acceptance conditions are intentionally small and exact:

- the schema identifies `cli-agent/v1` and the expected build;
- dry-run returns `pptx-dry-run/v1` and does not create `probe.pptx`;
- apply returns `pptx-apply/v1` and writes both the candidate and sidecar;
- inspect returns `pptx-inspect/v1` and resolves one slide plus `ProbeTitle`;
- vision returns `pptx-vision/v1` with no issues for this fixture;
- preview returns `pptx-preview/v1` and writes one slide PNG plus the contact
  sheet; and
- sidecar audit returns `pptx-audit/v1` with `status: "success"`.

Run broader conversion, chart, translation, and refurbishment probes when those
surfaces are part of the release. This compact check is only the minimum proof
that schema discovery, dry-run isolation, mutation, reopening, static evidence,
rendering, and history verification still connect end to end.

## Appendix A: complete canonical patch operation list

The current runtime index reports these 58 canonical operations:

```text
add-chart
add-connector
add-equation
add-freeform
add-group
add-image
add-layout
add-layout-placeholder
add-ole-object
add-paragraph
add-placeholder
add-run
add-shape
add-slide
add-table
add-text-box
add-video
append-slide-notes
bind-data
set-image
define-macro
duplicate-shape
duplicate-slide
fit-text
foreach
if
merge-table-cells
move-slide
patch-ooxml
populate-slide
remap-theme
remove-shape
remove-slide
remove-slide-notes
replace-paragraph-text
set-chart
set-chart-data
set-chart-text
set-connector
set-default-text-style
set-document-properties
set-layout
set-master
set-paragraph
set-run
set-shape
set-slide-animations
set-slide-background
set-slide-notes
set-slide-size
set-slide-transition
set-table
set-table-data
set-text-frame
set-theme
try
ungroup-shapes
use-macro
```

## Appendix B: practical command recipes

### Create a minimal deck and add a title

```bash
xdoc pptx new --output blank.pptx
xdoc pptx apply --patch title-patch.json --input blank.pptx --output titled.pptx --dry-run --json
```

### Inspect a selected slide and its resources

```bash
xdoc pptx inspect deck.pptx --json > inspect.json
xdoc extract deck.pptx --parts map,resources,fonts --pretty --output resources.json
```

### Batch-convert a directory

```bash
xdoc convert ./decks --recursive --to pdf --output-dir ./converted --report ./converted-report.json
```

### Diagnose a PDF generated from a deck

```bash
xdoc pdf inspect deck.pdf --json --pretty > pdf-inspect.json
xdoc pdf extract-text deck.pdf --engine pdfium --json --pretty > pdf-text.json
```

### Review a refurbishment with an explicit mapping

```bash
xdoc pptx refurbish-audit --source old.pptx --final new.pptx --map reference-map.json --json > refurbish-audit.json
xdoc pptx contact-diff --source old.pptx --candidate new.pptx --map reference-map.json --output contact-diff.png --dpi 192 --json > contact-diff.json
```

### Check a translated candidate

```bash
xdoc pptx i18n-style-diff --source source.pptx --candidate translated.pptx --allow-text-attrs tooltip,descr,title --json > style-diff.json
xdoc pptx vision-diff --source source.pptx --candidate translated.pptx --json > vision-diff.json
```

## Appendix C: a compact agent policy

When integrating xdoc into an agent, use this policy as a starting point:

1. Verify the binary and schema version.
2. Read the operation index before constructing a patch.
3. Inspect the source before selecting an object.
4. Require deterministic selector resolution.
5. Dry-run every non-trivial patch.
6. Apply to a new candidate path.
7. Reject unsupported or ambiguous operations.
8. Run semantic and visual gates.
9. Preserve the sidecar, reports, hashes, and previews.
10. Ask for human review when a gate is review-only, preserve-only, or
    renderer-dependent.

That policy turns xdoc from a file-writing utility into a controllable,
observable document execution step.
