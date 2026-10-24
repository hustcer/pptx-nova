#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { loadContent } from '../core-primitives.kit.mjs'
import { validateDeckkitContent } from '../validate-deckkit.mjs'
import { createDeck } from '../clear-impact.kit.mjs'
const content = await loadContent(
  process.argv[2] ?? fileURLToPath(new URL('./clear-impact-content.json', import.meta.url)),
)
const validation = validateDeckkitContent(content, { deckkit: 'clear-impact', mode: 'delivery' })
if (!validation.valid) {
  console.error(JSON.stringify(validation.errors))
  process.exit(1)
}
process.stdout.write(JSON.stringify(createDeck(content).patch, null, 2))
