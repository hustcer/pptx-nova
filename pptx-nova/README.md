# pptx-nova User Guide

`pptx-nova` helps you create, edit, refurbish, translate, and check PowerPoint presentations. Describe
what you need in everyday language, and it will aim to deliver a real editable `.pptx` file instead of
a deck made of screenshots.

This guide is for regular users. You do not need to understand command lines, config files, or the
internal workflow.

## Why It Is More Than Another PPT Generator

`pptx-nova` is powered by `xdoc`, an in-house PPTX engine. `xdoc` was designed from the ground up for
Agent workflows: it lets an Agent inspect the real PPTX structure, dry-run structured patches, apply
changes, generate previews, export decks as high-fidelity PDF files, compare before and after
versions, and retain auditable evidence.

That makes it closer to a checkable, replayable PPTX build and editing pipeline than a workflow that
renders content into images and inserts those images into slides. Within supported objects and
workflows, output is meant to remain editable in PowerPoint as text, shapes, tables, charts, and slide
elements.

## High-Fidelity PDF Export

In addition to creating and editing PowerPoint files, `pptx-nova` can convert an existing or newly
generated PPTX deck to a high-fidelity PDF. This is useful for sharing, printing, archiving, formal
delivery, or reviewing a presentation on a device that does not have PowerPoint.

`xdoc` renders the deck's static slide appearance into PDF. PDF does not retain animations,
transitions, video playback, or other interactive behavior, and decks that depend on unavailable
fonts or unusual PPTX features may still need a visual review after export.

## Reliable Rules Across Follow-Up Edits

Most presentation tools treat instructions such as “use this title color on all slides added later”
as temporary chat context. `pptx-nova` can preserve an explicit future or carryover instruction for
the current deck and apply it during later edits.

This is designed to be checkable rather than memory-based:

- The original instruction, applicable event, and current deck revision are recorded explicitly.
- Conflicting rules, stale deck revisions, and explicit one-time overrides are handled before an
  edit is delivered.
- For supported rules, the final PPTX is inspected to verify that the required style actually reached
  the produced slide or element.
- A rule that does not apply to the current operation adds no extra edit target or delivery evidence.

The current version deliberately stays narrow. It supports explicit current-deck carryover rules that
can be verified deterministically, such as preserving edit invariants or applying a specified title
font color or summary-box fill color to newly created elements. It does not infer long-term preferences
from vague feedback, create a cross-project user profile, or let a session rule bypass template and
quality checks.

For example, you can say:

```text
For this deck, keep using the same blue title color on every slide added later.
```

## What You Can Ask It To Do

You can use `pptx-nova` to:

- Generate a new PPT from a short prompt or a longer brief.
- Turn an outline, Markdown/text material, web page, or PDF-extracted content into a PPT.
- Use the visual style of an existing PPT as a reference while creating a new deck with different content.
- Fill new content into a company template.
- Refurbish an old PPT so it is more consistent and professional while preserving the original content.
- Edit an existing PPT, such as changing titles, replacing data, adjusting layouts, swapping images, or changing colors.
- Turn CSV, JSON, or table data into table slides or chart slides.
- Translate an existing PPT while aiming to preserve layout, charts, speaker notes, animations, and transitions.
- Add, modify, or remove basic animations and transitions, such as fade-in, step-by-step bullet reveal, or automatic slide advance.
- Perform brand conversion or brand checks, such as aligning brand colors, fonts, logos, headers, and footers.
- Compare a source PPT with a modified PPT to help review change scope and visual differences.
- Use a scoped edit contract for ordinary existing-deck edits so the Agent can
  prove that requested targets were covered and unrelated objects were not
  reliably changed before delivery.
- Preserve explicit current-deck future or carryover rules, such as keeping the same title color
  on subsequently added slides, and verify applicable rules during later edits.
- Convert existing or generated PPTX decks to high-fidelity PDF for sharing, printing, archiving,
  formal delivery, or review without PowerPoint.
- Export image previews, Markdown, JSON, or text for review or downstream processing.
- Handle technical slides with formulas: simple formulas may stay as plain text, while complex formulas may be inserted as formula assets.
- Check for text overlap, clipped content, uneven layouts, and similar presentation issues.
- Provide workflow feedback for a `pptx-nova` run when you explicitly ask for it.

Web pages, HTML, and PDFs can be used as source material. `pptx-nova` first extracts them into
Markdown or text, then uses that material in the PPT generation workflow. It does not automatically
copy a web page or PDF's original layout, images, and styles into PowerPoint one-to-one.

## Simplest Usage

You can say:

```text
Use pptx-nova to create an 8-slide English pitch deck about an AI quality inspection platform
for manufacturing CIOs. Make it professional and clean. Output ai-roadshow.pptx.
```

You can also say:

```text
Refurbish qbr.pptx. Keep the content unchanged, but make the visual style feel more like a
consulting report. Output qbr-new.pptx.
```

Or:

```text
Edit qbr.pptx and replace the KPI data on slide 3 with the data from data.csv. Do not overwrite
the original file.
```

## What Information Helps

You do not need to provide everything perfectly up front, but results are usually better when you
include:

- **Purpose**: Is this a pitch deck, internal report, sales deck, training material, or client proposal?
- **Audience**: Is it for executives, customers, investors, colleagues, students, or a public talk?
- **Slide count**: Approximate number of slides, or whether the count is fixed.
- **Language**: English, Chinese, another target language, or mixed languages.
- **Content**: Outline, Markdown/text material, CSV/JSON table data, pasted tables, an old PPT, web links, PDFs, images, or logos.
- **Style**: Formal, minimal, consulting-style, technology-oriented, brand-compliant, course-oriented, and so on.
- **Constraints**: Which content must not change, which slides must be preserved, and whether restructuring is allowed.
- **Output**: Final filename, and whether you need a high-fidelity PDF export or image previews.

You can start with one sentence. If information is missing, the assistant will either proceed based on
the task or ask for confirmation at critical points.

## Common Request Patterns

### 1. Quickly Generate A New PPT

```text
Use pptx-nova to quickly create a 6-slide English product introduction deck about an enterprise
knowledge-base assistant. The audience is the sales team. Use a clean business style and output
product-intro.pptx.
```

Best for: you have a topic, but not a complete outline.

### 2. Generate From An Outline

```text
Generate a 10-slide English PPT from the outline below. Use a formal style for a quarterly
business review.
1. Cover
2. Quarterly performance overview
3. Revenue changes
4. User growth
5. Key project progress
6. Risks and issues
7. Next-quarter goals
8. Resource needs
9. Action plan
10. Q&A
```

Best for: you already know what each slide should cover.

### 3. Use An Existing PPT As A Style Reference

```text
Use reference.pptx as the visual style reference and generate a new PPT from new-outline.md.
Do not reuse old copy from reference.pptx; only use its style and slide rhythm as a reference.
```

Best for: you like the style of one deck but need a new deck with different content.

### 4. Refurbish An Old PPT

```text
Refurbish old-report.pptx. Keep the slide count and content unchanged, but make the deck more
professional and consistent. Output old-report-refined.pptx and give me image previews.
```

Best for: the old PPT's content is usable, but the visuals are outdated, inconsistent, or not formal enough.

### 5. Edit An Existing PPT

```text
Edit sales.pptx:
Change the title on slide 2 to "2026 Sales Targets";
Replace the data on slide 5 with the data from new-chart-data.csv;
Output sales-updated.pptx.
```

Best for: you only want to change part of an existing PPT.

For ordinary localized edits, `pptx-nova` does more than check whether the
PowerPoint command succeeded. It records the allowed edit scope before writing,
then checks target coverage, unexpected reliable changes, formatting
preservation when required, and new visual regressions before publishing the
candidate. If the evidence does not match the current source or candidate, the
edit is blocked and must be inspected or regenerated instead of being silently
delivered. Complex or unsupported PPTX objects and final visual judgment can
still require specialized checks or human review.

### 6. Use A Company Template

```text
Use the template and brand style from company-template.pptx, and turn outline.md into a new PPT.
Try to preserve the template layouts and placeholders.
```

Best for: your company has a fixed template and the deck should not freely change style.

### 7. Only Check Or Export

```text
Check final.pptx for text overlap, clipping, or layout issues. Do not modify the file.
```

```text
Convert final.pptx to a high-fidelity PDF named final.pdf, and also export per-slide PNG previews.
```

Best for: you already have a PPT and need a shareable, printable, or archival PDF, quality checks,
or visual preview images. The PDF preserves the static rendered appearance; animations, transitions,
video playback, and other interactive behavior remain PPTX-only.

### 8. Translate An Existing PPT

```text
Translate product-deck.pptx into English. Try to preserve the original layout, chart styling,
speaker notes, and animations. Output product-deck-en.pptx and give me a source-vs-translation
preview.
```

Best for: you need to translate an existing PPT into another language while keeping the visual
structure largely unchanged.

### 9. Modify Animations Or Transitions

```text
Edit launch.pptx: on slide 4, make the bullets appear one by one on click; on slide 6, change the
transition to fade. Do not change other animations. Output launch-animated.pptx.
```

Best for: you only need basic entrance, exit, step-by-step reveal, or slide transition changes.
Advanced effects such as complex motion paths, video timing, or object-triggered actions may need
confirmation before they can be edited safely.

### 10. Brand Check Or Brand Conversion

```text
Check whether proposal.pptx follows the brand colors, fonts, and logo usage rules in
brand-profile.json. Do not modify the file.
```

```text
Convert proposal.pptx to the brand style from company-template.pptx. Keep the content unchanged
and output proposal-branded.pptx.
```

Best for: you need to align brand visuals, or confirm before delivery that a PPT does not deviate
from brand rules.

### 11. Compare, Extract, Or Give Feedback

```text
Compare old.pptx and new.pptx. Tell me the main changes and which slides need human review.
Do not modify any files.
```

```text
Export final.pptx as Markdown and JSON so I can review the content.
```

```text
Check this pptx-nova generation workflow for usage feedback and write it to a feedback file.
```

Best for: you already have a PPT and only want read-only review, content extraction, or a record of
tool/workflow issues from a run.

## What You Usually Receive

Usually, delivery includes:

- A final `.pptx` file.
- PDF, image previews, Markdown, JSON, or text export if you ask for them.
- A short summary of what changed, what was generated, and anything you should know.
- For complex tasks, an auditable work record such as `outline.json`, `deck_lock.json`,
  `content.json`, `patch.json`, check reports, preview images, and a contact sheet to make later
  edits or troubleshooting easier.
- If you explicitly say that subsequently added slides or elements should continue following a
  rule, the run may also retain a current-deck `session-rules.json`. It records the original rule
  wording, applicable events, conflicts, and deck revision, then verifies applicable rules through
  the Edit Contract during later edits. It does not automatically become a cross-project long-term
  preference.
- For formal delivery, refurbishment, translation, template following, chart/table, or animation
  tasks, more detailed validation evidence may also be included, such as `visual_review.json`,
  `pptx-diff.json`, `structure-check.json`, `semantic-audit.json`, `clean-open.json`,
  `translation-compare.png`, `translation-compare.json`, `refurbish-compare.png`, or
  `refurbish-compare.json`. These files appear only when relevant; they are not fabricated to fill
  a checklist.
- For translation or refurbishment tasks, the formal delivery directory usually also contains a
  complete source-vs-deliverable comparison set. Decks up to 20 slides use one image; larger decks
  use numbered images plus a coverage manifest so every slide remains reviewable at high DPI.

Your original PPT is not overwritten by default. Unless you explicitly ask to overwrite the original
file, output is written to a new file.

## Especially Helpful Materials

If you have any of these materials, provide them together:

- Company logo, brand colors, and font requirements.
- Previous PPTs you like.
- A company standard template.
- Product screenshots, architecture diagrams, portraits, customer case images.
- Table data, chart data, and metric definitions.
- Markdown/text outlines, reference copy, official websites, white papers, PDFs, meeting notes.
- Translation glossaries, brand guidelines, brand profiles, color requirements, and font requirements.

If logos, screenshots, or official assets are missing, the assistant will not pretend to create
"official assets." It will use text, simple shapes, or placeholders instead, and tell you in the result.

## What To Know When Refurbishing A PPT

"Refurbish" usually means: keep the content unchanged, improve the visuals.

By default, it will try to preserve:

- Original slide count.
- Original text and main points.
- Visible content such as tables, charts, images, and speaker notes.
- Logical order between slides.

If the old PPT is too dense and content does not fit, the workflow usually first tries to preserve
native objects and adjust the layout. If pages truly need to be split, merged, rearranged, or shortened,
you must confirm that first. By default, it will not insert full-slide screenshots from the source into
the new PPT as a fake editable refurbishment. Even after machine checks pass, refurbishment tasks
usually still require final visual review of the contact sheet, per-slide images, and the sibling
`*-refurbish-compare-<MMDDhhmmss>.png` file or complete numbered
`*-refurbish-compare-<MMDDhhmmss>-01.png`, `-02.png`, ... set.

## When Confirmation Is Useful

These cases are usually better handled by confirming the outline or direction before generating the
complete PPT:

- Investor pitch decks, board materials, and formal client proposals.
- Strict company brand requirements.
- Many slides, or a large amount of source material.
- You require strict template following.
- You require preservation of translation terminology, legal wording, brand tone, or specific phrasing.
- You do not want the assistant to add facts or rewrite points on its own.
- The old PPT is complex and refurbishment may affect original content.
- You need to edit complex animations, video playback order, SmartArt, macros, or other advanced PowerPoint objects.

If you are in a hurry, you can also say "produce a quick first version." The assistant will minimize
back-and-forth where possible.

## Requests To Avoid

To keep the PPT editable, these requests are not recommended:

- "Just put screenshots of each slide into a PPT."
- "Delete old content freely as long as it looks premium."
- "Use all images from the reference PPT," without authorization or source information.
- "Overwrite the original file," without a clear backup or output path.
- "Follow the template strictly," while also requiring a completely different slide structure.

## One-Sentence Template

You can copy this format when making a request:

```text
Use pptx-nova to create a [slide count] [language] PPT about [topic].
The audience is [audience], and the purpose is [purpose].
The desired style is [style].
The content comes from [outline / Markdown or text material / old PPT / CSV or JSON data / web or PDF-extracted content].
The output filename is [filename.pptx].
```

Example:

```text
Use pptx-nova to create a 12-slide English PPT about the 2026 product roadmap.
The audience is company leadership, and the purpose is a quarterly strategy meeting.
The desired style is formal, clean, and consulting-oriented.
The content comes from roadmap.md and metrics.csv.
The output filename is product-roadmap-2026.pptx.
```

## Maintainer Notes

This section is for developers who maintain and publish the `pptx-nova` skill. Regular users do not
need to read it.

### Standalone Runtime Contract

After publication, `pptx-nova` should run as a standalone skill and must not depend on root-directory
files from the current development monorepo.

- Scripts should derive `<skill-root>` from their own location. Do not depend on repository-root
  development tools, local environment files, or Agent-private context files.
- Project inputs should be passed through explicit parameters, such as `--root`, `--asset-root`,
  `--xdoc-bin`, PPTX paths, or documented environment variables.
- The deck generation path uses bundled assets. Do not dynamically read icons, templates, or private
  assets from the network or from a local checkout.
- `xdoc` is the primary external CLI dependency. Without `xdoc`, content validation, DeckKit selection,
  icon lookup, and patch build should still run; real apply, convert, and vision-check workflows will
  fail or be skipped by the caller.

### Pre-Publication Checks

From the public repository root, prefer running the aggregate check:

```bash
nu tools/ci-check.nu
```

It runs the required public-release smoke test, public audit, example content validation, and delivery
DeckKit readiness checks. If you only need individual checks, run:

```bash
node tools/pptx-nova-smoke-test.mjs
node tools/pptx-nova-audit-public.mjs --strict
```

`tools/pptx-nova-smoke-test.mjs` uses only bundled files inside `pptx-nova/`. It covers content
validation, DeckKit patch build, icon pack query, DeckKit selection, current-deck session-rules
normalization and resolution, Edit Contract source binding, and candidate/evidence hash binding.

`tools/pptx-nova-audit-public.mjs` checks for:

- Absolute paths from the maintainer's machine and private repository paths.
- Leakage of private context from the current monorepo.
- Unexpected binary files.
- Whether the Tabler icon pack license is included with the package.
- Whether examples declare the synthetic / redistributable policy.

`tools/ci-check.nu` also validates `pptx-nova/assets/examples/*/content.json` and runs
`pptx-nova-deckkit-readiness.mjs --target delivery --benchmark-mode catalog` for production/default
DeckKits.

### Tabler Icon Pack

Runtime icon lookup uses the bundled `assets/icons/tabler-icons.pack.br`. When refreshing the icon
pack inside `pptx-nova/`, explicitly provide a Tabler checkout:

```bash
node scripts/pptx-nova-icons.mjs generate --source-root <tabler-icons-checkout>
node scripts/pptx-nova-icons.mjs generate --source-root <tabler-icons-checkout> --check
```

You can also set:

```bash
TABLER_ICONS_ROOT=<tabler-icons-checkout>
```

Do not save absolute paths to the maintainer's Tabler checkout in source code, manifests, or
documentation.
