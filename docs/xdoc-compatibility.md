# xdoc compatibility

This document is the operational reference for deciding whether an xdoc job is
safe to run on a particular input, Office target, worker image, or downloaded
binary. It complements the [xdoc introduction](./xdoc-introducution.md) and the
normative proposals in the [conformance profile](./xdoc-conformance.md).

The executable being called is the authority. The checked-in
[schema snapshot](./xdoc-schema.json) is a reviewable baseline, not a promise
that a different binary exposes the same behavior. At worker startup, record
`xdoc --version` and the output of `xdoc schema` and bind both to the job.

## Compatibility has five layers

"PPTX compatible" is not one boolean. A production Agent should check each layer
separately:

| Layer     | Question                                                                      | Evidence to retain                                                            |
| --------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Contract  | Can the worker parse the discovery, patch, and report contracts?              | Runtime version, build id, schema, and selected report schemas                |
| Operation | Is this command or operation implemented for this input?                      | Capability status, operation schema, dry-run report                           |
| Package   | Will untouched OOXML parts, relationships, and policy-sensitive data survive? | `inspect` report, `preserveOnly[]`, changed parts, policy checks              |
| Office    | Does the package use features accepted by the target Office generation?       | `preflight/v1` compatibility check and target version                         |
| Rendering | Will this worker produce the expected PDF/PNG pixels and text layout?         | Backend identity, font inventory, render manifest, preview and visual reports |

A job is compatible only when the host's policy accepts all five layers. A
successful process exit or an output file by itself is not a compatibility
verdict.

## Runtime capability matrix

The current v0.3.12 discovery contract is `cli-agent/v1`, with a capability
registry at `capabilities/v1`. The registry currently reports:

| Input kind | Output                                                                       | Status     | Delivery    | Required backend               |
| ---------- | ---------------------------------------------------------------------------- | ---------- | ----------- | ------------------------------ |
| `pptx`     | `pdf`                                                                        | `enabled`  | single file | `pdf-backend`                  |
| `pptx`     | `png`                                                                        | `enabled`  | directory   | `pdf-backend`, `image-backend` |
| `pptx`     | `json`, `md`, `text`, `map`, `resources`, `notes`, `links`, `fonts`, `check` | `enabled`  | single file | none                           |
| `pdf`      | `pdf`                                                                        | `enabled`  | single file | none                           |
| `pdf`      | `png`                                                                        | `enabled`  | directory   | `image-backend`                |
| `html`     | `md`                                                                         | `enabled`  | single file | none                           |
| `docx`     | `*`                                                                          | `reserved` | unknown     | none                           |
| `xlsx`     | `*`                                                                          | `reserved` | unknown     | none                           |

`reserved` means a future name is present in discovery. It is not a supported
conversion path. In particular, do not advertise xdoc v0.3.12 as a generic DOCX or
XLSX ingestion layer.

The registry is a capability matrix, not a live health check. A worker must also
verify that the required renderer is present and that the configured font policy
can satisfy the job.

### Capability status semantics

Hosts should preserve the raw status and its notes rather than reducing it to a
single boolean:

| Status          | Meaning                                                       | Agent action                                            |
| --------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| `enabled`       | The advertised path is implemented in this runtime.           | It may be selected after normal policy checks.          |
| `partial`       | Only a declared subset or backend path is implemented.        | Read the notes and require a scoped fallback or review. |
| `preserve-only` | The content is kept, but high-level mutation is not promised. | Do not generate an edit for that region.                |
| `unsupported`   | The requested feature is known but not implemented.           | Fail or choose an explicitly recorded alternative.      |
| `reserved`      | A future document kind or feature is named but not shipped.   | Treat it as unavailable.                                |
| `undisclosed`   | This schema projection did not reveal the capability.         | Probe the full runtime schema before deciding.          |

Use `xdoc schema --mode index` for a compact operation index and the full
`xdoc schema` response for capability notes, report ids, limits, and examples.
The index is a projection; a missing entry is not proof of unsupported status.

## PPTX operation compatibility

### Patch and selector boundaries

The bridge patch envelope is JSON with the string `schemaVersion`
`"pptx-patch/v1"` (a bare numeric `1` is rejected) and an ordered `ops` array.
This envelope version is distinct from report versions such as `pptx-apply/v1`.

Index bases are intentionally different at the CLI boundary:

| Surface                                                          | Index base |
| ---------------------------------------------------------------- | ---------- |
| Patch `slide` fields                                             | 0-based    |
| `select` query `slideIndex`                                      | 0-based    |
| `slide-copy --slides`                                            | 1-based    |
| `--slides` on conversion, preview, checks, and most PPTX actions | 1-based    |

Resolve an existing object with `inspect` or `select` before constructing a
patch. A selector that should identify one object but matches several objects is
an error with candidates, not permission to choose the first array element.

### Editable surfaces and bounded surfaces

The native bridge exposes ordinary editing for slides, text, shapes, tables,
connectors, pictures, layouts, themes, backgrounds, notes, and selected chart
and media operations. The runtime also exposes 58 patch operations, 182 preset
PowerPoint shapes, and a chart catalog whose individual constants are marked
supported, partial, or unsupported.

These facts do not imply complete PowerPoint object-model parity. Important
boundaries include:

| Area                  | Current contract                                                                                                               | Compatibility consequence                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Charts                | Bar/column clustered, stacked, and percent-stacked paths are covered; other kinds and variants have individual statuses.       | Query the chart-kind and chart-variant registries. An accepted kind does not make every variant safe.          |
| Chart data            | Generated charts keep the visible XML cache and embedded workbook synchronized on supported data paths.                        | Reopen and inspect the candidate after a chart mutation. Do not assume a cache-only edit updates the workbook. |
| Animations            | Basic entrance/exit and paragraph-build subsets can be created or edited. Complex effects remain preserve-only or degraded.    | Use the reported animation capability and do not replace unknown timing XML implicitly.                        |
| Transitions           | Basic transitions are supported; extended PowerPoint 2010+ `p14` transitions remain preserve-only.                             | A transition can survive an edit without being editable.                                                       |
| OLE                   | Embedded bytes and metadata can be created, preserved, or fallback-rendered. Activation and editing belong to the Office host. | Treat OLE as a host-dependent artifact, not an xdoc editing surface.                                           |
| SmartArt and diagrams | Existing parts and relationships are preserved and reported.                                                                   | Do not generate a high-level SmartArt edit. Copy from a known-good template when needed.                       |
| VBA/macros            | Macro parts are detected and preserved by default; xdoc does not edit VBA.                                                     | Keep macro policy explicit and test the macro-enabled result in the target host.                               |

Unknown future operation names must fail with a structured `unsupported_feature`
result. They must not be silently downgraded to a similar operation or reported
as partial success.

## Package preservation and policy

xdoc follows a preserve-first policy for package content it does not touch. The
policy is conservative because a PPTX is an OPC package, not just a collection
of slide XML files.

| Input or feature                        | Default behavior                                                                                                      | Required host decision                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Unknown OOXML parts and extension nodes | Preserve untouched entries where possible. `inspect` reports preserve-only observations.                              | Review `preserveOnly[]` before deleting, replacing, or copying related parts.                                    |
| Encrypted package                       | Reject on open. No decryption path is provided.                                                                       | Obtain an unencrypted input through an approved process. Never treat the error as a transient retry.             |
| Digitally signed package                | Reject save because a mutation invalidates the signature; the current CLI schema exposes no signature-removal switch. | Obtain an authorized unsigned copy before mutation and record the decision.                                      |
| Macro/VBA package                       | Preserve by default; the current CLI schema exposes no public strip/reject switch. VBA is not edited.                 | Validate the preserved result in a macro-aware host.                                                             |
| Raw `patch-ooxml`                       | Disabled by default. `--allow-raw-xml` is required.                                                                   | Treat raw XML as an expert boundary, review it, and rerun inspect and semantic/rendered checks.                  |
| External patch assets                   | `assetSource.path` must be relative and remain under `--asset-root`. The default root is the patch file directory.    | Use an approved, isolated asset root. Do not pass user paths through a shell string.                             |
| Patch and asset size                    | Defaults are 32 MiB per patch and 64 MiB per asset.                                                                   | Keep the defaults unless a documented policy changes `XDOC_PPTX_MAX_PATCH_BYTES` or `XDOC_PPTX_MAX_ASSET_BYTES`. |

Deleting a preserve-only part or applying raw XML can produce high-severity
risks such as `preserve-only-delete-risk` or `raw-ooxml-preserve-only-risk`. The
report is evidence for a policy decision, not an automatic approval.

## Office-generation compatibility

The compatibility preflight understands `2007`, `2010`, `2013`, `2016`, `2019`,
`2021`, and `365`. The default target is `365`:

```bash
xdoc check deck.pptx \
  --checks compat \
  --target-office 365 \
  --output preflight.json
```

The `preflight/v1` report records the target, the minimum Office version
observed, whether the package is fully compatible, issue counts, and whether a
feature has an unprotected issue or a graceful fallback. A passing check means
the package passed the generated rule set for that target. It does not prove
that every Office build, add-in, font, or host-specific renderer will display
the deck identically.

For a release gate, run the check for every Office generation that the product
claims to support and retain the reports with the candidate. If a feature is
wrapped by `mc:Ignorable` or `AlternateContent`, record whether the fallback is
acceptable rather than counting the presence of a fallback as full feature
parity.

## Rendering compatibility

PDF and PNG output uses the declared native backends. PPTX-to-PNG requires both
the PDF and image backends; PDF-to-PNG requires the image backend. Rendering
also depends on fonts available to the worker. Font fallback can change line
wrapping, pagination, and the apparent position of objects even when the OOXML
package is byte-for-byte stable.

For repeatable output:

1. provision the same font set on every worker image;
2. make `XDOC_FONT_CACHE` and remote-font policy explicit;
3. set `XDOC_DISABLE_REMOTE_FONTS=1` for offline workers and install the cache
   readiness marker when the cache is complete; and
4. retain the font inventory, backend identity, DPI, and render manifest with
   preview and visual reports.

Use `vision-check` for geometry and semantic signals and a rendered preview or
visual diff for pixels. A preview hash identifies a rendered artifact; it does
not prove OCR correctness, font provenance, or human visual quality.

## Downloadable binary compatibility

When xdoc is distributed as a native binary, the archive and the runtime
contract must be treated as one release unit. The
[installation guide](./xdoc-installation.md) documents the planned npm and
release-archive channels, target names, bundled PDFium libraries, and current
publication caveats.

Before assigning a downloaded binary to an Agent, verify:

```bash
xdoc --version
xdoc schema > runtime-schema.json
xdoc schema --mode index > runtime-index.json
jq -e '.schemaVersion == "cli-agent/v1"' runtime-schema.json
```

The release record should bind all of the following:

- release tag and package-manager version, if applicable;
- runtime version and build id from `xdoc --version` and `xdoc schema`;
- OS/architecture and minimum OS version;
- archive or package SHA-256, preferably with a signed manifest;
- bundled native library and third-party license notices; and
- clean-host probe results for discovery, a minimal mutation, reopen, and one
  relevant renderer path.

If npm and a release archive claim to be the same release, they must expose the
same command semantics, schema, backend requirements, and target support. Do not
infer compatibility from an archive filename or a CI runner label.

## Version and adapter rules

Keep these identifiers distinct:

| Identifier                                               | Meaning                                                  |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `cli-agent/v1`                                           | CLI discovery contract                                   |
| `capabilities/v1`                                        | Document kinds, output formats, and backend requirements |
| `pptx-patch/v1`                                          | Patch operation registry                                 |
| Patch `schemaVersion: "pptx-patch/v1"`                   | Patch envelope version                                   |
| `pptx-apply/v1`, `pptx-dry-run/v1`, and other report ids | Command result contracts                                 |

Cache a schema by executable build id, not only by the human version. If a
worker receives an unknown major contract, preserve the raw response and stop at
the adapter boundary. An additive minor version may be accepted only when the
producer explicitly declares it backward compatible and the host's gate meaning
is unchanged.

Do not update a checked-in schema snapshot silently when a binary changes. A
release should refresh the snapshot, record the new build id, rerun conformance
vectors, and publish the compatibility notes together.

## Compatibility checklist

- [ ] Probe the exact executable and save `xdoc --version` plus `xdoc schema`.
- [ ] Confirm the input/output capability is `enabled`, not `reserved` or
      `undisclosed`.
- [ ] Inspect and select before editing an existing deck.
- [ ] Check selector and slide index bases.
- [ ] Run a non-writing dry-run for every non-trivial mutation.
- [ ] Review `preserveOnly[]`, package policy, and changed parts.
- [ ] Run `xdoc check --checks compat` for each claimed Office target.
- [ ] Reopen the candidate and run structural, semantic, and rendered gates.
- [ ] Record fonts, backend identity, binary digest, and report schemas.
- [ ] Quarantine the candidate when the runtime contract or report major version
      is unknown.

## Related documentation

- [xdoc installation and binary distribution](./xdoc-installation.md)
- [xdoc integration guide](./xdoc-integration.md)
- [xdoc errors and reports](./xdoc-errors-and-reports.md)
- [xdoc conformance profile](./xdoc-conformance.md)
- [xdoc introduction](./xdoc-introducution.md)
- [xdoc runtime schema](./xdoc-schema.json)
- [pptx-nova SKILL](../pptx-nova/SKILL.md)
