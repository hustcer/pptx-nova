# Presentation expression: icons, animation and Morph

Read for **every new PPTX**, including a one-sentence prompt, Express, Studio and reference-based
creation. A brief prompt delegates these design decisions to the Agent. Do not wait for the user
to request icons or animation. Default to an authored, visually memorable presentation, as
expressive as its content and selected visual world can support. This guide is self-contained;
Impeccable is a design reference, not an additional installation or workflow dependency.

## Plan the experience, then author it

Alongside the static composition, decide three things: which ideas deserve symbols, what the
audience should notice in sequence, and which adjacent pages show the same subject changing.
Record these briefly in the existing `deck_lock.artDirection` and per-slide `layoutIntent`; put
material exceptions in `assumptions`. No new planning file, approval round or runtime schema is
required. The executable result is registered icon content plus `choreography.json`.

- Give each slide a gentle native transition by default, normally Fade. On meaningful continuous
  pairs, use Morph instead. Object animations are a separate layer: add them where grouping,
  contrast, explanation or a reveal improves the audience's reading order.
- In `persuade` and `experience`, actively design a content-led focal sequence: overview becoming
  detail, a mechanism assembling, a comparison resolving, or a decisive claim revealed. It should
  be worth remembering. Repeating the same fade on every object is not a focal sequence.
- In `read` and `operate`, keep navigation and evidence calm and immediate; use precise emphasis
  and continuity rather than a slower show. These modes still deserve confident composition.
- Preserve the user's facts, named DeckKit, brand and page-count constraints. Do not invent a
  metric, add a redundant slide, shrink evidence or change claims to obtain an effect. Improve
  through the kit's existing visual language rather than layering an unrelated style over it.

The default is active design, not an effect quota. Explicit static/no-animation requests, a
document-only brief, required reduced motion, or a known playback constraint can override the
motion default; record the concrete reason. Silence about animation, brevity and speed are not
opt-outs. Existing-deck edits keep their requested scope; this Create default does not authorize
adding effects during an unrelated edit or translation.

## Icons: make parallel ideas easier to recognize

For a text-only page with several peer sections (often two to five), prefer a small semantic icon
for each section when it improves scanning. Choose symbols for the actual concepts, not one
generic sparkle repeated throughout. Keep the heading readable without recognizing the symbol.

- Use one licensed family, such as the bundled Tabler assets, with coherent stroke, optical size,
  alignment and palette. Find exact available names through
  `node <skill-root>/scripts/cli/assets/icons.mjs --help`; use registered icon fields/assets, not
  emoji, Unicode arrows, words inside circles, or newly downloaded unlicensed SVGs.
- Compose icon + heading + supporting content as one perceptual unit. A row, open column or margin
  marker can work; do not turn every page into identical icon cards. Avoid adding icons to every
  bullet, footnote, chart label or table cell. Real diagrams, images and data remain the proof.
- Check the selected kit's slots before filling content. Prefer an eligible icon-capable layout
  when selection is open. If a pinned kit lacks an icon slot, respect its contract: use another
  registered visual treatment or the maintained DeckKit-extension route when icons are essential.
  Do not inject `add-image`/`add-group` through choreography or claim unsupported icons were added.

## Motion grammar: entrance, continuity, focus

| Audience need              | Preferred treatment                                                               | Boundary                                                           |
| -------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Move to a new topic        | Brief Fade between slides                                                         | Use a coherent baseline, not a random transition sampler           |
| Read peer sections         | Fade each semantic unit together; optionally short stagger                        | Icon, heading and body share one start; no orphan labels           |
| Explain a process          | Reveal successive stages in speaking order; restrained Wipe can express direction | Do not animate each word or connector independently                |
| Compare alternatives       | Reveal the contrast together or switch the emphasis once                          | Keep enough of the previous state visible to compare               |
| Go from overview to detail | Morph the same subject into a larger focus                                        | Keep its identity and spatial reference legible                    |
| Mark a turning point       | One deliberate reveal, transformation or stronger composition                     | Let surrounding pages be quieter so the peak has impact            |
| Show dense evidence        | Stable chart/table with a short transition; reveal a separate takeaway if useful  | Do not imply interpolated chart values or unsupported chart builds |

Use animation to pace ideas, not to require many clicks. For decorative/supporting entrances,
prefer an automatic `with-previous`/`after-previous` sequence that settles promptly. Use `on-click`
when the presenter needs to explain one stage before revealing the next. Avoid forcing clicks for
each small object; do not stack an entrance delay over a long page transition. Usually keep the
title/context stable and animate the meaningful subject. On a Morph destination, avoid giving
the same actor a competing entrance effect.

For a unit made of separate shapes, put its trigger/stagger on the first effect, then use
`with-previous` and `delay: 0` for its remaining icon/heading/body effects. A later unit's first
effect can add the next stagger interval. `with-previous` delays are relative to the preceding
effect's start, not absolute slide time: repeating a nonzero delay on every member accumulates
and breaks synchronization. Check the resolved schedule, not just identical input fields.

Starting points, **not Microsoft limits or fixed validator gates**: Fade transitions around
250–400 ms; semantic-unit entrances around 300–500 ms; sibling staggering around 60–100 ms with
the automatic entrance sequence usually settling within roughly one second. Morph often needs
600–900 ms depending on travel and scale. Adjust after playback. Long travel can be softened or
replaced with Fade; more duration does not make an arbitrary movement meaningful.

Keep slide advance manual by default (`advanceOnClick: true`, no automatic `advanceAfter`).
Sound, indefinite loops, bounce, repeated spins and letter-by-letter effects need a specific
communicative reason. Avoid routine exit animations that erase evidence while the speaker is
still discussing it; the next slide's transition normally handles departure.

## Morph: show a relationship, not merely a change of page

Actively look for overview → focus, the same object before → after, process stage → expanded stage,
or an image crop/pan that exposes relevant detail. Use Morph when the connection is clearer than
with Fade. Do not require a Morph in a deck with no genuine continuity or only one slide.

1. Identify compatible instances of the **same semantic subject** on adjacent pages. Keep scene
   context stable, deliberately move/scale the actor, and let captions update normally. Distinct
   concepts do not become one object merely because both are rectangles.
2. Reuse identity when composing pages; use exact, unique `!!Name` pairs for deliberate matching.
   `morphMode: "by-object"` is the normal starting point. Only the intended pair receives the name;
   do not mass-prefix all shapes. Put Morph on the **destination** page, not the source.
3. For standard Create, plan compatible states within the kit's registered layouts and name the
   emitted objects through choreography. Follow [Morph choreography](../content/morph-choreography.md)
   for pair checks and native authoring. Do not duplicate a slide merely to increase the effect count.
4. Keep charts, tables and complex evidence stable unless the exact supported transformation is
   proven. PowerPoint charts crossfade rather than morphing data values; a Morph setting is not
   evidence of numeric interpolation. Use a separate callout or honest before/after comparison.

For reduced motion or an environment that cannot play the intended sequence, use a brief Fade or
static alternative that preserves the same meaning. PPTX has no browser-style automatic
`prefers-reduced-motion` contract here; do not claim one. Establish an alternative when the brief
requires it, and describe any actual playback limitation rather than pretending Morph was tested.

## Execute through standard Create

Read [animations](../content/animations.md#standard-create-choreography) for the exact native
contract. Probe the current runtime's animation/transition schema; visual ambition does not expand
its authoring support. A capability's partial render/verify status is not proof of Office playback.

1. Fill the chosen kit's semantic icon slots during content authoring. Build the layout patch once
   to resolve actual object names, using the standard `cli/create/build.mjs --deckkit <id>
   <run-dir>/content.json --output <run-dir>/motion-layout.patch.json` (and the same `--assets` when
   used). This is a cheap layout build, not an additional full-deck render.
2. Write `choreography.json` against those names. Include the baseline slide transitions, selected
   semantic builds and applicable Morph pairs. One `set-slide-animations` replacement list per
   slide contains that slide's complete sequence. After a `!!` rename, subsequent selectors use
   the new name. Do not guess selectors or put new geometry/assets in this file.
3. Pass `--choreography <run-dir>/choreography.json` to `cli/create/run.mjs`, then repeat it with
   the original inputs during `--finalize`. The runner composes before check-lock and binds the
   choreography, original kit patch and composed patch. It does not invent effects when the
   caller omits that option. Keep the existing single canonical full-deck render and review.

A simple Fade transition needs no object selector, so it can be authored directly when there are
no object builds or Morph pairs. Omit choreography only for a recorded static/unsupported case,
not because the initial prompt did not mention motion. Do not use the `animation-corpus` profile
for an ordinary deck; its sample declarations and layout exemptions serve feature-test corpora.

## Verify what the audience will see

- Inspect the applied candidate: every intended transition, animation target, trigger, duration
  and order must exist. Compare against the plan; all-static output without an exception is a
  missed Create default. Run `morph-check` on every authored adjacent Morph pair.
- Review the canonical PNGs as a complete, readable static deck. Check icon meaning/consistency,
  semantic grouping and rhythm; motion cannot repair a weak final composition or hide key facts.
  Include these observations in the existing slide-specific design review, not a new scorecard.
- Check the actual sequence in the available target playback environment, including initial state,
  builds, settled state and next-page navigation. Keep the animation/Morph reference's applicable
  structure, compatibility and clean-open checks. PNGs prove layout, not animation smoothness.
  If native playback is unavailable, report authoring/inspect/pair evidence separately from
  unverified playback. Do not claim cross-platform or accessible playback from static renders.

## Sources and adaptation

This combines Impeccable's content-led focal moment, continuity, coherent icon craft and
amplification within the existing visual world with presentation-specific guidance. Its web
libraries, hover behavior and browser capture tooling are not transplanted into PPTX. Timing ranges
and the proactive Create default above are this skill's design judgments, not official mandates.

- [Microsoft: Use Morph](https://support.microsoft.com/en-us/powerpoint/training/use-the-morph-transition-in-powerpoint)
  and [Morph tips and tricks](https://support.microsoft.com/en-us/powerpoint/morph-transition-tips-and-tricks)
  explain adjacent-slide continuity, explicit matching and object limitations.
- [University of York: Animation, sound and video](https://subjectguides.york.ac.uk/presentations/effects)
  connects transitions/builds to attention and pacing, with restrained effect families and online
  playback considerations.
- [Canada: Accessible PowerPoint presentations](https://a11y.canada.ca/en/accessible-powerpoint-presentations-in-microsoft-365/index.html)
  supports brief, simple effects and reduced movement for accessibility-sensitive delivery.
