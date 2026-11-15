import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const root = new URL('../../../pptx-nova/assets/deckkits/', import.meta.url)
const catalog = JSON.parse(readFileSync(new URL('catalog.json', root)))
const inches = (value) => {
  const [, number, unit] = String(value).match(/^(-?[\d.]+)(in|pt|px|emu)$/) ?? []
  assert.ok(unit, `Missing explicit geometry unit: ${value}`)
  return Number(number) / { in: 1, pt: 72, px: 96, emu: 914400 }[unit]
}
const rect = (op) => [op.x, op.y, op.w, op.h].map(inches)

test('all bundled DeckKit default examples keep native tables free of icons', async () => {
  let tablesChecked = 0
  for (const entry of catalog.entries) {
    const content = JSON.parse(readFileSync(new URL(`${entry.id}/examples/content.json`, root)))
    // External photo/QR bindings are unrelated to table-icon defaults.
    for (const slide of content.slides) delete slide.imageSlots
    const { createDeck } = await import(new URL(entry.path, root))
    const built = createDeck(content)
    const patch = built.patch ?? built
    const tables = patch.ops.filter((op) => op.op === 'add-table')
    for (const table of tables) {
      tablesChecked++
      const [x, y, w, h] = rect(table)
      for (const image of patch.ops.filter(
        (op) => op.op === 'add-image' && op.slide === table.slide,
      )) {
        const [imageX, imageY, imageWidth, imageHeight] = rect(image)
        const overlap =
          Math.max(0, Math.min(x + w, imageX + imageWidth) - Math.max(x, imageX)) *
          Math.max(0, Math.min(y + h, imageY + imageHeight) - Math.max(y, imageY))
        assert.ok(
          overlap < imageWidth * imageHeight * 0.5,
          `${entry.id}: ${image.name} occupies default table ${table.name}`,
        )
      }
    }
  }
  assert.ok(tablesChecked >= catalog.entries.length, `Only ${tablesChecked} native tables examined`)
})
