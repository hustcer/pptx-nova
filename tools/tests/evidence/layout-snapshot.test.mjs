import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runNode, skillPath, writeJson } from '../helpers/common.mjs'

test('layout snapshot separates actionable risks from informational inspect gaps', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-layout-summary-'))
  const inspectPath = join(root, 'inspect.json')
  const outputPath = join(root, 'layout-final.json')
  writeJson(inspectPath, {
    schemaVersion: 'pptx-inspect/v1',
    presentation: { slideCount: 1, size: { width: '10in', height: '5.625in' } },
    slides: [
      {
        index: 0,
        shapes: [
          {
            id: 'missing-font-metadata',
            shapeType: 'text',
            text: 'Visible text',
            bbox: { x: 10, y: 10, width: 100, height: 40 },
          },
          {
            id: 'empty-placeholder',
            shapeType: 'rect',
            placeholder: { type: 'body' },
            bbox: { x: 10, y: 60, width: 100, height: 40 },
          },
          {
            id: 'tiny-text',
            shapeType: 'text',
            text: 'Tiny',
            fontFamily: 'Aptos',
            fontSizePt: 5,
            bbox: { x: 10, y: 110, width: 100, height: 40 },
          },
        ],
      },
    ],
  })

  const result = runNode([
    skillPath('scripts/cli/review/layout-snapshot.mjs'),
    '--inspect',
    inspectPath,
    '--output',
    outputPath,
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'warn')
  assert.equal(report.summary.riskCount, 4)
  assert.equal(report.summary.actionableRiskCount, 2)
  assert.equal(report.summary.informationalRiskCount, 2)
  assert.deepEqual(report.summary.byClassification, { actionable: 2, informational: 2 })
  assert.deepEqual(report.summary.bySeverity, { error: 0, warning: 2, info: 2 })
  assert.equal(report.summary.affectedSlideCount, 1)
  assert.equal(report.summary.actionableSlideCount, 1)
  assert.equal(report.summary.slideIndexBase, 0)
  assert.equal(report.summary.slideNumberBase, 1)
  assert.deepEqual(report.summary.affectedSlideIndexes, [0])
  assert.deepEqual(report.summary.affectedSlideNumbers, [1])
  assert.deepEqual(report.summary.affectedPreviewFiles, ['slide-001.png'])
  assert.deepEqual(report.summary.actionableSlideIndexes, [0])
  assert.deepEqual(report.summary.actionableSlideNumbers, [1])
  assert.deepEqual(report.summary.actionablePreviewFiles, ['slide-001.png'])
  assert.deepEqual(
    report.summary.topActionable.map(({ code, count }) => ({ code, count })),
    [
      { code: 'empty-placeholder', count: 1 },
      { code: 'font-size-too-small', count: 1 },
    ],
  )
  assert.deepEqual(report.summary.topActionable[0].slideIndexes, [0])
  assert.deepEqual(report.summary.topActionable[0].slideNumbers, [1])
  assert.deepEqual(report.summary.topActionable[0].previewFiles, ['slide-001.png'])
  assert.equal(
    report.risks.every((risk) => risk.slideIndex === 0),
    true,
  )
  assert.equal(
    report.risks.every((risk) => risk.slideNumber === 1),
    true,
  )
  assert.equal(
    report.risks.every((risk) => risk.previewFile === 'slide-001.png'),
    true,
  )
  const actionable = report.risks.filter((risk) => risk.classification === 'actionable')
  const informational = report.risks.filter((risk) => risk.classification === 'informational')
  assert.equal(
    actionable.every(
      (risk) =>
        risk.reviewIdentity?.schemaVersion === 'pptx-nova-review-finding/v1' &&
        risk.reviewIdentity?.algorithm === 'sha256' &&
        /^[0-9a-f]{64}$/.test(risk.reviewIdentity?.sha256 ?? ''),
    ),
    true,
  )
  assert.equal(
    informational.every((risk) => risk.reviewIdentity === undefined),
    true,
  )
  assert.notEqual(actionable[0].reviewIdentity.sha256, actionable[1].reviewIdentity.sha256)
  assert.equal(readFileSync(outputPath, 'utf8'), `${JSON.stringify(report, null, 2)}\n`)
})

test('layout snapshot keeps explicit slide references beyond summary truncation', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-layout-slide-references-'))
  const inspectPath = join(root, 'inspect.json')
  writeJson(inspectPath, {
    schemaVersion: 'pptx-inspect/v1',
    presentation: { slideCount: 10, size: { width: '10in', height: '5.625in' } },
    slides: Array.from({ length: 10 }, (_, index) => ({
      index,
      shapes: [
        {
          id: `empty-placeholder-${index}`,
          shapeType: 'rect',
          placeholder: { type: 'body' },
          bbox: { x: 10, y: 10, width: 100, height: 40 },
        },
      ],
    })),
  })

  const result = runNode([
    skillPath('scripts/cli/review/layout-snapshot.mjs'),
    '--inspect',
    inspectPath,
    '--json',
  ])
  const report = JSON.parse(result.stdout)
  const placeholderRisks = report.risks.filter((risk) => risk.code === 'empty-placeholder')

  assert.equal(report.summary.affectedSlidesTruncated, true)
  assert.equal(report.summary.topActionable[0].slidesTruncated, true)
  assert.equal(report.summary.topActionable[0].slideNumbers.length, 8)
  assert.equal(placeholderRisks.length, 10)
  assert.deepEqual(
    placeholderRisks.map((risk) => [risk.slideIndex, risk.slideNumber, risk.previewFile]),
    Array.from({ length: 10 }, (_, index) => [
      index,
      index + 1,
      `slide-${String(index + 1).padStart(3, '0')}.png`,
    ]),
  )
})

test('layout snapshot treats undisclosed inspect metadata as informational only', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-layout-informational-'))
  const inspectPath = join(root, 'inspect.json')
  writeJson(inspectPath, {
    schemaVersion: 'pptx-inspect/v1',
    presentation: { slideCount: 1, size: { width: '10in', height: '5.625in' } },
    slides: [
      {
        index: 0,
        shapes: [
          {
            id: 'missing-font-metadata',
            shapeType: 'text',
            text: 'Visible text',
            bbox: { x: 10, y: 10, width: 100, height: 40 },
          },
        ],
      },
    ],
  })

  const result = runNode([
    skillPath('scripts/cli/review/layout-snapshot.mjs'),
    '--inspect',
    inspectPath,
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'pass')
  assert.equal(report.summary.actionableRiskCount, 0)
  assert.equal(report.summary.informationalRiskCount, 2)
  assert.deepEqual(report.summary.topActionable, [])
})

test('layout snapshot accepts axis-aligned connectors but rejects zero-length geometry', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-layout-connectors-'))
  const inspectPath = join(root, 'inspect.json')
  writeJson(inspectPath, {
    schemaVersion: 'pptx-inspect/v1',
    presentation: { slideCount: 1, size: { width: '10in', height: '5.625in' } },
    slides: [
      {
        index: 0,
        shapes: [
          {
            id: 'horizontal-connector',
            shapeType: 'connector',
            bbox: { x: 10, y: 10, width: 100, height: 0 },
          },
          {
            id: 'vertical-connector',
            shapeType: 'connector',
            bbox: { x: 10, y: 20, width: 0, height: 100 },
          },
          {
            id: 'zero-length-connector',
            shapeType: 'connector',
            bbox: { x: 10, y: 30, width: 0, height: 0 },
          },
          {
            id: 'zero-width-shape',
            shapeType: 'rect',
            bbox: { x: 10, y: 40, width: 0, height: 100 },
          },
        ],
      },
    ],
  })

  const result = runNode([
    skillPath('scripts/cli/review/layout-snapshot.mjs'),
    '--inspect',
    inspectPath,
    '--json',
  ])
  const report = JSON.parse(result.stdout)
  const bboxRisks = report.risks.filter((risk) => risk.code === 'bbox-invalid')

  assert.equal(report.status, 'warn')
  assert.equal(bboxRisks.length, 2)
  assert.deepEqual(
    bboxRisks.map((risk) => risk.objectId),
    ['zero-length-connector', 'zero-width-shape'],
  )
})
