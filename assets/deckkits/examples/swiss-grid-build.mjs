// swiss-grid-build.mjs - content -> Swiss-grid DeckKit -> patch
import { loadContent, validateContent } from '../core-primitives.kit.mjs'
import { createDeck } from '../swiss-grid.kit.mjs'

const deckkitId = 'swiss-grid'
const content = await loadContent(
  process.argv[2] ?? 'skills/pptx-nova/assets/deckkits/examples/swiss-grid-content.json',
)
const validation = validateContent(content, { deckkit: deckkitId })
if (!validation.valid) {
  console.error(JSON.stringify(validation, null, 2))
  process.exit(1)
}

const { patch, warnings } = createDeck(content)
for (const warning of warnings) console.error(`[warning] ${warning}`)
process.stdout.write(JSON.stringify(patch))
