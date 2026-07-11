import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const repoRoot = resolve('.')
const skillRoot = join(repoRoot, 'pptx-nova')
const rulesScript = join(skillRoot, 'scripts/pptx-nova-session-rules.mjs')
const resolveScript = join(skillRoot, 'scripts/pptx-nova-session-rules-resolve.mjs')
const checkLockScript = join(skillRoot, 'scripts/pptx-nova-check-lock.mjs')

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function runNode(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout)
  return result
}

function styleRule(overrides = {}) {
  return {
    id: 'rule-future-title-blue',
    kind: 'future-element-style',
    status: 'active',
    lifetime: 'current-deck',
    trigger: { event: 'slide-added' },
    target: { slideScope: 'future', elementKind: 'slide-title' },
    action: { fontColor: '0076A8' },
    source: {
      kind: 'user-feedback',
      turn: 3,
      quote: '后续新增页面的标题继续使用蓝色',
    },
    supersedes: [],
    ...overrides,
  }
}

function preserveRule(overrides = {}) {
  return {
    id: 'rule-preserve-non-targets',
    kind: 'preserve-invariant',
    status: 'active',
    lifetime: 'current-deck',
    trigger: { event: 'any-edit' },
    target: { scope: 'deck' },
    action: { preserve: ['non-target-shapes'] },
    source: {
      kind: 'user-feedback',
      turn: 2,
      quote: '后续修改不要改动非目标对象',
    },
    supersedes: [],
    ...overrides,
  }
}

function rulesDraft(rules = [styleRule(), preserveRule()]) {
  return {
    schemaVersion: 'pptx-nova-session-rules/v1',
    deckIdentity: { deckId: 'deck-customer-loyalty' },
    rules,
  }
}

function operationPlan(overrides = {}) {
  return {
    schemaVersion: 'pptx-nova-session-operation/v1',
    event: 'slide-added',
    slideCountDelta: 1,
    targets: [
      {
        id: 'new-slide-title',
        kind: 'produced-object',
        slide: 8,
        elementKind: 'slide-title',
        shapeName: 'S8_Title',
        opIndexes: [1, 2],
        changeCategories: ['shape', 'text'],
      },
    ],
    explicitOverrides: [],
    ...overrides,
  }
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-session-rules-'))
  const runDir = join(root, 'run')
  mkdirSync(runDir, { recursive: true })
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const draft = join(runDir, 'session-rules-draft.json')
  const rules = join(runDir, 'session-rules.json')
  const operation = join(runDir, 'session-operation.json')
  const resolution = join(runDir, 'session-rules-resolution.json')
  writeFileSync(source, 'source revision bytes')
  writeFileSync(candidate, 'candidate revision bytes')
  writeJson(draft, rulesDraft())
  writeJson(operation, operationPlan())
  return { root, runDir, source, candidate, draft, rules, operation, resolution }
}

function normalize(f) {
  const result = runNode([
    rulesScript,
    '--draft',
    f.draft,
    '--source',
    f.source,
    '--output',
    f.rules,
    '--json',
  ])
  return JSON.parse(result.stdout)
}

function resolveRules(f, expectedStatus = 0) {
  const result = runNode(
    [
      resolveScript,
      '--rules',
      f.rules,
      '--operation',
      f.operation,
      '--source',
      f.source,
      '--output',
      f.resolution,
      '--strict',
      '--json',
    ],
    expectedStatus,
  )
  return JSON.parse(result.stdout)
}

test('session rules normalizer binds a stable deck id to the current source revision', () => {
  const f = fixture()
  const rules = normalize(f)

  assert.equal(rules.schemaVersion, 'pptx-nova-session-rules/v1')
  assert.equal(rules.deckIdentity.deckId, 'deck-customer-loyalty')
  assert.equal(rules.deckIdentity.currentRevisionSha256, sha256(f.source))
  assert.equal(rules.deckIdentity.parentRevisionSha256, null)
  assert.equal(rules.rules.length, 2)
})

test('session rules normalizer defaults to the kebab-case session-rules.json artifact', () => {
  const f = fixture()
  const result = runNode([rulesScript, '--draft', f.draft, '--source', f.source, '--json'])

  assert.equal(JSON.parse(result.stdout).schemaVersion, 'pptx-nova-session-rules/v1')
  assert.equal(readFileSync(f.rules, 'utf8').startsWith('{'), true)
})

test('session rules normalizer rejects unresolved active style conflicts', () => {
  const f = fixture()
  const draft = rulesDraft([
    styleRule(),
    styleRule({ id: 'rule-future-title-red', action: { fontColor: 'D62728' } }),
  ])
  writeJson(f.draft, draft)
  const result = spawnSync(
    process.execPath,
    [rulesScript, '--draft', f.draft, '--source', f.source, '--output', f.rules],
    { cwd: repoRoot, encoding: 'utf8' },
  )

  assert.equal(result.status, 1)
  assert.match(result.stderr, /active rule conflict/)
})

test('session rules normalizer preserves superseded history without applying it', () => {
  const f = fixture()
  const old = styleRule({ status: 'superseded' })
  const current = styleRule({
    id: 'rule-future-title-navy',
    action: { fontColor: '18345E' },
    supersedes: [old.id],
  })
  writeJson(f.draft, rulesDraft([old, current]))
  const rules = normalize(f)

  assert.equal(rules.rules[0].status, 'superseded')
  assert.deepEqual(rules.rules[1].supersedes, [old.id])
})

test('session rules normalizer advances the deck revision after an accepted candidate', () => {
  const f = fixture()
  const before = normalize(f)
  const advanced = join(f.runDir, 'advanced-session-rules.json')
  const result = runNode([
    rulesScript,
    '--rules',
    f.rules,
    '--source',
    f.candidate,
    '--output',
    advanced,
    '--json',
  ])
  const after = JSON.parse(result.stdout)

  assert.equal(after.deckIdentity.parentRevisionSha256, before.deckIdentity.currentRevisionSha256)
  assert.equal(after.deckIdentity.currentRevisionSha256, sha256(f.candidate))
  assert.deepEqual(after.rules, before.rules)
})

test('resolver compiles matching rules into a deterministic edit-contract overlay', () => {
  const f = fixture()
  normalize(f)
  const report = resolveRules(f)

  assert.equal(report.status, 'pass')
  assert.equal(report.agentGate.nextAction, 'write-rule-compliant-patch')
  assert.deepEqual(
    report.applicableRules.map((item) => item.id),
    ['rule-future-title-blue', 'rule-preserve-non-targets'],
  )
  assert.deepEqual(report.contractOverlay.preserve, ['non-target-shapes'])
  assert.deepEqual(report.contractOverlay.allowedChanges, ['shape', 'text'])
  assert.deepEqual(report.contractOverlay.requiredEvidence, ['final-inspect'])
  assert.equal(report.contractOverlay.targets.length, 1)
  assert.equal(report.contractOverlay.targets[0].produced, true)
  assert.equal(report.contractOverlay.targets[0].resolvedIdentity.name, 'S8_Title')
  assert.deepEqual(report.contractOverlay.targets[0].expected.sessionRulePostconditions, [
    { kind: 'font-color', value: '0076A8' },
  ])
})

test('resolver adds no execution friction when no active rule is applicable', () => {
  const f = fixture()
  normalize(f)
  writeJson(f.operation, operationPlan({ event: 'element-added', slideCountDelta: 0, targets: [] }))
  const report = resolveRules(f)

  assert.equal(report.status, 'pass')
  assert.equal(report.applicableRules.length, 1)
  assert.equal(report.applicableRules[0].id, 'rule-preserve-non-targets')
  assert.equal(report.contractOverlay.targets.length, 0)
  assert.equal(report.agentGate.nextAction, 'continue-with-contract-overlay')
})

test('resolver ignores candidate and superseded rules', () => {
  const f = fixture()
  writeJson(
    f.draft,
    rulesDraft([styleRule({ status: 'candidate' }), preserveRule({ status: 'superseded' })]),
  )
  normalize(f)
  const report = resolveRules(f)

  assert.equal(report.applicableRules.length, 0)
  assert.equal(report.contractOverlay.targets.length, 0)
  assert.equal(report.contractOverlay.preserve.length, 0)
  assert.equal(report.agentGate.nextAction, 'continue-without-session-rules')
})

test('resolver blocks stale deck revisions before rules are applied', () => {
  const f = fixture()
  normalize(f)
  writeFileSync(f.source, 'source changed after session rules were normalized')
  const report = resolveRules(f, 2)

  assert.equal(report.status, 'fail')
  assert.equal(report.agentGate.nextAction, 'refresh-session-rules-revision')
  assert.ok(report.blockers.some((item) => item.code === 'session-rules-revision-stale'))
})

test('resolver requires an explicit user quote to suppress an active rule', () => {
  const f = fixture()
  normalize(f)
  writeJson(
    f.operation,
    operationPlan({
      explicitOverrides: [
        {
          ruleId: 'rule-future-title-blue',
          source: { kind: 'current-user-request', quote: '这次新增页标题改用红色' },
        },
      ],
    }),
  )
  const report = resolveRules(f)

  assert.deepEqual(
    report.applicableRules.map((item) => item.id),
    ['rule-preserve-non-targets'],
  )
  assert.ok(
    report.notApplicableRules.some(
      (item) => item.id === 'rule-future-title-blue' && item.reason === 'explicitly-overridden',
    ),
  )
})

test('resolver rejects an override without a current user request quote', () => {
  const f = fixture()
  normalize(f)
  writeJson(
    f.operation,
    operationPlan({
      explicitOverrides: [
        { ruleId: 'rule-future-title-blue', source: { kind: 'current-user-request' } },
      ],
    }),
  )
  const result = spawnSync(
    process.execPath,
    [resolveScript, '--rules', f.rules, '--operation', f.operation, '--source', f.source, '--json'],
    { cwd: repoRoot, encoding: 'utf8' },
  )

  assert.equal(result.status, 1)
  assert.match(result.stderr, /explicitOverrides.*quote/)
})

test('resolver rejects an explicit override that names an unknown rule', () => {
  const f = fixture()
  normalize(f)
  writeJson(
    f.operation,
    operationPlan({
      explicitOverrides: [
        {
          ruleId: 'rule-does-not-exist',
          source: { kind: 'current-user-request', quote: '这次不使用那条规则' },
        },
      ],
    }),
  )
  const result = spawnSync(
    process.execPath,
    [resolveScript, '--rules', f.rules, '--operation', f.operation, '--source', f.source, '--json'],
    { cwd: repoRoot, encoding: 'utf8' },
  )

  assert.equal(result.status, 1)
  assert.match(result.stderr, /unknown session rule/)
})

test('resolver blocks an operation that contradicts an active preserve invariant', () => {
  const f = fixture()
  writeJson(
    f.draft,
    rulesDraft([
      preserveRule({
        id: 'rule-preserve-slide-count',
        action: { preserve: ['slide-count'] },
        source: { kind: 'user-feedback', quote: '后续修改都不要改变页数' },
      }),
    ]),
  )
  normalize(f)
  const report = resolveRules(f, 2)

  assert.equal(report.status, 'fail')
  assert.equal(report.agentGate.nextAction, 'block-and-request-user-decision')
  assert.ok(report.blockers.some((item) => item.code === 'session-rule-operation-conflict'))
})

test('check-lock validates a relative sessionRulesPath', () => {
  const f = fixture()
  normalize(f)
  const lock = join(f.runDir, 'deck_lock.json')
  writeJson(lock, {
    schemaVersion: 'pptx-nova-deck-lock/v1',
    mode: 'edit',
    objective: 'Session rules lock test',
    outline: { slides: [{ title: 'Test' }] },
    canvas: { format: 'ppt169' },
    colors: { primary: '0076A8' },
    typography: { body: { fontFamily: 'Arial' } },
    slides: [{ title: 'Test', slideType: 'statement' }],
    sessionRulesPath: 'session-rules.json',
  })
  const report = JSON.parse(runNode([checkLockScript, '--lock', lock, '--json']).stdout)

  assert.equal(report.valid, true)
  assert.equal(report.summary.sessionRules, 2)
})

test('check-lock rejects a missing sessionRulesPath artifact', () => {
  const f = fixture()
  const lock = join(f.runDir, 'deck_lock.json')
  writeJson(lock, {
    schemaVersion: 'pptx-nova-deck-lock/v1',
    mode: 'edit',
    objective: 'Session rules missing test',
    outline: { slides: [{ title: 'Test' }] },
    canvas: { format: 'ppt169' },
    colors: { primary: '0076A8' },
    typography: { body: { fontFamily: 'Arial' } },
    slides: [{ title: 'Test', slideType: 'statement' }],
    sessionRulesPath: 'missing-session-rules.json',
  })
  const report = JSON.parse(runNode([checkLockScript, '--lock', lock, '--json'], 1).stdout)

  assert.equal(report.valid, false)
  assert.ok(report.errors.some((item) => item.code === 'session-rules-missing'))
})
