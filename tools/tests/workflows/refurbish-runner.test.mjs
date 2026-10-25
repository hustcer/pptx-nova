import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { test } from 'node:test'
import {
  repoRoot,
  runNode,
  runNodeStatus,
  skillPath,
  writeJson,
  fileIdentity,
} from '../helpers/common.mjs'
import { writeFakeXdoc } from '../helpers/fake-xdoc.mjs'
import { readRefurbishResult, readRefurbishSummary } from '../helpers/runner-fixtures.mjs'

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
      skillPath('scripts/cli/refurbish/run.mjs'),
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
      skillPath('scripts/cli/refurbish/run.mjs'),
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
      skillPath('scripts/cli/refurbish/run.mjs'),
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
    skillPath('scripts/cli/refurbish/run.mjs'),
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
      skillPath('scripts/cli/refurbish/run.mjs'),
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
    /cli[\\/]+review[\\/]+visual-review\.mjs/,
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
    /cli[\\/]+review[\\/]+feedback-gate\.mjs/,
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
      skillPath('scripts/cli/refurbish/run.mjs'),
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
      skillPath('scripts/cli/refurbish/run.mjs'),
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
      skillPath('scripts/cli/refurbish/run.mjs'),
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
      skillPath('scripts/cli/refurbish/run.mjs'),
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
      skillPath('scripts/cli/refurbish/run.mjs'),
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
      skillPath('scripts/cli/refurbish/run.mjs'),
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
