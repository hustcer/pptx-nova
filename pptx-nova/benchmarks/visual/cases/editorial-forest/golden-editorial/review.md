# Editorial Forest golden review

Accepted **0.1.0 / candidate**, 2026-11-13. Runtime: xdoc `0.22.0 (80bf93e7)`;
frozen `XDOC_FIELD_DATE=2026-11-13`. This does not promote the kit to production/default.

## Source and design decisions

All four supplied HTML-template files were analysed. All eight actual pages and the declared
1920×1080 canvas agree with 16:9. The complete eight-role visual baseline was accepted before
componentization. One useful open-table role was added: nine roles and eighteen registered layouts,
without manufacturing twelve pages for a count target. The
[intent contract](../../../../../assets/deckkits/editorial-forest/intent.md) records capacities and boundaries.

Preserved: forest/rose/oat surfaces, upright large serif, tracked mono chrome, circular stamp,
asymmetric topic mosaic, thin rules, owner/time markers, large numerals and alternating density.
Georgia is the source's available fallback for Source Serif 4; Songti SC supplies Chinese serif text,
with JetBrains Mono/Noto Sans SC chrome. Fonts are not embedded; variable-font/500-weight parity
is not claimed. Browser navigation/motion is excluded. Source chart categories were realigned,
bottom metadata gained breathing room and small text on light green gained contrast. Feature
imagery remains an editable placeholder shell, without a bundled image or image-ingestion claim.

## Reuse and individual PNG review

| Accepted corpus               | Pages | Coverage                                                                                |
| ----------------------------- | ----: | --------------------------------------------------------------------------------------- |
| English golden                |     9 | All roles; native chart/table; standard Create finalization                             |
| Same-content alternative      |     9 | Second geometry for every role; complete information                                    |
| Chinese community book repair |     9 | Different domain; synthetic data; no reference-topic leakage                            |
| Mixed Chinese/English         |     9 | Actual regular/bold fonts; mixed headings, legend, table and suffixes                   |
| Stress                        |    18 | Every layout; maximum item/category/series/row/column counts; negative/zero/tiny values |

All **54 accepted canonical pages were individually viewed**. Contact sheets were used for rhythm
only. Stamp, coloured labels, numeral suffixes, chart values and table/footer boundaries were also
enlarged from the same PNGs. Current-source patches match all five accepted corpora. The final golden
and committed [showcase PPTX](../../../../../assets/examples/deckkits/editorial-forest/deck.pptx) have
SHA-256 `790d22853566aa99df95120190615c373aaf0cb687c08d43c571f68cf218cb47`.

| Golden page | Individual canonical and PowerPoint PDF observation                      |
| ----------- | ------------------------------------------------------------------------ |
| 1 Cover     | Three hero lines, centred stamp and complete bottom chrome               |
| 2 Index     | Five complete topics/tags; readable light-green tile; distinct hierarchy |
| 3 Statement | Four quote lines, full attribution and clear footer separation           |
| 4 Feature   | Both paragraphs, placeholder caption and three metadata fields complete  |
| 5 Chart     | Ten correct values, five categories, two series, unit and source visible |
| 6 Process   | Four full steps; readable owner/time strips; clear dividers              |
| 7 Stats     | Values/units/explanations complete; suffix baselines; upright fonts      |
| 8 Matrix    | All native cells; bold focus column; separate bottom note                |
| 9 Closing   | Hero and three complete takeaways; footer clear                          |

## Machine gates and closed defect

Content/schema/slot validation, generated design projections, dry-run/apply semantic evidence,
native-object readback and semantic audit passed. All five accepted PPTX packages passed ZIP CRC
and XML well-formedness checks; these are not full OOXML XSD validation. Golden strict structure
checks found all four fonts and eight expected sRGB colours, with zero errors/warnings/residue.
Golden benchmark (three repeats) and required-live candidate readiness passed against the same
current benchmark directory. Vision high/medium/low: **0/0/0**.

Targeted tests cover every layout at minimum/maximum cardinalities, distinct geometry and field
preservation. Blank/unknown/excess input, nonfinite values, overflowing domain, dimension mismatch,
zero column weight, illegal focus column, custom ops/assets and identity/cadence violations are
rejected. Reference-specific leakage checks passed emitted text and alternate-topic PPTX readback.
Cardinality tests do not certify arbitrary string lengths or every numeric range; real font/frame fit
remains required. No shared core-primitives implementation was changed.

Two soft lock warnings intentionally preserve the quotation's terminal period. A separate xdoc
compatibility/policy scan passed package and Office compatibility checks but warned that fonts are
not embedded. Actual local regular/bold fonts were rendered; other hosts require compatible fonts.

Stress exposed overlapping tiny-value labels in both chart compositions despite zero machine
findings. Failed candidates were retained and their acceptance withdrawn. The repaired generator
keeps raw chart data, suppresses crowded labels and emits a native numeric register from the same
input. Both compositions were regenerated, read back and re-viewed in canonical and native PDF.
No changed values or artificial minimum bar heights hide the defect. Display formatting rounds
separately from raw data; precision and manual editing synchronization are disclosed in the intent
contract. Editing a chart does not update its independent register, legend, source or interpretation.

## Native host and unverified items

Microsoft PowerPoint for Mac **16.115** exported all nine golden pages, four mixed-language pages
and four stress chart/table pages. All **17 native PDF-derived PNGs** were viewed; text/charts/tables
remained complete. Native plot insets/ticks and font advance differ slightly from canonical.

The clean-open helper opened the staged golden but **skipped Repair-dialog inspection** because
System Events UI scripting was unavailable/timed out. A separate save/reopen and text-mutation
probe timed out without a saved result. Absence of Repair dialogs, save/reopen and interactive
text/table/chart-workbook editing remain **unverified**. PDF export and structural readback do not
substitute for these checks. Other hosts, animation, arbitrary refurbishment, merged cells and image
ingestion are not verified. No known machine or visual hard defect remains in the accepted scope.

## Reusable workflow improvements

- Added a fail-closed pre-render semantic/high-medium evidence guard with regression counterexamples;
  canonical binding and actual visual review remain mandatory.
- Preserved HTML inventory labels from `data-screen-label`/`aria-label`; exercised the updated
  helper on all eight source pages.
- Added dense numeric-label inspection, display precision and synchronization guidance.
- Scoped `-d` showcase metadata refresh to the selected kit, preventing unrelated readiness/version/
  recommendation churn; full synchronization remains available without a filter.

Full runtime evidence, failed iterations and per-page ledger are retained in the maintainer run
`deckkit-editorial-forest-20261113`. Temporary PNGs/reports are not bundled in the published skill.
