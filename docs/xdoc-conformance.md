# xdoc conformance profile

This document proposes the minimum contract that an implementation must honor to
act as an **xdoc-compatible PPTX execution layer**. It is an ecosystem profile,
not an external standards-body publication and not a claim that xdoc is already
an industry standard.

The goal is to let different planners, workers, Agent skills, language bindings,
and future industry-specific profiles share one execution boundary:

```text
discover → plan → mutate → prove → publish
```

An implementation can add capabilities without implementing every PPTX feature.
Conformance is about truthful discovery, deterministic mutation, explicit
evidence, and safe failure. A small implementation that reports its limits is
more compatible than a large implementation that silently changes meaning.

## Status and scope

The current xdoc runtime exposes `cli-agent/v1`, `capabilities/v1`,
`pptx-patch/v1`, versioned PPTX reports, and a native CLI. This profile freezes
the parts that a third-party host needs to depend on and marks the remaining
parts as proposals.

| Area                       | Current xdoc surface                                                         | Profile status                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Discovery                  | `xdoc schema`, progressive projections, catalogs, examples                   | Required                                                                            |
| PPTX patching              | JSON patch envelope, selectors, dry-run, apply reports                       | Required for mutation profiles                                                      |
| Evidence                   | Inspect, vision, preview, diff, preflight, sidecar reports                   | Required for delivery profiles                                                      |
| Safety                     | Asset roots, byte limits, preserve-only/unsupported states, raw-XML opt-in   | Required                                                                            |
| Native distribution        | Versioned platform archives with PDFium and notices; npm CLI channel planned | Required for a binary profile; cross-channel and signature rules are still proposed |
| Governance                 | Repository-owned schemas and tests                                           | Proposed ecosystem process                                                          |
| Cross-implementation suite | Release probes and public conformance fixtures                               | Not yet a separately published certification suite                                  |

The profile covers PPTX execution. `docx` and `xlsx` may appear in a capability
registry as `reserved`; that does not make them conforming implementations of
this PPTX profile.

## Normative language

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** have
their usual RFC-style meaning. A profile declaration must name the runtime,
contracts, and capabilities it actually implements. “Supported” is not inferred
from a command name or a source package; it is a claim backed by a runtime
probe.

## Conformance levels

Implementations declare one or more levels. D → R → M → E → S is cumulative.
Level B is a distribution overlay that can be added to any implementation that
ships a native binary directly or through a package-manager entry point.

### Level D: discovery

An implementation at Level D:

1. exposes a machine-readable discovery document;
2. identifies the discovery contract (`cli-agent/v1` for the xdoc CLI);
3. identifies the patch contract separately (`pptx-patch/v1` and numeric patch
   `schemaVersion: 1` in the current release);
4. reports document kinds, output formats, required backends, and capability
   status; and
5. exposes operation schemas, controlled vocabularies, examples, and report
   identifiers or explicitly marks them undisclosed.

The discovery document is authoritative for the executable being called. A
checked-in snapshot can be used as a compatibility baseline, but it cannot
silently override a newer or older runtime response.

### Level R: read-only execution

An implementation at Level R additionally:

- reads PPTX inputs without modifying them;
- provides a structured inspection result with a stable report id;
- resolves selectors deterministically and returns candidate information on
  ambiguity;
- exposes conversion, extraction, or preflight results through declared
  artifacts and report contracts; and
- keeps machine output separate from human diagnostics.

For xdoc, representative contracts are `pptx-inspect/v1`, `pptx-select/v1`,
`pptx-preview/v1`, `pptx-vision/v1`, `preflight/v1`, and the extraction
`map/v1`, `resources/v1`, `notes/v1`, `links/v1`, and `fonts/v1` artifacts.

### Level M: guarded mutation

An implementation at Level M additionally:

1. accepts a versioned patch or an explicitly versioned high-level plan;
2. validates the operation set before mutation;
3. supports a non-writing dry-run that resolves selectors and reports predicted
   changes, warnings, and risks;
4. applies the operation set to an isolated candidate and does not partially
   publish a failed operation set;
5. returns operation-level results and a declared apply report; and
6. distinguishes implemented, partial, preserve-only, unsupported, and reserved
   capabilities instead of silently coercing them.

The source input SHOULD remain read-only by default. If an implementation has an
explicit in-place mode, the mode and overwrite policy MUST be visible in the
request and report.

### Level E: evidence-backed delivery

An implementation at Level E additionally:

- binds the candidate and its reports to exact artifact identities (at least
  path, byte length, and SHA-256 in the host's evidence record);
- provides structural and rendered validation paths;
- exposes a source/candidate diff for existing-deck edits;
- records a materialized plan or sidecar that another worker can inspect; and
- defines which gate failures are publication blockers, review signals, or
  inherited source debt.

For xdoc, a normal visible edit uses `pptx-apply/v1`, `pptx-apply-sidecar/v1`,
`pptx-vision/v1`, `pptx-preview/v1`, `pptx-diff/v1`, `pptx-vision-diff/v1`, and
`preflight/v1`. A contact sheet is human evidence, not a replacement for the
structured reports.

### Level S: safety and isolation

An implementation at Level S additionally:

- constrains external asset paths to an approved root;
- enforces patch, asset, package, and resource limits;
- makes raw XML or equivalent escape hatches explicit and opt-in;
- declares how macros, signatures, encryption, unsupported objects, and
  preserve-only regions are handled;
- avoids shell interpolation of user-controlled arguments; and
- keeps daemon/service credentials, state, and logs private.

Level S is the minimum for an unattended multi-tenant worker. A visual pass
without these boundaries is not a safe execution layer.

### Level B: binary distribution

An implementation at Level B ships a reproducible native artifact through one or
more declared channels, such as a GitHub Release archive or a global npm CLI
package. It provides:

1. a stable version/build identity;
2. a declared OS/architecture target;
3. all runtime libraries required by the advertised command surface, or an
   explicit dependency list;
4. license and third-party notices beside the artifact;
5. a release manifest with archive size and SHA-256, and preferably a signed
   manifest or platform signature; and
6. a clean-machine probe that covers discovery, a minimal mutation, reopen, and
   at least one relevant renderer path; and
7. a channel mapping that binds package versions, release tags, archive digests,
   runtime build ids, and supported targets.

When the same release is available through multiple channels, those channels
MUST expose the same `xdoc` command semantics and discovery schema. The npm
package and the corresponding GitHub Release MUST NOT create separate command,
patch, or report contracts. If a package installs or retrieves a platform
binary, its provenance and integrity checks MUST be visible to the deployer.

The current xdoc release workflow already packages the CLI, PDFium, `LICENSE`,
and `licenses-pdfium/` for Linux x86-64, Linux ARM64, macOS ARM64, and Windows
x86-64. The planned npm package is `@s8fy/xdoc`; it is not yet published.
Publishing that package, a standalone release manifest/signature, minimum OS
metadata, and an independent public certification record should be treated as
the next release work, not assumed from the package or archive name.

The current v0.3.0 macOS ARM64 asset declares macOS 26.0 as its minimum
deployment target and fails the intended macOS 15.x compatibility baseline. That
target must be rebuilt or its support claim narrowed before the archive can pass
B-001 as a generally downloadable artifact.

## Wire-contract rules

### Version identifiers

Keep these identifiers distinct:

| Identifier                               | Meaning                                           |
| ---------------------------------------- | ------------------------------------------------- |
| `cli-agent/v1`                           | CLI discovery document                            |
| `capabilities/v1`                        | Document kinds, outputs, and backend requirements |
| `pptx-patch/v1`                          | Patch operation registry and JSON Schema surface  |
| `schemaVersion: 1` in a patch            | Numeric patch envelope version                    |
| `pptx-apply/v1`, `pptx-dry-run/v1`, etc. | Command result contracts                          |

An implementation MUST NOT treat a report's `schemaVersion` as interchangeable
with the patch envelope's numeric version. If a worker receives an unknown major
contract, it MUST preserve the raw report and stop at the integration boundary.
It MAY continue when an additive minor version is explicitly declared backward
compatible.

### Machine output

When a command advertises JSON output:

- stdout MUST contain one parseable machine result for that invocation;
- human diagnostics MUST go to stderr;
- a structured failure report MUST NOT be discarded only because the process
  returned non-zero; and
- the report's status, gate, or issue fields MUST be used with the exit status.

Commands that primarily write files MAY leave stdout unused. Their artifact
manifest and command-specific report become the machine boundary.

### Selectors and indexes

Selectors MUST be deterministic. A single-target operation MUST fail with
candidate information when its selector is ambiguous. Implementations MUST
document index bases; xdoc uses 0-based patch slide fields and 1-based
`--slides` flags.

An implementation MUST NOT infer a selector from a rendered screenshot when a
structured inspect/select surface is available.

### Atomicity and delivery

Mutation atomicity has two layers:

```text
operation set → isolated candidate state → candidate bytes
candidate bytes + evidence sidecar → publication decision
```

The operation set MUST fail as one unit at the presentation-state boundary.
Candidate and sidecar writes MAY be separate filesystem operations, but the
report MUST make that boundary visible so a host can retry, quarantine, or
recover without guessing what happened. A daemon MAY advance an in-memory
session before a later filesystem delivery step; the host must account for that
state when retrying.

### Capability statuses

Use the following meanings in discovery and reports:

| Status          | Meaning                                                      | Agent behavior                                         |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| `enabled`       | The advertised path is implemented in this runtime           | It may be selected after normal policy checks          |
| `partial`       | Only a declared subset or backend path is implemented        | Read the notes and require a scoped fallback or review |
| `preserve-only` | The runtime keeps the region but does not promise mutation   | Do not generate an edit for that region                |
| `unsupported`   | The requested operation/feature is known but not implemented | Fail or choose an explicitly recorded alternative      |
| `reserved`      | A future document kind or feature name is reserved           | Do not advertise it as available                       |
| `undisclosed`   | This projection did not reveal the capability                | Probe the full runtime contract before deciding        |

The current capability registry uses `enabled` and `reserved` for its document
kind/output matrix and reports preserve-only/unsupported regions in PPTX
operation capabilities. Hosts should preserve the raw entries rather than
normalizing them to a single boolean.

## Required test vectors

A conformance package SHOULD ship small, redistributable fixtures: text-based
patches plus synthetic decks generated in-repo. It must not depend on customer
files.

| Vector | Input                                    | Required observation                                                                               |
| ------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| D-001  | `xdoc schema`                            | Declares the discovery contract, build, capabilities, and report ids                               |
| R-001  | Minimal empty PPTX                       | `inspect` is read-only and returns a versioned report                                              |
| R-002  | Shape query matching one object          | `select` returns one deterministic reference                                                       |
| R-003  | Shape query matching two objects         | A single-target edit fails with candidates; no silent first match                                  |
| M-001  | `add-slide` + `add-text-box` patch       | Schema validation, dry-run, apply, and reopen all succeed                                          |
| M-002  | Unknown or unsupported op                | The operation fails explicitly; no partial success is published                                    |
| M-003  | Asset path outside `--asset-root`        | The request is rejected before bridge mutation                                                     |
| E-001  | Candidate with a deliberate visual issue | Vision/preview reports expose the issue and the host can block publication                         |
| E-002  | Source and candidate pair                | Structural and visual diff reports bind to the compared files                                      |
| E-003  | Successful apply with sidecar            | `audit` can project the sidecar and replay/rollback obey their documented input requirements       |
| B-001  | Release archive on a clean host          | Binary starts, reports its version, and keeps bundled native libraries discoverable                |
| B-002  | npm package and matching release archive | Both expose the same runtime version/build, discovery schema, command behavior, and target support |

The minimal patch used by M-001 can be represented as:

```json
{
  "schemaVersion": 1,
  "ops": [
    { "op": "add-slide" },
    {
      "op": "add-text-box",
      "slide": 0,
      "x": "0.8in",
      "y": "1.2in",
      "w": "8in",
      "h": "0.8in",
      "name": "ConformanceTitle",
      "text": "xdoc conformance probe"
    }
  ]
}
```

The expected result is not a particular PPTX byte sequence. The implementation
must prove the declared semantic facts: one slide exists, the named text box is
present, the dry-run did not write the candidate, the apply report is
successful, and the candidate can be reopened and rendered by the advertised
backend.

## Conformance declaration

An implementation can publish a machine-readable declaration alongside its
release. The following is a profile example, not a required filename:

```json
{
  "profile": "xdoc-agent/v1",
  "implementation": "example-worker",
  "version": "1.4.0",
  "runtime": {
    "build": "example-build-id",
    "target": "linux-x64"
  },
  "levels": ["D", "R", "M", "E", "S", "B"],
  "contracts": [
    "cli-agent/v1",
    "capabilities/v1",
    "pptx-patch/v1",
    "pptx-inspect/v1",
    "pptx-apply/v1",
    "pptx-preview/v1",
    "pptx-vision/v1"
  ],
  "testVectors": {
    "suite": "xdoc-conformance-2026-01",
    "passed": ["D-001", "R-001", "M-001", "E-001", "E-003", "B-001"],
    "notRun": ["R-003"]
  },
  "capabilitySnapshot": "runtime-schema.json"
}
```

The declaration MUST list skipped vectors and partial capabilities. A green
summary that omits `notRun`, `partial`, or `preserve-only` cases is not a
conformance claim.

## Versioning and extensions

The ecosystem should freeze semantics before adding breadth:

1. Additive report fields are allowed only when old consumers can ignore them
   without changing the gate meaning.
2. A behavior change that can alter selector resolution, mutation atomicity,
   preservation, or publication verdict requires a new major contract or an
   explicit compatibility profile.
3. New operations must appear in discovery before an Agent is expected to use
   them. They must include schema, examples, error behavior, and at least one
   positive and negative fixture.
4. Extensions should use a namespaced field or a separately versioned report; an
   implementation must not overload an existing field with a new type.
5. Deprecations need a release note, a replacement contract, and a period in
   which the old report remains parseable or fails with a clear diagnostic.

These rules keep a planner written in one language compatible with a worker
written in another without freezing the internal OOXML object model.

## Current xdoc gaps to close before claiming a formal standard

The current runtime is a strong reference implementation, but the following
items remain ecosystem work:

- publish a public, versioned conformance fixture repository and runner;
- publish signed release manifests with target minimum OS versions and backend
  identities;
- rebuild or explicitly scope the v0.3.0 macOS ARM64 artifact until its
  deployment target passes the supported-host matrix;
- publish `@s8fy/xdoc` and a machine-readable mapping from each npm version to
  the corresponding release tag, target artifact, digest, and runtime build;
- make the runtime schema and release archive discoverable from one stable
  public URL;
- reconcile stale generated labels (for example the daemon status id) before
  freezing them as cross-implementation contracts;
- define a compatibility/deprecation policy and an extension registry;
- provide independent implementations or host adapters that pass the same
  vectors; and
- establish a lightweight governance process for approving new report ids,
  capability statuses, and industry profiles.

Until those steps are complete, describe xdoc as a **versioned execution
contract and reference implementation**, not as a ratified industry standard.

## Release gate for binary distributions

Before making a binary public, run this gate for every target archive and every
package-manager channel that exposes it:

```text
build with a pinned toolchain
  → package xdoc + native backends + LICENSE + third-party notices
  → record archive SHA-256 and target/minimum-OS metadata
  → run xdoc --version and xdoc schema on a clean host
  → run D-001, M-001, R-001, and one renderer probe
  → if publishing npm, verify the global xdoc command on every supported target
  → compare npm and GitHub installations with B-002
  → verify no source paths or private credentials enter reports
  → publish release notes, channel mapping, manifest, and rollback instructions
```

For the current archive layout, `xdoc` and `libpdfium.*` must remain colocated.
Do not call an archive “portable” until its minimum OS and native-loader
behavior have been tested on a clean machine for that target. In particular, the
CI runner's OS label is not by itself a compatibility guarantee.

## Related documentation

- [xdoc installation and binary distribution](./xdoc-installation.md)
- [xdoc integration guide](./xdoc-integration.md)
- [xdoc introduction](./xdoc-introducution.md)
- [xdoc runtime schema](./xdoc-schema.json)
- [pptx-nova SKILL](../pptx-nova/SKILL.md)
