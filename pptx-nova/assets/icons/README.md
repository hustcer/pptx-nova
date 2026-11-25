# Plain-Text Tabler Icon Data

The bundled Tabler icon pack is stored as three plain-text UTF-8 tab-separated files so every row
is directly human-readable and auditable without opaque compressed binaries:

- `tabler-icons.catalog.tsv` — pack header, fixed `outline` and `filled` SVG shells, and catalog metadata (`@icon` rows) for all 6,166 icons.
- `tabler-icons.outline.tsv` — passive SVG geometry (`@svg` rows) for all 5,112 outline icons.
- `tabler-icons.filled.tsv` — passive SVG geometry (`@svg` rows) for all 1,054 filled icons.

None of these files is a JavaScript module, executable, encrypted payload, or runtime download. The
loader parses plain-text records; it does not evaluate them, import them as code, or run commands
from them.

The current package contains 6,166 icons (5,112 outline and 1,054 filled) from Tabler 3.45.0.
The MIT license is retained in [icon-license](icon-license).

## Inspect and verify

From the installed skill root, run:

```bash
node scripts/cli/assets/icons.mjs verify --json
node scripts/cli/assets/icons.mjs get presentation server server-bolt --json
node scripts/cli/assets/icons.mjs unpack --output <run-dir>/tabler-icons.tsv
```

`unpack` writes a combined canonical TSV review file exclusively; it refuses to replace existing
evidence or pack files. Normal search/get commands remain offline and continue to support aliases,
both styles, recoloring, and stroke width.

[tabler-icons.pack.manifest.json](tabler-icons.pack.manifest.json) is generated with the pack. It
records the plain-text storage format, source version, per-file byte lengths and SHA-256 digests,
canonical combined digest, icon counts, license digest, and one readable SVG example. The old
`tabler-icons.manifest.json` describes a separate curated selection; it is not this full pack's
integrity manifest.

Every first load verifies the bundled manifest and license, enforces a 16 MiB total size ceiling
across the pack files, requires valid UTF-8 and the split pack schema (`pptx-nova-tabler-icon-pack/v2`),
and checks catalog/body and style-part coverage. Only self-closing passive geometry elements and
explicitly allowed attributes/values are accepted; scripts, events, links, external resources, CSS,
entities and unknown records are rejected. Parsed data is cached for the process. Legacy custom
`--pack` files (split TSV without a manifest, single-file TSV, or legacy `.br`) still use the same
size/grammar checks; `verify` reports `manifestVerified: false` when no manifest is present.

## Source and reproducibility

The source is [Tabler Icons](https://github.com/tabler/tabler-icons), at tag `v3.45.0`, commit
[`975920ff99c12c4dc9e3fe61a03738330600f9b2`](https://github.com/tabler/tabler-icons/tree/975920ff99c12c4dc9e3fe61a03738330600f9b2).
[tabler-icons.pack.provenance.json](tabler-icons.pack.provenance.json) records that revision, the
expected per-file and canonical SHA-256 digests, and two existing local adjustments: `server` and
`server-bolt` each add `v-2` to finish one SVG path edge. All other normalized source rows match
that revision.

To reproduce the current files, prepare a checkout at that exact commit, apply the recorded literal
find/replace adjustments once each, then run the existing dependency-free generator:

```bash
node scripts/cli/assets/icons.mjs generate --source-root <prepared-checkout>
node scripts/cli/assets/icons.mjs generate --source-root <prepared-checkout> --check
```

The generator reads SVG/JSON/license files only; upstream install/build scripts need not run.
It emits the three plain-text TSV files, license, and integrity manifest deterministically, and
`--check` verifies all five outputs. A refresh requires reviewing provenance and synchronizing the
full-pack catalog version/counts; the public release audit rejects stale catalog/provenance digests.

SHA-256 checks detect changes relative to the installed manifest; they do not authenticate a package
whose code and manifest have both been replaced. Trust the reviewed distribution and source revision.
