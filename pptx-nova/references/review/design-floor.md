# Design floor for Create, Edit and Refurbish

Use this for visible design work. The goal is a finished presentation with clear hierarchy, useful
evidence and intentional composition, within the user's scope. Technical validity is necessary;
it does not establish visual quality. A one-sentence request delegates design judgment to the Agent.

## Establish visual authority and scope

| Task      | Visual authority                                                         | What may change                                                                                     |
| --------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Create    | User brief/reference, then the selected kit's actual sample and contract | Author the whole deck within content, brand and asset constraints                                   |
| Edit      | The existing presentation and the exact requested change                 | Refine only authorized slides/objects; inherit surrounding type, palette, grid and tone             |
| Refurbish | Source content plus the chosen target's actual design                    | Recompose native content into the target system while preserving protected source facts and objects |

A local edit does not authorize replacing the visual world. A refurbishment needs a recognizable
whole design, not only a color wash, footer or border. Respect explicitly quiet, dense, monochrome,
historical or reference-led requests. Do not force every deck into the same corporate or dark style.

For a new deck, a meaningful visual edit or a refurbishment, obtain compact task context:

```bash
node <skill-root>/scripts/cli/design/context.mjs \
  --workflow create --brief '<user task>' --language zh --json
```

Use `--workflow edit --slides 2,4-5 --inspect source-inspect.json --intent typeset` for an authorized
local refinement; no new kit is selected. Use `--workflow refurbish --deckkit <explicit-target>`
for a named target. These options describe the existing task; they cannot expand its authorization.
The report is read-only advice. It does not perform authoring, certify preservation or authorize delivery.
A tiny factual text correction can inherit the incumbent directly without running another preparation tool.

Open the actual available reference images the report names, then the selected `intent.md` and
needed contract/slots. Missing images and unknown scenario matches are disclosed limitations.
The diverse shortlist supports judgment; its order is not a beauty score or a user-approved choice.
Read only the current workflow references, not all guides or every candidate's complete contract.

## Decide the visual job before placing objects

Identify the page's claim and the proof that deserves the largest useful region. Choose an expression
from the real content: comparison, change over time, relationship, product demonstration, operational
steps, or typographic statement. Equal boxes are appropriate only when the items have equal roles.

For Create, reuse `deck_lock.artDirection` for audience/mode, the content-led visual idea, inspected
anchor and intentional restraint. Keep narrative and registered layout plans in their existing files.
For Edit, name one concrete improvement and its protected surroundings in the existing Edit Contract.
For Refurbish, use the source/design map in [design-led refurbishment](../edit/refurbish-design-led.md).
The context report is an aid, not a second lock or an executable edit plan.

## Build a stronger default

- **Hierarchy:** make the first and second read unmistakable through size, weight, position and space.
  Put the proof on stage. A tiny paragraph and a generic symbol on an otherwise empty slide is unfinished.
- **Typography:** use stable display/body/data/source roles and readable real-size text. Projection
  often needs substantially larger body text than a dense reading deck. A technical minimum is not
  a target. Check actual CJK/Latin weight, punctuation, line breaks and paragraph spacing.
- **Composition:** use the established grid, optical alignment and purposeful grouping. Leave room
  around a substantial subject. Fix measure and grouping before shrinking text; change/split layouts
  only within scope and preserve all required facts. Respect registered kit capacities and constants.
- **Color:** give accents a clear role and maintain readable contrast. Preserve business/evidence
  meanings in charts and diagrams. A different accent for every peer creates noise unless it encodes data.
- **Specificity:** use actual data, native relationships, authentic supplied imagery or concrete input/output
  examples. Do not invent a product screenshot, metric, customer, source or decorative proof substitute.
- **Rhythm:** vary macro-composition and density when the content changes responsibility. A new slide-type
  name or palette does not prove variety. Deliberate repeated evidence pages may be appropriate.
- **Craft:** fit images without distortion, keep line/connector semantics, align heading companions optically,
  and preserve native charts/tables/formulas. Follow [object integrity](object-integrity.md) for the objects involved.

## Use refinement intent purposefully

The context tool accepts `--intent polish|bolder|quieter|distill|typeset` and returns focused actions.
These are instructions for judgment, not automatic patch transforms:

- `polish`: repair the weakest in-scope hierarchy, wrap, alignment or subject-scale defect.
- `bolder`: amplify the actual claim/proof and subordinate competitors; more saturation is not required.
- `quieter`: reduce redundant emphasis and ornament while retaining contrast and a focal point.
- `distill`: group and sequence evidence; remove/rewrite content only when the user permits it.
- `typeset`: improve roles, line breaks, measure, weight and optical alignment; preserve exact text by default.

Create uses registered content/layouts; Edit uses inspect-derived selectors and its contract; Refurbish
returns a complete source-bound authoring patch through its normal runner. Reuse those execution paths.
Do not silently switch kits, damage validated constants, stretch pictures or drop content to make a page fit.

## Look, criticize, repair

Inspect actual-size changed pages and the whole relevant overview. In local Edit, use unchanged neighbors
as identity references, not permission to modify them. For Refurbish compare both source content and target
showcase. For long/new systems, resolve a representative cover, evidence page and dense page before expansion.

Assess the rendered design before letting a green machine report anchor judgment. Ask the context report's
questions and name the weakest in-scope page. Record concrete findings: page/object, visible problem,
effect on the audience, exact proposed repair and what must stay intact. Avoid generic “looks premium”
or passing observations copied from examples. Then reconcile machine facts and batch the source fixes.

Reuse canonical renders and workflow review records. Changed candidate/manifest bytes invalidate old
reviews; do not swap hashes by hand. Create retains its bound `design_review.json` and finalization;
Edit retains scoped contract evidence; Refurbish retains fidelity, target-design and comparison reviews.
This guide adds design judgment without weakening any existing preservation or publication gate.
