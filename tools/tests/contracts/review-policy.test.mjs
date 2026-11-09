import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const repoRoot = resolve('.')
const skillRoot = join(repoRoot, 'pptx-nova')

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function runNode(args, expectedStatus = 0, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  })
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout)
  return result
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeStoredZip(path, entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, text] of Object.entries(entries)) {
    const fileName = Buffer.from(name)
    const data = Buffer.from(text)
    const checksum = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(fileName.length, 26)
    locals.push(local, fileName, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(fileName.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, fileName)
    offset += local.length + fileName.length + data.length
  }
  const centralDirectory = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(Object.keys(entries).length, 8)
  eocd.writeUInt16LE(Object.keys(entries).length, 10)
  eocd.writeUInt32LE(centralDirectory.length, 12)
  eocd.writeUInt32LE(offset, 16)
  writeFileSync(path, Buffer.concat([...locals, centralDirectory, eocd]))
}

function envWithoutPath() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'path') delete env[key]
  }
  env.PATH = ''
  return env
}

function layoutFinding(overrides = {}) {
  return {
    severity: 'warning',
    classification: 'actionable',
    code: 'empty-placeholder',
    message: 'Placeholder object is empty in final layout',
    slide: 7,
    slideIndex: 7,
    slideNumber: 8,
    slidePart: 'ppt/slides/slide8.xml',
    objectId: 101,
    objectName: 'Slide Number Placeholder',
    placeholder: { type: 'sldNum', idx: 12 },
    observed: { textEmpty: true },
    ...overrides,
  }
}

function reviewRule(overrides = {}) {
  return {
    id: 'slide-8-intentional-empty-sldnum',
    code: 'empty-placeholder',
    disposition: 'accepted',
    target: {
      slideIndex: 7,
      part: 'ppt/slides/slide8.xml',
      shapeId: 101,
      placeholder: { type: 'sldNum', idx: 12 },
    },
    expected: { textEmpty: true },
    reason: '该页用于演示 viewer 尚未自动填充页码占位符的行为',
    ...overrides,
  }
}

async function loadReviewPolicyModule() {
  return import(pathToFileURL(join(skillRoot, 'scripts/lib/review/policy.mjs')).href)
}

test('review policy accepts one exact hash-bound intentional empty placeholder', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-review-policy-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const policyPath = join(root, 'review-policy.json')
  writeFileSync(source, 'source bytes')
  writeFileSync(candidate, 'candidate bytes')
  const policy = {
    schemaVersion: 'pptx-nova-review-policy/v1',
    bindings: { sourceSha256: sha256(source) },
    reviewedFindings: [reviewRule()],
  }
  writeJson(policyPath, policy)

  const { evaluateReviewPolicy } = await loadReviewPolicyModule()
  const report = evaluateReviewPolicy({
    policyDocument: policy,
    policyDocumentPath: policyPath,
    sourcePptx: source,
    candidatePptx: candidate,
    findings: [layoutFinding()],
  })

  assert.equal(report.status, 'pass')
  assert.equal(report.summary.declaredReviewCount, 1)
  assert.equal(report.summary.appliedReviewCount, 1)
  assert.equal(report.summary.reviewedFindingCount, 1)
  assert.equal(report.summary.remainingActionableCount, 0)
  assert.equal(report.reviewedFindings[0].classification, 'reviewed')
  assert.equal(report.reviewedFindings[0].review.id, reviewRule().id)
  assert.equal(report.bindings.source.sha256, sha256(source))
  assert.equal(report.bindings.candidate.sha256, sha256(candidate))
  assert.equal(report.bindings.policyDocument.sha256, sha256(policyPath))
})

test('review policy accepts a new actionable code only through an exact finding fingerprint', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-review-policy-fingerprint-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  writeFileSync(source, 'source bytes')
  writeFileSync(candidate, 'candidate bytes')
  const finding = layoutFinding({
    code: 'font-size-too-small',
    message: 'Text object discloses a font size below 6pt',
    placeholder: undefined,
    observed: undefined,
    sizePt: 5,
  })
  const { evaluateReviewPolicy, reviewFindingSha256 } = await loadReviewPolicyModule()
  const findingSha256 = reviewFindingSha256(finding)
  assert.equal(
    reviewFindingSha256(Object.fromEntries(Object.entries(finding).reverse())),
    findingSha256,
  )
  assert.equal(
    reviewFindingSha256({ ...finding, objectType: 'shape' }),
    findingSha256,
    'producer-specific object metadata must not change a stable shape-id fingerprint',
  )
  assert.equal(
    reviewFindingSha256({ ...finding, severity: 'error', message: 'wording changed' }),
    findingSha256,
  )
  assert.notEqual(reviewFindingSha256({ ...finding, sizePt: 4.5 }), findingSha256)
  const policy = {
    schemaVersion: 'pptx-nova-review-policy/v1',
    bindings: { sourceSha256: sha256(source) },
    reviewedFindings: [
      {
        id: 'slide-8-intentional-micro-label',
        code: 'font-size-too-small',
        disposition: 'accepted',
        findingSha256,
        reason: 'This non-content registration mark intentionally renders at 5pt.',
      },
    ],
  }

  const accepted = evaluateReviewPolicy({
    policyDocument: policy,
    sourcePptx: source,
    candidatePptx: candidate,
    findings: [finding],
  })
  assert.equal(accepted.status, 'pass')
  assert.equal(accepted.summary.appliedReviewCount, 1)
  assert.equal(accepted.reviewedFindings[0].classification, 'reviewed')
  assert.equal(accepted.reviewedFindings[0].review.matchMode, 'fingerprint')
  assert.equal(accepted.reviewedFindings[0].review.findingSha256, findingSha256)

  const stale = evaluateReviewPolicy({
    policyDocument: policy,
    sourcePptx: source,
    candidatePptx: candidate,
    findings: [{ ...finding, sizePt: 4.5 }],
  })
  assert.equal(stale.status, 'fail')
  assert.ok(stale.errors.some((item) => item.code === 'review-rule-unmatched'))
  assert.equal(stale.summary.appliedReviewCount, 0)

  const unboundPolicy = {
    ...policy,
    reviewedFindings: policy.reviewedFindings.map(({ id, code, disposition, reason }) => ({
      id,
      code,
      disposition,
      reason,
    })),
  }
  const unbound = evaluateReviewPolicy({
    policyDocument: unboundPolicy,
    sourcePptx: source,
    candidatePptx: candidate,
    findings: [finding],
  })
  assert.equal(unbound.status, 'fail')
  assert.ok(unbound.errors.some((item) => item.code === 'review-rule-fingerprint-required'))

  const informational = evaluateReviewPolicy({
    policyDocument: policy,
    sourcePptx: source,
    candidatePptx: candidate,
    findings: [{ ...finding, classification: 'informational' }],
  })
  assert.equal(informational.status, 'fail')
  assert.ok(informational.errors.some((item) => item.code === 'review-rule-unmatched'))
})

test('review policy fails closed for stale, unmatched, and duplicate exceptions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-review-policy-fail-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  writeFileSync(source, 'source bytes')
  writeFileSync(candidate, 'candidate bytes')
  const { evaluateReviewPolicy } = await loadReviewPolicyModule()

  const stale = evaluateReviewPolicy({
    policyDocument: {
      schemaVersion: 'pptx-nova-review-policy/v1',
      bindings: { sourceSha256: '0'.repeat(64) },
      reviewedFindings: [reviewRule()],
    },
    sourcePptx: source,
    candidatePptx: candidate,
    findings: [layoutFinding()],
  })
  assert.equal(stale.status, 'fail')
  assert.ok(stale.errors.some((item) => item.code === 'review-policy-source-hash-mismatch'))
  assert.equal(stale.summary.appliedReviewCount, 0)
  assert.equal(stale.summary.remainingActionableCount, 1)

  const unmatched = evaluateReviewPolicy({
    policyDocument: {
      schemaVersion: 'pptx-nova-review-policy/v1',
      bindings: { sourceSha256: sha256(source) },
      reviewedFindings: [
        reviewRule({
          target: {
            ...reviewRule().target,
            shapeId: 999,
          },
        }),
      ],
    },
    sourcePptx: source,
    candidatePptx: candidate,
    findings: [layoutFinding()],
  })
  assert.equal(unmatched.status, 'fail')
  assert.ok(unmatched.errors.some((item) => item.code === 'review-rule-unmatched'))

  const partiallyUnmatched = evaluateReviewPolicy({
    policyDocument: {
      schemaVersion: 'pptx-nova-review-policy/v1',
      bindings: { sourceSha256: sha256(source) },
      reviewedFindings: [
        reviewRule(),
        reviewRule({
          id: 'missing-second-target',
          target: { ...reviewRule().target, shapeId: 999 },
        }),
      ],
    },
    sourcePptx: source,
    candidatePptx: candidate,
    findings: [layoutFinding()],
  })
  assert.equal(partiallyUnmatched.status, 'fail')
  assert.equal(partiallyUnmatched.summary.appliedReviewCount, 0)
  assert.equal(partiallyUnmatched.summary.reviewedFindingCount, 0)
  assert.equal(partiallyUnmatched.summary.remainingActionableCount, 1)

  const duplicate = evaluateReviewPolicy({
    policyDocument: {
      schemaVersion: 'pptx-nova-review-policy/v1',
      bindings: { sourceSha256: sha256(source) },
      reviewedFindings: [reviewRule(), reviewRule({ id: 'duplicate-target' })],
    },
    sourcePptx: source,
    candidatePptx: candidate,
    findings: [layoutFinding()],
  })
  assert.equal(duplicate.status, 'fail')
  assert.ok(duplicate.errors.some((item) => item.code === 'review-rule-target-duplicate'))
})

test('review policy rejects unknown documents, schema versions, and properties', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-review-policy-schema-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  writeFileSync(source, 'source bytes')
  writeFileSync(candidate, 'candidate bytes')
  const { evaluateReviewPolicy } = await loadReviewPolicyModule()

  const unknownDocument = evaluateReviewPolicy({
    policyDocument: {
      schemaVersion: 'some-other-policy/v1',
      bindings: { sourceSha256: sha256(source) },
      reviewedFindings: [reviewRule()],
    },
    sourcePptx: source,
    candidatePptx: candidate,
    findings: [layoutFinding()],
  })
  assert.equal(unknownDocument.status, 'fail')
  assert.ok(unknownDocument.errors.some((item) => item.code === 'review-policy-document-invalid'))

  const unknownVersion = evaluateReviewPolicy({
    policyDocument: {
      schemaVersion: 'pptx-nova-review-policy/v2',
      bindings: { sourceSha256: sha256(source) },
      reviewedFindings: [reviewRule()],
    },
    sourcePptx: source,
    candidatePptx: candidate,
    findings: [layoutFinding()],
  })
  assert.equal(unknownVersion.status, 'fail')
  assert.ok(unknownVersion.errors.some((item) => item.code === 'review-policy-schema-version'))

  const unknownProperty = evaluateReviewPolicy({
    policyDocument: {
      schemaVersion: 'pptx-nova-review-policy/v1',
      bindings: { sourceSha256: sha256(source) },
      reviewedFindings: [reviewRule({ reviewer: 'agent' })],
    },
    sourcePptx: source,
    candidatePptx: candidate,
    findings: [layoutFinding()],
  })
  assert.equal(unknownProperty.status, 'fail')
  assert.ok(unknownProperty.errors.some((item) => item.code === 'review-policy-unknown-properties'))

  const unboundEmptyPolicy = evaluateReviewPolicy({
    policyDocument: {
      schemaVersion: 'pptx-nova-review-policy/v1',
      bindings: {},
      reviewedFindings: [],
    },
    sourcePptx: source,
    candidatePptx: candidate,
    findings: [],
  })
  assert.equal(unboundEmptyPolicy.status, 'fail')
  assert.ok(
    unboundEmptyPolicy.errors.some((item) => item.code === 'review-policy-source-binding-missing'),
  )
})

test('review policy matches omitted OOXML placeholder attributes by their semantic defaults', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-review-policy-defaults-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  writeFileSync(source, 'source bytes')
  writeFileSync(candidate, 'candidate bytes')
  const { evaluateReviewPolicy } = await loadReviewPolicyModule()
  const policy = {
    schemaVersion: 'pptx-nova-review-policy/v1',
    bindings: { sourceSha256: sha256(source) },
    reviewedFindings: [
      reviewRule({
        target: {
          ...reviewRule().target,
          placeholder: { type: 'obj', idx: 0 },
        },
      }),
    ],
  }

  const report = evaluateReviewPolicy({
    policyDocument: policy,
    sourcePptx: source,
    candidatePptx: candidate,
    findings: [layoutFinding({ placeholder: {} })],
  })

  assert.equal(report.status, 'pass')
  assert.equal(report.summary.reviewedFindingCount, 1)
  assert.equal(report.summary.remainingActionableCount, 0)
})

function writeFidelityFixture(root, reviewedFindings) {
  mkdirSync(root, { recursive: true })
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const sourceInspect = join(root, 'source-inspect.json')
  const referenceMap = join(root, 'reference-map.json')
  const finalAudit = join(root, 'final-audit.json')
  const visionDiff = join(root, 'vision-diff.json')
  const layout = join(root, 'layout-final.json')
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  writeJson(sourceInspect, {
    schemaVersion: 'pptx-inspect/v1',
    presentation: { slideCount: 1 },
    slides: [{ index: 0 }],
  })
  writeJson(referenceMap, {
    schemaVersion: 'pptx-nova-reference-map/v1',
    bindings: { sourceSha256: sha256(source) },
    reviewedFindings,
    slides: [{ sourceSlide: 0, outputSlides: [0] }],
  })
  writeJson(finalAudit, {
    schemaVersion: 'pptx-refurbish-audit/v1',
    status: 'success',
    outcome: 'passed',
    summary: {
      errorCount: 0,
      warningCount: 0,
      baselineSlideCount: 1,
      targetSlideCount: 1,
      slideCountMatches: true,
    },
    issues: [],
  })
  writeJson(visionDiff, {
    schemaVersion: 'pptx-vision-diff/v1',
    status: 'success',
    summary: {
      byClass: {
        new: { high: 0, medium: 0, low: 0 },
        changed: { high: 0, medium: 0, low: 0 },
      },
    },
  })
  writeJson(layout, {
    schemaVersion: 'pptx-nova-layout-snapshot/v1',
    status: 'warn',
    summary: { actionableRiskCount: 1, informationalRiskCount: 0 },
    risks: [
      layoutFinding({
        slide: 0,
        slideIndex: 0,
        slideNumber: 1,
        slidePart: 'ppt/slides/slide1.xml',
        objectType: 'shape',
      }),
    ],
  })
  return { source, candidate, sourceInspect, referenceMap, finalAudit, visionDiff, layout }
}

test('refurbish fidelity blocks worsened medium findings even with no fresh findings', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-fidelity-worsened-'))
  const files = writeFidelityFixture(root, [])
  const vision = JSON.parse(readFileSync(files.visionDiff))
  vision.summary.byClass.worsened = { high: 0, medium: 1, low: 0 }
  writeJson(files.visionDiff, vision)
  const result = runNode(
    [
      join(skillRoot, 'scripts/cli/review/fidelity-gate.mjs'),
      '--mode',
      'refurbish',
      '--source-inspect',
      files.sourceInspect,
      '--source-pptx',
      files.source,
      '--candidate-pptx',
      files.candidate,
      '--reference-map',
      files.referenceMap,
      '--final-audit',
      files.finalAudit,
      '--vision-diff',
      files.visionDiff,
      '--json',
    ],
    1,
  )
  assert.equal(JSON.parse(result.stdout).status, 'fail')
  assert.ok(JSON.parse(result.stdout).errors.some((e) => e.code === 'vision-diff-new-issue'))
})

test('fidelity gate applies fingerprint-reviewed findings and binds evidence hashes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-fidelity-review-'))
  const { reviewFindingSha256 } = await loadReviewPolicyModule()
  const files = writeFidelityFixture(root, [
    {
      id: 'slide-1-intentional-empty-sldnum',
      code: 'empty-placeholder',
      disposition: 'accepted',
      findingSha256: reviewFindingSha256(
        layoutFinding({
          slide: 0,
          slideIndex: 0,
          slideNumber: 1,
          slidePart: 'ppt/slides/slide1.xml',
          objectType: 'shape',
        }),
      ),
      reason: 'This placeholder intentionally remains empty.',
    },
  ])
  const result = runNode([
    join(skillRoot, 'scripts/cli/review/fidelity-gate.mjs'),
    '--mode',
    'refurbish',
    '--source-inspect',
    files.sourceInspect,
    '--source-pptx',
    files.source,
    '--candidate-pptx',
    files.candidate,
    '--reference-map',
    files.referenceMap,
    '--final-audit',
    files.finalAudit,
    '--vision-diff',
    files.visionDiff,
    '--layout-snapshot',
    files.layout,
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'pass')
  assert.equal(report.summary.appliedReviews, 1)
  assert.equal(report.summary.reviewedFindings, 1)
  assert.equal(report.summary.remainingActionableFindings, 0)
  assert.equal(report.reviewPolicy.bindings.source.sha256, sha256(files.source))
  assert.equal(report.reviewPolicy.bindings.candidate.sha256, sha256(files.candidate))
  assert.equal(report.reviewPolicy.bindings.evidence.layoutSnapshot.sha256, sha256(files.layout))
  assert.equal(report.reviewPolicy.bindings.evidence.finalAudit.sha256, sha256(files.finalAudit))
})

test('fidelity gate rejects precomputed review evaluation when any bound evidence changes', async () => {
  const { evaluateReviewPolicy } = await loadReviewPolicyModule()
  for (const evidenceName of ['layout', 'finalAudit', 'visionDiff', 'referenceMap']) {
    const root = mkdtempSync(join(tmpdir(), `pptx-nova-fidelity-precomputed-${evidenceName}-`))
    const files = writeFidelityFixture(root, [])
    const evaluationPath = join(root, 'review-policy-evaluation.json')
    const layout = JSON.parse(readFileSync(files.layout, 'utf8'))
    const evaluation = evaluateReviewPolicy({
      policyDocument: null,
      policyDocumentPath: '',
      allowEmbeddedPolicy: false,
      sourcePptx: files.source,
      candidatePptx: files.candidate,
      findings: layout.risks,
      evidencePaths: {
        layoutSnapshot: files.layout,
        finalAudit: files.finalAudit,
        visionDiff: files.visionDiff,
        referenceMap: files.referenceMap,
      },
    })
    assert.equal(evaluation.status, 'pass')
    writeJson(evaluationPath, evaluation)
    writeFileSync(files[evidenceName], `${readFileSync(files[evidenceName], 'utf8')}\n`)

    const result = runNode(
      [
        join(skillRoot, 'scripts/cli/review/fidelity-gate.mjs'),
        '--mode',
        'refurbish',
        '--source-inspect',
        files.sourceInspect,
        '--source-pptx',
        files.source,
        '--candidate-pptx',
        files.candidate,
        '--reference-map',
        files.referenceMap,
        '--final-audit',
        files.finalAudit,
        '--vision-diff',
        files.visionDiff,
        '--layout-snapshot',
        files.layout,
        '--review-evaluation',
        evaluationPath,
        '--json',
      ],
      1,
    )
    const report = JSON.parse(result.stdout)
    assert.equal(report.status, 'fail')
    assert.ok(
      report.errors.some(
        (item) =>
          item.code === 'review-evaluation-binding-stale' &&
          item.details?.evidence ===
            {
              layout: 'layoutSnapshot',
              finalAudit: 'finalAudit',
              visionDiff: 'visionDiff',
              referenceMap: 'referenceMap',
            }[evidenceName],
      ),
    )
  }
})

test('fidelity gate rejects semantically inconsistent precomputed review evaluations', async () => {
  const { evaluateReviewPolicy } = await loadReviewPolicyModule()
  const variants = [
    {
      name: 'fail-without-errors',
      mutate(evaluation) {
        evaluation.status = 'fail'
        evaluation.errors = []
        evaluation.summary.errorCount = 0
      },
    },
    {
      name: 'array-count-mismatch',
      mutate(evaluation) {
        evaluation.summary.remainingActionableCount = evaluation.remainingActionable.length + 1
      },
    },
  ]

  for (const variant of variants) {
    const root = mkdtempSync(join(tmpdir(), `pptx-nova-fidelity-semantic-${variant.name}-`))
    const files = writeFidelityFixture(root, [])
    const evaluationPath = join(root, 'review-policy-evaluation.json')
    const layout = JSON.parse(readFileSync(files.layout, 'utf8'))
    const evaluation = evaluateReviewPolicy({
      policyDocument: null,
      policyDocumentPath: '',
      allowEmbeddedPolicy: false,
      sourcePptx: files.source,
      candidatePptx: files.candidate,
      findings: layout.risks,
      evidencePaths: {
        layoutSnapshot: files.layout,
        finalAudit: files.finalAudit,
        visionDiff: files.visionDiff,
        referenceMap: files.referenceMap,
      },
    })
    assert.equal(evaluation.status, 'pass')
    variant.mutate(evaluation)
    writeJson(evaluationPath, evaluation)

    const result = runNode(
      [
        join(skillRoot, 'scripts/cli/review/fidelity-gate.mjs'),
        '--mode',
        'refurbish',
        '--source-inspect',
        files.sourceInspect,
        '--source-pptx',
        files.source,
        '--candidate-pptx',
        files.candidate,
        '--reference-map',
        files.referenceMap,
        '--final-audit',
        files.finalAudit,
        '--vision-diff',
        files.visionDiff,
        '--layout-snapshot',
        files.layout,
        '--review-evaluation',
        evaluationPath,
        '--json',
      ],
      1,
    )
    const report = JSON.parse(result.stdout)
    assert.equal(report.status, 'fail')
    assert.ok(report.errors.some((item) => item.code === 'review-evaluation-semantic-invalid'))
  }
})

test('fidelity gate keeps an unreviewed empty placeholder actionable and rejects a stale rule', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-fidelity-review-fail-'))
  const unreviewed = writeFidelityFixture(join(root, 'unreviewed'), [])
  const unreviewedResult = runNode([
    join(skillRoot, 'scripts/cli/review/fidelity-gate.mjs'),
    '--mode',
    'refurbish',
    '--source-inspect',
    unreviewed.sourceInspect,
    '--source-pptx',
    unreviewed.source,
    '--candidate-pptx',
    unreviewed.candidate,
    '--reference-map',
    unreviewed.referenceMap,
    '--final-audit',
    unreviewed.finalAudit,
    '--vision-diff',
    unreviewed.visionDiff,
    '--layout-snapshot',
    unreviewed.layout,
    '--json',
  ])
  const unreviewedReport = JSON.parse(unreviewedResult.stdout)
  assert.equal(unreviewedReport.status, 'warn')
  assert.equal(unreviewedReport.summary.remainingActionableFindings, 1)

  const staleRoot = join(root, 'stale')
  mkdirSync(staleRoot, { recursive: true })
  const stale = writeFidelityFixture(staleRoot, [
    reviewRule({
      target: {
        ...reviewRule().target,
        slideIndex: 0,
        part: 'ppt/slides/slide1.xml',
        shapeId: 999,
      },
    }),
  ])
  const staleResult = runNode(
    [
      join(skillRoot, 'scripts/cli/review/fidelity-gate.mjs'),
      '--mode',
      'refurbish',
      '--source-inspect',
      stale.sourceInspect,
      '--source-pptx',
      stale.source,
      '--candidate-pptx',
      stale.candidate,
      '--reference-map',
      stale.referenceMap,
      '--final-audit',
      stale.finalAudit,
      '--vision-diff',
      stale.visionDiff,
      '--layout-snapshot',
      stale.layout,
      '--json',
    ],
    1,
  )
  const staleReport = JSON.parse(staleResult.stdout)
  assert.equal(staleReport.status, 'fail')
  assert.ok(staleReport.errors.some((item) => item.code === 'review-rule-unmatched'))
})

test('template gate accepts a layout fingerprint and rejects the legacy boolean exception', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-template-review-'))
  const { reviewFindingSha256 } = await loadReviewPolicyModule()
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const frameMap = join(root, 'frame-map.json')
  const sourceInspect = join(root, 'source-inspect.json')
  const reviewPolicy = join(root, 'review-policy.json')
  const legacyPlan = join(root, 'legacy-plan.json')
  writeFileSync(source, 'source pptx')
  writeStoredZip(candidate, {
    'ppt/slides/slide1.xml':
      '<p:sld xmlns:p="p" xmlns:a="a"><p:sp><p:nvSpPr><p:cNvPr id="101" name="Slide Number Placeholder"/><p:nvPr><p:ph type="sldNum" idx="12"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t></a:t></a:r></a:p></p:txBody></p:sp></p:sld>',
  })
  writeJson(frameMap, {
    schemaVersion: 'pptx-nova-template-frame-map/v1',
    outputSlides: [{ outputSlide: 0, sourceSlide: 0, reuseMode: 'preserve', editTargets: [] }],
  })
  writeJson(sourceInspect, {
    schemaVersion: 'pptx-inspect/v1',
    presentation: { slideCount: 1 },
    slides: [{ index: 0, shapes: [] }],
  })
  writeJson(reviewPolicy, {
    schemaVersion: 'pptx-nova-review-policy/v1',
    bindings: { sourceSha256: sha256(source) },
    reviewedFindings: [
      {
        id: 'slide-1-intentional-empty-sldnum',
        code: 'empty-placeholder',
        disposition: 'accepted',
        findingSha256: reviewFindingSha256(
          layoutFinding({
            slide: 0,
            slideIndex: 0,
            slideNumber: 1,
            slidePart: 'ppt/slides/slide1.xml',
            objectType: 'shape',
          }),
        ),
        reason: 'This placeholder intentionally remains empty.',
      },
    ],
  })

  const reviewedResult = runNode(
    [
      join(skillRoot, 'scripts/cli/edit/template-gate.mjs'),
      '--frame-map',
      frameMap,
      '--source-inspect',
      sourceInspect,
      '--source-pptx',
      source,
      '--final-pptx',
      candidate,
      '--review-policy',
      reviewPolicy,
      '--json',
    ],
    0,
    { env: envWithoutPath() },
  )
  const reviewedReport = JSON.parse(reviewedResult.stdout)
  assert.notEqual(reviewedReport.status, 'error')
  assert.equal(reviewedReport.summary.reviewedFindings, 1)
  assert.equal(reviewedReport.summary.remainingActionableFindings, 0)

  writeJson(legacyPlan, {
    edits: [
      {
        slide: 0,
        action: 'allow-empty-placeholder',
        placeholder: { type: 'sldNum', idx: 12 },
      },
    ],
  })
  const legacyResult = runNode(
    [
      join(skillRoot, 'scripts/cli/edit/template-gate.mjs'),
      '--frame-map',
      frameMap,
      '--source-inspect',
      sourceInspect,
      '--source-pptx',
      source,
      '--final-pptx',
      candidate,
      '--edit-plan',
      legacyPlan,
      '--json',
    ],
    1,
    { env: envWithoutPath() },
  )
  const legacyReport = JSON.parse(legacyResult.stdout)
  assert.ok(legacyReport.errors.some((item) => item.code === 'legacy-empty-placeholder-exception'))
})
