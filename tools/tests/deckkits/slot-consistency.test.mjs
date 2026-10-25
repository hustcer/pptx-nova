import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runNode, skillPath } from '../helpers/common.mjs'

test('DeckKit slot consistency honors array-level control roles by default', () => {
  const result = runNode([skillPath('scripts/cli/deckkits/slot-consistency.mjs'), '--json'])
  const consistency = JSON.parse(result.stdout)
  const swissGrid = consistency.results.find((kit) => kit.deckkit === 'swiss-grid')
  const timeline = swissGrid.slideTypes.find((slide) => slide.slideType === 'swissTimelineSlide')

  assert.equal(consistency.ok, true)
  assert.equal(timeline.status, 'ok')
  assert.deepEqual(timeline.ghosts, [])
})

test('isolated slot probes declare excerpt scope for complete-deck contracts', () => {
  const result = runNode([
    skillPath('scripts/cli/deckkits/slot-consistency.mjs'),
    '--deckkit',
    'warm-clay',
    '--json',
  ])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.ok, true)
  assert.equal(report.results[0].slideTypes.length, 8)
  assert.ok(report.results[0].slideTypes.every((page) => page.status === 'ok'))
})

test('amber-ledger registered slot probes preserve every visible field', () => {
  const result = runNode([
    skillPath('scripts/cli/deckkits/slot-consistency.mjs'),
    '--deckkit',
    'amber-ledger',
    '--json',
  ])
  const report = JSON.parse(result.stdout)
  assert.equal(report.ok, true)
  assert.equal(report.results[0].slideTypes.length, 8)
  assert.ok(report.results[0].slideTypes.every((page) => page.status === 'ok'))
})

test('midnight-pulse registered entry preserves every visible slot across all eight roles', () => {
  const result = runNode([
    skillPath('scripts/cli/deckkits/slot-consistency.mjs'),
    '--deckkit',
    'midnight-pulse',
    '--json',
  ])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.ok, true)
  assert.equal(report.results[0].slideTypes.length, 8)
  assert.ok(report.results[0].slideTypes.every((page) => page.status === 'ok'))
})

test('sky-compass registered entry preserves every visible slot across twelve roles', () => {
  const result = runNode([
    'pptx-nova/scripts/cli/deckkits/slot-consistency.mjs',
    '--deckkit',
    'sky-compass',
    '--json',
  ])
  const report = JSON.parse(result.stdout)
  assert.equal(report.ok, true)
  assert.equal(report.results[0].slideTypes.length, 12)
  assert.ok(report.results[0].slideTypes.every((s) => s.status === 'ok'))
})
