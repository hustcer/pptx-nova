import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { test } from 'node:test'

const repoRoot = resolve('.')
const script = join(repoRoot, 'pptx-nova/scripts/cli/review/multi-column-scaffold.mjs')
const gate = join(repoRoot, 'pptx-nova/scripts/cli/review/multi-column-gate.mjs')

function png(width = 1920, height = 1080) {
  const bytes = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0)
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function fixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-multi-column-scaffold-'))
  const candidate = join(root, 'candidate.pptx')
  const visionDiff = join(root, 'vision-diff.json')
  const previewJson = join(root, 'preview.json')
  const previewPng = join(root, 'slide-009.png')
  const output = join(root, 'multi-column-review.json')
  const candidateBytes = Buffer.from('candidate-pptx-v1')
  const pngBytes = png()
  writeFileSync(candidate, candidateBytes)
  writeFileSync(previewPng, pngBytes)

  const issue = (shapeId) => ({
    kind: 'multi-column-text-layout-review',
    severity: 'medium',
    slideIndex: 8,
    shapeId,
  })
  const vision = {
    schemaVersion: 'pptx-vision-diff/v1',
    status: 'success',
    candidate: options.wrongVisionCandidate ? join(root, 'other.pptx') : candidate,
    newIssues: [],
    worsenedIssues: [
      { sourceIssue: issue(9), candidateIssue: issue(9) },
      { sourceIssue: issue(12), candidateIssue: issue(12) },
    ],
    changedIssues: [],
    agentGate: { passed: false },
  }
  writeJson(visionDiff, vision)
  const pagePath = options.relativePaths ? relative(root, previewPng) : previewPng
  const candidatePath = options.relativePaths ? relative(root, candidate) : candidate
  const preview = {
    schemaVersion: 'pptx-preview/v1',
    status: 'success',
    input: { path: candidatePath },
    pages: [
      {
        slide: 9,
        path: pagePath,
        file: {
          path: pagePath,
          status: 'ok',
          width: options.staleDimensions ? 1 : 1920,
          height: 1080,
          hash: {
            algorithm: 'sha256',
            value: options.staleHash ? '0'.repeat(64) : digest(pngBytes),
          },
        },
      },
    ],
  }
  writeJson(previewJson, preview)
  return { root, candidate, visionDiff, previewJson, previewPng, output }
}

function run(item, extra = []) {
  return spawnSync(
    process.execPath,
    [
      script,
      '--candidate',
      item.candidate,
      '--vision-diff',
      item.visionDiff,
      '--preview',
      item.previewJson,
      '--output',
      item.output,
      '--json',
      ...extra,
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
}

test('multi-column scaffold binds candidate, vision diff, and one-based preview pages', () => {
  const item = fixture()
  const result = run(item)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const scaffold = JSON.parse(readFileSync(item.output, 'utf8'))
  assert.equal(scaffold.reviews.length, 2)
  assert.deepEqual(
    scaffold.reviews.map((review) => [review.slideIndex, review.shapeId]),
    [
      [8, 9],
      [8, 12],
    ],
  )
  assert.equal(scaffold.reviews[0].png.path, item.previewPng)
  assert.deepEqual(scaffold.reviews[0].png, scaffold.reviews[1].png)
  assert.equal(scaffold.reviews[0].decision, 'pending')
  assert.equal(scaffold.reviews[0].checks.noClipping, false)
  assert.match(scaffold.candidate.sha256, /^sha256:[0-9a-f]{64}$/)
  assert.match(scaffold.visionDiff.sha256, /^sha256:[0-9a-f]{64}$/)
})

test('multi-column scaffold resolves paths relative to the preview manifest', () => {
  const item = fixture({ relativePaths: true })
  const result = run(item)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const scaffold = JSON.parse(result.stdout)
  assert.equal(scaffold.reviews[0].png.path, item.previewPng)
})

test('multi-column scaffold fails when preview evidence metadata is stale', () => {
  for (const options of [{ staleHash: true }, { staleDimensions: true }]) {
    const result = run(fixture(options))
    assert.equal(result.status, 1, result.stdout)
    assert.match(result.stderr, /preview page (hash is|dimensions are) stale/)
  }
})

test('multi-column scaffold rejects candidate mismatch across final artifacts', () => {
  const result = run(fixture({ wrongVisionCandidate: true }))
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /vision-diff candidate path does not match/)
})

test('generated scaffold becomes gate-valid only after explicit review decisions', () => {
  const item = fixture()
  const generated = run(item)
  assert.equal(generated.status, 0, generated.stderr || generated.stdout)
  const pending = spawnSync(
    process.execPath,
    [
      gate,
      '--candidate',
      item.candidate,
      '--vision-diff',
      item.visionDiff,
      '--review',
      item.output,
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(pending.status, 2, pending.stderr || pending.stdout)

  const scaffold = JSON.parse(readFileSync(item.output, 'utf8'))
  for (const review of scaffold.reviews) {
    review.reviewer = 'human'
    review.decision = 'pass'
    review.checks = {
      noClipping: true,
      columnFlowReadable: true,
      noOverlap: true,
      marginsAcceptable: true,
    }
    review.note = 'Reviewed at full PNG resolution.'
  }
  writeJson(item.output, scaffold)
  const approved = spawnSync(
    process.execPath,
    [
      gate,
      '--candidate',
      item.candidate,
      '--vision-diff',
      item.visionDiff,
      '--review',
      item.output,
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(approved.status, 0, approved.stderr || approved.stdout)
  assert.equal(JSON.parse(approved.stdout).summary.reviewedIssueCount, 2)
})

test('multi-column scaffold carries judgments only across identical bound evidence', () => {
  const item = fixture()
  assert.equal(run(item).status, 0)
  const reviewed = JSON.parse(readFileSync(item.output, 'utf8'))
  for (const review of reviewed.reviews) {
    review.reviewer = 'human'
    review.decision = 'pass'
    review.checks = {
      noClipping: true,
      columnFlowReadable: true,
      noOverlap: true,
      marginsAcceptable: true,
    }
    review.note = 'Bound evidence is readable.'
  }
  writeJson(item.output, reviewed)

  const carriedOutput = join(item.root, 'carried-review.json')
  const carried = run({ ...item, output: carriedOutput }, ['--carry-review-from', item.output])
  assert.equal(carried.status, 0, carried.stderr || carried.stdout)
  const carriedReview = JSON.parse(readFileSync(carriedOutput, 'utf8'))
  assert.equal(carriedReview.carryReview.status, 'carried')
  assert.equal(carriedReview.carryReview.count, 2)
  assert.equal(carriedReview.reviews[0].decision, 'pass')
  assert.equal(carriedReview.reviews[0].reviewer, 'human')

  const mismatchCases = [
    [
      'png-mismatch',
      (value) => {
        value.reviews[0].png.sha256 = `sha256:${'0'.repeat(64)}`
      },
    ],
    [
      'finding-set-mismatch',
      (value) => {
        value.reviews.pop()
      },
    ],
    [
      'vision-identity-mismatch',
      (value) => {
        value.visionDiff.normalizedIdentity = `sha256:${'f'.repeat(64)}`
      },
    ],
  ]
  for (const [reason, mutate] of mismatchCases) {
    const prior = structuredClone(reviewed)
    mutate(prior)
    const priorPath = join(item.root, `prior-${reason}.json`)
    const output = join(item.root, `rejected-${reason}.json`)
    writeJson(priorPath, prior)
    const result = run({ ...item, output }, ['--carry-review-from', priorPath])
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const next = JSON.parse(readFileSync(output, 'utf8'))
    assert.equal(next.carryReview.status, 'not-carried')
    assert.ok(next.carryReview.reasons.includes(reason))
    assert.equal(next.reviews[0].decision, 'pending')
  }

  writeFileSync(item.candidate, 'candidate-pptx-v2')
  const rejectedOutput = join(item.root, 'rejected-review.json')
  const rejected = run({ ...item, output: rejectedOutput }, ['--carry-review-from', item.output])
  assert.equal(rejected.status, 0, rejected.stderr || rejected.stdout)
  const rejectedReview = JSON.parse(readFileSync(rejectedOutput, 'utf8'))
  assert.equal(rejectedReview.carryReview.status, 'not-carried')
  assert.ok(rejectedReview.carryReview.reasons.includes('candidate-mismatch'))
  assert.equal(rejectedReview.reviews[0].decision, 'pending')
})
