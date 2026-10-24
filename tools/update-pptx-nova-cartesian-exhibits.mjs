#!/usr/bin/env node
// Keep published schemas self-contained; edit the Exhibit schema as the source.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../pptx-nova/assets/deckkits/', import.meta.url)
const read = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'))
const source = read('schemas/cartesian/cartesianExhibitSlide.schema.json')
const design = read('cartesian/design.json')
const variants = design.cartesian.families.cartesianExhibitSlide.variants
let stale = false
const write = process.argv.includes('--write')
for (const type of ['Analytical', 'Comparison', 'Scene', 'Formula']) {
  const name = `cartesian${type}Slide`
  const path = new URL(`schemas/cartesian/${name}.schema.json`, root)
  const schema = { ...source, $id: `pptx-nova-slide/cartesian/${name}` }
  const text = JSON.stringify(schema, null, 2) + '\n'
  if (JSON.stringify(JSON.parse(readFileSync(path, 'utf8'))) !== JSON.stringify(schema)) {
    stale = true
    if (write) writeFileSync(path, text)
    else console.error(`Stale schema: ${fileURLToPath(path)}`)
  }
  if (JSON.stringify(design.cartesian.families[name].variants) !== JSON.stringify(variants)) {
    stale = true
    design.cartesian.families[name].variants = structuredClone(variants)
    if (!write) console.error(`Stale exhibit layouts: ${name}`)
  }
}
if (write)
  writeFileSync(new URL('cartesian/design.json', root), JSON.stringify(design, null, 2) + '\n')
else if (stale) process.exitCode = 1
