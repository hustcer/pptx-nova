#!/usr/bin/env node
// Maintainer-only projection writer. User builds read the bundled JSON directly.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import {
  loadDesignContract,
  resolveDesignSlot,
} from '../pptx-nova/assets/deckkits/design-contract.mjs'

const root = fileURLToPath(new URL('../pptx-nova/assets/deckkits/', import.meta.url))
const args = process.argv.slice(2)
const check = args.includes('--check')
const id = args.find((v) => !v.startsWith('--')) ?? 'biennale-yellow'
if (args.includes('--help')) {
  console.log('Usage: node tools/generate-pptx-design-projections.mjs [deckkit-id] [--check]')
  process.exit(0)
}
const design = loadDesignContract(id)
if (!design) throw new Error(`${id} has no registered design contract`)
let stale = 0
function output(path, data) {
  // Repository formatters may compact arrays; only semantic drift is stale.
  if (isDeepStrictEqual(JSON.parse(readFileSync(path, 'utf8')), data)) return
  const text = JSON.stringify(data, null, 2) + '\n'
  if (check) {
    console.error(`Stale projection: ${path}`)
    stale++
    return
  }
  writeFileSync(path, text)
}
for (const [type, layout] of Object.entries(design.legacyLayouts)) {
  const path = resolve(root, 'schemas', id, `${type}.schema.json`)
  const schema = JSON.parse(readFileSync(path, 'utf8'))
  const walk = (node) => {
    if (node['x-designSlot']) {
      const name = node['x-designSlot']
      const slot = resolveDesignSlot(design, type, name.replace('{i}', '0'))
      const all = layout.slots[name].frames
      const widthIn = Math.min(...all.map((f) => f[2]))
      const heightIn = Math.min(...all.map((f) => f[3]))
      const lineHeight = slot.paragraph?.lineSpacing ?? 1.2
      node['x-slotBudget'] = {
        fontPt: slot.font.sizePt,
        widthIn,
        heightIn,
        lineHeight,
        maxLines: Math.max(1, Math.floor((heightIn * 72) / (slot.font.sizePt * lineHeight))),
      }
    }
    for (const child of Object.values(node.properties ?? {})) walk(child)
    if (node.items && !Array.isArray(node.items)) walk(node.items)
  }
  walk(schema)
  schema['x-generatedBudgetsFrom'] = `${id}/design.json`
  output(path, schema)
}
// Refurbishment uses the same role tokens as creation. Preserve unrelated catalog formatting.
const path = resolve(root, 'catalog.json')
const raw = readFileSync(path, 'utf8')
const catalog = JSON.parse(raw)
const entry = catalog.entries.find((e) => e.id === id)
const before = JSON.stringify(entry)
if (design.editorial) {
  const types = Object.keys(design.editorial.families)
  entry.supportedSlideTypes = types
  entry.coverage.slideTypes = types
  const groups = { anchor: [], judgment: [], evidence: [] }
  for (const [type, family] of Object.entries(design.editorial.families)) {
    const schema = JSON.parse(
      readFileSync(resolve(root, 'schemas', id, `${type}.schema.json`), 'utf8'),
    )
    entry.layoutContract.slideTypes[type] = {
      requiredSlots: schema.required.map((key) => `data.${key}`),
      allowedLayoutIds: ['auto', ...Object.keys(family.variants)],
    }
    const group =
      family.role === 'cover'
        ? 'anchor'
        : ['summary', 'decision'].includes(family.role)
          ? 'judgment'
          : 'evidence'
    groups[group].push(type)
  }
  entry.layoutContract.slideTypes = Object.fromEntries(
    types.map((type) => [type, entry.layoutContract.slideTypes[type]]),
  )
  entry.visualGrammar.slideRhythm = groups
  entry.diversityGate.groups = groups
}
entry.version = design.version
entry.qualityProfile.minFontPt = design.rules.find((r) => r.check === 'font-floor').minPt
entry.qualityProfile.labelFontPt = entry.qualityProfile.minFontPt
entry.qualityProfile.sourceFontPt = entry.qualityProfile.minFontPt
entry.qualityProfile.baseline = `Contract-driven typography with a ${entry.qualityProfile.minFontPt}pt floor; actual render review remains required.`
// Creation-only candidate designs do not implicitly claim a refurbishment route.
if (entry.refurbishProfile?.fallback) {
  for (const [role, token] of Object.entries(design.refurbish.palette)) {
    entry.refurbishProfile.fallback.palette[role] = design.colors[token]
  }
  for (const [role, font] of Object.entries(design.refurbish.fonts)) {
    entry.refurbishProfile.fallback.fonts[role] =
      role === 'cjk' ? design.fonts[font].eastAsian : design.fonts[font].latin
  }
}
if (JSON.stringify(entry) !== before) {
  if (check) {
    console.error('Stale catalog design projection')
    stale++
  } else {
    const marker = raw.indexOf(`"id": "${id}"`)
    const start = raw.lastIndexOf('    {', marker)
    let depth = 0,
      quote = false,
      escape = false,
      end = start
    for (let i = start; i < raw.length; i++) {
      const c = raw[i]
      if (quote) {
        if (escape) escape = false
        else if (c === '\\') escape = true
        else if (c === '"') quote = false
        continue
      }
      if (c === '"') quote = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        end = i + 1
        break
      }
    }
    writeFileSync(
      path,
      raw.slice(0, start) +
        JSON.stringify(entry, null, 2)
          .split('\n')
          .map((l) => '    ' + l)
          .join('\n') +
        raw.slice(end),
    )
  }
}
console.log(`Design projections: ${stale ? 'FAIL' : 'PASS'} (${id})`)
process.exitCode = stale ? 1 : 0
