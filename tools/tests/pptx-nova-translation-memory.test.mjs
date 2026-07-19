import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTranslationMemory,
  expandReviewInventory,
  materializeTranslations,
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
