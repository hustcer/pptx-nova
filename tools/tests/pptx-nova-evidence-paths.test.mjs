import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { canonicalEvidencePath } from '../../pptx-nova/scripts/lib/evidence-paths.mjs'

test('evidence paths recover producer-cwd relative paths without rebasing them twice', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-evidence-path-'))
  const runDir = join(root, '.pptx-nova', 'translation-run')
  mkdirSync(runDir, { recursive: true })
  const candidate = join(runDir, 'candidate.pptx')
  const gate = join(runDir, 'multi-column-review-gate.json')
  writeFileSync(candidate, 'candidate')
  writeFileSync(gate, '{}')

  const recorded = '.pptx-nova/translation-run/candidate.pptx'
  assert.equal(canonicalEvidencePath(recorded, { artifactPath: gate, cwd: root }), candidate)
})

test('evidence paths still support artifact-relative legacy records', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-evidence-local-'))
  const runDir = join(root, 'run')
  mkdirSync(runDir, { recursive: true })
  const review = join(runDir, 'review.json')
  const png = join(runDir, 'slide-001.png')
  writeFileSync(review, '{}')
  writeFileSync(png, 'png')

  assert.equal(canonicalEvidencePath('slide-001.png', { artifactPath: review, cwd: root }), png)
  assert.equal(canonicalEvidencePath(resolve(png), { artifactPath: review, cwd: root }), png)
})
