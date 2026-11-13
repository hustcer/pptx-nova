import assert from 'node:assert/strict'
import test from 'node:test'
import {
  checkDesignReadback,
  designHash,
} from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'

const readback = (facts) => {
  const patch = {
    schemaVersion: 'pptx-patch/v1',
    ops: [
      { op: 'add-slide' },
      { op: 'add-text-box', slide: 0, name: 'Body', x: '1in', y: '1in', w: '5in', h: '3in' },
      { op: 'set-text-frame', slide: 0, shape: { name: 'Body' }, text: 'First\n\nSecond' },
    ],
  }
  const plan = {
    patchHash: designHash(patch),
    objects: [{ slide: 0, name: 'Body', kind: 'add-text-box', frame: [1, 1, 5, 3] }],
  }
  const inspect = {
    slides: [
      {
        index: 0,
        shapes: [
          {
            name: 'Body',
            fontFacts: facts,
            bbox: { xEmu: 914400, yEmu: 914400, wEmu: 4572000, hEmu: 2743200 },
          },
        ],
      },
    ],
  }
  return checkDesignReadback(plan, patch, inspect)
}
test('readback retains empty paragraph gaps without accepting omitted or reordered nonblank content', () => {
  const fact = (paragraph, text) => ({ scope: 'textRun', paragraph, text })
  assert.equal(readback([fact(0, 'First'), fact(2, 'Second')]).status, 'pass')
  for (const facts of [
    [fact(0, 'First'), fact(1, 'Second')],
    [fact(0, 'First')],
    [fact(0, 'Second'), fact(2, 'First')],
  ])
    assert.equal(readback(facts).status, 'fail')
})
