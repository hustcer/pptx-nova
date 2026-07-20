import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const classifier = join(repoRoot, 'pptx-nova/scripts/pptx-nova-i18n-classify-review-units.mjs')

const scanUnits = [
  {
    unitId: 'u1',
    action: 'review',
    requiresReview: true,
    category: 'chartVisibleCache',
    sourceText: 'Jan',
    sourceHash: 'sha256:jan',
    part: 'ppt/charts/chart1.xml',
    slide: 2,
    notes: ['language-classification-uncertain'],
  },
  {
    unitId: 'u2',
    action: 'review',
    requiresReview: true,
    category: 'chartVisibleCache',
    sourceText: 'Jan',
    sourceHash: 'sha256:jan',
    part: 'ppt/charts/chart2.xml',
    slide: 3,
    notes: ['language-classification-uncertain'],
  },
  {
    unitId: 'u3',
    action: 'review',
    requiresReview: true,
    category: 'visibleBody',
    sourceText: 'Forecast',
    sourceHash: 'sha256:forecast',
    part: 'ppt/slides/slide4.xml',
    slide: 4,
    notes: ['language-classification-uncertain'],
  },
  {
    unitId: 'u4',
    action: 'translate',
    category: 'visibleBody',
    sourceText: 'Jan',
    sourceHash: 'sha256:jan',
    part: 'ppt/slides/slide5.xml',
    slide: 5,
  },
  {
    unitId: 'u5',
    action: 'review',
    category: 'visibleBody',
    sourceText: 'Shared layout title',
    sourceHash: 'sha256:layout',
    part: 'ppt/slideLayouts/slideLayout1.xml',
    slide: null,
  },
]

function writeScan(root) {
  const path = join(root, 'scan.json')
  writeFileSync(
    path,
    JSON.stringify({
      schemaVersion: 'pptx-i18n-scan/v1',
      sourceLang: 'multi',
      i18nUnits: { units: structuredClone(scanUnits) },
    }),
  )
  return { path, sha256: `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}` }
}

function runClassifier(root, decisionsDoc, expectedStatus = 0) {
  const scan = writeScan(root)
  const decisionsPath = join(root, 'decisions.json')
  writeFileSync(
    decisionsPath,
    JSON.stringify({ scanSha256: scan.sha256, ...decisionsDoc }, null, 2),
  )
  const output = join(root, 'classified.json')
  const report = join(root, 'report.json')
  const result = spawnSync(
    process.execPath,
    [
      classifier,
      '--scan',
      scan.path,
      '--decisions',
      decisionsPath,
      '--output',
      output,
      '--report',
      report,
      '--overwrite',
      '--json-full',
    ],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout)
  if (expectedStatus !== 0) return JSON.parse(result.stderr)
  return {
    report: JSON.parse(result.stdout),
    classified: JSON.parse(readFileSync(output, 'utf8')),
  }
}

test('byText decisions classify every unit sharing the exact source text', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-review-classify-'))
  const { report, classified } = runClassifier(root, {
    schemaVersion: 'pptx-nova-i18n-review-decisions/v1',
    byText: [
      {
        sourceText: 'Jan',
        sourceHash: 'sha256:jan',
        decision: 'preserve',
        reason: 'Month token kept in English across chart categories.',
      },
    ],
    decisions: [
      {
        unitId: 'u3',
        sourceHash: 'sha256:forecast',
        decision: 'translate',
        reason: 'Visible slide copy in the source language.',
      },
    ],
  })
  assert.equal(report.status, 'pass')
  assert.equal(report.summary.reviewUnitCount, 3)
  assert.equal(report.summary.byTextRuleCount, 1)
  assert.equal(report.summary.byTextDecidedCount, 2)
  assert.equal(report.summary.unitDecidedCount, 1)
  const byUnit = new Map(report.applied.map((item) => [item.unitId, item]))
  assert.equal(byUnit.get('u1').decisionSource, 'byText')
  assert.equal(byUnit.get('u2').decisionSource, 'byText')
  assert.equal(byUnit.get('u3').decisionSource, 'unit')
  const units = new Map(classified.i18nUnits.units.map((unit) => [unit.unitId, unit]))
  for (const unitId of ['u1', 'u2']) {
    assert.equal(units.get(unitId).action, 'preserve')
    assert.equal(units.get(unitId).requiresReview, false)
    assert.ok(units.get(unitId).notes.includes('classified-preserve'))
  }
  assert.equal(units.get('u3').action, 'translate')
  assert.equal(units.get('u4').action, 'translate')
  assert.equal(units.get('u4').reason, undefined)
  assert.equal(units.get('u5').action, 'review')
})

test('per-unit decisions override the matching byText rule for that unit alone', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-review-classify-'))
  const { report, classified } = runClassifier(root, {
    schemaVersion: 'pptx-nova-i18n-review-decisions/v1',
    byText: [
      { sourceText: 'Jan', decision: 'preserve', reason: 'Month token kept in English.' },
      { sourceText: 'Forecast', decision: 'translate', reason: 'Source-language slide copy.' },
    ],
    decisions: [
      {
        unitId: 'u2',
        sourceHash: 'sha256:jan',
        decision: 'translate',
        reason: 'This one chart uses localized month labels.',
      },
    ],
  })
  assert.equal(report.summary.byTextDecidedCount, 2)
  assert.equal(report.summary.unitDecidedCount, 1)
  const units = new Map(classified.i18nUnits.units.map((unit) => [unit.unitId, unit]))
  assert.equal(units.get('u1').action, 'preserve')
  assert.equal(units.get('u2').action, 'translate')
  assert.equal(units.get('u2').reason, 'This one chart uses localized month labels.')
  assert.equal(units.get('u3').action, 'translate')
})

test('per-unit-only decisions keep working without byText', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-review-classify-'))
  const { report } = runClassifier(root, {
    schemaVersion: 'pptx-nova-i18n-review-decisions/v1',
    decisions: [
      { unitId: 'u1', sourceHash: 'sha256:jan', decision: 'preserve', reason: 'Month token.' },
      { unitId: 'u2', sourceHash: 'sha256:jan', decision: 'preserve', reason: 'Month token.' },
      { unitId: 'u3', sourceHash: 'sha256:forecast', decision: 'translate', reason: 'Copy.' },
    ],
  })
  assert.equal(report.status, 'pass')
  assert.equal(report.summary.byTextRuleCount, 0)
  assert.equal(report.summary.byTextDecidedCount, 0)
  assert.equal(report.summary.unitDecidedCount, 3)
  assert.ok(report.applied.every((item) => item.decisionSource === 'unit'))
})

test('byText validation fails closed', () => {
  const base = {
    schemaVersion: 'pptx-nova-i18n-review-decisions/v1',
    decisions: [
      {
        unitId: 'u3',
        sourceHash: 'sha256:forecast',
        decision: 'translate',
        reason: 'Visible slide copy.',
      },
    ],
  }
  const cases = [
    {
      byText: [
        { sourceText: 'Jan', sourceHash: 'sha256:wrong', decision: 'preserve', reason: 'x' },
      ],
      message: /byText sourceHash mismatch/,
    },
    {
      byText: [{ sourceText: 'No such text', decision: 'preserve', reason: 'x' }],
      message: /match no language-review units/,
    },
    {
      byText: [
        { sourceText: 'Jan', decision: 'preserve', reason: 'x' },
        { sourceText: 'Jan', decision: 'translate', reason: 'y' },
      ],
      message: /duplicate sourceText/,
    },
    {
      byText: [{ sourceText: 'Jan', decision: 'maybe', reason: 'x' }],
      message: /invalid byText decision/,
    },
    {
      byText: [{ sourceText: 'Jan', decision: 'preserve', reason: '   ' }],
      message: /byText decision reason is required/,
    },
    {
      byText: [{ decision: 'preserve', reason: 'x' }],
      message: /require a non-empty sourceText/,
    },
  ]
  for (const { byText, message } of cases) {
    const root = mkdtempSync(join(tmpdir(), 'pptx-nova-review-classify-'))
    const failure = runClassifier(root, { ...base, byText }, 1)
    assert.match(failure.error.message, message, JSON.stringify(byText))
  }
})

test('a byText rule cannot silently leave other review texts undecided', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-review-classify-'))
  const failure = runClassifier(
    root,
    {
      schemaVersion: 'pptx-nova-i18n-review-decisions/v1',
      byText: [{ sourceText: 'Jan', decision: 'preserve', reason: 'Month token.' }],
    },
    1,
  )
  assert.match(failure.error.message, /missing language classification for u3/)
})

test('scan hash binding still fails closed with byText decisions', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-review-classify-'))
  const scan = writeScan(root)
  const decisionsPath = join(root, 'decisions.json')
  writeFileSync(
    decisionsPath,
    JSON.stringify({
      schemaVersion: 'pptx-nova-i18n-review-decisions/v1',
      scanSha256: 'sha256:stale',
      byText: [{ sourceText: 'Jan', decision: 'preserve', reason: 'Month token.' }],
    }),
  )
  const result = spawnSync(
    process.execPath,
    [
      classifier,
      '--scan',
      scan.path,
      '--decisions',
      decisionsPath,
      '--output',
      join(root, 'classified.json'),
      '--overwrite',
    ],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 1)
  assert.match(
    JSON.parse(result.stderr).error.message,
    /scanSha256 does not match the scan artifact/,
  )
})
