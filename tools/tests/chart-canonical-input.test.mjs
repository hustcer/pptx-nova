import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeChartSemantics,
  validateChartSemantics,
} from '../../pptx-nova/scripts/lib/chart-semantics.mjs'

const nodes = [{ id: 'root', label: 'Root', value: 10 }]
for (const key of ['chartKind', 'type']) {
  test(`chart semantics reject retired dataEx ${key}`, () => {
    const semantics = normalizeChartSemantics({
      op: 'add-chart',
      kind: 'treemap',
      dataEx: { [key]: 'treemap', nodes },
    })
    assert.ok(validateChartSemantics(semantics).errors.length > 0)
  })
}
test('chart semantics reject inner and outer kind conflicts', () => {
  const semantics = normalizeChartSemantics({
    op: 'add-chart',
    kind: 'sunburst',
    dataEx: { kind: 'treemap', nodes },
  })
  assert.ok(validateChartSemantics(semantics).errors.length > 0)
})
test('hierarchy updates require an authored dataEx kind', () => {
  const semantics = normalizeChartSemantics(
    { op: 'set-chart-data', dataEx: { nodes } },
    { chart: { kind: 'treemap' } },
  )
  assert.ok(validateChartSemantics(semantics).errors.length > 0)
})
test('combo series reject OOXML aliases and retired discriminants', () => {
  for (const bad of [{ chartKind: 'column' }, { kind: 'columnChart' }, { type: 'column' }]) {
    const semantics = normalizeChartSemantics({
      op: 'add-chart',
      kind: 'combo',
      data: {
        categories: ['A', 'B'],
        series: [
          { name: 'Sales', values: [10, 20], ...bad },
          { name: 'Margin', values: [1, 2], kind: 'line', secondaryAxis: true },
        ],
      },
    })
    assert.ok(validateChartSemantics(semantics).errors.length > 0)
  }
})
test('canonical hierarchy creation and update retain their distinct semantics', () => {
  for (const kind of ['treemap', 'sunburst']) {
    for (const op of [
      { op: 'add-chart', kind, dataEx: { nodes } },
      { op: 'add-chart', kind, dataEx: { kind, nodes } },
      { op: 'set-chart-data', dataEx: { kind, nodes } },
    ]) {
      const semantics = normalizeChartSemantics(op)
      assert.equal(semantics.kind, kind)
      assert.deepEqual(validateChartSemantics(semantics), { errors: [], warnings: [] })
    }
  }
})
