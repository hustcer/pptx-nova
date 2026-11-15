# Native visuals in place of generated images

Until an image-generation integration is deliberately added to this workflow, **native PowerPoint
composition is the only authoring route for new picture/illustration assets that would otherwise
require image generation**. This includes decorative pictures,
illustrations, image holders and image-led layouts. Use the current xdoc contract to create a finished
visual; a colored rectangle, crossed shell or caption alone is not a delivered picture replacement.
This does not replace supplied photographs, approved brand assets or source-deck pictures during edits.

Maintained DeckKit inspection examples may deliberately show clearly labelled image holders so their
asset regions remain discoverable. These examples describe the slot, not a finished visual for a new
user deck. For each delivery, inspect the actual page and classify every picture responsibility:
authorized supplied asset, explanatory native illustration, or decorative native composition. A sample
holder or a kit's historical shell default never satisfies the latter two. Extend a missing registered
adapter before building that page; choose the subject for its content instead of repeating one motif.

## Choose what the visual should communicate

Record the subject and whether the visual is explanatory or decorative in the existing
`deck_lock.artDirection` / slide `layoutIntent`. Build from a few recognizable parts with a clear
silhouette, hierarchy and negative space. Examples include a document opening into output surfaces,
connected peers around a shared object, an editorial landscape, or a rhythmic field of contours.
Choose the treatment for the subject; do not repeat one generic symbol in every image region.

The route is broader than shape and path. Use supported native shapes, custom geometry, connectors,
groups and text; registered icons can complement the composition. Charts, tables and numeric diagrams
are suitable when actual supplied data supports them. Discover authoring support before using other
PowerPoint elements: render/preserve support for SmartArt, media or 3D is not authoring permission.
Do not fabricate screenshots, official marks, faces, certificates, customers or measured data to make
a drawing appear authoritative. An abstract decorative visual is not evidence of a product feature.

## Keep the composition in the maintained workflow

The common implementation is `assets/deckkits/shared/native-artwork.mjs`, independent of every
DeckKit. `createNativeArtwork()` accepts a frame, motif, palette-role mapping and line widths and
returns native-evidence components. Any kit can place those components in its own registered region;
use a distinct component `prefix` when one slide has multiple regions. Do not copy the drawing logic
into a kit. `createNativeArtworkPatch()` emits the same drawing as typed
xdoc operations, using a supplied RGB palette and unique object-name prefix.
Its standalone patch explicitly disables inherited 2D shape effects. The source-preserving Edit gate
also resolves referenced theme effect styles and rejects inherited 3D properties, which an empty local
effect list does not disable. Kit adapters retain responsibility for their own paint and design contracts.

For a standalone authoring input, prepare a spec and call the shared CLI:

```json
{
  "slide": 0,
  "frame": [8.8, 2.1, 3.0, 2.8],
  "kind": "documents",
  "prefix": "HeroVisual",
  "palette": { "surface": "FFFFFF", "ink": "246B81", "accent": "F8AA98", "secondary": "F8DFD7" }
}
```

```bash
node <skill-root>/scripts/cli/assets/native-artwork.mjs \
  --spec <run-dir>/native-artwork.json --output <run-dir>/native-artwork.patch.json
```

This works without selecting a kit. It emits additions only, not a new slide or automatic application.
Use the same palette roles as the deck and compose through its owned layout/patch contract before
check-lock, dry-run and canonical review. The shared motifs are starting points; new subjects extend
this shared layer or use other supported native objects, rather than duplicating kit-specific implementations.

- Prefer the selected DeckKit's registered native-artwork slot. For Teal Journal covers, use
  `data.artwork: "documents" | "connections" | "contours"`; omission renders contours. The kit owns
  geometry and colors. `assetCaption` remains the content-owned caption, rather than an empty-holder label.
  Its anatomy specimen image region also uses shared contours in both layouts, retaining `sample.imageCaption`.
- When a named kit has no suitable native composition, extend its maintained schema, component,
  contract and tests before delivery. Preserve its visual identity. Do not switch the named kit,
  inject arbitrary geometry through choreography or put undeclared `customOps` into content.
- Derive positions and connector endpoints from the owning region and object bounds. Fit the entire
  painted composition inside the region; a freeform bbox does not clip control points or strokes.
  Use kit palette and line-weight roles, keep captions readable, and retain native editability.
- Native objects live in the patch/design plan, not in a fictitious image file or `assets_manifest`
  entry. Register an external asset only when a real authorized file is actually used. No image search,
  generated raster, downloaded decoration or whole-slide screenshot is an alternative generation route.

If a real photograph, identity or product screen is necessary to support a claim, a drawing can only
be labelled as a conceptual illustration; it cannot close that factual proof requirement. Preserve
the actual supplied evidence or disclose the missing input instead of presenting decoration as proof.

## Review the actual replacement

Use the ordinary dry-run, semantic, design-readback and canonical PNG gates. Inspect the full image
region and the slide at presentation size: the visual should occupy a useful area, communicate its
chosen subject, retain clear lines at small scale and avoid caption/chrome collisions. Check different
registered layout variants and unrelated topics when extending a kit. Review a representative native
PowerPoint export when available; static PNGs do not prove playback or cross-device font fidelity.

Shared generation is available to every kit; existing content schemas do not automatically acquire
new fields. Keep the drawing engine shared and add only a thin region/slot adapter when a kit needs
one. Teal Journal is an initial adapter and validation example, not the owner of this capability.

## Add artwork to an existing deck

Use the existing deck's actual region, palette and inspect-proven identities; do not select a new kit
or regenerate other slides. The standalone shared CLI emits editable additions. Retain existing labels;
when necessary, declare their exact new offsets before applying the patch.

The reviewed Edit finalizer supports a bounded `operationKind: "native-artwork"` profile described in
[Edit Contract](../edit/edit-contract.md#native-artwork-additions). It requires source-object XML
preservation, declared text-free freeforms inside their owned regions, unchanged package parts outside
the reviewed slide XML, and the ordinary machine and actual PNG review gates. Other structural edits
retain their own workflow; the native oracle decision is preserved in the final report.
