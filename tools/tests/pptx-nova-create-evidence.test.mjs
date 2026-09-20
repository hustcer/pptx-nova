import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import {
  fileSha256,
  captureVisualBinding,
  evaluateVisualEvidence,
  REVIEW_CHECKS,
} from '../../pptx-nova/scripts/lib/canonical-visual-evidence.mjs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'create-canonical-'))
  const candidate = join(root, 'candidate.pptx')
  const manifestPath = join(root, 'manifest.json')
  writeFileSync(candidate, 'synthetic test candidate')
  writeFileSync(
    join(root, 'slide.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfXkAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  writeFileSync(join(root, 'candidate.pdf'), 'synthetic test PDF')
  const manifest = {
    schemaVersion: 'pptx-visual-evidence/v1',
    status: 'success',
    policyId: 'pptx-visual-oracle-create/v1',
    subjects: [
      {
        id: 'candidate',
        sha256: fileSha256(candidate),
        byteLength: readFileSync(candidate).length,
        slideCount: 1,
        selectedSlides: [1],
      },
    ],
    checks: [
      'input-integrity',
      'static-layout',
      'pdf-final-layout',
      'pdfium-raster',
      'pixel-diff',
      'ocr-overflow',
      'font-resolution',
      'region-attribution',
      'independent-reference',
      'policy',
    ].map((id, i) => ({
      id,
      required: i < 4 || id === 'policy',
      outcome: i < 4 || id === 'policy' ? 'pass' : 'skipped',
    })),
    findings: [],
    decision: { action: 'proceed', assurance: 'candidate-checks', reasons: [] },
    artifacts: [
      ['slide.png', 'image/png', 1],
      ['candidate.pdf', 'application/pdf', null],
    ].map(([path, mimeType, slide]) => ({
      id: path,
      path,
      mimeType,
      slide,
      subjectId: 'candidate',
      sha256: fileSha256(join(root, path)),
      byteLength: readFileSync(join(root, path)).length,
    })),
  }
  writeFileSync(manifestPath, JSON.stringify(manifest))
  return { root, candidate, manifestPath, manifest }
}

function review(f) {
  const path = join(f.root, 'visual_review.json')
  const result = spawnSync(
    process.execPath,
    [
      resolve('pptx-nova/scripts/pptx-nova-visual-review.mjs'),
      '--output',
      path,
      '--mode',
      'create',
      '--candidate',
      f.candidate,
      '--manifest',
      f.manifestPath,
      '--previews',
      f.root,
      '--slides-reviewed',
      '1',
      ...REVIEW_CHECKS.flatMap((c) => ['--check', `${c}=pass`]),
    ],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
  return path
}

test('create requires a completed review and binds candidate plus exact PDF/PNG evidence', () => {
  const f = fixture()
  const pending = evaluateVisualEvidence(f.manifestPath, { candidate: f.candidate })
  assert.equal(pending.status, 'needs-visual-review')
  assert.equal(pending.deliveryAuthorized, false)
  const path = review(f)
  assert.equal(
    evaluateVisualEvidence(f.manifestPath, { candidate: f.candidate, review: path })
      .deliveryAuthorized,
    true,
  )
  for (const file of [f.candidate, join(f.root, 'slide.png'), join(f.root, 'candidate.pdf')]) {
    const bytes = readFileSync(file)
    writeFileSync(file, 'changed')
    assert.equal(
      evaluateVisualEvidence(f.manifestPath, { candidate: f.candidate, review: path }).status,
      'invalid',
    )
    writeFileSync(file, bytes)
  }
  const failed = JSON.parse(readFileSync(path))
  failed.checks[0].status = 'fail'
  writeFileSync(path, JSON.stringify(failed))
  assert.equal(
    evaluateVisualEvidence(f.manifestPath, { candidate: f.candidate, review: path })
      .deliveryAuthorized,
    false,
  )
})

test('create rejects missing checks, forged regression, incomplete pages and namespace policy drift', () => {
  for (const mutate of [
    (m) => {
      m.policyId = 'pptx-visual-oracle-default/v1'
    },
    (m) => {
      m.decision.assurance = 'same-renderer-regression'
    },
    (m) => {
      m.checks[0].required = false
    },
    (m) => {
      m.subjects[0].slideCount = 2
    },
    (m) => {
      m.artifacts.push(m.artifacts[0])
    },
    (m) => {
      m.findings.push({ disposition: 'observed' })
    },
  ]) {
    const f = fixture()
    mutate(f.manifest)
    writeFileSync(f.manifestPath, JSON.stringify(f.manifest))
    assert.equal(
      evaluateVisualEvidence(f.manifestPath, { candidate: f.candidate }).status,
      'invalid',
    )
  }
})

test('review binding becomes stale after otherwise valid manifest changes', () => {
  const f = fixture()
  const path = review(f)
  f.manifest.decision.reasons.push('new observation')
  writeFileSync(f.manifestPath, JSON.stringify(f.manifest))
  assert.ok(captureVisualBinding(f.manifestPath, f.candidate))
  assert.equal(
    evaluateVisualEvidence(f.manifestPath, { candidate: f.candidate, review: path }).status,
    'invalid',
  )
})
