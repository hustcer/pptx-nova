# Cartesian 2.0

Cartesian is a quiet museum-catalog language: warm stone, regular serif headlines,
clean sans supporting text, hairline rules and compass rings. Preserve hierarchy
through type and space. Cards are tracing-paper rectangles; lists/timelines are
ruled registers, not decorated flowcharts. No saturated accent, shadow, gradient,
rounded cards or italic display. Numeric/geometry facts live in design.json.

Use the standard discovery → content → validate → build → create workflow. All ten
existing slide type names remain. Each page resolves a registered composition;
`layoutId: "auto"` is deterministic and chooses among fitting frames. Explicit
layout IDs still undergo capacity checks. No fit means reorganize or split;
content is never truncated or shrunk to an unreadable size. Short extracts can
set `meta.designScope: "excerpt"`; complete decks open with cover and end with closing.

Cover hero/wide, agenda split/stacked, statement centered/reading, columns rail/wide,
image-left/image-right, cards row/register, line wide/rail and timeline horizontal/vertical
change actual geometry. Team/closing have one count-driven or centered composition.
Generic slot budgets describe default maximum-count geometry; actual resolver checks
combined strings, every repeated item and the selected layout. PNG/PDF review remains necessary.

## Content migration

The two chart types now require explicit `data.unit` and `data.source`. Use authoritative
metadata; do not infer currency, percentage or a real source from the template.
`chart.categories` and both `series[].name/values` remain unchanged. Values must be
finite and match category counts. An authored valueAxis may not clip source data.
The old implicit 0–60 maximum and smooth line interpolation are removed. Data stays
in native editable chart series; tiny observations on a common linear scale may
not have individually visible pixels. Display formatting does not alter raw values.

All other visible field names remain. Optional agenda `textLayout: "paragraphs"`
retains native `S{index}_AgendaParagraphs` and per-item `level` for choreography;
levels in independent-row mode fail rather than being silently ignored. Numbering
and neutral Roman markers can be generated; every business label/value comes from content.

`image.editorial` remains a caller-provided assets-manifest slot. With no image,
the editable crossed frame is intentional. contain/cover/crop-safe/no-crop use
normal asset resolution; no source photo or full-page screenshot is bundled.
Stats are display strings; no numeric graphic is derived from those strings.

## Design adaptations and limits

Small source labels are darkened and enlarged for readability; paragraphs and KPI
rules reserve actual clearance. Circle markers/initials own their text and use
horizontal/vertical centering. Browser navigation, hover and transitions are omitted.
The skin carries no business policy. Bundled numbers/claims are explicitly synthetic.

Latin uses Playfair Display and Inter; Chinese display uses Songti SC and supporting
text uses Arial Unicode MS. Fonts are not bundled. Recheck actual regular/bold glyphs,
font availability and final canonical PNGs on another machine; Fontconfig alone does
not describe the xdoc/Office font resolver. Readback proves supported object/text/geometry
and chart categories/names/values, not full OOXML/workbook equivalence or host parity.

Creation readiness and existing theme/style native refurbishment are separate
capabilities; this migration does not prove arbitrary source-deck preservation.
