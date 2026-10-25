import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runNode, skillPath } from '../helpers/common.mjs'

test('DeckKit slot reference covers every swiss-grid slide type', () => {
  const result = runNode([
    skillPath('scripts/cli/deckkits/slots.mjs'),
    '--deckkit',
    'swiss-grid',
    '--format',
    'json',
  ])
  const reference = JSON.parse(result.stdout)

  assert.equal(reference.deckkit, 'swiss-grid')
  assert.equal(reference.slideTypes.length, 15)
  assert.equal(reference.slideTypes.filter((slideType) => !slideType.hasSchema).length, 0)
  assert.ok(
    reference.slideTypes
      .find((slideType) => slideType.slideType === 'swissTypefaceSlide')
      ?.rows.some((row) => row.path === 'data.cards' && row.budget.includes('items 1-3')),
  )
  assert.ok(
    reference.slideTypes
      .find((slideType) => slideType.slideType === 'swissTableSlide')
      ?.rows.some((row) => row.path === 'data.rows' && row.budget.includes('items 1-11')),
  )
  assert.ok(
    reference.slideTypes
      .find((slideType) => slideType.slideType === 'swissCoverSlide')
      ?.rows.some(
        (row) =>
          row.path === 'data.tag' &&
          row.budget.includes('11pt @ 11.81in x 0.67in') &&
          row.budget.includes('2 line(s)'),
      ),
  )
})

test('DeckKit slot reference discloses injectable and placeholder-only asset behavior', () => {
  const jsonResult = runNode([
    skillPath('scripts/cli/deckkits/slots.mjs'),
    '--deckkit',
    'cartesian',
    '--format',
    'json',
  ])
  const reference = JSON.parse(jsonResult.stdout)
  const imageStats = reference.slideTypes.find(
    (slide) => slide.slideType === 'cartesianImageStatsSlide',
  )

  assert.deepEqual(imageStats.assetSlots, [
    {
      id: 'image.editorial',
      kind: 'image',
      acceptsAsset: true,
      fitPolicy: 'contain',
      placeholderBehavior: 'crossed image shell fallback',
      labelSlot: 'data.imageLabel',
      note: 'Bind a registered local image through content.json imageSlots and assets_manifest.json. The image is contained inside the editorial frame; omitting the binding preserves the editable crossed placeholder shell.',
    },
  ])

  const markdownResult = runNode([
    skillPath('scripts/cli/deckkits/slots.mjs'),
    '--deckkit',
    'cartesian',
  ])
  assert.match(
    markdownResult.stdout,
    /## cartesianImageStatsSlide[\s\S]*### Asset slots[\s\S]*`image\.editorial`[\s\S]*\| yes \| crossed image shell fallback \|/,
  )

  const broadsideResult = runNode([
    skillPath('scripts/cli/deckkits/slots.mjs'),
    '--deckkit',
    'broadside',
    '--format',
    'json',
  ])
  const broadside = JSON.parse(broadsideResult.stdout)
  assert.equal(
    broadside.slideTypes.find((slide) => slide.slideType === 'broadsideSplitSlide').assetSlots[0]
      .acceptsAsset,
    false,
  )
})

test('DeckKit slot reference and consistency cover mckinsey-blue 2.0 named cover slots', () => {
  const referenceResult = runNode([
    skillPath('scripts/cli/deckkits/slots.mjs'),
    '--deckkit',
    'mckinsey-blue',
    '--format',
    'json',
  ])
  const reference = JSON.parse(referenceResult.stdout)
  const coverRows = reference.slideTypes.find((slide) => slide.slideType === 'mckCoverSlide').rows
  const rowByPath = new Map(coverRows.map((row) => [row.path, row]))

  for (const key of [
    'data.details[].label',
    'data.details[].value',
    'data.lossMetric.value2',
    'data.lossMetric.sub2',
    'data.lossMetric.note',
  ]) {
    assert.ok(rowByPath.get(key)?.budget.includes('pt @'), key)
    assert.ok(rowByPath.get(key)?.budget.includes('CJK'), key)
  }
  assert.equal(rowByPath.has('data.details[][0]'), false)

  const consistencyResult = runNode([
    skillPath('scripts/cli/deckkits/slot-consistency.mjs'),
    '--deckkit',
    'mckinsey-blue',
    '--json',
  ])
  const consistency = JSON.parse(consistencyResult.stdout)
  const coverConsistency = consistency.results[0].slideTypes.find(
    (slide) => slide.slideType === 'mckCoverSlide',
  )

  assert.equal(coverConsistency.status, 'ok')
  assert.deepEqual(coverConsistency.ghosts, [])
  assert.deepEqual(coverConsistency.dynamics, [])
})
