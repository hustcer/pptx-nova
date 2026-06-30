#!/usr/bin/env node
// mckinsey-blue-build.mjs - content -> McKinsey-blue DeckKit -> patch
import { loadContent, validateContent } from '../core-primitives.kit.mjs'
import { createDeck } from '../mckinsey-blue.kit.mjs'

const deckkitId = 'mckinsey-blue'
const content = await loadContent(process.argv[2] ?? 'mckinsey-blue-loyalty-content.json')

const validation = validateContent(content, { deckkit: deckkitId })
const { errors, warnings: valWarnings, fitDiagnostics } = validation
const blockingFitDiagnostics = fitDiagnostics.filter((d) => d.blocking === true)
if (errors.length > 0 || blockingFitDiagnostics.length > 0) {
  for (const e of errors) console.error(`[error] ${e.message}`)
  for (const d of blockingFitDiagnostics) console.error(`[fit-error:${d.code}] ${d.message}`)
  process.exit(1)
}
for (const w of valWarnings) console.error(`[warn:${w.diagnostic?.code ?? w.type}] ${w.message}`)

const { patch, warnings } = createDeck(content)
for (const w of warnings) console.error(`[content-warning] ${w}`)
process.stdout.write(JSON.stringify(patch, null, 2))
