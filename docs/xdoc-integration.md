# xdoc integration guide for PPTX Agents

This guide is for an Agent runtime, queue worker, CI job, or application that
needs to call `xdoc` as a document execution layer. It describes the process
boundary and the evidence policy. It does not replace the operation details in
the [runtime schema](./xdoc-schema.json).

The short version is:

```text
probe binary → discover schema → inspect/select → build patch
  → dry-run → apply to a new candidate → inspect/check/preview
  → compare and review → retain reports and sidecar → publish
```

Treat this sequence as a protocol. A successful process exit or an output file
alone is not a publication decision.

## 1. Pin and discover the runtime

At worker startup, run the executable that will process the job:

```bash
xdoc --version
xdoc schema > runtime-schema.json
xdoc schema --mode index > runtime-patch-index.json
```

Installation is a deployment concern, not an Agent-protocol branch. A worker may
obtain the CLI from `npm i -g @s8fy/xdoc`, a GitHub Release archive, a container
or managed-worker layer created from an approved binary archive. In every case,
resolve the executable through an explicit `XDOC_BIN` path or `PATH`, then trust
only the probed version and schema. The npm package is a CLI distribution; do
not import it as a JavaScript API unless a separate public API is explicitly
released and documented.

Record the installation channel and the npm version, archive digest, or worker
image digest as provenance. Do not change patch construction, report parsing,
or gate policy based on that channel: equivalent distributions of the same xdoc
release must present the same CLI contract.

The top-level discovery contract is `cli-agent/v1`. The patch envelope uses its
own string `schemaVersion` (`"pptx-patch/v1"`; a bare numeric `1` is rejected),
which is a different field from the CLI discovery version. Cache the full schema by executable build id, not only by the
human version string.

Use progressive disclosure when constructing a patch:

```bash
xdoc schema --mode index
xdoc schema --mode ops --ops add-text-box --minimal
xdoc schema --mode ops --ops set-shape --fields name,shape,slide --defs summary
xdoc schema --mode examples
```

`schema --mode index` is an operation index, not a complete command inventory. The
full schema is the source for command metadata, capabilities, examples, report
contracts, and error catalogs. A missing index entry means “not disclosed by
this projection,” not automatically “unsupported.” Ask the running binary again
before choosing a fallback.

## 2. Keep the process boundary typed

Call the executable directly and keep the four channels separate:

| Channel     | Agent policy                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stdout      | Parse only the documented machine result for that command. In JSON mode, a complete structured failure report may still be present when the process exits non-zero. |
| stderr      | Store as diagnostics/logs. Never parse human text as the API contract.                                                                                              |
| exit status | Apply the command-specific policy together with the report. Exit `0` is not a universal visual or content gate.                                                     |
| filesystem  | Track every declared artifact, its path, byte length, and SHA-256. A file's existence is not proof that the command passed.                                         |

Some conversion, extraction, and preflight commands primarily write files and
leave stdout unused. PPTX inspection, apply, preview, diff, and visual commands
have versioned JSON reports when `--json` is requested. Keep stdout and stderr
separate even when a command appears to be “just a check.”

A minimal Node adapter can look like this:

```js
import { spawn } from 'node:child_process'

export function runXdoc(args, options = {}) {
  const binary = options.binary ?? process.env.XDOC_BIN ?? 'xdoc'
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
}

export async function runJson(args, options = {}) {
  const result = await runXdoc([...args, '--json'], options)
  let report
  try {
    report = JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`xdoc returned non-JSON stdout (exit ${result.code}): ${error.message}`)
  }
  return { ...result, report }
}
```

Do not put untrusted file names or patch values into a shell string. Pass them
as argument-array elements and set an explicit working directory.

## 3. Use the inspect → select → patch loop

For an existing deck, keep the source read-only and resolve the target before
writing:

```bash
xdoc pptx inspect source.pptx --json > inspect.json
xdoc pptx select source.pptx \
  --query '{"textRegex":"Revenue"}' \
  --json > selection.json
```

The `pptx-inspect/v1` and `pptx-select/v1` reports expose object ids, names,
placeholders, bounding boxes, text summaries, and selector matches. If a
selector that requires one object resolves to multiple candidates, stop and
repair the selector. Never choose the first match silently.

The index bases are intentionally explicit:

| Surface                                                          | Index base |
| ---------------------------------------------------------------- | ---------- |
| `--slides` on conversion, preview, checks, and most PPTX actions | 1-based    |
| Patch `slide` fields                                             | 0-based    |
| `select` query `slideIndex`                                      | 0-based    |
| `slide-copy --slides`                                            | 1-based    |
| PDF page selectors                                               | 1-based    |

Ask the current schema when a new command introduces another selector. Do not
convert indexes by intuition.

## 4. Build a small, versioned patch

Patch input is JSON with `schemaVersion: "pptx-patch/v1"` and an ordered `ops` array. A
minimal new-deck patch is:

```json
{
  "schemaVersion": "pptx-patch/v1",
  "ops": [
    { "op": "add-slide" },
    {
      "op": "add-text-box",
      "slide": 0,
      "x": "0.8in",
      "y": "1.2in",
      "w": "8in",
      "h": "0.8in",
      "name": "AgentTitle",
      "text": "Quarterly review"
    }
  ]
}
```

For an existing deck, use the inspected shape id, paragraph index, run index,
and source text instead of guessing. Omitting `font` preserves the existing run
formatting:

```json
{
  "schemaVersion": "pptx-patch/v1",
  "ops": [
    {
      "op": "set-run",
      "slide": 0,
      "shape": { "id": 42 },
      "paragraph": 0,
      "run": 0,
      "sourceText": "Old title",
      "text": "Quarterly review"
    }
  ]
}
```

Replace the example id and text with values from `inspect`. Do not use a
whole-frame `set-text-frame` operation for a style-preserving text-only edit
unless the workflow explicitly allows run formatting to be rebuilt.

The schema and dry-run report are the authority for fields, units, enums, and
whether an operation is implemented, partial, preserve-only, or unsupported.
High-level recipe inputs can be compiled first:

```bash
xdoc pptx recipe --recipe recipe.json --compile --json > recipe-report.json
```

Review the ordinary `pptx-patch/v1` patch embedded in the
`pptx-recipe-compile/v1` report before applying it.

## 5. Require a non-writing dry-run

Run every non-trivial mutation against a candidate path before writing it:

```bash
xdoc pptx apply \
  --patch patch.json \
  --input source.pptx \
  --output candidate.pptx \
  --dry-run \
  --json > dry-run.json
```

The dry-run report is `pptx-dry-run/v1`. It should disclose the resolved
selectors, operation results, changed parts, semantic changes, visual risks,
warnings, and capability status. Assert that the candidate was not created or
modified by the dry-run. If the report contains an unsupported operation,
selector ambiguity, or a policy error, repair the plan and run the dry-run
again. Do not turn a partial operation list into a successful job.

For cross-deck whole-slide reuse, `slide-copy` is a separate structural command,
not a patch op:

```bash
xdoc pptx slide-copy \
  --input target.pptx \
  --source donor.pptx \
  --slides 1,3 \
  --output candidate.pptx \
  --dry-run --json > copy-preflight.json
```

The target deck is `--input`/`-i` (or the positional input) and the donor deck
is `--source`; `--slides` is 1-based (`--all` selects every donor slide). Its
`pptx-slide-copy/v1` dry-run is a read-only execution plan rather than
`pptx-dry-run/v1`: require `status: "success"`, `outcome: "passed"`,
`preflight.ready: true`, `preflight.readOnly: true`, current target/donor
SHA-256 fingerprints, and no `preflight.blockers`. Review
`preflight.risks`, planned parts/relationships, and dependency reuse before
apply. Do not synthesize patch `opResults` for this command.

## 6. Apply to a separate candidate and retain the sidecar

After the dry-run gate passes, apply to a new path:

```bash
xdoc pptx apply \
  --patch patch.json \
  --input source.pptx \
  --output candidate.pptx \
  --json > apply.json
```

The result is `pptx-apply/v1`. `xdoc` writes a `candidate.pptx.xdoc.json`
sidecar by default. It contains the materialized patch, command metadata,
asset-root information, the build id, and operation traces. It is a revision
evidence record, not a cryptographic commit or a self-contained deck archive:
source/candidate bytes and revision hashes remain the orchestrator's
responsibility.

Use `--no-sidecar` only when the host writes an equivalent evidence record
itself. If a sidecar is retained, the host can inspect it without rebuilding
selectors:

```bash
xdoc pptx audit --from-sidecar candidate.pptx.xdoc.json --json > audit.json
xdoc pptx replay --from-sidecar candidate.pptx.xdoc.json --output replay.pptx --json > replay.json
xdoc pptx rollback --from-sidecar candidate.pptx.xdoc.json --output rollback.pptx --json > rollback.json
```

Replay still needs the currently resolved input deck for an existing-deck edit,
and it does not prove that the input bytes are the original ones. Store source
hashes and ownership metadata outside the sidecar.

## 7. Close the evidence gates

At minimum, a visible edit should produce these artifacts:

```bash
xdoc pptx inspect candidate.pptx --json > candidate-inspect.json
xdoc pptx vision-check candidate.pptx --json > vision.json
xdoc pptx preview candidate.pptx \
  --output-dir previews \
  --contact-sheet --contact-output previews/contact-sheet.png \
  --overwrite \
  --json > preview.json
xdoc pptx diff source.pptx candidate.pptx --detail summary --json > diff.json
xdoc pptx vision-diff --source source.pptx --candidate candidate.pptx --json > vision-diff.json
xdoc check candidate.pptx \
  --checks fonts,links,compat,assets,policy \
  --output preflight.json \
  --overwrite
```

Use the report-specific gates, not a single generic “command succeeded” flag:

- `vision.json`: inspect `summary.bySeverity` and semantic findings;
- `preview.json`: require top-level success, at least one page, every page file
  status `ok`, and a successful contact sheet when requested;
- `diff.json`: use reliable changed-part and semantic-change entries;
- `vision-diff.json`: use `agentGate.passed` and inspect new/worsened issues;
- `preflight.json`: read the requested/executed/unsupported checks and overall
  risk; and
- `apply.json` plus the sidecar: bind the reports to the exact candidate path
  and SHA-256 recorded by the host.

Static geometry checks do not prove rendered pixels. A human or visual-review
worker must inspect the contact sheet for clipping, contrast, overlap, broken
chart labels, and unintended layout drift.

Accessibility checks are outside the default `--checks` list, though
`--checks all` does include them. When the job requires them, ask for `a11y`
or `all` explicitly and gate on
`checks.a11y.status` plus `summary.riskLevel`, not the exit code. A completed
scan exits 0 even with findings; `inconclusive` is review-required, not a pass.
An a11y `patchTemplate` contains placeholder text and is never auto-applicable.

## 8. Handle errors and repair suggestions as data

Structured failures can include an error kind, message, operation index,
candidate selectors, and machine-readable `suggestions[].remediation` entries
(a complete replacement `request` or an `apply-to-document` `patch` envelope
with `confidence` and `autoRetry`). An Agent may retry only
when the suggested fix is within the declared policy and the retry runs the same
dry-run and evidence gates again.

Do not:

- parse error prose to infer an operation name;
- apply a suggested raw-XML patch without an explicit raw-XML policy;
- downgrade an unsupported operation to a visually similar operation without
  recording the change; or
- discard a complete JSON report because the process returned non-zero.

Unknown report schema versions are a compatibility event. Preserve the raw
report, quarantine the candidate, and route the job to a runtime adapter that
understands the version.

## 9. Control assets and package safety

For media or external JSON data, resolve paths through an explicit asset root:

```bash
xdoc pptx apply \
  --patch patch.json \
  --asset-root ./approved-assets \
  --input source.pptx \
  --output candidate.pptx \
  --dry-run \
  --json > dry-run.json
```

`assetSource.path` values must be relative and remain inside the resolved asset
root. If `--asset-root` is omitted, the patch file directory is the default. The
CLI enforces `XDOC_PPTX_MAX_PATCH_BYTES` (default 32 MiB) and
`XDOC_PPTX_MAX_ASSET_BYTES` (default 64 MiB) before calling the filesystem-free
PPTX bridge.

Keep the default preserve-first package policy. Encrypted packages are rejected
by default; signed packages are rejected on save; and macro/VBA parts are
preserved by default. The current CLI schema does not expose public
signature-removal or VBA strip/reject switches. `patch-ooxml` is disabled unless
`--allow-raw-xml` is supplied. Treat complex animations, SmartArt-like
structures, and other preserve-only regions as review boundaries, not as
silently editable objects.

Configure PNG rendering through the CLI options (`--dpi`, `--prefix`,
`--output-dir`, `--output`); the `xdoc` executable does not read the
`XDOC_PNG_*` variables used by the standalone converter tools. Relative paths
are resolved against the xdoc process working directory, and `~` is not
expanded. Normalize paths before changing `cwd` and pass an explicit working
directory from workers.

## 10. Choose a published session adapter

Use one-shot CLI for isolated phases. Shell-driven inspect/apply loops may use
the local daemon; an Agent host that already owns a long-lived child process may
use the published stdio JSON-RPC adapter, while an MCP client may use the
published tools-only MCP stdio adapter. All route to the same PPTX handlers; the
host must keep workflow validation and evidence gates above the adapter.

### Daemon

For several operations on the same deck, a local daemon can keep a parsed
session in memory:

```bash
# Terminal 1; this is a foreground process.
xdoc daemon start

# Terminal 2.
xdoc daemon status --json
xdoc pptx inspect source.pptx --daemon --json > inspect.json
xdoc pptx apply --patch patch.json --input source.pptx --output candidate.pptx --daemon --json > apply.json
xdoc daemon stop
```

Use `--daemon-strict` when a one-shot fallback would invalidate the job's
assumptions. Plain `--daemon` falls back to one-shot mode if the daemon is not
reachable. The daemon is loopback-only by default, stores a bearer token in a
0600 state file where supported, and prunes sessions by idle timeout and pool
size. Keep `XDOC_DAEMON_STATE` and `XDOC_DAEMON_LOG` private.

Sessions are keyed by canonical paths. A cached session is not re-hash-checked
on every hit, so give one worker exclusive ownership of a source path or use
one-shot mode when another process may replace the file.

Integrate through `xdoc daemon start|status|stop` and the documented CLI
reports. Do not depend on the internal newline-delimited daemon RPC framing. The
runtime status report is `xdoc-daemon-status/v2`; read the full
`commands.daemon` disclosure for the data/control endpoints, limits, lifecycle,
and observability contract.

Daemon state is revision-bound. If `status --json` reports stale or a build
mismatch, use `xdoc daemon stop` to retire it and let the current executable
auto-spawn a new daemon. Do not manually delete or rewrite the state file.

### Stdio JSON-RPC

Launch `xdoc json-rpc` and keep the child process alive. The published
`xdoc-json-rpc-contract/v1` uses newline-delimited UTF-8 JSON-RPC 2.0 with one
frame per line, an 8 MiB frame limit, serial execution, and protocol-only
stdout; diagnostics belong to stderr. No initialize handshake is required.

The methods are `xdoc.ping`, `xdoc.capabilities`, `xdoc.schema`, `pptx.inspect`,
`pptx.apply`, and `xdoc.shutdown`. Mutation and shutdown require a request id; sending them as a
notification is ignored without mutation. `pptx.apply` requires a patch object
and, unless `dryRun` is true, `outputPath`. Results use
`xdoc-json-rpc-result/v1` and refer to binary outputs through artifact records.

Hosts may opt into begin/end `$/progress` notifications with `progressToken`.
`$/cancelRequest` is queued cooperative cancellation only: it can suppress a
request not yet dispatched, but cannot interrupt the current synchronous
method. Batches execute serially. Send `xdoc.shutdown` with an id or close stdin
after the active request; never mix logs into stdout. Use `xdoc.capabilities` to
retrieve the exact protocol contract from the running process.

### MCP over stdio

Configure an MCP client with command `xdoc` and arguments `["mcp"]`. Before
enabling the adapter, read the full `commands.mcp.protocolContract` disclosure
and recognize its `xdoc-mcp-contract/v1` schema; command presence alone is not a
protocol contract. The verified runtime currently exposes `xdoc_schema`,
`pptx_inspect`, and `pptx_apply`.

Use an MCP SDK for protocol negotiation when possible. A custom host must obey
the disclosed protocol eras, initialization sequence, methods, framing, result
encoding, and one-connection/one-era rule. Result envelopes use
`xdoc-mcp-tool-result/v1`; `isError: true` carries a business failure and its
xdoc report rather than a JSON-RPC protocol error. Read the envelope from the
location declared by `resultEncoding`, including the content-only compatibility
era.

Pass absolute paths and keep `overwrite` false unless replacement is explicitly
intended. MCP is not a sandbox and remote exposure is outside the published
contract. It can replace only the three disclosed discover/inspect/apply calls;
conversion, visual checks, and every dry-run, post-apply inspection, evidence,
and publication gate remain separate workflow steps.

## 11. CLI and service boundaries

The supported cross-language boundary is the `xdoc` process: command arguments
or the published stdio JSON-RPC/MCP frames, the runtime-discovered schema,
versioned JSON reports, exit status/lifecycle, and declared filesystem
artifacts. This repository does not promise an in-process xdoc library API.
Wrap the executable in a small host-language adapter and version that adapter
against its probed CLI, JSON-RPC, or MCP contract.

This repository does not currently publish an HTTP service contract. If a
service adapter is released separately in the future, treat its routes,
authentication, reports, and mutation coverage as an independent versioned
surface; do not infer them from the CLI or local daemon.

## 12. A practical worker record

Store one immutable job record with these groups:

1. **Inputs:** source and asset hashes, approved roots, policy limits, and the
   exact `cli-agent/v1` schema snapshot.
2. **Plan:** patch or recipe, user intent, resolved selector candidates, and
   output identity.
3. **Candidate:** output PPTX, `pptx-dry-run/v1`, `pptx-apply/v1`, and changed
   parts.
4. **Evidence:** inspect, preflight, vision, preview, structural diff, visual
   diff, and human review decision.
5. **History:** sidecar, runtime/backend/font provenance, retention policy, and
   publish/retry/quarantine/rollback decision.

This record lets a platform retry a renderer failure without replaying a
successful mutation blindly, and lets a reviewer see which slide or object
actually changed.

## Integration checklist

- [ ] Pin the executable, npm version, release archive digest, or worker image
      digest, together with the schema snapshot.
- [ ] Resolve the CLI through `XDOC_BIN` or `PATH`, independent of whether the
      worker layer came from npm or an approved binary archive.
- [ ] Probe `xdoc --version` and `xdoc schema` at worker startup.
- [ ] If using stdio JSON-RPC, pin `xdoc-json-rpc-contract/v1`, keep stdout
      protocol-only, and require ids for mutation/shutdown.
- [ ] If using MCP, pin a recognized `xdoc-mcp-contract/v1`, pass absolute
      paths, follow `resultEncoding`, and keep CLI-only workflow gates.
- [ ] Keep stdout, stderr, exit code, and filesystem artifacts separate.
- [ ] Inspect and select before constructing an existing-deck patch.
- [ ] Reject ambiguous selectors and unsupported capabilities.
- [ ] Require a non-writing dry-run.
- [ ] Apply only to a separate candidate path.
- [ ] Retain the sidecar or an equivalent evidence record.
- [ ] Run structural, semantic, rendered, and human visual gates.
- [ ] Fail closed on unknown report versions and stale input ownership.
- [ ] Keep asset roots, daemon state, fonts, and license policy explicit.
- [ ] Ask for `a11y` (or `all`) when accessibility is in scope; the default
      `--checks` list omits it, and process exit 0 never proves it ran.

## Related documentation

- [xdoc installation and binary distribution](./xdoc-installation.md)
- [xdoc conformance profile](./xdoc-conformance.md)
- [xdoc introduction](./xdoc-introducution.md)
- [xdoc runtime schema](./xdoc-schema.json)
- [pptx-nova SKILL](../pptx-nova/SKILL.md)
