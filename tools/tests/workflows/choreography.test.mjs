import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { composeChoreography } from '../../../pptx-nova/scripts/lib/animation/animation-choreography.mjs'
import {
  checkDesignReadback,
  designHash,
} from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'

const basePatch = {
  schemaVersion: 'pptx-patch/v1',
  ops: [
    { op: 'add-slide', index: 0 },
    { op: 'add-text-box', slide: 0, name: 'S0_Body' },
    { op: 'add-slide', index: 1 },
    { op: 'add-text-box', slide: 1, name: 'S1_Body' },
  ],
}
const compose = (ops) =>
  composeChoreography({
    basePatch,
    choreography: { schemaVersion: 'pptx-patch/v1', ops },
    slideCount: 2,
  })

test('design readback follows chained Morph renames without losing text and geometry checks', () => {
  const base = {
    schemaVersion: 'pptx-patch/v1',
    ops: [
      { op: 'add-slide', index: 0 },
      { op: 'add-text-box', slide: 0, name: 'S0_Title' },
      { op: 'set-text-frame', slide: 0, shape: { name: 'S0_Title' }, text: 'Original title' },
    ],
  }
  const patch = composeChoreography({
    basePatch: base,
    slideCount: 1,
    choreography: {
      schemaVersion: 'pptx-patch/v1',
      ops: [
        { op: 'set-shape', slide: 0, shape: { name: 'S0_Title' }, name: '!!Title' },
        { op: 'set-shape', slide: 0, shape: { name: '!!Title' }, name: '!!Hero' },
      ],
    },
  })
  const plan = {
    patchHash: designHash(patch),
    objects: [{ slide: 0, name: 'S0_Title', kind: 'add-text-box', frame: [1, 1, 4, 2] }],
  }
  const shape = {
    name: '!!Hero',
    bbox: { xEmu: 914400, yEmu: 914400, wEmu: 3657600, hEmu: 1828800 },
    fontFacts: [{ scope: 'textRun', paragraph: 0, text: 'Original title' }],
  }
  const inspect = { slides: [{ index: 0, shapes: [shape] }] }
  assert.equal(checkDesignReadback(plan, patch, inspect).status, 'pass')
  assert.equal(plan.objects[0].name, 'S0_Title', 'the original design identity is immutable')
  const alteredText = structuredClone(inspect)
  alteredText.slides[0].shapes[0].fontFacts[0].text = 'Dropped content'
  assert.equal(checkDesignReadback(plan, patch, alteredText).status, 'fail')
  const alteredGeometry = structuredClone(inspect)
  alteredGeometry.slides[0].shapes[0].bbox.wEmu = 1
  assert.equal(checkDesignReadback(plan, patch, alteredGeometry).status, 'fail')
  assert.equal(
    checkDesignReadback(plan, patch, { slides: [{ index: 0, shapes: [] }] }).status,
    'fail',
  )
})

test('Create refuses a choreography file that its own build would overwrite', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'choreography-path-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const input = join(root, 'patch.json')
  const bytes = JSON.stringify({ schemaVersion: 'pptx-patch/v1', ops: [] })
  writeFileSync(input, bytes)
  writeFileSync(join(root, 'content.json'), JSON.stringify({ meta: { deckkit: 'cartesian' } }))
  writeFileSync(join(root, 'lock.json'), '{}')
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('../../../pptx-nova/scripts/cli/create/run.mjs', import.meta.url)),
      '--content',
      join(root, 'content.json'),
      '--lock',
      join(root, 'lock.json'),
      '--choreography',
      input,
      '--output',
      join(root, 'final.pptx'),
      '--run-dir',
      root,
      '--json',
    ],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 1)
  assert.match(JSON.parse(result.stdout).error.message, /reserved run artifact/)
  assert.equal(readFileSync(input, 'utf8'), bytes)
})

test('Create choreography preserves the DeckKit patch and appends native animation/Morph ops', () => {
  const before = JSON.stringify(basePatch)
  const ops = [
    {
      op: 'set-slide-animations',
      slide: 0,
      animations: [{ shape: { name: 'S0_Body' }, effect: 'fade' }],
    },
    { op: 'set-shape', slide: 0, shape: { name: 'S0_Body' }, name: '!!Body' },
    { op: 'set-shape', slide: 1, shape: { name: 'S1_Body' }, name: '!!Body' },
    { op: 'set-slide-transition', slide: 1, kind: 'morph', morphMode: 'by-object', duration: 900 },
  ]
  assert.deepEqual(compose(ops).ops, [
    ...basePatch.ops,
    { ...ops[0], mode: 'replace' },
    ...ops.slice(1),
  ])
  assert.equal(JSON.stringify(basePatch), before)
  assert.equal(ops[0].mode, undefined, 'composition does not mutate its input')
})

test('Create rejects unknown selectors, duplicate Morph names and arbitrary mutation hooks', () => {
  assert.throws(
    () =>
      compose([
        {
          op: 'set-slide-animations',
          slide: 0,
          animations: [{ shape: { name: 'missing' }, effect: 'fade' }],
        },
      ]),
    /target.*missing/i,
  )
  assert.throws(() => compose([{ op: 'remove-slide', slide: 0 }]), /not supported/)
  assert.throws(
    () =>
      compose([
        { op: 'set-shape', slide: 0, shape: { name: 'S0_Body' }, name: '!!Body', fill: {} },
      ]),
    /only.*Morph/i,
  )
  assert.throws(
    () => compose([{ op: 'set-slide-transition', slide: 0, kind: 'morph' }]),
    /preceding slide/,
  )
  assert.throws(
    () => compose([{ op: 'set-slide-transition', slide: 2, kind: 'fade' }]),
    /slide index/,
  )
  assert.throws(
    () =>
      composeChoreography({
        basePatch,
        choreography: { schemaVersion: 'pptx-patch/v1', ops: [], hook: 'process.exit()' },
        slideCount: 2,
      }),
    /schemaVersion.*ops/,
  )
})
