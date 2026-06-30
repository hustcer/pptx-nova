#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { createDeck } from '../coral.kit.mjs'

const input = process.argv[2]
if (!input) {
  console.error('Usage: coral-build.mjs <content.json>')
  process.exit(1)
}

const content = JSON.parse(readFileSync(input, 'utf8'))
const { patch, warnings } = createDeck(content)
if (warnings.length > 0) {
  for (const warning of warnings) console.warn(warning)
}
process.stdout.write(JSON.stringify(patch, null, 2))
