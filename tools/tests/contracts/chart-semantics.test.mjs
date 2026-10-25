import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runNode, skillPath, skillUrl, writeJson } from '../helpers/common.mjs'

test('shared ChartEx semantics normalize dataEx and deck-lock semanticSource', async () => {
  const { normalizeChartSemantics, validateChartSemantics } = await import(
    skillUrl('scripts/lib/pptx/chart-semantics.mjs')
  )
  const validCases = [
    ['waterfall', { points: [{ label: 'Start', value: 100, kind: 'total' }] }],
    ['funnel', { stages: [{ label: 'Visitors', value: 120 }] }],
    ['histogram', { values: [1, 2, 3] }],
    [
      'treemap',
      {
        nodes: [
          { id: 'root', label: 'Root', value: 10 },
          { id: 'leaf', parent: 'root', label: 'Leaf', value: 10 },
        ],
      },
    ],
    [
      'sunburst',
      {
        nodes: [
          { id: 'root', label: 'Root', value: 10 },
          { id: 'leaf', parent: 'root', label: 'Leaf', value: 10 },
        ],
      },
    ],
    ['box-whisker', { series: [{ name: 'North', categories: ['D1', 'D2'], values: [10, 12] }] }],
  ]

  for (const [kind, dataEx] of validCases) {
    const semantics = normalizeChartSemantics(
      { op: 'add-chart', kind, dataEx },
      { chart: { semanticSource: 'content.slides[0].data' } },
    )
    assert.equal(semantics.dialect, 'chartex')
    assert.equal(semantics.source, 'content.slides[0].data')
    assert.deepEqual(validateChartSemantics(semantics), { errors: [], warnings: [] })
  }

  const invalidHierarchy = normalizeChartSemantics({
    op: 'add-chart',
    kind: 'treemap',
    dataEx: { nodes: [{ id: 'leaf', parent: 'missing', label: 'Leaf', value: 10 }] },
  })
  assert.equal(
    validateChartSemantics(invalidHierarchy).errors.some(
      (item) => item.code === 'chart-ex-node-parent-missing',
    ),
    true,
  )
})

test('semantic-audit and check-lock share ChartEx dataEx semantics', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-chartex-semantics-'))
  const patchPath = join(root, 'patch.json')
  const lockPath = join(root, 'deck_lock.json')
  const auditPath = join(root, 'semantic-audit.json')
  writeJson(patchPath, {
    schemaVersion: 'pptx-patch/v1',
    ops: [
      {
        op: 'add-chart',
        slide: 0,
        kind: 'waterfall',
        x: '1in',
        y: '1in',
        w: '5in',
        h: '3in',
        dataEx: {
          points: [
            { label: 'Start', value: 100, kind: 'total' },
            { label: 'Growth', value: 25, kind: 'increase' },
          ],
        },
      },
    ],
  })
  writeJson(lockPath, {
    schemaVersion: 'pptx-nova-deck-lock/v1',
    mode: 'create',
    canvas: { width: '13.333in', height: '7.5in' },
    colors: { accent: '#123456' },
    typography: { title: 'Arial', body: 'Arial' },
    slides: [
      {
        title: 'Waterfall',
        claimTitle: 'Growth offsets the starting base.',
        slideType: 'chartSlide',
        rhythm: 'anchor',
        chart: { kind: 'waterfall', semanticSource: 'content.slides[0].data' },
      },
    ],
  })

  const auditResult = runNode([
    skillPath('scripts/cli/review/semantic-audit.mjs'),
    '--deck-lock',
    lockPath,
    '--patch',
    patchPath,
    '--output',
    auditPath,
    '--json',
  ])
  const audit = JSON.parse(auditResult.stdout)
  assert.equal(audit.charts[0].checks.dataShape.status, 'passed')
  assert.equal(audit.charts[0].checks.source.status, 'passed')
  assert.equal(
    audit.warnings.some((item) => item.code === 'chart-data-missing'),
    false,
  )

  const lockResult = runNode([
    skillPath('scripts/cli/create/check-lock.mjs'),
    '--lock',
    lockPath,
    '--patch',
    patchPath,
    '--json',
  ])
  const lock = JSON.parse(lockResult.stdout)
  assert.equal(
    lock.errors.some((item) => item.code.startsWith('chart-')),
    false,
  )
  assert.equal(
    lock.warnings.some((item) => item.code === 'chart-data-missing'),
    false,
  )
})
