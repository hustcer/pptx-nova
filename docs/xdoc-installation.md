# xdoc installation and binary distribution

This guide explains how to install the native `xdoc` CLI, verify the executable
that will run an Agent job, and keep the runtime evidence needed for a
repeatable PPTX workflow.

`xdoc` is a native executable with two designated public distribution channels:

1. a global npm package, `@s8fy/xdoc`; and
2. versioned native archives on the
   [pptx-nova Releases page](https://github.com/hustcer/pptx-nova/releases#release-v0.3.0).

Both channels are expected to expose the same `xdoc` command, runtime version,
discovery schema, native backends, and license notices for a given release. The
npm package is a distribution entry point for the CLI, not a second execution
contract.

A release archive contains the CLI, the PDFium runtime used by PDF/PNG
conversion, and the applicable license notices. You do not need PowerPoint or a
full office installation for the native conversion and PPTX bridge paths, but
you do need the fonts and backends required by the requested operation.

> **npm availability:** the package name `@s8fy/xdoc` is reserved for this
> distribution path, but the package is not yet published. Until
> `npm view @s8fy/xdoc version` succeeds, use a versioned GitHub Release archive.
> The commands below become the supported npm path when the first package is
> published.

## Choose an installation path

| Use case                                         | Recommended path                              | Why                                                                       |
| ------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------- |
| Interactive installation after npm publication   | `npm i -g @s8fy/xdoc`                         | Installs the `xdoc` command through a familiar cross-platform CLI channel |
| A pinned worker or air-gapped promotion pipeline | Download a versioned GitHub Release archive   | The exact binary, native renderer, notices, and digest move together      |
| CI, a container image, or a managed worker       | Promote an approved binary archive as a layer | The runtime can be verified once and deployed as an immutable image layer |

Do not install a nightly artifact when the job needs a reproducible result. Pin
the release tag, archive digest, and the `xdoc schema` snapshot together.

This public installation contract is executable-only. Treat the `xdoc` process,
its versioned schema, and its machine-readable reports as the integration
boundary.

## Install from npm

After the package is published, install the CLI globally and immediately probe
the executable that npm placed on `PATH`:

```bash
npm i -g @s8fy/xdoc
xdoc --version
xdoc schema --index
```

For a production worker, pin the package version instead of accepting a moving
tag:

```bash
npm i -g @s8fy/xdoc@0.3.0
xdoc --version
```

The reported xdoc version is authoritative. The npm package version should map
one-to-one to the xdoc release version, but an Agent must still probe
`xdoc --version` and `xdoc schema` rather than infer capabilities from npm
metadata.

Upgrade or remove the global package with:

```bash
npm update -g @s8fy/xdoc
npm uninstall -g @s8fy/xdoc
```

Before the first npm release is accepted, its clean-machine test must confirm
that it exposes `xdoc` on `PATH`, installs the correct platform runtime and
notices, and produces the same version and schema as the corresponding GitHub
Release. The package must document whether installation needs network access
beyond the npm registry; this guide does not assume a particular bundling or
download implementation.

## Release archive matrix

The current release workflow publishes these target names. The matrix is a
release fact, not a promise that every CPU/OS combination is available.

| Target         | Archive                   | Archive format | Bundled native library |
| -------------- | ------------------------- | -------------- | ---------------------- |
| Linux x86-64   | `xdoc-linux-x64.tar.gz`   | tar + gzip     | `libpdfium.so`         |
| Linux ARM64    | `xdoc-linux-arm64.tar.gz` | tar + gzip     | `libpdfium.so`         |
| macOS ARM64    | `xdoc-macos-arm64.tar.gz` | tar + gzip     | `libpdfium.dylib`      |
| Windows x86-64 | `xdoc-windows-x64.zip`    | ZIP            | `pdfium.dll`           |

There is currently no published macOS x86-64 or Windows ARM64 archive. A worker
must reject an archive whose target does not match its host rather than trying
to execute it and reporting a generic file error.

> **v0.3.0 macOS ARM64 caveat:** the currently published executable declares a
> macOS minimum version of 26.0 in its Mach-O load command. It therefore does
> not run on macOS 15.x hosts. Treat that asset as pending until it is rebuilt
> with the intended deployment target and passes a clean-host probe; the release
> runner label alone is not a compatibility guarantee.

## Download a pinned release

Replace `v0.3.0` and the archive name with the release and target you have
approved. GitHub's release API exposes an asset digest; retain that digest in
the deployment record. If the public release process later publishes a signed
manifest, verify the manifest as well.

The canonical v0.3.0 entry point is:
<https://github.com/hustcer/pptx-nova/releases#release-v0.3.0>.

```bash
release_tag=v0.3.0
archive=xdoc-linux-x64.tar.gz
release_repo=hustcer/pptx-nova

gh release download "$release_tag" \
  --repo "$release_repo" \
  --pattern "$archive" \
  --dir ./xdoc-download

gh release view "$release_tag" \
  --repo "$release_repo" \
  --json assets \
  | jq -r --arg name "$archive" \
      '.assets[] | select(.name == $name) | .digest'
```

If `gh` is not available, use the browser **Assets** list on the release page or
the corresponding `https://github.com/<owner>/<repo>/releases/download/<tag>/`
URL. Do not parse a branch build directory as a release.

## Install on Unix-like systems

Keep the executable and its colocated PDFium library in the same directory. The
release binary is prepared with a relative runtime search path; moving only
`xdoc` and leaving the library behind breaks PDF/PNG commands.

```bash
release_tag=v0.3.0
archive=xdoc-linux-x64.tar.gz       # use xdoc-macos-arm64.tar.gz on Apple Silicon
install_dir="$HOME/.local/lib/xdoc/$release_tag"

mkdir -p "$install_dir"
tar -xzf "./xdoc-download/$archive" -C "$install_dir"
chmod +x "$install_dir/xdoc"

mkdir -p "$HOME/.local/bin"
ln -sfn "$install_dir/xdoc" "$HOME/.local/bin/xdoc"
export PATH="$HOME/.local/bin:$PATH"

xdoc --version
xdoc schema --index > "$install_dir/patch-index.json"
```

For a system-wide installation, use a root-owned version directory and add a
symlink to a directory already managed by the host's package policy. Do not
overwrite a live binary in place while a worker is running; install the new
version beside the old one and switch the symlink after verification.

The archive also contains `LICENSE` and a `licenses-pdfium/` directory. Keep
those files with the binary when redistributing the archive or building a
container image.

## Install in CI, a container, or a managed worker

Create the worker layer from the exact approved release archive. Keep `xdoc`,
its colocated PDFium library, and all license notices together; record the
archive digest and image digest; and run the same `xdoc --version` plus
`xdoc schema` probe during image creation and again when the worker starts.

Do not make the worker depend on a mutable branch artifact or an undeclared
binary copied from a developer machine. Promotion should move the already
verified archive unchanged between environments.

## Install on Windows

Extract the ZIP without separating `xdoc.exe` from `pdfium.dll`, then add the
version directory to the worker's `PATH` or invoke the absolute path.

```powershell
$releaseTag = 'v0.3.0'
$installDir = Join-Path $env:LOCALAPPDATA "xdoc\$releaseTag"
Expand-Archive .\xdoc-download\xdoc-windows-x64.zip -DestinationPath $installDir -Force

& (Join-Path $installDir 'xdoc.exe') --version
& (Join-Path $installDir 'xdoc.exe') schema --index | Out-File (Join-Path $installDir 'patch-index.json') -Encoding utf8
```

If Windows blocks execution because the archive came from an untrusted source,
follow the organization's code-signing and quarantine policy. Do not disable
endpoint protection globally to make a release artifact run.

## Verify the runtime before giving it to an Agent

The executable that runs the job is authoritative. A checked-in schema file or a
wrapper script is not a substitute for probing that executable.

```bash
xdoc --version
xdoc schema --index > runtime-patch-index.json
xdoc schema > runtime-schema.json

jq -e '.schemaVersion == "cli-agent/v1"' runtime-schema.json
jq -e '.schemaVersion == "cli-agent/v1" and (.operations | length > 0)' runtime-patch-index.json
```

Whether the CLI came from npm or a release archive, use the same acceptance
probe. Save this as `probe.patch.json`:

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
      "name": "ProbeTitle",
      "text": "xdoc release probe"
    }
  ]
}
```

Then prove dry-run isolation, apply the patch, and reopen the candidate:

```bash
xdoc pptx apply --patch probe.patch.json --output probe.pptx --dry-run --json > probe-dry-run.json
test ! -e probe.pptx
xdoc pptx apply --patch probe.patch.json --output probe.pptx --json > probe-apply.json
xdoc pptx inspect probe.pptx --json > probe-inspect.json
jq -e '.schemaVersion == "pptx-dry-run/v1" and .status == "success"' probe-dry-run.json
jq -e '.schemaVersion == "pptx-apply/v1" and .status == "success"' probe-apply.json
jq -e '.schemaVersion == "pptx-inspect/v1" and .status == "success"' probe-inspect.json
```

For a real mutation, require the complete dry-run → apply → preview → visual
check sequence described in
[the Agent integration guide](./xdoc-integration.md). Keep the exact runtime
schema, reports, sidecar, and archive digest with the job record.

## Runtime requirements and policy boundaries

### Fonts and rendering

PDF and PNG output depends on the bundled renderer plus the fonts available to
the worker. Font fallback can change line wrapping and pagination. For a
repeatable deployment:

- provision the required fonts on every worker image;
- set `XDOC_FONT_CACHE` to a controlled persistent cache when repeated jobs
  should share resolved fonts;
- set `XDOC_DISABLE_REMOTE_FONTS=1` (or `true`) for an offline worker; and
- when the offline cache is complete, add the resolver's
  `.xdoc-font-cache-ready` marker.

Retain the font inventory and render manifest with visual evidence. A passing
static check does not prove that two machines rasterize the same glyphs.

### Licensing and PDF authorization

The CLI archive and its bundled native components can have different license
terms. Read the `LICENSE` file in the exact archive and the notices under
`licenses-pdfium/` before redistributing it. Runtime PDF authorization is a
separate policy boundary. Depending on the edition and license policy, a
development or unlicensed runtime may impose an input-size limit or add an
`XDOC DEMO` watermark. Verify the exact artifact instead of assuming that all
distributions behave alike.

### Filesystem and security

Run the CLI in an isolated input/output root when it processes untrusted decks.
The native package reader rejects unsafe ZIP paths and applies package-size and
part-count limits. Keep daemon state files private, keep release libraries
colocated, and never pass user-controlled strings through an interpolated shell
command.

## Troubleshooting

| Symptom                                              | Likely cause                                                             | Action                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Exec format error` or an immediate loader failure   | The archive target does not match the host architecture or OS            | Select the exact target from the release matrix and verify with `file`/`Get-FileHash` before installation                                         |
| PDF/PNG commands cannot load PDFium                  | `xdoc` was moved without `libpdfium.*`, or the library is not executable | Restore the archive layout and run `xdoc --version` before moving the symlink                                                                     |
| macOS reports an incompatible system version         | The artifact was built with a newer deployment target than the worker    | Publish and select an archive whose documented minimum macOS version includes the worker; do not promise compatibility from the runner name alone |
| Text wraps differently across workers                | Fonts or font cache differ                                               | Compare `xdoc extract ... --parts fonts`, provision the same fonts, and retain render provenance                                                  |
| A file exists but the Agent marks the job successful | The caller checked filesystem existence instead of the report            | Parse the command's versioned report and exit policy; a file alone is not a gate                                                                  |
| `XDOC DEMO` appears in PDF/PNG output                | The runtime's PDF authorization policy is inactive or restricted         | Check the exact edition/license and document the watermark policy for the deployment                                                              |

## Related documentation

- [xdoc introduction](./xdoc-introducution.md) — architecture, contracts, and
  limitations
- [xdoc integration guide](./xdoc-integration.md) — process, daemon, and
  Agent-host integration
- [xdoc conformance profile](./xdoc-conformance.md) — proposed
  cross-implementation contract
- [xdoc runtime schema](./xdoc-schema.json) — checked-in discovery snapshot
- [pptx-nova SKILL](../pptx-nova/SKILL.md) — user-facing Agent workflow
