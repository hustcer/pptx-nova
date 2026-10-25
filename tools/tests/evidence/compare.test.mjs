import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { repoRoot, runNode, skillPath } from '../helpers/common.mjs'
import { writeFakeXdoc, writeMultipartContactDiffXdoc } from '../helpers/fake-xdoc.mjs'

test('translation compare delegates rendering to xdoc contact-diff', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-compare-'))
  const source = join(dir, 'source.pptx')
  const candidate = join(dir, 'candidate.pptx')
  const runDir = join(dir, 'run')
  const output = join(runDir, 'translation-compare.png')
  const reportPath = join(runDir, 'translation-compare.json')
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')

  const fakeXdoc = writeFakeXdoc(
    dir,
    `#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : ''
}
const identity = (path) => {
  const bytes = readFileSync(path)
  return { path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}

if (args[0] === 'pptx' && args[1] === 'contact-diff') {
  const output = valueAfter('--output')
  const dpi = Number(valueAfter('--dpi'))
  writeFileSync(output, 'contact diff png')
  process.stdout.write(JSON.stringify({
    schemaVersion: 'pptx-contact-diff/v1',
    status: 'success',
    baseline: identity(valueAfter('--source')),
    target: identity(valueAfter('--candidate')),
    baselinePath: valueAfter('--source'),
    targetPath: valueAfter('--candidate'),
    outputPath: output,
    summary: { pairCount: 1, scopeMode: 'scoped', dpi, slides: valueAfter('--slides') },
    agentGate: { passed: true, status: 'pass', scopeMode: 'scoped', pairCount: 1 },
    render: { path: output, width: 100, height: 56, dpi }
  }))
} else {
  process.stderr.write('unexpected fake xdoc command: ' + args.join(' '))
  process.exit(2)
}
`,
  )

  const result = runNode([
    skillPath('scripts/cli/review/compare.mjs'),
    '--source',
    source,
    '--candidate',
    candidate,
    '--run-dir',
    runDir,
    '--kind',
    'translation',
    '--output',
    output,
    '--report',
    reportPath,
    '--slides',
    '3',
    '--dpi',
    '216',
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])
  const report = JSON.parse(result.stdout)
  assert.equal(report.schemaVersion, 'pptx-contact-diff/v1')
  assert.equal(report.outputPath, output)
  assert.equal(report.summary.slides, '3')
  assert.equal(report.render.dpi, 216)
  assert.equal(readFileSync(reportPath, 'utf8'), `${JSON.stringify(report, null, 2)}\n`)
})

test('compare splits 48 slides into complete 20/20/8 high-DPI parts and writes a manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-multipart-compare-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const runDir = join(root, 'run')
  const log = join(root, 'xdoc.log')
  const fakeXdoc = writeMultipartContactDiffXdoc(root)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')

  const result = runNode(
    [
      skillPath('scripts/cli/review/compare.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--run-dir',
      runDir,
      '--kind',
      'refurbish',
      '--slide-count',
      '48',
      '--compare-chunk-size',
      '20',
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    { env: { ...process.env, FAKE_XDOC_LOG: log } },
  )
  const manifest = JSON.parse(result.stdout)

  assert.equal(manifest.schemaVersion, 'pptx-nova-compare-manifest/v1')
  assert.equal(manifest.status, 'success')
  assert.equal(manifest.slideCount, 48)
  assert.equal(manifest.chunkSize, 20)
  assert.deepEqual(
    manifest.parts.map((part) => [part.selector, part.pairCount, part.dpi]),
    [
      ['1-20', 20, 192],
      ['21-40', 20, 192],
      ['41-48', 8, 192],
    ],
  )
  assert.deepEqual(manifest.coverage.missingSlides, [])
  assert.deepEqual(manifest.coverage.duplicateSlides, [])
  assert.equal(manifest.agentGate.passed, true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare-01.png')), true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare-02.png')), true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare-03.png')), true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare.png')), false)
  assert.equal(existsSync(join(runDir, 'refurbish-compare.json')), true)
  assert.deepEqual(
    readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const entry = JSON.parse(line)
        return [entry.selector, entry.dpi]
      })
      .sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true })),
    [
      ['1-20', 192],
      ['21-40', 192],
      ['41-48', 192],
    ],
  )
})

test('compare renders parts concurrently and keeps the manifest ordered by part number', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-multipart-concurrent-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const runDir = join(root, 'run')
  const log = join(root, 'xdoc.log')
  const fakeXdoc = writeMultipartContactDiffXdoc(root)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')

  const result = runNode(
    [
      skillPath('scripts/cli/review/compare.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--run-dir',
      runDir,
      '--kind',
      'refurbish',
      '--slide-count',
      '48',
      '--compare-chunk-size',
      '20',
      '--compare-concurrency',
      '3',
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    {
      env: {
        ...process.env,
        FAKE_XDOC_LOG: log,
        // The first part finishes last so completion order is 3, 2, 1.
        FAKE_XDOC_DELAY_MAP: JSON.stringify({ '1-20': 450, '21-40': 250, '41-48': 50 }),
      },
    },
  )
  const manifest = JSON.parse(result.stdout)

  assert.equal(manifest.status, 'success')
  assert.equal(manifest.concurrency, 3)
  assert.deepEqual(
    manifest.parts.map((part) => [part.partNumber, part.selector, part.pairCount]),
    [
      [1, '1-20', 20],
      [2, '21-40', 20],
      [3, '41-48', 8],
    ],
  )
  assert.deepEqual(manifest.coverage.missingSlides, [])
  assert.equal(manifest.agentGate.passed, true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare-01.png')), true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare-02.png')), true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare-03.png')), true)
  // Serial execution can never interleave: each fake xdoc process exits (and
  // logs its window) before the next one boots, so serial [startedAt, endedAt]
  // windows are pairwise disjoint. Concurrent parts must overlap somewhere.
  // Asserting on the logged windows instead of total wall-clock keeps the test
  // independent of process-spawn overhead on slow CI runners.
  const windows = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const { selector, startedAt, endedAt } = JSON.parse(line)
      return { selector, startedAt, endedAt }
    })
  assert.equal(windows.length, 3)
  const overlaps = windows.some((a, i) =>
    windows.some((b, j) => i < j && a.startedAt < b.endedAt && b.startedAt < a.endedAt),
  )
  assert.ok(overlaps, `expected concurrent parts to overlap, windows ${JSON.stringify(windows)}`)
})

test('compare streams heartbeat progress without corrupting JSON stdout', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-compare-progress-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const runDir = join(root, 'run')
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const valueAfter = (flag) => args[args.indexOf(flag) + 1]
const identity = (path) => {
  const bytes = readFileSync(path)
  return { path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
await new Promise((resolve) => setTimeout(resolve, 80))
const output = valueAfter('--output')
writeFileSync(output, 'contact diff png')
process.stdout.write(JSON.stringify({
  schemaVersion: 'pptx-contact-diff/v1',
  status: 'success',
  baseline: identity(valueAfter('--source')),
  target: identity(valueAfter('--candidate')),
  baselinePath: valueAfter('--source'),
  targetPath: valueAfter('--candidate'),
  outputPath: output,
  summary: { pairCount: 1, scopeMode: 'all-slides', dpi: Number(valueAfter('--dpi')) },
  agentGate: { passed: true, status: 'pass', scopeMode: 'all-slides', pairCount: 1 },
  render: { path: output, width: 100, height: 56, dpi: Number(valueAfter('--dpi')) }
}))
`,
  )
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')

  const result = runNode(
    [
      skillPath('scripts/cli/review/compare.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--run-dir',
      runDir,
      '--kind',
      'refurbish',
      '--slide-count',
      '1',
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    {
      env: {
        ...process.env,
        PPTX_NOVA_PROGRESS_FD: '1',
        PPTX_NOVA_PROGRESS_HEARTBEAT_MS: '20',
      },
    },
  )
  const report = JSON.parse(result.stdout)
  const progressEvents = result.stderr
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.equal(report.status, 'success')
  assert.ok(progressEvents.some((event) => event.event === 'compare-start'))
  assert.ok(
    progressEvents.some(
      (event) =>
        event.event === 'command-heartbeat' &&
        event.executable &&
        Number.isInteger(event.argumentCount) &&
        !('command' in event),
    ),
  )
  assert.ok(progressEvents.some((event) => event.event === 'compare-part-complete'))
  assert.ok(progressEvents.some((event) => event.event === 'compare-complete'))
})

test('compare retries only a retryable RenderError part at 144 DPI', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-multipart-retry-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const runDir = join(root, 'run')
  const log = join(root, 'xdoc.log')
  const fakeXdoc = writeMultipartContactDiffXdoc(root)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')

  const result = runNode(
    [
      skillPath('scripts/cli/review/compare.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--run-dir',
      runDir,
      '--kind',
      'refurbish',
      '--slide-count',
      '48',
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    {
      env: {
        ...process.env,
        FAKE_XDOC_LOG: log,
        FAKE_XDOC_MODE: 'retry-part-2',
      },
    },
  )
  const manifest = JSON.parse(result.stdout)
  assert.deepEqual(
    manifest.parts.map((part) => part.dpi),
    [192, 144, 192],
  )
  assert.deepEqual(
    manifest.parts[1].attempts.map((attempt) => [attempt.dpi, attempt.status]),
    [
      [192, 'failed'],
      [144, 'success'],
    ],
  )
  assert.equal(manifest.parts[1].attempts[0].error.reason, 'canvas-dimension-limit')
})

test('compare keeps the single-file contract for small decks and may retry it at 144 DPI', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-single-compare-retry-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const runDir = join(root, 'run')
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const valueAfter = (flag) => args[args.indexOf(flag) + 1]
const identity = (path) => {
  const bytes = readFileSync(path)
  return { path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
const dpi = Number(valueAfter('--dpi'))
const output = valueAfter('--output')
if (dpi === 192) {
  process.stdout.write(JSON.stringify({
    schemaVersion: 'pptx-contact-diff/v1', status: 'error',
    error: { kind: 'render_error', code: 'render_error', stage: 'render', retryable: true, requestedDpi: 192, pairCount: 12, reason: 'render-resource-limit' }
  }))
  process.exit(7)
}
writeFileSync(output, 'single 144 dpi png')
process.stdout.write(JSON.stringify({
  schemaVersion: 'pptx-contact-diff/v1', status: 'success', outputPath: output,
  baseline: identity(valueAfter('--source')),
  target: identity(valueAfter('--candidate')),
  baselinePath: valueAfter('--source'),
  targetPath: valueAfter('--candidate'),
  summary: { pairCount: 12, scopeMode: 'all-slides', dpi },
  agentGate: { passed: true, status: 'pass', scopeMode: 'all-slides', pairCount: 12 },
  render: { path: output, width: 5000, height: 6000, dpi }
}))
`,
  )
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  const result = runNode([
    skillPath('scripts/cli/review/compare.mjs'),
    '--source',
    source,
    '--candidate',
    candidate,
    '--run-dir',
    runDir,
    '--kind',
    'refurbish',
    '--slide-count',
    '12',
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])
  const report = JSON.parse(result.stdout)
  assert.equal(report.schemaVersion, 'pptx-contact-diff/v1')
  assert.equal(existsSync(join(runDir, 'refurbish-compare.png')), true)
  assert.equal(existsSync(join(runDir, 'refurbish-compare-01.png')), false)
  assert.deepEqual(
    report.pptxNovaCompare.attempts.map((attempt) => [attempt.dpi, attempt.status]),
    [
      [192, 'failed'],
      [144, 'success'],
    ],
  )
})

test('compare fails closed and removes every part when 144 DPI also fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-multipart-fail-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const runDir = join(root, 'run')
  const log = join(root, 'xdoc.log')
  const fakeXdoc = writeMultipartContactDiffXdoc(root)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')

  const result = spawnSync(
    process.execPath,
    [
      skillPath('scripts/cli/review/compare.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--run-dir',
      runDir,
      '--kind',
      'refurbish',
      '--slide-count',
      '48',
      '--compare-concurrency',
      '1',
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, FAKE_XDOC_LOG: log, FAKE_XDOC_MODE: 'fail-part-2' },
    },
  )
  assert.equal(result.status, 1)
  const failure = JSON.parse(result.stdout)
  const progressEvents = result.stderr
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  assert.equal(failure.schemaVersion, 'pptx-nova-compare-error/v1')
  assert.equal(failure.status, 'error')
  assert.ok(progressEvents.some((event) => event.event === 'compare-failed'))
  assert.equal(
    readdirSync(runDir).filter((name) => /refurbish-compare.*\.(png|json)$/.test(name)).length,
    0,
  )
  assert.deepEqual(
    readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).dpi),
    [192, 192, 144],
  )
})

test('compare does not retry a non-RenderError failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-multipart-non-retryable-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const runDir = join(root, 'run')
  const log = join(root, 'xdoc.log')
  const fakeXdoc = writeMultipartContactDiffXdoc(root)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')

  const result = spawnSync(
    process.execPath,
    [
      skillPath('scripts/cli/review/compare.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--run-dir',
      runDir,
      '--kind',
      'refurbish',
      '--slide-count',
      '48',
      '--compare-concurrency',
      '1',
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, FAKE_XDOC_LOG: log, FAKE_XDOC_MODE: 'non-retryable' },
    },
  )
  assert.equal(result.status, 1)
  assert.deepEqual(
    readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).dpi),
    [192, 192],
  )
})
