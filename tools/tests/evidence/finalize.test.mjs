import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runNode, runNodeStatus, skillPath, writeJson, fileIdentity } from '../helpers/common.mjs'
import { writeFinalizeSemanticFixtures } from '../helpers/runner-fixtures.mjs'

test('evidence writers require explicit overwrite for current-run artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-evidence-overwrite-'))

  const patchPath = join(root, 'patch.json')
  const semanticOutput = join(root, 'semantic-audit.json')
  writeJson(patchPath, { schemaVersion: 'pptx-patch/v1', ops: [] })
  const semanticArgs = [
    skillPath('scripts/cli/review/semantic-audit.mjs'),
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
    skillPath('scripts/cli/review/structure-check.mjs'),
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
    skillPath('scripts/cli/review/layout-snapshot.mjs'),
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
    skillPath('scripts/cli/review/finalize-evidence.mjs'),
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
    skillPath('scripts/cli/review/finalize-evidence.mjs'),
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
      skillPath('scripts/cli/review/finalize-evidence.mjs'),
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
      skillPath('scripts/cli/review/finalize-evidence.mjs'),
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
      skillPath('scripts/cli/review/finalize-evidence.mjs'),
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
      skillPath('scripts/cli/review/finalize-evidence.mjs'),
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
    skillPath('scripts/cli/review/finalize-evidence.mjs'),
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
