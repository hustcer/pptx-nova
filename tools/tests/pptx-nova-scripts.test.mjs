import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
const exactSwissSubtitle = 'ADJACENT PRODUCTS ARE SPLIT ACROSS VIEW, CONVERT AND GENERATE'
const repoRoot = resolve('.')
const skillRoot = join(repoRoot, 'pptx-nova')

function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result
}

function runNodeStatus(args, expectedStatus, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  })
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout)
  return result
}

function skillPath(path) {
  return join(skillRoot, path)
}

function skillUrl(path) {
  return pathToFileURL(skillPath(path)).href
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function writeFakeXdoc(root, source) {
  const scriptPath = join(root, 'fake-xdoc.mjs')
  writeFileSync(scriptPath, source)
  chmodSync(scriptPath, 0o755)
  return scriptPath
}

test('layout snapshot separates actionable risks from informational inspect gaps', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-layout-summary-'))
  const inspectPath = join(root, 'inspect.json')
  const outputPath = join(root, 'layout-final.json')
  writeJson(inspectPath, {
    schemaVersion: 'pptx-inspect/v1',
    presentation: { slideCount: 1, size: { width: '10in', height: '5.625in' } },
    slides: [
      {
        index: 0,
        shapes: [
          {
            id: 'missing-font-metadata',
            shapeType: 'text',
            text: 'Visible text',
            bbox: { x: 10, y: 10, width: 100, height: 40 },
          },
          {
            id: 'empty-placeholder',
            shapeType: 'rect',
            placeholder: { type: 'body' },
            bbox: { x: 10, y: 60, width: 100, height: 40 },
          },
          {
            id: 'tiny-text',
            shapeType: 'text',
            text: 'Tiny',
            fontFamily: 'Aptos',
            fontSizePt: 5,
            bbox: { x: 10, y: 110, width: 100, height: 40 },
          },
        ],
      },
    ],
  })

  const result = runNode([
    skillPath('scripts/pptx-nova-layout-snapshot.mjs'),
    '--inspect',
    inspectPath,
    '--output',
    outputPath,
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'warn')
  assert.equal(report.summary.riskCount, 4)
  assert.equal(report.summary.actionableRiskCount, 2)
  assert.equal(report.summary.informationalRiskCount, 2)
  assert.deepEqual(report.summary.byClassification, { actionable: 2, informational: 2 })
  assert.deepEqual(report.summary.bySeverity, { error: 0, warning: 2, info: 2 })
  assert.equal(report.summary.affectedSlideCount, 1)
  assert.equal(report.summary.actionableSlideCount, 1)
  assert.equal(report.summary.slideIndexBase, 0)
  assert.deepEqual(
    report.summary.topActionable.map(({ code, count }) => ({ code, count })),
    [
      { code: 'empty-placeholder', count: 1 },
      { code: 'font-size-too-small', count: 1 },
    ],
  )
  assert.equal(readFileSync(outputPath, 'utf8'), `${JSON.stringify(report, null, 2)}\n`)
})

test('layout snapshot treats undisclosed inspect metadata as informational only', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-layout-informational-'))
  const inspectPath = join(root, 'inspect.json')
  writeJson(inspectPath, {
    schemaVersion: 'pptx-inspect/v1',
    presentation: { slideCount: 1, size: { width: '10in', height: '5.625in' } },
    slides: [
      {
        index: 0,
        shapes: [
          {
            id: 'missing-font-metadata',
            shapeType: 'text',
            text: 'Visible text',
            bbox: { x: 10, y: 10, width: 100, height: 40 },
          },
        ],
      },
    ],
  })

  const result = runNode([
    skillPath('scripts/pptx-nova-layout-snapshot.mjs'),
    '--inspect',
    inspectPath,
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'pass')
  assert.equal(report.summary.actionableRiskCount, 0)
  assert.equal(report.summary.informationalRiskCount, 2)
  assert.deepEqual(report.summary.topActionable, [])
})

test('feedback gate recognizes give feedback and provide feedback prompts', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-feedback-trigger-'))
  const runDir = join(root, 'run')
  const promptPath = join(runDir, 'prompt.txt')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(promptPath, 'Give feedback, and please provide feedback on the workflow.')
  writeFileSync(
    join(runDir, 'skill-feedback.md'),
    '# pptx-nova SKILL 使用反馈\n\n具体反馈已完成。\n',
  )

  const result = runNode([
    skillPath('scripts/pptx-nova-feedback-gate.mjs'),
    '--run-dir',
    runDir,
    '--prompt-file',
    promptPath,
    '--strict',
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'pass')
  assert.equal(report.requirement.required, true)
  assert.equal(report.requirement.source, 'prompt-trigger')
  assert.deepEqual(report.requirement.matchedTriggers, ['give-feedback', 'provide-feedback'])
})

function writeI18nResidualFixture(root, candidateUnits) {
  const runDir = join(root, 'run')
  mkdirSync(runDir, { recursive: true })
  const sourceUnit = {
    unitId: 'ppt/slides/slide1.xml#shape:2#p:0',
    category: 'visibleBody',
    sourceText: 'Architecture overview',
    sourceHash: 'sha256:source-english',
    slide: 1,
    part: 'ppt/slides/slide1.xml',
  }
  writeJson(join(runDir, 'i18n-scan-source.json'), {
    schemaVersion: 'pptx-i18n-scan/v1',
    sourceLang: 'multi',
    i18nUnits: { units: [sourceUnit] },
  })
  writeJson(join(runDir, 'i18n-scan-candidate.json'), {
    schemaVersion: 'pptx-i18n-scan/v1',
    sourceLang: 'multi',
    agentGate: { passed: false },
    blockers: candidateUnits.map((unit) => ({ unitId: unit.unitId, sourceText: unit.sourceText })),
    i18nUnits: { units: candidateUnits },
  })
  writeJson(join(runDir, 'translations.json'), {
    schemaVersion: 'pptx-i18n-translations/v1',
    sourceLang: 'multi',
    targetLang: 'fr',
    translations: [
      {
        unitId: sourceUnit.unitId,
        sourceText: sourceUnit.sourceText,
        sourceHash: sourceUnit.sourceHash,
        targetText: "Vue d'ensemble de l'architecture",
      },
    ],
  })
  return { runDir, sourceUnit }
}

test('i18n residual gate ignores French Latin-script classifier false positives', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-i18n-residual-fr-'))
  const { runDir } = writeI18nResidualFixture(root, [
    {
      unitId: 'ppt/slides/slide1.xml#shape:2#p:0',
      category: 'visibleBody',
      sourceText: "Vue d'ensemble de l'architecture",
      sourceHash: 'sha256:target-french',
      slide: 1,
      part: 'ppt/slides/slide1.xml',
      detectedLangs: ['en'],
    },
  ])

  const result = runNode([
    skillPath('scripts/pptx-nova-i18n-residual-gate.mjs'),
    '--run-dir',
    runDir,
    '--strict',
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'pass')
  assert.equal(report.agentGate.passed, true)
  assert.equal(report.summary.exactResidualCount, 0)
  assert.equal(report.summary.nativeCandidateBlockerCount, 1)
  assert.equal(report.summary.diagnosticOnlyBlockerCount, 1)
  assert.deepEqual(report.exactResiduals, [])
})

test('i18n residual gate blocks an unchanged English source unit', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-i18n-residual-source-'))
  const sourceUnit = {
    unitId: 'ppt/slides/slide1.xml#shape:2#p:0',
    category: 'visibleBody',
    sourceText: 'Architecture overview',
    sourceHash: 'sha256:source-english',
    slide: 1,
    part: 'ppt/slides/slide1.xml',
  }
  const { runDir } = writeI18nResidualFixture(root, [sourceUnit])

  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-i18n-residual-gate.mjs'),
      '--run-dir',
      runDir,
      '--strict',
      '--json',
    ],
    2,
  )
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'fail')
  assert.equal(report.agentGate.passed, false)
  assert.equal(report.summary.exactResidualCount, 1)
  assert.equal(report.exactResiduals[0].unitId, sourceUnit.unitId)
  assert.equal(report.exactResiduals[0].matchedBy, 'sourceHash')
})

test('i18n residual gate permits explicitly approved unchanged technical text', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-i18n-residual-approved-'))
  const { runDir, sourceUnit } = writeI18nResidualFixture(root, [
    {
      unitId: 'ppt/slides/slide1.xml#shape:2#p:0',
      category: 'visibleBody',
      sourceText: 'Architecture overview',
      sourceHash: 'sha256:source-english',
      slide: 1,
      part: 'ppt/slides/slide1.xml',
    },
  ])
  const translationsPath = join(runDir, 'translations.json')
  const translations = JSON.parse(readFileSync(translationsPath, 'utf8'))
  translations.translations[0].targetText = sourceUnit.sourceText
  writeJson(translationsPath, translations)

  const result = runNode([
    skillPath('scripts/pptx-nova-i18n-residual-gate.mjs'),
    '--run-dir',
    runDir,
    '--strict',
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'pass')
  assert.equal(report.summary.plannedChangeCount, 0)
  assert.equal(report.summary.approvedUnchangedCount, 1)
  assert.deepEqual(report.approvedUnchangedUnitIds, [sourceUnit.unitId])
})

function swissColumnContent() {
  return {
    meta: { deckkit: 'swiss-grid' },
    slides: [
      {
        type: 'swissColumnSlide',
        data: {
          eyebrow: 'P · 05',
          title: 'Product split',
          subtitle: exactSwissSubtitle,
          items: [
            {
              title: 'View',
              subtitle: 'Preview surfaces',
              body: ['Inspect layouts', 'Review changes'],
              examples: ['Open PPTX', 'Render slide', 'Check notes'],
            },
          ],
        },
      },
    ],
  }
}

function swissColumnLock({ finalPptx, runDir }) {
  return {
    schemaVersion: 'pptx-nova-deck-lock/v1',
    mode: 'express',
    objective: 'Script test',
    outlinePath: 'outline.json',
    contentPath: 'content.json',
    patchPath: 'patch.json',
    output: { finalPptx, runDir },
    canvas: {
      format: 'ppt169',
      width: '13.333in',
      height: '7.5in',
    },
    deckkit: { id: 'swiss-grid' },
    slides: [
      {
        type: 'swissColumnSlide',
        title: 'Product split',
        purpose: 'Show the split between View, Convert, and Generate',
        rhythm: 'dense',
      },
    ],
    assumptions: [],
  }
}

function successfulFakeXdocSource() {
  return `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : ''
}
const print = (value) => process.stdout.write(JSON.stringify(value))

if (args[0] === 'schema') {
  print({
    version: '9.9.9 (fake)',
    schemaVersion: 'cli-agent/v1',
    capabilities: { schemaVersion: 'capabilities/v1' },
    commands: { pptx: { subcommands: { apply: {}, 'vision-check': {}, preview: {} }, patchSchema: {}, catalogs: {} } }
  })
} else if (args[0] === 'pptx' && args[1] === 'apply') {
  const output = valueAfter('-o')
  if (args.includes('--dry-run')) {
    print({ schemaVersion: 'pptx-dry-run/v1', status: 'success', warnings: [], changedParts: [], opResults: [], visualRisks: [], wouldWrite: true, output })
  } else {
    writeFileSync(output, 'candidate pptx')
    print({ schemaVersion: 'pptx-apply/v1', status: 'success', warnings: [], changedParts: ['ppt/presentation.xml'], opResults: [], visualRisks: [], output })
  }
} else if (args[0] === 'pptx' && args[1] === 'vision-check') {
  print({ schemaVersion: 'pptx-vision/v1', status: 'pass', summary: { issueCount: 0, bySeverity: { high: 0, medium: 0, low: 0 } }, issues: [] })
} else if (args[0] === 'pptx' && args[1] === 'preview') {
  const outputDir = valueAfter('--output-dir')
  const contactSheet = valueAfter('--contact-sheet')
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(outputDir + '/slide-001.png', 'png')
  writeFileSync(contactSheet, 'contact')
  print({
    schemaVersion: 'pptx-preview/v1',
    status: 'success',
    pages: [{ index: 1, slide: 1, path: outputDir + '/slide-001.png', byteLength: 3, file: { path: outputDir + '/slide-001.png', status: 'ok', byteLength: 3, width: 100, height: 56 } }],
    contactSheet: { path: contactSheet, width: 100, height: 56, byteLength: 7 }
  })
} else {
  process.stderr.write('unexpected fake xdoc command: ' + args.join(' '))
  process.exit(2)
}
`
}

test('generic DeckKit build driver writes patch and quality sidecars', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-nova-build-driver-'))
  const contentPath = join(dir, 'content.json')
  const patchPath = join(dir, 'patch.json')
  const qualityPath = join(dir, 'quality.json')
  writeJson(contentPath, swissColumnContent())

  runNode([
    skillPath('scripts/pptx-nova-build.mjs'),
    '--deckkit',
    'swiss-grid',
    contentPath,
    '-o',
    patchPath,
    '--quality-json',
    qualityPath,
  ])

  const patch = JSON.parse(readFileSync(patchPath, 'utf8'))
  const quality = JSON.parse(readFileSync(qualityPath, 'utf8'))
  assert.equal(patch.schemaVersion, 1)
  assert.equal(quality.schemaVersion, 'pptx-nova-quality/v1')
})

test('DeckKit slot reference covers every swiss-grid slide type', () => {
  const result = runNode([
    skillPath('scripts/pptx-nova-deckkit-slots.mjs'),
    '--deckkit',
    'swiss-grid',
    '--format',
    'json',
  ])
  const reference = JSON.parse(result.stdout)

  assert.equal(reference.deckkit, 'swiss-grid')
  assert.equal(reference.slideTypes.length, 15)
  assert.equal(reference.slideTypes.filter((slideType) => !slideType.hasSchema).length, 0)
  assert.ok(
    reference.slideTypes
      .find((slideType) => slideType.slideType === 'swissTypefaceSlide')
      ?.rows.some((row) => row.path === 'data.cards' && row.budget.includes('max 3 items')),
  )
  assert.ok(
    reference.slideTypes
      .find((slideType) => slideType.slideType === 'swissTableSlide')
      ?.rows.some((row) => row.path === 'data.rows' && row.budget.includes('max 11 items')),
  )
  assert.ok(
    reference.slideTypes
      .find((slideType) => slideType.slideType === 'swissCoverSlide')
      ?.rows.some(
        (row) =>
          row.path === 'data.tag' &&
          row.budget.includes('10pt @ 4.6in x 0.7in') &&
          row.budget.includes('CJK ~33 chars x 4 line(s)'),
      ),
  )
})

test('DeckKit slot reference and consistency cover mckinsey-blue cover tuple slots', () => {
  const referenceResult = runNode([
    skillPath('scripts/pptx-nova-deckkit-slots.mjs'),
    '--deckkit',
    'mckinsey-blue',
    '--format',
    'json',
  ])
  const reference = JSON.parse(referenceResult.stdout)
  const coverRows = reference.slideTypes.find((slide) => slide.slideType === 'mckCoverSlide').rows
  const rowByPath = new Map(coverRows.map((row) => [row.path, row]))

  assert.ok(rowByPath.get('data.details[][0]')?.budget.includes('~1 line(s); 7.4pt @ 0.85in'))
  assert.ok(rowByPath.get('data.details[][0]')?.budget.includes('CJK ~8 chars x 1 line(s)'))
  assert.ok(rowByPath.get('data.details[][1]')?.budget.includes('~1 line(s); 7.2pt @ 4.5in'))
  assert.ok(rowByPath.get('data.details[][1]')?.budget.includes('CJK ~45 chars x 1 line(s)'))
  assert.ok(rowByPath.get('data.lossMetric.value2')?.budget.includes('~1 line(s); 20pt @ 1.8in'))
  assert.ok(rowByPath.get('data.lossMetric.value2')?.budget.includes('CJK ~6 chars x 1 line(s)'))
  assert.ok(rowByPath.get('data.lossMetric.sub2')?.budget.includes('~1 line(s); 7.2pt @ 1.8in'))
  assert.ok(rowByPath.get('data.lossMetric.note')?.budget.includes('~1 line(s); 7.2pt @ 1.9in'))

  const consistencyResult = runNode([
    skillPath('scripts/pptx-nova-deckkit-slot-consistency.mjs'),
    '--deckkit',
    'mckinsey-blue',
    '--json',
  ])
  const consistency = JSON.parse(consistencyResult.stdout)
  const coverConsistency = consistency.results[0].slideTypes.find(
    (slide) => slide.slideType === 'mckCoverSlide',
  )

  assert.equal(coverConsistency.status, 'ok')
  assert.deepEqual(coverConsistency.ghosts, [])
  assert.deepEqual(coverConsistency.dynamics, [])
})

test('readiness defaults to catalog benchmark evidence', () => {
  const result = runNode([
    skillPath('scripts/pptx-nova-deckkit-readiness.mjs'),
    '--deckkit',
    'long-table',
    '--target',
    'delivery',
    '--explicit',
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.passed, true)
  assert.equal(report.status, 'pass')
  assert.equal(report.agentGate.canContinue, true)
  assert.equal(report.agentGate.status, 'pass')
  assert.equal(report.agentGate.nextAction, 'continue')
  assert.equal(report.agentGate.decisionBasis.benchmarkMode, 'catalog')
  assert.equal(report.benchmarkEvidence.mode, 'catalog')
  assert.equal(report.benchmarkEvidence.live.status, 'not-requested')
  assert.equal(report.explicitSelection.requested, true)
  assert.equal(report.explicitSelection.applies, false)
  assert.equal(report.explicitSelection.canUseExplicitException, false)
  assert.equal(report.explicitSelection.canContinue, true)
  assert.equal(report.explicitSelection.passedByExplicitException, false)
})

test('CI readiness checks use catalog benchmark evidence', () => {
  const ciCheck = readFileSync(join(repoRoot, 'tools/ci-check.nu'), 'utf8')

  assert.match(ciCheck, /--benchmark-mode\s+catalog/)
  assert.doesNotMatch(ciCheck, /--benchmark-mode\s+required-live/)
})

test('readiness catalog benchmark requires passing required case evidence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-nova-catalog-benchmark-'))
  const catalogPath = join(dir, 'catalog.json')
  const catalog = JSON.parse(readFileSync(skillPath('assets/deckkits/catalog.json'), 'utf8'))
  const entry = catalog.entries.find((candidate) => candidate.id === 'long-table')
  entry.quality.benchmark.passed = true
  entry.quality.benchmark.cases = entry.quality.benchmark.cases.map((benchCase) =>
    benchCase.caseId === 'long-table.golden-html' ? { ...benchCase, passed: false } : benchCase,
  )
  writeJson(catalogPath, catalog)

  const result = spawnSync(
    process.execPath,
    [
      skillPath('scripts/pptx-nova-deckkit-readiness.mjs'),
      '--deckkit',
      'long-table',
      '--target',
      'delivery',
      '--catalog',
      catalogPath,
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(result.status, 1, result.stderr || result.stdout)
  const report = JSON.parse(result.stdout)

  assert.equal(report.passed, false)
  assert.equal(report.status, 'fail')
  assert.equal(report.agentGate.canContinue, false)
  assert.equal(report.benchmarkEvidence.mode, 'catalog')
  assert.ok(
    report.benchmarkEvidence.failures.includes(
      'catalog.quality.benchmark golden case evidence did not pass',
    ),
  )
})

test('readiness reports live benchmark attention separately from explicit exception', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'pptx-nova-missing-benchmark-'))
  const result = runNode([
    skillPath('scripts/pptx-nova-deckkit-readiness.mjs'),
    '--deckkit',
    'long-table',
    '--target',
    'delivery',
    '--explicit',
    '--out',
    outDir,
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.passed, true)
  assert.equal(report.status, 'attention')
  assert.equal(report.agentGate.canContinue, true)
  assert.equal(report.agentGate.status, 'attention')
  assert.equal(report.agentGate.nextAction, 'continue-with-catalog-benchmark-evidence')
  assert.equal(report.agentGate.decisionBasis.benchmarkMode, 'live')
  assert.equal(report.agentGate.decisionBasis.catalogReadiness, 'production')
  assert.equal(report.agentGate.decisionBasis.catalogBenchmarkPassed, true)
  assert.equal(report.agentGate.decisionBasis.liveBenchmarkStatus, 'missing')
  assert.equal(report.benchmarkEvidence.mode, 'live')
  assert.equal(report.benchmarkEvidence.live.required, false)
  assert.equal(report.explicitSelection.requested, true)
  assert.equal(report.explicitSelection.applies, false)
  assert.equal(report.explicitSelection.canUseExplicitException, false)
  assert.equal(report.explicitSelection.canContinue, true)
  assert.equal(report.explicitSelection.passedByExplicitException, false)
})

test('readiness human output tolerates missing vision severity details', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-nova-readiness-human-'))
  const catalogPath = join(dir, 'catalog.json')
  const catalog = JSON.parse(readFileSync(skillPath('assets/deckkits/catalog.json'), 'utf8'))
  const entry = catalog.entries.find((candidate) => candidate.id === 'long-table')
  const benchCase = entry.quality.benchmark.cases.find(
    (candidate) => candidate.caseId === 'long-table.golden-html',
  )
  benchCase.vision = { status: 'passed' }
  writeJson(catalogPath, catalog)

  const result = runNode([
    skillPath('scripts/pptx-nova-deckkit-readiness.mjs'),
    '--deckkit',
    'long-table',
    '--target',
    'delivery',
    '--catalog',
    catalogPath,
  ])

  assert.match(result.stdout, /agent gate: CAN CONTINUE/)
  assert.match(result.stdout, /vision=H0\/M0\/L0 new=0 changed=0/)
})

test('readiness required-live mode blocks missing live benchmark evidence', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'pptx-nova-required-live-missing-'))
  const result = spawnSync(
    process.execPath,
    [
      skillPath('scripts/pptx-nova-deckkit-readiness.mjs'),
      '--deckkit',
      'long-table',
      '--target',
      'delivery',
      '--benchmark-mode',
      'required-live',
      '--out',
      outDir,
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(result.status, 1, result.stderr || result.stdout)
  const report = JSON.parse(result.stdout)

  assert.equal(report.passed, false)
  assert.equal(report.status, 'fail')
  assert.equal(report.agentGate.canContinue, false)
  assert.equal(report.agentGate.decisionBasis.benchmarkMode, 'required-live')
  assert.equal(report.agentGate.decisionBasis.liveBenchmarkStatus, 'missing')
  assert.equal(report.benchmarkEvidence.mode, 'required-live')
  assert.equal(report.benchmarkEvidence.live.required, true)
})

test('DeckKit slot consistency honors array-level control roles by default', () => {
  const result = runNode([skillPath('scripts/pptx-nova-deckkit-slot-consistency.mjs'), '--json'])
  const consistency = JSON.parse(result.stdout)
  const swissGrid = consistency.results.find((kit) => kit.deckkit === 'swiss-grid')
  const timeline = swissGrid.slideTypes.find((slide) => slide.slideType === 'swissTimelineSlide')

  assert.equal(consistency.ok, true)
  assert.equal(timeline.status, 'ok')
  assert.deepEqual(timeline.ghosts, [])
})

test('mckinsey-blue pillars omit optional empty timeframe labels', async () => {
  const kit = await import(skillUrl('assets/deckkits/mckinsey-blue.kit.mjs'))
  const result = kit.createDeck({
    meta: { deckkit: 'mckinsey-blue' },
    slides: [
      {
        type: 'mckPillarsSlide',
        data: {
          title: 'Pillars',
          subtitle: 'Optional timeframe labels may be absent',
          pillars: [
            {
              index: '01',
              title: 'Loyalty',
              body: 'Build repeat behavior',
              outcome: 'Higher repeat purchase',
              kpi: '30%',
              icon: 'target',
            },
          ],
        },
      },
    ],
  })
  const timeOps = result.patch.ops.filter((op) => JSON.stringify(op).includes('Pillar0Time'))

  assert.deepEqual(timeOps, [])
})

test('mckinsey-blue loss-driver bar keeps finite geometry for missing or invalid value', async () => {
  const kit = await import(skillUrl('assets/deckkits/mckinsey-blue.kit.mjs'))
  // Drivers-only data with no value, a "%" string, an over-100 value, and a negative
  // value. Before the fix this threw "Invalid geometry S0_Driver0Fill: ... w=NaN".
  const result = kit.createDeck({
    meta: { deckkit: 'mckinsey-blue' },
    slides: [
      {
        type: 'mckLossDriverSlide',
        data: {
          title: 'Loss drivers',
          chartTitle: 'Share of churn',
          drivers: [
            { label: 'Missing value', sub: 'no value field' },
            { label: 'Percent string', sub: 'with % suffix', value: '62%' },
            { label: 'Out of range', sub: 'over 100', value: 320 },
            { label: 'Negative', sub: 'below 0', value: -5 },
          ],
        },
      },
    ],
  })

  const fillWidths = result.patch.ops
    .filter((op) => /Driver\d+Fill$/.test(op.name ?? ''))
    .map((op) => Number.parseFloat(String(op.w)))

  assert.equal(fillWidths.length, 4)
  for (const w of fillWidths) {
    assert.ok(Number.isFinite(w) && w > 0, `fill width should be finite and positive, got ${w}`)
  }
  // Out-of-range value clamps to the full track width; missing/negative clamp to the
  // minimum visible width instead of overflowing or collapsing.
  assert.ok(Math.max(...fillWidths) <= 6.38 + 1e-6, 'fill width must not exceed the bar track')
})

test('run initializer creates standard artifacts and reusable commands', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-init-run-'))
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
if (process.argv[2] === 'schema') {
  process.stdout.write(JSON.stringify({
    version: '9.9.9 (fake)',
    schemaVersion: 'cli-agent/v1',
    capabilities: { schemaVersion: 'capabilities/v1' },
    commands: { pptx: { subcommands: {}, patchSchema: {}, catalogs: {} } }
  }))
  process.exit(0)
}
process.exit(2)
`,
  )
  const result = runNode([
    skillPath('scripts/pptx-nova-init-run.mjs'),
    '--slug',
    'script test',
    '--deckkit',
    'swiss-grid',
    '--root',
    root,
    '--output',
    'script-test.pptx',
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])
  const paths = JSON.parse(result.stdout)

  for (const path of [
    paths.outlinePath,
    paths.deckLockTemplatePath,
    paths.contentTemplatePath,
    paths.assetsDir,
  ]) {
    assert.equal(existsSync(path), true, path)
  }
  assert.equal(existsSync(paths.deckLockPath), false, paths.deckLockPath)
  assert.equal(existsSync(paths.contentPath), false, paths.contentPath)
  const commands = JSON.parse(readFileSync(join(paths.runDir, 'commands.json'), 'utf8'))
  assert.match(commands.run, /pptx-nova-create-run\.mjs/)
  assert.match(commands.run, /--run-dir/)
  assert.match(commands.run, /--json/)
  assert.match(commands.build, /pptx-nova-build\.mjs/)
  assert.match(commands.probe, /pptx-nova-probe\.mjs/)
  assert.match(commands.probe, /xdoc-capabilities\.json/)
  assert.match(commands.validate, /--mode delivery/)
  assert.match(commands.checkLock, /pptx-nova-check-lock\.mjs/)
  assert.match(commands.dryRun, /candidate\.pptx/)
  assert.match(commands.dryRun, /--overwrite/)
  assert.match(commands.apply, /candidate\.pptx/)
  assert.match(commands.apply, /--overwrite/)
  assert.match(commands.vision, /vision-check/)
  assert.match(commands.preview, /--contact-sheet/)
  const contentTemplate = JSON.parse(readFileSync(paths.contentTemplatePath, 'utf8'))
  const deckLockTemplate = JSON.parse(readFileSync(paths.deckLockTemplatePath, 'utf8'))
  assert.equal(contentTemplate._template, true)
  assert.equal(deckLockTemplate._template, true)
  assert.equal(paths.capabilityPath, join(paths.runDir, 'xdoc-capabilities.json'))
  assert.equal(paths.candidatePath, join(paths.runDir, 'candidate.pptx'))
  assert.equal(paths.dryRunPath, join(paths.runDir, 'dry-run.json'))
  assert.equal(paths.applyPath, join(paths.runDir, 'apply.json'))
  assert.equal(paths.visionPath, join(paths.runDir, 'vision.json'))
  assert.equal(paths.previewReportPath, join(paths.runDir, 'preview.json'))
  assert.equal(paths.commandsPath, join(paths.runDir, 'commands.json'))
  assert.equal(paths.previewsDir, join(paths.runDir, 'previews'))
  assert.equal(paths.contactSheetPath, join(paths.runDir, 'previews', 'contact-sheet.png'))
  assert.equal(paths.finalPptx, join(root, 'script-test.pptx'))
})

test('create runner executes DeckKit create gates and publishes after preview', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-create-run-'))
  const runDir = join(root, 'run')
  const contentPath = join(runDir, 'content.json')
  const lockPath = join(runDir, 'deck_lock.json')
  const output = join(root, 'out.pptx')
  mkdirSync(runDir, { recursive: true })
  writeJson(contentPath, swissColumnContent())
  writeJson(lockPath, swissColumnLock({ finalPptx: output, runDir }))
  const fakeXdoc = writeFakeXdoc(root, successfulFakeXdocSource())

  const result = runNode([
    skillPath('scripts/pptx-nova-create-run.mjs'),
    '--deckkit',
    'swiss-grid',
    '--content',
    contentPath,
    '--lock',
    lockPath,
    '--output',
    output,
    '--run-dir',
    runDir,
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])
  const summary = JSON.parse(result.stdout)
  const phaseNames = summary.phases.map((phase) => phase.name)
  const gateNames = summary.gates.map((gate) => gate.name)

  assert.equal(summary.status, 'needs-human-review')
  assert.equal(summary.machineGatesPassed, true)
  assert.equal(summary.agentSummary.decision, 'continue-to-human-review')
  assert.equal(existsSync(output), true)
  assert.equal(existsSync(join(runDir, 'candidate.pptx')), true)
  assert.equal(existsSync(join(runDir, 'preview.json')), true)
  assert.equal(existsSync(join(runDir, 'previews', 'contact-sheet.png')), true)
  assert.ok(phaseNames.indexOf('dry-run') < phaseNames.indexOf('apply'))
  assert.ok(phaseNames.indexOf('apply') < phaseNames.indexOf('vision-check'))
  assert.ok(phaseNames.indexOf('preview-render') < phaseNames.indexOf('publish'))
  for (const gate of [
    'validate-content',
    'build',
    'check-lock',
    'dry-run',
    'apply',
    'vision-check',
    'png-previews',
    'published-output',
  ]) {
    assert.ok(gateNames.includes(gate), gate)
  }
})

test('create runner resolves relative xdoc-bin before changing into run dir', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-create-run-relative-xdoc-'))
  const binDir = join(root, 'bin')
  const contentPath = join(root, 'content.json')
  const lockPath = join(root, 'deck_lock.json')
  const output = join(root, 'out.pptx')
  const runDir = join(root, 'artifacts', 'run')
  mkdirSync(binDir, { recursive: true })
  writeJson(contentPath, swissColumnContent())
  writeJson(lockPath, swissColumnLock({ finalPptx: output, runDir }))
  writeFakeXdoc(binDir, successfulFakeXdocSource())

  const result = spawnSync(
    process.execPath,
    [
      skillPath('scripts/pptx-nova-create-run.mjs'),
      '--deckkit',
      'swiss-grid',
      '--content',
      'content.json',
      '--lock',
      'deck_lock.json',
      '--output',
      'out.pptx',
      '--run-dir',
      'artifacts/run',
      '--xdoc-bin',
      './bin/fake-xdoc.mjs',
      '--json',
    ],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const summary = JSON.parse(result.stdout)
  const dryRun = summary.phases.find((phase) => phase.name === 'dry-run')

  assert.equal(summary.status, 'needs-human-review')
  assert.equal(summary.runDir.endsWith(join('artifacts', 'run')), true)
  assert.equal(existsSync(output), true)
  assert.match(dryRun.command, /[/\\]bin[/\\]fake-xdoc\.mjs/)
})

test('create runner allocates unique default run dirs instead of reusing evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-create-run-unique-'))
  const contentPath = join(root, 'content.json')
  const lockPath = join(root, 'deck_lock.json')
  const fakeXdoc = writeFakeXdoc(root, successfulFakeXdocSource())
  writeJson(contentPath, swissColumnContent())
  writeJson(
    lockPath,
    swissColumnLock({ finalPptx: join(root, 'out.pptx'), runDir: join(root, '.pptx-nova') }),
  )

  const run = (outputName) => {
    const result = spawnSync(
      process.execPath,
      [
        skillPath('scripts/pptx-nova-create-run.mjs'),
        '--deckkit',
        'swiss-grid',
        '--content',
        'content.json',
        '--lock',
        'deck_lock.json',
        '--output',
        outputName,
        '--xdoc-bin',
        fakeXdoc,
        '--json',
      ],
      { cwd: root, encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stderr || result.stdout)
    return JSON.parse(result.stdout)
  }

  const first = run('out-1.pptx')
  const second = run('out-2.pptx')

  assert.notEqual(first.runDir, second.runDir)
  assert.match(basename(first.runDir), /^create-swiss-grid-\d{8}-\d{9}-[0-9a-z]+-[0-9a-z]+$/)
  assert.match(basename(second.runDir), /^create-swiss-grid-\d{8}-\d{9}-[0-9a-z]+-[0-9a-z]+$/)
  assert.equal(existsSync(first.artifacts.summary), true)
  assert.equal(existsSync(second.artifacts.summary), true)
  assert.equal(existsSync(join(first.runDir, 'candidate.pptx')), true)
  assert.equal(existsSync(join(second.runDir, 'candidate.pptx')), true)
})

test('create runner stops after apply failure without validating a stale candidate', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-create-run-fail-'))
  const runDir = join(root, 'run')
  const contentPath = join(runDir, 'content.json')
  const lockPath = join(runDir, 'deck_lock.json')
  const staleCandidate = join(runDir, 'candidate.pptx')
  const output = join(root, 'out.pptx')
  mkdirSync(runDir, { recursive: true })
  writeJson(contentPath, swissColumnContent())
  writeJson(lockPath, swissColumnLock({ finalPptx: output, runDir }))
  writeFileSync(staleCandidate, 'old candidate')
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
const args = process.argv.slice(2)
const print = (value) => process.stdout.write(JSON.stringify(value))

if (args[0] === 'schema') {
  print({
    version: '9.9.9 (fake)',
    schemaVersion: 'cli-agent/v1',
    capabilities: { schemaVersion: 'capabilities/v1' },
    commands: { pptx: { subcommands: { apply: {}, 'vision-check': {}, preview: {} }, patchSchema: {}, catalogs: {} } }
  })
} else if (args[0] === 'pptx' && args[1] === 'apply' && args.includes('--dry-run')) {
  print({ schemaVersion: 'pptx-dry-run/v1', status: 'success', warnings: [], changedParts: [], opResults: [], visualRisks: [], wouldWrite: true })
} else if (args[0] === 'pptx' && args[1] === 'apply') {
  print({ schemaVersion: 'pptx-apply/v1', status: 'error', error: { kind: 'OutputExists' }, visualRisks: [] })
  process.exit(9)
} else if (args[0] === 'pptx' && (args[1] === 'vision-check' || args[1] === 'preview')) {
  process.stderr.write('stale candidate validation should not run')
  process.exit(2)
} else {
  process.stderr.write('unexpected fake xdoc command: ' + args.join(' '))
  process.exit(2)
}
`,
  )

  const result = spawnSync(
    process.execPath,
    [
      skillPath('scripts/pptx-nova-create-run.mjs'),
      '--deckkit',
      'swiss-grid',
      '--content',
      contentPath,
      '--lock',
      lockPath,
      '--output',
      output,
      '--run-dir',
      runDir,
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(result.status, 1, result.stderr || result.stdout)
  const summary = JSON.parse(result.stdout)
  const phaseNames = summary.phases.map((phase) => phase.name)

  assert.equal(summary.status, 'failed')
  assert.equal(summary.error.phase, 'apply')
  assert.equal(existsSync(output), false)
  assert.equal(existsSync(staleCandidate), false)
  assert.equal(phaseNames.includes('vision-check'), false)
  assert.equal(phaseNames.includes('preview-render'), false)
  assert.equal(phaseNames.includes('publish'), false)
})

test('refurbish plan requires semantic diff gate by default', async () => {
  const { buildRefurbishPlan } = await import(skillUrl('scripts/pptx-nova-refurbish-plan.mjs'))
  const plan = buildRefurbishPlan({
    deckkit: 'mckinsey-blue',
    source: 'source.pptx',
    output: 'candidate.pptx',
    catalog: skillPath('assets/deckkits/catalog.json'),
    explicit: false,
    json: true,
  })
  const semanticIndex = plan.requiredGates.indexOf('semantic-diff')

  assert.equal(plan.status, 'ready')
  assert.notEqual(semanticIndex, -1)
  assert.ok(plan.requiredGates.indexOf('fidelity-gate') < semanticIndex)
  assert.ok(
    plan.commands.some(
      (command) =>
        command.name === 'semantic-diff' &&
        command.required === true &&
        command.command.includes('xdoc pptx diff'),
    ),
  )
})

test('refurbish fallback plan overwrites current-run candidate commands', async () => {
  const { buildRefurbishPlan } = await import(skillUrl('scripts/pptx-nova-refurbish-plan.mjs'))
  const plan = buildRefurbishPlan({
    deckkit: 'swiss-grid',
    source: 'source.pptx',
    output: 'candidate.pptx',
    catalog: skillPath('assets/deckkits/catalog.json'),
    explicit: false,
    json: true,
  })

  assert.ok(
    plan.commands.some(
      (command) =>
        command.name === 'apply' &&
        command.command.includes('candidate.pptx') &&
        command.command.includes('--overwrite'),
    ),
  )
})

test('refurbish runner completes compare delivery gate before publishing output', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-refurbish-run-'))
  const source = join(root, 'source.pptx')
  const output = join(root, 'out.pptx')
  const runDir = join(root, 'run')
  writeFileSync(source, 'fake pptx')
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : ''
}
const inspect = {
  schemaVersion: 'pptx-inspect/v1',
  presentation: { slideCount: 1, size: { width: '10in', height: '5.625in' } },
  slides: [{ index: 0, shapes: [] }]
}
const visionDiff = {
  schemaVersion: 'pptx-vision-diff/v1',
  status: 'success',
  summary: {
    byClass: {
      new: { high: 0, medium: 0, low: 0 },
      changed: { high: 0, medium: 0, low: 0 }
    }
  }
}
const audit = {
  schemaVersion: 'pptx-refurbish-audit/v1',
  status: 'passed',
  summary: {
    errorCount: 0,
    warningCount: 0,
    sourceSlideCount: 1,
    finalSlideCount: 1,
    slideCountMatches: true
  },
  issues: []
}
const print = (value) => process.stdout.write(JSON.stringify(value))

if (args[0] === 'schema') {
  print({
    version: '9.9.9 (fake)',
    schemaVersion: 'cli-agent/v1',
    capabilities: { schemaVersion: 'capabilities/v1' },
    commands: {
      pptx: {
        subcommands: { inspect: {}, 'refurbish-skin': {}, preview: {}, diff: {} },
        patchSchema: {},
        catalogs: {
          nativeDeckkits: {
            deckkits: [{ id: 'mckinsey-blue', readiness: 'production' }]
          }
        }
      }
    }
  })
} else if (args[0] === 'pptx' && args[1] === 'inspect') {
  print(inspect)
} else if (args[0] === 'pptx' && args[1] === 'refurbish-skin') {
  writeFileSync(valueAfter('--output'), 'candidate pptx')
  print({
    schemaVersion: 'pptx-refurbish-skin/v1',
    status: 'passed',
    gate: { passed: true, newHighIssues: 0, newMediumIssues: 0 },
    reports: { visionDiff, audit }
  })
} else if (args[0] === 'pptx' && args[1] === 'preview') {
  const outputDir = valueAfter('--output-dir')
  const contactSheet = valueAfter('--contact-sheet')
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(outputDir + '/slide-001.png', 'png')
  writeFileSync(contactSheet, 'contact')
  print({
    schemaVersion: 'pptx-preview/v1',
    status: 'success',
    pages: [{ path: outputDir + '/slide-001.png', status: 'success', width: 100, height: 56, byteLength: 3 }],
    contactSheet: { path: contactSheet, width: 100, height: 56, byteLength: 7 }
  })
} else if (args[0] === 'pptx' && args[1] === 'diff') {
  print({
    schemaVersion: 'pptx-diff/v1',
    status: 'success',
    agentGate: { semanticStatus: 'pass' },
    summary: { reliableChanges: 0, uncertainChanges: 0, unsupportedRegions: 0 },
    changeRollup: { reliable: { count: 0 } },
    slides: []
  })
} else if (args[0] === 'pptx' && args[1] === 'contact-diff') {
  writeFileSync(valueAfter('--output'), 'contact diff png')
  print({
    schemaVersion: 'pptx-contact-diff/v1',
    status: 'success',
    outputPath: valueAfter('--output'),
    summary: { pairCount: 1, scopeMode: 'all-slides', dpi: Number(valueAfter('--dpi')) || 72 },
    agentGate: { passed: true, status: 'pass', scopeMode: 'all-slides', pairCount: 1 },
    render: { path: valueAfter('--output'), width: 100, height: 56, dpi: Number(valueAfter('--dpi')) || 72 }
  })
} else {
  process.stderr.write('unexpected fake xdoc command: ' + args.join(' '))
  process.exit(2)
}
`,
  )

  const result = runNode([
    skillPath('scripts/pptx-nova-refurbish-run.mjs'),
    '--deckkit',
    'mckinsey-blue',
    '--source',
    source,
    '--output',
    output,
    '--run-dir',
    runDir,
    '--route',
    'native',
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])
  const summary = JSON.parse(result.stdout)
  const phaseNames = summary.phases.map((phase) => phase.name)
  const gateNames = summary.gates.map((gate) => gate.name)
  const sourceInspect = summary.phases.find((phase) => phase.name === 'source-inspect')
  const comparePhase = summary.phases.find((phase) => phase.name === 'refurbish-compare')

  assert.equal(summary.status, 'needs-human-review')
  assert.equal(existsSync(output), true)
  assert.equal(existsSync(join(runDir, 'pptx-diff.json')), true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare.json')), true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare-gate.json')), true)
  assert.equal(summary.artifacts.pptxDiff, join(runDir, 'pptx-diff.json'))
  assert.equal(summary.layout.actionableRiskCount, 0)
  assert.equal(summary.layout.informationalRiskCount, 0)
  assert.equal(summary.agentSummary.layout.actionableRiskCount, 0)
  assert.ok(sourceInspect.command.includes(process.execPath), sourceInspect.command)
  assert.ok(sourceInspect.command.includes('fake-xdoc.mjs'), sourceInspect.command)
  assert.ok(comparePhase.command.includes(join(runDir, 'candidate.pptx')), comparePhase.command)
  assert.ok(comparePhase.command.includes('--dpi 192'), comparePhase.command)
  assert.ok(phaseNames.includes('pptx-semantic-diff'))
  assert.ok(phaseNames.includes('refurbish-compare'))
  assert.ok(phaseNames.includes('refurbish-compare-delivery'))
  assert.ok(gateNames.includes('pptx-semantic-diff'))
  assert.ok(gateNames.includes('refurbish-compare-delivery'))
  assert.ok(phaseNames.indexOf('pptx-semantic-diff') < phaseNames.indexOf('publish'))
  assert.ok(phaseNames.indexOf('refurbish-compare') < phaseNames.indexOf('publish'))
  assert.ok(phaseNames.indexOf('refurbish-compare-delivery') < phaseNames.indexOf('publish'))
})

test('refurbish runner does not publish output when compare delivery gate fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-refurbish-run-compare-fail-'))
  const source = join(root, 'source.pptx')
  const output = join(root, 'out.pptx')
  const runDir = join(root, 'run')
  writeFileSync(source, 'fake pptx')
  writeFileSync(output, 'original final pptx')
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : ''
}
const print = (value) => process.stdout.write(JSON.stringify(value))

if (args[0] === 'schema') {
  print({
    version: '9.9.9 (fake)',
    schemaVersion: 'cli-agent/v1',
    capabilities: { schemaVersion: 'capabilities/v1' },
    commands: {
      pptx: {
        subcommands: { inspect: {}, 'refurbish-skin': {}, preview: {}, diff: {} },
        patchSchema: {},
        catalogs: { nativeDeckkits: { deckkits: [{ id: 'mckinsey-blue', readiness: 'production' }] } }
      }
    }
  })
} else if (args[0] === 'pptx' && args[1] === 'inspect') {
  print({
    schemaVersion: 'pptx-inspect/v1',
    presentation: { slideCount: 1, size: { width: '10in', height: '5.625in' } },
    slides: [{ index: 0, shapes: [] }]
  })
} else if (args[0] === 'pptx' && args[1] === 'refurbish-skin') {
  writeFileSync(valueAfter('--output'), 'candidate pptx')
  print({
    schemaVersion: 'pptx-refurbish-skin/v1',
    status: 'passed',
    gate: { passed: true, newHighIssues: 0, newMediumIssues: 0 },
    reports: {
      visionDiff: { schemaVersion: 'pptx-vision-diff/v1', status: 'success', summary: { byClass: { new: { high: 0, medium: 0, low: 0 }, changed: { high: 0, medium: 0, low: 0 } } } },
      audit: { schemaVersion: 'pptx-refurbish-audit/v1', status: 'passed', summary: { errorCount: 0, warningCount: 0, sourceSlideCount: 1, finalSlideCount: 1, slideCountMatches: true }, issues: [] }
    }
  })
} else if (args[0] === 'pptx' && args[1] === 'preview') {
  const outputDir = valueAfter('--output-dir')
  const contactSheet = valueAfter('--contact-sheet')
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(outputDir + '/slide-001.png', 'png')
  writeFileSync(contactSheet, 'contact')
  print({
    schemaVersion: 'pptx-preview/v1',
    status: 'success',
    pages: [{ path: outputDir + '/slide-001.png', status: 'success', width: 100, height: 56, byteLength: 3 }],
    contactSheet: { path: contactSheet, width: 100, height: 56, byteLength: 7 }
  })
} else if (args[0] === 'pptx' && args[1] === 'diff') {
  print({
    schemaVersion: 'pptx-diff/v1',
    status: 'success',
    agentGate: { semanticStatus: 'pass' },
    summary: { reliableChanges: 0, uncertainChanges: 0, unsupportedRegions: 0 },
    changeRollup: { reliable: { count: 0 } },
    slides: []
  })
} else if (args[0] === 'pptx' && args[1] === 'contact-diff') {
  process.stderr.write('compare render failed')
  process.exit(7)
} else {
  process.stderr.write('unexpected fake xdoc command: ' + args.join(' '))
  process.exit(2)
}
`,
  )

  const result = spawnSync(
    process.execPath,
    [
      skillPath('scripts/pptx-nova-refurbish-run.mjs'),
      '--deckkit',
      'mckinsey-blue',
      '--source',
      source,
      '--output',
      output,
      '--run-dir',
      runDir,
      '--route',
      'native',
      '--xdoc-bin',
      fakeXdoc,
      '--overwrite',
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(result.status, 1, result.stderr || result.stdout)
  const summary = JSON.parse(result.stdout)
  const phaseNames = summary.phases.map((phase) => phase.name)

  assert.equal(summary.status, 'failed')
  assert.equal(summary.error.phase, 'refurbish-compare')
  assert.equal(readFileSync(output, 'utf8'), 'original final pptx')
  assert.equal(phaseNames.includes('refurbish-compare'), true)
  assert.equal(phaseNames.includes('refurbish-compare-delivery'), false)
  assert.equal(phaseNames.includes('publish'), false)
})

test('translation compare delegates rendering to xdoc contact-diff', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-compare-'))
  const source = join(dir, 'source.pptx')
  const candidate = join(dir, 'candidate.pptx')
  const runDir = join(dir, 'run')
  const output = join(runDir, 'translation-compare.png')
  const reportPath = join(runDir, 'translation-compare.json')
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')

  const fakeXdoc = writeFakeXdoc(
    dir,
    `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : ''
}

if (args[0] === 'pptx' && args[1] === 'contact-diff') {
  const output = valueAfter('--output')
  const dpi = Number(valueAfter('--dpi'))
  writeFileSync(output, 'contact diff png')
  process.stdout.write(JSON.stringify({
    schemaVersion: 'pptx-contact-diff/v1',
    status: 'success',
    outputPath: output,
    summary: { pairCount: 1, scopeMode: 'scoped', dpi, slides: valueAfter('--slides') },
    agentGate: { passed: true, status: 'pass', scopeMode: 'scoped', pairCount: 1 },
    render: { path: output, width: 100, height: 56, dpi }
  }))
} else {
  process.stderr.write('unexpected fake xdoc command: ' + args.join(' '))
  process.exit(2)
}
`,
  )

  const result = runNode([
    skillPath('scripts/pptx-nova-compare.mjs'),
    '--source',
    source,
    '--candidate',
    candidate,
    '--run-dir',
    runDir,
    '--kind',
    'translation',
    '--output',
    output,
    '--report',
    reportPath,
    '--slides',
    '3',
    '--dpi',
    '216',
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])
  const report = JSON.parse(result.stdout)
  assert.equal(report.schemaVersion, 'pptx-contact-diff/v1')
  assert.equal(report.outputPath, output)
  assert.equal(report.summary.slides, '3')
  assert.equal(report.render.dpi, 216)
  assert.equal(readFileSync(reportPath, 'utf8'), `${JSON.stringify(report, null, 2)}\n`)
})

function writeCompareGateFixture(root, makeReport) {
  const runDir = join(root, 'run')
  const finalPptx = join(root, 'final.pptx')
  const compare = join(runDir, 'translation-compare.png')
  const reportPath = join(runDir, 'translation-compare.json')
  const gatePath = join(runDir, 'translation-compare-gate.json')

  mkdirSync(runDir, { recursive: true })
  writeFileSync(finalPptx, 'final pptx')
  writeFileSync(compare, 'compare png')
  writeJson(reportPath, makeReport({ compare, runDir }))

  return { runDir, finalPptx, compare, reportPath, gatePath }
}

function runCompareGateFixture(fixture) {
  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-compare-gate.mjs'),
      '--run-dir',
      fixture.runDir,
      '--final-pptx',
      fixture.finalPptx,
      '--kind',
      'translation',
      '--compare',
      fixture.compare,
      '--report',
      fixture.reportPath,
      '--output',
      fixture.gatePath,
      '--publish',
      '--overwrite',
      '--timestamp',
      '0101000000',
      '--json',
    ],
    2,
  )
  return JSON.parse(result.stdout)
}

function contactDiffReport(options) {
  const { compare } = options
  const scopeMode = Object.prototype.hasOwnProperty.call(options, 'scopeMode')
    ? options.scopeMode
    : 'all-slides'
  const outputPath = Object.prototype.hasOwnProperty.call(options, 'outputPath')
    ? options.outputPath
    : compare
  const summary = { pairCount: 1, dpi: 192 }
  const agentGate = { passed: true, status: 'pass', pairCount: 1 }
  if (scopeMode !== undefined) {
    summary.scopeMode = scopeMode
    agentGate.scopeMode = scopeMode
  }
  const report = {
    schemaVersion: 'pptx-contact-diff/v1',
    status: 'success',
    summary,
    agentGate,
    render: { path: compare, width: 100, height: 56, dpi: 192 },
  }
  if (outputPath !== undefined) report.outputPath = outputPath
  return report
}

test('compare gate blocks contact-diff reports without explicit all-slides scopeMode', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-compare-gate-missing-scope-'))
  const fixture = writeCompareGateFixture(root, ({ compare }) => ({
    ...contactDiffReport({ compare, scopeMode: undefined }),
    scope: { requested: '3' },
  }))

  const report = runCompareGateFixture(fixture)

  assert.equal(report.status, 'fail')
  assert.ok(
    report.blockers.includes(
      'contact-diff scopeMode is missing; final delivery requires all-slides contact-diff',
    ),
    report.blockers.join('\n'),
  )
})

test('compare gate blocks contact-diff reports whose output path differs from checked PNG', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-compare-gate-path-mismatch-'))
  const fixture = writeCompareGateFixture(root, ({ compare, runDir }) =>
    contactDiffReport({ compare, outputPath: join(runDir, 'old-compare.png') }),
  )

  const report = runCompareGateFixture(fixture)

  assert.equal(report.status, 'fail')
  assert.ok(
    report.blockers.some((blocker) =>
      blocker.includes('contact-diff output differs from checked compare path:'),
    ),
    report.blockers.join('\n'),
  )
})

test('compare gate blocks contact-diff reports whose render path differs from checked PNG', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-compare-gate-render-path-mismatch-'))
  const fixture = writeCompareGateFixture(root, ({ compare, runDir }) => {
    const report = contactDiffReport({ compare })
    report.render.path = join(runDir, 'old-render.png')
    return report
  })

  const report = runCompareGateFixture(fixture)

  assert.equal(report.status, 'fail')
  assert.ok(
    report.blockers.some((blocker) =>
      blocker.includes('contact-diff output differs from checked compare path:'),
    ),
    report.blockers.join('\n'),
  )
})

test('compare gate blocks contact-diff reports without a reported output path', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-compare-gate-missing-path-'))
  const fixture = writeCompareGateFixture(root, ({ compare }) => {
    const report = contactDiffReport({ compare })
    delete report.outputPath
    delete report.render.path
    return report
  })

  const report = runCompareGateFixture(fixture)

  assert.equal(report.status, 'fail')
  assert.ok(
    report.blockers.includes('contact-diff output path is missing'),
    report.blockers.join('\n'),
  )
})
