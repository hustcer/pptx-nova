import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { analyzeCompareRendering } from '../../pptx-nova/scripts/lib/visual-evidence.mjs'

const compare = join(process.cwd(), 'pptx-nova/scripts/pptx-nova-compare.mjs')

function fakeXdoc(root) {
  const path = join(root, 'fake-xdoc.mjs')
  writeFileSync(
    path,
    `#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const value = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined }
if (args[0] === '--version') { process.stdout.write('fake-cache-v1'); process.exit(0) }
const counter = ${JSON.stringify(join(root, 'count.txt'))}
const count = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0
writeFileSync(counter, String(count + 1))
const source = value('--source'); const candidate = value('--candidate'); const output = value('--output')
writeFileSync(output, 'cached png bytes')
const agentReviewOutput = process.env.XDOC_CONTACT_DIFF_AGENT_REVIEW_OUTPUT || ''
const agentReviewDpi = Number(process.env.XDOC_CONTACT_DIFF_AGENT_REVIEW_LAYOUT_DPI || 0)
if (agentReviewOutput) writeFileSync(agentReviewOutput, 'cached Agent review bytes')
const identity = (path) => ({ path, byteLength: statSync(path).size, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') })
const selector = value('--slides') || 'all'
const slides = selector === 'all' ? [1] : selector.split('-').map(Number)
const dpi = Number(value('--dpi'))
process.stdout.write(JSON.stringify({ schemaVersion: 'pptx-contact-diff/v1', status: 'success', baseline: identity(source), target: identity(candidate), outputPath: output, output, scope: { requested: selector, slides, basis: 'baseline-slides' }, render: { path: output, dpi, width: 100, height: 56 }, agentReview: agentReviewOutput ? { status: 'success', path: agentReviewOutput, renderDpi: dpi, layoutDpi: agentReviewDpi, width: 50, height: 28, cacheReuse: 'same-render-dpi-page-cache' } : undefined, summary: { pairCount: slides.length, dpi, scopeMode: selector === 'all' ? 'all-slides' : 'selected-slides' }, agentGate: { passed: true, status: 'pass', pairCount: slides.length } }))
`,
  )
  chmodSync(path, 0o755)
  return path
}

function run(args) {
  const result = spawnSync(process.execPath, [compare, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

test('compare reuses content-addressed render evidence across run directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-compare-cache-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const cacheDir = join(root, 'cache')
  const xdoc = fakeXdoc(root)
  writeFileSync(source, 'source')
  writeFileSync(candidate, 'candidate')

  const common = [
    '--source',
    source,
    '--candidate',
    candidate,
    '--slide-count',
    '1',
    '--xdoc-bin',
    xdoc,
    '--cache-dir',
    cacheDir,
    '--agent-review-dpi',
    '96',
    '--progress',
    'off',
    '--json',
  ]
  const first = run([...common, '--run-dir', join(root, 'run-1')])
  const second = run([...common, '--run-dir', join(root, 'run-2')])
  const copiedSource = join(root, 'copied-source.pptx')
  const copiedCandidate = join(root, 'copied-candidate.pptx')
  writeFileSync(copiedSource, readFileSync(source))
  writeFileSync(copiedCandidate, readFileSync(candidate))
  const third = run([
    '--source',
    copiedSource,
    '--candidate',
    copiedCandidate,
    '--slide-count',
    '1',
    '--xdoc-bin',
    xdoc,
    '--cache-dir',
    cacheDir,
    '--agent-review-dpi',
    '96',
    '--progress',
    'off',
    '--json',
    '--run-dir',
    join(root, 'run-3'),
  ])
  assert.equal(readFileSync(join(root, 'count.txt'), 'utf8'), '1')
  assert.equal(first.pptxNovaCompare.cache.status, 'miss')
  assert.equal(second.pptxNovaCompare.cache.status, 'hit')
  assert.equal(second.baseline.path, source)
  assert.equal(second.target.path, candidate)
  assert.equal(second.pptxNovaCompare.agentReview.cacheReuse, 'same-render-dpi-page-cache')
  assert.equal(second.pptxNovaCompare.agentReview.layoutDpi, 96)
  assert.equal(second.pptxNovaCompare.agentReview.renderDpi, 192)
  assert.equal(
    second.pptxNovaCompare.agentReview.path,
    join(root, 'run-2', 'compare-agent-review.png'),
  )
  assert.equal(existsSync(second.pptxNovaCompare.agentReview.path), true)
  assert.equal(
    readFileSync(second.pptxNovaCompare.agentReview.path, 'utf8'),
    'cached Agent review bytes',
  )
  assert.equal(third.pptxNovaCompare.cache.status, 'hit')
  assert.equal(third.baseline.path, copiedSource)
  assert.equal(third.target.path, copiedCandidate)
  assert.deepEqual(analyzeCompareRendering(second), {
    partCount: 1,
    renderInvocations: 0,
    estimatedRenderedPixels: 0,
    baselineEstimatedPixels: 5600,
    cacheHitCount: 1,
    cacheMissCount: 0,
    renderInvocationsSaved: 1,
    retryInvocations: 0,
    pageBitmapCache: {
      source: {
        requestedPageCount: 1,
        hitCount: 0,
        missCount: 1,
        populatedCount: 0,
        observed: true,
        complete: false,
      },
      candidate: {
        requestedPageCount: 1,
        hitCount: 0,
        missCount: 1,
        populatedCount: 0,
        observed: true,
        complete: false,
      },
    },
  })

  const metadataPath = join(second.pptxNovaCompare.cache.directory, 'metadata.json')
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
  metadata.descriptor.dpi = 144
  writeFileSync(metadataPath, JSON.stringify(metadata))
  const fourth = run([...common, '--run-dir', join(root, 'run-4')])
  assert.equal(readFileSync(join(root, 'count.txt'), 'utf8'), '2')
  assert.equal(fourth.pptxNovaCompare.cache.status, 'miss')
})

test('render metrics count a failed primary invocation before a fallback cache hit', () => {
  const report = {
    schemaVersion: 'pptx-nova-compare-manifest/v1',
    parts: [
      {
        cache: { status: 'hit' },
        attempts: [
          { dpi: 192, status: 'failed' },
          { dpi: 144, status: 'cache-hit' },
        ],
        render: { dpi: 144, width: 1440, height: 810 },
      },
    ],
  }
  assert.deepEqual(analyzeCompareRendering(report), {
    partCount: 1,
    renderInvocations: 1,
    estimatedRenderedPixels: 2073600,
    baselineEstimatedPixels: 2073600,
    cacheHitCount: 1,
    retryInvocations: 0,
    cacheMissCount: 0,
    renderInvocationsSaved: 1,
    pageBitmapCache: {
      source: {
        requestedPageCount: 0,
        hitCount: 0,
        missCount: 0,
        populatedCount: 0,
        observed: false,
        complete: false,
      },
      candidate: {
        requestedPageCount: 0,
        hitCount: 0,
        missCount: 0,
        populatedCount: 0,
        observed: false,
        complete: false,
      },
    },
  })
})
