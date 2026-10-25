import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { skillPath, skillUrl } from '../helpers/common.mjs'

test('mckinsey-blue 2.0 requires an explicit shared timeframe instead of business defaults', async () => {
  const kit = await import(skillUrl('assets/deckkits/mckinsey-blue/mckinsey-blue.kit.mjs'))
  const source = JSON.parse(
    readFileSync(skillPath('assets/deckkits/mckinsey-blue/examples/content.json'), 'utf8'),
  )
  const content = {
    meta: { deckkit: 'mckinsey-blue', designScope: 'excerpt' },
    slides: [source.slides[5]],
  }
  delete content.slides[0].data.defaultTimeframe
  assert.throws(() => kit.createDeck(content), /missing defaultTimeframe/)
  content.slides[0].data.defaultTimeframe = 'Review after 90 days'
  assert.ok(JSON.stringify(kit.createDeck(content).patch).includes('Review after 90 days'))
})

test('mckinsey-blue 2.0 rejects invalid percentages without clamping or inventing visible bars', async () => {
  const kit = await import(skillUrl('assets/deckkits/mckinsey-blue/mckinsey-blue.kit.mjs'))
  const source = JSON.parse(
    readFileSync(skillPath('assets/deckkits/mckinsey-blue/examples/content.json'), 'utf8'),
  )
  for (const value of [undefined, '62%', 320, -5]) {
    const slide = structuredClone(source.slides[4])
    if (value === undefined) delete slide.data.drivers[0].value
    else slide.data.drivers[0].value = value
    assert.throws(
      () => kit.createDeck({ meta: { deckkit: 'mckinsey-blue' }, slides: [slide] }),
      /value|number|maximum|minimum/,
    )
  }
})
