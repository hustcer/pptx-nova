# Runtime License Installation and Diagnostics

Use this guide when a user explicitly asks to verify, register/install, or renew an xdoc Runtime license file, or when a task encounters an authorization refusal, an ineffective license, or watermarks after payment. Ordinary successful tasks need no additional authorization maintenance. An authorization-only task does not require an outline, DeckKit, PPTX, or visual delivery gates. A downloaded license JSON is a credential, not deck content.

## Credential and Host Boundaries

- **Never load raw credential contents into model context**: Keep raw license JSON, signatures, private
  keys, and environment secrets out of model context, chat, shell strings, logs, and evidence. Pass
  license files **by file path only** to local `auth verify`, `auth install`, or an authorized one-off
  `xdoc convert --license`. `auth status` takes no file argument.
- **User-scoped local config only**: `auth install` may write `xdoc-license.json` and Clock state in
  the user-owned configuration directory. `XDOC_CONFIG_PATH` specifies a directory. Never use `sudo`
  or elevated privileges, modify OS services (`systemd`/`launchd`), system directories or startup
  items, or autonomously download or install the `xdoc` binary.

## Determine the Execution Environment and Scope

- When the user requests registration or renewal and provides a file path, verify, register, and
  validate it under that authorization. An authorization refusal permits diagnosis within the task.
  Only register, renew, reset Clock state, or uninstall with user authorization for that action.
- Use the same xdoc binary, OS user, working directory, and environment as the pptx-nova execution. First identify the actual binary and run `xdoc --version`; an explicit `XDOC_BIN` and the Agent's `PATH` can select different installations. If the binary is missing, stop and direct the user to install a published Runtime themselves using the [official getting-started guide](https://docs.structurify.io/en/pptx-runtime/getting-started/) (do not autonomously download binaries or run remote installer scripts), then check its current contract once installed.
- Read the focused schema for each action used, for example `xdoc schema --command auth.verify`.
  Resolve its report through `ioContract.stdout.schemaRef`. See [schema discovery](schema-discovery.md#典型-agent-用法)
  for the precise command contracts.
- Inspect only relevant non-secret environment configuration: whether `XDOC_CONFIG_PATH` is set, the user's home (or `APPDATA` on Windows), `CI`, and any explicit task `--license` path. The CLI loads `.env` from its working directory at startup; nonblank process environment values take precedence. Do not read or print the entire environment, full `.env` files, or unrelated secrets from `.env`.

`status` performs full admission and may update Clock state. For file verification only, run
`verify` and stop, including when verification fails. For development checks, set `XDOC_CONFIG_PATH`
to a newly created private absolute directory and leave the user's real license alone.

When reading authorization profiles from the runtime schema, select by exact
profile ID and product, never by array position or a fixed profile count. The
independent `writer-pptx-export-v1` profile belongs to the `pptx-writer` SDK:
its `freeQuotaSubjects` are `final-output` and `read-only-input`; Converter uses
`compressed-input`. These are SDK quota subjects, not native CLI limits. Continue
using the Runtime's own feature/output admission and quota reports for this skill;
the Writer SDK is not a replacement execution path for local xdoc tasks.

## Read Filtered Authorization Reports

For agent-run auth commands, use `<skill-root>/scripts/cli/runtime/auth-report.mjs` as shown below.
It runs the selected local `xdoc` (`XDOC_BIN` or PATH) in the current working directory and environment.
Pass an absolute file path to the helper for `verify` and `install`.
It captures stdout in memory and emits only allowlisted fields from recognized auth reports,
including path fingerprints, file hashes, status, reason codes, validity, capabilities, and known entitlements.
It omits identity fields such as `customerId` and `licenseId`, free-form error text, and all raw stderr.
For path comparisons, fields such as `source.pathSha256` hash the exact UTF-8 path string returned by
xdoc. They are distinct from file content hashes such as `source.sha256`. Use user-supplied or
otherwise authorized paths in messages and commands.

Use `exitCode` for the actual xdoc process result and `report` for its filtered fields. A
`null` report means there is no recognized structured result. Use the filtered `diagnostic` and exit
code to check the invocation or runtime. The helper returns the xdoc exit code when nonzero and
fails when xdoc did not exit normally or no recognized report is available. Keep unfiltered streams
out of tool transcripts and evidence even when troubleshooting. Do not rerun bare auth commands to
recover missing report fields.

## Installation and Renewal

1. Preserve the original UTF-8 delivery bytes; compare the SHA-256 with the delivery notice when available. Confirm the file is a readable regular file and the client is within the issuer's supported version range. Runtime requires `xdoc-cli-license/v1`; Viewer/Converter/Writer SDK credentials do not apply. The original file name, such as `runtime-personal.json`, may be retained. Do not edit signed dates, identity, features, or capabilities, and never install a signing private key.
2. Verify the specified file first. If verification fails, use the table below and correct the conditions before continuing:

   ```sh
   node "<skill-root>/scripts/cli/runtime/auth-report.mjs" verify "/absolute/path/runtime-personal.json"
   ```

   Verification passes only when the exit code is 0 and the report has `outcome: "passed"` and `reason: "ok"`. `status: "success"` alone means the diagnostic completed and can accompany a failed verification.

   Successful signature/time verification does not mean the file is installed or prove Clock rollback admission, possession of the device private key, or task authorization. Stop and report the result if the user requested verification only.

3. Select the configuration directory and install the original file:

   ```sh
   node "<skill-root>/scripts/cli/runtime/auth-report.mjs" install "/absolute/path/runtime-personal.json"
   ```

4. After a successful install, check the installed credential in the same environment:

   ```sh
   node "<skill-root>/scripts/cli/runtime/auth-report.mjs" status
   ```

   For an uncertain result or an install with no recognized report, follow
   [Uncertain Installation Outcome](#uncertain-installation-outcome) before retrying.
   For a failed install, check the [reported reason](#recovery-by-actual-reason).

The default installation target is `$HOME/.config/xdoc/xdoc-license.json` on POSIX and `%APPDATA%\xdoc\xdoc-license.json` on Windows. When set, `XDOC_CONFIG_PATH` identifies the **configuration directory**: it must be an existing private absolute directory accessible to the current user. Runtime manages `xdoc-license.json` inside it. Create the directory first and set private permissions for the actual execution user (normally `0700` on POSIX; use an appropriate ACL on Windows), then retain the same environment for installation, status, and later tasks. Runtime can create the default user configuration directory. Do not point `XDOC_CONFIG_PATH` at the downloaded JSON or set it only for installation while subsequent Agent tasks use another directory. A normal user registration touches only the user's config directory and never uses `sudo` or modifies OS system services or system directories.

A successful install must show both `status: "success"` and `outcome: "installed"`. Check
`installedSha256` against the delivered file and inspect validity and capabilities in
`authenticatedFacts`. A healthy status has these key fields:

```json
{
  "health": "healthy",
  "verification": { "state": "verified" },
  "admission": { "state": "admitted" },
  "taskAuthorization": "not-evaluated"
}
```

Compare `source.pathSha256` and `source.sha256` with `installedPathSha256` and `installedSha256`.
Status exit 0 means only that the query completed: `not-installed` and `unhealthy` can also return 0.
Inspect `verification.reason`, `admission.reason`, and `clock`.

For renewal, use the same commands to install the **newly delivered file**, then repeat status and real-task verification. The new license replaces the old one in the selected configuration directory; retain the original delivery file and do not uninstall first. Check the intended delivery file and expiry against the issuer's notice. Editing the expiry in an old JSON file is not renewal.

### Uncertain Installation Outcome

`outcome: "uncertain"` / `auth_install_outcome_uncertain` means publication may already have occurred. Retain `targetPathSha256`, `attemptedSha256`, and `publication` from the filtered report, then run status in the **same environment**:

- If `source.pathSha256` and `source.sha256` match the attempted target and file, and health/admission are healthy, record the currently observable installation result and continue with real-task verification. Retain the filtered uncertain report.
- If the old file remains, no file exists, or the outcome is still unclear, inspect permissions, storage, and concurrent tasks; correct the conditions before retrying the original delivery.
- If another process installed a different newer file, check whether replacement matches the current task before overwriting that license.

Do not assume failure left the old file unchanged. Do not automatically roll back, delete the target, or bypass installation admission by copying the file manually.

If the install produced no recognized report, use the intended target and the original delivery
hash for this comparison. A process exit code alone cannot establish the current installed state.

## Verify the Actual Task

Install and status verify the local credential; each task is still evaluated against its actual feature, output format, capabilities, and host facts. When there is an original user task, preferably resume it in the same environment, preserving its strict constraints and original inputs and using a new output path. Do not claim that creation, editing, refurbishment, and translation are all authorized merely because PDF conversion succeeded.

To verify conversion independently, use a known valid, unwatermarked PPTX and a new output path.
Provide the exact absolute path of the PPTX. The check accepts one file and rejects wildcard inputs.

```sh
node "<skill-root>/scripts/cli/runtime/auth-report.mjs" check-convert --require-unwatermarked "/absolute/path/slides.pptx" "/absolute/path/licensed-check.pdf"
```

First confirm the options in `xdoc schema --command convert`. `--require-unwatermarked` rejects the
task when an unwatermarked mode cannot be authorized. If only paid entitlement needs to be proved
and the current command discloses the option, use `--require-entitlement`. The helper discards both
raw process streams and filters a temporary `batch/v1` report to the item status, known error codes,
and whether the expected PDF was written. Use the actual exit code and examine the produced PDF.
If no suitable task input is available, report the registration status and that task authorization
remains unverified.

A one-off convert can select a credential explicitly without installing it in the user configuration:

```sh
node "<skill-root>/scripts/cli/runtime/auth-report.mjs" check-convert --require-unwatermarked "/absolute/path/slides.pptx" "/absolute/path/explicit-check.pdf" "/absolute/path/runtime-personal.json"
```

The helper passes the optional third path to the local `xdoc convert --license` option.
`xdoc pptx` creation/editing uses the installed credential. For other commands use options
disclosed by their current schema/help.

When running a conversion as an authorization check, keep its raw streams and any native batch
report outside model context. Extract the exit code, structured error kind/stage/reason when
available, and evidence about the expected output locally before reporting. Do not include raw
diagnostic text in the authorization evidence.

A paid license does not erase arbitrary watermarks already present in input content. Existing ordinary Free marks, signed watermark obligations, and authorization for new output are handled separately; a watermark remaining after direct conversion of an old watermarked file does not prove installation failed. Do not delete signed metadata or change formats to bypass obligations. See [Conversion Input Quotas and Authorization Failures](troubleshooting.md#conversion-input-quotas-and-authorization-failures) for the distinction between quotas and resources.

## Installed License Not Used by the Task

For commands supporting explicit credentials, lookup priority is: command `--license` → `xdoc-license.json` in `XDOC_CONFIG_PATH`, when configured → the platform user default directory. Once a higher-priority source is selected, a missing, unreadable, or invalid file does not automatically fall through to lower-priority credentials. An arbitrary JSON file in the project directory is not automatically discovered.

Compare the actual execution environment:

1. Binary path/version, user/home, working-directory `.env`, `XDOC_CONFIG_PATH`, and `source.pathSha256`/`source.sha256`.
2. Whether the command still specifies an old `--license`, or the Agent/IDE inherited variables from another launch environment.
3. Whether an existing user-owned `xdoc` CLI session daemon still uses the old environment (this is a local user-scoped `xdoc` process, never an OS system service). After changing its environment, restart only that user-owned `xdoc` session according to the [daemon guide](daemon-sessions.md), then check status/the task in that same environment without stopping unrelated tasks.
4. Whether a container or local scheduled task uses another user/configuration path. Installing on the host does not automatically copy the file into a container.

Local Personal/Enterprise licenses do not automatically include CI, cross-user shared-server, or Service/API rights. A nonempty `CI` value other than case-insensitive `0` / `false` triggers CI evaluation. Check the actual execution mode and issued capabilities; explain missing rights and have the user request appropriate delivery from the issuer. Do not falsify host facts or use `--allow-fallback` to bypass a capability refusal. Do not silently fall back to Free when a commercial license fails: preserve the user's unwatermarked/strict authorization constraints and use a disclosed fallback only when the user has explicitly accepted it and the task qualifies for Free.

## Recovery by Actual Reason

The following are symptom-based directions; the current action/report schema defines the complete reason set and exit codes. Argument errors generally use exit 2; install file-read failures use 3, credential refusals 4, and failed/uncertain writes 9. If the filtered report is absent, retain the actual exit code and the helper's diagnostic.

| Observation                                                                                             | Check and recovery                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cli_license_file_read_failed`                                                                          | Check the actual path, case, and current user's file-read and directory-traversal permissions; confirm a readable regular file. Preserve the original; do not automatically use sudo or change unrelated directory permissions.                                                                                                                                                                                                                                                                                    |
| `cli_license_too_large`                                                                                 | Read the current verify/install input limit from schema `ioContract.input.maxBytes` (currently 65,536 bytes). Confirm this is the original credential rather than an archive or web page and obtain it again from the issuer; do not truncate or simplify the signed file.                                                                                                                                                                                                                                         |
| JSON/envelope/payload format error, such as `cli_license_json_invalid` / `cli_license_envelope_invalid` | Check for an HTML download, truncated copy, or wrong product file; obtain the original Runtime JSON again. Do not repair the signed payload.                                                                                                                                                                                                                                                                                                                                                                       |
| `cli_license_schema_unsupported` / `cli_license_kind_unsupported` / `cli_license_signature_invalid`     | Check the Runtime product, delivery hash, and supported client range. Use a published client supported by the issuer or request a corrected delivery; do not add trust keys yourself.                                                                                                                                                                                                                                                                                                                              |
| `cli_license_key_not_found`                                                                             | The current client does not trust the declared signing key. Check that the credential's delivery environment matches the client; staging/test credentials may require an issuer-provided test client. Use a matching production credential for a production client, or the client designated by the issuer. This reason alone does not establish a need to upgrade or republish the CLI. Do not edit the credential or add trust keys yourself. Explain the mismatch to the user without internal signing details. |
| `cli_license_expired` / `cli_license_clock_invalid`                                                     | Check the real system time and delivery validity. Install a renewal if expired; wait for valid activation or request correction if not yet valid. reset-clock does not renew or change issuance dates.                                                                                                                                                                                                                                                                                                             |
| `health: "not-installed"`                                                                               | Compare user, configuration directory, cwd `.env`, and source; install in the directory actually used by the task. Downloading the file or running verify alone does not install it.                                                                                                                                                                                                                                                                                                                               |
| `health: "unhealthy"` or verify succeeds but install/task is refused                                    | Inspect the actual verification/admission/clock reason and investigate validity, Clock, device binding, revocation, and the specific feature/capability. Do not repeatedly install the same file expecting permissions to change.                                                                                                                                                                                                                                                                                  |
| `config_path_invalid` / `auth_config_invalid`                                                           | Ensure `XDOC_CONFIG_PATH` is an existing private absolute directory, not a JSON file or relative path. Check path aliases and managed-target symlinks; retry with an actual regular directory.                                                                                                                                                                                                                                                                                                                     |
| `auth_storage_unavailable` / `auth_install_failed`                                                      | Check current-user directory/file permissions, read-only mounts, disk space, and processes holding locks. If necessary use a new controlled private directory and align later task environments. Do not chmod 777, recursively change permissions, or delete lock files.                                                                                                                                                                                                                                           |
| `outcome: "uncertain"`                                                                                  | Establish publication facts using the path/hash comparison above before deciding whether to retry the same delivery; do not automatically roll back.                                                                                                                                                                                                                                                                                                                                                               |
| `clock_anomaly`                                                                                         | Follow controlled Clock recovery below; first calibrate system time and stop the relevant tasks/daemon.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `device_pop_failed`                                                                                     | A valid signature does not prove this host possesses the bound device private key. Check whether the delivery is bound to this device and whether the published Runtime supports its host capability; ask the issuer to adapt or reissue it. Do not copy private keys or remove devicePublicKey.                                                                                                                                                                                                                   |
| `credential_revoked` or revocation receipt verification error                                           | Retain the actual reason and license hash; ask the issuer to verify revocation or provide corrected delivery. Do not delete receipts, restriction policies, or state to bypass rejection.                                                                                                                                                                                                                                                                                                                          |
| Credential healthy but task reports `no_executable_mode` / `strict_mode_unsatisfied` / exit 4           | Inspect the actual authorization diagnostic, feature, format, capability, and input scope. Do not interpret every exit 4 as a bad file or expiry, or automatically bypass it by splitting slides, deleting charts, or changing formats.                                                                                                                                                                                                                                                                            |
| Credential healthy but resource/font/input error remains                                                | Follow [runtime troubleshooting](troubleshooting.md) for the actual file and engineering limits; a paid license does not raise compiled resource limits.                                                                                                                                                                                                                                                                                                                                                           |

### Clock Recovery and Uninstall

Perform Clock recovery only when `clock_anomaly` has been observed and the user's recovery request covers this action. First calibrate the real system time, stop the tasks and daemon in use, confirm the same configuration directory, then read `xdoc schema --command auth.reset-clock` and execute:

```sh
node "<skill-root>/scripts/cli/runtime/auth-report.mjs" reset-clock
```

Reset removes only the supported fixed Clock anchor, preserving the license and lock file. Handle `auth_clock_reset_failed`, `auth_clock_reset_outcome_uncertain`, or `auth_clock_reset_unsupported` according to the actual report. If reset is unavailable, explain the limitation and consult the issuer; do not manually delete directories or lock files. Check status in a new process, then restart relevant long-running processes and resume the original task. Reset cannot make an expired, future-valid, device-mismatched, or revoked credential valid. Do not make reset a prerequisite for first installation.

Run `node "<skill-root>/scripts/cli/runtime/auth-report.mjs" uninstall` only when the user asks to stop
using or remove the installed license. It removes the license in the currently selected configuration
directory and preserves Clock state, lock files, and the downloaded source. Free availability after
uninstall still depends on actual task conditions.

## Evidence and Handoff

As needed, retain binary identity, relevant focused schemas, commands with path arguments only,
non-secret cwd/config-path facts, exit codes, **filtered auth reports**, and relevant real-task evidence
in a new task directory. Bind the delivery hash, install hash, and status source hash. Exclude raw
auth stdout and stderr, license contents, identity fields, private keys, and environment secrets.
For a conversion authorization failure, record its exit code, scoped `kind`, `stage`, and reason code
from the task report. Keep free-form process errors and full task reports out of the licensing evidence.
Tell the user whether diagnosis, healthy registration, or an actual task was completed. If still
blocked, report the actual reason, affected feature/environment, and what the issuer can correct.
Send reports externally only at the user's explicit request.

References: [official licensing guide](https://docs.structurify.io/en/pptx-runtime/licensing/) and its [machine-readable version](https://docs.structurify.io/llms.mdx/docs/en/pptx-runtime/licensing/content.md). Its stated client range may differ from the current binary. Confirm against that binary's schema/help, actual reports, and the issuer's delivery scope; do not infer unpublished activation, online renewal, or device migration capabilities from local source.
