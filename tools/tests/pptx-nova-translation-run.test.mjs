import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const runner = join(repoRoot, 'pptx-nova/scripts/pptx-nova-translation-run.mjs')

// The finalizer consumes the compact stdout projection of
// `xdoc pptx i18n-scan --mode candidate --json`. These tests pin the accepted
// schema contract so a runner/xdoc drift fails here instead of in the field.

function fakeXdoc(root, { candidateSchema }) {
  const path = join(root, 'fake-xdoc.mjs')
  writeFileSync(
    path,
    `#!/usr/bin/env node
const args = process.argv.slice(2)
const print = (data) => process.stdout.write(JSON.stringify(data))
if (args[0] === 'pptx' && args[1] === 'inspect') {
  print({ schemaVersion: 'pptx-inspect/v1', presentation: { slideCount: 1 }, slides: [{}] })
} else if (args[0] === 'pptx' && args[1] === 'i18n-style-diff') {
  print({ schemaVersion: 'pptx-i18n-style-diff/v1', status: 'pass', agentGate: { passed: true, blockerCount: 0 } })
} else if (args[0] === 'pptx' && args[1] === 'i18n-scan' && args.includes('candidate')) {
  print({ schemaVersion: ${JSON.stringify(candidateSchema)}, status: 'pass', summary: { verifiedCount: 7 }, agentGate: { passed: true, blockerCount: 0 } })
} else {
  process.stderr.write('fake xdoc stops before ' + args.join(' '))
  process.exit(2)
}
`,
  )
  chmodSync(path, 0o755)
  return path
}

function runFinalizer(root, candidateSchema, { preProbeRunDir = false } = {}) {
  const runDir = join(root, 'run')
  if (preProbeRunDir) {
    mkdirSync(runDir, { recursive: true })
    writeFileSync(
      join(runDir, 'xdoc-capabilities.json'),
      JSON.stringify({ schemaVersion: 'cli-agent/v1', version: 'pre-probe' }),
    )
  }
  for (const name of ['source.pptx', 'candidate.pptx']) writeFileSync(join(root, name), name)
  writeFileSync(
    join(root, 'units.json'),
    JSON.stringify({
      schemaVersion: 'pptx-i18n-scan/v1',
      i18nUnits: { units: [] },
    }),
  )
  writeFileSync(
    join(root, 'translations.json'),
    JSON.stringify({ schemaVersion: 'pptx-i18n-translations/v1', translations: [] }),
  )
  const result = spawnSync(
    process.execPath,
    [
      runner,
      '--source',
      join(root, 'source.pptx'),
      '--candidate',
      join(root, 'candidate.pptx'),
      '--units-file',
      join(root, 'units.json'),
      '--translations',
      join(root, 'translations.json'),
      '--output',
      join(root, 'final.pptx'),
      '--run-dir',
      runDir,
      '--xdoc-bin',
      fakeXdoc(root, { candidateSchema }),
      '--progress',
      'off',
      '--json',
    ],
    { encoding: 'utf8' },
  )
  const summary = JSON.parse(readFileSync(join(runDir, 'translation-run-summary.json'), 'utf8'))
  return { result, summary }
}

function gate(summary, name) {
  return summary.gates.find((entry) => entry.name === name)
}

test('candidate consistency accepts the compact pptx-i18n-candidate-result/v1 stdout schema', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-run-contract-'))
  const { result, summary } = runFinalizer(root, 'pptx-i18n-candidate-result/v1')
  assert.equal(result.status, 1)
  const contract = gate(summary, 'i18n-candidate-consistency-contract')
  assert.equal(contract?.passed, true)
  assert.equal(contract?.schemaVersion, 'pptx-i18n-candidate-result/v1')
  const consistency = gate(summary, 'i18n-candidate-consistency')
  assert.equal(consistency?.passed, true)
  assert.equal(consistency?.verifiedCount, 7)
  // The run proceeded past the consistency gates and failed only where the
  // fake xdoc stops on purpose.
  assert.equal(summary.error?.phase, 'translation-vision-diff')
})

test('candidate consistency still accepts the full pptx-i18n-scan/v1 report schema', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-run-contract-'))
  const { summary } = runFinalizer(root, 'pptx-i18n-scan/v1')
  assert.equal(gate(summary, 'i18n-candidate-consistency-contract')?.passed, true)
  assert.equal(gate(summary, 'i18n-candidate-consistency')?.passed, true)
  assert.equal(summary.error?.phase, 'translation-vision-diff')
})

test('an unknown candidate scan schema fails the contract gate and names the actual schema', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-run-contract-'))
  const { result, summary } = runFinalizer(root, 'pptx-i18n-candidate-result/v99')
  assert.equal(result.status, 1)
  const contract = gate(summary, 'i18n-candidate-consistency-contract')
  assert.equal(contract?.passed, false)
  assert.equal(contract?.schemaVersion, 'pptx-i18n-candidate-result/v99')
  assert.deepEqual(contract?.acceptedSchemaVersions, [
    'pptx-i18n-candidate-result/v1',
    'pptx-i18n-scan/v1',
  ])
  assert.equal(summary.error?.phase, 'i18n-candidate-consistency-contract')
  assert.match(summary.error?.message ?? '', /pptx-i18n-candidate-result\/v99/)
})

test('the finalizer accepts a pre-probed run directory holding only xdoc-capabilities.json', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-run-preprobe-'))
  const { summary } = runFinalizer(root, 'pptx-i18n-candidate-result/v1', { preProbeRunDir: true })
  // validatePaths accepted the pre-probed directory and the run advanced to
  // the phase where the fake xdoc stops on purpose.
  assert.equal(summary.error?.phase, 'translation-vision-diff')
})

test('typed text attribute changes fail before xdoc and suggest the complete allowlist', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-run-text-attrs-'))
  const runDir = join(root, 'run')
  for (const name of ['source.pptx', 'candidate.pptx']) writeFileSync(join(root, name), name)
  writeFileSync(
    join(root, 'units.json'),
    JSON.stringify({
      schemaVersion: 'pptx-i18n-scan/v1',
      i18nUnits: {
        units: [
          {
            unitId: 'tooltip-1',
            category: 'visibleTextAttr',
            sourceText: 'Open GitHub',
            origin: { attrName: 'tooltip' },
          },
          {
            unitId: 'tooltip-2',
            category: 'visibleTextAttr',
            sourceText: 'Next slide',
            selectors: { replaceText: { attrName: 'tooltip' } },
          },
          {
            unitId: 'descr-1',
            category: 'visibleTextAttr',
            sourceText: 'Product mark',
            origin: { attrName: 'descr' },
          },
        ],
      },
    }),
  )
  writeFileSync(
    join(root, 'translations.json'),
    JSON.stringify({
      schemaVersion: 'pptx-i18n-translations/v1',
      translations: [
        { unitId: 'tooltip-1', sourceText: 'Open GitHub', targetText: 'GitHub öffnen' },
        { unitId: 'tooltip-2', sourceText: 'Next slide', targetText: 'Nächste Folie' },
        // Explicitly unchanged typed text does not require an allowlist entry.
        { unitId: 'descr-1', sourceText: 'Product mark', targetText: 'Product mark' },
      ],
    }),
  )
  const result = spawnSync(
    process.execPath,
    [
      runner,
      '--source',
      join(root, 'source.pptx'),
      '--candidate',
      join(root, 'candidate.pptx'),
      '--units-file',
      join(root, 'units.json'),
      '--translations',
      join(root, 'translations.json'),
      '--output',
      join(root, 'final.pptx'),
      '--run-dir',
      runDir,
      '--xdoc-bin',
      join(root, 'must-not-run'),
      '--allow-text-attrs',
      'descr',
      '--progress',
      'off',
      '--json',
    ],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 1)
  const output = JSON.parse(result.stdout)
  assert.match(
    output.error?.message ?? '',
    /tooltip \(2 changed units\).*--allow-text-attrs descr,tooltip/,
  )
  assert.match(output.error?.message ?? '', /never added automatically/)
  assert.equal(existsSync(runDir), false)
})

test('typed text attribute preflight records the explicit authorization before xdoc phases', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-run-text-attrs-'))
  const runDir = join(root, 'run')
  for (const name of ['source.pptx', 'candidate.pptx']) writeFileSync(join(root, name), name)
  writeFileSync(
    join(root, 'units.json'),
    JSON.stringify({
      schemaVersion: 'pptx-i18n-scan/v1',
      i18nUnits: {
        units: [
          {
            unitId: 'tooltip-1',
            category: 'visibleTextAttr',
            sourceText: 'Open GitHub',
            origin: { attrName: 'tooltip' },
          },
        ],
      },
    }),
  )
  writeFileSync(
    join(root, 'translations.json'),
    JSON.stringify({
      schemaVersion: 'pptx-i18n-translations/v1',
      translations: [
        { unitId: 'tooltip-1', sourceText: 'Open GitHub', targetText: 'GitHub öffnen' },
      ],
    }),
  )
  const result = spawnSync(
    process.execPath,
    [
      runner,
      '--source',
      join(root, 'source.pptx'),
      '--candidate',
      join(root, 'candidate.pptx'),
      '--units-file',
      join(root, 'units.json'),
      '--translations',
      join(root, 'translations.json'),
      '--output',
      join(root, 'final.pptx'),
      '--run-dir',
      runDir,
      '--xdoc-bin',
      fakeXdoc(root, { candidateSchema: 'pptx-i18n-candidate-result/v1' }),
      '--allow-text-attrs',
      'tooltip',
      '--progress',
      'off',
      '--json',
    ],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 1)
  const summary = JSON.parse(readFileSync(join(runDir, 'translation-run-summary.json'), 'utf8'))
  const preflight = summary.phases.find((entry) => entry.name === 'typed-text-attribute-preflight')
  assert.equal(preflight?.status, 'passed')
  assert.deepEqual(preflight?.details?.required, [{ attrName: 'tooltip', unitCount: 1 }])
  assert.deepEqual(preflight?.details?.allowed, ['tooltip'])
  assert.equal(summary.error?.phase, 'translation-vision-diff')
})
