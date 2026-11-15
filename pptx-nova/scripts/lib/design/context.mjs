import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { CATALOG_PATH, selectDeckKit } from '../deckkits/selection.mjs'
import { buildLayoutSnapshot } from '../review/layout-snapshot.mjs'
import { SKILL_ROOT } from '../runtime/skill-paths.mjs'

export const DESIGN_WORKFLOWS = ['create', 'edit', 'refurbish']
export const DESIGN_INTENTS = ['polish', 'bolder', 'quieter', 'distill', 'typeset']

const WORKFLOW_REFERENCES = {
  create: ['references/create/create-runner.md', 'references/create/design-quality.md'],
  edit: ['references/edit/edit-contract.md', 'references/edit/micro-edit-cheatsheet.md'],
  refurbish: ['references/edit/refurbish-runner.md', 'references/edit/refurbish-design-led.md'],
}
const INTENT_ACTIONS = {
  polish: [
    'Resolve the weakest hierarchy, alignment, wrap or subject-scale problem in scope before adding decoration.',
    'Review actual-size pages and the overview; preserve the established visual identity.',
  ],
  bolder: [
    'Make the existing main claim or proof object dominant through scale, placement and contrast; subordinate competing explanations.',
    'Choose one content-led visual moment. Preserve real chart scales, source values and business color meanings.',
  ],
  quieter: [
    'Remove redundant emphasis, competing surfaces and decorative containers; keep meaningful grouping and a visible focal point.',
    'Reduce visual noise before reducing contrast or shrinking type. Preserve evidence and source-picture appearance.',
  ],
  distill: [
    'Expose the main claim, group related evidence and remove only authorized repetition; retain all required facts and sources.',
    'If exact wording is protected, reorganize native objects or propose a separate content revision instead of deleting text.',
  ],
  typeset: [
    'Use consistent display/body/data/source roles, intentional line breaks and optical alignment; check CJK/Latin weight and real-size readability.',
    'Improve measure, spacing and grouping before font reduction. Preserve exact text, data and semantic emphasis.',
  ],
}

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const unique = (values) => [...new Set(values)]

function fileReference(path) {
  if (!existsSync(path) || !statSync(path).isFile()) return { path, status: 'missing' }
  const bytes = readFileSync(path)
  return { path, status: 'available', byteLength: bytes.length, sha256: hash(bytes) }
}

function capsule(entry, catalogEntries, catalogPath) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) throw new Error('Invalid DeckKit id')
  const raw = catalogEntries.find((item) => item.id === entry.id)
  const kitDirectory = raw.path
    ? dirname(resolve(dirname(catalogPath), raw.path))
    : resolve(dirname(catalogPath), raw.id)
  return {
    id: entry.id,
    version: entry.version,
    eligible: entry.eligible,
    readiness: entry.readiness,
    scenarioMatched: entry.scenarioMatched,
    coverage: entry.coverage,
    visualGrammar: entry.visualGrammar,
    reference:
      realpathSync(catalogPath) === realpathSync(CATALOG_PATH)
        ? {
            ...fileReference(
              join(SKILL_ROOT, 'assets/examples/deckkits', entry.id, 'contact-sheet.webp'),
            ),
            catalogIdentityVerified: true,
            freshness: 'not-verified-against-current-runtime',
          }
        : {
            path: null,
            status: 'missing',
            catalogIdentityVerified: false,
            reason: 'A custom catalog does not establish identity with bundled visual samples',
          },
    intent: fileReference(join(kitDirectory, 'intent.md')),
    contract: raw.designContract
      ? fileReference(resolve(dirname(catalogPath), raw.designContract))
      : null,
    knownLimits: raw.knownLimits ?? [],
    preservationEvidenceRequired: true,
  }
}

function vocabulary(entry) {
  const grammar = entry.visualGrammar
  return new Set(
    [
      ...(grammar?.mood ?? []),
      ...String(grammar?.typography?.display ?? '')
        .toLowerCase()
        .split(/[^a-z]+/),
    ].filter((word) => word.length > 2),
  )
}

function distance(left, right) {
  const a = vocabulary(left)
  const b = vocabulary(right)
  const union = new Set([...a, ...b])
  return union.size ? 1 - [...a].filter((word) => b.has(word)).length / union.size : 0
}

function shortlist(selection, pinned) {
  if (pinned) {
    const entry = [...selection.ranked, ...selection.rejected].find((item) => item.id === pinned)
    if (!entry) throw new Error(`Unknown DeckKit '${pinned}'; no substitute was selected`)
    if (!entry.eligible)
      throw new Error(`DeckKit '${pinned}' is ineligible: ${entry.blockers.join('; ')}`)
    return [entry]
  }
  if (!selection.selected)
    throw new Error('No eligible DeckKit; inspect rejected coverage and capacity')
  const chosen = [selection.selected]
  const pool = selection.ranked
    .slice(1)
    .filter((entry) => !selection.selected.scenarioMatched || entry.scenarioMatched)
  while (chosen.length < 3 && pool.length) {
    // Diversity orders an already feasible, scenario-matched shortlist. It is not a beauty score.
    pool.sort(
      (a, b) =>
        Math.min(...chosen.map((entry) => distance(b, entry))) -
          Math.min(...chosen.map((entry) => distance(a, entry))) ||
        b.score - a.score ||
        a.id.localeCompare(b.id),
    )
    chosen.push(pool.shift())
  }
  return chosen
}

function sourceFacts(inspect, slides) {
  if (!inspect) return null
  if (!Array.isArray(inspect.slides)) throw new Error('Inspect must disclose slides[]')
  const snapshot = buildLayoutSnapshot(inspect)
  const available = new Set(snapshot.slides.map((slide) => slide.index + 1))
  if (slides.some((slide) => !available.has(slide)))
    throw new Error('Requested slide is absent from inspect')
  return {
    evidenceKind: 'static-inspect',
    inspectValueSha256: hash(JSON.stringify(inspect)),
    renderedJudgment: false,
    input: typeof inspect.input === 'string' ? inspect.input : null,
    // Existing layout normalization supplies facts; quoted text never selects operations or scope.
    slides: snapshot.slides
      .filter((slide) => !slides.length || slides.includes(slide.index + 1))
      .map((slide) => ({
        slide: slide.index + 1,
        objects: slide.objects.map((object) => ({
          id: object.id,
          type: object.type,
          bbox: object.bbox,
          font: object.font,
          untrustedTextPreview: object.textPreview.slice(0, 140),
        })),
        protectedProofObjects: slide.objects
          .filter((object) => ['chart', 'table', 'image'].includes(object.type))
          .map((object) => ({ id: object.id, type: object.type })),
        riskCodes: unique(
          [...slide.risks, ...slide.objects.flatMap((object) => object.risks ?? [])].map(
            (risk) => risk.code,
          ),
        ),
      })),
  }
}

export function prepareDesignContext(options = {}) {
  const { workflow, intent = 'polish', deckkit = '', slides = [], inspect = null } = options
  if (!DESIGN_WORKFLOWS.includes(workflow))
    throw new Error('workflow must be create|edit|refurbish')
  if (!DESIGN_INTENTS.includes(intent)) throw new Error('Unknown design intent')
  if (!Array.isArray(slides) || slides.some((slide) => !Number.isInteger(slide) || slide < 1))
    throw new Error('slides must contain one-based positive integers')
  const scopedSlides = unique(slides).sort((a, b) => a - b)
  const incumbent = workflow === 'edit'
  if (incumbent && deckkit)
    throw new Error(
      'Local Edit inherits its incumbent; use authorized refurbishment to replace the visual system',
    )
  const catalogPath = resolve(options.catalog ?? CATALOG_PATH)
  const pinnedRefurbish = workflow === 'refurbish' && Boolean(deckkit)
  const selection =
    incumbent || pinnedRefurbish ? null : selectDeckKit({ ...options, catalog: catalogPath })
  const catalog = incumbent ? null : JSON.parse(readFileSync(catalogPath, 'utf8'))
  const targetEntry = pinnedRefurbish ? catalog.entries.find((entry) => entry.id === deckkit) : null
  if (pinnedRefurbish && !targetEntry)
    throw new Error(`Unknown DeckKit '${deckkit}'; no substitute was selected`)
  const candidates = pinnedRefurbish
    ? [capsule({ ...targetEntry, eligible: null }, catalog.entries, catalogPath)]
    : selection
      ? shortlist(selection, deckkit).map((entry) => capsule(entry, catalog.entries, catalogPath))
      : []
  const warnings = [...(selection?.warnings ?? [])]
  if (pinnedRefurbish)
    warnings.push(
      'Target design is explicit; preservation and refurbishment eligibility remain owned by the normal Refurbish plan and gates, not generator selection',
    )
  for (const candidate of candidates) {
    if (candidate.reference.status !== 'available')
      warnings.push(
        `${candidate.id}: rendered sample is unavailable; no visual inspection is established`,
      )
    if (candidate.intent.status !== 'available')
      warnings.push(`${candidate.id}: intent guidance is unavailable`)
  }
  if (workflow !== 'create' && !inspect)
    warnings.push(
      'No source inspect supplied; object preservation and source style remain unverified',
    )
  if (incumbent && !scopedSlides.length)
    warnings.push(
      'No explicit slide scope; resolve the user task and Edit Contract before authoring',
    )
  return {
    schemaVersion: 'pptx-nova-design-context/v1',
    workflow,
    intent,
    decisionAuthority: 'advisory',
    deliveryAuthorized: false,
    visualReviewCompleted: false,
    query: selection?.query ?? { language: options.language || null, scenarioSource: 'incumbent' },
    visualAuthority: {
      kind: incumbent ? 'incumbent' : deckkit ? 'explicit-deckkit' : 'undecided',
      deckkit: deckkit || null,
      rule: incumbent
        ? 'Inherit existing fonts, palette, grid and hierarchy outside the exact user-authorized change.'
        : 'Honor the explicit user visual brief; compare actual samples before committing to a visual system.',
    },
    scope: {
      kind: scopedSlides.length ? 'selected-slides' : incumbent ? 'unresolved' : 'whole-deck',
      slides: scopedSlides,
    },
    preservation: {
      rewriteContent: false,
      replaceVisualSystem: workflow === 'refurbish',
      retainNativeProofObjects: workflow !== 'create',
      rule: 'Protect exact facts, values, sources, chart semantics, native proof objects and source-picture appearance within the task contract.',
    },
    candidates,
    source: sourceFacts(inspect, scopedSlides),
    directionToResolve: incumbent
      ? [
          'existing hierarchy and typography roles',
          'authorized scope',
          'one concrete visual improvement',
        ]
      : [
          'audience and mode',
          'content-led visual idea',
          'actual inspected anchor',
          'intentional restraint',
          'proof placement and whole-deck rhythm',
        ],
    actions: INTENT_ACTIONS[intent],
    review: {
      questions: [
        'What leads the eye in three seconds, and does the content deserve that emphasis?',
        'Is the actual proof legible at presentation size, including CJK/Latin line breaks?',
        'Does the overview vary composition and density while staying in one visual system?',
        'Which in-scope page is weakest, and what exact change will improve it?',
      ],
      order:
        'Inspect actual rendered pages and the overview, record findings, then reconcile machine evidence. Repair before recording passing judgments.',
      handoff: incumbent
        ? 'Keep Edit Contract, scoped visual evidence and publication gate.'
        : workflow === 'refurbish'
          ? 'Use the design-led source/design map and normal Refurbish fidelity/comparison gates; mechanical recoloring alone does not establish target design.'
          : 'Reuse deck_lock.artDirection, registered design plans, canonical Create rendering and bound design/visual reviews.',
    },
    requiredReferences: unique([
      'references/review/design-floor.md',
      ...WORKFLOW_REFERENCES[workflow],
    ]),
    warnings,
  }
}

/** Archive advice for a choice already owned by an authoring workflow.
 * Preparation still rejects ineligible automatic choices. Archiving cannot add
 * a new readiness gate or substitute another kit for an experimental build.
 */
export function captureChosenDesignContext(options) {
  try {
    return prepareDesignContext(options)
  } catch (error) {
    return {
      schemaVersion: 'pptx-nova-design-context/v1',
      workflow: options.workflow,
      status: 'unavailable',
      decisionAuthority: 'advisory',
      deliveryAuthorized: false,
      visualReviewCompleted: false,
      visualAuthority: { kind: 'explicit-deckkit', deckkit: options.deckkit },
      candidates: [],
      warnings: [`Design guidance unavailable: ${error.message}`],
      requiredReferences: ['references/review/design-floor.md'],
    }
  }
}
