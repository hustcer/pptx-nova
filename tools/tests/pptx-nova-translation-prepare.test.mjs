import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const runner = join(repoRoot, 'pptx-nova/scripts/pptx-nova-translation-prepare.mjs')

function run(args, expectedStatus = 0, env = {}) {
  const result = spawnSync(process.execPath, [runner, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

function fakeXdoc(root) {
  const path = join(root, 'fake-xdoc.mjs')
  writeFileSync(
    path,
    `#!/usr/bin/env node
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const value = (flag) => args[args.indexOf(flag) + 1]
const print = (data) => process.stdout.write(JSON.stringify(data))
if (args[0] === 'schema') {
  const counter = ${JSON.stringify(join(root, 'probe-count.txt'))}
  const count = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0
  writeFileSync(counter, String(count + 1))
  print({ schemaVersion: 'cli-agent/v1', version: 'test', commands: { pptx: { subcommands: { 'i18n-scan': {}, 'i18n-plan': {} } } } })
} else if (args.includes('--help')) {
  process.stdout.write('--json --json-full --output --overwrite preview i18n-scan i18n-plan')
} else if (args[0] === '--version') {
  process.stdout.write('test')
} else if (args[0] === 'pptx' && args[1] === 'i18n-scan') {
  const output = value('--output')
  const report = {
    schemaVersion: 'pptx-i18n-scan/v1', status: 'pass', sourceLang: 'multi', mode: 'source',
    summary: { totalHits: 4 }, agentGate: { passed: true },
    i18nUnits: { schemaVersion: 'pptx-i18n-units/v1', sourceLang: 'multi', units: [
      { unitId: 'u1', action: 'translate', category: 'visibleBody', sourceText: 'Revenue', sourceHash: 'sha256:a', part: 'ppt/slides/slide1.xml', slide: 1, selectors: { replaceText: { kind: 'text-node', part: 'ppt/slides/slide1.xml' } } },
      { unitId: 'u2', action: 'translate', category: 'visibleBody', sourceText: 'Revenue', sourceHash: 'sha256:a', part: 'ppt/slides/slide2.xml', slide: 2, selectors: { replaceText: { kind: 'text-node', part: 'ppt/slides/slide2.xml' } } },
      { unitId: 'u3', action: 'review', category: 'visibleBody', sourceText: 'Master title', sourceHash: 'sha256:b', part: 'ppt/slideLayouts/slideLayout1.xml', slide: null, selectors: { replaceText: { kind: 'text-node', part: 'ppt/slideLayouts/slideLayout1.xml' } } },
      { unitId: 'u4', action: 'review', category: 'visibleBody', sourceText: 'Forecast', sourceHash: 'sha256:c', part: 'ppt/slides/slide3.xml', slide: 3, requiresReview: true, notes: ['language-classification-uncertain'], selectors: { replaceText: { kind: 'text-node', part: 'ppt/slides/slide3.xml' } } }
    ] }
  }
  writeFileSync(output, JSON.stringify(report))
  print({ schemaVersion: 'pptx-i18n-scan-result/v1', status: 'pass', report: output, inventory: { unitCount: 4 }, agentGate: { passed: true } })
} else if (args[0] === 'pptx' && args[1] === 'i18n-plan') {
  if (process.env.FAKE_PLAN_FAIL === '1') {
    process.stderr.write('intentional plan failure without a current report')
    process.exit(2)
  }
  const translations = JSON.parse(readFileSync(value('--data'), 'utf8')).translations
  const output = value('--output')
  const report = {
    schemaVersion: 'pptx-i18n-plan/v1', status: 'pass',
    summary: { translationCount: translations.length, replaceTextCount: translations.length },
    textPlan: { schemaVersion: 'pptx-i18n-text-plan-input/v1', translations: [] },
    replaceText: { schemaVersion: 'pptx-i18n-translations/v1', replacements: translations },
    replaceChartText: { schemaVersion: 'pptx-chart-text-replacements/v1', replacements: [] },
    patch: { schemaVersion: 1, ops: [] }, reviewRequired: [], conflicts: [], missingTranslations: [],
    applyGate: { passed: true }, deliveryGate: { passed: true }
  }
  writeFileSync(output, JSON.stringify(report))
  print({ schemaVersion: 'pptx-i18n-plan-result/v1', status: 'pass', report: output, summary: report.summary, applyGate: report.applyGate, nextAction: 'apply-generated-artifacts' })
} else if (args[0] === 'pptx' && args[1] === 'replace-text') {
  copyFileSync(value('--source'), value('--output'))
  print({ schemaVersion: 'pptx-replace-text/v1', status: 'success', agentGate: { passed: true } })
} else {
  process.stderr.write('unsupported fake command: ' + args.join(' '))
  process.exit(2)
}
`,
  )
  chmodSync(path, 0o755)
  return path
}

test('translation preparation refuses output aliases to the read-only source', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-collision-'))
  const source = join(root, 'source.pptx')
  const candidateAlias = join(root, 'candidate.pptx')
  writeFileSync(source, 'source bytes')
  symlinkSync(source, candidateAlias)
  const result = run(
    [
      '--source',
      source,
      '--source-lang',
      'multi',
      '--target-lang',
      'de',
      '--run-dir',
      join(root, 'run'),
      '--output-candidate',
      candidateAlias,
      '--progress',
      'off',
      '--json',
    ],
    1,
  )
  assert.match(result.error.message, /must not resolve to the read-only source/)
  assert.equal(readFileSync(source, 'utf8'), 'source bytes')
})

test('translation preparation deduplicates memory and resumes through guarded apply', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-prepare-'))
  const source = join(root, 'source.pptx')
  const runDir = join(root, 'run')
  const xdoc = fakeXdoc(root)
  writeFileSync(source, 'source bytes')

  const inventory = run([
    '--source',
    source,
    '--source-lang',
    'multi',
    '--target-lang',
    'de',
    '--run-dir',
    runDir,
    '--xdoc-bin',
    xdoc,
    '--progress',
    'off',
    '--json',
  ])
  assert.equal(inventory.status, 'needs-review-decisions')
  assert.equal(inventory.requiredReferences[0].path, 'references/translation-mode.md')
  assert.equal(typeof inventory.requiredReferences[0].reason, 'string')
  assert.equal(inventory.requiredReferences[0].file, undefined)
  const decisionsPath = inventory.artifacts.reviewDecisionsTemplate
  const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8'))
  decisions.decisions[0].decision = 'invalid'
  decisions.decisions[0].reason = 'Intentional invalid decision for resume testing.'
  writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2))

  const failedClassification = run(
    [
      '--source',
      source,
      '--source-lang',
      'multi',
      '--target-lang',
      'de',
      '--run-dir',
      runDir,
      '--review-decisions',
      decisionsPath,
      '--xdoc-bin',
      xdoc,
      '--progress',
      'off',
      '--json',
    ],
    1,
  )
  assert.equal(failedClassification.status, 'error')

  decisions.decisions[0].decision = 'translate'
  decisions.decisions[0].reason = 'Visible slide copy in the source language.'
  writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2))

  const decisionsCollision = join(runDir, 'i18n-review-classification.json')
  writeFileSync(decisionsCollision, JSON.stringify(decisions, null, 2))
  const collision = run(
    [
      '--source',
      source,
      '--source-lang',
      'multi',
      '--target-lang',
      'de',
      '--run-dir',
      runDir,
      '--review-decisions',
      decisionsCollision,
      '--xdoc-bin',
      xdoc,
      '--progress',
      'off',
      '--json',
    ],
    1,
  )
  assert.match(collision.error.message, /read-only reviewDecisions input/)

  const resumed = run([
    '--source',
    source,
    '--source-lang',
    'multi',
    '--target-lang',
    'de',
    '--run-dir',
    runDir,
    '--review-decisions',
    decisionsPath,
    '--xdoc-bin',
    xdoc,
    '--progress',
    'off',
    '--json',
  ])
  assert.equal(resumed.status, 'needs-translations')
  assert.equal(resumed.summary.memory.eligibleUnitCount, 4)
  assert.equal(resumed.summary.memory.uniqueSourceTextCount, 3)

  const memoryPath = join(runDir, 'translation-memory.json')
  const memory = JSON.parse(readFileSync(memoryPath, 'utf8'))
  memory.entries.find((entry) => entry.sourceText === 'Revenue').targetText = 'Umsatz'
  memory.entries.find((entry) => entry.sourceText === 'Master title').targetText = 'Mastertitel'
  memory.entries.find((entry) => entry.sourceText === 'Forecast').targetText = 'Prognose'
  memory.unitOverrides.push({
    unitId: 'u3',
    reviewDecision: 'translate',
    reason: 'Visible shared layout text.',
  })
  writeFileSync(memoryPath, JSON.stringify(memory, null, 2))

  const unrelatedSource = join(root, 'unrelated-source.pptx')
  writeFileSync(unrelatedSource, 'different source bytes')
  const capabilitiesBefore = readFileSync(join(runDir, 'xdoc-capabilities.json'))
  const scanBefore = readFileSync(join(runDir, 'i18n-scan-source.json'))
  const mismatchedApply = run(
    [
      '--source',
      unrelatedSource,
      '--source-lang',
      'multi',
      '--target-lang',
      'de',
      '--run-dir',
      runDir,
      '--xdoc-bin',
      xdoc,
      '--apply',
      '--overwrite',
      '--progress',
      'off',
      '--json',
    ],
    1,
  )
  assert.match(mismatchedApply.error.message, /must match the prior preparation run/)
  assert.deepEqual(readFileSync(join(runDir, 'xdoc-capabilities.json')), capabilitiesBefore)
  assert.deepEqual(readFileSync(join(runDir, 'i18n-scan-source.json')), scanBefore)

  const stalePlanPath = join(runDir, 'i18n-plan.json')
  writeFileSync(
    stalePlanPath,
    JSON.stringify({
      schemaVersion: 'pptx-i18n-plan/v1',
      status: 'pass',
      applyGate: { passed: true },
    }),
  )
  const failedPlan = run(
    [
      '--source',
      source,
      '--source-lang',
      'multi',
      '--target-lang',
      'de',
      '--run-dir',
      runDir,
      '--xdoc-bin',
      xdoc,
      '--apply',
      '--overwrite',
      '--progress',
      'off',
      '--json',
    ],
    1,
    { FAKE_PLAN_FAIL: '1' },
  )
  assert.equal(failedPlan.status, 'error')
  assert.equal(failedPlan.artifacts.plan, null)
  assert.equal(failedPlan.artifacts.candidate, null)
  assert.equal(JSON.parse(readFileSync(stalePlanPath, 'utf8')).applyGate.passed, true)

  const applied = run([
    '--source',
    source,
    '--source-lang',
    'multi',
    '--target-lang',
    'de',
    '--run-dir',
    runDir,
    '--xdoc-bin',
    xdoc,
    '--apply',
    '--overwrite',
    '--progress',
    'off',
    '--json',
  ])
  assert.equal(applied.status, 'prepared')
  assert.equal(applied.summary.translationCount, 4)
  assert.equal(readFileSync(applied.artifacts.candidate, 'utf8'), 'source bytes')
  assert.equal(readFileSync(join(root, 'probe-count.txt'), 'utf8'), '5')
})
