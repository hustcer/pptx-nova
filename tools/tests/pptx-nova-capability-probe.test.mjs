import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const repository = resolve(import.meta.dirname, '../..')
const probeScript = join(repository, 'pptx-nova/scripts/pptx-nova-probe.mjs')

function createFakeXdoc(dir) {
  const path = join(dir, 'fake-xdoc.mjs')
  writeFileSync(
    path,
    `#!/usr/bin/env node
const args = process.argv.slice(2)
const mode = process.env.FAKE_XDOC_MODE || 'ready'
const axis = (status) => ({
  status,
  summary: 'Explicit ' + status + ' axis.',
  limits: [{ code: status + '-boundary', description: 'Declared boundary.' }],
  officeTarget: {
    application: 'powerpoint',
    minimumVersion: '2016',
    platforms: ['windows', 'macos']
  },
  evidenceIds: ['patch-op:set-text-frame']
})
const axes = {
  create: axis('supported'),
  edit: axis('supported'),
  inspect: axis('supported'),
  preserve: axis('partial'),
  render: axis('unsupported'),
  verify: axis('inconclusive')
}
if (mode === 'malformed-axis-platform-type') {
  axes.create.officeTarget.platforms = ['windows', 'macos', 42]
}
if (mode === 'duplicate-axis-evidence') {
  axes.create.evidenceIds = ['patch-op:set-text-frame', 'patch-op:set-text-frame']
}
if (mode === 'duplicate-axis-limit-code') {
  axes.create.limits = [
    { code: 'supported-boundary', description: 'Declared boundary.' },
    { code: 'supported-boundary', description: 'Duplicate boundary.' }
  ]
}
if (mode === 'unknown-axis-evidence') {
  axes.create.evidenceIds = ['missing-evidence']
}
const axisContract = {
  schemaVersion: 'pptx-capability-axis-contract/v1',
  names: ['create', 'edit', 'inspect', 'preserve', 'render', 'verify'],
  statuses: ['supported', 'partial', 'preserve-only', 'unsupported', 'inconclusive', 'skipped'],
  definitions: {
    create: 'Create.', edit: 'Edit.', inspect: 'Inspect.',
    preserve: 'Preserve.', render: 'Render.', verify: 'Verify.'
  },
  statusDefinitions: {
    supported: 'Supported.', partial: 'Partial.', 'preserve-only': 'Preserve only.',
    unsupported: 'Unsupported.', inconclusive: 'Inconclusive.', skipped: 'Skipped.'
  },
  requiredFor: [
    { feature: 'slide-animation', subset: 'basic-shape-and-text-builds' },
    { feature: 'slide-transition', subset: 'morph-authoring' }
  ]
}
if (mode === 'invalid-axis-contract') axisContract.names = axisContract.names.slice(0, -1)
if (mode === 'invalid-required-for') axisContract.requiredFor = axisContract.requiredFor.slice(0, -1)
const animationAxes = mode === 'missing-required-axes'
  ? undefined
  : mode === 'malformed-required-axes'
    ? { ...axes, verify: { ...axes.verify, status: 'unknown' } }
    : axes
if (args[0] === 'schema') {
  if (mode === 'degraded') {
    process.stderr.write('schema unavailable\\n')
    process.exit(2)
  }
  process.stdout.write(JSON.stringify({
    version: '9.9.9 (fake)',
    schemaVersion: mode === 'future-schema' ? 'cli-agent/vNext' : 'cli-agent/v1',
    commands: {
      convert: {},
      schema: {},
      'json-rpc': {
        protocolContract: {
          schemaVersion: 'xdoc-json-rpc-contract/v1',
          protocol: 'JSON-RPC 2.0',
          transport: 'stdio',
          framing: { format: 'newline-delimited UTF-8 JSON', maxFrameBytes: 8388608 },
          ordering: { mode: 'serial' },
          lifecycle: { shutdown: 'xdoc.shutdown' },
          notifications: { requestOnlyMethods: ['pptx.apply', 'xdoc.shutdown'] },
          progress: { optInParam: 'progressToken' },
          cancellation: { notificationMethod: '$/cancelRequest', cancelledCode: -32800 },
          methods: {
            'xdoc.ping': { kind: 'read-only' },
            'xdoc.discover': { kind: 'read-only' },
            'pptx.inspect': { kind: 'read-only', requiredParams: ['inputPath'] },
            'pptx.apply': { kind: 'mutating', requiredParams: ['patch'] },
            'xdoc.shutdown': { kind: 'lifecycle', requiresId: true }
          },
          resultEnvelope: { schemaVersion: 'xdoc-json-rpc-result/v1' },
          artifactRef: { states: ['written', 'planned'] },
          errors: [{ code: -32600, message: 'Invalid Request' }]
        }
      },
      daemon: {
        inputMode: 'control',
        endpoints: {
          data: {
            stateField: 'port',
            methods: ['xdoc.ping', 'pptx.inspect', 'pptx.apply'],
            admission: 'Bounded by maxConnections.',
            maxFrameBytes: 67174400
          },
          control: {
            stateField: 'controlPort',
            methods: ['xdoc.status', 'xdoc.shutdown'],
            admission: 'Dedicated sequential listener.',
            maxFrameBytes: 65536,
            frameTimeoutMs: 1000
          }
        },
        observability: {
          statusSchema: 'xdoc-daemon-status/v2',
          activeConnections: 'Accepted data-plane handlers.',
          activeMutations: 'Protected mutations in flight.',
          mutationStartedCount: 'Cumulative protected mutations entered.',
          mutationCompletedCount: 'Cumulative protected mutations released.'
        },
        usageNotes: [
          'Inspect and apply are FIFO-serialized per filesystem-identity deck session.',
          'Shutdown drains accepted handlers without preempting mutations.'
        ],
        environment: {
          XDOC_DAEMON_STATE: 'Override state path.',
          XDOC_DAEMON_MAX_CONNECTIONS: 'Override active data-plane connections.'
        },
        defaults: {
          idleMs: 300000,
          maxSessions: 64,
          maxConnections: 64,
          maxFrameBytes: 67174400,
          controlMaxFrameBytes: 65536,
          controlFrameTimeoutMs: 1000,
          spawnTimeoutMs: 5000
        },
        subcommands: { start: {}, status: {}, stop: {} }
      },
      pptx: {
        subcommands: { apply: {}, inspect: {} },
        capabilityTruth: {
          schemaVersion: mode === 'future-truth' ? 'pptx-capability-truth/vNext' : 'pptx-capability-truth/v3',
          coverage: { operations: 'closed-world', features: 'declared-only' },
          missingMeans: 'undisclosed',
          axisContract,
          entries: [
            {
              feature: 'text', subset: 'native-authoring', status: 'supported',
              summary: 'Native text editing.', operations: ['set-text-frame'],
              limits: [{ code: 'schema-bounded', description: 'Use the schema.' }],
              evidence: [{ id: 'patch-op:set-text-frame', kind: 'operation-contract', claim: 'Declared.' }],
              recommendation: { action: 'use-operations', operations: ['set-text-frame'], note: 'Use the op.' }
            },
            {
              feature: 'slide-animation', subset: 'basic-shape-and-text-builds', status: 'supported',
              summary: 'Basic animation authoring.', operations: ['set-slide-animations'],
              limits: [{ code: 'basic-effects', description: 'Use the safe basic subset.' }],
              evidence: [{ id: 'animation-contract', kind: 'operation-contract', claim: 'Declared.' }],
              recommendation: { action: 'use-operations', operations: ['set-slide-animations'], note: 'Use the op.' },
              ...(animationAxes ? { axes: animationAxes } : {})
            },
            {
              feature: 'slide-transition', subset: 'morph-authoring', status: 'supported',
              summary: 'Morph authoring.', operations: ['set-slide-transition'],
              limits: [{ code: 'morph-modes', description: 'Use disclosed Morph modes.' }],
              evidence: [{ id: 'morph-contract', kind: 'operation-contract', claim: 'Declared.' }],
              recommendation: { action: 'use-operations', operations: ['set-slide-transition'], note: 'Use the op.' },
              axes
            },
            {
              feature: 'slide-transition', subset: 'extended-existing-effects', status: 'preserve-only',
              summary: 'Preserve an existing effect.', operations: [],
              limits: [{ code: 'no-edit', description: 'Do not edit.' }],
              evidence: [{ id: 'transition-preserve', kind: 'preservation', claim: 'Preserved.' }],
              recommendation: { action: 'inspect-and-preserve', operations: [], note: 'Keep it untouched.' }
            },
            {
              feature: 'chart-3d', subset: 'pdf-rendering', status: 'partial',
              summary: 'PDF rendering has explicit fidelity limits.', operations: [],
              limits: [{ code: 'no-pdf-parity', description: 'No PowerPoint parity.' }],
              evidence: [{ id: '3d-pdf-boundary', kind: 'policy', claim: 'Tracked separately.' }],
              recommendation: { action: 'run-visual-verification', operations: [], note: 'Verify visually.' }
            },
            {
              feature: 'chart-3d', subset: 'viewer-rendering', status: 'partial',
              summary: 'Viewer rendering has explicit fidelity limits.', operations: [],
              limits: [{ code: 'no-viewer-parity', description: 'No PowerPoint parity.' }],
              evidence: [{ id: '3d-viewer-boundary', kind: 'policy', claim: 'Tracked separately.' }],
              recommendation: { action: 'run-visual-verification', operations: [], note: 'Verify visually.' }
            }
          ],
          operationIndex: { 'set-text-frame': { feature: 'text', subset: 'native-authoring' } },
          legacyProjection: { schemaVersion: 'pptx-capability-legacy-projection/v1', lossy: true, partialStatus: 'not-represented', supported: ['set-text-frame'], preservedOnly: ['slide-transition/extended-existing-effects'], unsupported: [] }
        },
        schemaDisclosure: { modes: [{ flag: '--index' }, { flag: '--op <name>' }] },
        patchSchema: { capabilityVersion: 'fake-v1', supportedOps: ['set-text-frame', 'set-slide-transition'], operations: [{ op: 'set-text-frame' }, { op: 'set-slide-transition' }] },
        recipeOps: [], enumRegistry: { enums: {} },
        catalogs: { themes: { ids: [] }, styles: { ids: [] }, nativeDeckkits: { deckkits: [] } }
      }
    }
  }))
  process.exit(0)
}
if (args[0] === '--version') { process.stdout.write('0.1.0 (legacy)\\n'); process.exit(0) }
if (args.at(-1) === '--help') { process.stdout.write('Usage: fake xdoc\\n'); process.exit(0) }
process.exit(2)
`,
  )
  chmodSync(path, 0o755)
  return path
}

function runProbe(xdoc, args = [], env = {}) {
  return spawnSync(process.execPath, [probeScript, '--xdoc-bin', xdoc, '--json', ...args], {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

test('capability probe captures truth and satisfies an exact supported feature', () => {
  const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
  const result = runProbe(xdoc, [
    '--require-feature',
    'slide-animation/basic-shape-and-text-builds',
    '--strict',
  ])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.schemaVersion, 'pptx-nova-xdoc-capabilities/v3')
  assert.equal(report.xdoc.capabilityTruthVersion, 'pptx-capability-truth/v3')
  assert.equal(report.capabilities.capabilityTruth.entries.length, 6)
  assert.equal(
    report.capabilities.capabilityTruth.axisContract.schemaVersion,
    'pptx-capability-axis-contract/v1',
  )
  const animation = report.capabilities.capabilityTruth.entries.find(
    (entry) =>
      entry.feature === 'slide-animation' && entry.subset === 'basic-shape-and-text-builds',
  )
  assert.deepEqual(animation.axes.render, {
    status: 'unsupported',
    summary: 'Explicit unsupported axis.',
    limits: [{ code: 'unsupported-boundary', description: 'Declared boundary.' }],
    officeTarget: {
      application: 'powerpoint',
      minimumVersion: '2016',
      platforms: ['macos', 'windows'],
    },
    evidenceIds: ['patch-op:set-text-frame'],
  })
  assert.equal(report.requirements.results[0].state, 'supported')
  assert.equal(report.requirements.results[0].satisfied, true)
  assert.equal(report.requirements.results[0].axes.verify.status, 'inconclusive')
})

test('capability probe preserves the exact Agent transport contracts', () => {
  const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
  const result = runProbe(xdoc, ['--require-command', 'json-rpc', '--strict'])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)

  assert.equal(report.capabilities.agentTransports.jsonRpc.status, 'disclosed')
  assert.equal(
    report.capabilities.agentTransports.jsonRpc.schemaVersion,
    'xdoc-json-rpc-contract/v1',
  )
  assert.deepEqual(
    report.capabilities.agentTransports.jsonRpc.methods.map(({ name, kind }) => ({
      name,
      kind,
    })),
    [
      { name: 'pptx.apply', kind: 'mutating' },
      { name: 'pptx.inspect', kind: 'read-only' },
      { name: 'xdoc.discover', kind: 'read-only' },
      { name: 'xdoc.ping', kind: 'read-only' },
      { name: 'xdoc.shutdown', kind: 'lifecycle' },
    ],
  )
  assert.equal(report.capabilities.agentTransports.daemon.status, 'disclosed')
  assert.deepEqual(report.capabilities.agentTransports.daemon.subcommands, [
    'start',
    'status',
    'stop',
  ])
  assert.equal(
    report.capabilities.agentTransports.daemon.contract.endpoints.control.stateField,
    'controlPort',
  )
  assert.equal(
    report.capabilities.agentTransports.daemon.contract.observability.statusSchema,
    'xdoc-daemon-status/v2',
  )
  assert.equal(report.capabilities.agentTransports.daemon.contract.defaults.maxConnections, 64)
  assert.match(
    report.capabilities.agentTransports.daemon.contract.usageNotes[0],
    /FIFO-serialized per filesystem-identity deck session/,
  )
})

for (const [feature, state, action] of [
  ['slide-transition/extended-existing-effects', 'preserve-only', 'inspect-and-preserve'],
  ['chart-3d/pdf-rendering', 'partial', 'run-visual-verification'],
  ['chart-3d/viewer-rendering', 'partial', 'run-visual-verification'],
]) {
  test(`probe exposes ${state} limits and recommendation for ${feature}`, () => {
    const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
    const normal = runProbe(xdoc, ['--require-feature', feature])
    assert.equal(normal.status, 0, normal.stderr)
    const requirement = JSON.parse(normal.stdout).requirements.results[0]
    assert.equal(requirement.state, state)
    assert.equal(requirement.satisfied, false)
    assert.equal(requirement.recommendation.action, action)
    assert.ok(requirement.limits.length > 0)

    const strict = runProbe(xdoc, ['--require-feature', feature, '--strict'])
    assert.equal(strict.status, 2, strict.stderr)
  })
}

test('operation disclosure does not override preserve-only capability truth', () => {
  const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
  const result = runProbe(xdoc, [
    '--require-op',
    'set-slide-transition',
    '--require-feature',
    'slide-transition/extended-existing-effects',
  ])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.deepEqual(
    report.requirements.results.map(({ kind, state, satisfied }) => ({ kind, state, satisfied })),
    [
      { kind: 'operations', state: 'disclosed', satisfied: true },
      { kind: 'features', state: 'preserve-only', satisfied: false },
    ],
  )
  assert.equal(report.requirements.status, 'attention')
})

test('missing feature truth remains undisclosed rather than unsupported', () => {
  const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
  const result = runProbe(xdoc, ['--require-feature', 'future/new-subset'])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.requirements.results[0].state, 'undisclosed')
  assert.equal(report.requirements.undisclosedRequired.length, 1)
})

test('probe rejects malformed feature requirement identities', () => {
  const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
  const result = runProbe(xdoc, ['--require-feature', 'transition'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /expects feature\/subset/)
})

test('schema failure keeps feature requirements undisclosed and non-blocking by default', () => {
  const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
  const result = runProbe(xdoc, ['--require-feature', 'text/native-authoring'], {
    FAKE_XDOC_MODE: 'degraded',
  })
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, 'degraded')
  assert.equal(report.requirements.results[0].state, 'undisclosed')
})

test('unknown capability truth versions fail closed for strict feature requirements', () => {
  const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
  const result = runProbe(xdoc, ['--require-feature', 'text/native-authoring', '--strict'], {
    FAKE_XDOC_MODE: 'future-truth',
  })
  assert.equal(result.status, 2, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.xdoc.capabilityTruthVersion, 'pptx-capability-truth/vNext')
  assert.equal(report.capabilities.capabilityTruth.entries.length, 0)
  assert.equal(report.requirements.results[0].state, 'undisclosed')
  assert.ok(report.warnings.some((warning) => warning.code === 'capability-truth-unavailable'))
})

for (const mode of ['invalid-axis-contract', 'invalid-required-for']) {
  test(`${mode} makes the complete capability truth unavailable`, () => {
    const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
    const result = runProbe(xdoc, ['--require-feature', 'text/native-authoring', '--strict'], {
      FAKE_XDOC_MODE: mode,
    })
    assert.equal(result.status, 2, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.capabilities.capabilityTruth.available, false)
    assert.equal(report.capabilities.capabilityTruth.entries.length, 0)
    assert.equal(report.requirements.results[0].state, 'undisclosed')
    assert.ok(report.warnings.some((warning) => warning.code === 'capability-truth-unavailable'))
  })
}

for (const mode of [
  'missing-required-axes',
  'malformed-required-axes',
  'malformed-axis-platform-type',
  'duplicate-axis-evidence',
  'duplicate-axis-limit-code',
  'unknown-axis-evidence',
]) {
  test(`${mode} keeps the required feature undisclosed`, () => {
    const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
    const result = runProbe(
      xdoc,
      ['--require-feature', 'slide-animation/basic-shape-and-text-builds', '--strict'],
      { FAKE_XDOC_MODE: mode },
    )
    assert.equal(result.status, 2, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.capabilities.capabilityTruth.available, true)
    assert.equal(report.requirements.results[0].state, 'undisclosed')
    assert.ok(
      !report.capabilities.capabilityTruth.entries.some(
        (entry) =>
          entry.feature === 'slide-animation' && entry.subset === 'basic-shape-and-text-builds',
      ),
    )
  })
}
