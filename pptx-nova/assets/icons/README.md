# Plain-Text Tabler Icon Data

The bundled Tabler icon pack is stored as three plain-text UTF-8 tab-separated files so every row
is directly human-readable and auditable without opaque compressed binaries:

- `tabler-icons.catalog.tsv` — pack header, fixed `outline` and `filled` SVG shells, and catalog metadata (`@icon` rows) for all 6,563 icons.
- `tabler-icons.outline.tsv` — passive SVG geometry (`@svg` rows) for all 5,509 outline icons.
- `tabler-icons.filled.tsv` — passive SVG geometry (`@svg` rows) for all 1,054 filled icons.

None of these files is a JavaScript module, executable, encrypted payload, or runtime download. The
loader parses plain-text records; it does not evaluate them, import them as code, or run commands
from them.

The current package contains 6,563 icons (5,509 outline and 1,054 filled) from Tabler 3.53.0.
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

The source is the Tabler Icons `v3.53.0` release at commit `999041dfbde45ad28e6da8af9d96b492461ffb59`.
This release includes the geometry fixes for `server` and `server-bolt`. The provenance file records
the revision and the expected per-file and canonical SHA-256 digests.
[Upstream source](https://github.com/tabler/tabler-icons/tree/999041dfbde45ad28e6da8af9d96b492461ffb59) · [Provenance](tabler-icons.pack.provenance.json)

To reproduce the current files, run the dependency-free generator with a clean checkout of that
commit.

```bash
node scripts/cli/assets/icons.mjs generate --source-root <upstream-checkout>
node scripts/cli/assets/icons.mjs generate --source-root <upstream-checkout> --check
```

The generator reads SVG/JSON/license files only; upstream install/build scripts need not run.
It emits the three plain-text TSV files, license, and integrity manifest deterministically, and
`--check` verifies all five outputs. When refreshing the pack, update the full-pack catalog version
and counts, the provenance record, and the version and count assertions in the Tabler runtime tests.
The public release audit checks the catalog and provenance against the verified pack.

SHA-256 checks detect changes relative to the installed manifest; they do not authenticate a package
whose code and manifest have both been replaced. Trust the reviewed distribution and source revision.
