#!/usr/bin/env node
// roadshow-build.mjs — 胶水入口，读 content → 调 lib → 输出 patch
import { loadContent, validateContent } from '../core-primitives.lib.mjs'
import { createDeck } from '../consulting-dark.lib.mjs'

const libId = 'consulting-dark'
const content = await loadContent(process.argv[2] ?? 'roadshow-content.json')

const { errors, warnings: valWarnings } = validateContent(content, { lib: libId })
if (errors.length > 0) {
  for (const e of errors) console.error(`[error] ${e.message}`)
  process.exit(1)
}
for (const w of valWarnings) console.error(`[warn] ${w.message}`)

const { patch, warnings } = createDeck(content)
for (const w of warnings) console.error(`[content-warning] ${w}`)
process.stdout.write(JSON.stringify(patch, null, 2))
