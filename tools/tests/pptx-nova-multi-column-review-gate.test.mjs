import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const repoRoot = resolve('.')
const script = join(repoRoot, 'pptx-nova/scripts/pptx-nova-multi-column-review-gate.mjs')

// A minimal PNG with a valid signature and IHDR dimensions. The gate only needs
// deterministic evidence metadata; rendering correctness belongs to xdoc preview.
function png(width = 1920, height = 1080) {
  const bytes = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0)
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function fixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-multi-column-review-'))
  const candidate = join(root, 'candidate.pptx')
  const visionDiff = join(root, 'vision-diff.json')
  const preview = join(root, 'slide-009.png')
  const review = join(root, 'multi-column-review.json')
  const candidateBytes = Buffer.from('candidate-pptx-v1')
  const pngBytes = png()
  writeFileSync(candidate, candidateBytes)
  writeFileSync(preview, pngBytes)

  const reviewIssue = {
    kind: 'multi-column-text-layout-review',
    severity: 'medium',
    slideIndex: 8,
    shapeId: 9,
    shapeName: 'TextBox 7',
    metrics: { columns: 2, textChanged: true },
  }
  const extraIssue = options.extraIssue
  const vision = {
    schemaVersion: 'pptx-vision-diff/v1',
    status: 'success',
    source: 'source.pptx',
    candidate,
    newIssues: [reviewIssue, ...(extraIssue ? [extraIssue] : [])],
    worsenedIssues: [],
    changedIssues: [],
    agentGate: {
      passed: false,
      blockers: [reviewIssue, ...(extraIssue ? [extraIssue] : [])],
      newHighIssues: extraIssue?.severity === 'high' ? 1 : 0,
      newMediumIssues: 1 + (extraIssue?.severity === 'medium' ? 1 : 0),
      worsenedHighIssues: 0,
      worsenedMediumIssues: 0,
    },
  }
  writeJson(visionDiff, vision)
  const visionBytes = Buffer.from(`${JSON.stringify(vision, null, 2)}\n`)

  const record = {
    schemaVersion: 'pptx-nova-multi-column-review/v1',
    candidate: { path: candidate, sha256: digest(candidateBytes) },
    visionDiff: { path: visionDiff, sha256: digest(visionBytes) },
    reviews: [
      {
        slideIndex: 8,
        shapeId: 9,
        reviewer: 'human',
        decision: 'pass',
        png: {
          path: preview,
          sha256: digest(pngBytes),
          width: 1920,
          height: 1080,
        },
        checks: {
          noClipping: true,
          columnFlowReadable: true,
          noOverlap: true,
          marginsAcceptable: true,
        },
        note: 'Full-size PNG reviewed; translated copy fits both columns.',
      },
    ],
  }
  if (options.mutateReview) options.mutateReview(record)
  writeJson(review, record)
  return { root, candidate, visionDiff, preview, review }
}

function run(item) {
  return spawnSync(
    process.execPath,
    [
      script,
      '--candidate',
      item.candidate,
      '--vision-diff',
      item.visionDiff,
      '--review',
      item.review,
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
}

test('multi-column review gate passes when every review-only blocker has bound full-size evidence', () => {
  const result = run(fixture())
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, 'pass')
  assert.equal(report.agentGate.passed, true)
  assert.equal(report.summary.reviewedIssueCount, 1)
})

test('multi-column review gate never exempts a real overflow blocker', () => {
  const item = fixture({
    extraIssue: {
      kind: 'multi-column-text-overflow',
      severity: 'high',
      slideIndex: 8,
      shapeId: 12,
    },
  })
  const result = run(item)
  assert.equal(result.status, 2, result.stderr || result.stdout)
  const report = JSON.parse(result.stdout)
  assert.equal(report.agentGate.passed, false)
  assert.ok(report.blockers.some((blocker) => blocker.code === 'non-review-visual-blocker'))
})

test('multi-column review gate fails closed when the candidate hash is stale', () => {
  const item = fixture({
    mutateReview: (record) => {
      record.candidate.sha256 = `sha256:${'0'.repeat(64)}`
    },
  })
  const result = run(item)
  assert.equal(result.status, 2, result.stderr || result.stdout)
  const report = JSON.parse(result.stdout)
  assert.ok(report.blockers.some((blocker) => blocker.code === 'candidate-hash-mismatch'))
})

test('multi-column review gate fails closed when vision-diff evidence is stale', () => {
  const item = fixture({
    mutateReview: (record) => {
      record.visionDiff.sha256 = `sha256:${'a'.repeat(64)}`
    },
  })
  const result = run(item)
  assert.equal(result.status, 2, result.stderr || result.stdout)
  const report = JSON.parse(result.stdout)
  assert.ok(report.blockers.some((blocker) => blocker.code === 'vision-diff-hash-mismatch'))
})

test('multi-column review gate fails closed when PNG evidence is stale or incomplete', () => {
  const item = fixture({
    mutateReview: (record) => {
      record.reviews[0].png.sha256 = `sha256:${'f'.repeat(64)}`
    },
  })
  const result = run(item)
  assert.equal(result.status, 2, result.stderr || result.stdout)
  const report = JSON.parse(result.stdout)
  assert.ok(report.blockers.some((blocker) => blocker.code === 'png-hash-mismatch'))
})

test('multi-column review gate requires coverage for every slide and shape pair', () => {
  const item = fixture({
    mutateReview: (record) => {
      record.reviews[0].shapeId = 12
    },
  })
  const result = run(item)
  assert.equal(result.status, 2, result.stderr || result.stdout)
  const report = JSON.parse(result.stdout)
  assert.ok(report.blockers.some((blocker) => blocker.code === 'review-missing'))
})
