# PPTX workflow diagrams

These diagrams use the original workflow images' white background, pale colored
borders, and system sans-serif typography. The repository README uses a compact
1280 × 432 overview with a prominent check–refine feedback loop and a separate
delivery exit. It has four nodes. The two detailed diagrams
use line icons and a 1280 × 720 canvas with eight nodes each; they appear in the
[full workflow guide](../workflows.md). The HTML files contain editable inline SVG.
Neither format loads external fonts, scripts, raster images, or other remote assets.

| Workflow | Editable source                     | SVG image                                   |
| -------- | ----------------------------------- | ------------------------------------------- |
| Overview | [HTML](pptx-workflow-overview.html) | [SVG](../images/pptx-workflow-overview.svg) |
| Create   | [HTML](pptx-creating-workflow.html) | [SVG](../images/pptx-creating-workflow.svg) |
| Edit     | [HTML](pptx-editing-workflow.html)  | [SVG](../images/pptx-editing-workflow.svg)  |

GitHub supports SVG images in Markdown. See its
[image-format documentation](https://docs.github.com/en/repositories/working-with-files/using-files/working-with-non-code-files).
The SVGs redraw the original WebP reference images with the workflow corrections below.

## Workflow accuracy

Checked against the skill workflows, their runner implementations, and the xdoc
implementation. The local runtime reported `0.17.0 (96708959)`; capabilities must
still be probed for each run. These diagrams show the normal paths, not every
task-specific branch or optional evidence integration.

- **Overview:** combine creation and editing in one authoring stage and make
  check–refine iteration the focal path. Review findings return to authoring for
  fixes and rechecks; passing candidates leave through the delivery exit. The
  loop represents Agent-directed refinement using machine and visual evidence,
  not an unlimited automatic runtime retry or a guarantee that every issue can
  be repaired. Patch details, individual gates, and sidecars remain in the
  detailed diagrams.
- **Create:** retain the outline and design lock, validate the content, build the
  DeckKit patch, and check the lock before dry-run/apply. The runner checks the
  candidate and renders canonical visual evidence. Machine checks alone do not
  publish it: PNG review and bound review evidence are required before finalize.
  Older runtimes have a diagnostic preview fallback and need the documented
  human-confirmation route; that branch is omitted from the overview.
- **Edit:** combine inspect/select in one stage and bind the Edit Contract before
  writing the patch. Dry-run checks resolved targets and semantic regressions;
  successful apply writes a separate candidate. Verify semantic differences,
  scope and required preservation evidence before delivery. Scoped `vision-diff`
  and `style-diff` are shown together for compactness; the contract determines
  which evidence is required. Visible edits require PNG review. Failed dry-run
  or evidence gates return to patch revision, not publication.
- **Shared:** replay sidecars accompany successful writes by default, rather than
  dry-runs. Reports and review evidence remain in the run directory. Clean-open
  is conditional on availability and task risk; it is not claimed as automatic
  verification for every run.

Maintained workflow references:

- [DeckKit production path](../../pptx-nova/references/create/deckkit-mode.md)
- [Create runner](../../pptx-nova/scripts/cli/create/run.mjs)
- [Create delivery binding and visual evidence](../../pptx-nova/scripts/lib/create/create-delivery.mjs)
- [Edit workflow](../../pptx-nova/references/edit/edit-mode.md)
- [Edit Contract](../../pptx-nova/references/edit/edit-contract.md)
- [Runtime discovery and delivery gates](../../pptx-nova/SKILL.md)

## Updating the figures

Edit the HTML sources first, then run the installed `diagram-design` skill's
`scripts/self_check.py --offline` and `scripts/export_svg.py` helpers. Pass
`--system-fonts` to the exporter and write each export to its corresponding
`docs/images/*.svg` file. Inspect both the HTML and an SVG embedded as an image
in a browser before updating the README. Keep titles, descriptions, local IDs,
and arrow references intact for accessible, self-contained output.
