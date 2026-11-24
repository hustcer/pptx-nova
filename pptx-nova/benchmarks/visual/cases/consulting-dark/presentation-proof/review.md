# Presentation proof compositions

Synthetic content exercises the optional `metrics` and `decision-led` layouts in Chinese and
English. It verifies fixed-canvas proof scale and action-led hierarchy while retaining all input
fields in native editable objects. This case does not add animation, raster illustrations or a
webpage layout.

Reviewed on 2026-11-15 with xdoc 0.26.0, frozen date 2026-11-15. All four actual PNGs were
inspected, including complex Chinese bold glyphs at enlarged original pixels. The initial
Arial Unicode MS request filled inner spaces in “需／复／量／清”; changing the kit's CJK
roles to Noto Sans SC restored distinct strokes without changing layout or content.

| Page | Observed result                                                                                             |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| 1    | Three numeric proofs dominate; 22pt Chinese labels and 18pt notes remain separate and readable.             |
| 2    | The 32pt requested action precedes three supporting decisions; complex CJK glyphs retain open inner spaces. |
| 3    | Two English proof columns preserve labels, units and change notes; no label/value collision.                |
| 4    | The English action statement and two requests remain clear, with source and closing text separated.         |

The full four-case benchmark covers 28 pages, including golden, maximum-density and mixed-language
inputs. All were actually inspected; the pressure fixture's five-audience title was corrected.
The final fresh benchmark PNGs match the reviewed images byte-for-byte. Golden and proof canonical
subject hashes and all 14 corresponding PNGs match; required-live delivery readiness passes with
zero high/medium/new-low findings and zero observed hard defects. Existing production readiness is
preserved, with no promotion. The empty low baseline was recorded only after this review.

This is evidence for the checked runtime and font environment. Fonts are not embedded. It does
not establish an independently installed Bold face, other-host font matching, PowerPoint pixel
parity, manual editing persistence or true back-row projection readability. Secondary metadata
retains smaller roles; these sparse layouts do not raise legacy dense-layout font sizes.
