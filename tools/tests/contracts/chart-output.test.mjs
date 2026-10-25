import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { skillPath, skillUrl } from '../helpers/common.mjs'

test('cartesian line chart emits xdoc-compatible marker colors', async () => {
  const kit = await import(skillUrl('assets/deckkits/cartesian/cartesian.kit.mjs'))
  const result = kit.createDeck({
    meta: { deckkit: 'cartesian' },
    slides: [
      {
        type: 'cartesianLineChartSlide',
        data: {
          label: 'Trend Analysis',
          title: 'Growth Projection',
          body: 'Marker payloads must follow the current xdoc chart contract.',
          unit: 'percent',
          source: 'Source: synthetic marker fixture',
          chart: {
            categories: ['2024', '2025'],
            series: [
              { name: 'Market Share', values: [42, 51] },
              { name: 'Industry Average', values: [30, 36] },
            ],
          },
        },
      },
    ],
  })
  const markers = result.patch.ops.flatMap((op) =>
    op.op === 'set-chart' ? (op.series ?? []).map((series) => series.marker).filter(Boolean) : [],
  )

  assert.equal(markers.length, 2)
  assert.deepEqual(
    markers.map((marker) => [marker.fill, marker.line]),
    [
      ['1A1A1A', 'EDE8E0'],
      ['665D56', 'EDE8E0'],
    ],
  )
})

test('consulting-dark benchmark chart omits the unsupported none legend value', async () => {
  const kit = await import(skillUrl('assets/deckkits/consulting-dark/consulting-dark.kit.mjs'))
  const result = kit.createDeck({
    meta: { deckkit: 'consulting-dark' },
    slides: [
      {
        type: 'benchmarkSlide',
        data: {
          eyebrow: 'Benchmark',
          title: 'Comparison',
          source: 'Synthetic validation fixture',
          unit: 'Points',
          tableRows: [
            ['Metric', 'Product'],
            ['Score', '9.8'],
          ],
          chartTitle: 'Scores',
          chartData: {
            categories: ['Product'],
            series: [{ name: 'Score', values: [9.8] }],
          },
          calloutNum: '9.8',
          calloutText: 'Leading score',
        },
      },
    ],
  })
  const chart = result.patch.ops.find((op) => op.op === 'add-chart')

  assert.ok(chart, 'benchmark slide should emit an add-chart operation')
  assert.equal('legend' in chart, false)
})

test('consulting-dark benchmark table emits canonical nested cell coordinates', async () => {
  const kit = await import(skillUrl('assets/deckkits/consulting-dark/consulting-dark.kit.mjs'))
  const content = JSON.parse(
    readFileSync(skillPath('assets/examples/deckkits/consulting-dark/content.json'), 'utf8'),
  )
  const result = kit.createDeck(content)
  const cells = result.patch.ops
    .filter((op) => op.op === 'set-table')
    .flatMap((op) => op.cells ?? [])

  assert.equal(
    cells.length,
    content.slides.find((s) => s.type === 'benchmarkSlide').data.tableRows.flat().length,
  )
  for (const cell of cells) {
    assert.equal('col' in cell, false, 'legacy set-table.cells[].col')
    assert.equal(Number.isInteger(cell.column), true, 'set-table.cells[].column must be an integer')
  }
})
