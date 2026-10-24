import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
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

function publicXdocSchema({ version, definitions }) {
  const sdkVersion = version.split(' ')[0]
  return {
    schemaVersion: 'cli-agent/v1',
    version,
    commands: {
      pptx: {
        patchSchema: {
          jsonSchema: { $defs: definitions },
        },
      },
    },
    build: {
      schemaVersion: 'xdoc-build/v1',
      product: 'xdoc-cli',
      customerId: 'public',
      licenseId: 'not-applicable',
      buildId: 'build-public-test',
      edition: 'public-cli',
      pdfium: {
        provider: 'example/pdfium',
        version: '1.0.0.0',
        commit: '0123456789abcdef',
        sha256: 'a'.repeat(64),
        linkMode: 'static',
      },
    },
    authContract: {
      schemaVersion: 'xdoc-auth-contract-registry/v1',
      buildProfile: 'production',
      buildId: 'build-public-test',
      sdkVersion,
      trustProfileSha256: 'b'.repeat(64),
    },
  }
}

function writeFinalizeSemanticFixtures(root, semanticPassed) {
  const inspectPath = join(root, 'inspect.json')
  const visionPath = join(root, 'vision.json')
  const semanticIssues = semanticPassed
    ? []
    : [
        {
          code: 'duplicate-id',
          ruleId: 'sdk/unique/p:cNvPr/id/part',
          part: 'ppt/slides/slide1.xml',
          message: 'duplicate non-visual property id',
        },
      ]
  writeJson(inspectPath, {
    schemaVersion: 'pptx-inspect/v1',
    status: 'success',
    presentation: { slideCount: 1, size: { width: '13.333in', height: '7.5in' } },
    slides: [{ index: 0, shapes: [] }],
  })
  writeJson(visionPath, {
    schemaVersion: 'pptx-vision/v1',
    status: 'success',
    summary: { issueCount: 0, bySeverity: { high: 0, medium: 0, low: 0 } },
    issues: [],
    semanticSummary: {
      passed: semanticPassed,
      issueCount: semanticIssues.length,
      sourceRuleCount: 82,
      normalizedRuleCount: 81,
    },
    semanticIssues,
  })
  return { inspectPath, visionPath }
}

function fileIdentity(path) {
  const bytes = readFileSync(path)
  return {
    path,
    byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

test('shared ChartEx semantics normalize dataEx and deck-lock semanticSource', async () => {
  const { normalizeChartSemantics, validateChartSemantics } = await import(
    skillUrl('scripts/lib/chart-semantics.mjs')
  )
  const validCases = [
    ['waterfall', { points: [{ label: 'Start', value: 100, kind: 'total' }] }],
    ['funnel', { stages: [{ label: 'Visitors', value: 120 }] }],
    ['histogram', { values: [1, 2, 3] }],
    [
      'treemap',
      {
        nodes: [
          { id: 'root', label: 'Root', value: 10 },
          { id: 'leaf', parent: 'root', label: 'Leaf', value: 10 },
        ],
      },
    ],
    [
      'sunburst',
      {
        nodes: [
          { id: 'root', label: 'Root', value: 10 },
          { id: 'leaf', parent: 'root', label: 'Leaf', value: 10 },
        ],
      },
    ],
    ['box-whisker', { series: [{ name: 'North', categories: ['D1', 'D2'], values: [10, 12] }] }],
  ]

  for (const [kind, dataEx] of validCases) {
    const semantics = normalizeChartSemantics(
      { op: 'add-chart', kind, dataEx },
      { chart: { semanticSource: 'content.slides[0].data' } },
    )
    assert.equal(semantics.dialect, 'chartex')
    assert.equal(semantics.source, 'content.slides[0].data')
    assert.deepEqual(validateChartSemantics(semantics), { errors: [], warnings: [] })
  }

  const invalidHierarchy = normalizeChartSemantics({
    op: 'add-chart',
    kind: 'treemap',
    dataEx: { nodes: [{ id: 'leaf', parent: 'missing', label: 'Leaf', value: 10 }] },
  })
  assert.equal(
    validateChartSemantics(invalidHierarchy).errors.some(
      (item) => item.code === 'chart-ex-node-parent-missing',
    ),
    true,
  )
})

test('semantic-audit and check-lock share ChartEx dataEx semantics', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-chartex-semantics-'))
  const patchPath = join(root, 'patch.json')
  const lockPath = join(root, 'deck_lock.json')
  const auditPath = join(root, 'semantic-audit.json')
  writeJson(patchPath, {
    schemaVersion: 'pptx-patch/v1',
    ops: [
      {
        op: 'add-chart',
        slide: 0,
        kind: 'waterfall',
        x: '1in',
        y: '1in',
        w: '5in',
        h: '3in',
        dataEx: {
          points: [
            { label: 'Start', value: 100, kind: 'total' },
            { label: 'Growth', value: 25, kind: 'increase' },
          ],
        },
      },
    ],
  })
  writeJson(lockPath, {
    schemaVersion: 'pptx-nova-deck-lock/v1',
    mode: 'create',
    canvas: { width: '13.333in', height: '7.5in' },
    colors: { accent: '#123456' },
    typography: { title: 'Arial', body: 'Arial' },
    slides: [
      {
        title: 'Waterfall',
        claimTitle: 'Growth offsets the starting base.',
        slideType: 'chartSlide',
        rhythm: 'anchor',
        chart: { kind: 'waterfall', semanticSource: 'content.slides[0].data' },
      },
    ],
  })

  const auditResult = runNode([
    skillPath('scripts/pptx-nova-semantic-audit.mjs'),
    '--deck-lock',
    lockPath,
    '--patch',
    patchPath,
    '--output',
    auditPath,
    '--json',
  ])
  const audit = JSON.parse(auditResult.stdout)
  assert.equal(audit.charts[0].checks.dataShape.status, 'passed')
  assert.equal(audit.charts[0].checks.source.status, 'passed')
  assert.equal(
    audit.warnings.some((item) => item.code === 'chart-data-missing'),
    false,
  )

  const lockResult = runNode([
    skillPath('scripts/pptx-nova-check-lock.mjs'),
    '--lock',
    lockPath,
    '--patch',
    patchPath,
    '--json',
  ])
  const lock = JSON.parse(lockResult.stdout)
  assert.equal(
    lock.errors.some((item) => item.code.startsWith('chart-')),
    false,
  )
  assert.equal(
    lock.warnings.some((item) => item.code === 'chart-data-missing'),
    false,
  )
})

function readRefurbishResult(result) {
  const output = JSON.parse(result.stdout)
  assert.equal(output.schemaVersion, 'pptx-nova-refurbish-result/v1')
  assert.equal(output.mode, 'refurbish')
  assert.equal('phases' in output, false)
  assert.ok(output.agentSummary)
  return output
}

function readRefurbishSummary(result) {
  const output = readRefurbishResult(result)
  return JSON.parse(readFileSync(join(output.runDir, 'refurbish-run-summary.json'), 'utf8'))
}

function readCreateResult(result) {
  const output = JSON.parse(result.stdout)
  assert.equal(output.schemaVersion, 'pptx-nova-create-result/v1')
  assert.equal(output.mode, 'create')
  assert.equal('phases' in output, false)
  assert.ok(output.agentSummary)
  return output
}

function readCreateSummary(result) {
  const output = readCreateResult(result)
  return JSON.parse(readFileSync(join(output.runDir, 'create-run-summary.json'), 'utf8'))
}

function writeFakeXdoc(root, source) {
  const scriptPath = join(root, 'fake-xdoc.mjs')
  // Model the current executable's evidence contract in every successful
  // rendering fixture. These helpers only construct test reports; production
  // gates still validate real artifact/input hashes independently.
  source = source.replace(
    /schemaVersion: '(pptx-preview|pptx-contact-diff|pptx-visual-evidence)\/v1'/g,
    "$&, renderContext: { schemaVersion: 'xdoc-render-context/v1', fieldDate: process.env.XDOC_FIELD_DATE, authorizationClock: 'independent', bitmapCacheBinding: 'pdf-sha256' }",
  )
  source = source.replace(
    /(else if \(args\[0\] === 'pptx' && args\[1\] === 'diff'\) \{[\s\S]*?)print\((\{[\s\S]*?\})\)/g,
    '$1print(__fakeFullDiff($2))',
  )
  source = source.replace(
    '\n',
    `
import { readFileSync as __read, writeFileSync as __write } from 'node:fs'
import { createHash as __hash } from 'node:crypto'
function __fakeFullDiff(report) {
  const argv = process.argv.slice(2)
  const value = flag => argv[argv.indexOf(flag) + 1]
  const hash = bytes => __hash('sha256').update(bytes).digest('hex')
  const inputBinding = { algorithm: 'sha256', baseline: hash(__read(value('--source'))), target: hash(__read(value('--candidate'))) }
  const full = { ...report, detail: 'full', inputBinding }
  const text = JSON.stringify(full)
  const path = value('--output')
  __write(path, text, { flag: 'wx' })
  return { ...report, detail: 'summary', inputBinding, fullEvidenceAvailable: true,
    fullEvidence: { path, sha256: hash(text), schemaVersion: 'pptx-diff/v1', detail: 'full' } }
}
`,
  )
  writeFileSync(scriptPath, source)
  chmodSync(scriptPath, 0o755)
  return scriptPath
}

function writeMultipartContactDiffXdoc(root) {
  return writeFakeXdoc(
    root,
    `#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : ''
}
const selector = valueAfter('--slides')
const dpi = Number(valueAfter('--dpi'))
const output = valueAfter('--output')
const identity = (path) => {
  const bytes = readFileSync(path)
  return { path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
const startedAt = Date.now()
const delayMap = JSON.parse(process.env.FAKE_XDOC_DELAY_MAP || '{}')
const delayMs = Number(delayMap[selector] ?? 0)
if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
const log = process.env.FAKE_XDOC_LOG
if (log) appendFileSync(log, JSON.stringify({ selector, dpi, output, startedAt, endedAt: Date.now() }) + '\\n')
const mode = process.env.FAKE_XDOC_MODE || 'success'
const shouldFail192 = mode === 'retry-part-2' && selector === '21-40' && dpi === 192
const shouldFailBoth = mode === 'fail-part-2' && selector === '21-40'
const nonRetryable = mode === 'non-retryable' && selector === '21-40' && dpi === 192
if (shouldFail192 || shouldFailBoth || nonRetryable) {
  process.stdout.write(JSON.stringify({
    schemaVersion: 'pptx-contact-diff/v1',
    status: 'error',
    error: {
      kind: nonRetryable ? 'input_error' : 'render_error',
      code: nonRetryable ? 'input_error' : 'render_error',
      stage: 'render',
      retryable: !nonRetryable,
      requestedDpi: dpi,
      pairCount: selector === '41-48' ? 8 : 20,
      reason: nonRetryable ? 'invalid-input' : 'canvas-dimension-limit'
    }
  }))
  process.exit(7)
}
const [start, end] = selector.split('-').map(Number)
const pairCount = end - start + 1
writeFileSync(output, 'png:' + selector + ':' + dpi)
process.stdout.write(JSON.stringify({
  schemaVersion: 'pptx-contact-diff/v1',
  status: 'success',
  baseline: identity(valueAfter('--source')),
  target: identity(valueAfter('--candidate')),
  baselinePath: valueAfter('--source'),
  targetPath: valueAfter('--candidate'),
  outputPath: output,
  summary: { pairCount, scopeMode: 'selected-slides', dpi },
  scope: { requested: selector, slides: Array.from({ length: pairCount }, (_, index) => start + index), basis: 'source-slides' },
  agentGate: { passed: true, status: 'pass', scopeMode: 'selected-slides', pairCount },
  render: { path: output, width: 7043, height: pairCount * 500 + 73, dpi }
}))
`,
  )
}

test('capability probe advertises field-scoped schema lookup when disclosed', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-probe-fields-'))
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] === 'schema') {
  process.stdout.write(JSON.stringify({
    version: '9.9.9 (fake)',
    schemaVersion: 'cli-agent/v1',
    capabilities: { schemaVersion: 'capabilities/v1' },
    commands: {
      pptx: {
        subcommands: { apply: {} },
        schemaDisclosure: {
          modes: [
            { flag: '--mode ops --ops a,b,c' },
            { flag: '--fields a,b,c' },
            { flag: '--defs summary|full' },
            { flag: '--minimal' }
          ],
          agentHint: 'Use --mode ops with --fields for focused discovery.'
        },
        patchSchema: {
          supportedOps: ['set-shape', 'set-shape'],
          operations: [{ op: 'set-shape' }]
        },
        catalogs: {}
      }
    }
  }))
  process.exit(0)
}
if (args.at(-1) === '--help') {
  process.stdout.write('--json --report --output preview')
  process.exit(0)
}
process.exit(2)
`,
  )
  const result = runNode([
    skillPath('scripts/pptx-nova-probe.mjs'),
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.capabilities.schemaSlicing.available, true)
  assert.equal(report.capabilities.schemaSlicing.fieldsAvailable, true)
  assert.equal(report.capabilities.schemaSlicing.defsAvailable, true)
  assert.deepEqual(report.capabilities.schemaSlicing.defsModes, ['summary', 'full'])
  assert.ok(report.capabilities.schemaSlicing.modes.includes('--fields a,b,c'))
  assert.match(
    report.disclosure.targetedLookup.operationSchema,
    /--fields <needed-fields> --defs summary/,
  )
  assert.match(report.disclosure.targetedLookup.operationSchema, /--defs full before constructing/)
  assert.match(report.disclosure.targetedLookup.operationSchema, /complete operation validation/)
  assert.deepEqual(report.capabilities.patchOperations, ['set-shape'])
})

test('capability probe keeps the unprojected lookup for older xdoc schemas', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-probe-legacy-schema-'))
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] === 'schema') {
  process.stdout.write(JSON.stringify({
    version: '8.8.8 (fake)',
    schemaVersion: 'cli-agent/v1',
    commands: {
      pptx: {
        subcommands: {},
        schemaDisclosure: {
          modes: [{ flag: '--mode ops --ops a,b,c' }, { flag: '--minimal' }]
        },
        patchSchema: {},
        catalogs: {}
      }
    }
  }))
  process.exit(0)
}
if (args.at(-1) === '--help') process.exit(0)
process.exit(2)
`,
  )
  const result = runNode([
    skillPath('scripts/pptx-nova-probe.mjs'),
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.capabilities.schemaSlicing.fieldsAvailable, false)
  assert.equal(report.capabilities.schemaSlicing.defsAvailable, false)
  assert.deepEqual(report.capabilities.schemaSlicing.defsModes, [])
  assert.equal(
    report.disclosure.targetedLookup.operationSchema,
    'xdoc schema --mode ops --ops <name> --minimal',
  )
})

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
  assert.equal(report.summary.slideNumberBase, 1)
  assert.deepEqual(report.summary.affectedSlideIndexes, [0])
  assert.deepEqual(report.summary.affectedSlideNumbers, [1])
  assert.deepEqual(report.summary.affectedPreviewFiles, ['slide-001.png'])
  assert.deepEqual(report.summary.actionableSlideIndexes, [0])
  assert.deepEqual(report.summary.actionableSlideNumbers, [1])
  assert.deepEqual(report.summary.actionablePreviewFiles, ['slide-001.png'])
  assert.deepEqual(
    report.summary.topActionable.map(({ code, count }) => ({ code, count })),
    [
      { code: 'empty-placeholder', count: 1 },
      { code: 'font-size-too-small', count: 1 },
    ],
  )
  assert.deepEqual(report.summary.topActionable[0].slideIndexes, [0])
  assert.deepEqual(report.summary.topActionable[0].slideNumbers, [1])
  assert.deepEqual(report.summary.topActionable[0].previewFiles, ['slide-001.png'])
  assert.equal(
    report.risks.every((risk) => risk.slideIndex === 0),
    true,
  )
  assert.equal(
    report.risks.every((risk) => risk.slideNumber === 1),
    true,
  )
  assert.equal(
    report.risks.every((risk) => risk.previewFile === 'slide-001.png'),
    true,
  )
  const actionable = report.risks.filter((risk) => risk.classification === 'actionable')
  const informational = report.risks.filter((risk) => risk.classification === 'informational')
  assert.equal(
    actionable.every(
      (risk) =>
        risk.reviewIdentity?.schemaVersion === 'pptx-nova-review-finding/v1' &&
        risk.reviewIdentity?.algorithm === 'sha256' &&
        /^[0-9a-f]{64}$/.test(risk.reviewIdentity?.sha256 ?? ''),
    ),
    true,
  )
  assert.equal(
    informational.every((risk) => risk.reviewIdentity === undefined),
    true,
  )
  assert.notEqual(actionable[0].reviewIdentity.sha256, actionable[1].reviewIdentity.sha256)
  assert.equal(readFileSync(outputPath, 'utf8'), `${JSON.stringify(report, null, 2)}\n`)
})

test('evidence writers require explicit overwrite for current-run artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-evidence-overwrite-'))

  const patchPath = join(root, 'patch.json')
  const semanticOutput = join(root, 'semantic-audit.json')
  writeJson(patchPath, { schemaVersion: 'pptx-patch/v1', ops: [] })
  const semanticArgs = [
    skillPath('scripts/pptx-nova-semantic-audit.mjs'),
    '--patch',
    patchPath,
    '--output',
    semanticOutput,
    '--json',
  ]
  runNode(semanticArgs)
  const semanticIdentity = fileIdentity(semanticOutput)
  const semanticRefusal = runNodeStatus(semanticArgs, 1)
  assert.match(semanticRefusal.stderr, /semantic audit output already exists/)
  assert.deepEqual(fileIdentity(semanticOutput), semanticIdentity)
  runNode([...semanticArgs, '--overwrite'])

  const structureOutput = join(root, 'structure-check.json')
  const structureArgs = [
    skillPath('scripts/pptx-nova-structure-check.mjs'),
    '--pptx',
    skillPath('assets/examples/cartesian/deck.pptx'),
    '--output',
    structureOutput,
    '--json',
  ]
  runNode(structureArgs)
  const structureIdentity = fileIdentity(structureOutput)
  const structureRefusal = runNodeStatus(structureArgs, 1)
  assert.match(structureRefusal.stderr, /structure check output already exists/)
  assert.deepEqual(fileIdentity(structureOutput), structureIdentity)
  runNode([...structureArgs, '--overwrite'])

  const inspectPath = join(root, 'layout-inspect.json')
  const layoutOutput = join(root, 'standalone-layout.json')
  writeJson(inspectPath, {
    schemaVersion: 'pptx-inspect/v1',
    presentation: { slideCount: 1, size: { width: '13.333in', height: '7.5in' } },
    slides: [{ index: 0, shapes: [] }],
  })
  const layoutArgs = [
    skillPath('scripts/pptx-nova-layout-snapshot.mjs'),
    '--inspect',
    inspectPath,
    '--output',
    layoutOutput,
    '--json',
  ]
  runNode(layoutArgs)
  const layoutIdentity = fileIdentity(layoutOutput)
  const layoutRefusal = runNodeStatus(layoutArgs, 1)
  assert.match(layoutRefusal.stdout, /layout snapshot output already exists/)
  assert.deepEqual(fileIdentity(layoutOutput), layoutIdentity)
  runNode([...layoutArgs, '--overwrite'])

  const finalizerRoot = join(root, 'finalizer')
  mkdirSync(finalizerRoot, { recursive: true })
  const { inspectPath: finalInspect, visionPath } = writeFinalizeSemanticFixtures(
    finalizerRoot,
    true,
  )
  const finalizerArgs = [
    skillPath('scripts/pptx-nova-finalize-evidence.mjs'),
    '--mode',
    'studio-create',
    '--run-dir',
    finalizerRoot,
    '--final-inspect',
    finalInspect,
    '--vision',
    visionPath,
    '--json',
  ]
  runNode(finalizerArgs)
  const finalLayout = join(finalizerRoot, 'layout-final.json')
  const finalSummary = join(finalizerRoot, 'evidence-summary.json')
  const finalLayoutIdentity = fileIdentity(finalLayout)
  const finalSummaryIdentity = fileIdentity(finalSummary)
  const finalizerRefusal = runNodeStatus(finalizerArgs, 1)
  assert.match(finalizerRefusal.stderr, /current-run outputs already exist/)
  assert.deepEqual(fileIdentity(finalLayout), finalLayoutIdentity)
  assert.deepEqual(fileIdentity(finalSummary), finalSummaryIdentity)
  runNode([...finalizerArgs, '--overwrite'])
})

test('finalize evidence requires a passing semantic vision gate for new decks', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-finalize-semantic-create-'))
  const { inspectPath, visionPath } = writeFinalizeSemanticFixtures(root, true)
  const result = runNode([
    skillPath('scripts/pptx-nova-finalize-evidence.mjs'),
    '--mode',
    'studio-create',
    '--run-dir',
    root,
    '--final-inspect',
    inspectPath,
    '--vision',
    visionPath,
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'pass')
  assert.equal(report.summary.semanticValidation.valid, true)
  assert.equal(report.summary.semanticValidation.passed, true)
  assert.equal(report.agentSummary.gates.vision.semanticPassed, true)
  assert.equal(report.agentSummary.gates.vision.semanticSourceRules, 82)
})

test('finalize evidence blocks new decks with full-package semantic issues', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-finalize-semantic-block-'))
  const { inspectPath, visionPath } = writeFinalizeSemanticFixtures(root, false)
  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-finalize-evidence.mjs'),
      '--mode',
      'studio-create',
      '--run-dir',
      root,
      '--final-inspect',
      inspectPath,
      '--vision',
      visionPath,
      '--json',
    ],
    1,
  )
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'fail')
  assert.equal(report.agentSummary.decision, 'stop-and-fix')
  assert.equal(report.agentSummary.gates.vision.semanticPassed, false)
  assert.ok(report.errors.some((item) => item.code === 'vision-semantic-create-blocker'))
})

test('finalize evidence rejects non-numeric semantic summary counts', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-finalize-semantic-types-'))
  const { inspectPath, visionPath } = writeFinalizeSemanticFixtures(root, true)
  const vision = JSON.parse(readFileSync(visionPath, 'utf8'))
  vision.semanticSummary.issueCount = null
  writeJson(visionPath, vision)
  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-finalize-evidence.mjs'),
      '--mode',
      'studio-create',
      '--run-dir',
      root,
      '--final-inspect',
      inspectPath,
      '--vision',
      visionPath,
      '--json',
    ],
    1,
  )
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'fail')
  assert.equal(report.summary.semanticValidation.valid, false)
  assert.ok(report.errors.some((item) => item.code === 'vision-semantic-evidence-invalid'))
})

test('finalize evidence rejects incomplete V2 rule coverage', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-finalize-semantic-coverage-'))
  const { inspectPath, visionPath } = writeFinalizeSemanticFixtures(root, true)
  const vision = JSON.parse(readFileSync(visionPath, 'utf8'))
  vision.semanticSummary.sourceRuleCount = 1
  vision.semanticSummary.normalizedRuleCount = 1
  writeJson(visionPath, vision)
  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-finalize-evidence.mjs'),
      '--mode',
      'studio-create',
      '--run-dir',
      root,
      '--final-inspect',
      inspectPath,
      '--vision',
      visionPath,
      '--json',
    ],
    1,
  )
  const report = JSON.parse(result.stdout)

  assert.equal(report.summary.semanticValidation.valid, false)
  assert.ok(report.errors.some((item) => item.code === 'vision-semantic-evidence-invalid'))
})

test('finalize evidence rejects malformed residual semantic issue items', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-finalize-semantic-items-'))
  const { inspectPath, visionPath } = writeFinalizeSemanticFixtures(root, false)
  const vision = JSON.parse(readFileSync(visionPath, 'utf8'))
  vision.semanticIssues = [null]
  writeJson(visionPath, vision)
  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-finalize-evidence.mjs'),
      '--mode',
      'structural-edit',
      '--run-dir',
      root,
      '--final-inspect',
      inspectPath,
      '--vision',
      visionPath,
      '--json',
    ],
    1,
  )
  const report = JSON.parse(result.stdout)

  assert.equal(report.summary.semanticValidation.valid, false)
  assert.ok(report.errors.some((item) => item.code === 'vision-semantic-evidence-invalid'))
})

test('finalize evidence discloses inherited full-deck semantic issues on edits', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-finalize-semantic-edit-'))
  const { inspectPath, visionPath } = writeFinalizeSemanticFixtures(root, false)
  const result = runNode([
    skillPath('scripts/pptx-nova-finalize-evidence.mjs'),
    '--mode',
    'structural-edit',
    '--run-dir',
    root,
    '--final-inspect',
    inspectPath,
    '--vision',
    visionPath,
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'warn')
  assert.equal(report.agentSummary.decision, 'continue-with-disclosed-risk')
  assert.equal(report.agentSummary.gates.vision.semanticPassed, false)
  assert.ok(report.warnings.some((item) => item.code === 'vision-semantic-residual-risk'))
})

test('layout snapshot keeps explicit slide references beyond summary truncation', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-layout-slide-references-'))
  const inspectPath = join(root, 'inspect.json')
  writeJson(inspectPath, {
    schemaVersion: 'pptx-inspect/v1',
    presentation: { slideCount: 10, size: { width: '10in', height: '5.625in' } },
    slides: Array.from({ length: 10 }, (_, index) => ({
      index,
      shapes: [
        {
          id: `empty-placeholder-${index}`,
          shapeType: 'rect',
          placeholder: { type: 'body' },
          bbox: { x: 10, y: 10, width: 100, height: 40 },
        },
      ],
    })),
  })

  const result = runNode([
    skillPath('scripts/pptx-nova-layout-snapshot.mjs'),
    '--inspect',
    inspectPath,
    '--json',
  ])
  const report = JSON.parse(result.stdout)
  const placeholderRisks = report.risks.filter((risk) => risk.code === 'empty-placeholder')

  assert.equal(report.summary.affectedSlidesTruncated, true)
  assert.equal(report.summary.topActionable[0].slidesTruncated, true)
  assert.equal(report.summary.topActionable[0].slideNumbers.length, 8)
  assert.equal(placeholderRisks.length, 10)
  assert.deepEqual(
    placeholderRisks.map((risk) => [risk.slideIndex, risk.slideNumber, risk.previewFile]),
    Array.from({ length: 10 }, (_, index) => [
      index,
      index + 1,
      `slide-${String(index + 1).padStart(3, '0')}.png`,
    ]),
  )
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

test('layout snapshot accepts axis-aligned connectors but rejects zero-length geometry', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-layout-connectors-'))
  const inspectPath = join(root, 'inspect.json')
  writeJson(inspectPath, {
    schemaVersion: 'pptx-inspect/v1',
    presentation: { slideCount: 1, size: { width: '10in', height: '5.625in' } },
    slides: [
      {
        index: 0,
        shapes: [
          {
            id: 'horizontal-connector',
            shapeType: 'connector',
            bbox: { x: 10, y: 10, width: 100, height: 0 },
          },
          {
            id: 'vertical-connector',
            shapeType: 'connector',
            bbox: { x: 10, y: 20, width: 0, height: 100 },
          },
          {
            id: 'zero-length-connector',
            shapeType: 'connector',
            bbox: { x: 10, y: 30, width: 0, height: 0 },
          },
          {
            id: 'zero-width-shape',
            shapeType: 'rect',
            bbox: { x: 10, y: 40, width: 0, height: 100 },
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
  const bboxRisks = report.risks.filter((risk) => risk.code === 'bbox-invalid')

  assert.equal(report.status, 'warn')
  assert.equal(bboxRisks.length, 2)
  assert.deepEqual(
    bboxRisks.map((risk) => risk.objectId),
    ['zero-length-connector', 'zero-width-shape'],
  )
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

test('feedback gate validates create process scorecard and prints it in text mode', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-feedback-create-scorecard-'))
  const runDir = join(root, 'run')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(
    join(runDir, 'skill-feedback.md'),
    `# pptx-nova SKILL 使用反馈

## 总体评价

创建流程完成，以下评分来自当前 run 的验证证据。

## 执行过程评分

| 维度 | 分数 | 评价 |
| --- | ---: | --- |
| 需求与内容准确性（20%） | 8 / 10 | 大纲和最终内容一致，假设已披露。 |
| 最终文件可靠性（18%） | 9 / 10 | 最终文件可打开并绑定到候选文件。 |
| 验证闭环（17%） | 8 / 10 | 核心 gate 完整，低风险检查已复核。 |
| 视觉设计质量（15%） | 7 / 10 | 层级清楚，但部分页面节奏仍可加强。 |
| DeckKit 与 op 使用正确性（12%） | 9 / 10 | DeckKit slot 和 op 均按合同执行。 |
| 异常恢复与状态管理（10%） | 8 / 10 | 候选状态清晰，失败后可安全续跑。 |
| 流程效率（8%） | 7 / 10 | 有一次重复预览，其他步骤较精简。 |

加权综合评分：8.1 / 10
`,
  )

  const result = runNode([
    skillPath('scripts/pptx-nova-feedback-gate.mjs'),
    '--run-dir',
    runDir,
    '--prompt',
    'Create a new presentation and give feedback on the workflow.',
    '--workflow',
    'create',
    '--strict',
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'pass')
  assert.equal(report.workflow.id, 'create')
  assert.equal(report.processScorecard.status, 'pass')
  assert.equal(report.processScorecard.rows.length, 7)
  assert.equal(report.processScorecard.reportedWeightedScore, 8.1)
  assert.equal(report.processScorecard.computedWeightedScore, 8.1)

  const textResult = runNode([
    skillPath('scripts/pptx-nova-feedback-gate.mjs'),
    '--run-dir',
    runDir,
    '--prompt',
    'Create a new presentation and give feedback on the workflow.',
    '--workflow',
    'create',
    '--strict',
    '--overwrite',
  ])
  assert.match(textResult.stdout, /\| 需求与内容准确性（20%） \| 8 \/ 10 \|/)
  assert.match(textResult.stdout, /加权综合评分：8\.1 \/ 10/)
})

test('feedback gate rejects refurbish feedback without the required scorecard', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-feedback-refurbish-scorecard-'))
  const runDir = join(root, 'run')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(
    join(runDir, 'skill-feedback.md'),
    '# pptx-nova SKILL 使用反馈\n\n## 总体评价\n\n翻新流程反馈已完成。\n',
  )

  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-feedback-gate.mjs'),
      '--run-dir',
      runDir,
      '--prompt',
      'Refurbish this deck and give feedback.',
      '--workflow',
      'refurbish',
      '--strict',
      '--json',
    ],
    2,
  )
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'fail')
  assert.equal(report.processScorecard.required, true)
  assert.equal(report.processScorecard.passed, false)
  assert.match(report.processScorecard.errors.join('\n'), /missing section/)
  assert.match(report.agentSummary.message, /seven-dimension process scorecard/)
})

test('feedback gate accepts the exact refurbish dimensions and weights', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-feedback-refurbish-valid-'))
  const runDir = join(root, 'run')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(
    join(runDir, 'skill-feedback.md'),
    `# pptx-nova SKILL 使用反馈

## 执行过程评分

| 维度 | 分数 | 评价 |
| --- | ---: | --- |
| 内容保真（20%） | 8 / 10 | 页数、文本和对象语义均已对账。 |
| 最终文件可靠性（18%） | 8 / 10 | 最终文件通过打开检查并完成哈希绑定。 |
| 验证闭环（17%） | 8 / 10 | 保真、视觉和发布 gate 均已闭环。 |
| 视觉翻新质量（15%） | 8 / 10 | 目标 DeckKit 风格在全 deck 中清晰可见。 |
| op 使用正确性（12%） | 8 / 10 | selector 和 op 结果均有 dry-run 与 inspect 证据。 |
| 异常恢复与状态管理（10%） | 8 / 10 | 当前候选和历史证据边界清晰。 |
| 流程效率（8%） | 8 / 10 | 没有不必要的候选分叉或重复全量渲染。 |

加权综合评分：8.0 / 10
`,
  )

  const result = runNode([
    skillPath('scripts/pptx-nova-feedback-gate.mjs'),
    '--run-dir',
    runDir,
    '--prompt',
    'Refurbish the existing deck and give feedback.',
    '--workflow',
    'refurbish',
    '--strict',
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'pass')
  assert.deepEqual(
    report.processScorecard.rows.map((row) => row.dimension),
    [
      '内容保真',
      '最终文件可靠性',
      '验证闭环',
      '视觉翻新质量',
      'op 使用正确性',
      '异常恢复与状态管理',
      '流程效率',
    ],
  )
  assert.equal(report.processScorecard.computedWeightedScore, 8)
})

test('feedback gate rejects translation scorecard with an incorrect weighted score', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-feedback-translation-scorecard-'))
  const runDir = join(root, 'run')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(
    join(runDir, 'skill-feedback.md'),
    `# pptx-nova SKILL 使用反馈

## 执行过程评分

| 维度 | 分数 | 评价 |
| --- | ---: | --- |
| 翻译完整性与准确性（20%） | 8 / 10 | 所有可见文本均已分类处理。 |
| 布局与格式保真（18%） | 8 / 10 | 布局和富文本样式保持稳定。 |
| 最终文件可靠性（17%） | 8 / 10 | 文件结构有效且可编辑。 |
| 验证闭环（15%） | 8 / 10 | 翻译和视觉 gate 均已执行。 |
| 文本替换与布局修复 op 正确性（12%） | 8 / 10 | 替换目标和修复范围准确。 |
| 异常恢复与状态管理（10%） | 8 / 10 | unit id 和候选状态稳定。 |
| 流程效率（8%） | 8 / 10 | 扫描和渲染结果得到复用。 |

加权综合评分：9.0 / 10
`,
  )

  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-feedback-gate.mjs'),
      '--run-dir',
      runDir,
      '--prompt',
      'Translate this presentation and provide feedback.',
      '--workflow',
      'translation',
      '--strict',
      '--json',
    ],
    2,
  )
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'fail')
  assert.equal(report.processScorecard.computedWeightedScore, 8)
  assert.match(report.processScorecard.errors.join('\n'), /weighted overall score mismatch/)
})

function markdownShellCommands(markdown) {
  const commands = []
  for (const block of markdown.matchAll(/```bash\n([\s\S]*?)```/g)) {
    let current = []
    for (const line of block[1].split('\n')) {
      if (!line.trim()) {
        if (current.length > 0) commands.push(current.join('\n'))
        current = []
        continue
      }
      const continuesPrevious = current.at(-1)?.trimEnd().endsWith('\\')
      if (current.length > 0 && !continuesPrevious && !/^\s/.test(line)) {
        commands.push(current.join('\n'))
        current = []
      }
      current.push(line)
    }
    if (current.length > 0) commands.push(current.join('\n'))
  }
  return commands
}

test('published translation compare reference enables multipart output for long decks', () => {
  const documents = [
    {
      name: 'translation-mode.md',
      text: readFileSync(skillPath('references/translation-mode.md'), 'utf8'),
    },
  ]

  for (const document of documents) {
    const command = markdownShellCommands(document.text).find(
      (candidate) =>
        candidate.includes('pptx-nova-compare.mjs') && candidate.includes('--kind translation'),
    )
    assert.ok(command, `${document.name} must publish a translation compare command`)
    assert.match(command, /--slide-count <count>/, document.name)
    assert.match(command, /--compare-chunk-size 20/, document.name)
    assert.match(command, /--fallback-dpi 144/, document.name)
  }

  const translationMode = documents[0].text
  assert.doesNotMatch(translationMode, /must be a single PNG/)
  assert.doesNotMatch(translationMode, /one image\s+contains every slide/)
  assert.match(translationMode, /numbered .*translation-compare/i)
  assert.match(translationMode, /<output-stem>-translation-compare-<MMDDhhmmss>-01\.png/)
  assert.match(
    translationMode,
    /`translation-compare\.png` or numbered `translation-compare-\*\.png` parts/,
  )
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
              body: 'Inspect layouts\nReview changes',
              examples: 'Open PPTX\nRender slide\nCheck notes',
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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

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
    print({ schemaVersion: 'pptx-dry-run/v1', status: 'success', warnings: [], changedParts: [], opResults: [], visualRisks: [], semanticIssues: [], wouldWrite: true, output })
  } else {
    writeFileSync(output, 'candidate pptx')
    print({ schemaVersion: 'pptx-apply/v1', status: 'success', warnings: [], changedParts: ['ppt/presentation.xml'], opResults: [], visualRisks: [], semanticIssues: [], output })
  }
} else if (args[0] === 'pptx' && args[1] === 'inspect') {
  // Runner orchestration fixture only; real native readback has separate integration evidence.
  const patch = JSON.parse(readFileSync(join(dirname(args[2]), 'patch.json'), 'utf8'))
  const slides = patch.ops.filter(op => op.op === 'add-slide').map((_, index) => ({ index, shapes: [] }))
  for (const op of patch.ops.filter(op => ['add-text-box', 'add-shape', 'add-image'].includes(op.op))) {
    const frame = patch.ops.filter(p => p.op === 'set-text-frame' && p.slide === op.slide && p.shape?.name === op.name).at(-1)
    const text = patch.ops.filter(p => p.op === 'set-text-frame' && p.slide === op.slide && p.shape?.name === op.name && typeof p.text === 'string').at(-1)?.text ?? ''
    const crop = patch.ops.filter(p => p.op === 'set-image' && p.slide === op.slide && p.shape?.name === op.name).at(-1)?.crop ?? {}
    slides[op.slide].shapes.push({ name: op.name, shapeType: op.op === 'add-image' ? 'picture' : 'shape',
      bbox: Object.fromEntries(['x','y','w','h'].map(k => [k+'Emu', Math.round(parseFloat(op[k])*914400)])),
      fontFacts: text.split('\\n').map((text, paragraph) => ({ scope: 'textRun', paragraph, text })),
      textFrame: frame?.frame ?? {}, image: { crop: { left: 0, right: 0, top: 0, bottom: 0, ...crop } } })
  }
  print({ schemaVersion: 'pptx-inspect/v1', slides })
} else if (args[0] === 'pptx' && args[1] === 'vision-check') {
  print({ schemaVersion: 'pptx-vision/v1', status: 'pass', summary: { issueCount: 0, bySeverity: { high: 0, medium: 0, low: 0 } }, issues: [], semanticSummary: { passed: true, issueCount: 0, sourceRuleCount: 82, normalizedRuleCount: 81 }, semanticIssues: [] })
} else if (args[0] === 'pptx' && args[1] === 'preview') {
  const outputDir = valueAfter('--output-dir')
  const contactSheet = valueAfter('--contact-output')
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
  assert.equal(patch.schemaVersion, 'pptx-patch/v1')
  assert.equal(quality.schemaVersion, 'pptx-nova-quality/v1')
})

test('DeckKit quality resolves the topmost containing panel without hiding real contrast failures', async () => {
  const { assessDeckQuality } = await import(skillUrl('assets/deckkits/core-primitives.kit.mjs'))
  const patch = {
    schemaVersion: 'pptx-patch/v1',
    ops: [
      { op: 'add-slide' },
      {
        op: 'set-slide-background',
        slide: 0,
        fill: { type: 'solid', color: '111111' },
      },
      {
        op: 'add-shape',
        slide: 0,
        kind: 'rectangle',
        name: 'S0_BackPanel',
        x: '1in',
        y: '1in',
        w: '4in',
        h: '3in',
      },
      {
        op: 'set-shape',
        slide: 0,
        shape: { name: 'S0_BackPanel' },
        fill: { type: 'solid', color: '333333' },
      },
      {
        op: 'add-shape',
        slide: 0,
        kind: 'rectangle',
        name: 'S0_FrontPanel',
        x: '1.25in',
        y: '1.25in',
        w: '3.5in',
        h: '2.5in',
      },
      {
        op: 'set-shape',
        slide: 0,
        shape: { name: 'S0_FrontPanel' },
        fill: { type: 'solid', color: 'FFFFFF' },
      },
      {
        op: 'add-text-box',
        slide: 0,
        name: 'S0_PanelText',
        x: '1.5in',
        y: '1.5in',
        w: '3in',
        h: '1in',
      },
      {
        op: 'set-text-frame',
        slide: 0,
        shape: { name: 'S0_PanelText' },
        text: 'Readable on the front panel',
      },
      {
        op: 'set-run',
        slide: 0,
        shape: { name: 'S0_PanelText' },
        font: { size: '18pt', color: '111111' },
      },
      {
        op: 'add-text-box',
        slide: 0,
        name: 'S0_RealFailure',
        x: '6in',
        y: '1in',
        w: '2in',
        h: '1in',
      },
      {
        op: 'set-text-frame',
        slide: 0,
        shape: { name: 'S0_RealFailure' },
        text: 'Still unreadable',
      },
      {
        op: 'set-run',
        slide: 0,
        shape: { name: 'S0_RealFailure' },
        font: { size: '18pt', color: '111111' },
      },
    ],
  }

  const quality = assessDeckQuality({ patch })
  const contrastIssues = quality.issues.filter((issue) => issue.kind === 'low-contrast-text')

  assert.deepEqual(
    contrastIssues.map((issue) => issue.shapeName),
    ['S0_RealFailure'],
  )
  assert.equal(contrastIssues[0].metrics.backgroundColor, '111111')
})

test('official broadside example has no blocking build-quality issues', async () => {
  const { assessDeckQuality } = await import(skillUrl('assets/deckkits/core-primitives.kit.mjs'))
  const { createDeck } = await import(skillUrl('assets/deckkits/broadside.kit.mjs'))
  const content = JSON.parse(
    readFileSync(skillPath('assets/deckkits/examples/broadside-content.json'), 'utf8'),
  )
  const { patch } = createDeck(content)
  const quality = assessDeckQuality({ patch, deckkit: 'broadside' })

  assert.equal(quality.issues.filter((issue) => issue.severity === 'error').length, 0)
  assert.notEqual(quality.status, 'error')
})

test('broadside bar chart uses explicit accents without an implicit trailing accent', async () => {
  const { createDeck } = await import(skillUrl('assets/deckkits/broadside.kit.mjs'))
  const buildBarColors = (bars) => {
    const { patch } = createDeck({
      slides: [
        {
          type: 'broadsideBarChartSlide',
          data: {
            title: 'Comparison',
            bars,
            unit: 'score',
            source: 'Synthetic test data',
            seriesName: 'Score',
          },
        },
      ],
    })
    return patch.ops
      .find((op) => op.op === 'set-chart')
      .series[0].points.map((point) => point.fill.color)
  }
  const bars = [
    { label: 'Product', value: 9.8, accent: true },
    { label: 'Peer A', value: 7.3 },
    { label: 'Peer B', value: 6.5 },
  ]

  assert.deepEqual(buildBarColors(bars), ['E85D26', '707068', '707068'])
  assert.deepEqual(buildBarColors(bars.map(({ accent: _accent, ...bar }) => bar)), [
    '707068',
    '707068',
    '707068',
  ])
})

test('broadside cover blocks text that exceeds every registered composition in delivery mode', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-nova-broadside-cover-budget-'))
  const contentPath = join(dir, 'content.json')
  const content = JSON.parse(
    readFileSync(skillPath('assets/deckkits/examples/broadside-content.json'), 'utf8'),
  )
  const cover = content.slides.find((slide) => slide.type === 'broadsideCoverSlide')
  cover.data.title = '重写演示文稿全链路基础设施能力版图'.repeat(3)
  writeJson(contentPath, content)

  const result = runNodeStatus(
    [
      skillPath('assets/deckkits/validate-content.mjs'),
      contentPath,
      '--deckkit',
      'broadside',
      '--mode',
      'delivery',
      '--json',
    ],
    1,
  )
  const validation = JSON.parse(result.stdout)

  assert.equal(validation.valid, false)
  assert.ok(
    validation.errors.some(
      (error) => error.type === 'design' && /slides\[0\].data.title/.test(error.message),
    ),
  )
})

test('manual DeckKit retry commands overwrite only the current-run candidate', () => {
  const deckkitMode = readFileSync(skillPath('references/deckkit-mode.md'), 'utf8')
  const skill = readFileSync(skillPath('SKILL.md'), 'utf8')

  assert.match(
    deckkitMode,
    /xdoc pptx apply -p patch\.json(?: -i input\.pptx)? -o <run-dir>\/candidate\.pptx --overwrite --dry-run --json/,
  )
  assert.match(
    deckkitMode,
    /xdoc pptx apply -p patch\.json(?: -i input\.pptx)? -o <run-dir>\/candidate\.pptx --overwrite --json/,
  )
  assert.doesNotMatch(skill, /xdoc pptx apply -p patch\.json .*<run-dir>\/candidate\.pptx/)
  assert.match(deckkitMode, /stop immediately and do not run vision-check on a stale candidate/i)
})

test('chart preview and Content_Types audit guidance stay current', () => {
  const charts = readFileSync(skillPath('references/charts.md'), 'utf8')
  const troubleshooting = readFileSync(skillPath('references/troubleshooting.md'), 'utf8')

  assert.match(charts, /当前预览支持/)
  assert.match(charts, /xdoc ≥0\.3\.1/)
  for (const feature of [
    'trendline',
    'errorBars',
    'dataTable',
    'displayUnits',
    '轴标题',
    'minorGridlines',
  ]) {
    assert.ok(charts.includes(feature))
  }
  assert.doesNotMatch(charts, /PNG\/PDF 预览链暂不渲染/)
  assert.doesNotMatch(charts, /预览链暂不渲染数据表/)
  assert.ok(troubleshooting.includes("'[[]Content_Types].xml'"))
  assert.match(troubleshooting, /set -o pipefail/)
  assert.match(troubleshooting, /unzip -p out\.pptx/)
  assert.match(troubleshooting, /xmllint --noout -/)
})

test('DeckKit diversity diagnostics disclose current, missing, and available groups', async () => {
  const { validateContent } = await import(skillUrl('assets/deckkits/core-primitives.kit.mjs'))
  const content = {
    meta: { deckkit: 'cartesian' },
    slides: Array.from({ length: 7 }, () => ({
      type: 'cartesianCardsSlide',
      data: {
        label: 'Structure',
        title: 'Repeated structure',
        cards: [
          { title: 'A', body: 'One' },
          { title: 'B', body: 'Two' },
          { title: 'C', body: 'Three' },
        ],
      },
    })),
  }
  const validation = validateContent(content, { deckkit: 'cartesian', mode: 'delivery' })
  const diagnostic = validation.fitDiagnostics.find(
    (item) => item.code === 'diversity.uniqueGroups.tooLow',
  )

  assert.equal(validation.valid, false)
  assert.deepEqual(diagnostic.usedGroups, ['structure'])
  assert.deepEqual(diagnostic.missingGroups, ['anchor', 'statement', 'evidence'])
  assert.deepEqual(diagnostic.groupMembers.statement, ['cartesianStatementSlide'])
  assert.deepEqual(diagnostic.groupMembers.evidence, [
    'cartesianBarChartSlide',
    'cartesianImageStatsSlide',
    'cartesianLineChartSlide',
    'cartesianExhibitSlide',
    'cartesianAnalyticalSlide',
    'cartesianComparisonSlide',
    'cartesianSceneSlide',
    'cartesianFormulaSlide',
  ])
  assert.equal(diagnostic.slideGroups.length, 7)
  assert.deepEqual(diagnostic.slideGroups[0], {
    index: 0,
    slideType: 'cartesianCardsSlide',
    group: 'structure',
  })
  assert.match(diagnostic.message, /used groups: structure/)
  assert.match(diagnostic.message, /missing groups: anchor, statement, evidence/)
  assert.match(diagnostic.message, /statement=\[cartesianStatementSlide\]/)
})

test('placeholder-only DeckKit asset slots reject image injection in delivery mode', async () => {
  const { validateContent } = await import(skillUrl('assets/deckkits/core-primitives.kit.mjs'))
  const content = JSON.parse(
    readFileSync(skillPath('assets/deckkits/examples/broadside-content.json'), 'utf8'),
  )
  const imageSlide = content.slides.find((slide) => slide.type === 'broadsideSplitSlide')
  imageSlide.imageSlots = { 'image.split': 'product_screenshot' }

  const validation = validateContent(content, { deckkit: 'broadside', mode: 'delivery' })
  const diagnostic = validation.fitDiagnostics.find(
    (item) => item.code === 'layout.assetSlot.unsupported',
  )

  assert.equal(validation.valid, false)
  assert.equal(diagnostic.path, 'slides[3].imageSlots.image.split')
  assert.equal(diagnostic.value, 'product_screenshot')
  assert.equal(diagnostic.assetSlot.id, 'image.split')
  assert.equal(diagnostic.assetSlot.acceptsAsset, false)
  assert.equal(diagnostic.assetSlot.placeholderBehavior, 'solid image shell')
  assert.match(diagnostic.message, /placeholder-only/)
  assert.match(diagnostic.message, /does not accept asset "product_screenshot"/)
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
      ?.rows.some((row) => row.path === 'data.cards' && row.budget.includes('items 1-3')),
  )
  assert.ok(
    reference.slideTypes
      .find((slideType) => slideType.slideType === 'swissTableSlide')
      ?.rows.some((row) => row.path === 'data.rows' && row.budget.includes('items 1-11')),
  )
  assert.ok(
    reference.slideTypes
      .find((slideType) => slideType.slideType === 'swissCoverSlide')
      ?.rows.some(
        (row) =>
          row.path === 'data.tag' &&
          row.budget.includes('11pt @ 11.81in x 0.67in') &&
          row.budget.includes('2 line(s)'),
      ),
  )
})

test('DeckKit slot reference discloses injectable and placeholder-only asset behavior', () => {
  const jsonResult = runNode([
    skillPath('scripts/pptx-nova-deckkit-slots.mjs'),
    '--deckkit',
    'cartesian',
    '--format',
    'json',
  ])
  const reference = JSON.parse(jsonResult.stdout)
  const imageStats = reference.slideTypes.find(
    (slide) => slide.slideType === 'cartesianImageStatsSlide',
  )

  assert.deepEqual(imageStats.assetSlots, [
    {
      id: 'image.editorial',
      kind: 'image',
      acceptsAsset: true,
      fitPolicy: 'contain',
      placeholderBehavior: 'crossed image shell fallback',
      labelSlot: 'data.imageLabel',
      note: 'Bind a registered local image through content.json imageSlots and assets_manifest.json. The image is contained inside the editorial frame; omitting the binding preserves the editable crossed placeholder shell.',
    },
  ])

  const markdownResult = runNode([
    skillPath('scripts/pptx-nova-deckkit-slots.mjs'),
    '--deckkit',
    'cartesian',
  ])
  assert.match(
    markdownResult.stdout,
    /## cartesianImageStatsSlide[\s\S]*### Asset slots[\s\S]*`image\.editorial`[\s\S]*\| yes \| crossed image shell fallback \|/,
  )

  const broadsideResult = runNode([
    skillPath('scripts/pptx-nova-deckkit-slots.mjs'),
    '--deckkit',
    'broadside',
    '--format',
    'json',
  ])
  const broadside = JSON.parse(broadsideResult.stdout)
  assert.equal(
    broadside.slideTypes.find((slide) => slide.slideType === 'broadsideSplitSlide').assetSlots[0]
      .acceptsAsset,
    false,
  )
})

function cartesianImageContent(imageSlots) {
  return {
    meta: { deckkit: 'cartesian' },
    slides: [
      {
        type: 'cartesianImageStatsSlide',
        ...(imageSlots ? { imageSlots } : {}),
        data: {
          imageLabel: 'Editorial Reference',
          label: 'Case Study',
          title: 'Structural overview',
          paragraphs: ['A concise description of the visual evidence and its strategic role.'],
          stats: [
            { value: '47%', label: 'Efficiency gain' },
            { value: '12x', label: 'Scale factor' },
          ],
        },
      },
    ],
  }
}

test('cartesian image stats keeps the crossed shell when no asset is bound', async () => {
  const { createDeck } = await import(skillUrl('assets/deckkits/cartesian.kit.mjs'))
  const result = createDeck(cartesianImageContent())
  const connectors = result.patch.ops.filter((op) => op.op === 'add-connector')
  const images = result.patch.ops.filter((op) => op.op === 'add-image')

  assert.equal(connectors.length, 2)
  assert.equal(images.length, 0)
})

test('core image crop builder emits the canonical set-image operation', async () => {
  const { createOps } = await import(skillUrl('assets/deckkits/core-primitives.kit.mjs'))
  const builder = createOps()
  builder.setImageCrop(2, 'Hero', { left: 0.08, right: 0.12, top: 0.03 })

  assert.deepEqual(builder.ops, [
    {
      op: 'set-image',
      slide: 2,
      shape: { name: 'Hero' },
      crop: { left: 0.08, right: 0.12, top: 0.03 },
    },
  ])
})

test('cartesian image stats injects a manifest-relative image with contain geometry', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-cartesian-assets-'))
  const assetsDir = join(root, 'assets')
  const contentPath = join(root, 'content.json')
  const manifestPath = join(root, 'assets_manifest.json')
  const patchPath = join(root, 'patch.json')
  const qualityPath = join(root, 'quality.json')
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

  runNode([
    skillPath('scripts/pptx-nova-build.mjs'),
    '--deckkit',
    'cartesian',
    '--assets',
    manifestPath,
    contentPath,
    '-o',
    patchPath,
    '--quality-json',
    qualityPath,
  ])
  const patch = JSON.parse(readFileSync(patchPath, 'utf8'))
  const image = patch.ops.find((op) => op.op === 'add-image')
  const crop = patch.ops.find((op) => op.op === 'set-image')
  const connectors = patch.ops.filter((op) => op.op === 'add-connector')

  assert.ok(image)
  assert.deepEqual(image.assetSource, {
    path: 'assets/editorial.svg',
    mimeType: 'image/svg+xml',
  })
  assert.deepEqual(
    { x: image.x, y: image.y, w: image.w, h: image.h },
    { x: '0.61in', y: '2.16375in', w: '5.64in', h: '3.1725in' },
  )
  assert.equal(crop, undefined)
  assert.equal(connectors.length, 0)
})

test('build and asset context preserve POSIX symlink parent traversal', async (t) => {
  if (process.platform === 'win32') return t.skip('POSIX filesystem contract')
  const root = mkdtempSync(join(tmpdir(), 'nova-build-path-'))
  const actual = join(root, 'real')
  mkdirSync(join(actual, 'child'), { recursive: true })
  symlinkSync(join(actual, 'child'), join(root, 'link'))
  writeFileSync(
    join(actual, 'image.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"/>',
  )
  const manifest = {
    schemaVersion: 'pptx-nova-assets-manifest/v1',
    entries: [{ id: 'picture', kind: 'image', path: 'image.svg', pptxUse: { ratio: '16:9' } }],
  }
  writeJson(join(actual, 'assets.json'), manifest)
  writeJson(join(actual, 'content.json'), cartesianImageContent({ 'image.editorial': 'picture' }))
  const parent = `${root}/link/..`
  runNode([
    skillPath('scripts/pptx-nova-build.mjs'),
    `${parent}/content.json`,
    '--assets',
    `${parent}/assets.json`,
    '-o',
    `${parent}/new/patch.json`,
  ])
  assert.equal(existsSync(join(root, 'new')), false)
  const patch = JSON.parse(readFileSync(join(actual, 'new', 'patch.json'), 'utf8'))
  assert.equal(patch.ops.find((op) => op.op === 'add-image').assetSource.path, 'image.svg')
  const { createAssetContext } = await import(skillUrl('scripts/lib/asset-manifest.mjs'))
  const asset = createAssetContext(manifest, `${parent}/assets.json`).get('picture')
  assert.deepEqual(readFileSync(asset.absolutePath), readFileSync(join(actual, 'image.svg')))
})

test('cartesian image stats gives a self-repairing error when assets are omitted', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-cartesian-assets-missing-'))
  const contentPath = join(root, 'content.json')
  const patchPath = join(root, 'patch.json')
  writeJson(contentPath, cartesianImageContent({ 'image.editorial': 'editorial_reference' }))

  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-build.mjs'),
      '--deckkit',
      'cartesian',
      contentPath,
      '-o',
      patchPath,
    ],
    1,
  )
  assert.match(
    result.stderr,
    /no assets manifest was provided; pass --assets assets_manifest\.json/,
  )
})

test('asset manifest ignores unrelated non-image entries and blocks paths outside assetRoot', async () => {
  const { createAssetContext } = await import(skillUrl('scripts/lib/asset-manifest.mjs'))
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-assets-manifest-'))
  const assetsDir = join(root, 'assets')
  const outsidePath = join(root, 'outside.svg')
  const manifestPath = join(root, 'assets_manifest.json')
  mkdirSync(assetsDir, { recursive: true })
  writeFileSync(join(assetsDir, 'editorial.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  writeFileSync(outsidePath, '<svg xmlns="http://www.w3.org/2000/svg"/>')
  const context = createAssetContext(
    {
      schemaVersion: 'pptx-nova-assets-manifest/v1',
      assetRoot: 'assets',
      entries: [
        { id: 'formula-1', kind: 'formula', status: 'rendered', path: 'formula.svg' },
        {
          id: 'editorial',
          kind: 'image',
          path: 'editorial.svg',
          pptxUse: { ratio: '16:9', fitPolicy: 'contain' },
        },
      ],
    },
    manifestPath,
  )
  assert.equal(
    context.resolveImageSlot({ imageSlots: { 'image.editorial': 'editorial' } }, 'image.editorial')
      .path,
    'assets/editorial.svg',
  )

  assert.throws(
    () =>
      createAssetContext(
        {
          schemaVersion: 'pptx-nova-assets-manifest/v1',
          assetRoot: 'assets',
          entries: [
            {
              id: 'escape',
              kind: 'image',
              path: '../outside.svg',
              pptxUse: { ratio: '16:9', fitPolicy: 'contain' },
            },
          ],
        },
        manifestPath,
      ).resolveImageSlot({ imageSlots: { 'image.editorial': 'escape' } }, 'image.editorial'),
    /outside the manifest assetRoot/,
  )
})

test('DeckKit slot reference and consistency cover mckinsey-blue 2.0 named cover slots', () => {
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

  for (const key of [
    'data.details[].label',
    'data.details[].value',
    'data.lossMetric.value2',
    'data.lossMetric.sub2',
    'data.lossMetric.note',
  ]) {
    assert.ok(rowByPath.get(key)?.budget.includes('pt @'), key)
    assert.ok(rowByPath.get(key)?.budget.includes('CJK'), key)
  }
  assert.equal(rowByPath.has('data.details[][0]'), false)

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
  const dir = mkdtempSync(join(tmpdir(), 'pptx-nova-catalog-evidence-'))
  const catalogPath = join(dir, 'catalog.json')
  const catalog = JSON.parse(readFileSync(skillPath('assets/deckkits/catalog.json'), 'utf8'))
  catalog.entries.find((entry) => entry.id === 'long-table').readiness = 'production'
  writeJson(catalogPath, catalog)
  const result = runNode([
    skillPath('scripts/pptx-nova-deckkit-readiness.mjs'),
    '--deckkit',
    'long-table',
    '--target',
    'delivery',
    '--explicit',
    '--catalog',
    catalogPath,
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
  entry.readiness = 'production'
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
  const catalogPath = join(outDir, 'catalog.json')
  const catalog = JSON.parse(readFileSync(skillPath('assets/deckkits/catalog.json'), 'utf8'))
  catalog.entries.find((entry) => entry.id === 'long-table').readiness = 'production'
  writeJson(catalogPath, catalog)
  const result = runNode([
    skillPath('scripts/pptx-nova-deckkit-readiness.mjs'),
    '--deckkit',
    'long-table',
    '--target',
    'delivery',
    '--explicit',
    '--out',
    outDir,
    '--catalog',
    catalogPath,
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
  entry.readiness = 'production'
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

test('clear-impact builds every minimum role and all registered layout variants without reference content', async () => {
  const { createDeck, DESIGN } = await import(skillUrl('assets/deckkits/clear-impact.kit.mjs'))
  const { validateDeckkitContent } = await import(skillUrl('assets/deckkits/validate-deckkit.mjs'))
  function specimen(s, key = '') {
    if (s['x-slotProbeValue'] !== undefined) return s['x-slotProbeValue']
    if (s.enum) return s.enum[0]
    if (s.type === 'object')
      return Object.fromEntries((s.required ?? []).map((k) => [k, specimen(s.properties[k], k)]))
    if (s.type === 'array')
      return Array.from({ length: s.minItems ?? 1 }, () => specimen(s.items, key))
    if (s.type === 'number') return key === 'weight' || key === 'target' ? 1 : 0
    return ['value', 'baseline', 'target'].includes(key) ? '1' : key === 'unit' ? 'u' : 'Proof'
  }
  for (const [type, family] of Object.entries(DESIGN.impact.families)) {
    const schema = JSON.parse(
      readFileSync(skillPath(`assets/deckkits/schemas/clear-impact/${type}.schema.json`)),
    )
    for (const layoutId of Object.keys(family.variants)) {
      const data = specimen(schema)
      if (family.role === 'scorecard') data.columns.at(-1).kind = 'status'
      const content = { meta: { deckkit: 'clear-impact' }, slides: [{ type, layoutId, data }] }
      const validation = validateDeckkitContent(content, {
        deckkit: 'clear-impact',
        mode: 'delivery',
      })
      assert.equal(
        validation.valid,
        true,
        `${type}/${layoutId}: ${JSON.stringify(validation.errors)}`,
      )
      const result = createDeck(content),
        text = JSON.stringify(result.patch)
      assert.equal(result.designCheck.status, 'pass')
      assert.doesNotMatch(
        text,
        /Low-altitude|Carbon intensity|Urban Logistics|Gen 3|2025 Impact|Material recovery|2026 Targets/,
      )
      assert.equal(
        result.patch.ops.some((op) => op.op === 'add-image'),
        false,
      )
      assert.equal(result.designPlan.layouts[0].layoutId, layoutId)
    }
  }
})

test('clear-impact preserves numeric evidence and rejects unsafe or inconsistent content', async () => {
  const { createDeck } = await import(skillUrl('assets/deckkits/clear-impact.kit.mjs'))
  const { validateDeckkitContent } = await import(skillUrl('assets/deckkits/validate-deckkit.mjs'))
  const sample = JSON.parse(
    readFileSync(skillPath('assets/deckkits/examples/clear-impact-content.json')),
  )
  const one = (type) => ({
    meta: { deckkit: 'clear-impact' },
    slides: [structuredClone(sample.slides.find((s) => s.type === type))],
  })
  const chart = one('impactChartSlide')
  chart.slides[0].data.points = [
    { label: 'Loss', value: -2 },
    { label: 'Zero', value: 0 },
    { label: 'Small', value: 0.00001 },
  ]
  const built = createDeck(chart),
    op = built.patch.ops.find((o) => o.op === 'add-chart')
  assert.deepEqual(op.data.series[0].values, [-2, 0, 0.00001])
  assert.equal(
    built.patch.ops.find((o) => o.op === 'set-chart').dataLabels[0].numberFormat,
    '0.00E+00',
  )
  const integerChart = createDeck(one('impactChartSlide')).patch.ops.find(
    (o) => o.op === 'set-chart',
  )
  assert.equal(integerChart.dataLabels[0].numberFormat, '0')
  const decimal = one('impactChartSlide')
  decimal.slides[0].data.points[0].value = 96.25
  assert.equal(
    createDeck(decimal).patch.ops.find((o) => o.op === 'set-chart').dataLabels[0].numberFormat,
    'General',
  )
  const a = structuredClone(chart),
    b = structuredClone(chart)
  a.slides[0].layoutId = 'chartLeft'
  b.slides[0].layoutId = 'chartRight'
  assert.notDeepEqual(
    createDeck(a).designPlan.objects.map((o) => o.frame),
    createDeck(b).designPlan.objects.map((o) => o.frame),
  )
  assert.deepEqual(
    createDeck(a).patch.ops.find((o) => o.op === 'add-chart').data,
    createDeck(b).patch.ops.find((o) => o.op === 'add-chart').data,
  )
  const bad = []
  const noUnit = one('impactChartSlide')
  delete noUnit.slides[0].data.unit
  bad.push(noUnit)
  const noSource = one('impactChartSlide')
  delete noSource.slides[0].data.source
  bad.push(noSource)
  const focus = one('impactChartSlide')
  focus.slides[0].data.points[0].focus = true
  bad.push(focus)
  const excess = one('impactChartSlide')
  excess.slides[0].data.points = Array.from({ length: 7 }, () => ({ label: 'x', value: 1 }))
  bad.push(excess)
  const unknown = one('impactChartSlide')
  unknown.slides[0].data.policy = 'hidden'
  bad.push(unknown)
  const target = one('impactProgressSlide')
  target.slides[0].data.items[0].target = 0
  bad.push(target)
  const negative = one('impactProgressSlide')
  negative.slides[0].data.items[0].actual = -1
  bad.push(negative)
  const bridge = one('impactVarianceSlide')
  bridge.slides[0].data.end = 99
  bad.push(bridge)
  const cell = one('impactScorecardSlide')
  cell.slides[0].data.rows[0].cells.pop()
  bad.push(cell)
  const long = one('impactReviewSlide')
  long.slides[0].data.title = 'W'.repeat(300)
  bad.push(long)
  const ops = one('impactChartSlide')
  ops.slides[0].customOps = []
  bad.push(ops)
  for (const input of bad)
    assert.equal(
      validateDeckkitContent(input, { deckkit: 'clear-impact', mode: 'delivery' }).valid,
      false,
    )
  const repeat = one('impactChartSlide')
  repeat.slides[0].layoutId = 'chartLeft'
  repeat.slides = Array.from({ length: 3 }, () => structuredClone(repeat.slides[0]))
  assert.ok(createDeck(repeat).warnings.some((w) => w.includes('repeated')))
})

test('clear-impact enforces design rules and exposes numeric probe values without hiding text slots', async () => {
  const { createDeck, DESIGN } = await import(skillUrl('assets/deckkits/clear-impact.kit.mjs'))
  const { checkDesignPatch, assertDesignContract } = await import(
    skillUrl('assets/deckkits/design-contract.mjs')
  )
  const content = JSON.parse(
      readFileSync(skillPath('assets/deckkits/examples/clear-impact-content.json')),
    ),
    patch = createDeck(content).patch
  for (const mutation of [
    {
      op: 'set-shape',
      slide: 0,
      shape: { name: 'S0_Title' },
      fill: { type: 'solid', color: 'FF00FF' },
    },
    {
      op: 'set-run',
      slide: 0,
      shape: { name: 'S0_Title' },
      paragraph: 0,
      run: 0,
      font: { name: 'Georgia', size: '9pt', italic: true },
    },
    {
      op: 'set-shape',
      slide: 0,
      shape: { name: 'S0_Title' },
      fill: {
        type: 'gradient',
        stops: [
          { position: 0, color: 'FFFFFF' },
          { position: 1, color: '002A12' },
        ],
      },
    },
    { op: 'add-group', slide: 0, name: 'Unsupported' },
    {
      op: 'set-shape',
      slide: 0,
      shape: { name: 'SecondFocus' },
      fill: { type: 'solid', color: DESIGN.colors.spring },
    },
  ])
    assert.equal(
      checkDesignPatch(DESIGN, { ...patch, ops: [...patch.ops, mutation] }).status,
      'fail',
    )
  const design = structuredClone(DESIGN)
  design.rules.push({ id: 'unknown', check: 'not-a-checker' })
  assert.throws(() => assertDesignContract(design), /Unknown design checker/)
  const result = JSON.parse(
    runNode([
      skillPath('scripts/pptx-nova-deckkit-slot-consistency.mjs'),
      '--deckkit',
      'clear-impact',
      '--json',
    ]).stdout,
  )
  assert.equal(result.ok, true)
  assert.equal(result.results[0].slideTypes.length, 12)
  assert.ok(result.results[0].slideTypes.every((s) => s.ghosts.length === 0))
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

test('cartesian line chart emits xdoc-compatible marker colors', async () => {
  const kit = await import(skillUrl('assets/deckkits/cartesian.kit.mjs'))
  const result = kit.createDeck({
    meta: { deckkit: 'cartesian' },
    slides: [
      {
        type: 'cartesianLineChartSlide',
        data: {
          label: 'Trend Analysis',
          title: 'Growth Projection',
          body: 'Marker payloads must follow the current xdoc chart contract.',
          unit: 'percent',
          source: 'Source: synthetic marker fixture',
          chart: {
            categories: ['2024', '2025'],
            series: [
              { name: 'Market Share', values: [42, 51] },
              { name: 'Industry Average', values: [30, 36] },
            ],
          },
        },
      },
    ],
  })
  const markers = result.patch.ops.flatMap((op) =>
    op.op === 'set-chart' ? (op.series ?? []).map((series) => series.marker).filter(Boolean) : [],
  )

  assert.equal(markers.length, 2)
  assert.deepEqual(
    markers.map((marker) => [marker.fill, marker.line]),
    [
      ['1A1A1A', 'EDE8E0'],
      ['665D56', 'EDE8E0'],
    ],
  )
})

test('consulting-dark benchmark chart omits the unsupported none legend value', async () => {
  const kit = await import(skillUrl('assets/deckkits/consulting-dark.kit.mjs'))
  const result = kit.createDeck({
    meta: { deckkit: 'consulting-dark' },
    slides: [
      {
        type: 'benchmarkSlide',
        data: {
          eyebrow: 'Benchmark',
          title: 'Comparison',
          source: 'Synthetic validation fixture',
          unit: 'Points',
          tableRows: [
            ['Metric', 'Product'],
            ['Score', '9.8'],
          ],
          chartTitle: 'Scores',
          chartData: {
            categories: ['Product'],
            series: [{ name: 'Score', values: [9.8] }],
          },
          calloutNum: '9.8',
          calloutText: 'Leading score',
        },
      },
    ],
  })
  const chart = result.patch.ops.find((op) => op.op === 'add-chart')

  assert.ok(chart, 'benchmark slide should emit an add-chart operation')
  assert.equal('legend' in chart, false)
})

test('consulting-dark benchmark table emits canonical nested cell coordinates', async () => {
  const kit = await import(skillUrl('assets/deckkits/consulting-dark.kit.mjs'))
  const content = JSON.parse(
    readFileSync(skillPath('assets/examples/consulting-dark/content.json'), 'utf8'),
  )
  const result = kit.createDeck(content)
  const cells = result.patch.ops
    .filter((op) => op.op === 'set-table')
    .flatMap((op) => op.cells ?? [])

  assert.equal(
    cells.length,
    content.slides.find((s) => s.type === 'benchmarkSlide').data.tableRows.flat().length,
  )
  for (const cell of cells) {
    assert.equal('col' in cell, false, 'legacy set-table.cells[].col')
    assert.equal(Number.isInteger(cell.column), true, 'set-table.cells[].column must be an integer')
  }
})

test('quarterly report patch uses the current chart legend enum', () => {
  const patch = JSON.parse(
    readFileSync(skillPath('assets/examples/quarterly-report.patch.json'), 'utf8'),
  )
  const chart = patch.ops.find((op) => op.op === 'add-chart' && op.name === 'Revenue')

  assert.ok(chart, 'quarterly report patch should include the revenue chart')
  assert.equal(chart.legend, 'bottom')
})

test('deck generator data-room chart omits the unsupported none legend value', () => {
  const result = spawnSync(
    process.execPath,
    [skillPath('assets/examples/deck-generator-template.mjs'), '--layout', 'data-room'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const patch = JSON.parse(result.stdout)
  const chart = patch.ops.find((op) => op.op === 'add-chart' && op.name === 'DataDriverChart')

  assert.ok(chart, 'data-room layout should emit the loss-driver chart')
  assert.equal('legend' in chart, false)
})

test('deck generator layouts emit canonical aggregate patch payloads', () => {
  const expectedTableCells = {
    'executive-grid': 15,
    'narrative-split': 15,
    'data-room': 40,
  }
  for (const layout of ['executive-grid', 'narrative-split', 'data-room']) {
    const result = spawnSync(
      process.execPath,
      [skillPath('assets/examples/deck-generator-template.mjs'), '--layout', layout],
      { cwd: repoRoot, encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const patch = JSON.parse(result.stdout)
    let tableCellCount = 0

    for (const op of patch.ops) {
      if (op.op === 'add-shape') {
        assert.equal('shape' in op, false, `${layout}: add-shape must use kind or preset`)
        assert.equal('kind' in op || 'preset' in op, true, `${layout}: add-shape type missing`)
      }
      if (op.op === 'set-chart') {
        for (const legacyField of ['axis', 'scope', 'showValue', 'position', 'fill']) {
          assert.equal(legacyField in op, false, `${layout}: legacy set-chart.${legacyField}`)
        }
        if ('series' in op) assert.equal(Array.isArray(op.series), true)
        if ('axes' in op) assert.equal(Array.isArray(op.axes), true)
        if ('dataLabels' in op) assert.equal(Array.isArray(op.dataLabels), true)
      }
      if (op.op === 'set-table') {
        for (const legacyField of [
          'row',
          'col',
          'height',
          'firstRow',
          'firstCol',
          'horzBanding',
          'startRow',
          'startCol',
          'endRow',
          'endCol',
        ]) {
          assert.equal(legacyField in op, false, `${layout}: legacy set-table.${legacyField}`)
        }
        tableCellCount += (op.cells ?? []).length
        for (const cell of op.cells ?? []) {
          assert.equal('col' in cell, false, `${layout}: legacy set-table.cells[].col`)
          assert.equal(
            Number.isInteger(cell.column),
            true,
            `${layout}: set-table.cells[].column must be an integer`,
          )
        }
      }
    }
    assert.equal(tableCellCount, expectedTableCells[layout])
  }
})

test('copyable reference examples avoid removed xdoc payload aliases', () => {
  const referencesDir = skillPath('references')
  const markdown = readdirSync(referencesDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => readFileSync(join(referencesDir, name), 'utf8'))
    .join('\n')

  for (const legacyTrigger of ['onClick', 'withPrevious', 'afterPrevious']) {
    assert.equal(
      markdown.includes(legacyTrigger),
      false,
      `legacy animation trigger: ${legacyTrigger}`,
    )
  }
  assert.equal(
    /"shape"\s*:\s*\{\s*"id"\s*:\s*"/.test(markdown),
    false,
    'shape selector ids must be numeric',
  )
  assert.equal(
    /"shape"\s*:\s*\{\s*"placeholder"\s*:\s*\{\s*"type"/.test(markdown),
    false,
    'direct shape placeholder selectors must use a string value',
  )
  assert.equal(
    /"fonts"\s*:\s*\{\s*"major"\s*:\s*"/.test(markdown),
    false,
    'theme font patches must use typeface objects',
  )
  assert.equal(
    /"effect"\s*:\s*\{\s*"kind"/.test(markdown),
    false,
    'shape effects must use shadow/glow/reflection/softEdge objects',
  )
  const tableReferences = [
    skillPath('references/tables.md'),
    skillPath('references/patch-ops-cheatsheet.md'),
  ]
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')
  for (const legacyTableField of ['`cols`', '`col`', '{ col, width }']) {
    assert.equal(
      tableReferences.includes(legacyTableField),
      false,
      `legacy public table field: ${legacyTableField}`,
    )
  }
  assert.equal(/\brow,\s*col\b/.test(tableReferences), false, 'legacy public table field: row, col')
  assert.equal(
    markdown.includes('将 `type` 明确设为 `fade`'),
    false,
    'transition fallback must use set-slide-transition.kind',
  )
  assert.equal(
    /"source"\s*:\s*\{\s*"assetSource"/.test(markdown),
    false,
    'bind-data sources must use a direct path instead of an assetSource wrapper',
  )

  for (const legacyEffect of ['fadeOut', 'wipeOut', 'flyOut']) {
    assert.equal(markdown.includes(legacyEffect), false, `legacy animation effect: ${legacyEffect}`)
  }
  assert.equal(
    /["']kind["']\s*:\s*["'](?:solid|gradient|pattern|none)["']/.test(markdown),
    false,
    'fill payloads must use type instead of the removed kind discriminator',
  )
  assert.equal(
    /["']type["']\s*:\s*["']radialGradient["']/.test(markdown),
    false,
    'radial fills must use type=gradient with path=circle',
  )
  for (const legacyChartEnum of [
    'column3D',
    'bar3D',
    'line3D',
    'area3D',
    'pie3D',
    'surface3D',
    'bubble3D',
    'boxWhisker',
    'regionMap',
    'percentStacked',
    'linesNoMarkers',
    'smoothNoMarkers',
  ]) {
    assert.equal(markdown.includes(legacyChartEnum), false, `legacy chart enum: ${legacyChartEnum}`)
  }
})

test('tracked literal op values stay within the current xdoc patch and condition schemas', () => {
  const schema = JSON.parse(readFileSync(join(repoRoot, 'docs/xdoc-schema.json'), 'utf8'))
  const canonicalOps = new Set(schema.commands.pptx.patchSchema.supportedOps)
  // Both patch operations and control-flow comparisons use the literal key `op`.
  const definitions = schema.commands.pptx.patchSchema.jsonSchema.$defs
  const conditionOps = new Set()
  for (const condition of definitions.controlCondition.oneOf) {
    const operator = condition.properties.op
    // Selector-existence conditions have no comparison operator.
    if (!operator) continue
    assert.match(operator.$ref, /^#\/\$defs\/[^/]+$/)
    const values = definitions[operator.$ref.slice('#/$defs/'.length)]?.enum
    assert.ok(Array.isArray(values) && values.length > 0, `Missing operator enum: ${operator.$ref}`)
    for (const value of values) conditionOps.add(value)
  }
  assert.ok(conditionOps.size > 0, 'Control conditions must define comparison operators')
  const tracked = spawnSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.equal(tracked.status, 0, tracked.stderr || tracked.stdout)

  const invalid = []
  const literalOp = /(?:["']op["']|(?<![\w.])op)\s*:\s*(["'])([^"']+)\1/g
  for (const relativePath of tracked.stdout.split('\0').filter(Boolean)) {
    if (relativePath === 'docs/xdoc-schema.json') continue
    const source = readFileSync(join(repoRoot, relativePath), 'utf8')
    if (source.includes('\0')) continue
    for (const match of source.matchAll(literalOp)) {
      if (canonicalOps.has(match[2]) || conditionOps.has(match[2]) || match[2] === '...') continue
      invalid.push(`${relativePath}: ${match[2]}`)
    }
  }

  assert.deepEqual(invalid, [])
})

test('public xdoc docs match the clean checked-in runtime schema', () => {
  const result = spawnSync('nu', ['tools/update-xdoc-public-docs.nu', '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('schema recipe captures the local xdoc runtime by default', () => {
  const justfile = readFileSync(join(repoRoot, 'Justfile'), 'utf8')
  assert.match(justfile, /^schema schema_file='':$/m)
  assert.match(justfile, /tools\/update-xdoc-public-docs\.nu/)
  assert.match(justfile, /\^xdoc schema \| complete/)
})

test('schema-public recipe delegates the controlled build and gate to one maintainer command', () => {
  const justfile = readFileSync(join(repoRoot, 'Justfile'), 'utf8')
  assert.match(justfile, /^schema-public manifest xdoc_repo='\.\.\/pptx':$/m)
  assert.match(justfile, /tools\/refresh-xdoc-public-docs\.nu/)
})

test('public xdoc docs refresher composes build, gate, capture, update, and check', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'xdoc-public-refresh-'))
  const xdocRepo = join(root, 'pptx')
  const novaRepo = join(root, 'pptx-nova')
  const xdocTools = join(xdocRepo, 'tools')
  const novaTools = join(novaRepo, 'tools')
  const novaDocs = join(novaRepo, 'docs')
  const manifest = join(xdocRepo, 'approved-manifest.json')
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(xdocTools, { recursive: true })
  mkdirSync(novaTools, { recursive: true })
  mkdirSync(novaDocs, { recursive: true })

  const schema = publicXdocSchema({
    version: '0.3.10 (deadbeef)',
    definitions: { first: {}, second: {} },
  })
  const isWindows = process.platform === 'win32'
  const binaryName = isWindows ? 'xdoc.exe' : 'xdoc'
  const fakeXdocName = isWindows ? 'fake-xdoc.exe' : 'fake-xdoc'
  const fakeXdoc = join(xdocRepo, fakeXdocName)
  const fakeXdocSource = `process.stdout.write(${JSON.stringify(JSON.stringify(schema))})\n`
  if (isWindows) {
    copyFileSync(process.execPath, fakeXdoc)
    writeFileSync(join(root, 'schema'), fakeXdocSource)
  } else {
    writeFileSync(fakeXdoc, `#!/usr/bin/env node\n${fakeXdocSource}`)
    chmodSync(fakeXdoc, 0o755)
  }
  writeJson(manifest, { schemaVersion: 'xdoc-cli-trust-profile/v1' })
  writeFileSync(
    join(xdocTools, 'build-production-xdoc-cli.nu'),
    [
      '#!/usr/bin/env nu',
      '',
      'def main [--manifest: path, --output-dir: path, --json] {',
      '  let root = ($env.CURRENT_FILE | path dirname | path dirname)',
      '  mkdir $output_dir',
      `  let binary = ($output_dir | path join '${binaryName}')`,
      `  cp ($root | path join '${fakeXdocName}') $binary`,
      ...(isWindows ? [] : ["  ^chmod '755' $binary"]),
      '  let revision = (^git -C $root rev-parse HEAD | str trim)',
      '  {',
      "    schemaVersion: 'xdoc-cli-controlled-build/v1'",
      "    status: 'built'",
      '    sourceRevision: $revision',
      '    binary: ($binary | path expand --strict | into string)',
      '  } | to json --raw | print',
      '}',
      '',
    ].join('\n'),
  )
  writeFileSync(
    join(xdocTools, 'xdoc-cli-release-check.nu'),
    [
      '#!/usr/bin/env nu',
      '',
      'def main [',
      '  --manifest: path',
      '  --package-dir: path',
      '  --source-revision: string',
      '  --report: path',
      '  --json',
      '] {',
      '  let value = {',
      "    schemaVersion: 'xdoc-cli-release-check/v1'",
      "    status: 'passed'",
      '    sourceRevision: $source_revision',
      `    binary: ($package_dir | path join '${binaryName}' | path expand --strict | into string)`,
      '  }',
      '  $value | to json | save --force $report',
      '  $value | to json --raw | print',
      '}',
      '',
    ].join('\n'),
  )

  writeFileSync(
    join(novaTools, 'update-xdoc-public-docs.nu'),
    readFileSync(join(repoRoot, 'tools/update-xdoc-public-docs.nu')),
  )
  writeJson(join(novaDocs, 'xdoc-schema.json'), {
    schemaVersion: 'cli-agent/v1',
    version: '0.3.9 (cafebabe)',
    commands: {
      pptx: {
        patchSchema: {
          jsonSchema: { $defs: { first: {} } },
        },
      },
    },
  })
  writeFileSync(
    join(novaDocs, 'xdoc-introducution.md'),
    [
      '> **Runtime build verified for this document:** `0.3.9 (cafebabe)`',
      '',
      '> **Verification date:** 2025-01-02',
      '',
      '| Patch schema definitions | 1 `$defs` in the current runtime schema |',
      '',
      'This document is anchored to xdoc 0.3.9 (cafebabe).',
      '',
    ].join('\n'),
  )

  for (const args of [
    ['init', '--quiet'],
    ['add', '.'],
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    ],
  ]) {
    const git = spawnSync('git', args, { cwd: xdocRepo, encoding: 'utf8' })
    assert.equal(git.status, 0, git.stderr)
  }

  const result = spawnSync(
    'nu',
    [
      '--no-config-file',
      join(repoRoot, 'tools/refresh-xdoc-public-docs.nu'),
      '--manifest',
      manifest,
      '--xdoc-repo',
      xdocRepo,
      '--nova-repo',
      novaRepo,
      '--verification-date',
      '2026-09-03',
    ],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /Public xdoc documentation refreshed from gated build/)
  const { build: _build, authContract: _authContract, ...contractSchema } = schema
  assert.deepEqual(
    JSON.parse(readFileSync(join(novaDocs, 'xdoc-schema.json'), 'utf8')),
    contractSchema,
  )
  const introduction = readFileSync(join(novaDocs, 'xdoc-introducution.md'), 'utf8')
  assert.match(introduction, /0\.3\.10 \(deadbeef\)/)
  assert.match(introduction, /Verification date:\*\* 2026-09-03/)
  assert.match(introduction, /2 `\$defs` in the current runtime schema/)
})

test('public xdoc docs updater replaces literal $defs text and keeps checks deterministic', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'xdoc-public-docs-'))
  const docsDir = join(root, 'docs')
  const schemaPath = join(root, 'runtime-schema.json')
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(docsDir, { recursive: true })
  const localSchema = publicXdocSchema({
    version: '1.2.3 (deadbeef)',
    definitions: { first: {}, second: {} },
  })
  localSchema.build.product = 'xdoc-server'
  localSchema.build.customerId = 'dev'
  localSchema.build.licenseId = 'lic_dev'
  localSchema.build.buildId = 'build_dev'
  localSchema.build.edition = 'development'
  localSchema.authContract.buildProfile = 'development'
  localSchema.authContract.buildId = 'dev'
  localSchema.prose = [
    'Generated from the same MoonBit modules the PDF renderer uses.',
    'Unavailable until the pure MoonBit reader lands.',
  ]
  localSchema.presets = ['moon', 'rect']
  writeJson(schemaPath, localSchema)
  writeJson(
    join(docsDir, 'xdoc-schema.json'),
    publicXdocSchema({
      version: '1.2.2 (cafebabe)',
      definitions: { first: {} },
    }),
  )
  writeFileSync(
    join(docsDir, 'xdoc-introducution.md'),
    [
      '> **Runtime build verified for this document:** `1.2.2 (cafebabe)`',
      '',
      '> **Verification date:** 2025-01-02',
      '',
      '| Patch schema definitions | 1 `$defs` in the current runtime schema |',
      '',
      'This document is anchored to xdoc 1.2.2 (cafebabe).',
      '',
    ].join('\n'),
  )

  const update = spawnSync(
    'nu',
    [
      join(repoRoot, 'tools/update-xdoc-public-docs.nu'),
      '--schema-file',
      schemaPath,
      '--verification-date',
      '2026-07-23',
    ],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(update.status, 0, update.stderr || update.stdout)
  assert.doesNotMatch(`${update.stdout}${update.stderr}`, /[\u3400-\u9fff]/u)
  const introduction = readFileSync(join(docsDir, 'xdoc-introducution.md'), 'utf8')
  assert.match(introduction, /2 `\$defs` in the current runtime schema/)
  assert.match(introduction, /1\.2\.3 \(deadbeef\)/)
  assert.match(introduction, /Verification date:\*\* 2026-07-23/)
  const writtenSchema = JSON.parse(readFileSync(join(docsDir, 'xdoc-schema.json'), 'utf8'))
  assert.equal('build' in writtenSchema, false)
  assert.equal('authContract' in writtenSchema, false)
  assert.deepEqual(writtenSchema.prose, [
    'Generated from the same shared geometry modules the PDF renderer uses.',
    'Unavailable until the alternative PDF reader lands.',
  ])
  assert.deepEqual(writtenSchema.presets, localSchema.presets)
  assert.doesNotMatch(readFileSync(join(docsDir, 'xdoc-schema.json'), 'utf8'), /moon|mbt/i)
  assert.deepEqual(JSON.parse(readFileSync(schemaPath, 'utf8')), localSchema)

  const check = spawnSync('nu', [join(repoRoot, 'tools/update-xdoc-public-docs.nu'), '--check'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(check.status, 0, check.stderr || check.stdout)
  assert.doesNotMatch(`${check.stdout}${check.stderr}`, /[\u3400-\u9fff]/u)
  const snapshotBefore = readFileSync(join(docsDir, 'xdoc-schema.json'))
  for (const [relativePath, term] of [
    ['README.md', 'MOONBIT'],
    ['pptx-nova/README.md', 'moon'],
    ['docs/nested/guide.md', 'mbt'],
  ]) {
    const path = join(root, relativePath)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, term)
    const rejected = spawnSync(
      'nu',
      [join(repoRoot, 'tools/update-xdoc-public-docs.nu'), '--check'],
      { cwd: root, encoding: 'utf8' },
    )
    assert.notEqual(rejected.status, 0, relativePath)
    assert.match(`${rejected.stdout}${rejected.stderr}`, /forbidden text/)
    assert.deepEqual(readFileSync(join(docsDir, 'xdoc-schema.json')), snapshotBefore)
    rmSync(path)
  }
})

test('public xdoc docs updater rejects development and spoofed CLI identities before writing', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'xdoc-public-identity-'))
  const docsDir = join(root, 'docs')
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(docsDir, { recursive: true })

  const checkedInSchema = publicXdocSchema({
    version: '1.2.2 (cafebabe)',
    definitions: { first: {} },
  })
  const snapshotPath = join(docsDir, 'xdoc-schema.json')
  const introductionPath = join(docsDir, 'xdoc-introducution.md')
  writeJson(snapshotPath, checkedInSchema)
  writeFileSync(
    introductionPath,
    [
      '> **Runtime build verified for this document:** `1.2.2 (cafebabe)`',
      '',
      '> **Verification date:** 2025-01-02',
      '',
      '| Patch schema definitions | 1 `$defs` in the current runtime schema |',
      '',
      'This document is anchored to xdoc 1.2.2 (cafebabe).',
      '',
    ].join('\n'),
  )
  const snapshotBefore = readFileSync(snapshotPath)
  const introductionBefore = readFileSync(introductionPath)

  const cases = [
    {
      name: 'development server build',
      mutate(schema) {
        schema.build.product = 'xdoc-server'
        schema.build.customerId = 'dev'
        schema.build.licenseId = 'lic_dev'
        schema.build.buildId = 'build_dev'
        schema.build.edition = 'development'
        schema.authContract.buildProfile = 'development'
        schema.authContract.buildId = 'dev'
      },
      expected: [/build\.product mismatch/, /xdoc-server/],
    },
    {
      name: 'product-only spoof',
      mutate(schema) {
        schema.build.customerId = 'dev'
        schema.build.licenseId = 'lic_dev'
        schema.build.buildId = 'build_dev'
        schema.build.edition = 'development'
        schema.authContract.buildProfile = 'development'
        schema.authContract.buildId = 'dev'
      },
      expected: [/build\.customerId mismatch/, /found dev/],
    },
  ]

  for (const candidateCase of cases) {
    const schema = publicXdocSchema({
      version: '1.2.3 (deadbeef)',
      definitions: { first: {}, second: {} },
    })
    candidateCase.mutate(schema)
    const schemaPath = join(root, `${candidateCase.name.replaceAll(' ', '-')}.json`)
    writeJson(schemaPath, schema)
    const result = spawnSync(
      'nu',
      [
        join(repoRoot, 'tools/update-xdoc-public-docs.nu'),
        '--schema-file',
        schemaPath,
        '--verification-date',
        '2026-07-23',
        '--require-public-build',
      ],
      { cwd: root, encoding: 'utf8' },
    )
    assert.notEqual(result.status, 0, candidateCase.name)
    const diagnostic = `${result.stdout}${result.stderr}`
    for (const expected of candidateCase.expected) {
      assert.match(diagnostic, expected)
    }
    assert.deepEqual(readFileSync(snapshotPath), snapshotBefore)
    assert.deepEqual(readFileSync(introductionPath), introductionBefore)
  }
})

test('public xdoc docs updater rejects a missing build descriptor from xdoc 0.3.10 onward', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'xdoc-public-build-required-'))
  const docsDir = join(root, 'docs')
  const schemaPath = join(root, 'runtime-schema.json')
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(docsDir, { recursive: true })

  const candidate = publicXdocSchema({
    version: '0.3.10 (deadbeef)',
    definitions: { first: {}, second: {} },
  })
  delete candidate.build
  writeJson(schemaPath, candidate)
  writeJson(join(docsDir, 'xdoc-schema.json'), {
    schemaVersion: 'cli-agent/v1',
    version: '0.3.9 (cafebabe)',
    commands: {
      pptx: {
        patchSchema: {
          jsonSchema: { $defs: { first: {} } },
        },
      },
    },
  })
  writeFileSync(
    join(docsDir, 'xdoc-introducution.md'),
    [
      '> **Runtime build verified for this document:** `0.3.9 (cafebabe)`',
      '',
      '> **Verification date:** 2025-01-02',
      '',
      '| Patch schema definitions | 1 `$defs` in the current runtime schema |',
      '',
      'This document is anchored to xdoc 0.3.9 (cafebabe).',
      '',
    ].join('\n'),
  )

  const result = spawnSync(
    'nu',
    [
      join(repoRoot, 'tools/update-xdoc-public-docs.nu'),
      '--schema-file',
      schemaPath,
      '--verification-date',
      '2026-07-23',
      '--require-public-build',
    ],
    { cwd: root, encoding: 'utf8' },
  )
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}${result.stderr}`, /requires an xdoc-build\/v1 descriptor/)

  const legacyCheck = spawnSync(
    'nu',
    [join(repoRoot, 'tools/update-xdoc-public-docs.nu'), '--check'],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(legacyCheck.status, 0, legacyCheck.stderr || legacyCheck.stdout)
})

test('tracked repository sources do not retain removed legacy xdoc op names', () => {
  const removedOps = [
    'add-picture',
    'add-slide-layout',
    'add-slide-layout-placeholder',
    'add-textbox',
    'clear-run-hyperlink',
    'clear-slide-notes',
    'fill-layout',
    'import-table-data',
    'raw-ooxml-patch',
    'replace-structured-paragraph-text',
    'set-cell-formula',
    'set-chart-axis-scale',
    'set-chart-axis-style',
    'set-chart-axis-ticks',
    'set-chart-data-labels',
    'set-chart-gridline-style',
    'set-chart-legend-style',
    'set-chart-marker-style',
    'set-chart-plot-style',
    'set-chart-point-style',
    'set-chart-series-style',
    'set-chart-style',
    'set-chart-title-style',
    'set-core-prop',
    'set-master-bg',
    'set-master-placeholder-style',
    'set-paragraph-bullet',
    'set-paragraph-format',
    'set-picture-crop',
    'set-presentation-default-text-style',
    'set-run-hyperlink',
    'set-shape-click-action',
    'set-shape-effect',
    'set-shape-flip',
    'set-shape-line',
    'set-shape-name',
    'set-shape-outline',
    'set-shape-position',
    'set-shape-rotation',
    'set-shape-size',
    'set-shape-text-style',
    'set-shape-z-order',
    'set-slide-layout-type',
    'set-slide-notes-rich-text',
    'set-table-cell',
    'set-table-cell-style',
    'set-table-column-width',
    'set-table-range-borders',
    'set-table-row-height',
    'set-table-style',
    'set-text',
    'set-text-frame-auto-size',
    'set-text-frame-vertical-text',
    'set-text-style',
    'set-theme-color',
    'set-theme-font',
  ]
  const tracked = spawnSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.equal(tracked.status, 0, tracked.stderr || tracked.stdout)

  const residuals = []
  for (const relativePath of tracked.stdout.split('\0').filter(Boolean)) {
    if (
      relativePath === 'docs/xdoc-schema.json' ||
      relativePath === 'tools/tests/pptx-nova-scripts.test.mjs'
    ) {
      continue
    }
    const source = readFileSync(join(repoRoot, relativePath), 'utf8')
    if (source.includes('\0')) continue
    for (const op of removedOps) {
      const escaped = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`(?<![A-Za-z0-9-])${escaped}(?![A-Za-z0-9-])`).test(source)) {
        residuals.push(`${relativePath}: ${op}`)
      }
    }
  }

  assert.deepEqual(residuals, [])
})

test('mckinsey-blue 2.0 requires an explicit shared timeframe instead of business defaults', async () => {
  const kit = await import(skillUrl('assets/deckkits/mckinsey-blue.kit.mjs'))
  const source = JSON.parse(
    readFileSync(skillPath('assets/deckkits/examples/mckinsey-blue-loyalty-content.json'), 'utf8'),
  )
  const content = {
    meta: { deckkit: 'mckinsey-blue', designScope: 'excerpt' },
    slides: [source.slides[5]],
  }
  delete content.slides[0].data.defaultTimeframe
  assert.throws(() => kit.createDeck(content), /missing defaultTimeframe/)
  content.slides[0].data.defaultTimeframe = 'Review after 90 days'
  assert.ok(JSON.stringify(kit.createDeck(content).patch).includes('Review after 90 days'))
})

test('mckinsey-blue 2.0 rejects invalid percentages without clamping or inventing visible bars', async () => {
  const kit = await import(skillUrl('assets/deckkits/mckinsey-blue.kit.mjs'))
  const source = JSON.parse(
    readFileSync(skillPath('assets/deckkits/examples/mckinsey-blue-loyalty-content.json'), 'utf8'),
  )
  for (const value of [undefined, '62%', 320, -5]) {
    const slide = structuredClone(source.slides[4])
    if (value === undefined) delete slide.data.drivers[0].value
    else slide.data.drivers[0].value = value
    assert.throws(
      () => kit.createDeck({ meta: { deckkit: 'mckinsey-blue' }, slides: [slide] }),
      /value|number|maximum|minimum/,
    )
  }
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
  assert.match(commands.visualVerify, /--visual-mode create/)
  assert.match(commands.visualEvidenceGate, /--candidate/)
  assert.match(commands.finalize, /--finalize --visual-review/)
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
    skillPath('scripts/pptx-nova-create-run.mjs'),
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
    skillPath('scripts/pptx-nova-create-run.mjs'),
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
    skillPath('scripts/pptx-nova-visual-review.mjs'),
    '--mode',
    'create',
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
    skillPath('scripts/pptx-nova-create-run.mjs'),
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

test('refurbish plan requires semantic diff gate by default', async () => {
  const { buildRefurbishPlan } = await import(skillUrl('scripts/pptx-nova-refurbish-plan.mjs'))
  const plan = buildRefurbishPlan({
    deckkit: 'mckinsey-blue',
    source: 'source.pptx',
    output: 'candidate.pptx',
    catalog: skillPath('assets/deckkits/catalog.json'),
    explicit: true,
    json: true,
  })
  const semanticIndex = plan.requiredGates.indexOf('semantic-diff')

  assert.equal(plan.status, 'ready')
  assert.equal(plan.explicitSelection.required, false)
  assert.equal(
    plan.requiredReferences.some((reference) => reference.section === 'Selection'),
    false,
  )
  assert.notEqual(semanticIndex, -1)
  assert.ok(semanticIndex < plan.requiredGates.indexOf('fidelity-gate'))
  assert.ok(
    plan.commands.some(
      (command) =>
        command.name === 'semantic-diff' &&
        command.required === true &&
        command.command.includes('xdoc pptx diff'),
    ),
  )
})

test('explicit swiss-grid refurbishment retains its independent manual fallback route', async () => {
  const { buildRefurbishPlan } = await import(skillUrl('scripts/pptx-nova-refurbish-plan.mjs'))
  const plan = buildRefurbishPlan({
    deckkit: 'swiss-grid',
    source: 'source.pptx',
    output: 'candidate.pptx',
    catalog: skillPath('assets/deckkits/catalog.json'),
    explicit: true,
    json: true,
  })

  assert.equal(plan.status, 'manual-fallback')
  assert.equal(plan.explicitSelection.required, false)
  assert.equal(plan.route, 'fallback-patch')
  assert.equal(plan.nativeSkinning.supported, false)
  assert.equal(
    plan.commands.some((command) => command.name === 'refurbish-skin'),
    false,
  )
  assert.deepEqual(plan.requiredReferences, [
    {
      path: 'references/reference-create.md',
      section: '6. Refurbish Existing Deck',
      reason: 'The selected route requires the catalog-driven fallback contract.',
    },
  ])
})

test('explicit candidate fallback keeps refurbish plan route commands gates and references consistent', async () => {
  const { buildRefurbishPlan } = await import(skillUrl('scripts/pptx-nova-refurbish-plan.mjs'))
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-candidate-fallback-'))
  const catalogPath = join(root, 'catalog.json')
  const catalog = JSON.parse(readFileSync(skillPath('assets/deckkits/catalog.json'), 'utf8'))
  catalog.entries.find((entry) => entry.id === 'consulting-dark').readiness = 'candidate'
  writeJson(catalogPath, catalog)
  const plan = buildRefurbishPlan({
    deckkit: 'consulting-dark',
    source: 'source.pptx',
    output: 'candidate.pptx',
    catalog: catalogPath,
    route: 'fallback',
    explicit: true,
    json: true,
  })

  assert.equal(plan.route, 'fallback-patch')
  assert.equal(plan.routeSelection.requested, 'fallback')
  assert.equal(plan.routeSelection.selected, 'fallback-patch')
  assert.equal(plan.status, 'explicit-manual-fallback')
  assert.equal(plan.requiredGates.includes('fallback-patch-report'), true)
  assert.equal(plan.requiredGates.includes('refurbish-skin-report'), false)
  assert.equal(
    plan.commands.some((command) => command.name === 'native-refurbish-skin'),
    false,
  )
  assert.equal(
    plan.commands.some((command) => command.name === 'generate-fallback-patch'),
    true,
  )
  assert.deepEqual(plan.requiredReferences, [
    {
      path: 'references/reference-create.md',
      section: '6. Refurbish Existing Deck',
      reason: 'The selected route requires the catalog-driven fallback contract.',
    },
    {
      path: 'references/deckkit-mode.md',
      section: 'Selection',
      reason: 'The explicitly selected DeckKit uses a readiness exception.',
    },
  ])
})

test('refurbish fallback prunes only inspect-proven exact theme and solid-fill no-ops', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-refurbish-pruning-'))
  const source = join(root, 'source.pptx')
  const inspectPath = join(root, 'inspect.json')
  const patchPath = join(root, 'patch.json')
  writeFileSync(source, 'fake pptx')
  writeJson(inspectPath, {
    schemaVersion: 'pptx-inspect/v1',
    presentation: {
      slideCount: 1,
      size: { width: '10in', height: '5.625in' },
      themes: [
        {
          partName: 'ppt/theme/theme1.xml',
          usedBySlides: [0],
          usedByMasters: ['ppt/slideMasters/slideMaster1.xml'],
          colors: Object.entries({
            dk1: '111111',
            lt1: 'F7F3E8',
            dk2: '111111',
            lt2: 'FFFFFF',
            accent1: 'D9B44A',
            accent2: '111111',
            accent3: 'EFE2B7',
            accent4: '6B7280',
            accent5: '111111',
            accent6: 'FFFFFF',
            hlink: '111111',
            folHlink: '6B7280',
          }).map(([scheme, value]) => ({ scheme, value })),
          majorFont: { latin: 'Playfair Display', ea: 'Microsoft YaHei' },
          minorFont: { latin: 'Inter', ea: 'Microsoft YaHei' },
        },
      ],
    },
    slides: [
      {
        index: 0,
        semantic: { elementStats: { total: 3, text: 1 } },
        shapes: [
          {
            id: 1,
            name: 'Existing Surface',
            shapeType: 'autoShape',
            fillType: 'solid',
            fillColor: 'FFFFFF',
            lineNoFill: true,
            hasText: false,
          },
          {
            id: 2,
            name: 'Changing Accent',
            shapeType: 'autoShape',
            fillType: 'solid',
            fillColor: 'D9B44A',
            lineNoFill: true,
            hasText: false,
          },
          {
            id: 3,
            name: 'Body Copy',
            shapeType: 'textBox',
            fillType: 'none',
            fillColor: null,
            hasText: true,
            textPreview: 'Keep editable text',
          },
        ],
      },
    ],
  })

  const result = runNode([
    skillPath('scripts/pptx-nova-refurbish-fallback-patch.mjs'),
    '--deckkit',
    'cartesian',
    '--source',
    source,
    '--inspect',
    inspectPath,
    '--output',
    join(root, 'candidate.pptx'),
    '--patch',
    patchPath,
    '--lock',
    join(root, 'deck_lock.json'),
    '--audit',
    join(root, 'content-audit.json'),
    '--map',
    join(root, 'reference-map.json'),
    '--json',
  ])
  const report = JSON.parse(result.stdout)
  const patch = JSON.parse(readFileSync(patchPath, 'utf8'))
  const audit = report.summary.operationAudit

  assert.equal(audit.plannedOps, 7)
  assert.equal(audit.emittedOps, 5)
  assert.equal(audit.knownNoOpOps, 2)
  assert.equal(audit.knownChangingOps, 1)
  assert.equal(audit.unknownEffectOps, 4)
  assert.equal(audit.effectiveOps, null)
  assert.equal(audit.styleFingerprint.themeMatchesTarget, true)
  assert.equal(audit.styleFingerprint.fontMatchesTarget, true)
  assert.equal(audit.pruningReasons['theme-and-fonts-exact-match'], 1)
  assert.equal(audit.pruningReasons['shape-solid-fill-exact-match'], 1)
  assert.equal(
    patch.ops.some((op) => op.op === 'set-theme'),
    false,
  )
  assert.deepEqual(
    patch.ops.filter((op) => op.op === 'set-shape').map((op) => op.fill?.color),
    ['EFE2B7'],
  )
})

test('skill routes standard refurbishment through one compact reference', () => {
  const skill = readFileSync(skillPath('SKILL.md'), 'utf8')
  const reference = readFileSync(skillPath('references/refurbish-runner.md'), 'utf8')
  const routingRow = skill
    .split('\n')
    .find((line) => line.includes('Polish / refurbish an existing PPTX'))

  assert.match(routingRow, /references\/refurbish-runner\.md/)
  assert.doesNotMatch(routingRow, /common-workflow|reference-create|deckkit-mode/)
  assert.match(reference, /Do not add `--contact-diff` for ordinary full-deck review/)
  assert.match(reference, /refurbish-plan\.json\.requiredReferences/)
  assert.ok(reference.split('\n').length < 150)
})

test('skill stays within the progressive-disclosure byte budget', () => {
  const skill = readFileSync(skillPath('SKILL.md'), 'utf8')
  assert.ok(
    Buffer.byteLength(skill, 'utf8') < 55 * 1024,
    `SKILL.md is ${Buffer.byteLength(skill, 'utf8')} bytes`,
  )
  const commandEntry = skill
    .split('## Common Command Entry Points')[1]
    ?.split('## Completion Summary')[0]
  assert.doesNotMatch(commandEntry ?? '', /xdoc pptx (apply|refurbish-skin|i18n-scan)/)
})

test('skill routes standard translation finalization through one compact reference', () => {
  const skill = readFileSync(skillPath('SKILL.md'), 'utf8')
  const reference = readFileSync(skillPath('references/translation-runner.md'), 'utf8')
  const routingRow = skill
    .split('\n')
    .find((line) => line.includes('Translate an existing `.pptx`'))

  assert.match(routingRow, /references\/translation-runner\.md/)
  assert.doesNotMatch(routingRow, /common-workflow|edit-mode|inspect-and-edit/)
  assert.match(reference, /stable translated candidate/i)
  assert.match(reference, /requiredReferences\[\]/)
  assert.match(reference, /must not trigger another full-deck render/)
  assert.ok(reference.split('\n').length < 150)
})

test('refurbish fallback plan overwrites current-run candidate commands', async () => {
  const { buildRefurbishPlan } = await import(skillUrl('scripts/pptx-nova-refurbish-plan.mjs'))
  const plan = buildRefurbishPlan({
    deckkit: 'broadside',
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
  assert.deepEqual(plan.requiredReferences, [
    {
      path: 'references/reference-create.md',
      section: '6. Refurbish Existing Deck',
      reason: 'The selected route requires the catalog-driven fallback contract.',
    },
  ])
  assert.equal(plan.status, 'manual-fallback')
  assert.equal(plan.explicitSelection.required, false)
})

test('refurbish runner persists catalog readiness before a blocked plan exits', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-refurbish-blocked-readiness-'))
  const source = join(root, 'source.pptx')
  const output = join(root, 'out.pptx')
  const runDir = join(root, 'run')
  writeFileSync(source, 'fake pptx')
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] === 'schema') {
  process.stdout.write(JSON.stringify({
    version: '9.9.9 (fake)',
    schemaVersion: 'cli-agent/v1',
    capabilities: { schemaVersion: 'capabilities/v1' },
    commands: { pptx: { subcommands: {}, patchSchema: {}, catalogs: { nativeDeckkits: { deckkits: [] } } } }
  }))
} else {
  process.stderr.write('unexpected fake xdoc command: ' + args.join(' '))
  process.exit(2)
}
`,
  )

  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-refurbish-run.mjs'),
      '--deckkit',
      'missing-deckkit',
      '--source',
      source,
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
  const summary = readRefurbishSummary(result)
  const readinessPath = join(runDir, 'catalog-readiness.json')
  const readiness = JSON.parse(readFileSync(readinessPath, 'utf8'))

  assert.equal(summary.status, 'failed')
  assert.equal(summary.error.phase, 'refurbish-plan')
  assert.equal(summary.artifacts.readiness, readinessPath)
  assert.equal(readiness.schemaVersion, 'pptx-nova-catalog-readiness/v1')
  assert.equal(readiness.status, 'fail')
  assert.equal(readiness.agentGate.passed, false)
  assert.equal(existsSync(output), false)
})

test('refurbish runner persists catalog readiness before any xdoc command starts', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-refurbish-readiness-before-xdoc-'))
  const source = join(root, 'source.pptx')
  const output = join(root, 'out.pptx')
  const runDir = join(root, 'run')
  writeFileSync(source, 'fake pptx')

  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-refurbish-run.mjs'),
      '--deckkit',
      'consulting-dark',
      '--explicit',
      '--source',
      source,
      '--output',
      output,
      '--run-dir',
      runDir,
      '--xdoc-bin',
      join(root, 'missing-xdoc'),
      '--json-full',
    ],
    1,
  )
  const summary = JSON.parse(result.stdout)
  assert.equal(summary.schemaVersion, 'pptx-nova-refurbish-run/v1')
  const readinessPath = join(runDir, 'catalog-readiness.json')
  const phaseNames = summary.phases.map((phase) => phase.name)

  assert.equal(summary.status, 'failed')
  assert.equal(summary.artifacts.readiness, readinessPath)
  const readiness = JSON.parse(readFileSync(readinessPath, 'utf8'))
  assert.equal(readiness.status, 'pass')
  assert.equal(readiness.explicitException, false)
  assert.ok(phaseNames.includes('catalog-readiness-evidence'))
  assert.ok(phaseNames.includes('xdoc-capability-probe'))
  assert.ok(
    phaseNames.indexOf('catalog-readiness-evidence') < phaseNames.indexOf('xdoc-capability-probe'),
  )
  assert.equal(existsSync(output), false)
})

test('refurbish runner publishes one SHA-256-bound multipart delivery bundle', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-refurbish-run-'))
  const source = join(root, 'source.pptx')
  const output = join(root, 'out.pptx')
  const runDir = join(root, 'run')
  writeFileSync(source, 'fake pptx')
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : ''
}
const identity = (path) => {
  const bytes = readFileSync(path)
  return { path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
const slideCount = Number(process.env.FAKE_SLIDE_COUNT || 48)
const intentionalEmpty = process.env.FAKE_INTENTIONAL_EMPTY === '1'
const inspect = {
  schemaVersion: 'pptx-inspect/v1',
  presentation: { slideCount, size: { width: '10in', height: '5.625in' } },
  slides: Array.from({ length: slideCount }, (_, index) => ({
    index,
    partName: 'ppt/slides/slide' + (index + 1) + '.xml',
    shapes: intentionalEmpty && index === 0
      ? [{
          id: 101,
          name: 'Slide Number Placeholder',
          shapeType: 'placeholder',
          textPreview: '',
          bbox: { xEmu: '100', yEmu: '100', wEmu: '1000', hEmu: '500' },
          placeholder: { type: 'sldNum', idx: 12 }
        }]
      : []
  }))
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
  status: 'success',
  outcome: 'passed',
  summary: {
    errorCount: 0,
    warningCount: 0,
    baselineSlideCount: slideCount,
    targetSlideCount: slideCount,
    slideCountMatches: true
  },
  issues: []
}
const nativeFailureKind = process.env.FAKE_NATIVE_FAILURE_KIND || ''
const nativeFailureIssues = nativeFailureKind
  ? Array.from({ length: 2 }, (_, index) => ({
      kind: nativeFailureKind,
      severity: 'medium',
      slideIndex: 0,
      shapeId: index + 1,
      shapeName: 'Shape ' + (index + 1),
      message: 'native failure fixture'
    }))
  : []
const nativeFailureVisionDiff = nativeFailureKind
  ? {
      schemaVersion: 'pptx-vision-diff/v1',
      status: 'success',
      summary: {
        byClass: {
          new: { high: 0, medium: nativeFailureIssues.length, low: 0 },
          changed: { high: 0, medium: 0, low: 0 },
          worsened: { high: 0, medium: 0, low: 0 }
        }
      },
      newIssues: nativeFailureIssues,
      changedIssues: [],
      worsenedIssues: []
    }
  : null
const print = (value) => process.stdout.write(JSON.stringify(value))

if (args[0] === 'schema') {
  print({
    version: '9.9.9 (fake)',
    schemaVersion: 'cli-agent/v1',
    capabilities: { schemaVersion: 'capabilities/v1' },
    commands: {
      pptx: {
        subcommands: {
          inspect: {}, apply: {}, 'refurbish-skin': {}, 'chrome-detect': {},
          'vision-diff': {}, 'refurbish-audit': {}, preview: {}, diff: {}
        },
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
  if (nativeFailureVisionDiff) {
    print({
      schemaVersion: 'pptx-refurbish-skin/v1',
      status: 'success',
      outcome: 'failed',
      gate: {
        passed: false,
        auditStatus: 'passed',
        newHighIssues: 0,
        newMediumIssues: nativeFailureIssues.length
      },
      steps: [
        { name: 'chrome-remove', status: 'success' },
        { name: 'skin-background', status: 'success' },
        { name: 'chrome-apply', status: 'success' },
        { name: 'remap-theme', status: 'success' }
      ],
      reports: { visionDiff: nativeFailureVisionDiff, audit }
    })
    process.exit(2)
  }
  print({
    schemaVersion: 'pptx-refurbish-skin/v1',
    status: 'success',
    outcome: 'passed',
    gate: { passed: true, newHighIssues: 0, newMediumIssues: 0 },
    reports: { visionDiff, audit }
  })
} else if (args[0] === 'pptx' && args[1] === 'chrome-detect') {
  print({ schemaVersion: 'pptx-chrome-detect/v1', status: 'success', slides: [] })
} else if (args[0] === 'pptx' && args[1] === 'apply') {
  const output = valueAfter('-o')
  const patchPath = valueAfter('-p')
  const patchOps = patchPath ? JSON.parse(readFileSync(patchPath, 'utf8')).ops : []
  const opResults = patchOps.map((op, opIndex) => ({
    opIndex, op: op.op, status: 'success', changedParts: [], resolvedSelectors: []
  }))
  if (args.includes('--dry-run')) {
    print({
      schemaVersion: 'pptx-dry-run/v1', status: 'success', warnings: [],
      changedParts: [], opResults, visualRisks: [], wouldWrite: true, output
    })
  } else {
    writeFileSync(output, 'fallback candidate pptx')
    print({
      schemaVersion: 'pptx-apply/v1', status: 'success', warnings: [],
      changedParts: ['ppt/presentation.xml'], opResults, visualRisks: [], output
    })
  }
} else if (args[0] === 'pptx' && args[1] === 'vision-diff') {
  print(visionDiff)
} else if (args[0] === 'pptx' && args[1] === 'refurbish-audit') {
  print(audit)
} else if (args[0] === 'pptx' && args[1] === 'preview') {
  const outputDir = valueAfter('--output-dir')
  const contactSheet = valueAfter('--contact-output')
  mkdirSync(outputDir, { recursive: true })
  const pages = Array.from({ length: slideCount }, (_, index) => {
    const path = outputDir + '/slide-' + String(index + 1).padStart(3, '0') + '.png'
    writeFileSync(path, 'png')
    return { path, status: 'success', width: 100, height: 56, byteLength: 3 }
  })
  writeFileSync(contactSheet, 'contact')
  print({
    schemaVersion: 'pptx-preview/v1',
    status: 'success',
    pages,
    contactSheet: { path: contactSheet, width: 100, height: 56, byteLength: 7 }
  })
} else if (args[0] === 'pptx' && args[1] === 'diff') {
  if (process.env.FAKE_CORRUPT_DRY_RUN_PATH) {
    writeFileSync(process.env.FAKE_CORRUPT_DRY_RUN_PATH, '{ invalid json')
  }
  print({
    schemaVersion: 'pptx-diff/v1',
    status: 'success',
    agentGate: { semanticStatus: 'pass' },
    summary: { reliableChanges: 0, uncertainChanges: 0, unsupportedRegions: 0 },
    slides: []
  })
} else if (args[0] === 'pptx' && args[1] === 'contact-diff') {
  if (process.env.FAKE_XDOC_LOG) {
    appendFileSync(process.env.FAKE_XDOC_LOG, JSON.stringify({
      selector: valueAfter('--slides'),
      dpi: Number(valueAfter('--dpi'))
    }) + '\\n')
  }
  const selector = valueAfter('--slides')
  const dpi = Number(valueAfter('--dpi')) || 72
  if (process.env.FAKE_RETRY_COMPARE === '1' && dpi === 192) {
    print({
      schemaVersion: 'pptx-contact-diff/v1',
      status: 'error',
      error: {
        kind: 'render_error', code: 'render_error', stage: 'render', retryable: true,
        requestedDpi: 192, pairCount: slideCount, reason: 'render-resource-limit'
      }
    })
    process.exit(2)
  }
  const selectedSlides = selector
    ? (() => {
        const [start, end] = selector.split('-').map(Number)
        return Array.from({ length: end - start + 1 }, (_, index) => start + index)
      })()
    : Array.from({ length: slideCount }, (_, index) => index + 1)
  const scopeMode = selector ? 'selected-slides' : 'all-slides'
  const agentReviewOutput = process.env.XDOC_CONTACT_DIFF_AGENT_REVIEW_OUTPUT || ''
  const agentReviewDpi = Number(process.env.XDOC_CONTACT_DIFF_AGENT_REVIEW_LAYOUT_DPI || 0)
  writeFileSync(valueAfter('--output'), 'contact diff png')
  if (agentReviewOutput) writeFileSync(agentReviewOutput, 'agent review png')
  print({
    schemaVersion: 'pptx-contact-diff/v1',
    status: 'success',
    baseline: identity(valueAfter('--source')),
    target: identity(valueAfter('--candidate')),
    baselinePath: valueAfter('--source'),
    targetPath: valueAfter('--candidate'),
    outputPath: valueAfter('--output'),
    summary: { pairCount: selectedSlides.length, scopeMode, dpi },
    scope: { requested: selector || null, slides: selectedSlides, basis: 'source-slides' },
    agentGate: { passed: true, status: 'pass', scopeMode, pairCount: selectedSlides.length },
    render: { path: valueAfter('--output'), width: 100, height: 56, dpi },
    agentReview: agentReviewOutput ? {
      status: 'success', path: agentReviewOutput, renderDpi: dpi, layoutDpi: agentReviewDpi,
      width: 50, height: 28, cacheReuse: 'same-render-dpi-page-cache'
    } : undefined
  })
} else {
  process.stderr.write('unexpected fake xdoc command: ' + args.join(' '))
  process.exit(2)
}
`,
  )

  const result = runNode(
    [
      skillPath('scripts/pptx-nova-refurbish-run.mjs'),
      '--deckkit',
      'mckinsey-blue',
      '--explicit',
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
      '--contact-diff',
      '--json',
    ],
    { env: { ...process.env, FAKE_XDOC_LOG: join(root, 'contact-diff.log') } },
  )
  const compactResult = readRefurbishResult(result)
  const summary = JSON.parse(
    readFileSync(join(compactResult.runDir, 'refurbish-run-summary.json'), 'utf8'),
  )
  const phaseNames = summary.phases.map((phase) => phase.name)
  const gateNames = summary.gates.map((gate) => gate.name)
  const sourceInspect = summary.phases.find((phase) => phase.name === 'source-inspect')
  const nativePhase = summary.phases.find((phase) => phase.name === 'native-refurbish-skin')
  const semanticDiffPhase = summary.phases.find((phase) => phase.name === 'pptx-semantic-diff')
  const comparePhase = summary.phases.find((phase) => phase.name === 'refurbish-compare')
  const stableSourceSnapshot = join(runDir, 'source.pptx')

  assert.equal(summary.status, 'needs-human-review')
  assert.equal(compactResult.status, 'needs-human-review')
  assert.equal(compactResult.performance.render.compareRenderInvocations, 3)
  assert.equal(compactResult.performance.render.comparePartCount, 3)
  assert.equal(compactResult.performance.render.compareRetryInvocations, 0)
  assert.equal(compactResult.performance.render.renderInvocationsSaved, 3)
  assert.equal(compactResult.performance.budget.withinBaseline, true)
  assert.equal(compactResult.performance.budget.withinRetryBudget, true)
  assert.ok(compactResult.performance.render.estimatedRenderedPixels > 0)
  assert.equal(compactResult.performance.budget.maximumRetryInvocations, 3)
  assert.equal(compactResult.performance.budget.maximumTotalInvocations, 6)
  assert.equal(compactResult.performance.budget.withinPixelBaseline, true)
  assert.equal(compactResult.performance.budget.withinPixelRetryBudget, true)
  assert.equal(compactResult.performance.render.contactDiffReused, true)
  for (const duplicate of [
    'compareRenderInvocations',
    'comparePartCount',
    'compareRetryInvocations',
    'renderInvocationsSaved',
    'estimatedRenderedPixels',
    'contactDiffReused',
    'renderBudget',
  ]) {
    assert.equal(duplicate in compactResult.performance, false, duplicate)
  }
  assert.equal('performance' in compactResult.agentSummary, false)
  assert.ok(compactResult.performance.totalMs > 0)
  assert.ok(compactResult.performance.renderMs > 0)
  assert.ok(compactResult.performance.renderShare > 0)
  assert.ok(compactResult.performance.topPhases.length > 0)
  assert.ok(result.stdout.length < readFileSync(summary.artifacts.summary, 'utf8').length)
  assert.equal(existsSync(output), true)
  assert.equal(existsSync(join(runDir, 'pptx-diff.json')), true)
  assert.equal(existsSync(join(runDir, 'layout-source.json')), true)
  assert.equal(existsSync(join(runDir, 'review-policy-evaluation.json')), true)
  assert.equal(existsSync(join(runDir, 'finding-analysis.json')), true)
  assert.equal(existsSync(join(runDir, 'catalog-readiness.json')), true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare.json')), true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare-gate.json')), true)
  assert.equal(existsSync(join(runDir, 'contact-diff.json')), true)
  const contactDiff = JSON.parse(readFileSync(join(runDir, 'contact-diff.json'), 'utf8'))
  assert.equal(contactDiff.reuse.status, 'reused')
  assert.equal(contactDiff.reuse.renderInvocationsSaved, 3)
  assert.deepEqual(
    contactDiff.parts.map((part) => basename(part.path)),
    ['contact-diff-01.png', 'contact-diff-02.png', 'contact-diff-03.png'],
  )
  assert.equal(
    contactDiff.parts.every((part) => existsSync(part.path)),
    true,
  )
  assert.equal(
    contactDiff.parts.every((part) =>
      readFileSync(part.path).equals(readFileSync(part.reusedFrom.path)),
    ),
    true,
  )
  assert.deepEqual(
    summary.artifacts.contactDiffParts,
    contactDiff.parts.map((part) => part.path),
  )
  assert.equal(
    contactDiff.parts.every((part) => {
      const partReport = JSON.parse(readFileSync(part.reportPath, 'utf8'))
      return partReport.outputPath === part.path && partReport.render.path === part.path
    }),
    true,
  )
  assert.deepEqual(
    readFileSync(join(root, 'contact-diff.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .sort((a, b) => a.selector.localeCompare(b.selector, 'en', { numeric: true })),
    [
      { selector: '1-20', dpi: 192 },
      { selector: '21-40', dpi: 192 },
      { selector: '41-48', dpi: 192 },
    ],
  )
  const compareGate = JSON.parse(readFileSync(join(runDir, 'refurbish-compare-gate.json'), 'utf8'))
  assert.equal(compareGate.finalBinding.status, 'bound')
  assert.equal(compareGate.finalBinding.publishedFinal.path, output)
  assert.equal(compareGate.finalBinding.publishedFinal.sha256, fileIdentity(output).sha256)
  assert.equal(summary.artifacts.pptxDiff, join(runDir, 'pptx-diff.json'))
  assert.equal(summary.artifacts.readiness, join(runDir, 'catalog-readiness.json'))
  assert.equal(summary.artifacts.deliveryReadiness, null)
  assert.equal(summary.artifacts.refurbishCompare, null)
  assert.deepEqual(
    summary.artifacts.refurbishCompareParts,
    summary.agentSummary.artifacts.refurbishCompareParts,
  )
  assert.equal(summary.artifacts.refurbishCompareParts.length, 3)
  assert.equal(
    summary.artifacts.refurbishCompareParts.every((path) => existsSync(path)),
    true,
  )
  assert.deepEqual(compactResult.agentSummary.artifacts.refurbishAgentReviewParts, [
    'refurbish-agent-review-01.png',
    'refurbish-agent-review-02.png',
    'refurbish-agent-review-03.png',
  ])
  assert.equal(
    compactResult.agentSummary.artifacts.refurbishAgentReviewParts.every((path) =>
      existsSync(join(runDir, path)),
    ),
    true,
  )
  assert.deepEqual(
    summary.artifacts.refurbishAgentReviewParts,
    compactResult.agentSummary.artifacts.refurbishAgentReviewParts.map((path) =>
      join(runDir, path),
    ),
  )
  assert.equal(compactResult.agentSummary.nextSteps.cwd, runDir)
  assert.equal(compactResult.agentSummary.nextSteps.focusedReviewCommand, null)
  assert.equal(summary.layout.actionableRiskCount, 0)
  assert.equal(summary.layout.informationalRiskCount, 0)
  assert.equal(summary.agentSummary.layout.actionableRiskCount, 0)
  const findingAnalysis = JSON.parse(readFileSync(join(runDir, 'finding-analysis.json'), 'utf8'))
  assert.equal(findingAnalysis.schemaVersion, 'pptx-nova-finding-analysis/v1-draft')
  assert.equal(findingAnalysis.evaluation.status, 'complete')
  assert.equal(findingAnalysis.agentGate.proposedStatus, 'pass')
  assert.equal(findingAnalysis.agentGate.effectiveStatus, 'not-applied')
  assert.equal(summary.findingAnalysis.effectiveStatus, 'not-applied')
  assert.equal(summary.agentSummary.findingAnalysis.effectiveStatus, 'not-applied')
  assert.equal(summary.performance.findingAnalysisAdditionalInspectCount, 0)
  assert.equal(summary.performance.findingAnalysisAdditionalRenderCount, 0)
  assert.ok(summary.performance.findingAnalysisMs >= 0)
  const catalogReadiness = JSON.parse(readFileSync(summary.artifacts.readiness, 'utf8'))
  assert.equal(catalogReadiness.schemaVersion, 'pptx-nova-catalog-readiness/v1')
  assert.equal(catalogReadiness.status, 'pass')
  assert.equal(catalogReadiness.readiness, 'production')
  assert.equal(catalogReadiness.agentGate.passed, true)
  assert.equal(catalogReadiness.agentGate.benchmarkAvailable, true)
  assert.equal(catalogReadiness.agentGate.benchmarkEvidencePassed, true)
  assert.equal(catalogReadiness.agentGate.benchmarkGatePassed, true)
  const progressEvents = readFileSync(join(runDir, 'progress.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const stderrLines = result.stderr.trim().split('\n').filter(Boolean)
  assert.ok(stderrLines.length > 0)
  assert.ok(stderrLines.every((line) => line.startsWith('[pptx-nova] ')))
  assert.ok(
    progressEvents
      .filter((event) => event.event === 'phase-complete')
      .every((event) => Number.isFinite(event.durationMs)),
  )
  assert.ok(
    progressEvents.some(
      (event) =>
        event.event === 'phase-start' &&
        event.phase === 'source-inspect' &&
        event.executable &&
        Number.isInteger(event.argumentCount) &&
        !('command' in event),
    ),
  )
  assert.ok(
    progressEvents.some((event) => event.event === 'compare-part-start' && event.partNumber === 1),
  )
  assert.ok(
    progressEvents.some(
      (event) => event.event === 'compare-part-complete' && event.partNumber === 3,
    ),
  )
  assert.ok(sourceInspect.command.includes(process.execPath), sourceInspect.command)
  assert.ok(sourceInspect.command.includes('fake-xdoc.mjs'), sourceInspect.command)
  assert.ok(sourceInspect.command.includes(stableSourceSnapshot), sourceInspect.command)
  assert.ok(nativePhase.command.includes(stableSourceSnapshot), nativePhase.command)
  assert.ok(semanticDiffPhase.command.includes(stableSourceSnapshot), semanticDiffPhase.command)
  assert.ok(comparePhase.command.includes(join(runDir, 'candidate.pptx')), comparePhase.command)
  assert.ok(comparePhase.command.includes('--dpi 192'), comparePhase.command)
  assert.ok(phaseNames.includes('pptx-semantic-diff'))
  assert.ok(phaseNames.includes('review-policy-evaluation'))
  assert.ok(phaseNames.includes('finding-analysis-shadow'))
  assert.ok(phaseNames.includes('refurbish-compare'))
  assert.ok(phaseNames.includes('contact-diff-reuse'))
  assert.equal(phaseNames.includes('contact-diff'), false)
  assert.ok(phaseNames.includes('refurbish-compare-delivery'))
  assert.ok(gateNames.includes('pptx-semantic-diff'))
  assert.ok(gateNames.includes('refurbish-compare-delivery'))
  assert.ok(gateNames.includes('published-output-binding'))
  assert.equal(phaseNames.includes('publish'), false)
  assert.ok(
    phaseNames.indexOf('pptx-semantic-diff') < phaseNames.indexOf('refurbish-compare-delivery'),
  )
  assert.ok(
    phaseNames.indexOf('pptx-semantic-diff') < phaseNames.indexOf('review-policy-evaluation'),
  )
  assert.ok(
    phaseNames.indexOf('review-policy-evaluation') < phaseNames.indexOf('finding-analysis-shadow'),
  )
  assert.ok(phaseNames.indexOf('finding-analysis-shadow') < phaseNames.indexOf('fidelity-gate'))
  assert.equal(
    phaseNames.filter((name) => name === 'source-inspect' || name === 'final-inspect').length,
    2,
  )
  assert.ok(
    phaseNames.indexOf('refurbish-compare') < phaseNames.indexOf('refurbish-compare-delivery'),
  )

  const fallbackSource = join(root, 'fallback-source.pptx')
  const fallbackOutput = join(root, 'fallback-out.pptx')
  const fallbackRunDir = join(root, 'fallback-run')
  writeFileSync(fallbackSource, 'fallback fake pptx')
  const fallbackResult = runNode([
    skillPath('scripts/pptx-nova-refurbish-run.mjs'),
    '--deckkit',
    'mckinsey-blue',
    '--explicit',
    '--source',
    fallbackSource,
    '--output',
    fallbackOutput,
    '--run-dir',
    fallbackRunDir,
    '--route',
    'fallback',
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])
  const fallbackSummary = readRefurbishSummary(fallbackResult)
  const fallbackPhases = fallbackSummary.phases.map((phase) => phase.name)
  const fallbackAnalysis = JSON.parse(
    readFileSync(fallbackSummary.artifacts.findingAnalysis, 'utf8'),
  )
  assert.equal(fallbackSummary.route.executed, 'fallback-patch')
  const fallbackCapabilityPhase = fallbackSummary.phases.find(
    (phase) => phase.name === 'xdoc-capability-probe',
  )
  assert.equal(fallbackCapabilityPhase.command.includes('--require-command'), false)
  assert.equal(fallbackCapabilityPhase.command.includes('--require-native-deckkit'), false)
  assert.equal(
    fallbackSummary.warnings.some((warning) =>
      warning.startsWith('Undisclosed refurbish capabilities:'),
    ),
    false,
  )
  assert.ok(fallbackPhases.includes('dry-run'))
  assert.ok(fallbackPhases.includes('apply'))
  assert.equal(
    fallbackAnalysis.evaluation.status,
    'complete',
    JSON.stringify(fallbackAnalysis.evaluation),
  )
  assert.equal(fallbackAnalysis.agentGate.effectiveStatus, 'not-applied')
  assert.equal(
    fallbackAnalysis.evaluation.diagnostics.some(
      (item) => item.code === 'finding-analysis-operation-evidence-missing',
    ),
    false,
  )
  assert.ok(
    fallbackPhases.indexOf('pptx-semantic-diff') <
      fallbackPhases.indexOf('review-policy-evaluation'),
  )
  assert.ok(
    fallbackPhases.indexOf('finding-analysis-shadow') < fallbackPhases.indexOf('fidelity-gate'),
  )
  assert.equal(existsSync(fallbackOutput), true)
  const fallbackSourceSnapshot = join(fallbackRunDir, 'source.pptx')
  for (const phaseName of [
    'source-inspect',
    'chrome-detect',
    'fallback-patch',
    'dry-run',
    'apply',
    'vision-diff-command',
    'refurbish-audit-command',
    'pptx-semantic-diff',
  ]) {
    const phase = fallbackSummary.phases.find((item) => item.name === phaseName)
    assert.ok(phase.command.includes(fallbackSourceSnapshot), `${phaseName}: ${phase.command}`)
  }
  const fallbackPlan = JSON.parse(readFileSync(fallbackSummary.artifacts.plan, 'utf8'))
  assert.equal(fallbackPlan.route, 'fallback-patch')
  assert.equal(fallbackPlan.routeSelection.requested, 'fallback')
  assert.equal(
    fallbackPlan.commands.some((command) => command.name === 'native-refurbish-skin'),
    false,
  )
  assert.equal(fallbackPlan.requiredGates.includes('fallback-patch-report'), true)

  const recoverableSource = join(root, 'recoverable-source.pptx')
  const recoverableOutput = join(root, 'recoverable-out.pptx')
  const recoverableRunDir = join(root, 'recoverable-run')
  writeFileSync(recoverableSource, 'recoverable fake pptx')
  const recoverableResult = runNode(
    [
      skillPath('scripts/pptx-nova-refurbish-run.mjs'),
      '--deckkit',
      'mckinsey-blue',
      '--explicit',
      '--source',
      recoverableSource,
      '--output',
      recoverableOutput,
      '--run-dir',
      recoverableRunDir,
      '--route',
      'auto',
      '--xdoc-bin',
      fakeXdoc,
      '--prompt-text',
      'Refurbish this deck and provide feedback',
      '--json',
    ],
    {
      env: {
        ...process.env,
        FAKE_SLIDE_COUNT: '1',
        FAKE_NATIVE_FAILURE_KIND: 'low-contrast-text',
      },
    },
  )
  const recoverableCompact = readRefurbishResult(recoverableResult)
  const recoverableSummary = readRefurbishSummary(recoverableResult)
  const recoverablePlan = JSON.parse(readFileSync(recoverableSummary.artifacts.plan, 'utf8'))
  const recoverableNativePhase = recoverableSummary.phases.find(
    (phase) => phase.name === 'native-refurbish-skin',
  )

  assert.equal(recoverableSummary.route.initialPlan, 'native-skin-first')
  assert.equal(recoverableSummary.route.planned, 'fallback-patch')
  assert.equal(recoverableSummary.route.executed, 'fallback-patch')
  assert.equal(recoverableSummary.recovery.status, 'recovered')
  assert.equal(recoverableSummary.recovery.reasonCode, 'native-theme-contrast-only')
  assert.deepEqual(recoverableSummary.recovery.findings.byKind, {
    'low-contrast-text': 2,
  })
  assert.equal(recoverableNativePhase.status, 'recovered')
  assert.equal(recoverableNativePhase.recoveredBy, 'fallback-patch')
  assert.equal(existsSync(recoverableSummary.artifacts.nativeReport), true)
  assert.equal(recoverablePlan.route, 'fallback-patch')
  assert.equal(recoverablePlan.routeSelection.requested, 'auto')
  assert.equal(recoverablePlan.routeSelection.initialSelected, 'native-skin-first')
  assert.equal(
    recoverablePlan.commands.some((command) => command.name === 'generate-fallback-patch'),
    true,
  )
  assert.deepEqual(recoverableCompact.requiredReferences, recoverablePlan.requiredReferences)
  assert.equal(recoverableCompact.agentSummary.routeDecision.initialPlan, 'native-skin-first')
  assert.equal(recoverableCompact.agentSummary.routeDecision.planned, 'fallback-patch')
  assert.equal(recoverableCompact.agentSummary.operationAudit.plannedOps, 4)
  assert.equal(recoverableCompact.agentSummary.operationAudit.emittedOps, 4)
  assert.equal(recoverableCompact.agentSummary.operationAudit.execution.apply.reportedOps, 4)
  assert.equal(recoverableCompact.agentSummary.operationAudit.semanticDiff.reliableChanges, 0)
  assert.match(
    recoverableCompact.agentSummary.nextSteps.visualReviewCommand,
    /pptx-nova-visual-review\.mjs/,
  )
  for (const check of [
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
    'targetDeckkitApplied',
  ]) {
    assert.match(
      recoverableCompact.agentSummary.nextSteps.visualReviewCommand,
      new RegExp(`${check}=pass`),
    )
  }
  assert.match(
    recoverableCompact.agentSummary.nextSteps.feedbackGateCommand,
    /pptx-nova-feedback-gate\.mjs/,
  )
  assert.ok(recoverableCompact.performance.artifactBytesByRole.json.bytes > 0)
  assert.match(
    recoverableCompact.agentSummary.agentContextRisk.guidance.join(' '),
    /do not expand full opResults arrays/,
  )

  const nonRecoverableSource = join(root, 'non-recoverable-source.pptx')
  const nonRecoverableOutput = join(root, 'non-recoverable-out.pptx')
  const nonRecoverableRunDir = join(root, 'non-recoverable-run')
  writeFileSync(nonRecoverableSource, 'non-recoverable fake pptx')
  const nonRecoverableResult = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-refurbish-run.mjs'),
      '--deckkit',
      'mckinsey-blue',
      '--explicit',
      '--source',
      nonRecoverableSource,
      '--output',
      nonRecoverableOutput,
      '--run-dir',
      nonRecoverableRunDir,
      '--route',
      'auto',
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    1,
    {
      env: {
        ...process.env,
        FAKE_SLIDE_COUNT: '1',
        FAKE_NATIVE_FAILURE_KIND: 'geometry-overlap',
      },
    },
  )
  const nonRecoverableCompact = readRefurbishResult(nonRecoverableResult)
  const nonRecoverableSummary = readRefurbishSummary(nonRecoverableResult)
  assert.equal(nonRecoverableSummary.recovery.status, 'not-eligible')
  assert.equal(nonRecoverableSummary.recovery.reasonCode, 'native-failure-not-fallback-eligible')
  assert.equal(
    nonRecoverableSummary.phases.some((phase) => phase.name === 'fallback-patch'),
    false,
  )
  assert.equal(existsSync(nonRecoverableOutput), false)
  assert.match(
    nonRecoverableCompact.agentSummary.nextSteps.recoveryCommand,
    /"--run-dir" "<new-empty-run-dir>"/,
  )
  assert.doesNotMatch(
    nonRecoverableCompact.agentSummary.nextSteps.recoveryCommand,
    new RegExp(nonRecoverableRunDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  )
  assert.match(
    nonRecoverableCompact.agentSummary.nextSteps.recoveryRules.join(' '),
    /never reuse the failed run directory/,
  )

  const shadowFailureSource = join(root, 'shadow-failure-source.pptx')
  const shadowFailureOutput = join(root, 'shadow-failure-out.pptx')
  const shadowFailureRunDir = join(root, 'shadow-failure-run')
  writeFileSync(shadowFailureSource, 'shadow failure fake pptx')
  const shadowFailureResult = runNode(
    [
      skillPath('scripts/pptx-nova-refurbish-run.mjs'),
      '--deckkit',
      'mckinsey-blue',
      '--explicit',
      '--source',
      shadowFailureSource,
      '--output',
      shadowFailureOutput,
      '--run-dir',
      shadowFailureRunDir,
      '--route',
      'fallback',
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    {
      env: {
        ...process.env,
        FAKE_CORRUPT_DRY_RUN_PATH: join(shadowFailureRunDir, 'dry-run.json'),
      },
    },
  )
  const shadowFailureSummary = readRefurbishSummary(shadowFailureResult)
  const shadowFailureAnalysis = JSON.parse(
    readFileSync(shadowFailureSummary.artifacts.findingAnalysis, 'utf8'),
  )
  assert.equal(shadowFailureSummary.status, 'needs-human-review')
  assert.equal(shadowFailureSummary.machineGatesPassed, true)
  assert.equal(shadowFailureAnalysis.evaluation.status, 'failed')
  assert.equal(shadowFailureAnalysis.agentGate.effectiveStatus, 'not-applied')
  assert.equal(
    shadowFailureAnalysis.evaluation.errors[0].code,
    'finding-analysis-artifact-unreadable',
  )
  assert.equal(existsSync(shadowFailureOutput), true)

  const singleSource = join(root, 'single-source.pptx')
  const singleOutput = join(root, 'single-out.pptx')
  const singleRunDir = join(root, 'single-run')
  writeFileSync(singleSource, 'single fake pptx')
  const singleResult = runNode(
    [
      skillPath('scripts/pptx-nova-refurbish-run.mjs'),
      '--deckkit',
      'mckinsey-blue',
      '--explicit',
      '--source',
      singleSource,
      '--output',
      singleOutput,
      '--run-dir',
      singleRunDir,
      '--route',
      'native',
      '--xdoc-bin',
      fakeXdoc,
      '--contact-diff',
      '--json',
    ],
    { env: { ...process.env, FAKE_SLIDE_COUNT: '1', FAKE_RETRY_COMPARE: '1' } },
  )
  const singleSummary = readRefurbishSummary(singleResult)

  assert.equal(
    singleSummary.artifacts.refurbishCompare,
    join(singleRunDir, 'refurbish-compare.png'),
  )
  assert.deepEqual(singleSummary.artifacts.refurbishCompareParts, [])
  assert.equal(existsSync(singleSummary.artifacts.refurbishCompare), true)
  assert.equal(existsSync(singleSummary.artifacts.contactDiff), true)
  const singleContactDiff = JSON.parse(
    readFileSync(singleSummary.artifacts.contactDiffReport, 'utf8'),
  )
  assert.equal(singleContactDiff.reuse.status, 'reused')
  assert.equal(singleContactDiff.outputPath, singleSummary.artifacts.contactDiff)
  assert.equal(singleSummary.performance.render.compareRenderInvocations, 2)
  assert.equal(singleSummary.performance.comparePartCount, 1)
  assert.equal(singleSummary.performance.compareRetryInvocations, 1)
  assert.equal(singleSummary.performance.budget.withinBaseline, false)
  assert.equal(singleSummary.performance.budget.withinRetryBudget, true)
  assert.equal(singleSummary.performance.budget.withinPixelBaseline, false)
  assert.equal(singleSummary.performance.budget.withinPixelRetryBudget, true)
  assert.equal(singleSummary.performance.render.renderInvocationsSaved, 1)
  assert.equal(
    readFileSync(singleSummary.artifacts.contactDiff).equals(
      readFileSync(singleSummary.artifacts.refurbishCompare),
    ),
    true,
  )

  const unreviewedSource = join(root, 'unreviewed-source.pptx')
  const unreviewedOutput = join(root, 'unreviewed-out.pptx')
  const unreviewedRunDir = join(root, 'unreviewed-run')
  writeFileSync(unreviewedSource, 'unreviewed fake pptx')
  const unreviewedResult = runNode(
    [
      skillPath('scripts/pptx-nova-refurbish-run.mjs'),
      '--deckkit',
      'mckinsey-blue',
      '--explicit',
      '--source',
      unreviewedSource,
      '--output',
      unreviewedOutput,
      '--run-dir',
      unreviewedRunDir,
      '--route',
      'native',
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    { env: { ...process.env, FAKE_SLIDE_COUNT: '1', FAKE_INTENTIONAL_EMPTY: '1' } },
  )
  const unreviewedSummary = readRefurbishSummary(unreviewedResult)
  const unreviewedAnalysis = JSON.parse(
    readFileSync(unreviewedSummary.artifacts.findingAnalysis, 'utf8'),
  )
  assert.equal(unreviewedSummary.status, 'needs-human-review')
  assert.equal(unreviewedSummary.machineGatesPassed, true)
  assert.equal(unreviewedSummary.layout.actionableRiskCount, 1)
  assert.equal(unreviewedAnalysis.agentGate.proposedStatus, 'warn')
  assert.equal(unreviewedAnalysis.agentGate.effectiveStatus, 'not-applied')
  assert.equal(existsSync(unreviewedOutput), true)

  const reviewedSource = join(root, 'reviewed-source.pptx')
  const reviewedOutput = join(root, 'reviewed-out.pptx')
  const reviewedRunDir = join(root, 'reviewed-run')
  const reviewPolicy = join(root, 'review-policy.json')
  writeFileSync(reviewedSource, 'reviewed fake pptx')
  writeJson(reviewPolicy, {
    schemaVersion: 'pptx-nova-review-policy/v1',
    bindings: { sourceSha256: fileIdentity(reviewedSource).sha256 },
    reviewedFindings: [
      {
        id: 'slide-1-intentional-empty-sldnum',
        code: 'empty-placeholder',
        disposition: 'accepted',
        target: {
          slideIndex: 0,
          part: 'ppt/slides/slide1.xml',
          shapeId: 101,
          placeholder: { type: 'sldNum', idx: 12 },
        },
        expected: { textEmpty: true },
        reason: 'This fixture intentionally preserves an empty page-number placeholder.',
      },
    ],
  })
  const reviewedResult = runNode(
    [
      skillPath('scripts/pptx-nova-refurbish-run.mjs'),
      '--deckkit',
      'mckinsey-blue',
      '--explicit',
      '--source',
      reviewedSource,
      '--output',
      reviewedOutput,
      '--run-dir',
      reviewedRunDir,
      '--route',
      'native',
      '--xdoc-bin',
      fakeXdoc,
      '--review-policy',
      reviewPolicy,
      '--json',
    ],
    {
      env: {
        ...process.env,
        FAKE_SLIDE_COUNT: '1',
        FAKE_INTENTIONAL_EMPTY: '1',
      },
    },
  )
  const reviewedSummary = readRefurbishSummary(reviewedResult)
  const reviewedPhases = reviewedSummary.phases.map((phase) => phase.name)
  const reviewedFidelity = reviewedSummary.gates.find((gate) => gate.name === 'fidelity-gate')

  assert.equal(reviewedSummary.layout.rawActionableRiskCount, 1)
  assert.equal(reviewedSummary.layout.reviewedRiskCount, 1)
  assert.equal(reviewedSummary.layout.actionableRiskCount, 0)
  assert.equal(reviewedSummary.layout.actionableSlideCount, 0)
  assert.equal(reviewedSummary.layout.reviewPolicyStatus, 'pass')
  assert.equal(
    reviewedSummary.layout.appliedReviews[0].reviewId,
    'slide-1-intentional-empty-sldnum',
  )
  assert.equal(reviewedFidelity.appliedReviews, 1)
  assert.equal(existsSync(reviewedSummary.artifacts.reviewPolicy), true)
  const reviewedAnalysis = JSON.parse(
    readFileSync(reviewedSummary.artifacts.findingAnalysis, 'utf8'),
  )
  const reviewedEvaluation = JSON.parse(
    readFileSync(reviewedSummary.artifacts.reviewPolicyEvaluation, 'utf8'),
  )
  const reviewedFidelityReport = JSON.parse(
    readFileSync(reviewedSummary.artifacts.fidelityGate, 'utf8'),
  )
  assert.deepEqual(reviewedFidelityReport.reviewPolicy, reviewedEvaluation)
  assert.equal(reviewedAnalysis.findings[0].rawFinding.code, 'empty-placeholder')
  assert.equal(reviewedAnalysis.findings[0].decision.disposition, 'review')
  assert.equal(reviewedAnalysis.findings[0].review.status, 'accepted')
  assert.equal(reviewedAnalysis.agentGate.proposedStatus, 'pass')
  assert.equal(reviewedAnalysis.agentGate.effectiveStatus, 'not-applied')
  assert.ok(
    reviewedPhases.indexOf('pptx-semantic-diff') <
      reviewedPhases.indexOf('review-policy-evaluation'),
  )
  assert.ok(
    reviewedPhases.indexOf('review-policy-evaluation') <
      reviewedPhases.indexOf('finding-analysis-shadow'),
  )
  assert.ok(
    reviewedPhases.indexOf('finding-analysis-shadow') < reviewedPhases.indexOf('fidelity-gate'),
  )
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
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : ''
}
const identity = (path) => {
  const bytes = readFileSync(path)
  return { path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
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
    status: 'success',
    outcome: 'passed',
    gate: { passed: true, newHighIssues: 0, newMediumIssues: 0 },
    reports: {
      visionDiff: { schemaVersion: 'pptx-vision-diff/v1', status: 'success', summary: { byClass: { new: { high: 0, medium: 0, low: 0 }, changed: { high: 0, medium: 0, low: 0 } } } },
      audit: { schemaVersion: 'pptx-refurbish-audit/v1', status: 'success', outcome: 'passed', summary: { errorCount: 0, warningCount: 0, sourceSlideCount: 1, finalSlideCount: 1, slideCountMatches: true }, issues: [] }
    }
  })
} else if (args[0] === 'pptx' && args[1] === 'preview') {
  const outputDir = valueAfter('--output-dir')
  const contactSheet = valueAfter('--contact-output')
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
      '--explicit',
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
  const summary = readRefurbishSummary(result)
  const phaseNames = summary.phases.map((phase) => phase.name)

  assert.equal(summary.status, 'failed')
  assert.equal(summary.error.phase, 'refurbish-compare')
  assert.equal(readFileSync(output, 'utf8'), 'original final pptx')
  assert.equal(phaseNames.includes('refurbish-compare'), true)
  assert.equal(phaseNames.includes('refurbish-compare-delivery'), false)
  assert.equal(phaseNames.includes('publish'), false)
})

test('translation runner finalizes once and reuses compare evidence for contact aliases', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-run-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const units = join(root, 'units.json')
  const translations = join(root, 'translations.json')
  const output = join(root, 'out.pptx')
  const runDir = join(root, 'run')
  const log = join(root, 'render.log')
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  writeJson(units, { schemaVersion: 'pptx-i18n-scan/v1', status: 'pass' })
  writeJson(translations, {
    schemaVersion: 'pptx-i18n-translations/v1',
    sourceLang: 'en',
    targetLang: 'de',
    translations: [],
  })
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const after = (flag) => args[args.indexOf(flag) + 1]
const identity = (path) => {
  const bytes = readFileSync(path)
  return { path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
const print = (value) => process.stdout.write(JSON.stringify(value))
if (args[0] === 'pptx' && args[1] === 'inspect') {
  print({ schemaVersion: 'pptx-inspect/v1', status: 'success', presentation: { slideCount: 21 }, slides: [] })
} else if (args[0] === 'pptx' && args[1] === 'i18n-style-diff') {
  print({ schemaVersion: 'pptx-i18n-style-diff/v1', status: 'pass', agentGate: { passed: true, blockerCount: 0 }, blockers: [] })
} else if (args[0] === 'pptx' && args[1] === 'i18n-scan') {
  print({ schemaVersion: 'pptx-i18n-scan/v1', status: 'pass', agentGate: { passed: true, blockerCount: 0 }, summary: { verifiedCount: 1 } })
} else if (args[0] === 'pptx' && args[1] === 'vision-diff') {
  print({ schemaVersion: 'pptx-vision-diff/v1', status: 'success', agentGate: { passed: true, blockerCount: 0, blockersByEvidenceClass: {} } })
} else if (args[0] === 'pptx' && args[1] === 'preview') {
  const dir = after('--output-dir')
  const contact = after('--contact-output')
  mkdirSync(dir, { recursive: true })
  const pages = Array.from({ length: 21 }, (_, index) => {
    const path = dir + '/slide-' + String(index + 1).padStart(3, '0') + '.png'
    writeFileSync(path, 'png')
    return { path, byteLength: 3, file: { path, status: 'ok', byteLength: 3, width: 100, height: 56 } }
  })
  writeFileSync(contact, 'contact')
  appendFileSync(process.env.FAKE_RENDER_LOG, JSON.stringify({ kind: 'preview', dpi: Number(after('--dpi')), candidatePrefix: process.env.XDOC_PAGE_CACHE_PREFIX }) + '\\n')
  print({ schemaVersion: 'pptx-preview/v1', status: 'success', pages, contactSheet: { path: contact, byteLength: 7, width: 100, height: 56 } })
} else if (args[0] === 'pptx' && args[1] === 'diff') {
  print({ schemaVersion: 'pptx-diff/v1', status: 'success', agentGate: { semanticStatus: 'pass' }, summary: { reliableChanges: 1 } })
} else if (args[0] === 'pptx' && args[1] === 'contact-diff') {
  const selector = after('--slides')
  const [start, end] = selector.split('-').map(Number)
  const slides = Array.from({ length: end - start + 1 }, (_, index) => start + index)
  const output = after('--output')
  const dpi = Number(after('--dpi'))
  appendFileSync(process.env.FAKE_RENDER_LOG, JSON.stringify({ kind: 'compare', selector, dpi, sourcePrefix: process.env.XDOC_SOURCE_PAGE_CACHE_PREFIX, candidatePrefix: process.env.XDOC_CANDIDATE_PAGE_CACHE_PREFIX }) + '\\n')
  writeFileSync(output, 'compare:' + selector)
  print({
    schemaVersion: 'pptx-contact-diff/v1', status: 'success',
    baseline: identity(after('--source')), target: identity(after('--candidate')),
    baselinePath: after('--source'), targetPath: after('--candidate'), outputPath: output,
    summary: { baselineSlideCount: 21, targetSlideCount: 21, pairCount: slides.length, scopeMode: 'selected-slides', dpi },
    scope: { requested: selector, slides, basis: 'baseline-slides' },
    agentGate: { passed: true, status: 'pass', scopeMode: 'selected-slides', pairCount: slides.length },
    render: { path: output, width: 100, height: 56 * slides.length, dpi }
  })
} else {
  process.stderr.write('unexpected fake xdoc command: ' + args.join(' '))
  process.exit(2)
}
`,
  )

  const result = runNode(
    [
      skillPath('scripts/pptx-nova-translation-run.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--units-file',
      units,
      '--translations',
      translations,
      '--output',
      output,
      '--run-dir',
      runDir,
      '--xdoc-bin',
      fakeXdoc,
      '--contact-diff',
      '--json',
    ],
    { env: { ...process.env, FAKE_RENDER_LOG: log } },
  )
  const compact = JSON.parse(result.stdout)
  const summary = JSON.parse(readFileSync(join(runDir, 'translation-run-summary.json'), 'utf8'))
  assert.equal(compact.schemaVersion, 'pptx-nova-translation-result/v1')
  assert.equal(compact.mode, 'translation')
  assert.equal('phases' in compact, false)
  assert.equal(compact.status, 'needs-human-review')
  assert.equal(compact.performance.render.comparePartCount, 2)
  assert.equal(compact.performance.render.compareRenderInvocations, 2)
  assert.equal(compact.performance.render.renderInvocationsSaved, 2)
  assert.equal(compact.performance.render.contactDiffReused, true)
  assert.equal(existsSync(output), true)
  assert.equal(
    summary.phases.some((phase) => phase.name === 'contact-diff'),
    false,
  )
  assert.equal(
    summary.phases.some((phase) => phase.name === 'contact-diff-reuse'),
    true,
  )
  const renderLog = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.equal(renderLog[0].kind, 'preview')
  assert.equal(renderLog[0].dpi, 192)
  assert.deepEqual(
    renderLog
      .slice(1)
      .map(({ kind, selector, dpi }) => ({ kind, selector, dpi }))
      .sort((a, b) => a.selector.localeCompare(b.selector, 'en', { numeric: true })),
    [
      { kind: 'compare', selector: '1-20', dpi: 192 },
      { kind: 'compare', selector: '21-21', dpi: 192 },
    ],
  )
  assert.ok(renderLog[0].candidatePrefix)
  assert.equal(renderLog[1].candidatePrefix, renderLog[0].candidatePrefix)
  assert.equal(renderLog[2].candidatePrefix, renderLog[0].candidatePrefix)
  assert.notEqual(renderLog[1].sourcePrefix, renderLog[0].candidatePrefix)
  const aliases = JSON.parse(readFileSync(join(runDir, 'contact-diff.json'), 'utf8'))
  assert.equal(aliases.parts.length, 2)
  assert.equal(
    aliases.parts.every((part) => existsSync(part.path)),
    true,
  )
  assert.ok(
    result.stdout.length < readFileSync(join(runDir, 'translation-run-summary.json')).length,
  )

  const fullRunDir = join(root, 'run-full')
  const fullOutput = join(root, 'out-full.pptx')
  const fullResult = runNode(
    [
      skillPath('scripts/pptx-nova-translation-run.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--units-file',
      units,
      '--translations',
      translations,
      '--output',
      fullOutput,
      '--run-dir',
      fullRunDir,
      '--xdoc-bin',
      fakeXdoc,
      '--json-full',
    ],
    { env: { ...process.env, FAKE_RENDER_LOG: log } },
  )
  const full = JSON.parse(fullResult.stdout)
  assert.equal(full.schemaVersion, 'pptx-nova-translation-run/v1')
  assert.equal(Array.isArray(full.phases), true)
  assert.equal(full.artifacts.summary, join(fullRunDir, 'translation-run-summary.json'))
})

test('translation runner routes unreviewed vision blockers to the precise reference', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-failure-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const units = join(root, 'units.json')
  const translations = join(root, 'translations.json')
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  writeJson(units, { schemaVersion: 'pptx-i18n-scan/v1', status: 'pass' })
  writeJson(translations, { schemaVersion: 'pptx-i18n-translations/v1', translations: [] })
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
const args = process.argv.slice(2)
const print = (value) => process.stdout.write(JSON.stringify(value))
if (args[1] === 'inspect') print({ status: 'success', presentation: { slideCount: 1 } })
else if (args[1] === 'i18n-style-diff') print({ schemaVersion: 'pptx-i18n-style-diff/v1', status: 'pass', agentGate: { passed: true } })
else if (args[1] === 'i18n-scan') print({ schemaVersion: 'pptx-i18n-scan/v1', status: 'pass', agentGate: { passed: true } })
else if (args[1] === 'vision-diff') print({ schemaVersion: 'pptx-vision-diff/v1', status: 'success', agentGate: { passed: false, blockerCount: 1, blockersByEvidenceClass: { 'review-only': 1 } } })
else process.exit(2)
`,
  )
  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-translation-run.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--units-file',
      units,
      '--translations',
      translations,
      '--output',
      join(root, 'out.pptx'),
      '--run-dir',
      join(root, 'run'),
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    1,
  )
  const compact = JSON.parse(result.stdout)
  assert.equal(compact.status, 'failed')
  assert.deepEqual(compact.requiredReferences, [
    {
      path: 'references/translation-mode.md',
      section: 'Visual Parity Gate',
      reason: 'Vision blockers require translation repair or a bound multi-column review.',
    },
  ])
  assert.equal(existsSync(join(root, 'out.pptx')), false)
})

test('translation runner rejects preview manifests whose slide PNGs are missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-preview-failure-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const units = join(root, 'units.json')
  const translations = join(root, 'translations.json')
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  writeJson(units, { schemaVersion: 'pptx-i18n-scan/v1', status: 'pass' })
  writeJson(translations, { schemaVersion: 'pptx-i18n-translations/v1', translations: [] })
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const after = (flag) => args[args.indexOf(flag) + 1]
const print = (value) => process.stdout.write(JSON.stringify(value))
if (args[1] === 'inspect') print({ status: 'success', presentation: { slideCount: 1 } })
else if (args[1] === 'i18n-style-diff') print({ schemaVersion: 'pptx-i18n-style-diff/v1', status: 'pass', agentGate: { passed: true } })
else if (args[1] === 'i18n-scan') print({ schemaVersion: 'pptx-i18n-scan/v1', status: 'pass', agentGate: { passed: true } })
else if (args[1] === 'vision-diff') print({ schemaVersion: 'pptx-vision-diff/v1', status: 'success', agentGate: { passed: true, blockersByEvidenceClass: {} } })
else if (args[1] === 'preview') {
  const dir = after('--output-dir')
  const contact = after('--contact-output')
  mkdirSync(dir, { recursive: true })
  writeFileSync(contact, 'contact')
  print({ schemaVersion: 'pptx-preview/v1', status: 'success', pages: [{ path: dir + '/missing.png', byteLength: 3, file: { path: dir + '/missing.png', status: 'ok', byteLength: 3, width: 100, height: 56 } }], contactSheet: { path: contact, byteLength: 7 } })
} else process.exit(2)
`,
  )
  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-translation-run.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--units-file',
      units,
      '--translations',
      translations,
      '--output',
      join(root, 'out.pptx'),
      '--run-dir',
      join(root, 'run'),
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    1,
  )
  const compact = JSON.parse(result.stdout)
  assert.equal(compact.error.phase, 'translation-preview')
  assert.equal(compact.requiredReferences[0].section, 'Visual evidence and performance')
})

test('translation runner requires the reviewed vision report to match the current finalizer evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-review-stale-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const units = join(root, 'units.json')
  const translations = join(root, 'translations.json')
  const visionDiff = join(root, 'reviewed-vision-diff.json')
  const review = join(root, 'multi-column-review.json')
  const gate = join(root, 'multi-column-review-gate.json')
  const pngPath = join(root, 'slide-001.png')
  const png = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0)
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12, 'ascii')
  png.writeUInt32BE(100, 16)
  png.writeUInt32BE(56, 20)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  writeFileSync(pngPath, png)
  writeJson(units, { schemaVersion: 'pptx-i18n-scan/v1', status: 'pass' })
  writeJson(translations, { schemaVersion: 'pptx-i18n-translations/v1', translations: [] })
  const issue = {
    kind: 'multi-column-text-layout-review',
    severity: 'medium',
    evidenceClass: 'review-only',
    slideIndex: 0,
    shapeId: 9,
  }
  const vision = {
    schemaVersion: 'pptx-vision-diff/v1',
    status: 'success',
    source,
    candidate,
    newIssues: [issue],
    worsenedIssues: [],
    agentGate: {
      passed: false,
      blockerCount: 1,
      blockersByEvidenceClass: { 'review-only': 1 },
    },
  }
  writeJson(visionDiff, vision)
  const withPrefix = (path) => `sha256:${fileIdentity(path).sha256}`
  writeJson(review, {
    schemaVersion: 'pptx-nova-multi-column-review/v1',
    candidate: { path: candidate, sha256: withPrefix(candidate) },
    visionDiff: { path: visionDiff, sha256: withPrefix(visionDiff) },
    reviews: [
      {
        slideIndex: 0,
        shapeId: 9,
        reviewer: 'human',
        decision: 'pass',
        png: { path: pngPath, sha256: withPrefix(pngPath), width: 100, height: 56 },
        checks: {
          noClipping: true,
          columnFlowReadable: true,
          noOverlap: true,
          marginsAcceptable: true,
        },
        note: 'Reviewed at full size.',
      },
    ],
  })
  runNode([
    skillPath('scripts/pptx-nova-multi-column-review-gate.mjs'),
    '--candidate',
    candidate,
    '--vision-diff',
    visionDiff,
    '--review',
    review,
    '--output',
    gate,
    '--json',
  ])
  const pathOnlyVision = {
    ...vision,
    source: '/different/source.pptx',
    candidate: '/different/candidate.pptx',
  }
  const positiveXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
const args = process.argv.slice(2)
const print = (value) => process.stdout.write(JSON.stringify(value))
if (args[1] === 'inspect') print({ status: 'success', presentation: { slideCount: 1 } })
else if (args[1] === 'i18n-style-diff') print({ schemaVersion: 'pptx-i18n-style-diff/v1', status: 'pass', agentGate: { passed: true } })
else if (args[1] === 'i18n-scan') print({ schemaVersion: 'pptx-i18n-scan/v1', status: 'pass', agentGate: { passed: true } })
else if (args[1] === 'vision-diff') process.stdout.write(${JSON.stringify(JSON.stringify(pathOnlyVision))})
else process.exit(2)
`,
  )
  const positiveRunDir = join(root, 'run-path-normalized')
  const positive = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-translation-run.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--units-file',
      units,
      '--translations',
      translations,
      '--output',
      join(root, 'out-path-normalized.pptx'),
      '--run-dir',
      positiveRunDir,
      '--xdoc-bin',
      positiveXdoc,
      '--multi-column-review-gate',
      gate,
      '--json',
    ],
    1,
  )
  assert.equal(JSON.parse(positive.stdout).error.phase, 'preview-render')
  const positiveSummary = JSON.parse(
    readFileSync(join(positiveRunDir, 'translation-run-summary.json'), 'utf8'),
  )
  assert.equal(
    positiveSummary.gates.find((item) => item.name === 'multi-column-review-binding')?.passed,
    true,
  )
  const currentVision = {
    ...vision,
    agentGate: { ...vision.agentGate, reviewRequiredCount: 1 },
  }

  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
const args = process.argv.slice(2)
const print = (value) => process.stdout.write(JSON.stringify(value))
if (args[1] === 'inspect') print({ status: 'success', presentation: { slideCount: 1 } })
else if (args[1] === 'i18n-style-diff') print({ schemaVersion: 'pptx-i18n-style-diff/v1', status: 'pass', agentGate: { passed: true } })
else if (args[1] === 'i18n-scan') print({ schemaVersion: 'pptx-i18n-scan/v1', status: 'pass', agentGate: { passed: true } })
else if (args[1] === 'vision-diff') process.stdout.write(${JSON.stringify(JSON.stringify(currentVision))})
else process.exit(2)
`,
  )
  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-translation-run.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--units-file',
      units,
      '--translations',
      translations,
      '--output',
      join(root, 'out.pptx'),
      '--run-dir',
      join(root, 'run'),
      '--xdoc-bin',
      fakeXdoc,
      '--multi-column-review-gate',
      gate,
      '--json',
    ],
    1,
  )
  const compact = JSON.parse(result.stdout)
  assert.equal(compact.error.phase, 'multi-column-review-binding')
  assert.equal(compact.requiredReferences[0].section, 'Visual Parity Gate')
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
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : ''
}
const identity = (path) => {
  const bytes = readFileSync(path)
  return { path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}

if (args[0] === 'pptx' && args[1] === 'contact-diff') {
  const output = valueAfter('--output')
  const dpi = Number(valueAfter('--dpi'))
  writeFileSync(output, 'contact diff png')
  process.stdout.write(JSON.stringify({
    schemaVersion: 'pptx-contact-diff/v1',
    status: 'success',
    baseline: identity(valueAfter('--source')),
    target: identity(valueAfter('--candidate')),
    baselinePath: valueAfter('--source'),
    targetPath: valueAfter('--candidate'),
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

test('compare splits 48 slides into complete 20/20/8 high-DPI parts and writes a manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-multipart-compare-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const runDir = join(root, 'run')
  const log = join(root, 'xdoc.log')
  const fakeXdoc = writeMultipartContactDiffXdoc(root)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')

  const result = runNode(
    [
      skillPath('scripts/pptx-nova-compare.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--run-dir',
      runDir,
      '--kind',
      'refurbish',
      '--slide-count',
      '48',
      '--compare-chunk-size',
      '20',
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    { env: { ...process.env, FAKE_XDOC_LOG: log } },
  )
  const manifest = JSON.parse(result.stdout)

  assert.equal(manifest.schemaVersion, 'pptx-nova-compare-manifest/v1')
  assert.equal(manifest.status, 'success')
  assert.equal(manifest.slideCount, 48)
  assert.equal(manifest.chunkSize, 20)
  assert.deepEqual(
    manifest.parts.map((part) => [part.selector, part.pairCount, part.dpi]),
    [
      ['1-20', 20, 192],
      ['21-40', 20, 192],
      ['41-48', 8, 192],
    ],
  )
  assert.deepEqual(manifest.coverage.missingSlides, [])
  assert.deepEqual(manifest.coverage.duplicateSlides, [])
  assert.equal(manifest.agentGate.passed, true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare-01.png')), true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare-02.png')), true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare-03.png')), true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare.png')), false)
  assert.equal(existsSync(join(runDir, 'refurbish-compare.json')), true)
  assert.deepEqual(
    readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const entry = JSON.parse(line)
        return [entry.selector, entry.dpi]
      })
      .sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true })),
    [
      ['1-20', 192],
      ['21-40', 192],
      ['41-48', 192],
    ],
  )
})

test('compare renders parts concurrently and keeps the manifest ordered by part number', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-multipart-concurrent-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const runDir = join(root, 'run')
  const log = join(root, 'xdoc.log')
  const fakeXdoc = writeMultipartContactDiffXdoc(root)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')

  const result = runNode(
    [
      skillPath('scripts/pptx-nova-compare.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--run-dir',
      runDir,
      '--kind',
      'refurbish',
      '--slide-count',
      '48',
      '--compare-chunk-size',
      '20',
      '--compare-concurrency',
      '3',
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    {
      env: {
        ...process.env,
        FAKE_XDOC_LOG: log,
        // The first part finishes last so completion order is 3, 2, 1.
        FAKE_XDOC_DELAY_MAP: JSON.stringify({ '1-20': 450, '21-40': 250, '41-48': 50 }),
      },
    },
  )
  const manifest = JSON.parse(result.stdout)

  assert.equal(manifest.status, 'success')
  assert.equal(manifest.concurrency, 3)
  assert.deepEqual(
    manifest.parts.map((part) => [part.partNumber, part.selector, part.pairCount]),
    [
      [1, '1-20', 20],
      [2, '21-40', 20],
      [3, '41-48', 8],
    ],
  )
  assert.deepEqual(manifest.coverage.missingSlides, [])
  assert.equal(manifest.agentGate.passed, true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare-01.png')), true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare-02.png')), true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare-03.png')), true)
  // Serial execution can never interleave: each fake xdoc process exits (and
  // logs its window) before the next one boots, so serial [startedAt, endedAt]
  // windows are pairwise disjoint. Concurrent parts must overlap somewhere.
  // Asserting on the logged windows instead of total wall-clock keeps the test
  // independent of process-spawn overhead on slow CI runners.
  const windows = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const { selector, startedAt, endedAt } = JSON.parse(line)
      return { selector, startedAt, endedAt }
    })
  assert.equal(windows.length, 3)
  const overlaps = windows.some((a, i) =>
    windows.some((b, j) => i < j && a.startedAt < b.endedAt && b.startedAt < a.endedAt),
  )
  assert.ok(overlaps, `expected concurrent parts to overlap, windows ${JSON.stringify(windows)}`)
})

test('compare streams heartbeat progress without corrupting JSON stdout', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-compare-progress-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const runDir = join(root, 'run')
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const valueAfter = (flag) => args[args.indexOf(flag) + 1]
const identity = (path) => {
  const bytes = readFileSync(path)
  return { path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
await new Promise((resolve) => setTimeout(resolve, 80))
const output = valueAfter('--output')
writeFileSync(output, 'contact diff png')
process.stdout.write(JSON.stringify({
  schemaVersion: 'pptx-contact-diff/v1',
  status: 'success',
  baseline: identity(valueAfter('--source')),
  target: identity(valueAfter('--candidate')),
  baselinePath: valueAfter('--source'),
  targetPath: valueAfter('--candidate'),
  outputPath: output,
  summary: { pairCount: 1, scopeMode: 'all-slides', dpi: Number(valueAfter('--dpi')) },
  agentGate: { passed: true, status: 'pass', scopeMode: 'all-slides', pairCount: 1 },
  render: { path: output, width: 100, height: 56, dpi: Number(valueAfter('--dpi')) }
}))
`,
  )
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')

  const result = runNode(
    [
      skillPath('scripts/pptx-nova-compare.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--run-dir',
      runDir,
      '--kind',
      'refurbish',
      '--slide-count',
      '1',
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    {
      env: {
        ...process.env,
        PPTX_NOVA_PROGRESS_FD: '1',
        PPTX_NOVA_PROGRESS_HEARTBEAT_MS: '20',
      },
    },
  )
  const report = JSON.parse(result.stdout)
  const progressEvents = result.stderr
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.equal(report.status, 'success')
  assert.ok(progressEvents.some((event) => event.event === 'compare-start'))
  assert.ok(
    progressEvents.some(
      (event) =>
        event.event === 'command-heartbeat' &&
        event.executable &&
        Number.isInteger(event.argumentCount) &&
        !('command' in event),
    ),
  )
  assert.ok(progressEvents.some((event) => event.event === 'compare-part-complete'))
  assert.ok(progressEvents.some((event) => event.event === 'compare-complete'))
})

test('compare retries only a retryable RenderError part at 144 DPI', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-multipart-retry-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const runDir = join(root, 'run')
  const log = join(root, 'xdoc.log')
  const fakeXdoc = writeMultipartContactDiffXdoc(root)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')

  const result = runNode(
    [
      skillPath('scripts/pptx-nova-compare.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--run-dir',
      runDir,
      '--kind',
      'refurbish',
      '--slide-count',
      '48',
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    {
      env: {
        ...process.env,
        FAKE_XDOC_LOG: log,
        FAKE_XDOC_MODE: 'retry-part-2',
      },
    },
  )
  const manifest = JSON.parse(result.stdout)
  assert.deepEqual(
    manifest.parts.map((part) => part.dpi),
    [192, 144, 192],
  )
  assert.deepEqual(
    manifest.parts[1].attempts.map((attempt) => [attempt.dpi, attempt.status]),
    [
      [192, 'failed'],
      [144, 'success'],
    ],
  )
  assert.equal(manifest.parts[1].attempts[0].error.reason, 'canvas-dimension-limit')
})

test('compare keeps the single-file contract for small decks and may retry it at 144 DPI', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-single-compare-retry-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const runDir = join(root, 'run')
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const valueAfter = (flag) => args[args.indexOf(flag) + 1]
const identity = (path) => {
  const bytes = readFileSync(path)
  return { path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
const dpi = Number(valueAfter('--dpi'))
const output = valueAfter('--output')
if (dpi === 192) {
  process.stdout.write(JSON.stringify({
    schemaVersion: 'pptx-contact-diff/v1', status: 'error',
    error: { kind: 'render_error', code: 'render_error', stage: 'render', retryable: true, requestedDpi: 192, pairCount: 12, reason: 'render-resource-limit' }
  }))
  process.exit(7)
}
writeFileSync(output, 'single 144 dpi png')
process.stdout.write(JSON.stringify({
  schemaVersion: 'pptx-contact-diff/v1', status: 'success', outputPath: output,
  baseline: identity(valueAfter('--source')),
  target: identity(valueAfter('--candidate')),
  baselinePath: valueAfter('--source'),
  targetPath: valueAfter('--candidate'),
  summary: { pairCount: 12, scopeMode: 'all-slides', dpi },
  agentGate: { passed: true, status: 'pass', scopeMode: 'all-slides', pairCount: 12 },
  render: { path: output, width: 5000, height: 6000, dpi }
}))
`,
  )
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  const result = runNode([
    skillPath('scripts/pptx-nova-compare.mjs'),
    '--source',
    source,
    '--candidate',
    candidate,
    '--run-dir',
    runDir,
    '--kind',
    'refurbish',
    '--slide-count',
    '12',
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])
  const report = JSON.parse(result.stdout)
  assert.equal(report.schemaVersion, 'pptx-contact-diff/v1')
  assert.equal(existsSync(join(runDir, 'refurbish-compare.png')), true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare-01.png')), false)
  assert.deepEqual(
    report.pptxNovaCompare.attempts.map((attempt) => [attempt.dpi, attempt.status]),
    [
      [192, 'failed'],
      [144, 'success'],
    ],
  )
})

test('compare fails closed and removes every part when 144 DPI also fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-multipart-fail-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const runDir = join(root, 'run')
  const log = join(root, 'xdoc.log')
  const fakeXdoc = writeMultipartContactDiffXdoc(root)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')

  const result = spawnSync(
    process.execPath,
    [
      skillPath('scripts/pptx-nova-compare.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--run-dir',
      runDir,
      '--kind',
      'refurbish',
      '--slide-count',
      '48',
      '--compare-concurrency',
      '1',
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, FAKE_XDOC_LOG: log, FAKE_XDOC_MODE: 'fail-part-2' },
    },
  )
  assert.equal(result.status, 1)
  const failure = JSON.parse(result.stdout)
  const progressEvents = result.stderr
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  assert.equal(failure.schemaVersion, 'pptx-nova-compare-error/v1')
  assert.equal(failure.status, 'error')
  assert.ok(progressEvents.some((event) => event.event === 'compare-failed'))
  assert.equal(
    readdirSync(runDir).filter((name) => /refurbish-compare.*\.(png|json)$/.test(name)).length,
    0,
  )
  assert.deepEqual(
    readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).dpi),
    [192, 192, 144],
  )
})

test('compare does not retry a non-RenderError failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-multipart-non-retryable-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const runDir = join(root, 'run')
  const log = join(root, 'xdoc.log')
  const fakeXdoc = writeMultipartContactDiffXdoc(root)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')

  const result = spawnSync(
    process.execPath,
    [
      skillPath('scripts/pptx-nova-compare.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--run-dir',
      runDir,
      '--kind',
      'refurbish',
      '--slide-count',
      '48',
      '--compare-concurrency',
      '1',
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, FAKE_XDOC_LOG: log, FAKE_XDOC_MODE: 'non-retryable' },
    },
  )
  assert.equal(result.status, 1)
  assert.deepEqual(
    readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).dpi),
    [192, 192],
  )
})

test('compare gate publishes every multipart sibling and rejects duplicate coverage', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-multipart-gate-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const finalPptx = join(root, 'final.pptx')
  const runDir = join(root, 'run')
  const fakeXdoc = writeMultipartContactDiffXdoc(root)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  runNode([
    skillPath('scripts/pptx-nova-compare.mjs'),
    '--source',
    source,
    '--candidate',
    candidate,
    '--run-dir',
    runDir,
    '--kind',
    'refurbish',
    '--slide-count',
    '48',
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])

  const gateResult = runNode([
    skillPath('scripts/pptx-nova-compare-gate.mjs'),
    '--run-dir',
    runDir,
    '--final-pptx',
    finalPptx,
    '--final-pptx-source',
    candidate,
    '--kind',
    'refurbish',
    '--publish',
    '--timestamp',
    '0711230000',
    '--overwrite',
    '--json',
  ])
  const gate = JSON.parse(gateResult.stdout)
  assert.equal(gate.status, 'pass')
  assert.equal(gate.finalBinding.status, 'bound')
  assert.equal(readFileSync(finalPptx, 'utf8'), 'candidate pptx')
  assert.equal(gate.finalBinding.comparedCandidate.sha256, fileIdentity(candidate).sha256)
  assert.equal(gate.finalBinding.stagedFinal.sha256, fileIdentity(candidate).sha256)
  assert.equal(gate.finalBinding.publishedFinal.sha256, fileIdentity(finalPptx).sha256)
  assert.deepEqual(
    gate.agentSummary.siblingPaths.map((path) => basename(path)),
    [
      'final-refurbish-compare-0711230000-01.png',
      'final-refurbish-compare-0711230000-02.png',
      'final-refurbish-compare-0711230000-03.png',
    ],
  )
  assert.equal(
    gate.siblings.every((sibling) => sibling.exists && sibling.byteLength > 0),
    true,
  )

  const manifestPath = join(runDir, 'refurbish-compare.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.parts[1].slides[0] = 20
  writeJson(manifestPath, manifest)
  const invalidGate = spawnSync(
    process.execPath,
    [
      skillPath('scripts/pptx-nova-compare-gate.mjs'),
      '--run-dir',
      runDir,
      '--final-pptx',
      finalPptx,
      '--final-pptx-source',
      candidate,
      '--kind',
      'refurbish',
      '--json',
      '--overwrite',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(invalidGate.status, 2)
  assert.match(JSON.parse(invalidGate.stdout).blockers.join('\n'), /duplicate|coverage/i)
})

test('compare gate publishes the exact single-file candidate bytes and records a bound receipt', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-single-binding-'))
  const runDir = join(root, 'run')
  const source = join(root, 'source.pptx')
  const candidate = join(runDir, 'candidate.pptx')
  const finalPptx = join(root, 'delivery.pptx')
  const compare = join(runDir, 'translation-compare.png')
  const reportPath = join(runDir, 'translation-compare.json')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(source, 'source bytes')
  writeFileSync(candidate, 'compared candidate bytes')
  writeFileSync(finalPptx, 'old delivery bytes')
  writeFileSync(compare, 'compare png')
  writeJson(reportPath, contactDiffReport({ compare, sourcePptx: source, finalPptx: candidate }))

  const result = runNode([
    skillPath('scripts/pptx-nova-compare-gate.mjs'),
    '--run-dir',
    runDir,
    '--final-pptx',
    finalPptx,
    '--final-pptx-source',
    candidate,
    '--kind',
    'translation',
    '--publish',
    '--overwrite',
    '--timestamp',
    '0711230001',
    '--json',
  ])
  const gate = JSON.parse(result.stdout)

  assert.equal(gate.status, 'pass')
  assert.equal(gate.finalBinding.status, 'bound')
  assert.equal(readFileSync(finalPptx, 'utf8'), 'compared candidate bytes')
  assert.equal(gate.finalBinding.comparedCandidate.sha256, fileIdentity(candidate).sha256)
  assert.equal(gate.finalBinding.publishedFinal.sha256, fileIdentity(finalPptx).sha256)
  assert.equal(gate.published.at(-1).label, 'final PPTX')
})

test('compare gate rejects an unbound cache-hit attempt', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-cache-hit-binding-'))
  const runDir = join(root, 'run')
  const source = join(root, 'source.pptx')
  const candidate = join(runDir, 'candidate.pptx')
  const finalPptx = join(root, 'delivery.pptx')
  const compare = join(runDir, 'translation-compare.png')
  const reportPath = join(runDir, 'translation-compare.json')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(source, 'source bytes')
  writeFileSync(candidate, 'candidate bytes')
  writeFileSync(compare, 'compare png')
  const report = contactDiffReport({ compare, sourcePptx: source, finalPptx: candidate })
  report.pptxNovaCompare = {
    attempts: [{ dpi: 192, status: 'cache-hit' }],
    cache: { status: 'hit', key: '0'.repeat(64), imageSha256: 'unbound' },
  }
  writeJson(reportPath, report)

  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-compare-gate.mjs'),
      '--run-dir',
      runDir,
      '--final-pptx',
      finalPptx,
      '--final-pptx-source',
      candidate,
      '--kind',
      'translation',
      '--publish',
      '--overwrite',
      '--json',
    ],
    2,
  )
  assert.match(JSON.parse(result.stdout).blockers.join('\n'), /attempt history/i)
  assert.equal(existsSync(finalPptx), false)
})

test('compare gate check-only mode binds an existing final without a staged source', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-check-binding-'))
  const runDir = join(root, 'run')
  const source = join(root, 'source.pptx')
  const candidate = join(runDir, 'candidate.pptx')
  const finalPptx = join(root, 'delivery.pptx')
  const compare = join(runDir, 'translation-compare.png')
  const reportPath = join(runDir, 'translation-compare.json')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(source, 'source bytes')
  writeFileSync(candidate, 'candidate bytes')
  writeFileSync(compare, 'compare png')
  writeJson(reportPath, contactDiffReport({ compare, sourcePptx: source, finalPptx: candidate }))

  runNode([
    skillPath('scripts/pptx-nova-compare-gate.mjs'),
    '--run-dir',
    runDir,
    '--final-pptx',
    finalPptx,
    '--final-pptx-source',
    candidate,
    '--kind',
    'translation',
    '--publish',
    '--overwrite',
    '--timestamp',
    '0711230004',
    '--json',
  ])

  const checked = JSON.parse(
    runNode([
      skillPath('scripts/pptx-nova-compare-gate.mjs'),
      '--run-dir',
      runDir,
      '--final-pptx',
      finalPptx,
      '--kind',
      'translation',
      '--overwrite',
      '--json',
    ]).stdout,
  )

  assert.equal(checked.status, 'pass')
  assert.equal(checked.mode, 'check-binding')
  assert.equal(checked.finalBinding.status, 'bound')
  assert.equal(checked.finalBinding.stagedFinal, null)
  assert.equal(checked.finalBinding.publishedFinal.sha256, fileIdentity(finalPptx).sha256)
  assert.deepEqual(checked.published, [])
})

test('compare gate rejects a different staged final and preserves the existing delivery', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-binding-mismatch-'))
  const runDir = join(root, 'run')
  const source = join(root, 'source.pptx')
  const comparedCandidate = join(runDir, 'compared.pptx')
  const wrongCandidate = join(runDir, 'wrong.pptx')
  const finalPptx = join(root, 'delivery.pptx')
  const compare = join(runDir, 'translation-compare.png')
  const reportPath = join(runDir, 'translation-compare.json')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(source, 'source bytes')
  writeFileSync(comparedCandidate, 'compared candidate bytes')
  writeFileSync(wrongCandidate, 'different staged bytes')
  writeFileSync(finalPptx, 'existing delivery bytes')
  writeFileSync(compare, 'compare png')
  writeJson(
    reportPath,
    contactDiffReport({ compare, sourcePptx: source, finalPptx: comparedCandidate }),
  )
  const gatePath = join(runDir, 'translation-compare-gate.json')
  writeJson(gatePath, { status: 'pass', stale: true })

  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-compare-gate.mjs'),
      '--run-dir',
      runDir,
      '--final-pptx',
      finalPptx,
      '--final-pptx-source',
      wrongCandidate,
      '--kind',
      'translation',
      '--publish',
      '--overwrite',
      '--timestamp',
      '0711230002',
      '--json',
    ],
    2,
  )
  const gate = JSON.parse(result.stdout)

  assert.equal(gate.status, 'fail')
  assert.equal(gate.finalBinding.status, 'mismatch')
  assert.match(gate.blockers.join('\n'), /staged final PPTX SHA-256/i)
  assert.equal(readFileSync(finalPptx, 'utf8'), 'existing delivery bytes')
  assert.equal(gate.agentSummary.siblingPaths.length, 1)
  assert.equal(existsSync(gate.agentSummary.siblingPaths[0]), false)
  assert.equal(JSON.parse(readFileSync(gatePath, 'utf8')).status, 'fail')
})

test('compare gate rejects a candidate overwritten after compare evidence was created', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-stale-candidate-'))
  const runDir = join(root, 'run')
  const source = join(root, 'source.pptx')
  const candidate = join(runDir, 'candidate.pptx')
  const finalPptx = join(root, 'delivery.pptx')
  const compare = join(runDir, 'translation-compare.png')
  const reportPath = join(runDir, 'translation-compare.json')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(source, 'source bytes')
  writeFileSync(candidate, 'compared bytes')
  writeFileSync(finalPptx, 'existing delivery')
  writeFileSync(compare, 'compare png')
  writeJson(reportPath, contactDiffReport({ compare, sourcePptx: source, finalPptx: candidate }))
  writeFileSync(candidate, 'overwritten after compare')

  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-compare-gate.mjs'),
      '--run-dir',
      runDir,
      '--final-pptx',
      finalPptx,
      '--final-pptx-source',
      candidate,
      '--kind',
      'translation',
      '--publish',
      '--overwrite',
      '--timestamp',
      '0711230003',
      '--json',
    ],
    2,
  )
  const gate = JSON.parse(result.stdout)

  assert.equal(gate.status, 'fail')
  assert.match(gate.blockers.join('\n'), /compare candidate (byteLength|SHA-256)/i)
  assert.equal(readFileSync(finalPptx, 'utf8'), 'existing delivery')
})

test('compare gate rejects a multipart part report with a different input identity', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-multipart-identity-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const finalPptx = join(root, 'final.pptx')
  const runDir = join(root, 'run')
  const fakeXdoc = writeMultipartContactDiffXdoc(root)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  runNode([
    skillPath('scripts/pptx-nova-compare.mjs'),
    '--source',
    source,
    '--candidate',
    candidate,
    '--run-dir',
    runDir,
    '--kind',
    'refurbish',
    '--slide-count',
    '48',
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])

  const manifest = JSON.parse(readFileSync(join(runDir, 'refurbish-compare.json'), 'utf8'))
  const partReportPath = manifest.parts[1].reportPath
  const partReport = JSON.parse(readFileSync(partReportPath, 'utf8'))
  partReport.target.sha256 = '0'.repeat(64)
  writeJson(partReportPath, partReport)

  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-compare-gate.mjs'),
      '--run-dir',
      runDir,
      '--final-pptx',
      finalPptx,
      '--final-pptx-source',
      candidate,
      '--kind',
      'refurbish',
      '--publish',
      '--overwrite',
      '--timestamp',
      '0711230005',
      '--json',
    ],
    2,
  )
  const gate = JSON.parse(result.stdout)

  assert.equal(gate.status, 'fail')
  assert.match(gate.blockers.join('\n'), /part 2 candidate identity/i)
  assert.equal(existsSync(finalPptx), false)
  assert.equal(
    gate.agentSummary.siblingPaths.every((path) => !existsSync(path)),
    true,
  )
})

function writeCompareGateFixture(root, makeReport) {
  const runDir = join(root, 'run')
  const sourcePptx = join(root, 'source.pptx')
  const finalPptx = join(root, 'final.pptx')
  const compare = join(runDir, 'translation-compare.png')
  const reportPath = join(runDir, 'translation-compare.json')
  const gatePath = join(runDir, 'translation-compare-gate.json')

  mkdirSync(runDir, { recursive: true })
  writeFileSync(sourcePptx, 'source pptx')
  writeFileSync(finalPptx, 'final pptx')
  writeFileSync(compare, 'compare png')
  writeJson(reportPath, makeReport({ compare, runDir, sourcePptx, finalPptx }))

  return { runDir, sourcePptx, finalPptx, compare, reportPath, gatePath }
}

function runCompareGateFixture(fixture) {
  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-compare-gate.mjs'),
      '--run-dir',
      fixture.runDir,
      '--final-pptx',
      fixture.finalPptx,
      '--final-pptx-source',
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
  const { compare, sourcePptx, finalPptx } = options
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
    baseline: fileIdentity(sourcePptx),
    target: fileIdentity(finalPptx),
    baselinePath: sourcePptx,
    targetPath: finalPptx,
    summary,
    agentGate,
    render: { path: compare, width: 100, height: 56, dpi: 192 },
  }
  if (outputPath !== undefined) report.outputPath = outputPath
  return report
}

test('compare gate fails closed for a legacy multipart manifest without identities', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-compare-gate-legacy-manifest-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const finalPptx = join(root, 'final.pptx')
  const runDir = join(root, 'run')
  const fakeXdoc = writeMultipartContactDiffXdoc(root)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  writeFileSync(finalPptx, 'existing delivery')
  runNode([
    skillPath('scripts/pptx-nova-compare.mjs'),
    '--source',
    source,
    '--candidate',
    candidate,
    '--run-dir',
    runDir,
    '--kind',
    'refurbish',
    '--slide-count',
    '48',
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])
  const manifestPath = join(runDir, 'refurbish-compare.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  delete manifest.source
  delete manifest.candidate
  writeJson(manifestPath, manifest)

  const result = runNodeStatus(
    [
      skillPath('scripts/pptx-nova-compare-gate.mjs'),
      '--run-dir',
      runDir,
      '--final-pptx',
      finalPptx,
      '--final-pptx-source',
      candidate,
      '--kind',
      'refurbish',
      '--publish',
      '--overwrite',
      '--timestamp',
      '0711230010',
      '--json',
    ],
    2,
  )
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'fail')
  assert.equal(report.finalBinding.status, 'mismatch')
  assert.ok(report.blockers.some((blocker) => /compare source path is missing/i.test(blocker)))
  assert.ok(
    report.blockers.some((blocker) => /compare candidate SHA-256 is missing/i.test(blocker)),
  )
  assert.equal(readFileSync(finalPptx, 'utf8'), 'existing delivery')
  assert.equal(
    report.agentSummary.siblingPaths.every((path) => !existsSync(path)),
    true,
  )
})

test('compare gate fails closed when the published final PPTX is missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-compare-gate-missing-final-'))
  const fixture = writeCompareGateFixture(root, (context) => contactDiffReport(context))
  rmSync(fixture.finalPptx)

  const report = runCompareGateFixture(fixture)

  assert.equal(report.status, 'fail')
  assert.equal(report.finalBinding.status, 'pending')
  assert.ok(report.blockers.some((blocker) => /final PPTX is missing/i.test(blocker)))
})

test('compare gate blocks contact-diff reports without explicit all-slides scopeMode', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-compare-gate-missing-scope-'))
  const fixture = writeCompareGateFixture(root, (context) => ({
    ...contactDiffReport({ ...context, scopeMode: undefined }),
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
  const fixture = writeCompareGateFixture(root, (context) =>
    contactDiffReport({ ...context, outputPath: join(context.runDir, 'old-compare.png') }),
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
  const fixture = writeCompareGateFixture(root, (context) => {
    const report = contactDiffReport(context)
    report.render.path = join(context.runDir, 'old-render.png')
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
  const fixture = writeCompareGateFixture(root, (context) => {
    const report = contactDiffReport(context)
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

test('shared runner runtime fails closed on invalid JSON and spawn errors without leaking commands to progress', async () => {
  const { createRunnerRuntime, PhaseFailure } = await import(
    skillUrl('scripts/lib/runner-runtime.mjs')
  )
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-runtime-'))
  const events = []
  const runtime = createRunnerRuntime({
    getProgressReporter: () => ({ emit: (event, details) => events.push({ event, ...details }) }),
  })
  const invalidSummary = { runDir: root, phases: [], gates: [] }
  assert.throws(
    () =>
      runtime.runJsonPhase(invalidSummary, {
        name: 'invalid-json',
        bin: process.execPath,
        args: ['-e', "process.stdout.write('not json')"],
        artifact: join(root, 'invalid.json'),
      }),
    (error) => error instanceof PhaseFailure && error.phase === 'invalid-json',
  )
  assert.equal(existsSync(join(root, 'invalid-json.stdout.txt')), true)
  assert.equal(invalidSummary.phases[0].status, 'failed')

  const spawnSummary = { runDir: root, phases: [], gates: [] }
  assert.throws(
    () =>
      runtime.runPlainPhase(spawnSummary, {
        name: 'spawn-failure',
        bin: join(root, 'missing-executable'),
        args: ['secret-argument'],
      }),
    (error) => error instanceof PhaseFailure && error.phase === 'spawn-failure',
  )
  assert.equal(spawnSummary.phases[0].status, 'failed')
  assert.equal(
    events.some((event) => 'command' in event || JSON.stringify(event).includes('secret-argument')),
    false,
  )
})

test('shared visual evidence rejects empty manifests and stale declared hashes', async () => {
  const { materializeCompareAliases, VisualEvidenceError } = await import(
    skillUrl('scripts/lib/visual-evidence.mjs')
  )
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-visual-evidence-'))
  assert.throws(
    () =>
      materializeCompareAliases({
        compareReport: { schemaVersion: 'pptx-nova-compare-manifest/v1', parts: [] },
        compareReportPath: join(root, 'compare.json'),
        compareOutputPath: join(root, 'compare.png'),
        aliasOutputPath: join(root, 'alias.png'),
        aliasReportPath: join(root, 'alias.json'),
      }),
    VisualEvidenceError,
  )

  const part = join(root, 'compare-01.png')
  const partReport = join(root, 'compare-01.json')
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  writeFileSync(source, 'source')
  writeFileSync(candidate, 'candidate')
  writeFileSync(part, 'actual bytes')
  writeJson(partReport, {
    status: 'success',
    baseline: fileIdentity(source),
    target: fileIdentity(candidate),
    outputPath: part,
    render: { path: part },
    scope: { slides: [1] },
  })
  assert.throws(
    () =>
      materializeCompareAliases({
        compareReport: {
          schemaVersion: 'pptx-nova-compare-manifest/v1',
          status: 'success',
          source: fileIdentity(source),
          candidate: fileIdentity(candidate),
          slideCount: 1,
          coverage: { expectedSlides: [1], coveredSlides: [1] },
          parts: [
            {
              partNumber: 1,
              path: part,
              reportPath: partReport,
              slides: [1],
              pairCount: 1,
              byteLength: 12,
              sha256: 'stale',
            },
          ],
        },
        compareReportPath: join(root, 'compare.json'),
        compareOutputPath: join(root, 'compare.png'),
        aliasOutputPath: join(root, 'alias.png'),
        aliasReportPath: join(root, 'alias.json'),
      }),
    (error) => error instanceof VisualEvidenceError && /SHA-256/.test(error.message),
  )

  const single = join(root, 'single.png')
  const singleAlias = join(root, 'single-alias.png')
  const singleAliasReport = join(root, 'single-alias.json')
  writeFileSync(single, 'single compare')
  const singleResult = materializeCompareAliases({
    compareReport: {
      schemaVersion: 'pptx-contact-diff/v1',
      status: 'success',
      baseline: fileIdentity(source),
      target: fileIdentity(candidate),
      outputPath: single,
      render: { path: single },
    },
    compareReportPath: join(root, 'single.json'),
    compareOutputPath: single,
    aliasOutputPath: singleAlias,
    aliasReportPath: singleAliasReport,
    sourceKind: 'refurbish',
  })
  assert.equal(singleResult.report.reuse.sourceKind, 'refurbish')
})
