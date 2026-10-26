import assert from 'node:assert/strict'
import test from 'node:test'
import { runNode, skillPath } from '../helpers/common.mjs'

const select = (...args) =>
  JSON.parse(runNode([skillPath('scripts/cli/deckkits/select.mjs'), '--json', ...args]).stdout)

test('unspecified intent earns no scenario, language or density match points', () => {
  const result = select()
  for (const entry of result.ranked) {
    for (const key of ['defaultFor', 'bestFor', 'language', 'density'])
      assert.equal(entry.scoreParts[key], 0, `${entry.id}.${key}`)
  }
  assert.equal(result.query.scenarioSource, 'unspecified')
  assert.ok(result.warnings.length)
})

test('one-sentence product briefs and Chinese scenario aliases select a relevant production kit', () => {
  for (const args of [
    ['--brief', '帮我做一份 xdoc 产品介绍，15 页左右'],
    ['--scenario', '产品介绍'],
  ]) {
    const result = select(...args, '--language', 'zh')
    assert.equal(result.query.scenario, 'product-platform')
    assert.equal(result.selected.scenarioMatched, true)
    assert.ok(result.selected.bestFor.includes('product-platform'))
    assert.notEqual(result.selected.id, 'paper-scholar')
  }
})

test('explicit scenario wins over brief inference and unknown topics disclose lack of match', () => {
  const result = select('--scenario', 'research courseware', '--brief', '产品介绍')
  assert.equal(result.query.scenario, 'research courseware')
  assert.equal(result.query.scenarioSource, 'explicit')
  assert.equal(result.selected.id, 'paper-scholar')
  const unknown = select('--scenario', 'unregistered niche')
  assert.equal(unknown.selected.scenarioMatched, false)
  assert.ok(unknown.warnings.some((w) => w.includes('No scenario match')))
})
