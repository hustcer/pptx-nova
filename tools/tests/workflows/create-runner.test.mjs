import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { test } from 'node:test'
import { repoRoot, runNode, runNodeStatus, skillPath, writeJson } from '../helpers/common.mjs'
import { writeFakeXdoc, successfulFakeXdocSource } from '../helpers/fake-xdoc.mjs'
import {
  readCreateResult,
  readCreateSummary,
  swissColumnContent,
  swissColumnLock,
} from '../helpers/runner-fixtures.mjs'
import { cartesianImageContent } from '../helpers/asset-fixtures.mjs'
import { designReviewFixture } from '../helpers/design-review-fixtures.mjs'
import { captureVisualBinding } from '../../../pptx-nova/scripts/lib/review/canonical-visual-evidence.mjs'

test('create runner retains diagnostic previews on old runtimes without publishing', () => {
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
    skillPath('scripts/cli/create/run.mjs'),
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
  const compactResult = readCreateResult(result)
  const summary = readCreateSummary(result)
  const phaseNames = summary.phases.map((phase) => phase.name)
  const gateNames = summary.gates.map((gate) => gate.name)

  assert.equal(summary.status, 'needs-human-review')
  assert.equal(summary.machineGatesPassed, true)
  assert.equal(compactResult.performance.render.previewRenderInvocations, 1)
  assert.equal(compactResult.performance.render.previewSlideCount, summary.slideCount)
  assert.ok(compactResult.performance.render.estimatedRenderedPixels > 0)
  assert.equal(compactResult.performance.budget.withinBaseline, true)
  assert.ok(result.stdout.length < readFileSync(summary.artifacts.summary, 'utf8').length)
  assert.equal(summary.agentSummary.decision, 'continue-to-human-review')
  assert.equal(summary.agentSummary.gates.dryRun.semanticEvidence, true)
  assert.equal(summary.agentSummary.gates.dryRun.semanticIssues, 0)
  assert.equal(summary.agentSummary.gates.apply.semanticEvidence, true)
  assert.equal(summary.agentSummary.gates.apply.semanticIssues, 0)
  assert.equal(summary.agentSummary.gates.vision.semanticEvidence, true)
  assert.equal(summary.agentSummary.gates.vision.semanticConsistent, true)
  assert.equal(summary.agentSummary.gates.vision.semanticPassed, true)
  assert.equal(summary.agentSummary.gates.vision.semanticIssues, 0)
  assert.equal(summary.agentSummary.gates.vision.semanticSourceRules, 82)
  assert.equal(summary.agentSummary.gates.vision.semanticNormalizedRules, 81)
  assert.equal(existsSync(output), false)
  assert.equal(existsSync(join(runDir, 'candidate.pptx')), true)
  assert.equal(existsSync(join(runDir, 'preview.json')), true)
  assert.equal(existsSync(join(runDir, 'previews', 'contact-sheet.png')), true)
  assert.ok(phaseNames.indexOf('dry-run') < phaseNames.indexOf('apply'))
  assert.ok(phaseNames.indexOf('apply') < phaseNames.indexOf('vision-check'))
  assert.equal(phaseNames.includes('publish'), false)
  for (const gate of [
    'validate-content',
    'build',
    'check-lock',
    'dry-run',
    'apply',
    'vision-check',
    'png-previews',
  ]) {
    assert.ok(gateNames.includes(gate), gate)
  }
})

test('create runner resolves POSIX input and run paths before invoking child tools', (t) => {
  if (process.platform === 'win32') return t.skip('POSIX filesystem contract')
  const root = mkdtempSync(join(tmpdir(), 'nova-create-path-'))
  const actual = join(root, 'real')
  mkdirSync(join(actual, 'child'), { recursive: true })
  symlinkSync(join(actual, 'child'), join(root, 'link'))
  const parent = `${root}/link/..`
  const output = `${parent}/out.pptx`
  const runDir = `${parent}/run`
  writeJson(join(actual, 'content.json'), swissColumnContent())
  writeJson(join(actual, 'lock.json'), swissColumnLock({ finalPptx: output, runDir }))
  const fakeXdoc = writeFakeXdoc(actual, successfulFakeXdocSource())
  const result = runNode([
    skillPath('scripts/cli/create/run.mjs'),
    '--content',
    `${parent}/content.json`,
    '--lock',
    `${parent}/lock.json`,
    '--output',
    output,
    '--run-dir',
    runDir,
    '--xdoc-bin',
    `${parent}/${basename(fakeXdoc)}`,
    '--json',
  ])
  const summary = readCreateSummary(result)
  assert.equal(summary.machineGatesPassed, true)
  assert.equal(existsSync(join(actual, 'run', 'candidate.pptx')), true)
  assert.equal(existsSync(join(root, 'run')), false)
  assert.equal(existsSync(output), false)
})

test('create runner finalizes only the same reviewed canonical candidate without rerendering', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-create-canonical-'))
  const runDir = join(root, 'run')
  mkdirSync(runDir)
  const content = join(runDir, 'content.json')
  const lock = join(runDir, 'deck_lock.json')
  const output = join(root, 'final.pptx')
  writeJson(content, swissColumnContent())
  writeJson(lock, swissColumnLock({ finalPptx: output, runDir }))
  let source = successfulFakeXdocSource().replace(
    "import { dirname, join } from 'node:path'",
    "import { dirname, join } from 'node:path'\nimport { createHash } from 'node:crypto'",
  )
  source = source.replace(
    'subcommands: { apply: {},',
    "subcommands: { 'visual-audit': { visualModes: { default: 'regression', values: ['regression','create'] } }, apply: {},",
  )
  source = source.replace(
    "} else if (args[0] === 'pptx' && args[1] === 'apply') {",
    `} else if (args[1] === 'visual-audit') {
  const dir = valueAfter('--output-dir')
  mkdirSync(dir, { recursive: true })
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfXkAAAAASUVORK5CYII=', 'base64')
  writeFileSync(dir + '/slide.png', png)
  writeFileSync(dir + '/candidate.pdf', 'test pdf')
  const hash = b => createHash('sha256').update(b).digest('hex')
  const candidate = readFileSync(valueAfter('--candidate'))
  const report = {
    schemaVersion: 'pptx-visual-evidence/v1', status: 'success', policyId: 'pptx-visual-oracle-create/v1',
    subjects: [{ id: 'candidate', sha256: hash(candidate), byteLength: candidate.length, slideCount: 1, selectedSlides: [1] }],
    checks: ['input-integrity','static-layout','pdf-final-layout','pdfium-raster','pixel-diff','ocr-overflow','font-resolution','region-attribution','independent-reference','policy'].map((id,i) => ({ id, required: i<4 || i===9, outcome: i<4 || i===9 ? 'pass' : 'skipped' })),
    decision: { action: 'proceed', assurance: 'candidate-checks', reasons: [] }, findings: [],
    artifacts: [['slide.png','image/png',1],['candidate.pdf','application/pdf',null]].map(([path,mimeType,slide]) => { const b = readFileSync(dir+'/'+path); return { id:path,path,mimeType,slide,subjectId:'candidate',sha256:hash(b),byteLength:b.length } }),
  }
  writeFileSync(dir + '/manifest.json', JSON.stringify(report))
  print(report)
} else if (args[0] === 'pptx' && args[1] === 'apply') {`,
  )
  const fake = writeFakeXdoc(root, source)
  const args = [
    skillPath('scripts/cli/create/run.mjs'),
    '--content',
    content,
    '--lock',
    lock,
    '--output',
    output,
    '--run-dir',
    runDir,
    '--xdoc-bin',
    fake,
    '--json',
  ]
  const summary = readCreateSummary(runNode(args))
  assert.equal(summary.status, 'needs-visual-review')
  assert.equal(summary.agentSummary.gates.preview.gate, 'passed')
  assert.equal(summary.agentSummary.gates.preview.pages, 1)
  assert.equal(existsSync(output), false)
  assert.equal(summary.performance.render.previewRenderInvocations, 1)
  const review = join(runDir, 'visual_review.json')
  runNodeStatus([...args, '--finalize', '--visual-review', review], 1)
  const designReview = join(runDir, 'design_review.json')
  writeJson(
    designReview,
    designReviewFixture(
      captureVisualBinding(summary.artifacts.canonicalManifest, summary.artifacts.candidate),
    ),
  )
  const checks = [
    'titleWrap',
    'bodyReadability',
    'alignment',
    'spacing',
    'contrast',
    'chartTableLegibility',
    'repeatedLayoutRhythm',
    'placeholderResidue',
    'footerPageChrome',
    'assetFit',
  ]
  runNode([
    skillPath('scripts/cli/review/visual-review.mjs'),
    '--mode',
    'create',
    '--design-review',
    designReview,
    '--candidate',
    summary.artifacts.candidate,
    '--manifest',
    summary.artifacts.canonicalManifest,
    '--previews',
    summary.artifacts.previews,
    '--output',
    review,
    '--slides-reviewed',
    '1',
    ...checks.flatMap((c) => ['--check', c + '=pass']),
  ])
  const original = readFileSync(content)
  writeFileSync(content, original.toString() + ' ')
  runNodeStatus([...args, '--finalize', '--visual-review', review], 1)
  assert.equal(existsSync(output), false)
  writeFileSync(content, original)
  const final = readCreateSummary(runNode([...args, '--finalize', '--visual-review', review]))
  assert.equal(final.status, 'delivered')
  assert.equal(final.deliveryReady, true)
  assert.ok(final.performance.totalMs >= final.performance.measuredPhaseMs)
  assert.equal(final.phases.filter((p) => p.name === 'preview-render').length, 1)
  assert.equal(final.phases.filter((p) => p.name === 'apply').length, 1)
  assert.deepEqual(readFileSync(output), readFileSync(summary.artifacts.candidate))
})

test('create runner propagates assets to build, lock check, dry-run, and apply', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-create-assets-'))
  const runDir = join(root, 'run')
  const assetsDir = join(runDir, 'assets')
  const contentPath = join(runDir, 'content.json')
  const lockPath = join(runDir, 'deck_lock.json')
  const manifestPath = join(runDir, 'assets_manifest.json')
  const output = join(root, 'out.pptx')
  mkdirSync(assetsDir, { recursive: true })
  writeFileSync(
    join(assetsDir, 'editorial.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#665D56"/></svg>',
  )
  writeJson(contentPath, cartesianImageContent({ 'image.editorial': 'editorial_reference' }))
  writeJson(manifestPath, {
    schemaVersion: 'pptx-nova-assets-manifest/v1',
    assetRoot: 'assets',
    entries: [
      {
        id: 'editorial_reference',
        kind: 'image',
        status: 'generated',
        path: 'editorial.svg',
        pptxUse: {
          slotId: 'image.editorial',
          ratio: '16:9',
          fitPolicy: 'contain',
        },
      },
    ],
  })
  writeJson(lockPath, {
    schemaVersion: 'pptx-nova-deck-lock/v1',
    mode: 'express',
    objective: 'Verify cartesian image asset propagation',
    outlinePath: 'outline.json',
    contentPath: 'content.json',
    patchPath: 'patch.json',
    assetsManifestPath: 'assets_manifest.json',
    output: { finalPptx: output, runDir },
    canvas: { format: 'ppt169', width: '13.333in', height: '7.5in' },
    deckkit: { id: 'cartesian' },
    slides: [
      {
        type: 'cartesianImageStatsSlide',
        title: 'Structural overview',
        purpose: 'Show editorial evidence with supporting metrics',
        rhythm: 'dense',
        imageSlots: { 'image.editorial': 'editorial_reference' },
      },
    ],
    assumptions: [],
  })
  const fakeXdoc = writeFakeXdoc(root, successfulFakeXdocSource())

  const result = runNode([
    skillPath('scripts/cli/create/run.mjs'),
    '--deckkit',
    'cartesian',
    '--content',
    contentPath,
    '--lock',
    lockPath,
    '--assets',
    manifestPath,
    '--output',
    output,
    '--run-dir',
    runDir,
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])
  const summary = readCreateSummary(result)
  const phaseByName = new Map(summary.phases.map((phase) => [phase.name, phase]))
  const buildCommand = phaseByName.get('build').command
  const lockCommand = phaseByName.get('check-lock').command
  const dryRunCommand = phaseByName.get('dry-run').command
  const applyCommand = phaseByName.get('apply').command

  assert.equal(summary.assetsManifest, manifestPath)
  assert.ok(buildCommand.includes(`--assets ${manifestPath}`))
  assert.ok(lockCommand.includes(`--assets ${manifestPath}`))
  assert.ok(dryRunCommand.includes(`--asset-root ${runDir}`))
  assert.ok(applyCommand.includes(`--asset-root ${runDir}`))
  assert.ok(dryRunCommand.indexOf('--asset-root') < dryRunCommand.indexOf('--dry-run'))
  assert.ok(dryRunCommand.indexOf('--dry-run') < dryRunCommand.indexOf('--json'))
  assert.ok(applyCommand.indexOf('--asset-root') < applyCommand.indexOf('--json'))
  const patch = JSON.parse(readFileSync(join(runDir, 'patch.json'), 'utf8'))
  assert.deepEqual(patch.ops.find((op) => op.op === 'add-image').assetSource, {
    path: 'assets/editorial.svg',
    mimeType: 'image/svg+xml',
  })
})

test('create runner stops when dry-run reports semantic issues', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-create-semantic-dry-run-'))
  const runDir = join(root, 'run')
  const contentPath = join(runDir, 'content.json')
  const lockPath = join(runDir, 'deck_lock.json')
  const output = join(root, 'out.pptx')
  mkdirSync(runDir, { recursive: true })
  writeJson(contentPath, swissColumnContent())
  writeJson(lockPath, swissColumnLock({ finalPptx: output, runDir }))
  const source = successfulFakeXdocSource().replace(
    'visualRisks: [], semanticIssues: [], wouldWrite: true',
    "visualRisks: [], semanticIssues: [{ code: 'duplicate-id', ruleId: 'sdk/unique/p:cNvPr/id/part', part: 'ppt/slides/slide1.xml', message: 'duplicate id' }], wouldWrite: true",
  )
  const fakeXdoc = writeFakeXdoc(root, source)

  const result = runNodeStatus(
    [
      skillPath('scripts/cli/create/run.mjs'),
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
    1,
  )
  const summary = readCreateSummary(result)
  assert.equal(summary.status, 'failed')
  assert.equal(summary.error.phase, 'dry-run')
  assert.equal(summary.agentSummary.decision, 'stop-and-fix')
  assert.equal(summary.agentSummary.gates.dryRun.semanticIssues, 1)
  assert.equal(existsSync(output), false)
})

test('create runner stops when full-package semantic vision gate fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-create-semantic-vision-'))
  const runDir = join(root, 'run')
  const contentPath = join(runDir, 'content.json')
  const lockPath = join(runDir, 'deck_lock.json')
  const output = join(root, 'out.pptx')
  mkdirSync(runDir, { recursive: true })
  writeJson(contentPath, swissColumnContent())
  writeJson(lockPath, swissColumnLock({ finalPptx: output, runDir }))
  const source = successfulFakeXdocSource().replace(
    'semanticSummary: { passed: true, issueCount: 0, sourceRuleCount: 82, normalizedRuleCount: 81 }, semanticIssues: []',
    "semanticSummary: { passed: false, issueCount: 1, sourceRuleCount: 82, normalizedRuleCount: 81 }, semanticIssues: [{ code: 'invalid-attribute-comparison', ruleId: 'sdk/attribute-compare/p:sldRg/st/<=/end', part: 'ppt/slides/slide1.xml', message: 'start exceeds end' }]",
  )
  const fakeXdoc = writeFakeXdoc(root, source)

  const result = runNodeStatus(
    [
      skillPath('scripts/cli/create/run.mjs'),
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
    1,
  )
  const summary = readCreateSummary(result)
  assert.equal(summary.status, 'failed')
  assert.equal(summary.error.phase, 'vision-check')
  assert.equal(summary.agentSummary.decision, 'stop-and-fix')
  assert.equal(summary.agentSummary.gates.vision.semanticPassed, false)
  assert.equal(summary.agentSummary.gates.vision.semanticIssues, 1)
  assert.equal(existsSync(output), false)
})

test('create runner rejects incomplete V2 semantic rule coverage', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-create-semantic-coverage-'))
  const runDir = join(root, 'run')
  const contentPath = join(runDir, 'content.json')
  const lockPath = join(runDir, 'deck_lock.json')
  const output = join(root, 'out.pptx')
  mkdirSync(runDir, { recursive: true })
  writeJson(contentPath, swissColumnContent())
  writeJson(lockPath, swissColumnLock({ finalPptx: output, runDir }))
  const source = successfulFakeXdocSource().replace(
    'semanticSummary: { passed: true, issueCount: 0, sourceRuleCount: 82, normalizedRuleCount: 81 }, semanticIssues: []',
    'semanticSummary: { passed: true, issueCount: 0, sourceRuleCount: 1, normalizedRuleCount: 1 }, semanticIssues: []',
  )
  const fakeXdoc = writeFakeXdoc(root, source)

  const result = runNodeStatus(
    [
      skillPath('scripts/cli/create/run.mjs'),
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
    1,
  )
  const summary = readCreateSummary(result)
  assert.equal(summary.status, 'failed')
  assert.equal(summary.error.phase, 'vision-check')
  assert.equal(summary.agentSummary.gates.vision.semanticEvidence, false)
  assert.equal(existsSync(output), false)
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
      skillPath('scripts/cli/create/run.mjs'),
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
  const compactResult = readCreateResult(result)
  const summary = JSON.parse(
    readFileSync(join(compactResult.runDir, 'create-run-summary.json'), 'utf8'),
  )
  const dryRun = summary.phases.find((phase) => phase.name === 'dry-run')

  assert.equal(summary.status, 'needs-human-review')
  assert.equal(summary.runDir.endsWith(join('artifacts', 'run')), true)
  assert.equal(existsSync(output), false)
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
        skillPath('scripts/cli/create/run.mjs'),
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
    return readCreateResult(result)
  }

  const first = run('out-1.pptx')
  const second = run('out-2.pptx')

  assert.notEqual(first.runDir, second.runDir)
  assert.match(basename(first.runDir), /^create-swiss-grid-\d{8}-\d{9}-[0-9a-z]+-[0-9a-z]+$/)
  assert.match(basename(second.runDir), /^create-swiss-grid-\d{8}-\d{9}-[0-9a-z]+-[0-9a-z]+$/)
  assert.equal(existsSync(join(first.runDir, 'create-run-summary.json')), true)
  assert.equal(existsSync(join(second.runDir, 'create-run-summary.json')), true)
  assert.equal(existsSync(join(first.runDir, 'candidate.pptx')), true)
  assert.equal(existsSync(join(second.runDir, 'candidate.pptx')), true)
})

for (const partial of [false, true])
  test(`create runner stops after apply failure without validating a stale candidate (partial=${partial})`, () => {
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
import { writeFileSync } from 'node:fs'
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
  print({ schemaVersion: 'pptx-dry-run/v1', status: 'success', warnings: [], changedParts: [], opResults: [], visualRisks: [], semanticIssues: [], wouldWrite: true })
} else if (args[0] === 'pptx' && args[1] === 'apply') {
  const output = args[args.indexOf('-o') + 1]
  if (${partial}) writeFileSync(output, 'partially published candidate')
  print({ schemaVersion: 'pptx-error/v1', status: 'error', error: { code: ${partial} ? 'output_error' : 'output_exists' },
    ...(${partial} ? { primaryOutputPublished: true, outputUntouched: false, output, blockedOutput: output + '.xdoc.json' } : {}) })
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
        skillPath('scripts/cli/create/run.mjs'),
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
    const compactResult = readCreateResult(result)
    const summary = JSON.parse(
      readFileSync(join(compactResult.runDir, 'create-run-summary.json'), 'utf8'),
    )
    const phaseNames = summary.phases.map((phase) => phase.name)

    assert.equal(summary.status, 'failed')
    assert.equal(summary.error.phase, 'apply')
    assert.equal(existsSync(output), false)
    assert.equal(existsSync(staleCandidate), partial)
    if (partial) {
      assert.equal(readFileSync(staleCandidate, 'utf8'), 'partially published candidate')
      assert.equal(compactResult.error.primaryOutputPublished, true)
      assert.equal(compactResult.error.outputUntouched, false)
      assert.equal(compactResult.error.output, staleCandidate)
      assert.equal(compactResult.error.blockedOutput, staleCandidate + '.xdoc.json')
    } else {
      assert.equal('primaryOutputPublished' in compactResult.error, false)
    }
    assert.equal(phaseNames.includes('vision-check'), false)
    assert.equal(phaseNames.includes('preview-render'), false)
    assert.equal(phaseNames.includes('publish'), false)
  })
