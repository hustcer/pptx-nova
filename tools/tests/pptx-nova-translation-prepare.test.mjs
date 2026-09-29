import test from 'node:test'
import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { translationSource } from './helpers/pptx-package.mjs'

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
  print({ schemaVersion: 'cli-agent/v1', version: 'test', commands: { pptx: { subcommands: { 'i18n-scan': {}, 'i18n-plan': {}, 'i18n-anchor-draft': {} } } } })
} else if (args.includes('--help')) {
  process.stdout.write('--json --json-full --output --overwrite preview i18n-scan i18n-plan i18n-anchor-draft')
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
      { unitId: 'u4', action: 'review', category: 'visibleBody', sourceText: 'Forecast', sourceHash: 'sha256:c', part: 'ppt/slides/slide3.xml', slide: 3, requiresReview: true, notes: ['language-classification-uncertain'], selectors: { replaceText: { kind: 'text-node', part: 'ppt/slides/slide3.xml' } } },
      { unitId: 'u5', action: 'review', category: 'chartVisibleCache', sourceText: 'Forecast', sourceHash: 'sha256:c', part: 'ppt/charts/chart1.xml', slide: 4, requiresReview: true, notes: ['language-classification-uncertain'], selectors: { replaceChartText: { kind: 'chart-cache', part: 'ppt/charts/chart1.xml' } } }
    ] }
  }
  writeFileSync(output, JSON.stringify(report))
  print({ schemaVersion: 'pptx-i18n-scan-result/v1', status: 'pass', report: output, inventory: { unitCount: 5 }, agentGate: { passed: true } })
} else if (args[0] === 'pptx' && args[1] === 'i18n-plan') {
  if (process.env.FAKE_PLAN_FAIL === '1') {
    process.stderr.write('intentional plan failure without a current report')
    process.exit(2)
  }
  const translations = JSON.parse(readFileSync(value('--data'), 'utf8')).translations
  const output = value('--output')
  const segmentUnits = (process.env.FAKE_PLAN_SEGMENTS ?? '').split(',').filter(Boolean)
  const anchorUnits = (process.env.FAKE_PLAN_ANCHORS ?? '').split(',').filter(Boolean)
  const missingSegments = segmentUnits.filter((unitId) => {
    const entry = translations.find((item) => item.unitId === unitId)
    return !Array.isArray(entry?.targetSegments) || entry.targetSegments.some((segment) => typeof segment?.text !== 'string')
  })
  const missingAnchors = anchorUnits.filter((unitId) => {
    const entry = translations.find((item) => item.unitId === unitId)
    return !Array.isArray(entry?.anchors) || entry.anchors.length === 0
  })
  if (missingSegments.length > 0 || missingAnchors.length > 0) {
    const report = {
      schemaVersion: 'pptx-i18n-plan/v1', status: 'blocked',
      summary: { translationCount: translations.length },
      reviewRequired: [
        ...missingSegments.map((unitId) => ({
          unitId,
          category: 'mixed-style-no-anchor',
          repair: {
            schemaVersion: 'pptx-i18n-target-segments-repair/v1', kind: 'target-segments',
            translationPatchTemplate: {
              unitId,
              targetSegments: [{ segmentId: unitId + '-s1', text: null }],
              targetSegmentsContractId: 'contract-' + unitId,
            },
          },
        })),
        ...missingAnchors.map((unitId) => ({
          unitId,
          category: 'mixed-style-no-anchor',
          draftCommand: 'xdoc pptx i18n-anchor-draft --unit ' + unitId,
        })),
      ],
      conflicts: [], missingTranslations: [], applyGate: { passed: false }, deliveryGate: { passed: false }
    }
    writeFileSync(output, JSON.stringify(report))
    print({ schemaVersion: 'pptx-i18n-plan-result/v1', status: 'blocked', report: output, applyGate: { passed: false }, nextAction: 'fill-target-segments' })
  } else {
  const report = {
    schemaVersion: 'pptx-i18n-plan/v1', status: 'pass',
    summary: { translationCount: translations.length, replaceTextCount: translations.length },
    textPlan: { schemaVersion: 'pptx-i18n-text-plan-input/v1', translations: [] },
    replaceText: { schemaVersion: 'pptx-i18n-translations/v1', replacements: translations },
    replaceChartText: { schemaVersion: 'pptx-chart-text-replacements/v1', replacements: [] },
    patch: { schemaVersion: 'pptx-patch/v1', ops: [] }, reviewRequired: [], conflicts: [], missingTranslations: [],
    applyGate: { passed: true }, deliveryGate: { passed: true }
  }
  writeFileSync(output, JSON.stringify(report))
  print({ schemaVersion: 'pptx-i18n-plan-result/v1', status: 'pass', report: output, summary: report.summary, applyGate: report.applyGate, nextAction: 'apply-generated-artifacts' })
  }
} else if (args[0] === 'pptx' && args[1] === 'i18n-anchor-draft') {
  const output = value('--output')
  const translations = JSON.parse(readFileSync(value('--data'), 'utf8')).translations
  const unitIds = (process.env.FAKE_PLAN_ANCHORS ?? '').split(',').filter(Boolean)
  const drafts = translations
    .filter((item) => unitIds.includes(item.unitId))
    .map((item) => ({
      ...item,
      anchors: [item.targetText],
    }))
  const report = {
    schemaVersion: 'pptx-i18n-anchor-draft/v1',
    status: drafts.length > 0 ? 'pass' : 'no-op',
    summary: { draftCount: drafts.length, blockedCount: 0 },
    agentGate: {
      applyAuthorized: false,
      plannerRerunRequired: drafts.length > 0,
    },
    drafts: drafts.map((item) => ({
      unitId: item.unitId,
      sourceHash: item.sourceHash,
      sourceText: item.sourceText,
      targetText: item.targetText,
      confidence: 'high',
      candidateAnchors: item.anchors.map((targetText) => ({ targetText })),
    })),
    translationsDraft: {
      schemaVersion: 'pptx-i18n-anchor-merge/v1',
      targetSchemaVersion: 'pptx-i18n-translations/v1',
      mergeBy: 'unitId',
      translations: drafts,
    },
    blocked: [],
    rerunArgs: [],
    rerunCommand: 'xdoc pptx i18n-plan',
  }
  writeFileSync(output, JSON.stringify(report))
  print(report)
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
  writeFileSync(source, translationSource)
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
  assert.deepEqual(readFileSync(source), translationSource)
})

test('translation preparation deduplicates memory and resumes through guarded apply', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-prepare-'))
  const source = join(root, 'source.pptx')
  const runDir = join(root, 'run')
  const xdoc = fakeXdoc(root)
  writeFileSync(source, translationSource)

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
  assert.equal(decisions.byText.length, 1)
  assert.equal(decisions.byText[0].sourceText, 'Forecast')
  assert.equal(decisions.byText[0].context.unitCount, 2)
  assert.deepEqual(decisions.byText[0].context.slides, [3, 4])
  assert.deepEqual(decisions.decisions, [])
  decisions.byText[0].decision = 'invalid'
  decisions.byText[0].reason = 'Intentional invalid decision for resume testing.'
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

  decisions.byText[0].decision = 'translate'
  decisions.byText[0].reason = 'Visible slide copy in the source language.'
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
  assert.equal(resumed.summary.memory.eligibleUnitCount, 5)
  assert.equal(resumed.summary.memory.uniqueSourceTextCount, 3)
  const classifiedScan = JSON.parse(readFileSync(join(runDir, 'i18n-scan-classified.json'), 'utf8'))
  const classifiedUnits = new Map(classifiedScan.i18nUnits.units.map((unit) => [unit.unitId, unit]))
  assert.equal(classifiedUnits.get('u4').action, 'translate')
  assert.equal(classifiedUnits.get('u5').action, 'translate')

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
  assert.equal(applied.summary.translationCount, 5)
  assert.deepEqual(readFileSync(applied.artifacts.candidate), translationSource)
  assert.equal(readFileSync(join(root, 'probe-count.txt'), 'utf8'), '5')
})

test('translation preparation accepts a pre-probed run directory holding only xdoc-capabilities.json', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-preprobe-'))
  const source = join(root, 'source.pptx')
  const runDir = join(root, 'run')
  writeFileSync(source, translationSource)
  mkdirSync(runDir, { recursive: true })
  writeFileSync(
    join(runDir, 'xdoc-capabilities.json'),
    JSON.stringify({ schemaVersion: 'cli-agent/v1', version: 'pre-probe' }),
  )
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
    fakeXdoc(root),
    '--progress',
    'off',
    '--json',
  ])
  assert.equal(inventory.status, 'needs-review-decisions')
})

test('translation preparation archives an external prompt only after the fresh-run guard passes', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-prompt-'))
  const source = join(root, 'source.pptx')
  const prompt = join(root, 'prompt.txt')
  const runDir = join(root, 'run')
  writeFileSync(source, translationSource)
  writeFileSync(prompt, 'Translate all visible labels to German.\n')
  const inventory = run([
    '--source',
    source,
    '--source-lang',
    'multi',
    '--target-lang',
    'de',
    '--run-dir',
    runDir,
    '--prompt-file',
    prompt,
    '--xdoc-bin',
    fakeXdoc(root),
    '--progress',
    'off',
    '--json',
  ])
  assert.equal(inventory.status, 'needs-review-decisions')
  assert.equal(inventory.artifacts.prompt, join(runDir, 'prompt.txt'))
  assert.equal(
    readFileSync(join(runDir, 'prompt.txt'), 'utf8'),
    'Translate all visible labels to German.\n',
  )
  assert.equal(readFileSync(prompt, 'utf8'), 'Translate all visible labels to German.\n')
})

test('translation preparation still rejects a reused run directory with real artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-reuse-'))
  const source = join(root, 'source.pptx')
  const runDir = join(root, 'run')
  writeFileSync(source, translationSource)
  mkdirSync(runDir, { recursive: true })
  writeFileSync(join(runDir, 'xdoc-capabilities.json'), '{}')
  writeFileSync(join(runDir, 'prompt.txt'), 'prompt')
  writeFileSync(join(runDir, 'probe.stdout.json'), '{}')
  const rejected = run(
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
      fakeXdoc(root),
      '--progress',
      'off',
      '--json',
    ],
    1,
  )
  assert.match(rejected.error.message, /allowed initial entries: xdoc-capabilities\.json/)
  assert.match(
    rejected.error.message,
    /detected entries: probe\.stdout\.json, prompt\.txt, xdoc-capabilities\.json/,
  )
  assert.match(rejected.error.message, /retry with a new --run-dir/)
  assert.match(rejected.error.message, /--prompt-file/)
  assert.equal(readFileSync(join(runDir, 'prompt.txt'), 'utf8'), 'prompt')
  assert.equal(readFileSync(join(runDir, 'probe.stdout.json'), 'utf8'), '{}')
})

test('review partitions resume after needs-translations without rescanning or changing memory', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-review-resume-'))
  const source = join(root, 'source.pptx')
  const runDir = join(root, 'run')
  const xdoc = fakeXdoc(root)
  writeFileSync(source, translationSource)
  const base = [
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
  ]
  const inventory = run(base)
  const decisionsPath = inventory.artifacts.reviewDecisionsTemplate
  const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8'))
  decisions.byText[0].decision = 'translate'
  decisions.byText[0].reason = 'Visible slide copy in the source language.'
  writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2))
  const prepared = run([...base, '--review-decisions', decisionsPath])
  assert.equal(prepared.status, 'needs-translations')

  const preparationSummaryPath = join(runDir, 'translation-prepare-summary.json')
  const scanPath = join(runDir, 'i18n-scan-source.json')
  const memoryPath = join(runDir, 'translation-memory.json')
  const summaryBefore = readFileSync(preparationSummaryPath)
  const scanBefore = readFileSync(scanPath)
  const memoryBefore = readFileSync(memoryPath)
  const probeCountBefore = readFileSync(join(root, 'probe-count.txt'), 'utf8')

  const missingStage = run([...base, '--expand-review', 'shared'], 1)
  assert.match(missingStage.error.message, /--resume-stage review --expand-review shared/)
  assert.match(missingStage.error.message, /without rescanning or modifying translation memory/)

  const expanded = run([...base, '--resume-stage', 'review', '--expand-review', 'shared'])
  assert.equal(expanded.status, 'review-expanded')
  assert.equal(expanded.summary.partition, 'shared')
  assert.equal(expanded.summary.count, 1)
  const reviewInventory = JSON.parse(readFileSync(expanded.artifacts.reviewInventory, 'utf8'))
  assert.deepEqual(
    reviewInventory.units.map((unit) => unit.unitId),
    ['u3'],
  )
  assert.equal(expanded.artifacts.summary, join(runDir, 'review-expansion-shared-summary.json'))
  assert.equal(readFileSync(preparationSummaryPath).equals(summaryBefore), true)
  assert.equal(readFileSync(scanPath).equals(scanBefore), true)
  assert.equal(readFileSync(memoryPath).equals(memoryBefore), true)
  assert.equal(readFileSync(join(root, 'probe-count.txt'), 'utf8'), probeCountBefore)
})

test('target-segment repair rounds write sequenced scaffolds and accept the filled file via --memory', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-repair-'))
  const source = join(root, 'source.pptx')
  const runDir = join(root, 'run')
  const xdoc = fakeXdoc(root)
  writeFileSync(source, translationSource)
  const base = [
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
  ]

  const inventory = run(base)
  assert.equal(inventory.status, 'needs-review-decisions')
  const decisionsPath = inventory.artifacts.reviewDecisionsTemplate
  const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8'))
  decisions.byText[0].decision = 'translate'
  decisions.byText[0].reason = 'Visible slide copy in the source language.'
  writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2))
  const resumed = run([...base, '--review-decisions', decisionsPath])
  assert.equal(resumed.status, 'needs-translations')

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

  const segmentsEnv = { FAKE_PLAN_SEGMENTS: 'u1,u2' }
  const firstRound = run([...base, '--apply', '--overwrite'], 0, segmentsEnv)
  assert.equal(firstRound.status, 'needs-target-segments')
  const firstRepairPath = join(runDir, 'translation-memory.repair.json')
  assert.equal(firstRound.artifacts.memoryRepair, firstRepairPath)

  // Fill only u1 and pass the repair file back through --memory: before the
  // sequenced scaffold fix this failed with "memoryRepair output must not
  // resolve to the read-only memory input".
  const firstRepair = JSON.parse(readFileSync(firstRepairPath, 'utf8'))
  firstRepair.unitOverrides.find((item) => item.unitId === 'u1').targetSegments[0].text = 'Umsatz'
  writeFileSync(firstRepairPath, JSON.stringify(firstRepair, null, 2))
  const firstRepairBytes = readFileSync(firstRepairPath, 'utf8')

  const secondRound = run(
    [...base, '--memory', firstRepairPath, '--apply', '--overwrite'],
    0,
    segmentsEnv,
  )
  assert.equal(secondRound.status, 'needs-target-segments')
  const secondRepairPath = join(runDir, 'translation-memory.repair-2.json')
  assert.equal(secondRound.artifacts.memoryRepair, secondRepairPath)
  assert.equal(readFileSync(firstRepairPath, 'utf8'), firstRepairBytes)

  const secondRepair = JSON.parse(readFileSync(secondRepairPath, 'utf8'))
  secondRepair.unitOverrides.find((item) => item.unitId === 'u1').targetSegments[0].text = 'Umsatz'
  secondRepair.unitOverrides.find((item) => item.unitId === 'u2').targetSegments[0].text = 'Umsatz'
  writeFileSync(secondRepairPath, JSON.stringify(secondRepair, null, 2))

  const finalRound = run(
    [...base, '--memory', secondRepairPath, '--apply', '--overwrite'],
    0,
    segmentsEnv,
  )
  assert.equal(finalRound.status, 'prepared')
})

test('translation preparation merges high-confidence anchor drafts and reruns the planner', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-anchor-draft-'))
  const source = join(root, 'source.pptx')
  const runDir = join(root, 'run')
  const xdoc = fakeXdoc(root)
  writeFileSync(source, translationSource)
  const base = [
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
  ]

  const inventory = run(base)
  const decisionsPath = inventory.artifacts.reviewDecisionsTemplate
  const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8'))
  decisions.byText[0].decision = 'translate'
  decisions.byText[0].reason = 'Visible slide copy in the source language.'
  writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2))
  const resumed = run([...base, '--review-decisions', decisionsPath])
  assert.equal(resumed.status, 'needs-translations')

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

  const applied = run([...base, '--apply', '--overwrite'], 0, { FAKE_PLAN_ANCHORS: 'u1' })
  assert.equal(applied.status, 'prepared')
  assert.equal(applied.summary.plan.applyGate.passed, true)
  assert.equal(applied.summary.anchorDraft.mergedUnitCount, 1)
  assert.equal(applied.artifacts.anchorDraft, join(runDir, 'i18n-anchor-draft.json'))
  assert.equal(
    applied.artifacts.anchorDraftMemory,
    join(runDir, 'translation-memory.anchor-draft.json'),
  )
  const anchorMemory = JSON.parse(readFileSync(applied.artifacts.anchorDraftMemory, 'utf8'))
  assert.deepEqual(anchorMemory.unitOverrides.find((item) => item.unitId === 'u1').anchors, [
    'Umsatz',
  ])
  const finalTranslations = JSON.parse(readFileSync(applied.artifacts.translations, 'utf8'))
  const initialTranslations = JSON.parse(
    readFileSync(applied.artifacts.translationsBeforeAnchorDraft, 'utf8'),
  )
  assert.deepEqual(finalTranslations.translations.find((item) => item.unitId === 'u1').anchors, [
    'Umsatz',
  ])
  assert.equal(
    initialTranslations.translations.find((item) => item.unitId === 'u1').anchors,
    undefined,
  )
  const finalPlan = JSON.parse(readFileSync(applied.artifacts.plan, 'utf8'))
  const initialPlan = JSON.parse(readFileSync(applied.artifacts.planBeforeAnchorDraft, 'utf8'))
  assert.equal(initialPlan.applyGate.passed, false)
  assert.equal(finalPlan.applyGate.passed, true)
})

test('the compact fill view feeds --apply --fill without touching the full memory JSON', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-fill-'))
  const source = join(root, 'source.pptx')
  const runDir = join(root, 'run')
  const xdoc = fakeXdoc(root)
  writeFileSync(source, translationSource)
  const base = [
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
  ]

  const inventory = run(base)
  assert.equal(inventory.status, 'needs-review-decisions')
  const decisionsPath = inventory.artifacts.reviewDecisionsTemplate
  const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8'))
  decisions.byText[0].decision = 'translate'
  decisions.byText[0].reason = 'Visible slide copy in the source language.'
  writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2))
  const resumed = run([...base, '--review-decisions', decisionsPath])
  assert.equal(resumed.status, 'needs-translations')
  assert.match(resumed.nextAction, /translation-memory\.fill\.jsonl/)

  const fillPath = resumed.artifacts.memoryFill
  assert.equal(fillPath, join(runDir, 'translation-memory.fill.jsonl'))
  const fillLines = readFileSync(fillPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.equal(fillLines.length, 3)
  for (const line of fillLines) {
    assert.deepEqual(Object.keys(line).sort(), ['memoryId', 'sourceText', 'targetText'])
  }
  const targets = { Revenue: 'Umsatz', 'Master title': 'Mastertitel', Forecast: 'Prognose' }
  const filled = fillLines
    .map((line) => JSON.stringify({ ...line, targetText: targets[line.sourceText] }))
    .join('\n')
  const filledPath = join(root, 'filled.jsonl')
  writeFileSync(filledPath, `${filled}\n`)

  const memoryPath = join(runDir, 'translation-memory.json')
  const memory = JSON.parse(readFileSync(memoryPath, 'utf8'))
  memory.unitOverrides.push({
    unitId: 'u3',
    reviewDecision: 'translate',
    reason: 'Visible shared layout text.',
  })
  writeFileSync(memoryPath, JSON.stringify(memory, null, 2))
  const memoryBytes = readFileSync(memoryPath, 'utf8')

  const applied = run([...base, '--apply', '--overwrite', '--fill', filledPath])
  assert.equal(applied.status, 'prepared')
  assert.equal(applied.summary.translationCount, 5)
  // The big memory JSON stays byte-identical; the merged effective memory is
  // persisted separately for audit.
  assert.equal(readFileSync(memoryPath, 'utf8'), memoryBytes)
  const mergedPath = applied.artifacts.memoryFilled
  assert.equal(mergedPath, join(runDir, 'translation-memory.filled.json'))
  const merged = JSON.parse(readFileSync(mergedPath, 'utf8'))
  assert.equal(merged.entries.find((entry) => entry.sourceText === 'Revenue').targetText, 'Umsatz')
})

test('translation preparation blocks glossary violations before i18n-plan and resumes after repair', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-constraints-'))
  const source = join(root, 'source.pptx')
  const glossary = join(root, 'glossary.json')
  const runDir = join(root, 'run')
  const xdoc = fakeXdoc(root)
  writeFileSync(source, translationSource)
  writeFileSync(
    glossary,
    JSON.stringify({
      schemaVersion: 'pptx-nova-translation-glossary/v1',
      targetLang: 'de',
      entries: [{ id: 'revenue', source: 'Revenue', target: 'Umsatz' }],
    }),
  )
  const base = [
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
  ]
  const inventory = run([...base, '--glossary', glossary])
  const decisionsPath = inventory.artifacts.reviewDecisionsTemplate
  const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8'))
  decisions.byText[0].decision = 'translate'
  decisions.byText[0].reason = 'Visible slide copy in the source language.'
  writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2))
  const needsTranslations = run([...base, '--review-decisions', decisionsPath])
  assert.equal(needsTranslations.status, 'needs-translations')
  assert.equal(needsTranslations.summary.glossary.entryCount, 1)
  assert.equal(existsSync(needsTranslations.artifacts.constraints), true)
  const memoryPath = join(runDir, 'translation-memory.json')
  const boundMemory = JSON.parse(readFileSync(memoryPath, 'utf8'))
  boundMemory.unitOverrides.push({
    unitId: 'u3',
    reviewDecision: 'translate',
    reason: 'Visible shared layout text.',
  })
  writeFileSync(memoryPath, JSON.stringify(boundMemory, null, 2))

  const fillPath = join(root, 'wrong-fill.jsonl')
  const lines = readFileSync(needsTranslations.artifacts.memoryFill, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .map((line) => ({
      ...line,
      targetText:
        line.sourceText === 'Revenue'
          ? 'Erlös'
          : line.sourceText === 'Master title'
            ? 'Mastertitel'
            : 'Prognose',
    }))
  writeFileSync(fillPath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`)
  const blocked = run([...base, '--apply', '--overwrite', '--fill', fillPath])
  assert.equal(blocked.status, 'needs-translation-constraints')
  assert.equal(blocked.summary.constraints.violationCount, 1)
  const check = JSON.parse(readFileSync(blocked.artifacts.constraintsCheck, 'utf8'))
  assert.equal(check.status, 'blocked')
  assert.equal(
    check.violations.some((item) => item.kind === 'glossary-mismatch'),
    true,
  )
  assert.equal(existsSync(join(runDir, 'i18n-plan.json')), false)

  const correctedFillPath = join(root, 'corrected-fill.jsonl')
  const corrected = lines.map((line) => ({
    ...line,
    targetText: line.sourceText === 'Revenue' ? 'Umsatz' : line.targetText,
  }))
  writeFileSync(correctedFillPath, `${corrected.map((line) => JSON.stringify(line)).join('\n')}\n`)
  const applied = run([...base, '--apply', '--overwrite', '--fill', correctedFillPath])
  assert.equal(applied.status, 'prepared')
  assert.equal(JSON.parse(readFileSync(applied.artifacts.constraintsCheck, 'utf8')).status, 'pass')
})
