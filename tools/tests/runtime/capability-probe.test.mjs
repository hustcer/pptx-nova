import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const repository = resolve(import.meta.dirname, '../../..')
const probeScript = join(repository, 'pptx-nova/scripts/cli/runtime/probe.mjs')

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
const extendedAxes = mode.startsWith('extended-')
if (extendedAxes) {
  axisContract.requiredFor.unshift({ feature: 'shape-3d', subset: 'local-declarations' })
  axisContract.requiredFor.reverse()
}
if (mode === 'duplicate-required-for') axisContract.requiredFor.push(axisContract.requiredFor[0])
const shapeAxes = {
  create: axis('unsupported'), edit: axis('unsupported'), inspect: axis('supported'),
  preserve: axis('partial'), render: axis('unsupported'), verify: axis('inconclusive')
}
if (mode === 'extended-malformed-axes') shapeAxes.verify.status = 'unknown'
const extraEntries = extendedAxes ? [{
  feature: 'shape-3d', subset: 'local-declarations', status: 'preserve-only',
  summary: 'Read and preserve local declarations.', operations: [],
  limits: [{ code: 'local-only', description: 'No inherited or visual proof.' }],
  evidence: [{ id: 'shape-declarations', kind: 'behavior', claim: 'Read-only facts.' }],
  recommendation: { action: 'inspect-and-preserve', operations: [], note: 'Preserve source XML.' },
  ...(mode === 'extended-missing-axes' ? {} : { axes: shapeAxes })
}] : []
const animationAxes = mode === 'missing-required-axes'
  ? undefined
  : mode === 'malformed-required-axes'
    ? { ...axes, verify: { ...axes.verify, status: 'unknown' } }
    : axes
const slicingFlags = [{ flag: '--fields a,b,c' }, { flag: '--defs summary|full' }]
const schemaDisclosure = {
  modes: [{ flag: '--mode index' }, { flag: '--mode ops --ops a,b,c' },
    ...(mode === 'legacy-slicing' ? slicingFlags : [])],
  ...(mode === 'refinement-slicing' || mode === 'command-slicing'
    ? { refinements: slicingFlags } : {})
}
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
      schema: mode === 'command-slicing' ? { disclosure: schemaDisclosure } : {},
      mcp: {
        inputMode: 'stream',
        ioContract: {
          stdin: { format: 'ndjson', maxFrameBytes: 8388608 },
          stdout: { format: 'ndjson', usage: 'protocol-frames-only' },
          stderr: { usage: 'logs-and-process-diagnostics-only' }
        },
        protocolContract: {
          schemaVersion: 'xdoc-mcp-contract/v1',
          protocol: 'Model Context Protocol',
          transport: 'stdio',
          scope: 'tools-only',
          protocolVersions: {
            modern: ['2026-07-28'],
            legacy: ['2025-11-25', '2025-06-18', '2025-03-26']
          },
          framing: { format: 'newline-delimited UTF-8 JSON', maxFrameBytes: 8388608 },
          methods: {
            modern: ['server/discover', 'tools/list', 'tools/call'],
            legacy: ['initialize', 'notifications/initialized', 'tools/list', 'tools/call']
          },
          tools: [
            { name: 'xdoc_discover', agentMethod: 'xdoc.schema' },
            { name: 'pptx_inspect', agentMethod: 'pptx.inspect' },
            { name: 'pptx_apply', agentMethod: 'pptx.apply' }
          ],
          resultEncoding: {
            envelopeSchemaVersion: 'xdoc-mcp-tool-result/v1',
            businessErrorRule: 'A business failure uses isError true.'
          },
          artifactRef: { states: ['written', 'planned'] },
          security: {
            paths: 'Clients should pass absolute paths.',
            overwrite: 'Defaults to false.'
          },
          errors: [{ code: -32600, message: 'Invalid Request' }]
        },
        usageNotes: [
          'Configure an MCP client with command xdoc and args [mcp].',
          'Pass absolute paths.'
        ]
      },
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
            ...extraEntries,
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
        ...(mode === 'command-slicing' ? {} : { schemaDisclosure }),
        patchSchema: { capabilityVersion: 'fake-v1', supportedOps: ['set-text-frame', 'set-slide-transition'], operations: [{ op: 'set-text-frame' }, { op: 'set-slide-transition' }] },
        recipeOps: [], enumRegistry: { enums: {} },
        catalogs: { themes: { ids: [] }, styles: { ids: [] }, nativeDeckkits: { deckkits: [] } }
      }
    }
  }))
  process.exit(0)
}
if (args[0] === '--version') { process.stdout.write('0.1.0 (legacy)\\n'); process.exit(0) }
if (args.at(-1) === '--help') {
  process.stdout.write(process.env.FAKE_XDOC_HELP ?? 'Usage: fake xdoc\\n')
  process.exit(0)
}
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

test('probe does not promote help prose, examples or longer option names to supported flags', () => {
  const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
  const result = runProbe(xdoc, [], {
    FAKE_XDOC_HELP: [
      'Usage: xdoc convert [options] <inputs...>',
      'Use pptx preview --json for structured previews.',
      'Options:',
      '  -h, --help              Show help; use --report with other commands.',
      '  --output-dir <path>     Not the single-file --output option.',
      '  --json-format <value>   Not a JSON stdout declaration.',
      '    --json is mentioned in continuation prose only.',
      'Examples:',
      '  xdoc check deck.pptx -o check.json --report summary.json',
    ].join('\n'),
  })
  assert.equal(result.status, 0, result.stderr)
  const flags = JSON.parse(result.stdout).capabilities.commandFlags
  for (const name of ['convert', 'check']) {
    assert.equal(flags[name].helpAvailable, true)
    assert.equal(flags[name].jsonStdout, false)
    assert.equal(flags[name].reportFile, false)
    assert.equal(flags[name].outputFile, false)
  }
  assert.equal(flags.pptx.jsonStdout, false)
})

test('probe recognizes standalone and short-alias option declarations with CRLF help', () => {
  const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
  const result = runProbe(xdoc, [], {
    FAKE_XDOC_HELP: [
      'Options:',
      '  --report <path>        Write a summary.',
      '  -o, --output <path>    Write the output.',
      '  --json',
    ].join('\r\n'),
  })
  assert.equal(result.status, 0, result.stderr)
  const flags = JSON.parse(result.stdout).capabilities.commandFlags
  for (const name of ['convert', 'check']) {
    assert.equal(flags[name].jsonStdout, true)
    assert.equal(flags[name].reportFile, true)
    assert.equal(flags[name].outputFile, true)
  }
  assert.equal(flags.pptx.jsonStdout, true)
})

for (const mode of ['legacy-slicing', 'refinement-slicing', 'command-slicing']) {
  test(`probe discovers field and definition projection from ${mode}`, () => {
    const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
    const result = runProbe(xdoc, [], { FAKE_XDOC_MODE: mode })
    assert.equal(result.status, 0, result.stderr)
    const slicing = JSON.parse(result.stdout).capabilities.schemaSlicing
    assert.equal(slicing.available, true)
    assert.equal(slicing.fieldsAvailable, true)
    assert.equal(slicing.defsAvailable, true)
    assert.deepEqual(slicing.defsModes, ['summary', 'full'])
    assert.equal(slicing.summaryDefsAvailable, true)
  })
}

test('probe does not infer projection flags from operation disclosure alone', () => {
  const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
  const result = runProbe(xdoc)
  assert.equal(result.status, 0, result.stderr)
  const slicing = JSON.parse(result.stdout).capabilities.schemaSlicing
  assert.equal(slicing.fieldsAvailable, false)
  assert.equal(slicing.defsAvailable, false)
  assert.equal(slicing.summaryDefsAvailable, false)
})

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

test('additional required axes preserve existing capabilities and Shape 3D boundaries', () => {
  const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
  const result = runProbe(
    xdoc,
    ['--require-feature', 'slide-animation/basic-shape-and-text-builds', '--strict'],
    { FAKE_XDOC_MODE: 'extended-valid-axes' },
  )
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  const truth = report.capabilities.capabilityTruth
  assert.equal(truth.available, true)
  assert.equal(truth.entries.length, 7)
  assert.equal(truth.axisContract.requiredFor.length, 3)
  const shape = truth.entries.find((entry) => entry.feature === 'shape-3d')
  assert.equal(shape.status, 'preserve-only')
  assert.deepEqual(
    Object.fromEntries(Object.entries(shape.axes).map(([key, value]) => [key, value.status])),
    {
      create: 'unsupported',
      edit: 'unsupported',
      inspect: 'supported',
      preserve: 'partial',
      render: 'unsupported',
      verify: 'inconclusive',
    },
  )
  assert.equal(report.requirements.results[0].satisfied, true)
  assert.equal(report.warnings.length, 0)

  const strict = runProbe(xdoc, ['--require-feature', 'shape-3d/local-declarations', '--strict'], {
    FAKE_XDOC_MODE: 'extended-valid-axes',
  })
  assert.equal(strict.status, 2, strict.stderr)
  assert.equal(JSON.parse(strict.stdout).requirements.results[0].state, 'preserve-only')
})

for (const mode of ['extended-missing-axes', 'extended-malformed-axes']) {
  test(`${mode} withholds the new feature without losing valid existing capabilities`, () => {
    const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
    const result = runProbe(
      xdoc,
      [
        '--require-feature',
        'shape-3d/local-declarations',
        '--require-feature',
        'slide-animation/basic-shape-and-text-builds',
        '--strict',
      ],
      { FAKE_XDOC_MODE: mode },
    )
    assert.equal(result.status, 2, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.capabilities.capabilityTruth.available, true)
    assert.deepEqual(
      report.requirements.results.map((item) => item.state),
      ['undisclosed', 'supported'],
    )
    assert.equal(report.capabilities.capabilityTruth.entries.length, 6)
  })
}

test('capability probe preserves the exact Agent transport contracts', () => {
  const xdoc = createFakeXdoc(mkdtempSync(join(tmpdir(), 'nova-probe-')))
  const result = runProbe(xdoc, [
    '--require-command',
    'mcp',
    '--require-command',
    'json-rpc',
    '--strict',
  ])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)

  assert.equal(report.capabilities.agentTransports.mcp.status, 'disclosed')
  assert.equal(report.capabilities.agentTransports.mcp.schemaVersion, 'xdoc-mcp-contract/v1')
  assert.deepEqual(
    report.capabilities.agentTransports.mcp.tools.map(({ name, agentMethod }) => ({
      name,
      agentMethod,
    })),
    [
      { name: 'xdoc_discover', agentMethod: 'xdoc.schema' },
      { name: 'pptx_inspect', agentMethod: 'pptx.inspect' },
      { name: 'pptx_apply', agentMethod: 'pptx.apply' },
    ],
  )
  assert.deepEqual(report.capabilities.agentTransports.mcp.contract.protocolVersions.legacy, [
    '2025-11-25',
    '2025-06-18',
    '2025-03-26',
  ])
  assert.equal(
    report.capabilities.agentTransports.mcp.contract.resultEncoding.envelopeSchemaVersion,
    'xdoc-mcp-tool-result/v1',
  )
  assert.match(report.capabilities.agentTransports.mcp.contract.security.paths, /absolute paths/)
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

for (const mode of ['invalid-axis-contract', 'invalid-required-for', 'duplicate-required-for']) {
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
