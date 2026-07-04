import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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

function skillPath(path) {
  return join(skillRoot, path)
}

function skillUrl(path) {
  return pathToFileURL(skillPath(path)).href
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

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
  const fakeXdoc = join(root, 'fake-xdoc.mjs')
  writeFileSync(
    fakeXdoc,
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
  chmodSync(fakeXdoc, 0o755)
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

  for (const path of [paths.outlinePath, paths.deckLockPath, paths.contentPath, paths.assetsDir]) {
    assert.equal(existsSync(path), true, path)
  }
  const commands = JSON.parse(readFileSync(join(paths.runDir, 'commands.json'), 'utf8'))
  assert.match(commands.build, /pptx-nova-build\.mjs/)
  assert.match(commands.probe, /pptx-nova-probe\.mjs/)
  assert.match(commands.probe, /xdoc-capabilities\.json/)
  assert.match(commands.validate, /--mode delivery/)
  assert.equal(paths.capabilityPath, join(paths.runDir, 'xdoc-capabilities.json'))
  assert.equal(paths.previewsDir, join(paths.runDir, 'previews'))
  assert.equal(paths.finalPptx, join(root, 'script-test.pptx'))
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

test('refurbish runner writes semantic diff before publishing output', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-refurbish-run-'))
  const source = join(root, 'source.pptx')
  const output = join(root, 'out.pptx')
  const runDir = join(root, 'run')
  const fakeXdoc = join(root, 'fake-xdoc.mjs')
  writeFileSync(source, 'fake pptx')
  writeFileSync(
    fakeXdoc,
    `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'

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
} else {
  process.stderr.write('unexpected fake xdoc command: ' + args.join(' '))
  process.exit(2)
}
`,
  )
  chmodSync(fakeXdoc, 0o755)

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

  assert.equal(summary.status, 'needs-human-review')
  assert.equal(existsSync(output), true)
  assert.equal(existsSync(join(runDir, 'pptx-diff.json')), true)
  assert.equal(summary.artifacts.pptxDiff, join(runDir, 'pptx-diff.json'))
  assert.ok(phaseNames.includes('pptx-semantic-diff'))
  assert.ok(gateNames.includes('pptx-semantic-diff'))
  assert.ok(phaseNames.indexOf('pptx-semantic-diff') < phaseNames.indexOf('publish'))
})
