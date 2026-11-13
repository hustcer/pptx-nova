import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  captureVisualBinding,
  evaluateVisualEvidence,
  fileSha256,
  REVIEW_CHECKS,
  verifyVisualReview,
} from '../../../pptx-nova/scripts/lib/review/canonical-visual-evidence.mjs'

const repository = resolve('.')
const gateScript = join(repository, 'pptx-nova/scripts/cli/review/visual-evidence-gate.mjs')

test('Create and Translation share complete, unique, workflow-bound visual review requirements', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-review-contract-'))
  const path = join(root, 'review.json')
  const binding = { candidateSha256: 'current', slideCount: 2, artifacts: [] }
  for (const mode of ['create', 'translation']) {
    const makeReview = () => ({
      schemaVersion: 'pptx-nova-visual-review/v1',
      mode,
      status: 'pass',
      reviewer: 'agent',
      binding,
      summary: { slidesReviewed: 2 },
      checks: REVIEW_CHECKS.map((name) => ({ name, status: 'pass' })),
    })
    const valid = makeReview()
    valid.checks[0].status = 'na'
    writeFileSync(path, JSON.stringify(valid))
    assert.deepEqual(verifyVisualReview(path, binding, { mode }), valid)
    for (const mutate of [
      (r) => {
        r.mode = mode === 'create' ? 'translation' : 'create'
      },
      (r) => {
        r.binding = { ...binding, candidateSha256: 'stale' }
      },
      (r) => {
        r.summary.slidesReviewed = 1
      },
      (r) => {
        r.reviewer = ' '
      },
      (r) => {
        r.status = 'warn'
      },
      (r) => {
        r.checks.pop()
      },
      (r) => {
        r.checks.push({ ...r.checks[0] })
      },
      (r) => {
        r.checks[0].status = 'fail'
      },
      (r) => {
        r.errors = ['unresolved']
      },
      (r) => {
        r.warnings = ['unresolved']
      },
      (r) => {
        r.issues = ['unresolved']
      },
    ]) {
      const review = makeReview()
      mutate(review)
      writeFileSync(path, JSON.stringify(review))
      assert.throws(() => verifyVisualReview(path, binding, { mode }), /visual review/)
    }
  }
})

function writeManifest(root, action, assurance, policyOutcome, checkOverrides = {}) {
  const path = join(root, `${action}.json`)
  const checks = [
    { id: 'input-integrity', required: true, outcome: 'pass' },
    { id: 'static-layout', required: true, outcome: 'pass' },
    { id: 'pdf-final-layout', required: true, outcome: 'pass' },
    { id: 'pdfium-raster', required: true, outcome: 'pass' },
    { id: 'pixel-diff', required: true, outcome: 'pass' },
    { id: 'ocr-overflow', required: false, outcome: 'skipped' },
    { id: 'font-resolution', required: false, outcome: 'skipped' },
    { id: 'region-attribution', required: false, outcome: 'skipped' },
    { id: 'independent-reference', required: false, outcome: 'skipped' },
    { id: 'policy', required: true, outcome: policyOutcome },
  ].map((check) => ({
    ...check,
    ...(checkOverrides[check.id] ? { outcome: checkOverrides[check.id] } : {}),
  }))
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        schemaVersion: 'pptx-visual-evidence/v1',
        status: 'success',
        checks,
        decision: { action, assurance, reasons: [] },
      },
      null,
      2,
    )}\n`,
  )
  return path
}

function runGate(manifest, expectedStatus, output = '') {
  const args = [gateScript, '--manifest', manifest, '--json']
  if (output) args.push('--output', output)
  const result = spawnSync(process.execPath, args, {
    cwd: repository,
    encoding: 'utf8',
  })
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

function scopedFixture() {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-scoped-visual-'))
  const candidate = join(root, 'candidate.pptx')
  const reference = join(root, 'reference.pptx')
  const manifestPath = writeManifest(root, 'proceed', 'same-renderer-regression', 'pass')
  writeFileSync(candidate, 'candidate fixture bytes')
  writeFileSync(reference, 'reference fixture bytes')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.policyId = 'pptx-visual-oracle-default/v1'
  manifest.subjects = [
    {
      id: 'reference',
      sha256: fileSha256(reference),
      byteLength: readFileSync(reference).length,
      slideCount: 12,
      selectedSlides: [2, 7],
    },
    {
      id: 'candidate',
      sha256: fileSha256(candidate),
      byteLength: readFileSync(candidate).length,
      slideCount: 12,
      selectedSlides: [2, 7],
    },
  ]
  manifest.artifacts = ['reference', 'candidate'].flatMap((subjectId) =>
    [
      [`${subjectId}-page-2.png`, 'image/png', 2],
      [`${subjectId}-page-7.png`, 'image/png', 7],
      [`${subjectId}-render.pdf`, 'application/pdf', null],
    ].map(([path, mimeType, slide]) => {
      writeFileSync(join(root, path), `fixture ${path}`)
      return {
        id: path,
        path,
        mimeType,
        slide,
        subjectId,
        sha256: fileSha256(join(root, path)),
        byteLength: readFileSync(join(root, path)).length,
      }
    }),
  )
  const save = () => writeFileSync(manifestPath, JSON.stringify(manifest))
  save()
  return { root, candidate, reference, manifestPath, manifest, save }
}

function runVisualReview(fixture, mode, count = 2) {
  const script = join(repository, 'pptx-nova/scripts/cli/review/visual-review.mjs')
  const checks = [
    ...REVIEW_CHECKS,
    ...(mode === 'refurbish' ? ['targetDeckkitApplied'] : []),
    ...(mode === 'translation' ? ['textStyleAlignment'] : []),
  ]
  const style = join(fixture.root, 'style.json')
  if (mode === 'translation')
    writeFileSync(
      style,
      JSON.stringify({
        schemaVersion: 'pptx-i18n-style-diff/v1',
        status: 'pass',
        agentGate: { passed: true },
        source: fixture.reference,
        candidate: fixture.candidate,
        textStyleMapping: {
          schemaVersion: 'pptx-i18n-text-style-mapping/v1',
          reviewRequiredCount: 0,
          mappings: [],
        },
      }),
    )
  const args = [
    script,
    ...(mode ? ['--mode', mode] : []),
    '--candidate',
    fixture.candidate,
    '--manifest',
    fixture.manifestPath,
    '--previews',
    fixture.root,
    '--output',
    join(fixture.root, 'review.json'),
    '--slides-reviewed',
    String(count),
    '--json',
    ...(mode === 'translation' ? ['--style-diff', style] : []),
    ...checks.flatMap((name) => ['--check', `${name}=pass`]),
  ]
  return spawnSync(process.execPath, args, { encoding: 'utf8' })
}

test('regression visual bindings accept the selected slide scope and still reject missing or stale artifacts', () => {
  const f = scopedFixture()
  const binding = captureVisualBinding(f.manifestPath, f.candidate)
  assert.equal(binding.slideCount, 12)
  assert.deepEqual(binding.reviewedSlides, [2, 7])
  f.manifest.artifacts = f.manifest.artifacts.filter((a) => a.slide !== 7)
  f.save()
  assert.throws(() => captureVisualBinding(f.manifestPath, f.candidate), /PNG coverage/)
  const stale = scopedFixture()
  writeFileSync(join(stale.root, 'candidate-page-2.png'), 'replaced bytes')
  assert.throws(
    () => captureVisualBinding(stale.manifestPath, stale.candidate),
    /stale renderer artifact/,
  )
})

test('the edit review CLI records exactly the rendered scope instead of the total deck count', () => {
  const f = scopedFixture()
  for (const mode of ['edit', 'micro-edit']) {
    const accepted = runVisualReview(f, mode)
    assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout)
    assert.deepEqual(JSON.parse(accepted.stdout).binding.reviewedSlides, [2, 7])
  }
  const rejected = runVisualReview(f, 'edit', 12)
  assert.notEqual(rejected.status, 0)
  assert.match(rejected.stderr, /every selected canonical candidate slide/)
})

test('specialized and unspecified review modes cannot claim complete review from scoped canonical PNGs', () => {
  for (const mode of [
    'refurbish',
    'translation',
    'template-following',
    'structural-edit',
    'create',
    '',
    'unknown',
  ]) {
    const f = scopedFixture()
    for (const count of [2, 12]) {
      const result = runVisualReview(f, mode, count)
      assert.notEqual(
        result.status,
        0,
        `${mode || 'unspecified'} accepted ${count}/12 reviewed slides`,
      )
      assert.match(result.stderr, /complete candidate slide coverage/)
    }
  }
})

test('specialized review modes retain complete regression review support', () => {
  const f = scopedFixture()
  for (const subject of f.manifest.subjects) {
    subject.slideCount = 2
    subject.selectedSlides = [1, 2]
  }
  for (const artifact of f.manifest.artifacts) {
    if (artifact.mimeType === 'image/png') artifact.slide = artifact.slide === 2 ? 1 : 2
  }
  f.save()
  for (const mode of ['refurbish', 'translation', 'template-following', 'structural-edit']) {
    const result = runVisualReview(f, mode)
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const report = JSON.parse(result.stdout)
    assert.equal(report.status, 'pass')
    assert.equal(report.binding.slideCount, 2)
    assert.deepEqual(report.binding.reviewedSlides, [1, 2])
  }
})

test('scoped visual bindings reject duplicate, out-of-range and mismatched reference scopes without weakening Create', () => {
  for (const scope of [[], [2, 2], [0, 2], [2, 13], [7, 2]]) {
    const f = scopedFixture()
    f.manifest.subjects.find((s) => s.id === 'candidate').selectedSlides = scope
    f.save()
    assert.throws(() => captureVisualBinding(f.manifestPath, f.candidate), /slide coverage/)
  }
  const reference = scopedFixture()
  reference.manifest.subjects.find((s) => s.id === 'reference').selectedSlides = [2]
  reference.save()
  assert.throws(
    () => captureVisualBinding(reference.manifestPath, reference.candidate),
    /reference.*scope/,
  )
  const create = scopedFixture()
  create.manifest.subjects = create.manifest.subjects.filter((s) => s.id === 'candidate')
  create.manifest.artifacts = create.manifest.artifacts.filter((a) => a.subjectId === 'candidate')
  create.manifest.policyId = 'pptx-visual-oracle-create/v1'
  create.manifest.decision.assurance = 'candidate-checks'
  create.manifest.checks.find((c) => c.id === 'pixel-diff').outcome = 'skipped'
  create.manifest.checks.find((c) => c.id === 'pixel-diff').required = false
  create.save()
  assert.throws(
    () => captureVisualBinding(create.manifestPath, create.candidate),
    /complete candidate slide coverage/,
  )
})

test('regression scope validation rejects a reference whose page selection exceeds its own deck', () => {
  const f = scopedFixture()
  f.manifest.subjects.find((s) => s.id === 'reference').slideCount = 5
  f.save()
  assert.throws(
    () => captureVisualBinding(f.manifestPath, f.candidate),
    /reference.*slide coverage/,
  )
})

test('scoped evidence preserves stop and human-confirmation decisions even with a passing review', () => {
  for (const [action, assurance, policy, expectedStatus] of [
    ['proceed', 'same-renderer-regression', 'pass', 'passed'],
    ['stop', 'content-blocked', 'fail', 'blocked'],
    [
      'require-human-confirmation',
      'same-renderer-change-detected',
      'inconclusive',
      'review-required',
    ],
  ]) {
    const f = scopedFixture()
    f.manifest.decision = { action, assurance, reasons: [] }
    f.manifest.checks.find((c) => c.id === 'policy').outcome = policy
    f.manifest.checks.find((c) => c.id === 'pixel-diff').outcome =
      action === 'stop' ? 'fail' : action === 'proceed' ? 'pass' : 'inconclusive'
    f.save()
    const review = join(f.root, 'passing-review.json')
    writeFileSync(
      review,
      JSON.stringify({
        schemaVersion: 'pptx-nova-visual-review/v1',
        mode: 'edit',
        status: 'pass',
        reviewer: 'agent',
        summary: { slidesReviewed: 2 },
        binding: captureVisualBinding(f.manifestPath, f.candidate),
        checks: REVIEW_CHECKS.map((name) => ({ name, status: 'pass' })),
      }),
    )
    const report = evaluateVisualEvidence(f.manifestPath, { candidate: f.candidate, review })
    assert.equal(report.status, expectedStatus)
    assert.equal(report.deliveryAuthorized, action === 'proceed')
    assert.deepEqual(report.decision, f.manifest.decision)
  }
})

test('visual evidence consumer authorizes only canonical proceed decisions', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-visual-gate-'))
  const output = join(root, 'gate.json')
  const proceed = runGate(
    writeManifest(root, 'proceed', 'same-renderer-regression', 'pass'),
    0,
    output,
  )
  assert.equal(proceed.status, 'passed')
  assert.equal(proceed.deliveryAuthorized, true)
  assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), proceed)

  const stopped = runGate(
    writeManifest(root, 'stop', 'content-blocked', 'fail', {
      'static-layout': 'fail',
    }),
    4,
  )
  assert.equal(stopped.status, 'blocked')
  assert.equal(stopped.deliveryAuthorized, false)

  const review = runGate(
    writeManifest(root, 'require-human-confirmation', 'candidate-only', 'inconclusive'),
    5,
  )
  assert.equal(review.status, 'review-required')
  assert.equal(review.deliveryAuthorized, false)

  const reviewWithRequiredFinding = runGate(
    writeManifest(
      root,
      'require-human-confirmation',
      'same-renderer-change-detected',
      'inconclusive',
      { 'static-layout': 'fail' },
    ),
    5,
  )
  assert.equal(reviewWithRequiredFinding.status, 'review-required')
  assert.equal(reviewWithRequiredFinding.deliveryAuthorized, false)
})

test('visual evidence consumer rejects inconsistent manifests fail closed', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-visual-gate-invalid-'))
  const invalid = writeManifest(root, 'proceed', 'same-renderer-regression', 'pass', {
    'pdfium-raster': 'skipped',
  })
  const report = runGate(invalid, 3)
  assert.equal(report.status, 'invalid')
  assert.equal(report.deliveryAuthorized, false)
  assert.ok(report.errors.some((error) => error.includes('required check pdfium-raster')))

  const incompleteRegistry = writeManifest(
    root,
    'require-human-confirmation',
    'candidate-only',
    'inconclusive',
  )
  const incomplete = JSON.parse(readFileSync(incompleteRegistry, 'utf8'))
  incomplete.checks = incomplete.checks.filter((check) => check.id !== 'font-resolution')
  writeFileSync(incompleteRegistry, `${JSON.stringify(incomplete, null, 2)}\n`)
  const incompleteReport = runGate(incompleteRegistry, 3)
  assert.ok(incompleteReport.errors.some((error) => error.includes('check registry')))
})
