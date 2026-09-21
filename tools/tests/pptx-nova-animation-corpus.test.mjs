import assert from 'node:assert/strict'
import test from 'node:test'
import { validateContent } from '../../pptx-nova/assets/deckkits/core-primitives.kit.mjs'
import { inspectAnimationCorpus } from '../../pptx-nova/assets/deckkits/animation-corpus.mjs'
import { createDeck } from '../../pptx-nova/assets/deckkits/cartesian.kit.mjs'
import { composeChoreography } from '../../pptx-nova/scripts/lib/animation-choreography.mjs'

function fixture() {
  const slides = Array.from({ length: 8 }, () => ({
    type: 'cartesianAgendaSlide',
    data: {
      label: 'Animation',
      title: '逐段淡入',
      body: '点击三次，观察逐段进入。',
      textLayout: 'paragraphs',
      items: ['观察触发', '观察顺序', '观察终态'].map((text) => ({ text })),
    },
  }))
  const animationCases = slides.map((_, i) => ({
    id: `fade-${i}`,
    kind: 'animation',
    effect: 'fade',
    feature: '逐段淡入',
    expectedPlayback: '点击三次，观察逐段进入。',
    slides: [i],
  }))
  const content = {
    meta: { deckkit: 'cartesian', deckProfile: 'animation-corpus', animationCases },
    slides,
  }
  const choreography = {
    schemaVersion: 'pptx-patch/v1',
    ops: slides.map((_, slide) => ({
      op: 'set-slide-animations',
      slide,
      animations: [
        {
          target: { shape: { name: `S${slide}_AgendaParagraphs` } },
          effect: 'fade',
          build: 'by-paragraph',
        },
      ],
    })),
  }
  const patch = composeChoreography({
    basePatch: createDeck(content).patch,
    choreography,
    slideCount: slides.length,
  })
  return { content, patch }
}

test('only declared animation cases receive corpus diversity treatment; normal decks retain their rules', () => {
  const { content, patch } = fixture()
  assert.equal(validateContent(content, { mode: 'delivery' }).valid, true)
  assert.deepEqual(inspectAnimationCorpus(content, patch).errors, [])
  delete content.meta.deckProfile
  delete content.meta.animationCases
  assert.ok(
    validateContent(content, { mode: 'delivery' }).errors.some((e) => e.type === 'diversity'),
  )
})

test('a profile label, empty declarations, hidden descriptions and missing effects cannot certify a corpus', () => {
  for (const mutate of [
    (c) => {
      c.meta.animationCases = []
    },
    (c) => {
      delete c.meta.animationCases[0].expectedPlayback
    },
    (c) => {
      c.meta.animationCases[0].feature = 'not present on a slide'
    },
    (c) => {
      c.meta.animationCases[0].slides = [99]
    },
    (c) => {
      c.meta.animationCases[0].effect = 'spin'
    },
  ]) {
    const { content, patch } = fixture()
    mutate(content)
    assert.ok(inspectAnimationCorpus(content, patch).errors.length > 0)
  }
  const { content, patch } = fixture()
  assert.ok(
    inspectAnimationCorpus(content, {
      ...patch,
      ops: patch.ops.filter((op) => op.op !== 'set-slide-animations'),
    }).errors.length > 0,
  )
  content.meta.animationCases = content.meta.animationCases.slice(0, 1)
  assert.ok(
    validateContent(content, { mode: 'delivery' }).errors.some((e) => e.type === 'diversity'),
  )
})

test('Morph cases require adjacent pages and actual explicit pairing', () => {
  const { content, patch } = fixture()
  content.meta.animationCases = [
    {
      id: 'morph',
      kind: 'morph',
      morphMode: 'by-object',
      feature: '逐段淡入',
      expectedPlayback: '点击三次，观察逐段进入。',
      slides: [0, 1],
    },
  ]
  patch.ops.push({ op: 'set-slide-transition', slide: 1, kind: 'morph', morphMode: 'by-object' })
  assert.ok(
    inspectAnimationCorpus(content, patch).errors.some(
      (e) => e.code === 'corpus.morphPair.missing',
    ),
  )
  for (const slide of [0, 1])
    patch.ops.push({ op: 'set-shape', slide, shape: { name: `S${slide}_Title` }, name: '!!Title' })
  assert.deepEqual(inspectAnimationCorpus(content, patch).errors, [])
  content.meta.animationCases[0].slides = [0, 2]
  assert.ok(inspectAnimationCorpus(content, patch).errors.length > 0)
})
