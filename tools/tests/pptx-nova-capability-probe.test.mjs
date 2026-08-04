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
        environment: { XDOC_DAEMON_STATE: 'Override state path.' },
        defaults: { idleMs: 300000, maxSessions: 64, spawnTimeoutMs: 5000 },
        subcommands: { start: {}, status: {}, stop: {} }
      },
      pptx: {
        subcommands: { apply: {}, inspect: {} },
        capabilityTruth: {
          schemaVersion: mode === 'future-truth' ? 'pptx-capability-truth/vNext' : 'pptx-capability-truth/v2',
          coverage: { operations: 'closed-world', features: 'declared-only' },
          missingMeans: 'undisclosed',
          entries: [
            {
              feature: 'text', subset: 'native-authoring', status: 'supported',
              summary: 'Native text editing.', operations: ['set-text-frame'],
              limits: [{ code: 'schema-bounded', description: 'Use the schema.' }],
              evidence: [{ id: 'patch-op:set-text-frame', kind: 'operation-contract', claim: 'Declared.' }],
              recommendation: { action: 'use-operations', operations: ['set-text-frame'], note: 'Use the op.' }
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
  const result = runProbe(xdoc, ['--require-feature', 'text/native-authoring', '--strict'])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.schemaVersion, 'pptx-nova-xdoc-capabilities/v2')
  assert.equal(report.xdoc.capabilityTruthVersion, 'pptx-capability-truth/v2')
  assert.equal(report.capabilities.capabilityTruth.entries.length, 4)
  assert.equal(report.requirements.results[0].state, 'supported')
  assert.equal(report.requirements.results[0].satisfied, true)
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
