import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { runNode, skillPath, writeJson } from '../helpers/common.mjs'
import { swissColumnContent } from '../helpers/runner-fixtures.mjs'

// These cases also support agent behavioral evaluation. This deterministic test
// covers only the serialized content -> patch boundary, not LLM instruction following.
const cases = JSON.parse(
  readFileSync(new URL('../fixtures/source-content/cases.json', import.meta.url), 'utf8'),
)

function build(dir, name, text) {
  const content = swissColumnContent()
  if (text !== undefined) content.slides[0].data.items[0].body = text
  const input = join(dir, `${name}.json`)
  const output = join(dir, `${name}.patch.json`)
  writeJson(input, content)
  runNode(
    [
      skillPath('scripts/cli/create/build.mjs'),
      '--deckkit',
      'swiss-grid',
      input,
      '--output',
      output,
    ],
    { cwd: dir },
  )
  return JSON.parse(readFileSync(output, 'utf8'))
}

// Compare the complete executable patch, allowing only the intended body string
// to vary. Every fixture uses one paragraph, so styling operations stay identical.
function controlProjection(patch, text) {
  return {
    ...patch,
    ops: patch.ops.map((op) =>
      op.op === 'set-text-frame' && op.text === text ? { ...op, text: '<source body>' } : op,
    ),
  }
}

for (const fixture of cases) {
  test(`source text remains literal patch data: ${fixture.id}`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'pptx-nova-source-boundary-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const baselineText = 'Reference source material.'
    const baseline = build(dir, 'baseline', baselineText)
    const patch = build(dir, fixture.id, fixture.sourceText)
    const literalOps = patch.ops.filter(
      (op) => op.op === 'set-text-frame' && op.text === fixture.sourceText,
    )
    assert.equal(literalOps.length, 1, 'Source text must survive as one literal string')
    assert.deepEqual(
      controlProjection(patch, fixture.sourceText),
      controlProjection(baseline, baselineText),
      'Source text must not add operations, change destinations, or become executable properties',
    )
    assert.equal(existsSync(join(dir, 'injection-marker')), false)
  })
}
