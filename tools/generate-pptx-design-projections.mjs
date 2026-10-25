#!/usr/bin/env node
// Maintainer-only projection writer. User builds read the bundled JSON directly.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { loadDesignContract } from '../pptx-nova/assets/deckkits/shared/design-contract.mjs'

import { biennaleProjectedBudgets } from '../pptx-nova/assets/deckkits/biennale-yellow/layouts.mjs'
import { registeredDesignFamily } from '../pptx-nova/assets/deckkits/shared/design-family-registry.mjs'

const root = fileURLToPath(new URL('../pptx-nova/assets/deckkits/', import.meta.url))
const args = process.argv.slice(2)
const check = args.includes('--check')
const id = args.find((v) => !v.startsWith('--')) ?? 'biennale-yellow'
if (args.includes('--help')) {
  console.log('Usage: node tools/generate-pptx-design-projections.mjs [deckkit-id] [--check]')
  process.exit(0)
}
const design = loadDesignContract(id)
const registered = registeredDesignFamily(design)
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
if (design.biennale) {
  for (const [type, family] of Object.entries(design.biennale.families)) {
    const path = resolve(root, id, 'schemas', type + '.schema.json')
    const schema = JSON.parse(readFileSync(path, 'utf8'))
    for (const [field, budget] of Object.entries(biennaleProjectedBudgets(design, family)))
      schema.properties[field]['x-slotBudget'] = budget
    schema['x-generatedBudgetsFrom'] = id + '/design.json'
    schema['x-capacityCheck'] = 'resolve-biennale-components/v1'
    output(path, schema)
  }
}
if (registered) {
  for (const [type, family] of Object.entries(design[registered.key].families)) {
    const path = resolve(root, id, 'schemas', type + '.schema.json')
    const schema = JSON.parse(readFileSync(path, 'utf8'))
    for (const [field, [minItems, maxItems]] of Object.entries(
      registered.projectedCapacities?.(design, family) ?? {},
    )) {
      let node = schema
      for (const key of field.replaceAll('[]', '.[]').split('.'))
        node = key === '[]' ? node.items : node.properties?.[key]
      if (node?.type !== 'array')
        throw new Error(`${type}.${field}: capacity needs an array schema`)
      Object.assign(node, { minItems, maxItems })
    }
    for (const [field, budget] of Object.entries(registered.projectedBudgets(design, family))) {
      let node = schema
      for (const key of field.replaceAll('[]', '.[]').split('.'))
        node = key === '[]' ? node.items : node.properties?.[key]
      if (!node) throw new Error(`${type}.${field}: projected field has no schema`)
      node['x-slotBudget'] = budget
    }
    output(path, schema)
  }
}
// Refurbishment uses the same role tokens as creation. Preserve unrelated catalog formatting.
const path = resolve(root, 'catalog.json')
const raw = readFileSync(path, 'utf8')
const catalog = JSON.parse(raw)
const entry = catalog.entries.find((e) => e.id === id)
const before = JSON.stringify(entry)
if (registered || design.editorial || design.strategy || design.annual || design.biennale) {
  const families = (
    registered
      ? design[registered.key]
      : (design.editorial ?? design.strategy ?? design.annual ?? design.biennale)
  ).families
  const types = [...Object.keys(families), ...(design.biennale ? [design.evidence.slideType] : [])]
  entry.supportedSlideTypes = types
  entry.coverage.slideTypes = types
  const groups = registered?.groups
    ? Object.fromEntries(Object.keys(registered.groups).map((key) => [key, []]))
    : { anchor: [], judgment: [], evidence: [] }
  for (const [type, family] of Object.entries(families)) {
    const schema = JSON.parse(
      readFileSync(resolve(root, id, 'schemas', `${type}.schema.json`), 'utf8'),
    )
    entry.layoutContract.slideTypes[type] = {
      ...entry.layoutContract.slideTypes[type],
      requiredSlots: schema.required.map((key) => `data.${key}`),
      allowedLayoutIds: ['auto', ...Object.keys(family.variants)],
    }
    const group = registered?.groups
      ? Object.entries(registered.groups).find(([, roles]) => roles.includes(family.role))?.[0]
      : ['cover', 'section', 'closing', 'chapter', 'colophon'].includes(family.role)
        ? 'anchor'
        : ['summary', 'decision'].includes(family.role)
          ? 'judgment'
          : 'evidence'
    if (!group) throw new Error(`${type}: registered family has no rhythm group`)
    groups[group].push(type)
  }
  if (design.biennale) {
    const schema = JSON.parse(
      readFileSync(
        resolve(root, id, 'schemas', design.evidence.slideType + '.schema.json'),
        'utf8',
      ),
    )
    entry.layoutContract.slideTypes[design.evidence.slideType] = {
      requiredSlots: schema.required.map((key) => 'data.' + key),
      allowedLayoutIds: ['auto', ...Object.keys(design.evidence.layouts)],
    }
    groups.evidence.push(design.evidence.slideType)
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
if (entry.refurbishProfile?.fallback?.palette) {
  for (const [role, token] of Object.entries(design.refurbish.palette)) {
    entry.refurbishProfile.fallback.palette[role] = design.colors[token]
  }
}
if (entry.refurbishProfile?.fallback?.fonts) {
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
