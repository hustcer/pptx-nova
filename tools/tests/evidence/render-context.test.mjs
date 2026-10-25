import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  ensureRenderContext,
  renderContextForDate,
} from '../../../pptx-nova/scripts/lib/review/render-context.mjs'

test('workflow resume preserves the original date across calendar changes', () => {
  const run = mkdtempSync(join(tmpdir(), 'nova-render-context-'))
  const firstEnv = {}
  const first = ensureRenderContext(run, { env: firstEnv, now: new Date(2026, 9, 13, 23, 59) })
  const resumedEnv = {}
  assert.deepEqual(ensureRenderContext(run, { env: resumedEnv, now: new Date(2026, 9, 14) }), first)
  assert.equal(first.fieldDate, '2026-10-13')
  assert.equal(resumedEnv.XDOC_FIELD_DATE, first.fieldDate)
  const bytes = readFileSync(join(run, 'render-context.json'))
  assert.throws(
    () => ensureRenderContext(run, { env: { XDOC_FIELD_DATE: '2026-10-14' } }),
    /conflicts/,
  )
  assert.deepEqual(readFileSync(join(run, 'render-context.json')), bytes)
})

test('render context accepts leap dates and refuses malformed or impossible dates', () => {
  assert.equal(renderContextForDate('2024-02-29').fieldDate, '2024-02-29')
  for (const date of ['2026-02-29', '2026-02-30', '0000-01-01', '2026-1-1', 'today']) {
    assert.throws(() => renderContextForDate(date), /valid Gregorian/)
  }
})
