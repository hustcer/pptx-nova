import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileIdentity, runNodeStatus, skillPath, skillUrl, writeJson } from '../helpers/common.mjs'
import { writeFakeXdoc } from '../helpers/fake-xdoc.mjs'
import { readRefurbishSummary } from '../helpers/runner-fixtures.mjs'
const { validateAuthoringPatch } = await import(
  skillUrl('scripts/lib/refurbish/authoring-patch.mjs')
)

test('design-led patch is bound to the exact source and selected kit', () => {
  const sourceSha256 = 'a'.repeat(64)
  const patch = {
    schemaVersion: 'pptx-patch/v1',
    metadata: { deckkit: 'example', refurbishSourceSha256: sourceSha256 },
    ops: [{ op: 'set-shape' }],
  }
  assert.equal(validateAuthoringPatch(patch, { sourceSha256, deckkit: 'example' }), patch)
  assert.throws(
    () => validateAuthoringPatch(patch, { sourceSha256: 'b'.repeat(64), deckkit: 'example' }),
    /source/,
  )
  assert.throws(() => validateAuthoringPatch(patch, { sourceSha256, deckkit: 'other' }), /DeckKit/)
  assert.throws(
    () => validateAuthoringPatch({ ...patch, ops: [] }, { sourceSha256, deckkit: 'example' }),
    /nonempty/,
  )
  assert.throws(
    () =>
      validateAuthoringPatch(
        { ...patch, schemaVersion: 'other' },
        { sourceSha256, deckkit: 'example' },
      ),
    /pptx-patch/,
  )
})

function runnerFixture() {
  const root = mkdtempSync(join(tmpdir(), 'refurbish-authoring-'))
  const source = join(root, 'source.pptx')
  const patchPath = join(root, 'authoring.json')
  const manifest = join(root, 'assets_manifest.json')
  const runDir = join(root, 'run')
  writeFileSync(source, 'source')
  mkdirSync(join(root, 'assets'))
  writeFileSync(join(root, 'assets', 'proof.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  writeJson(manifest, {
    schemaVersion: 'pptx-nova-assets-manifest/v1',
    assetRoot: 'assets',
    entries: [{ id: 'proof', kind: 'image', path: 'proof.svg', pptxUse: { ratio: '16:9' } }],
  })
  const patch = {
    schemaVersion: 'pptx-patch/v1',
    metadata: { deckkit: 'mckinsey-blue', refurbishSourceSha256: fileIdentity(source).sha256 },
    ops: [
      {
        op: 'add-image',
        slide: 0,
        assetSource: { path: 'assets/proof.svg', mime: 'image/svg+xml' },
      },
    ],
  }
  writeJson(patchPath, patch)
  const fake = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const args = process.argv.slice(2)
const value = flag => args[args.indexOf(flag) + 1]
const print = report => process.stdout.write(JSON.stringify(report))
if (args[0] === 'schema') {
  print({ version: '9.9.9 (fake)', schemaVersion: 'cli-agent/v1', capabilities: {}, commands: { pptx: {
    subcommands: { inspect: {}, apply: {}, 'refurbish-skin': {}, 'chrome-detect': {}, 'vision-diff': {}, 'refurbish-audit': {}, preview: {}, diff: {} },
    patchSchema: {}, catalogs: { nativeDeckkits: { deckkits: [{ id: 'mckinsey-blue', readiness: 'production' }] } }
  } } })
} else if (args[1] === 'inspect') {
  print({ schemaVersion: 'pptx-inspect/v1', presentation: { slideCount: 1, size: { width: '10in', height: '5.625in' } }, slides: [{ index: 0, shapes: [] }] })
} else if (args[1] === 'chrome-detect') {
  print({ schemaVersion: 'pptx-chrome-detect/v1', status: 'success', slides: [] })
} else if (args[1] === 'apply') {
  const patch = JSON.parse(readFileSync(value('-p'), 'utf8'))
  const asset = patch.ops.find(op => op.assetSource?.path)?.assetSource.path
  if (asset) {
    if (!args.includes('--asset-root')) throw new Error('missing --asset-root')
    if (!args.includes('--allow-raw-xml')) throw new Error('missing --allow-raw-xml')
    readFileSync(join(value('--asset-root'), asset))
  }
  appendFileSync(process.env.AUTHORING_APPLY_LOG, JSON.stringify(args) + '\\n')
  print({ schemaVersion: args.includes('--dry-run') ? 'pptx-dry-run/v1' : 'pptx-apply/v1',
    status: args.includes('--dry-run') ? 'success' : 'failed' })
} else { throw new Error('unexpected command: ' + args.join(' ')) }
`,
  )
  const args = [
    skillPath('scripts/cli/refurbish/run.mjs'),
    '--deckkit',
    'mckinsey-blue',
    '--source',
    source,
    '--output',
    join(root, 'out.pptx'),
    '--run-dir',
    runDir,
    '--xdoc-bin',
    fake,
    '--json',
    '--progress',
    'off',
  ]
  const options = { env: { ...process.env, AUTHORING_APPLY_LOG: join(root, 'apply.jsonl') } }
  return { root, patchPath, manifest, runDir, patch, args, options }
}

test('authored asset patch passes lock and propagates asset root and raw opt-in to both apply phases', () => {
  const f = runnerFixture()
  const result = runNodeStatus(
    [...f.args, '--authoring-patch', f.patchPath, '--assets', f.manifest, '--allow-raw-xml'],
    1,
    f.options,
  )
  assert.ok(result.stdout.trim(), result.stderr)
  const summary = readRefurbishSummary(result)
  // The fixture stops at apply, after independently checking both resource reads.
  assert.equal(summary.error.phase, 'apply')
  assert.equal(summary.gates.find((g) => g.name === 'check-lock').passed, true)
  const calls = readFileSync(join(f.root, 'apply.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(calls.length, 2)
  for (const args of calls) {
    assert.equal(args[args.indexOf('--asset-root') + 1], dirname(f.manifest))
    assert.ok(args.includes('--allow-raw-xml'))
  }
  assert.deepEqual(JSON.parse(readFileSync(join(f.runDir, 'patch.json'), 'utf8')), f.patch)
  assert.ok(existsSync(join(f.runDir, 'generated-fallback-patch.json')))
  assert.match(summary.agentSummary.nextSteps.recoveryCommand, /--authoring-patch/)
  assert.match(summary.agentSummary.nextSteps.recoveryCommand, /--assets/)
  assert.match(summary.agentSummary.nextSteps.recoveryCommand, /--allow-raw-xml/)
  assert.equal(existsSync(join(f.root, 'out.pptx')), false)
})

test('multi-column review selects fallback even when the kit supports native skinning', () => {
  const f = runnerFixture()
  const review = join(f.root, 'review.json')
  writeJson(review, {})
  const summary = readRefurbishSummary(
    runNodeStatus([...f.args, '--multi-column-review', review], 1, f.options),
  )
  assert.equal(summary.route.planned, 'fallback-patch')
  assert.equal(summary.error.phase, 'apply')
  assert.match(summary.agentSummary.nextSteps.recoveryCommand, /--multi-column-review/)
})

test('fallback-only inputs reject incompatible flags before running xdoc', () => {
  const f = runnerFixture()
  for (const [flags, message] of [
    [['--multi-column-review', f.patchPath, '--route', 'native'], /multi-column-review.*native/],
    [['--allow-raw-xml'], /allow-raw-xml.*authoring-patch/],
    [['--assets', f.manifest], /assets.*authoring-patch/],
    [['--authoring-patch', join(f.root, 'missing.json')], /authoring patch.*not.*file/],
  ]) {
    const result = runNodeStatus([...f.args, ...flags], 1, f.options)
    assert.match(result.stderr || result.stdout, message)
    assert.equal(existsSync(f.runDir), false)
  }
})
