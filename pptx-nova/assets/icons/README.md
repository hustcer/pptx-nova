# Compressed Tabler icon data

`tabler-icons.pack.br` is an offline Brotli-compressed UTF-8 data file. It contains a tab-separated
icon catalog, two fixed SVG shells, and passive SVG geometry. It is not a JavaScript module,
executable, encrypted payload, or runtime download. The loader decompresses and parses data;
it does not evaluate it, import it as code, or run commands from it.

The current package contains 6,166 icons (5,112 outline and 1,054 filled) from Tabler 3.45.0.
Compression reduces 2,366,876 decoded bytes to 361,877 bytes. The `.br` bytes remain unchanged.
The MIT license is retained in [icon-license](icon-license).

## Inspect without executing payloads

From the installed skill root, run:

```bash
node scripts/cli/assets/icons.mjs verify --json
node scripts/cli/assets/icons.mjs unpack --output <run-dir>/tabler-icons.tsv
node scripts/cli/assets/icons.mjs get presentation server server-bolt --json
```

`unpack` writes a new review file exclusively; it refuses to replace existing evidence or the pack.
The expanded TSV is for inspection, not an additional published runtime asset. Normal search/get
commands remain offline and continue to support aliases, both styles, recoloring, and stroke width.

[tabler-icons.pack.manifest.json](tabler-icons.pack.manifest.json) is generated with the pack. It
contains the compression method, source version, compressed/decoded sizes and SHA-256 digests,
icon counts, license digest, and one readable SVG example. The old `tabler-icons.manifest.json`
describes a separate curated selection; it is not this full pack's integrity manifest.

Every first load verifies the bundled manifest and license, limits compressed input to 4 MiB and
decoded output to 16 MiB, requires valid UTF-8 and the pack schema, and checks catalog/body coverage.
Only self-closing passive geometry elements and explicitly allowed attributes/values are accepted;
scripts, events, links, external resources, CSS, entities and unknown records are rejected.
Parsed data is cached for the process. Legacy custom `--pack` files without a manifest still use
the same size/grammar checks; `verify` reports `manifestVerified: false` for those files.

## Source and reproducibility

The source is [Tabler Icons](https://github.com/tabler/tabler-icons), at tag `v3.45.0`, commit
[`975920ff99c12c4dc9e3fe61a03738330600f9b2`](https://github.com/tabler/tabler-icons/tree/975920ff99c12c4dc9e3fe61a03738330600f9b2).
[tabler-icons.pack.provenance.json](tabler-icons.pack.provenance.json) records that revision, the
expected pack digest, and two existing local adjustments: `server` and `server-bolt` each add `v-2`
to finish one SVG path edge. All other normalized source rows match that revision.

To reproduce the current bytes, prepare a checkout at that exact commit, apply the recorded literal
find/replace adjustments once each, then run the existing dependency-free generator:

```bash
node scripts/cli/assets/icons.mjs generate --source-root <prepared-checkout>
node scripts/cli/assets/icons.mjs generate --source-root <prepared-checkout> --check
```

The generator reads SVG/JSON/license files only; upstream install/build scripts need not run.
It emits the Brotli pack, license, and integrity manifest deterministically, and `--check` checks
all three outputs. A refresh requires reviewing provenance and synchronizing the full-pack catalog
version/counts; the public release audit rejects stale catalog/provenance digests.

SHA-256 checks detect changes relative to the installed manifest; they do not authenticate a package
whose code and manifest have both been replaced. Trust the reviewed distribution and source revision.
These checks and readable evidence address the opaque-asset concern, but a scanner may continue
flagging compressed bytes as opaque. They are not a scanner exclusion or a claim of immunity;
request review with these artifacts if a subsequent scan retains the alert.
