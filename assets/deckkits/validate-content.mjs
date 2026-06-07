#!/usr/bin/env node
// validate-content.mjs — schema + DeckKit density 校验入口
// 用法: node validate-content.mjs content.json --deckkit consulting-dark
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const argValue = (name, fallback = '') => {
  const idx = process.argv.indexOf(name)
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback
}

const contentPath = process.argv[2]
if (!contentPath) {
  console.error('Usage: node validate-content.mjs <content.json> --deckkit <deckkit-id>')
  process.exit(1)
}

const deckkitId = argValue('--deckkit', '')
const ignoreSoft = process.argv.includes('--ignore-soft-limits')

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

const catalog = readJson(join(__dirname, 'catalog.json'))
const contentSchema = readJson(join(__dirname, 'schemas', 'content.schema.json'))

let content
try {
  if (contentPath.endsWith('.mjs')) {
    const mod = await import(join(process.cwd(), contentPath))
    content = mod.default ?? mod
  } else {
    content = readJson(contentPath)
  }
} catch (e) {
  console.error(`[error] Failed to load content: ${e.message}`)
  process.exit(1)
}

const errors = []
const warnings = []

// --- Structure validation ---
if (!content || typeof content !== 'object') {
  errors.push({ type: 'structure', message: 'Content must be an object' })
}
if (!content.meta || typeof content.meta !== 'object') {
  errors.push({ type: 'structure', message: 'Missing or invalid "meta" field' })
}
if (!Array.isArray(content.slides) || content.slides.length === 0) {
  errors.push({ type: 'structure', message: '"slides" must be a non-empty array' })
}

if (errors.length > 0) {
  output(errors, warnings)
  process.exit(1)
}

// --- Meta validation ---
const deckkit = content.meta.deckkit
if (!deckkit) {
  errors.push({ type: 'meta', message: 'meta.deckkit is required' })
}

const entry = catalog.entries.find((e) => e.id === (deckkitId || deckkit))
if (!entry) {
  errors.push({
    type: 'meta',
    message: `DeckKit "${deckkitId || deckkit}" not found in catalog. Available: ${catalog.entries.map((e) => e.id).join(', ')}`,
  })
}

if (deckkitId && deckkit && deckkitId !== deckkit) {
  errors.push({
    type: 'meta',
    message: `content.meta.deckkit "${deckkit}" does not match --deckkit "${deckkitId}". Use the same DeckKit id for both.`,
  })
}

// --- Slide type validation ---
const supportedTypes =
  entry?.supportedSlideTypes ?? contentSchema.properties.slides.items.properties.type.enum
const slideSchemas = {}

for (const t of supportedTypes) {
  try {
    slideSchemas[t] = readJson(join(__dirname, 'schemas', `${t}.schema.json`))
  } catch {
    // Schema not yet written for this type — skip detailed validation
  }
}

const density = entry?.density ?? {}
const soft = density.soft ?? {}
const hard = density.hard ?? {}

for (let i = 0; i < content.slides.length; i++) {
  const slide = content.slides[i]
  const prefix = `slides[${i}]`

  if (!slide.type) {
    errors.push({ type: 'slide', message: `${prefix}: missing "type"` })
    continue
  }
  if (!supportedTypes.includes(slide.type)) {
    errors.push({
      type: 'slide',
      message: `${prefix}: unknown type "${slide.type}". Supported: ${supportedTypes.join(', ')}`,
    })
    continue
  }
  if (!slide.data || typeof slide.data !== 'object') {
    errors.push({ type: 'slide', message: `${prefix}: missing or invalid "data"` })
    continue
  }

  const schema = slideSchemas[slide.type]
  if (schema) {
    // Check required fields
    for (const req of schema.required ?? []) {
      if (!(req in slide.data)) {
        errors.push({ type: 'field', message: `${prefix}.data: missing required field "${req}"` })
      }
    }
    // Check additionalProperties
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(slide.data)) {
        if (!(key in schema.properties)) {
          errors.push({ type: 'field', message: `${prefix}.data: unknown field "${key}"` })
        }
      }
    }
  }

  // --- Density checks ---
  const data = slide.data
  checkDensity(prefix, 'title', data.title, soft.titleMaxChars, hard.titleMaxChars)
  checkArrayDensity(prefix, 'kpis/items', data.kpis ?? data.items, soft.kpisMax, hard.kpisMax)
  checkArrayDensity(prefix, 'cards', data.cards, soft.cardsMax, hard.cardsMax)
  checkArrayDensity(prefix, 'steps', data.steps, soft.timelineStepsMax, hard.timelineStepsMax)
  checkArrayDensity(
    prefix,
    'rows',
    data.rows ?? data.tableRows,
    soft.profileRowsMax,
    hard.profileRowsMax,
  )

  // Check bullets per card (supports both object {items} and tuple [,,, items])
  if (Array.isArray(data.cards)) {
    for (let j = 0; j < data.cards.length; j++) {
      const card = data.cards[j]
      const items = Array.isArray(card) ? card[3] : card?.items
      if (Array.isArray(items)) {
        checkArrayDensity(
          `${prefix}.cards[${j}]`,
          'items',
          items,
          soft.bulletsPerCardMax,
          hard.bulletsPerCardMax,
        )
      }
    }
  }
}

function checkDensity(prefix, field, value, softLimit, hardLimit) {
  if (typeof value !== 'string') return
  const len = value.length
  if (hardLimit && len > hardLimit) {
    errors.push({
      type: 'density',
      message: `${prefix}.data.${field}: ${len} chars exceeds hard limit ${hardLimit}`,
    })
  } else if (softLimit && len > softLimit && !ignoreSoft) {
    warnings.push({
      type: 'density',
      message: `${prefix}.data.${field}: ${len} chars exceeds soft limit ${softLimit}. Consider shortening or splitting.`,
    })
  }
}

function checkArrayDensity(prefix, field, arr, softLimit, hardLimit) {
  if (!Array.isArray(arr)) return
  const len = arr.length
  if (hardLimit && len > hardLimit) {
    errors.push({
      type: 'density',
      message: `${prefix}.data.${field}: ${len} items exceeds hard limit ${hardLimit}`,
    })
  } else if (softLimit && len > softLimit && !ignoreSoft) {
    warnings.push({
      type: 'density',
      message: `${prefix}.data.${field}: ${len} items exceeds soft limit ${softLimit}. Consider splitting pages.`,
    })
  }
}

output(errors, warnings)
if (errors.length > 0) process.exit(1)

function output(errors, warnings) {
  const result = { errors, warnings, valid: errors.length === 0 }
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } else {
    for (const e of errors) console.error(`[error] ${e.message}`)
    for (const w of warnings) console.error(`[warn]  ${w.message}`)
    if (result.valid)
      console.log(warnings.length > 0 ? `Valid with ${warnings.length} warning(s).` : 'Valid.')
    else console.log(`Failed: ${errors.length} error(s).`)
  }
}
