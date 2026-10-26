import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { designReviewFixture } from '../helpers/design-review-fixtures.mjs'
import {
  recordCreateInputs,
  verifyCreateInputs,
} from '../../../pptx-nova/scripts/lib/create/create-delivery.mjs'
import {
  fileSha256,
  captureVisualBinding,
  evaluateVisualEvidence,
  REVIEW_CHECKS,
} from '../../../pptx-nova/scripts/lib/review/canonical-visual-evidence.mjs'

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

test('Create input binding rejects edited or omitted choreography and a changed DeckKit patch', () => {
  const f = fixture()
  const choreography = join(f.root, 'choreography.json')
  const deckkitPatch = join(f.root, 'deckkit.patch.json')
  writeFileSync(choreography, '{"ops":[]}')
  writeFileSync(deckkitPatch, '{"ops":[{"op":"add-slide"}]}')
  const args = { choreography, output: join(f.root, 'final.pptx') }
  const artifacts = { candidate: f.candidate, deckkitPatch, binding: join(f.root, 'binding.json') }
  writeFileSync(artifacts.binding, JSON.stringify(recordCreateInputs(args, artifacts)))
  verifyCreateInputs(args, artifacts)
  assert.throws(
    () => verifyCreateInputs({ ...args, choreography: '' }, artifacts),
    /inputs.*changed/,
  )
  for (const file of [choreography, deckkitPatch]) {
    const original = readFileSync(file)
    writeFileSync(file, 'changed')
    assert.throws(() => verifyCreateInputs(args, artifacts), /inputs.*changed/)
    writeFileSync(file, original)
  }
})

function review(f) {
  const path = join(f.root, 'visual_review.json')
  const designPath = join(f.root, 'design_review.json')
  writeFileSync(
    designPath,
    JSON.stringify(designReviewFixture(captureVisualBinding(f.manifestPath, f.candidate))),
  )
  const result = spawnSync(
    process.execPath,
    [
      resolve('pptx-nova/scripts/cli/review/visual-review.mjs'),
      '--output',
      path,
      '--mode',
      'create',
      '--design-review',
      designPath,
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
    evaluateVisualEvidence(f.manifestPath, {
      candidate: f.candidate,
      review: path,
      expectedDesignMode: 'read',
    }).deliveryAuthorized,
    true,
  )
  for (const file of [f.candidate, join(f.root, 'slide.png'), join(f.root, 'candidate.pdf')]) {
    const bytes = readFileSync(file)
    writeFileSync(file, 'changed')
    assert.equal(
      evaluateVisualEvidence(f.manifestPath, {
        candidate: f.candidate,
        review: path,
        expectedDesignMode: 'read',
      }).status,
      'invalid',
    )
    writeFileSync(file, bytes)
  }
  const failed = JSON.parse(readFileSync(path))
  failed.checks[0].status = 'fail'
  writeFileSync(path, JSON.stringify(failed))
  assert.equal(
    evaluateVisualEvidence(f.manifestPath, {
      candidate: f.candidate,
      review: path,
      expectedDesignMode: 'read',
    }).deliveryAuthorized,
    false,
  )
})

test('all mechanical visual passes cannot publish without current, substantive design observations', () => {
  const f = fixture()
  const path = review(f)
  const valid = JSON.parse(readFileSync(path))
  for (const change of [
    (r) => {
      delete r.designReview
    },
    (r) => {
      r.designReview.criteria[0].observation = ''
    },
    (r) => {
      r.designReview.criteria[0].verdict = 'fail'
    },
    (r) => {
      r.designReview.candidateSha256 = '0'.repeat(64)
    },
    (r) => {
      r.designReview.unresolvedIssues.push('Empty cover; needs redesign')
    },
  ]) {
    const value = structuredClone(valid)
    change(value)
    writeFileSync(path, JSON.stringify(value))
    const gate = evaluateVisualEvidence(f.manifestPath, {
      candidate: f.candidate,
      review: path,
      expectedDesignMode: 'read',
    })
    assert.equal(gate.deliveryAuthorized, false)
    assert.equal(gate.status, 'invalid')
  }
})

test('canonical Create authorization requires a locked mode in both API and standalone CLI', () => {
  const f = fixture()
  const path = review(f)
  const unbound = evaluateVisualEvidence(f.manifestPath, { candidate: f.candidate, review: path })
  assert.equal(unbound.deliveryAuthorized, false)
  assert.ok(unbound.errors.some((e) => e.includes('deck_lock.artDirection.mode')))
  const lock = join(f.root, 'deck_lock.json')
  const args = [
    resolve('pptx-nova/scripts/cli/review/visual-evidence-gate.mjs'),
    '--manifest',
    f.manifestPath,
    '--candidate',
    f.candidate,
    '--review',
    path,
    '--json',
  ]
  for (const mode of [undefined, null, '', 'invalid', 'persuade', 'read']) {
    writeFileSync(lock, JSON.stringify({ artDirection: { mode } }))
    const result = spawnSync(process.execPath, [...args, '--lock', lock], { encoding: 'utf8' })
    assert.equal(result.status, mode === 'read' ? 0 : 3, result.stderr || result.stdout)
    const gate = JSON.parse(result.stdout)
    assert.equal(gate.deliveryAuthorized, mode === 'read')
    if (mode !== 'read')
      assert.ok(gate.errors.some((e) => e.includes('deck_lock.artDirection.mode')))
  }
  const missing = spawnSync(process.execPath, args, { encoding: 'utf8' })
  assert.equal(missing.status, 3, missing.stderr || missing.stdout)
  assert.equal(JSON.parse(missing.stdout).deliveryAuthorized, false)
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
    evaluateVisualEvidence(f.manifestPath, {
      candidate: f.candidate,
      review: path,
      expectedDesignMode: 'read',
    }).status,
    'invalid',
  )
})
