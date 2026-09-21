import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { createDeck } from '../../pptx-nova/assets/deckkits/cartesian.kit.mjs'
import { validateContent } from '../../pptx-nova/assets/deckkits/core-primitives.kit.mjs'

const assetRoot = new URL('../../pptx-nova/assets/deckkits/', import.meta.url)
const readJson = (path) => JSON.parse(readFileSync(new URL(path, assetRoot), 'utf8'))

function fontSizes(value, path = '$') {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`
    if (key === 'font' && child?.size) return [{ path: childPath, size: parseFloat(child.size) }]
    if (key === 'fontPt') return [{ path: childPath, size: child }]
    return fontSizes(child, childPath)
  })
}

test('Cartesian stock text and chart legends meet the canonical 10 pt readability floor', () => {
  const content = readJson('examples/cartesian-content.json')
  const { patch } = createDeck(content)
  const fonts = fontSizes(patch)
  assert.ok(fonts.length > 40, 'exercise all stock slide types')
  assert.deepEqual(
    fonts.filter(({ size }) => size < 10),
    [],
  )
})

test('Cartesian slot budgets describe readable fonts for all ten slide types', () => {
  const names = readdirSync(new URL('schemas/cartesian/', assetRoot)).filter((name) =>
    name.endsWith('.json'),
  )
  assert.equal(names.length, 10)
  const fonts = names.flatMap((name) => fontSizes(readJson(`schemas/cartesian/${name}`), name))
  assert.ok(fonts.length > 30)
  assert.deepEqual(
    fonts.filter(({ size }) => size < 10),
    [],
  )
})

for (const count of [3, 5]) {
  test(`Cartesian native paragraph Agenda keeps ${count} Chinese mixed-level items in one animation target`, () => {
    const content = {
      meta: { deckkit: 'cartesian' },
      slides: [
        {
          type: 'cartesianAgendaSlide',
          data: {
            label: 'Animation / By level',
            title: '分层进入',
            body: '逐次点击，观察段落层级。',
            textLayout: 'paragraphs',
            items: Array.from({ length: count }, (_, i) => ({
              text: `第${i + 1}段：验证段落动画`,
              level: i % 2,
            })),
          },
        },
      ],
    }
    assert.equal(validateContent(content, { mode: 'delivery' }).errors.length, 0)
    const { patch } = createDeck(content)
    const text = patch.ops.find(
      (op) => op.op === 'set-text-frame' && op.shape?.name === 'S0_AgendaParagraphs' && op.text,
    )
    assert.equal(text?.text.split('\n').length, count)
    const paragraphs = patch.ops.filter(
      (op) => op.op === 'set-paragraph' && op.shape?.name === 'S0_AgendaParagraphs',
    )
    assert.deepEqual(
      paragraphs.filter((op) => 'level' in op.format).map((op) => op.format.level),
      content.slides[0].data.items.map((item) => item.level),
    )
    assert.equal(
      patch.ops.some((op) => /^S0_AgendaRule[0-9]/.test(op.name ?? '')),
      false,
    )
    assert.equal(
      patch.ops.some((op) => op.name === 'S0_AgendaRule'),
      true,
    )
  })
}
