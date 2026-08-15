# xdoc errors and reports

This document defines how an Agent should interpret an xdoc failure and how it
should retain the reports produced by a job. It is a companion reference to the
[integration guide](./xdoc-integration.md), not a replacement for the versioned
schemas returned by `xdoc schema`.

xdoc exposes several independent signals:

```text
process exit code + stdout report + stderr diagnostics + filesystem artifacts
```

None of these signals is sufficient on its own. In particular, an output file
can exist after a failed or incomplete delivery, and a zero exit code can mean
that a diff completed while its publication gate failed.

## The process boundary

Keep the four channels separate in the worker record:

| Channel     | Contract                                                                | Agent rule                                                                             |
| ----------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| stdout      | The command's documented machine result when JSON output is advertised  | Parse exactly one report. Do not mix it with logs or concatenate multiple invocations. |
| stderr      | Human diagnostics, warnings, and optional timing/path logs              | Store it for diagnosis. Never use prose on stderr as the machine API.                  |
| Exit status | The top-level process result and command-specific gate policy           | Use it with the report. Do not map every non-zero value to the same retry class.       |
| Filesystem  | PPTX, previews, manifests, sidecars, and reports written by the command | Record path, byte length, and SHA-256. Existence is not success.                       |

Some commands primarily write artifacts and leave stdout unused. `convert`,
`extract`, and `check` are examples. PPTX inspection, apply, preview, vision,
and diff commands expose versioned reports when their documented JSON mode is
used. Ask the running schema for the exact behavior of a new subcommand.

### JSON output exceptions

Most `--json` calls return the complete command report on stdout, including a
structured failure when one was produced. The internationalization planners are
deliberately different:

- `i18n-scan` and `i18n-plan` return a compact result with `--json`;
- `--json-full` returns the complete report on stdout; and
- `--output` is the preferred durable location for the complete report in an
  Agent pipeline.

Do not write an adapter that assumes every xdoc command has identical stdout
semantics. The command's `ioContract` in the runtime schema is authoritative.

## Process exit codes

The current top-level contract defines these codes:

| Code | Stage      | Meaning                                                                                     | First routing action                                                        |
| ---: | ---------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
|  `0` | success    | The command completed according to its command-level policy.                                | Parse the report or artifact manifest and run the host's publication gates. |
|  `2` | args       | CLI argument parsing or validation failed.                                                  | Repair the invocation; do not retry the same arguments.                     |
|  `3` | input      | Input was invalid or unreadable, or a planner/gate report completed with a non-pass status. | Parse the report when present and classify the blocker.                     |
|  `5` | slide      | A requested slide selection was outside the available range.                                | Re-inspect the deck and correct the 1-based selection.                      |
|  `6` | parse      | PPTX parsing failed.                                                                        | Quarantine the input and inspect package validity.                          |
|  `7` | pdf        | PDF generation failed.                                                                      | Check the PDF backend and renderer evidence before retrying.                |
|  `8` | png        | PNG generation failed.                                                                      | Check the image/PDF backends, fonts, and output directory.                  |
|  `9` | output     | Output validation or artifact writing failed.                                               | Treat delivery as incomplete; do not publish a partial artifact.            |
| `10` | dependency | A required backend was unavailable.                                                         | Repair the worker image or route to a worker with the declared backend.     |
| `11` | internal   | An unexpected internal failure occurred.                                                    | Preserve all evidence and escalate or retry under an incident policy.       |
| `12` | batch      | At least one batch item failed.                                                             | Read the per-item report and quarantine only the failed items.              |

Codes are a routing layer, not the bridge error catalog. For example, exit code
`3` can accompany a complete report with `status: "review-required"`, while a
bridge error inside that report has its own `error.code`.

The command-specific `ioContract.exitCodePolicy` can refine these meanings. Two
important examples are:

- `vision-diff` exits `0` when the comparison completed even if
  `agentGate.passed` is false. The gate verdict is in the report.
- i18n scan/plan commands use exit `3` for blocker sets but still emit their
  documented compact or full report when the report was produced.

## Error layers and the catalog

An Agent should distinguish these layers:

1. **Process result:** exit code and signal.
2. **Report result:** `schemaVersion`, `status`, gates, warnings, and findings.
3. **Bridge diagnosis:** `error.code`, severity, operation index, and repair
   metadata.
4. **Operation evidence:** `opResults[]`, changed parts, selectors, and traces.
5. **Delivery state:** which candidate, sidecar, and preview files actually
   reached the filesystem.

The current `pptx-error-catalog/v1` contains 24 codes:

| Code                   | Severity | Catalog `autoRetry` | Typical handling                                                                                         |
| ---------------------- | -------- | ------------------: | -------------------------------------------------------------------------------------------------------- |
| `invalid_json`         | error    |               false | Repair the JSON payload and validate it before rerunning.                                                |
| `invalid_argument`     | error    |                true | Inspect `path`, `expected`, `actual`, and suggestions; rerun a dry-run after a deterministic correction. |
| `invalid_arguments`    | error    |               false | Add or correct required CLI arguments.                                                                   |
| `unsupported_feature`  | error    |               false | Choose an explicitly supported alternative or stop for review.                                           |
| `invalid_operation`    | error    |                true | Re-inspect the current deck. Ambiguous selectors require refinement or human choice.                     |
| `invalid_package`      | fatal    |               false | Quarantine the input and repair or replace the package.                                                  |
| `invalid_xml`          | fatal    |               false | Quarantine the package; do not apply an automatic raw-XML repair.                                        |
| `missing_part`         | fatal    |               false | Treat the package as structurally incomplete.                                                            |
| `missing_relationship` | fatal    |               false | Inspect package relationships and route to a repair workflow.                                            |
| `encrypted_package`    | fatal    |               false | Obtain an approved unencrypted input; xdoc has no decryption path.                                       |
| `signed_package`       | fatal    |               false | Obtain an authorized unsigned copy before mutation; the current CLI exposes no signature-removal switch. |
| `zip_error`            | fatal    |               false | Quarantine the archive and investigate package or resource limits.                                       |
| `patch_too_large`      | error    |               false | Reduce the patch or change the size policy intentionally.                                                |
| `asset_too_large`      | error    |               false | Reduce the asset or change the asset limit intentionally.                                                |
| `input_error`          | error    |               false | Repair the input path or input materialization and re-run from the same source identity.                 |
| `output_error`         | error    |               false | Repair the output target, permissions, or filesystem capacity.                                           |
| `output_exists`        | error    |               false | Use a new candidate path or explicitly authorize overwrite.                                              |
| `invalid_sidecar`      | error    |               false | Quarantine the sidecar/candidate pair and do not guess the missing history.                              |
| `daemon_unavailable`   | error    |               false | A plain `--daemon` call may fall back to one-shot; `--daemon-strict` must fail closed.                   |
| `invalid_request`      | error    |               false | Repair the daemon request shape or CLI-to-daemon adapter.                                                |
| `protocol_error`       | error    |               false | Reconnect with a complete frame; preserve the broken frame and daemon logs.                              |
| `unknown_method`       | error    |               false | Discover the daemon method set again; do not invent a fallback method.                                   |
| `internal_error`       | fatal    |               false | Preserve the complete evidence bundle and escalate.                                                      |
| `unknown_error`        | fatal    |               false | Treat the failure as opaque and fail closed.                                                             |

`autoRetry: true` is a catalog hint, not an unconditional retry license. A retry
is permitted only when the host has a deterministic correction, the operation is
idempotent for the same input identity, no ambiguous candidates remain, and the
complete dry-run and evidence gates will run again. A `fixPatch` that requires
raw XML still needs the explicit raw-XML policy.

## Structured error envelope

For the report families that support the shared error schema, a failed report
has these required fields:

```json
{
  "schemaVersion": "pptx-dry-run/v1",
  "status": "error",
  "error": {
    "kind": "invalid_operation",
    "code": "invalid_operation",
    "severity": "error",
    "message": "shape selector matched multiple candidates",
    "opIndex": 0,
    "path": "ops[0].shape",
    "candidates": ["slide-0/shape-2", "slide-0/shape-7"],
    "suggestions": [
      {
        "fixPatch": [
          {
            "op": "set-text-frame",
            "slide": 0,
            "shape": { "id": 2 },
            "text": "Retry text"
          }
        ],
        "reason": "Use a concrete candidate id after inspection",
        "confidence": 0.96,
        "autoRetry": false
      }
    ],
    "docsRef": "https://structurify.io/docs/errors/invalid_operation",
    "autoRetry": true
  },
  "opResults": [],
  "traces": []
}
```

The error object may also contain `suggestion`, `expected`, `actual`, and
`replacement`. Each `suggestions[]` item contains a `fixPatch`, `reason`, a
`confidence` from 0 to 1, and its own `autoRetry` flag. Treat candidate-specific
suggestions as mutually exclusive choices. Never apply the first suggestion by
array order when the report describes an ambiguity.

The shared error report schema currently accepts these report versions:
`pptx-dry-run/v1`, `pptx-apply/v1`, `pptx-inspect/v1`, `pptx-select/v1`, and
`pptx-diff/v1`. Other command families can have a specialized error envelope;
preserve unknown fields instead of forcing them into this shape.

## Report families

The full report schemas and examples are discoverable from `xdoc schema`. The
following table names the fields a host normally uses:

| Report                  | Main fields                                                                                                                     | Use                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pptx-inspect/v1`       | `input`, `presentation`, `slides`                                                                                               | Discover stable ids, names, geometry, preserve-only regions, and package facts. |
| `pptx-select/v1`        | `input`, `query`, `scope`, `summary`, `matches`                                                                                 | Resolve a target and detect ambiguity before patching.                          |
| `pptx-dry-run/v1`       | `status`, `changedParts`, `semanticChanges`, `visualRisks`, `semanticIssues`, `warnings`, `opResults`, `traces`, `capabilities` | Prove that a proposed mutation is isolated and reviewable before writing.       |
| `pptx-apply/v1`         | The dry-run fields plus `input`, `output`, and delivery metadata when available                                                 | Record the candidate mutation and its operation-level evidence.                 |
| `pptx-preview/v1`       | Render manifest, output paths, slide images, and summary                                                                        | Bind rendered artifacts to the candidate.                                       |
| `pptx-vision/v1`        | `slideCount`, `summary`, `issues`, `semanticSummary`, `semanticIssues`                                                          | Run geometry and semantic checks without treating them as pixel proof.          |
| `pptx-diff/v1`          | `baselinePath`, `targetPath`, `policyRef`, `agentGate`, `summary`, `slides`                                                     | Decide whether an existing-deck edit changed only the intended content.         |
| `pptx-vision-diff/v1`   | Source/candidate render comparison and gate details                                                                             | Compare visual evidence; inspect `agentGate` rather than only the exit code.    |
| `pptx-contact-diff/v1`  | Contact-sheet paths and comparison summary                                                                                      | Human review aid, not a replacement for structured diff evidence.               |
| `pptx-apply-sidecar/v1` | `input`, `output`, `patch`, `report`, `mode`, `patchSource`, `build`                                                            | Replay, audit, or roll back a delivered candidate.                              |
| `pptx-audit/v1`         | Sidecar identity, recorded input/output/mode/schema/build, patch count, and projected report                                    | Verify that history belongs to the candidate being inspected.                   |
| `pptx-rollback/v1`      | `sidecar`, `strategy`, source/output identity, and status                                                                       | Record a recovery action without guessing at a missing pre-image.               |
| `preflight/v1`          | Requested checks, status, issue counts, risk level, and check details                                                           | Gate fonts, links, Office compatibility, assets, and policy.                    |

Specialized report families include brand, theme/style, template, refurbishment,
and i18n contracts. Their fields and blocker semantics are not interchangeable
with `pptx-apply/v1`.

### Status is command-specific

Most mutation and read reports use `success` or `error`. Planner and gate
families may also use values such as `blocked`, `review-required`, or
`incomplete`. The report's schema and `ioContract.exitCodePolicy` define what a
value means for that command. Do not normalize every non-success status to a
generic exception before preserving the original report.

## Retry, quarantine, and publication algorithm

Use this sequence for an unattended worker:

1. **Capture first.** Save raw stdout, stderr, exit code, signal, command
   arguments (with secrets redacted), and every declared filesystem path.
2. **Validate the report envelope.** Parse one JSON value and check its major
   `schemaVersion`. If parsing fails, classify the event as a protocol/output
   failure and retain the raw bytes.
3. **Bind identities.** Hash the source, patch, assets, candidate, sidecar, and
   runtime schema. A retry must refer to the same input identity unless it is a
   new planned attempt.
4. **Classify the blocker.** Use report status and gates first, then
   `error.code`, then the process exit code for routing. Keep all three values
   in the job record.
5. **Decide retry eligibility.** Require a deterministic fix, catalog and
   suggestion `autoRetry` approval, idempotence, no ambiguity, and an unchanged
   policy boundary. Rerun dry-run before apply.
6. **Quarantine uncertain delivery.** If apply failed, a candidate exists with
   an incomplete report, or a sidecar is missing/mismatched, move the pair to a
   quarantine area and block publication. Do not overwrite the source or infer
   that the candidate is safe from its timestamp.
7. **Publish only after gates.** Require the host's structural, semantic,
   Office-compatibility, rendered, and human-review gates. A report that merely
   completed is not necessarily a passing gate.

This distinction matters for daemon jobs. A daemon may advance an in-memory
session before a later candidate or sidecar write fails. On retry, account for
that session state or use one-shot mode; never replay blindly against a path
that another worker may have replaced.

## Practical command patterns

### Preserve a non-zero JSON result

```bash
xdoc pptx apply \
  --patch patch.json \
  --input source.pptx \
  --output candidate.pptx \
  --dry-run \
  --json > dry-run.json 2> dry-run.stderr
rc=$?

printf 'exit=%s\n' "$rc" >&2
jq -e '.schemaVersion and .status' dry-run.json
```

If `dry-run.json` is empty, keep `dry-run.stderr` and the exit code as the
diagnostic. Do not manufacture a successful report from the existence of
`candidate.pptx`.

### Store a complete i18n report

```bash
xdoc pptx i18n-scan \
  --source source.pptx \
  --source-lang multi \
  --mode source \
  --output i18n-scan.json \
  --json > i18n-result.json
```

Use `i18n-result.json` for the compact routing result and `i18n-scan.json` for
the durable unit inventory. Use `--json-full` only when a complete report on
stdout is genuinely needed.

### Bind a sidecar to a candidate

After apply, retain the candidate, its `pptx-apply/v1` report, and the default
`<output>.xdoc.json` sidecar together. Before replay, audit, or rollback:

```bash
xdoc pptx audit --from-sidecar candidate.pptx.xdoc.json --json > audit.json
xdoc pptx rollback --from-sidecar candidate.pptx.xdoc.json \
  --output recovered.pptx --json > rollback.json
```

The exact required options for replay, audit, and rollback are versioned in the
runtime schema. If the sidecar's recorded input, output, schema, or build does
not match the job record, quarantine it instead of editing the JSON by hand.

## Unknown versions and forward compatibility

Unknown report versions are a compatibility event, not an ordinary validation
warning. The adapter must:

- preserve the raw report and its byte hash;
- preserve stderr and the process result;
- quarantine any candidate whose publication status cannot be determined; and
- stop at the adapter boundary until a runtime-specific parser is available.

An additive field can be ignored only when the producer explicitly guarantees
backward compatibility and the new field cannot change the meaning of a gate. An
unknown major version, a changed field type, or a changed selector/atomicity
rule requires an adapter update and new conformance evidence.

## Evidence retention minimum

For a high-value or regulated job, retain one immutable record containing:

- source, patch, asset, candidate, sidecar, and report hashes;
- the exact executable path, `xdoc --version`, build id, and runtime schema;
- command arguments, policy flags, asset-root and size limits;
- stdout, stderr, exit code, and signal;
- dry-run, apply, inspect, preflight, preview, vision, and diff reports as
  applicable;
- backend identity, font inventory, render settings, and output manifests; and
- the final publish, retry, quarantine, rollback, or human-review decision.

This record separates a mutation that failed from a mutation that succeeded but
could not be delivered, and it lets another Agent reproduce the decision without
guessing from logs.

## Related documentation

- [xdoc compatibility](./xdoc-compatibility.md)
- [xdoc integration guide](./xdoc-integration.md)
- [xdoc installation and binary distribution](./xdoc-installation.md)
- [xdoc conformance profile](./xdoc-conformance.md)
- [xdoc introduction](./xdoc-introducution.md)
- [xdoc runtime schema](./xdoc-schema.json)
- [pptx-nova SKILL](../pptx-nova/SKILL.md)
