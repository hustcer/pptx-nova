import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { verifyDiffEvidence } from '../../pptx-nova/scripts/lib/diff-evidence.mjs'

test('diff evidence rejects modified artifacts, replaced inputs, and unrelated summaries', () => {
  const root = mkdtempSync(join(tmpdir(), 'nova-diff-evidence-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const path = join(root, 'full.json')
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
  writeFileSync(source, 'source')
  writeFileSync(candidate, 'candidate')
  const full = {
    schemaVersion: 'pptx-diff/v1',
    status: 'success',
    detail: 'full',
    summary: { reliableChanges: 1 },
    inputBinding: { algorithm: 'sha256', baseline: hash('source'), target: hash('candidate') },
  }
  writeFileSync(path, JSON.stringify(full))
  const summary = {
    ...full,
    detail: 'summary',
    fullEvidenceAvailable: true,
    fullEvidence: { path, sha256: hash(readFileSync(path)) },
  }
  assert.deepEqual(verifyDiffEvidence(summary, source, candidate), full)
  assert.throws(
    () => verifyDiffEvidence({ ...summary, summary: { reliableChanges: 0 } }, source, candidate),
    /not bound/,
  )
  writeFileSync(candidate, 'different candidate')
  assert.throws(() => verifyDiffEvidence(summary, source, candidate), /not bound/)
  writeFileSync(path, 'changed evidence')
  assert.throws(() => verifyDiffEvidence(summary, source, candidate), /SHA-256 mismatch/)
})
