import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const repoRoot = resolve('.')
const skillRoot = join(repoRoot, 'pptx-nova')
const contractScript = join(skillRoot, 'scripts/pptx-nova-edit-contract.mjs')
const gateScript = join(skillRoot, 'scripts/pptx-nova-edit-contract-gate.mjs')
const manifestScript = join(skillRoot, 'scripts/pptx-nova-edit-evidence-manifest.mjs')
const sessionRulesScript = join(skillRoot, 'scripts/pptx-nova-session-rules.mjs')
const sessionResolveScript = join(skillRoot, 'scripts/pptx-nova-session-rules-resolve.mjs')

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
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
    semanticIssues: [],
    opResults: covered
      ? [
          {
            opIndex: 0,
            op: 'set-text-frame',
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
  const copySizeGate = join(runDir, 'copy-size-gate.json')
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
    copySizeGate,
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

function generateContract(fixture, { sessionResolution = '' } = {}) {
  const args = [
    contractScript,
    '--draft',
    fixture.draft,
    '--source',
    fixture.source,
    '--output',
    fixture.contract,
    '--json',
  ]
  if (sessionResolution)
    args.splice(args.length - 1, 0, '--session-rules-resolution', sessionResolution)
  const result = runNode(args)
  return JSON.parse(result.stdout)
}

function writeManifest(fixture) {
  const contract = JSON.parse(readFileSync(fixture.contract, 'utf8'))
  const paths = {
    'semantic-diff': fixture.diff,
    'copy-size-gate': fixture.copySizeGate,
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
      '--copy-size-gate',
      fixture.copySizeGate,
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

function sessionRuleSlideXml({
  color = '0076A8',
  elementKind = 'slide-title',
  shapeName = 'S8_Title',
} = {}) {
  const shapeFill =
    elementKind === 'summary-box'
      ? `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`
      : '<a:noFill/>'
  const runFill =
    elementKind === 'slide-title' ? `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="${shapeName}"/></p:nvSpPr>
  <p:spPr>${shapeFill}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r>
  <a:rPr lang="en-US" sz="1800">${runFill}<a:latin typeface="Arial"/></a:rPr>
  <a:t>P1 Session Rules</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`
}

function writeSessionRuleFixture({
  color = '0076A8',
  elementKind = 'slide-title',
  expectedColor = elementKind === 'summary-box' ? 'F2F2F2' : '0076A8',
  decoyColor = '',
} = {}) {
  const fixture = writeFixture()
  const shapeName = elementKind === 'summary-box' ? 'S8_SummaryBox' : 'S8_Title'
  const ruleId =
    elementKind === 'summary-box' ? 'rule-future-summary-fill' : 'rule-future-title-blue'
  fixture.sessionRulesDraft = join(fixture.runDir, 'session-rules-draft.json')
  fixture.sessionRules = join(fixture.runDir, 'session-rules.json')
  fixture.sessionOperation = join(fixture.runDir, 'session-operation.json')
  fixture.sessionResolution = join(fixture.runDir, 'session-rules-resolution.json')

  const zipEntries = {}
  if (decoyColor) {
    zipEntries['ppt/slides/slide1.xml'] = sessionRuleSlideXml({
      color: decoyColor,
      elementKind,
      shapeName,
    })
  }
  zipEntries['ppt/slides/slide9.xml'] = sessionRuleSlideXml({ color, elementKind, shapeName })
  writeStoredZip(fixture.candidate, zipEntries)
  writeJson(fixture.sessionRulesDraft, {
    schemaVersion: 'pptx-nova-session-rules/v1',
    deckIdentity: { deckId: 'deck-session-rule-gate' },
    rules: [
      {
        id: ruleId,
        kind: 'future-element-style',
        status: 'active',
        lifetime: 'current-deck',
        trigger: { event: 'slide-added' },
        target: { slideScope: 'future', elementKind },
        action:
          elementKind === 'summary-box'
            ? { fillColor: expectedColor }
            : { fontColor: expectedColor },
        source: {
          kind: 'user-feedback',
          turn: 3,
          quote:
            elementKind === 'summary-box'
              ? '后续新增 summary box 使用浅灰背景'
              : '后续新增页标题继续使用蓝色',
        },
        supersedes: [],
      },
    ],
  })
  writeJson(fixture.sessionOperation, {
    schemaVersion: 'pptx-nova-session-operation/v1',
    event: 'slide-added',
    slideCountDelta: 1,
    targets: [
      {
        id: elementKind === 'summary-box' ? 'new-summary-box' : 'new-slide-title',
        kind: 'produced-object',
        slide: 8,
        elementKind,
        shapeName,
        opIndexes: [1, 2],
        changeCategories: ['shape', 'text'],
      },
    ],
    explicitOverrides: [],
  })
  runNode([
    sessionRulesScript,
    '--draft',
    fixture.sessionRulesDraft,
    '--source',
    fixture.source,
    '--output',
    fixture.sessionRules,
    '--json',
  ])
  runNode([
    sessionResolveScript,
    '--rules',
    fixture.sessionRules,
    '--operation',
    fixture.sessionOperation,
    '--source',
    fixture.source,
    '--output',
    fixture.sessionResolution,
    '--strict',
    '--json',
  ])

  const draft = contractDraft()
  draft.request = 'Add a slide and carry the session title color rule forward'
  draft.scope = 'structural'
  draft.operationKind = 'add-slide'
  draft.targets = [
    {
      id: 'new-slide-9',
      kind: 'slide',
      slide: 8,
      opIndexes: [0],
      expected: { changeCategories: ['structure'] },
    },
  ]
  draft.coverage.expectedTargetCount = 1
  draft.allowedChanges = ['structure']
  draft.preserve = []
  draft.requiredEvidence = ['dry-run', 'semantic-diff', 'png-preview', 'vision-diff']
  draft.expectedStructure = { slideCountDelta: 1, changedSlides: [8], objectTypes: [] }
  writeJson(fixture.draft, draft)

  writeJson(fixture.dryRun, {
    schemaVersion: 'pptx-dry-run/v1',
    status: 'success',
    input: fixture.source,
    wouldWrite: fixture.candidate,
    semanticIssues: [],
    opResults: [
      {
        opIndex: 0,
        op: 'add-slide',
        status: 'success',
        semanticChanges: [],
        resolvedSelectors: [],
      },
      {
        opIndex: 1,
        op: 'add-text-box',
        status: 'success',
        semanticChanges: [
          {
            category: 'shape',
            action: 'added',
            target: { kind: 'shape', slide: 8, id: 2, name: shapeName },
          },
          {
            category: 'text',
            action: 'updated',
            target: { kind: 'shape', slide: 8, id: 2, name: shapeName },
            after: 'P1 Session Rules',
          },
        ],
        resolvedSelectors: [],
      },
      {
        opIndex: 2,
        op: 'set-run',
        status: 'success',
        semanticChanges: [
          {
            category: 'text',
            action: 'updated',
            target: { kind: 'shape', slide: 8, id: 2, name: shapeName },
          },
        ],
        resolvedSelectors: [
          {
            field: 'shape',
            input: { name: shapeName },
            resolved: { kind: 'shape', slide: 8, id: 2, name: shapeName },
          },
        ],
      },
    ],
  })
  writeJson(fixture.diff, {
    schemaVersion: 'pptx-diff/v1',
    status: 'success',
    source: fixture.source,
    candidate: fixture.candidate,
    summary: {
      sourceSlideCount: 8,
      candidateSlideCount: 9,
      slideAdded: 1,
      slideRemoved: 0,
      reliableChanges: 0,
      uncertainChanges: 0,
      unsupportedRegions: 0,
    },
    slides: [{ index: 8, slide: 9, conclusion: 'added', shapeChanges: [], unsupported: [] }],
  })
  const preview = previewFixture(fixture.candidate)
  preview.slidesRequested = '9'
  preview.slidesSelected = [9]
  preview.pages = [{ index: 9, slide: 9, file: { status: 'ok', byteLength: 100 } }]
  writeJson(fixture.preview, preview)
  const visionDiff = visionDiffFixture({
    passed: true,
    source: fixture.source,
    candidate: fixture.candidate,
  })
  visionDiff.scope = { requested: '9', slides: [9] }
  writeJson(fixture.visionDiff, visionDiff)
  writeJson(fixture.finalInspect, {
    schemaVersion: 'pptx-inspect/v1',
    status: 'success',
    input: fixture.candidate,
    slides: [
      {
        index: 8,
        shapes: [
          {
            id: 2,
            name: shapeName,
            shapeType: 'textBox',
            textPreview: 'P1 Session Rules',
          },
        ],
      },
    ],
  })
  return fixture
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

test('edit contract gate fails closed when dry-run semantic evidence is missing', () => {
  const fixture = writeFixture()
  generateContract(fixture)
  const dryRun = JSON.parse(readFileSync(fixture.dryRun, 'utf8'))
  delete dryRun.semanticIssues
  writeJson(fixture.dryRun, dryRun)
  const report = runGate(fixture, 2)

  assert.equal(report.status, 'fail')
  assert.ok(report.blockers.some((item) => item.code === 'dry-run-semantic-evidence-missing'))
})

test('edit contract gate blocks semantic regressions introduced by the edit', () => {
  const fixture = writeFixture()
  generateContract(fixture)
  const dryRun = JSON.parse(readFileSync(fixture.dryRun, 'utf8'))
  dryRun.semanticIssues = [
    {
      code: 'dangling-rel',
      ruleId: 'sdk/relationship-exists/a:blip/embed',
      part: 'ppt/slides/slide1.xml',
      message: 'new image relationship is missing',
    },
  ]
  writeJson(fixture.dryRun, dryRun)
  const report = runGate(fixture, 2)

  assert.equal(report.status, 'fail')
  assert.ok(report.blockers.some((item) => item.code === 'dry-run-semantic-regression'))
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
  dryRun.opResults.push({ opIndex: 1, op: 'set-text-frame', status: 'success' })
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

function writeCopyFromContractFixture() {
  const fixture = writeFixture()
  fixture.donor = join(fixture.root, 'donor.pptx')
  writeFileSync(fixture.donor, 'donor pptx fixture bytes')
  const draft = JSON.parse(readFileSync(fixture.draft, 'utf8'))
  draft.request = 'Append donor slide 3 to the target deck'
  draft.scope = 'structural'
  draft.operationKind = 'copy-from'
  draft.targets = [
    {
      id: 'copied-slide-11',
      kind: 'slide',
      slide: 10,
      opIndexes: [0],
      expected: {
        changeCategories: ['structure'],
        copyFrom: { sourceSlide: 2, sourcePptx: fixture.donor },
      },
    },
  ]
  draft.coverage.expectedTargetCount = 1
  draft.allowedChanges = ['structure']
  draft.preserve = ['non-target-slides']
  draft.requiredEvidence = [
    'dry-run',
    'semantic-diff',
    'png-preview',
    'vision-check',
    'vision-diff',
  ]
  draft.expectedStructure = { slideCountDelta: 1, changedSlides: [10], objectTypes: [] }
  writeJson(fixture.draft, draft)
  writeJson(fixture.dryRun, {
    schemaVersion: 'pptx-copy-from/v2',
    status: 'ready',
    input: fixture.source,
    source: { path: fixture.donor, slides: [2] },
    selection: { mode: 'slides', sourceSlides: [2], sourceSlides1Based: [3] },
    dryRun: true,
    wouldWrite: fixture.candidate,
    candidate: fixture.candidate,
    transaction: {
      rollbackBoundary: 'entire-copy-batch',
      sourceSlides: [2],
      targetSlideCountBefore: 10,
      targetSlideCountAfter: 11,
    },
    copied: [
      {
        sourceSlide: 2,
        targetSlide: 10,
        sourceSlidePartName: 'ppt/slides/slide3.xml',
        sourceSlideRelsPartName: 'ppt/slides/_rels/slide3.xml.rels',
        targetSlidePartName: 'ppt/slides/slide11.xml',
        targetSlideRelsPartName: 'ppt/slides/_rels/slide11.xml.rels',
        dependencies: [
          {
            sourcePartName: 'ppt/slideLayouts/slideLayout1.xml',
            targetPartName: 'ppt/slideLayouts/slideLayout1.xml',
          },
        ],
      },
    ],
    dependencyMappings: [
      {
        sourceSlide: 2,
        targetSlide: 10,
        sourcePartName: 'ppt/slideLayouts/slideLayout1.xml',
        targetPartName: 'ppt/slideLayouts/slideLayout1.xml',
      },
    ],
    changedParts: [
      'ppt/presentation.xml',
      'ppt/_rels/presentation.xml.rels',
      '[Content_Types].xml',
      'ppt/slides/slide11.xml',
      'ppt/slides/_rels/slide11.xml.rels',
    ],
    preflight: {
      ready: true,
      readOnly: true,
      strategy: { template: 'register-source', slideSize: 'require-match' },
      sourceFileSha256: sha256(fixture.donor),
      targetFileSha256: sha256(fixture.source),
      sourceFingerprint: 'd'.repeat(64),
      targetFingerprint: 'e'.repeat(64),
      targetSlideCountBefore: 10,
      targetSlideCountAfter: 11,
      summary: {
        partCount: 3,
        relationshipCount: 1,
        blockerCount: 0,
        riskCount: 0,
        actions: { add: 2, reuse: 1 },
        templateOutcomes: { 'reused-source': 1 },
      },
      templates: [
        {
          sourceSlides: [2],
          outcome: 'reused-source',
          layout: {
            sourcePartName: 'ppt/slideLayouts/slideLayout1.xml',
            targetPartName: 'ppt/slideLayouts/slideLayout1.xml',
            fingerprint: 'f'.repeat(64),
            registrationId: null,
            relationshipId: null,
          },
          master: {
            sourcePartName: 'ppt/slideMasters/slideMaster1.xml',
            targetPartName: 'ppt/slideMasters/slideMaster1.xml',
            fingerprint: '1'.repeat(64),
            registrationId: null,
            relationshipId: null,
          },
          theme: {
            sourcePartName: 'ppt/theme/theme1.xml',
            targetPartName: 'ppt/theme/theme1.xml',
            fingerprint: '2'.repeat(64),
          },
          rollbackBoundary: 'entire-copy-batch',
        },
      ],
      parts: [
        {
          sourceSlide: 2,
          sourcePartName: 'ppt/slides/slide3.xml',
          targetPartName: 'ppt/slides/slide11.xml',
          role: 'slide',
          action: 'add',
          depth: 0,
          sourceSha256: 'a'.repeat(64),
          targetSha256: null,
          conflictingTargetSha256: null,
        },
        {
          sourceSlide: 2,
          sourcePartName: 'ppt/slides/_rels/slide3.xml.rels',
          targetPartName: 'ppt/slides/_rels/slide11.xml.rels',
          role: 'relationship',
          action: 'add',
          depth: 1,
          sourceSha256: 'b'.repeat(64),
          targetSha256: null,
          conflictingTargetSha256: null,
        },
        {
          sourceSlide: 2,
          sourcePartName: 'ppt/slideLayouts/slideLayout1.xml',
          targetPartName: 'ppt/slideLayouts/slideLayout1.xml',
          role: 'layout',
          action: 'reuse',
          depth: 1,
          sourceSha256: 'c'.repeat(64),
          targetSha256: 'c'.repeat(64),
          conflictingTargetSha256: null,
        },
      ],
      relationships: [
        {
          sourceSlide: 2,
          sourceOwnerPartName: 'ppt/slides/slide3.xml',
          targetOwnerPartName: 'ppt/slides/slide11.xml',
          relationshipId: 'rId1',
          relationshipType:
            'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
          targetMode: 'internal',
          sourceTarget: 'ppt/slideLayouts/slideLayout1.xml',
          targetPartName: 'ppt/slideLayouts/slideLayout1.xml',
          action: 'reuse',
          depth: 1,
        },
      ],
      blockers: [],
      risks: [],
      preserveOnlyRisks: [],
    },
  })
  writeJson(fixture.copySizeGate, {
    schemaVersion: 'pptx-nova-copy-size-gate/v1',
    status: 'pass',
    target: {
      path: fixture.source,
      fileSha256: sha256(fixture.source),
      slideSize: { wEmu: '12192000', hEmu: '6858000' },
    },
    donor: {
      path: fixture.donor,
      fileSha256: sha256(fixture.donor),
      slideSize: { wEmu: '12192000', hEmu: '6858000' },
    },
    slideSizeComparison: { matches: true },
    agentGate: { passed: true, nextAction: 'continue-copy-from', failures: [] },
  })
  writeJson(fixture.diff, {
    schemaVersion: 'pptx-diff/v1',
    status: 'success',
    source: fixture.source,
    candidate: fixture.candidate,
    summary: {
      sourceSlideCount: 10,
      candidateSlideCount: 11,
      slideAdded: 1,
      slideRemoved: 0,
      reliableChanges: 0,
      uncertainChanges: 0,
      unsupportedRegions: 0,
    },
    slides: [{ index: 10, slide: 11, conclusion: 'added', shapeChanges: [], unsupported: [] }],
  })
  const preview = previewFixture(fixture.candidate)
  preview.slidesRequested = '11'
  preview.slidesSelected = [11]
  preview.pages = [{ index: 11, slide: 11, file: { status: 'ok', byteLength: 100 } }]
  writeJson(fixture.preview, preview)
  const vision = visionFixture(fixture.candidate)
  vision.scope = { requested: '11', slides: [11] }
  writeJson(fixture.vision, vision)
  const visionDiff = visionDiffFixture({
    passed: true,
    source: fixture.source,
    candidate: fixture.candidate,
  })
  visionDiff.scope = { requested: '11', slides: [11] }
  writeJson(fixture.visionDiff, visionDiff)
  return fixture
}

test('edit contract gate accepts file-bound and package-fingerprinted copy-from/v2 evidence', () => {
  const fixture = writeCopyFromContractFixture()
  const contract = generateContract(fixture)
  const report = runGate(fixture)

  assert.equal(contract.requiredEvidence.includes('copy-size-gate'), true)
  assert.equal(report.agentGate.passed, true)
  assert.equal(report.summary.coveredTargetCount, 1)
  assert.equal(report.targetCoverage[0].copyFrom.sourceSlide, 2)
  assert.equal(report.targetCoverage[0].copyFrom.targetSlidePartName, 'ppt/slides/slide11.xml')
  assert.equal(JSON.parse(readFileSync(fixture.dryRun, 'utf8')).preflight.templates.length, 1)
  assert.equal(
    report.checks.some((item) => item.name === 'copy-from-preflight' && item.status === 'pass'),
    true,
  )
  assert.equal('opResults' in JSON.parse(readFileSync(fixture.dryRun, 'utf8')), false)
})

test('edit contract gate blocks copy-from when donor and target slide sizes differ', () => {
  const fixture = writeCopyFromContractFixture()
  const sizeGate = JSON.parse(readFileSync(fixture.copySizeGate, 'utf8'))
  sizeGate.status = 'fail'
  sizeGate.donor.slideSize = { wEmu: '13439775', hEmu: '7559675' }
  sizeGate.slideSizeComparison.matches = false
  sizeGate.agentGate = {
    passed: false,
    nextAction: 'choose-explicit-slide-size-strategy',
    failures: [{ code: 'slide-size-mismatch' }],
  }
  writeJson(fixture.copySizeGate, sizeGate)
  generateContract(fixture)
  const report = runGate(fixture, 2)

  assert.equal(report.agentGate.passed, false)
  assert.equal(report.agentGate.nextAction, 'choose-explicit-slide-size-strategy')
  assert.equal(
    report.blockers.some((item) => item.code === 'copy-size-gate-failed'),
    true,
  )
})

test('edit contract gate rejects copy-from evidence bound to the wrong donor slide', () => {
  const fixture = writeCopyFromContractFixture()
  const evidence = JSON.parse(readFileSync(fixture.dryRun, 'utf8'))
  evidence.copied[0].sourceSlide = 1
  writeJson(fixture.dryRun, evidence)
  generateContract(fixture)
  const report = runGate(fixture, 2)

  assert.equal(report.agentGate.passed, false)
  assert.equal(
    report.blockers.some((item) => item.code === 'copy-from-source-slide-mismatch'),
    true,
  )
})

test('edit contract gate rejects a stale copy-from donor file SHA-256', () => {
  const fixture = writeCopyFromContractFixture()
  const evidence = JSON.parse(readFileSync(fixture.dryRun, 'utf8'))
  evidence.preflight.sourceFileSha256 = '0'.repeat(64)
  writeJson(fixture.dryRun, evidence)
  generateContract(fixture)
  const report = runGate(fixture, 2)

  assert.equal(report.agentGate.passed, false)
  assert.equal(
    report.blockers.some((item) => item.code === 'copy-from-source-file-sha256-mismatch'),
    true,
  )
})

test('edit contract gate rejects an invalid normalized package fingerprint', () => {
  const fixture = writeCopyFromContractFixture()
  const evidence = JSON.parse(readFileSync(fixture.dryRun, 'utf8'))
  evidence.preflight.sourceFingerprint = 'not-a-sha256'
  writeJson(fixture.dryRun, evidence)
  generateContract(fixture)
  const report = runGate(fixture, 2)

  assert.equal(report.agentGate.passed, false)
  assert.equal(
    report.blockers.some((item) => item.code === 'copy-from-package-fingerprint-invalid'),
    true,
  )
})

test('edit contract gate rejects copy-from evidence missing the planned slide part', () => {
  const fixture = writeCopyFromContractFixture()
  const evidence = JSON.parse(readFileSync(fixture.dryRun, 'utf8'))
  evidence.preflight.parts = evidence.preflight.parts.filter((item) => item.role !== 'slide')
  evidence.preflight.summary.partCount = evidence.preflight.parts.length
  writeJson(fixture.dryRun, evidence)
  generateContract(fixture)
  const report = runGate(fixture, 2)

  assert.equal(report.agentGate.passed, false)
  assert.equal(report.targetCoverage[0].covered, false)
  assert.equal(
    report.blockers.some((item) => item.code === 'copy-from-structural-evidence-invalid'),
    true,
  )
})

test('edit contract gate rejects inconsistent copy-from preflight summary counts', () => {
  const fixture = writeCopyFromContractFixture()
  const evidence = JSON.parse(readFileSync(fixture.dryRun, 'utf8'))
  evidence.preflight.summary.relationshipCount += 1
  writeJson(fixture.dryRun, evidence)
  generateContract(fixture)
  const report = runGate(fixture, 2)

  assert.equal(report.agentGate.passed, false)
  assert.equal(
    report.blockers.some((item) => item.code === 'copy-from-preflight-summary-mismatch'),
    true,
  )
})

test('edit contract gate rejects a template outcome incompatible with register-source', () => {
  const fixture = writeCopyFromContractFixture()
  const evidence = JSON.parse(readFileSync(fixture.dryRun, 'utf8'))
  evidence.preflight.templates[0].outcome = 'rebound-target'
  writeJson(fixture.dryRun, evidence)
  generateContract(fixture)
  const report = runGate(fixture, 2)

  assert.equal(report.agentGate.passed, false)
  assert.equal(
    report.blockers.some((item) => item.code === 'copy-from-template-plan-invalid'),
    true,
  )
})

test('edit contract generator merges and binds a deterministic session-rules overlay', () => {
  const fixture = writeSessionRuleFixture()
  const contract = generateContract(fixture, { sessionResolution: fixture.sessionResolution })

  assert.equal(contract.targets.length, 2)
  assert.equal(contract.coverage.expectedTargetCount, 2)
  assert.deepEqual(contract.allowedChanges, ['structure', 'shape', 'text'])
  assert.deepEqual(contract.requiredEvidence, [
    'dry-run',
    'semantic-diff',
    'png-preview',
    'vision-diff',
    'final-inspect',
  ])
  assert.equal(contract.sessionRules.applicableRuleIds[0], 'rule-future-title-blue')
  assert.match(contract.sessionRules.rulesSha256, /^[a-f0-9]{64}$/)
  assert.match(contract.sessionRules.resolutionSha256, /^[a-f0-9]{64}$/)
})

test('edit contract gate proves an applicable session style rule from candidate bytes', () => {
  const fixture = writeSessionRuleFixture()
  generateContract(fixture, { sessionResolution: fixture.sessionResolution })
  const report = runGate(fixture)

  assert.equal(report.agentGate.passed, true)
  assert.equal(report.sessionRuleResults.length, 1)
  assert.equal(report.sessionRuleResults[0].status, 'satisfied')
  assert.equal(report.sessionRuleResults[0].postconditions[0].actual, '0076A8')
})

test('edit contract gate blocks a produced title that violates the session color rule', () => {
  const fixture = writeSessionRuleFixture({ color: 'D62728' })
  generateContract(fixture, { sessionResolution: fixture.sessionResolution })
  const report = runGate(fixture, 2)

  assert.equal(report.agentGate.passed, false)
  assert.equal(report.agentGate.nextAction, 'apply-session-rules')
  assert.equal(report.sessionRuleResults[0].status, 'blocked')
  assert.ok(report.blockers.some((item) => item.code === 'session-rule-postcondition-failed'))
})

test('edit contract gate does not accept a matching shape name from the wrong slide', () => {
  const fixture = writeSessionRuleFixture({ color: 'D62728', decoyColor: '0076A8' })
  generateContract(fixture, { sessionResolution: fixture.sessionResolution })
  const report = runGate(fixture, 2)

  assert.equal(report.agentGate.nextAction, 'apply-session-rules')
  assert.equal(report.sessionRuleResults[0].postconditions[0].actual, 'D62728')
})

test('edit contract gate proves a produced summary-box fill rule from candidate bytes', () => {
  const fixture = writeSessionRuleFixture({
    color: 'F2F2F2',
    elementKind: 'summary-box',
  })
  generateContract(fixture, { sessionResolution: fixture.sessionResolution })
  const report = runGate(fixture)

  assert.equal(report.agentGate.passed, true)
  assert.equal(report.sessionRuleResults[0].id, 'rule-future-summary-fill')
  assert.deepEqual(report.sessionRuleResults[0].postconditions[0], {
    kind: 'fill-color',
    value: 'F2F2F2',
    expected: 'F2F2F2',
    actual: 'F2F2F2',
    passed: true,
  })
})

test('edit contract gate blocks a session-rules resolution modified after contract generation', () => {
  const fixture = writeSessionRuleFixture()
  generateContract(fixture, { sessionResolution: fixture.sessionResolution })
  const resolution = JSON.parse(readFileSync(fixture.sessionResolution, 'utf8'))
  resolution.contractOverlay.targets[0].expected.sessionRulePostconditions[0].value = 'D62728'
  writeJson(fixture.sessionResolution, resolution)
  const report = runGate(fixture, 2)

  assert.equal(report.agentGate.nextAction, 'refresh-session-rules-resolution')
  assert.ok(report.blockers.some((item) => item.code === 'session-rules-binding-stale'))
})

test('edit contract gate blocks a contract that drops a resolved rule postcondition', () => {
  const fixture = writeSessionRuleFixture()
  generateContract(fixture, { sessionResolution: fixture.sessionResolution })
  const contract = JSON.parse(readFileSync(fixture.contract, 'utf8'))
  const ruleTarget = contract.targets.find((target) => target.sessionRuleIds?.length > 0)
  delete ruleTarget.expected.sessionRulePostconditions
  writeJson(fixture.contract, contract)
  const report = runGate(fixture, 2)

  assert.equal(report.agentGate.nextAction, 'refresh-session-rules-resolution')
  assert.ok(report.blockers.some((item) => item.code === 'session-rules-binding-stale'))
})

test('edit contract gate retains not-applicable session rules in the final audit report', () => {
  const fixture = writeSessionRuleFixture()
  const operation = JSON.parse(readFileSync(fixture.sessionOperation, 'utf8'))
  operation.event = 'element-added'
  operation.slideCountDelta = 0
  operation.targets = []
  writeJson(fixture.sessionOperation, operation)
  runNode([
    sessionResolveScript,
    '--rules',
    fixture.sessionRules,
    '--operation',
    fixture.sessionOperation,
    '--source',
    fixture.source,
    '--output',
    fixture.sessionResolution,
    '--overwrite',
    '--strict',
    '--json',
  ])
  const draft = JSON.parse(readFileSync(fixture.draft, 'utf8'))
  draft.targets.push({
    id: 'new-slide-title',
    kind: 'object',
    produced: true,
    slide: 8,
    opIndexes: [1, 2],
    selector: { shape: { name: 'S8_Title' } },
    resolvedIdentity: { slide: 8, name: 'S8_Title' },
    expected: { changeCategories: ['shape', 'text'] },
  })
  draft.coverage.expectedTargetCount = 2
  draft.allowedChanges.push('shape', 'text')
  draft.requiredEvidence.push('final-inspect')
  writeJson(fixture.draft, draft)
  generateContract(fixture, { sessionResolution: fixture.sessionResolution })
  const report = runGate(fixture)

  assert.equal(report.agentGate.passed, true)
  assert.deepEqual(report.sessionRuleResults, [
    {
      id: 'rule-future-title-blue',
      status: 'not-applicable',
      reason: 'event-not-matched',
      targets: [],
      postconditions: [],
    },
  ])
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
