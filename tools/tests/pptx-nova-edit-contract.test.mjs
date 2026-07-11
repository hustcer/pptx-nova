import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const repoRoot = resolve('.')
const skillRoot = join(repoRoot, 'pptx-nova')
const contractScript = join(skillRoot, 'scripts/pptx-nova-edit-contract.mjs')
const gateScript = join(skillRoot, 'scripts/pptx-nova-edit-contract-gate.mjs')
const manifestScript = join(skillRoot, 'scripts/pptx-nova-edit-evidence-manifest.mjs')

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function runNode(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout)
  return result
}

function contractDraft() {
  return {
    schemaVersion: 'pptx-nova-edit-contract/v1',
    request: 'Rename the Cartesian cover title',
    scope: 'single-object',
    operationKind: 'text-edit',
    targets: [
      {
        id: 'cover-title',
        slide: 0,
        opIndexes: [0],
        selector: { shape: { id: 5 } },
        expected: {
          beforeText: 'Cartesian',
          afterText: 'Cartesian · P0 Contract Test',
          changeCategories: ['text'],
        },
      },
    ],
    coverage: { required: true, expectedTargetCount: 1 },
    allowedChanges: ['text'],
    preserve: ['slide-count', 'non-target-shapes', 'target-text-style'],
    requiredEvidence: [
      'dry-run',
      'semantic-diff',
      'style-diff',
      'png-preview',
      'vision-check',
      'vision-diff',
    ],
  }
}

function dryRunFixture({ covered = true, source = '', candidate = '' } = {}) {
  return {
    schemaVersion: 'pptx-dry-run/v1',
    status: 'success',
    input: source,
    wouldWrite: candidate,
    changedParts: ['ppt/slides/slide1.xml'],
    opResults: covered
      ? [
          {
            opIndex: 0,
            op: 'set-text',
            status: 'success',
            semanticChanges: [
              {
                category: 'text',
                action: 'updated',
                target: { kind: 'shape', slide: 0, id: 5, name: 'S0_Title' },
                after: 'Cartesian · P0 Contract Test',
              },
            ],
            resolvedSelectors: [
              {
                field: 'shape',
                input: { id: 5 },
                resolved: { kind: 'shape', slide: 0, id: 5, name: 'S0_Title' },
              },
            ],
          },
        ]
      : [],
  }
}

function changedShape({ id = 5, name = 'S0_Title', before = 'Cartesian', after } = {}) {
  return {
    conclusion: 'changed',
    reliability: 'reliable',
    category: 'text',
    categories: ['text'],
    source: { id, name, shapeType: 'textBox', textPreview: before },
    candidate: { id, name, shapeType: 'textBox', textPreview: after },
    changedFields: ['textPreview'],
    changes: [
      {
        category: 'text',
        field: 'textPreview',
        conclusion: 'changed',
        reliability: 'reliable',
        before,
        after,
      },
    ],
  }
}

function diffFixture({ outOfScope = false, source = '', candidate = '' } = {}) {
  const shapeChanges = [changedShape({ after: 'Cartesian · P0 Contract Test' })]
  if (outOfScope) {
    shapeChanges.push(
      changedShape({
        id: 6,
        name: 'S0_Description',
        before: 'Original description',
        after: 'Unexpected description change',
      }),
    )
  }
  return {
    schemaVersion: 'pptx-diff/v1',
    status: 'success',
    source,
    candidate,
    summary: {
      sourceSlideCount: 10,
      candidateSlideCount: 10,
      slideAdded: 0,
      slideRemoved: 0,
      reliableChanges: outOfScope ? 2 : 1,
      uncertainChanges: 0,
      unsupportedRegions: 0,
    },
    agentGate: { reliableOnly: true, requiresVisualReview: true },
    slides: [
      {
        index: 0,
        slide: 1,
        conclusion: 'changed',
        summaryChanges: [],
        shapeChanges,
        unsupported: [],
      },
    ],
  }
}

function previewFixture(candidate) {
  return {
    schemaVersion: 'pptx-preview/v1',
    status: 'success',
    input: { path: candidate, name: 'candidate.pptx' },
    slidesRequested: '1',
    slidesSelected: [1],
    pages: [{ index: 1, slide: 1, file: { status: 'ok', byteLength: 100 } }],
    contactSheet: { status: 'ok', byteLength: 100 },
  }
}

function visionFixture(candidate) {
  return {
    schemaVersion: 'pptx-vision/v1',
    status: 'success',
    input: candidate,
    scope: { requested: '1', slides: [1] },
    summary: { issueCount: 0, bySeverity: { high: 0, medium: 0, low: 0 } },
    deckResidualRisk: { issueCount: 0, bySeverity: { high: 0, medium: 0, low: 0 } },
  }
}

function visionDiffFixture({ passed = true, source = '', candidate = '' } = {}) {
  return {
    schemaVersion: 'pptx-vision-diff/v1',
    status: 'success',
    source,
    candidate,
    scope: { requested: '1', slides: [1] },
    summary: {
      newIssueCount: passed ? 0 : 1,
      worsenedIssueCount: 0,
      byClass: {
        new: { high: 0, medium: passed ? 0 : 1, low: 0 },
        worsened: { high: 0, medium: 0, low: 0 },
      },
    },
    agentGate: {
      passed,
      blockerCount: passed ? 0 : 1,
      newHighIssues: 0,
      newMediumIssues: passed ? 0 : 1,
      worsenedHighIssues: 0,
      worsenedMediumIssues: 0,
    },
  }
}

function styleDiffFixture({ passed = true, source = '', candidate = '' } = {}) {
  return {
    schemaVersion: 'pptx-i18n-style-diff/v1',
    status: passed ? 'pass' : 'fail',
    source,
    candidate,
    summary: {
      partsCompared: 1,
      unchangedParts: passed ? 1 : 0,
      changedParts: passed ? 0 : 1,
    },
    blockers: passed
      ? []
      : [
          {
            code: 'style-signature-changed',
            part: 'ppt/slides/slide1.xml',
            message: 'text replacement changed non-text OOXML style structure',
          },
        ],
    styleBlockers: passed
      ? []
      : [
          {
            code: 'style-signature-changed',
            part: 'ppt/slides/slide1.xml',
          },
        ],
    agentGate: { passed, blockerCount: passed ? 0 : 1, styleBlockerCount: passed ? 0 : 1 },
  }
}

function finalInspectFixture(candidate) {
  return {
    schemaVersion: 'pptx-inspect/v1',
    status: 'success',
    input: candidate,
    slides: [
      {
        index: 0,
        shapes: [{ id: 5, name: 'S0_Title', shapeType: 'textBox', textPreview: 'Cartesian' }],
      },
    ],
  }
}

function writeFixture({
  outOfScope = false,
  covered = true,
  stylePassed = true,
  visionDiffPassed = true,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-edit-contract-'))
  const runDir = join(root, 'run')
  mkdirSync(runDir, { recursive: true })
  const source = join(root, 'source.pptx')
  const candidate = join(runDir, 'candidate.pptx')
  const draft = join(runDir, 'edit-contract-draft.json')
  const contract = join(runDir, 'edit-contract.json')
  const dryRun = join(runDir, 'dry-run.json')
  const diff = join(runDir, 'pptx-diff.json')
  const preview = join(runDir, 'preview.json')
  const vision = join(runDir, 'vision.json')
  const visionDiff = join(runDir, 'vision-diff.json')
  const styleDiff = join(runDir, 'style-diff.json')
  const finalInspect = join(runDir, 'final-inspect.json')
  const evidenceManifest = join(runDir, 'evidence-manifest.json')
  const gate = join(runDir, 'edit-contract-gate.json')
  writeFileSync(source, 'stable pptx fixture bytes')
  writeFileSync(candidate, 'candidate pptx fixture bytes')
  writeJson(draft, contractDraft())
  writeJson(dryRun, dryRunFixture({ covered, source, candidate }))
  writeJson(diff, diffFixture({ outOfScope, source, candidate }))
  writeJson(preview, previewFixture(candidate))
  writeJson(vision, visionFixture(candidate))
  writeJson(visionDiff, visionDiffFixture({ passed: visionDiffPassed, source, candidate }))
  writeJson(styleDiff, styleDiffFixture({ passed: stylePassed, source, candidate }))
  writeJson(finalInspect, finalInspectFixture(candidate))
  return {
    root,
    runDir,
    source,
    candidate,
    draft,
    contract,
    dryRun,
    diff,
    preview,
    vision,
    visionDiff,
    styleDiff,
    finalInspect,
    evidenceManifest,
    gate,
  }
}

function generateContract(fixture) {
  const result = runNode([
    contractScript,
    '--draft',
    fixture.draft,
    '--source',
    fixture.source,
    '--output',
    fixture.contract,
    '--json',
  ])
  return JSON.parse(result.stdout)
}

function writeManifest(fixture) {
  const contract = JSON.parse(readFileSync(fixture.contract, 'utf8'))
  const paths = {
    'semantic-diff': fixture.diff,
    'style-diff': fixture.styleDiff,
    'png-preview': fixture.preview,
    'vision-check': fixture.vision,
    'vision-diff': fixture.visionDiff,
    'final-inspect': fixture.finalInspect,
  }
  const args = [manifestScript, '--candidate', fixture.candidate]
  for (const kind of contract.requiredEvidence.filter((item) => item !== 'dry-run')) {
    args.push('--evidence', `${kind}=${paths[kind]}`)
  }
  args.push('--output', fixture.evidenceManifest, '--overwrite', '--json')
  runNode(args)
}

function runGate(fixture, expectedStatus = 0, { refreshManifest = true } = {}) {
  if (refreshManifest) writeManifest(fixture)
  const result = runNode(
    [
      gateScript,
      '--contract',
      fixture.contract,
      '--candidate',
      fixture.candidate,
      '--dry-run',
      fixture.dryRun,
      '--diff',
      fixture.diff,
      '--preview',
      fixture.preview,
      '--vision',
      fixture.vision,
      '--vision-diff',
      fixture.visionDiff,
      '--final-inspect',
      fixture.finalInspect,
      '--evidence-manifest',
      fixture.evidenceManifest,
      '--style-diff',
      fixture.styleDiff,
      '--output',
      fixture.gate,
      '--overwrite',
      '--strict',
      '--json',
    ],
    expectedStatus,
  )
  return JSON.parse(result.stdout)
}

test('edit contract generator binds the draft to the current source bytes', () => {
  const fixture = writeFixture()
  const contract = generateContract(fixture)

  assert.equal(contract.schemaVersion, 'pptx-nova-edit-contract/v1')
  assert.equal(contract.source.pptx, resolve(fixture.source))
  assert.match(contract.source.sha256, /^[a-f0-9]{64}$/)
  assert.equal(contract.targets[0].id, 'cover-title')
  assert.equal(contract.coverage.expectedTargetCount, 1)
  assert.equal(readFileSync(fixture.contract, 'utf8'), `${JSON.stringify(contract, null, 2)}\n`)
})

test('edit contract generator defaults to the kebab-case artifact name', () => {
  const fixture = writeFixture()
  const result = runNode([
    contractScript,
    '--draft',
    fixture.draft,
    '--source',
    fixture.source,
    '--json',
  ])

  assert.equal(JSON.parse(result.stdout).schemaVersion, 'pptx-nova-edit-contract/v1')
  assert.equal(readFileSync(fixture.contract, 'utf8').startsWith('{'), true)
})

test('edit contract generator rejects query selectors without an inspect-proven identity', () => {
  const fixture = writeFixture()
  const draft = JSON.parse(readFileSync(fixture.draft, 'utf8'))
  draft.targets[0].selector = { shape: { query: { textRegex: '^Cartesian$' } } }
  writeJson(fixture.draft, draft)
  const result = spawnSync(
    process.execPath,
    [
      contractScript,
      '--draft',
      fixture.draft,
      '--source',
      fixture.source,
      '--output',
      fixture.contract,
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )

  assert.equal(result.status, 1)
  assert.match(result.stderr, /stable selector id\/name or resolvedIdentity/)
})

test('edit contract gate rejects a hand-written contract without a stable object identity', () => {
  const fixture = writeFixture()
  generateContract(fixture)
  const contract = JSON.parse(readFileSync(fixture.contract, 'utf8'))
  contract.targets[0].resolvedIdentity = { slide: 0, id: null, name: null }
  contract.targets[0].selector = { shape: { query: { textRegex: '^Cartesian$' } } }
  writeJson(fixture.contract, contract)
  const result = spawnSync(
    process.execPath,
    [gateScript, '--contract', fixture.contract, '--candidate', fixture.candidate, '--json'],
    { cwd: repoRoot, encoding: 'utf8' },
  )

  assert.equal(result.status, 1)
  assert.match(result.stderr, /stable resolvedIdentity/)
})

test('edit contract gate passes a covered local edit with scoped visual evidence', () => {
  const fixture = writeFixture()
  generateContract(fixture)
  const report = runGate(fixture)

  assert.equal(report.status, 'pass')
  assert.equal(report.agentGate.passed, true)
  assert.equal(report.agentGate.nextAction, 'publish')
  assert.equal(report.summary.targetCount, 1)
  assert.equal(report.summary.coveredTargetCount, 1)
  assert.equal(report.summary.outOfScopeReliableChangeCount, 0)
})

test('edit contract gate blocks a stale source before selector evidence is trusted', () => {
  const fixture = writeFixture()
  generateContract(fixture)
  writeFileSync(fixture.source, 'source changed after inspect')
  writeManifest(fixture)
  const report = runGate(fixture, 2, { refreshManifest: false })

  assert.equal(report.status, 'fail')
  assert.equal(report.agentGate.nextAction, 'refresh-inspect')
  assert.ok(report.blockers.some((item) => item.code === 'source-hash-stale'))
})

test('edit contract gate blocks required targets missing from dry-run coverage', () => {
  const fixture = writeFixture({ covered: false })
  generateContract(fixture)
  const report = runGate(fixture, 2)

  assert.equal(report.status, 'fail')
  assert.equal(report.agentGate.nextAction, 'complete-missing-coverage')
  assert.equal(report.summary.coveredTargetCount, 0)
  assert.ok(report.blockers.some((item) => item.code === 'target-coverage-incomplete'))
})

test('edit contract gate blocks reliable changes to non-target shapes', () => {
  const fixture = writeFixture({ outOfScope: true })
  generateContract(fixture)
  const report = runGate(fixture, 2)

  assert.equal(report.status, 'fail')
  assert.equal(report.agentGate.nextAction, 'review-out-of-scope-changes')
  assert.equal(report.summary.outOfScopeReliableChangeCount, 1)
  assert.ok(report.blockers.some((item) => item.code === 'reliable-change-outside-contract'))
})

test('edit contract gate blocks text edits that change the target OOXML style signature', () => {
  const fixture = writeFixture({ stylePassed: false })
  generateContract(fixture)
  const report = runGate(fixture, 2)

  assert.equal(report.status, 'fail')
  assert.equal(report.agentGate.nextAction, 'retry-with-style-preserving-text-edit')
  assert.ok(report.blockers.some((item) => item.code === 'target-text-style-changed'))
})

test('edit contract gate blocks evidence generated for a different candidate', () => {
  const fixture = writeFixture()
  generateContract(fixture)
  const preview = JSON.parse(readFileSync(fixture.preview, 'utf8'))
  preview.input.path = join(fixture.runDir, 'different-candidate.pptx')
  writeJson(fixture.preview, preview)
  const report = runGate(fixture, 2)

  assert.equal(report.status, 'fail')
  assert.equal(report.agentGate.nextAction, 'regenerate-current-candidate-evidence')
  assert.ok(report.blockers.some((item) => item.code === 'evidence-candidate-mismatch'))
})

test('edit contract gate blocks old evidence after the candidate is overwritten in place', () => {
  const fixture = writeFixture()
  generateContract(fixture)
  writeManifest(fixture)
  writeFileSync(fixture.candidate, 'overwritten candidate bytes')
  const past = new Date(Date.now() - 5000)
  utimesSync(fixture.candidate, past, past)
  const report = runGate(fixture, 2, { refreshManifest: false })

  assert.equal(report.agentGate.nextAction, 'regenerate-current-candidate-evidence')
  assert.ok(report.blockers.some((item) => item.code === 'evidence-manifest-candidate-mismatch'))
})

test('edit contract gate blocks dry-run operations not owned by a target', () => {
  const fixture = writeFixture()
  generateContract(fixture)
  const dryRun = JSON.parse(readFileSync(fixture.dryRun, 'utf8'))
  dryRun.opResults.push({ opIndex: 1, op: 'set-text', status: 'success' })
  writeJson(fixture.dryRun, dryRun)
  const report = runGate(fixture, 2)

  assert.equal(report.agentGate.nextAction, 'review-out-of-scope-changes')
  assert.ok(report.blockers.some((item) => item.code === 'dry-run-op-outside-contract'))
})

test('edit contract gate accepts an inspect-proven already-compliant target', () => {
  const fixture = writeFixture()
  const draft = JSON.parse(readFileSync(fixture.draft, 'utf8'))
  draft.targets[0].expected = {
    beforeText: 'Cartesian',
    afterText: 'Cartesian',
    alreadyCompliant: true,
    changeCategories: ['text'],
  }
  writeJson(fixture.draft, draft)
  const dryRun = JSON.parse(readFileSync(fixture.dryRun, 'utf8'))
  dryRun.opResults[0].semanticChanges = []
  writeJson(fixture.dryRun, dryRun)
  const diff = JSON.parse(readFileSync(fixture.diff, 'utf8'))
  diff.summary.reliableChanges = 0
  diff.slides[0].shapeChanges = []
  diff.slides[0].conclusion = 'unchanged'
  writeJson(fixture.diff, diff)
  const inspect = finalInspectFixture(fixture.candidate)
  inspect.slides[0].shapes[0].textPreview = 'Cartesian'
  writeJson(fixture.finalInspect, inspect)
  generateContract(fixture)
  const report = runGate(fixture)

  assert.equal(report.agentGate.passed, true)
  assert.equal(report.targetCoverage[0].alreadyCompliant, true)
})

test('structural contracts verify expected slide scope and object types', () => {
  const fixture = writeFixture()
  const draft = JSON.parse(readFileSync(fixture.draft, 'utf8'))
  draft.scope = 'structural'
  draft.expectedStructure = {
    slideCountDelta: 0,
    changedSlides: [0],
    objectTypes: ['textBox'],
  }
  writeJson(fixture.draft, draft)
  const contract = generateContract(fixture)
  const report = runGate(fixture)

  assert.deepEqual(contract.expectedStructure.changedSlides, [0])
  assert.equal(report.agentGate.passed, true)
})

test('structural contracts support a newly added slide without a pre-existing shape identity', () => {
  const fixture = writeFixture()
  const draft = JSON.parse(readFileSync(fixture.draft, 'utf8'))
  draft.scope = 'structural'
  draft.targets[0] = {
    id: 'new-slide-11',
    kind: 'slide',
    slide: 10,
    opIndexes: [0],
    expected: { changeCategories: ['structure'] },
  }
  draft.allowedChanges = ['structure']
  draft.preserve = ['non-target-shapes']
  draft.requiredEvidence = ['dry-run', 'semantic-diff', 'png-preview', 'vision-diff']
  draft.expectedStructure = { slideCountDelta: 1, changedSlides: [10], objectTypes: [] }
  writeJson(fixture.draft, draft)
  const dryRun = JSON.parse(readFileSync(fixture.dryRun, 'utf8'))
  dryRun.opResults[0].semanticChanges = []
  dryRun.opResults[0].resolvedSelectors = []
  writeJson(fixture.dryRun, dryRun)
  const diff = JSON.parse(readFileSync(fixture.diff, 'utf8'))
  diff.summary.candidateSlideCount = 11
  diff.summary.slideAdded = 1
  diff.summary.reliableChanges = 0
  diff.slides = [{ index: 10, slide: 11, conclusion: 'added', shapeChanges: [] }]
  writeJson(fixture.diff, diff)
  const preview = previewFixture(fixture.candidate)
  preview.slidesRequested = '11'
  preview.slidesSelected = [11]
  preview.pages = [{ index: 11, slide: 11, file: { status: 'ok', byteLength: 100 } }]
  writeJson(fixture.preview, preview)
  const visionDiff = visionDiffFixture({
    passed: true,
    source: fixture.source,
    candidate: fixture.candidate,
  })
  visionDiff.scope = { requested: '11', slides: [11] }
  writeJson(fixture.visionDiff, visionDiff)
  const contract = generateContract(fixture)
  const report = runGate(fixture)

  assert.equal(contract.targets[0].kind, 'slide')
  assert.equal(report.agentGate.passed, true)
})

test('edit contract gate blocks a diff whose target source text no longer matches the contract', () => {
  const fixture = writeFixture()
  generateContract(fixture)
  const diff = JSON.parse(readFileSync(fixture.diff, 'utf8'))
  diff.slides[0].shapeChanges[0].source.textPreview = 'Different title before edit'
  diff.slides[0].shapeChanges[0].changes[0].before = 'Different title before edit'
  writeJson(fixture.diff, diff)
  const report = runGate(fixture, 2)

  assert.equal(report.status, 'fail')
  assert.equal(report.agentGate.nextAction, 'refresh-inspect')
  assert.ok(report.blockers.some((item) => item.code === 'expected-before-not-observed'))
})

test('edit contract gate blocks new medium visual regressions on the changed scope', () => {
  const fixture = writeFixture({ visionDiffPassed: false })
  generateContract(fixture)
  const report = runGate(fixture, 2)

  assert.equal(report.status, 'fail')
  assert.equal(report.agentGate.nextAction, 'repair-new-visual-regressions')
  assert.ok(report.blockers.some((item) => item.code === 'vision-diff-new-regression'))
})
