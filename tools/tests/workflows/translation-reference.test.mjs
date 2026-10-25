import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { skillPath } from '../helpers/common.mjs'
import { markdownShellCommands } from '../helpers/xdoc-contracts.mjs'

test('published translation compare reference enables multipart output for long decks', () => {
  const documents = [
    {
      name: 'translation-mode.md',
      text: readFileSync(skillPath('references/translation-mode.md'), 'utf8'),
    },
  ]

  for (const document of documents) {
    const command = markdownShellCommands(document.text).find(
      (candidate) =>
        candidate.includes('cli/review/compare.mjs') && candidate.includes('--kind translation'),
    )
    assert.ok(command, `${document.name} must publish a translation compare command`)
    assert.match(command, /--slide-count <count>/, document.name)
    assert.match(command, /--compare-chunk-size 20/, document.name)
    assert.match(command, /--fallback-dpi 144/, document.name)
  }

  const translationMode = documents[0].text
  assert.doesNotMatch(translationMode, /must be a single PNG/)
  assert.doesNotMatch(translationMode, /one image\s+contains every slide/)
  assert.match(translationMode, /numbered .*translation-compare/i)
  assert.match(translationMode, /<output-stem>-translation-compare-<MMDDhhmmss>-01\.png/)
  assert.match(
    translationMode,
    /`translation-compare\.png` or numbered `translation-compare-\*\.png` parts/,
  )
})
