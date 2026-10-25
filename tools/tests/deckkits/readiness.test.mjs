import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { repoRoot, runNode, skillPath, writeJson } from '../helpers/common.mjs'

test('readiness defaults to catalog benchmark evidence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-nova-catalog-evidence-'))
  const catalogPath = join(dir, 'catalog.json')
  const catalog = JSON.parse(readFileSync(skillPath('assets/deckkits/catalog.json'), 'utf8'))
  catalog.entries.find((entry) => entry.id === 'long-table').readiness = 'production'
  writeJson(catalogPath, catalog)
  const result = runNode([
    skillPath('scripts/cli/deckkits/readiness.mjs'),
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
      skillPath('scripts/cli/deckkits/readiness.mjs'),
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
    skillPath('scripts/cli/deckkits/readiness.mjs'),
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
    skillPath('scripts/cli/deckkits/readiness.mjs'),
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
      skillPath('scripts/cli/deckkits/readiness.mjs'),
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
