import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyMemoryFill,
  buildMemoryFillView,
  buildTranslationMemory,
  expandReviewInventory,
  materializeTranslations,
  mergeTranslationMemoryAnchorDrafts,
  mergeTranslationMemoryRepairs,
} from '../../pptx-nova/scripts/lib/translation-memory.mjs'

const scan = {
  schemaVersion: 'pptx-i18n-scan/v1',
  sourceLang: 'multi',
  i18nUnits: {
    units: [
      {
        unitId: 'slide-1',
        action: 'translate',
        category: 'visibleBody',
        sourceText: 'Revenue',
        sourceHash: 'sha256:a',
        part: 'ppt/slides/slide1.xml',
        slide: 1,
      },
      {
        unitId: 'slide-2',
        action: 'translate',
        category: 'visibleBody',
        sourceText: 'Revenue',
        sourceHash: 'sha256:a',
        part: 'ppt/slides/slide2.xml',
        slide: 2,
      },
      {
        unitId: 'layout-1',
        action: 'review',
        category: 'visibleBody',
        sourceText: 'Master title',
        sourceHash: 'sha256:b',
        part: 'ppt/slideLayouts/slideLayout1.xml',
        slide: null,
        selectors: { replaceText: { part: 'ppt/slideLayouts/slideLayout1.xml' } },
      },
      {
        unitId: 'workbook-1',
        action: 'review',
        category: 'embeddedWorkbook',
        sourceText: 'Revenue',
        sourceHash: 'sha256:c',
        part: 'ppt/embeddings/a.xlsx!xl/sharedStrings.xml',
      },
    ],
  },
}

test('translation memory groups exact source text and keeps review inventory lazy', () => {
  const memory = buildTranslationMemory(scan, {
    sourceSha256: 'sha256:source',
    unitsSha256: 'sha256:units',
    targetLang: 'de',
  })
  assert.equal(memory.entries.length, 2)
  assert.equal(memory.summary.eligibleUnitCount, 3)
  assert.equal(memory.summary.uniqueSourceTextCount, 2)
  assert.equal(memory.summary.savedTranslationRecordCount, 1)
  assert.equal(memory.reviewPartitions.embeddedWorkbook.count, 1)
  assert.equal(memory.reviewPartitions.embeddedWorkbook.units, undefined)
})

test('translation memory expands only the explicitly requested review partition', () => {
  const expanded = expandReviewInventory(scan, 'embeddedWorkbook')
  assert.equal(expanded.schemaVersion, 'pptx-nova-i18n-review-inventory/v1')
  assert.equal(expanded.partition, 'embeddedWorkbook')
  assert.equal(expanded.count, 1)
  assert.deepEqual(
    expanded.units.map((unit) => unit.unitId),
    ['workbook-1'],
  )
  assert.throws(() => expandReviewInventory(scan, 'all'), /unsupported review partition/)
})

test('translation memory materializes per-unit records with explicit review override', () => {
  const memory = buildTranslationMemory(scan, {
    sourceSha256: 'sha256:source',
    unitsSha256: 'sha256:units',
    targetLang: 'de',
  })
  memory.entries.find((entry) => entry.sourceText === 'Revenue').targetText = 'Umsatz'
  memory.entries.find((entry) => entry.sourceText === 'Master title').targetText = 'Mastertitel'
  memory.unitOverrides = [
    {
      unitId: 'layout-1',
      reviewDecision: 'translate',
      reason: 'Shared master text is visible in the target deck.',
    },
  ]

  const translations = materializeTranslations(scan, memory)
  assert.equal(translations.translations.length, 3)
  assert.deepEqual(
    translations.translations
      .filter((item) => item.targetText === 'Umsatz')
      .map((item) => item.unitId),
    ['slide-1', 'slide-2'],
  )
  assert.equal(
    translations.translations.find((item) => item.unitId === 'layout-1').reviewDecision,
    'translate',
  )
})

test('translation memory merges planner target-segment repair templates by unitId', () => {
  const memory = buildTranslationMemory(scan, {
    sourceSha256: 'sha256:source',
    unitsSha256: 'sha256:units',
    targetLang: 'de',
  })
  const repaired = mergeTranslationMemoryRepairs(memory, {
    reviewRequired: [
      {
        repair: {
          schemaVersion: 'pptx-i18n-target-segments-repair/v1',
          kind: 'target-segments',
          translationPatchTemplate: {
            unitId: 'slide-1',
            targetText: 'Umsatz',
            targetSegmentsContractId: 'sha256:contract',
            targetSegments: [
              { sourceRunGroupId: 'group-0', text: null },
              { sourceRunGroupId: 'group-1', text: null },
            ],
          },
        },
      },
    ],
  })
  assert.equal(repaired.repairScaffold.unitCount, 1)
  assert.equal(repaired.repairScaffold.ready, false)
  assert.equal(repaired.unitOverrides[0].unitId, 'slide-1')
  assert.equal(repaired.unitOverrides[0].targetSegmentsContractId, 'sha256:contract')
  assert.equal(repaired.unitOverrides[0].targetSegments.length, 2)
})

test('translation memory merges only guarded high-confidence anchor drafts by unitId', () => {
  const memory = buildTranslationMemory(scan, {
    sourceSha256: 'sha256:source',
    unitsSha256: 'sha256:units',
    targetLang: 'de',
  })
  memory.entries.find((entry) => entry.sourceText === 'Revenue').targetText = 'Umsatz'
  const merged = mergeTranslationMemoryAnchorDrafts(memory, {
    schemaVersion: 'pptx-i18n-anchor-draft/v1',
    agentGate: {
      draftsMergeable: true,
      applyAuthorized: false,
      plannerRerunRequired: true,
    },
    summary: { draftCount: 1, blockedCount: 0, mergeableTranslationCount: 1 },
    drafts: [{ unitId: 'slide-1', confidence: 'high' }],
    blocked: [],
    translationsDraft: {
      schemaVersion: 'pptx-i18n-anchor-merge/v1',
      targetSchemaVersion: 'pptx-i18n-translations/v1',
      mergeBy: 'unitId',
      translations: [
        {
          unitId: 'slide-1',
          sourceHash: 'sha256:a',
          sourceText: 'Revenue',
          targetText: 'Umsatz',
          anchors: ['Umsatz'],
        },
      ],
    },
  })
  assert.equal(merged.anchorDraftMerge.unitCount, 1)
  assert.deepEqual(merged.memory.unitOverrides, [{ unitId: 'slide-1', anchors: ['Umsatz'] }])
  const slideOnlyScan = {
    ...scan,
    i18nUnits: { units: [scan.i18nUnits.units[0]] },
  }
  assert.deepEqual(
    materializeTranslations(slideOnlyScan, merged.memory).translations.find(
      (item) => item.unitId === 'slide-1',
    ).anchors,
    ['Umsatz'],
  )

  const overlappingMemory = structuredClone(memory)
  overlappingMemory.entries.find((entry) => entry.sourceText === 'Revenue').targetText = 'AAAAA'
  assert.throws(
    () =>
      mergeTranslationMemoryAnchorDrafts(overlappingMemory, {
        schemaVersion: 'pptx-i18n-anchor-draft/v1',
        agentGate: {
          draftsMergeable: true,
          applyAuthorized: false,
          plannerRerunRequired: true,
        },
        summary: { draftCount: 1, blockedCount: 0, mergeableTranslationCount: 1 },
        drafts: [{ unitId: 'slide-1', confidence: 'high' }],
        blocked: [],
        translationsDraft: {
          schemaVersion: 'pptx-i18n-anchor-merge/v1',
          targetSchemaVersion: 'pptx-i18n-translations/v1',
          mergeBy: 'unitId',
          translations: [
            {
              unitId: 'slide-1',
              sourceHash: 'sha256:a',
              sourceText: 'Revenue',
              targetText: 'AAAAA',
              anchors: ['AAAA'],
            },
          ],
        },
      }),
    /anchor is not unique/,
  )

  assert.throws(
    () =>
      mergeTranslationMemoryAnchorDrafts(memory, {
        schemaVersion: 'pptx-i18n-anchor-draft/v1',
        agentGate: {
          draftsMergeable: true,
          applyAuthorized: true,
          plannerRerunRequired: false,
        },
        summary: { draftCount: 0, blockedCount: 0, mergeableTranslationCount: 0 },
        drafts: [],
        blocked: [],
        translationsDraft: {
          schemaVersion: 'pptx-i18n-anchor-merge/v1',
          targetSchemaVersion: 'pptx-i18n-translations/v1',
          mergeBy: 'unitId',
          translations: [],
        },
      }),
    /must never authorize apply/,
  )
  assert.throws(
    () =>
      mergeTranslationMemoryAnchorDrafts(memory, {
        schemaVersion: 'pptx-i18n-anchor-draft/v1',
        agentGate: {
          draftsMergeable: true,
          applyAuthorized: false,
          plannerRerunRequired: true,
        },
        summary: { draftCount: 1, blockedCount: 0, mergeableTranslationCount: 1 },
        drafts: [{ unitId: 'slide-1', confidence: 'high' }],
        blocked: [],
        translationsDraft: {
          schemaVersion: 'pptx-i18n-anchor-merge/v1',
          targetSchemaVersion: 'pptx-i18n-translations/v1',
          mergeBy: 'unitId',
          translations: [
            {
              unitId: 'slide-1',
              sourceHash: 'sha256:stale',
              sourceText: 'Revenue',
              targetText: 'Umsatz',
              anchors: ['Umsatz'],
            },
          ],
        },
      }),
    /sourceHash is stale/,
  )
  assert.throws(
    () =>
      mergeTranslationMemoryAnchorDrafts(memory, {
        schemaVersion: 'pptx-i18n-anchor-draft/v1',
        agentGate: {
          draftsMergeable: true,
          applyAuthorized: false,
          plannerRerunRequired: true,
        },
        summary: { draftCount: 1, blockedCount: 0, mergeableTranslationCount: 1 },
        drafts: [{ unitId: 'slide-1', confidence: 'blocked' }],
        blocked: [],
        translationsDraft: {
          schemaVersion: 'pptx-i18n-anchor-merge/v1',
          targetSchemaVersion: 'pptx-i18n-translations/v1',
          mergeBy: 'unitId',
          translations: [
            {
              unitId: 'slide-1',
              sourceHash: 'sha256:a',
              sourceText: 'Revenue',
              targetText: 'Umsatz',
              anchors: ['Umsatz'],
            },
          ],
        },
      }),
    /unique high-confidence unitIds/,
  )
})

test('the memory fill view carries only memoryId, sourceText, and targetText per line', () => {
  const memory = buildTranslationMemory(scan, {
    sourceSha256: 'sha256:source',
    unitsSha256: 'sha256:units',
    targetLang: 'de',
  })
  const view = buildMemoryFillView(memory)
  const lines = view
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.equal(lines.length, memory.entries.length)
  for (const [index, line] of lines.entries()) {
    assert.deepEqual(Object.keys(line).sort(), ['memoryId', 'sourceText', 'targetText'])
    assert.equal(line.memoryId, memory.entries[index].memoryId)
    assert.equal(line.sourceText, memory.entries[index].sourceText)
    assert.equal(line.targetText, null)
  }
})

test('a partial JSONL fill merges by memoryId without touching other entries', () => {
  const memory = buildTranslationMemory(scan, {
    sourceSha256: 'sha256:source',
    unitsSha256: 'sha256:units',
    targetLang: 'de',
  })
  const revenue = memory.entries.find((entry) => entry.sourceText === 'Revenue')
  const { memory: merged, filledCount } = applyMemoryFill(
    memory,
    `${JSON.stringify({ memoryId: revenue.memoryId, sourceText: 'Revenue', targetText: 'Umsatz' })}\n`,
  )
  assert.equal(filledCount, 1)
  assert.equal(merged.entries.find((entry) => entry.sourceText === 'Revenue').targetText, 'Umsatz')
  assert.equal(merged.entries.find((entry) => entry.sourceText === 'Master title').targetText, null)
  // The input memory object stays untouched.
  assert.equal(memory.entries.find((entry) => entry.sourceText === 'Revenue').targetText, null)
})

test('a fill with unknown ids, stale sourceText, or unfilled targetText fails closed', () => {
  const memory = buildTranslationMemory(scan, {
    sourceSha256: 'sha256:source',
    unitsSha256: 'sha256:units',
    targetLang: 'de',
  })
  const revenue = memory.entries.find((entry) => entry.sourceText === 'Revenue')
  assert.throws(
    () =>
      applyMemoryFill(memory, `${JSON.stringify({ memoryId: 'sha256:nope', targetText: 'x' })}\n`),
    /unknown memoryId/,
  )
  assert.throws(
    () =>
      applyMemoryFill(
        memory,
        `${JSON.stringify({ memoryId: revenue.memoryId, sourceText: 'Stale', targetText: 'x' })}\n`,
      ),
    /sourceText is stale/,
  )
  assert.throws(
    () =>
      applyMemoryFill(
        memory,
        `${JSON.stringify({ memoryId: revenue.memoryId, targetText: null })}\n`,
      ),
    /targetText must be filled/,
  )
  assert.throws(() => applyMemoryFill(memory, '\n\n'), /contains no entries/)
})
