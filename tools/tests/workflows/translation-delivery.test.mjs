import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runNode, runNodeStatus, skillPath, writeJson, fileIdentity } from '../helpers/common.mjs'
import { writeFakeXdoc } from '../helpers/fake-xdoc.mjs'

test('translation runner finalizes once and reuses compare evidence for contact aliases', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-run-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const units = join(root, 'units.json')
  const translations = join(root, 'translations.json')
  const output = join(root, 'out.pptx')
  const runDir = join(root, 'run')
  const log = join(root, 'render.log')
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  writeJson(units, { schemaVersion: 'pptx-i18n-scan/v1', status: 'pass' })
  writeJson(translations, {
    schemaVersion: 'pptx-i18n-translations/v1',
    sourceLang: 'en',
    targetLang: 'de',
    translations: [],
  })
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const after = (flag) => args[args.indexOf(flag) + 1]
const identity = (path) => {
  const bytes = readFileSync(path)
  return { path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
const print = (value) => process.stdout.write(JSON.stringify(value))
if (args[0] === 'pptx' && args[1] === 'inspect') {
  print({ schemaVersion: 'pptx-inspect/v1', status: 'success', presentation: { slideCount: 21 }, slides: [] })
} else if (args[0] === 'pptx' && args[1] === 'i18n-style-diff') {
  print({ schemaVersion: 'pptx-i18n-style-diff/v1', status: 'pass', agentGate: { passed: true, blockerCount: 0 }, blockers: [] })
} else if (args[0] === 'pptx' && args[1] === 'i18n-scan') {
  print({ schemaVersion: 'pptx-i18n-scan/v1', status: 'pass', agentGate: { passed: true, blockerCount: 0 }, summary: { verifiedCount: 1 } })
} else if (args[0] === 'pptx' && args[1] === 'vision-diff') {
  print({ schemaVersion: 'pptx-vision-diff/v1', status: 'success', agentGate: { passed: true, blockerCount: 0, blockersByEvidenceClass: {} } })
} else if (args[0] === 'pptx' && args[1] === 'preview') {
  const dir = after('--output-dir')
  const contact = after('--contact-output')
  mkdirSync(dir, { recursive: true })
  const pages = Array.from({ length: 21 }, (_, index) => {
    const path = dir + '/slide-' + String(index + 1).padStart(3, '0') + '.png'
    writeFileSync(path, 'png')
    return { path, byteLength: 3, file: { path, status: 'ok', byteLength: 3, width: 100, height: 56 } }
  })
  writeFileSync(contact, 'contact')
  appendFileSync(process.env.FAKE_RENDER_LOG, JSON.stringify({ kind: 'preview', dpi: Number(after('--dpi')), candidatePrefix: process.env.XDOC_PAGE_CACHE_PREFIX }) + '\\n')
  print({ schemaVersion: 'pptx-preview/v1', status: 'success', pages, contactSheet: { path: contact, byteLength: 7, width: 100, height: 56 } })
} else if (args[0] === 'pptx' && args[1] === 'diff') {
  print({ schemaVersion: 'pptx-diff/v1', status: 'success', agentGate: { semanticStatus: 'pass' }, summary: { reliableChanges: 1 } })
} else if (args[0] === 'pptx' && args[1] === 'contact-diff') {
  const selector = after('--slides')
  const [start, end] = selector.split('-').map(Number)
  const slides = Array.from({ length: end - start + 1 }, (_, index) => start + index)
  const output = after('--output')
  const dpi = Number(after('--dpi'))
  appendFileSync(process.env.FAKE_RENDER_LOG, JSON.stringify({ kind: 'compare', selector, dpi, sourcePrefix: process.env.XDOC_SOURCE_PAGE_CACHE_PREFIX, candidatePrefix: process.env.XDOC_CANDIDATE_PAGE_CACHE_PREFIX }) + '\\n')
  writeFileSync(output, 'compare:' + selector)
  print({
    schemaVersion: 'pptx-contact-diff/v1', status: 'success',
    baseline: identity(after('--source')), target: identity(after('--candidate')),
    baselinePath: after('--source'), targetPath: after('--candidate'), outputPath: output,
    summary: { baselineSlideCount: 21, targetSlideCount: 21, pairCount: slides.length, scopeMode: 'selected-slides', dpi },
    scope: { requested: selector, slides, basis: 'baseline-slides' },
    agentGate: { passed: true, status: 'pass', scopeMode: 'selected-slides', pairCount: slides.length },
    render: { path: output, width: 100, height: 56 * slides.length, dpi }
  })
} else {
  process.stderr.write('unexpected fake xdoc command: ' + args.join(' '))
  process.exit(2)
}
`,
  )

  const result = runNode(
    [
      skillPath('scripts/cli/translation/run.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--units-file',
      units,
      '--translations',
      translations,
      '--output',
      output,
      '--run-dir',
      runDir,
      '--xdoc-bin',
      fakeXdoc,
      '--contact-diff',
      '--json',
    ],
    { env: { ...process.env, FAKE_RENDER_LOG: log } },
  )
  const compact = JSON.parse(result.stdout)
  const summary = JSON.parse(readFileSync(join(runDir, 'translation-run-summary.json'), 'utf8'))
  assert.equal(compact.schemaVersion, 'pptx-nova-translation-result/v1')
  assert.equal(compact.mode, 'translation')
  assert.equal('phases' in compact, false)
  assert.equal(compact.status, 'needs-human-review')
  assert.equal(compact.performance.render.comparePartCount, 2)
  assert.equal(compact.performance.render.compareRenderInvocations, 2)
  assert.equal(compact.performance.render.renderInvocationsSaved, 2)
  assert.equal(compact.performance.render.contactDiffReused, true)
  assert.equal(existsSync(output), true)
  assert.equal(
    summary.phases.some((phase) => phase.name === 'contact-diff'),
    false,
  )
  assert.equal(
    summary.phases.some((phase) => phase.name === 'contact-diff-reuse'),
    true,
  )
  const renderLog = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.equal(renderLog[0].kind, 'preview')
  assert.equal(renderLog[0].dpi, 192)
  assert.deepEqual(
    renderLog
      .slice(1)
      .map(({ kind, selector, dpi }) => ({ kind, selector, dpi }))
      .sort((a, b) => a.selector.localeCompare(b.selector, 'en', { numeric: true })),
    [
      { kind: 'compare', selector: '1-20', dpi: 192 },
      { kind: 'compare', selector: '21-21', dpi: 192 },
    ],
  )
  assert.ok(renderLog[0].candidatePrefix)
  assert.equal(renderLog[1].candidatePrefix, renderLog[0].candidatePrefix)
  assert.equal(renderLog[2].candidatePrefix, renderLog[0].candidatePrefix)
  assert.notEqual(renderLog[1].sourcePrefix, renderLog[0].candidatePrefix)
  const aliases = JSON.parse(readFileSync(join(runDir, 'contact-diff.json'), 'utf8'))
  assert.equal(aliases.parts.length, 2)
  assert.equal(
    aliases.parts.every((part) => existsSync(part.path)),
    true,
  )
  assert.ok(
    result.stdout.length < readFileSync(join(runDir, 'translation-run-summary.json')).length,
  )

  const fullRunDir = join(root, 'run-full')
  const fullOutput = join(root, 'out-full.pptx')
  const fullResult = runNode(
    [
      skillPath('scripts/cli/translation/run.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--units-file',
      units,
      '--translations',
      translations,
      '--output',
      fullOutput,
      '--run-dir',
      fullRunDir,
      '--xdoc-bin',
      fakeXdoc,
      '--json-full',
    ],
    { env: { ...process.env, FAKE_RENDER_LOG: log } },
  )
  const full = JSON.parse(fullResult.stdout)
  assert.equal(full.schemaVersion, 'pptx-nova-translation-run/v1')
  assert.equal(Array.isArray(full.phases), true)
  assert.equal(full.artifacts.summary, join(fullRunDir, 'translation-run-summary.json'))
})

test('translation runner routes unreviewed vision blockers to the precise reference', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-failure-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const units = join(root, 'units.json')
  const translations = join(root, 'translations.json')
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  writeJson(units, { schemaVersion: 'pptx-i18n-scan/v1', status: 'pass' })
  writeJson(translations, { schemaVersion: 'pptx-i18n-translations/v1', translations: [] })
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
const args = process.argv.slice(2)
const print = (value) => process.stdout.write(JSON.stringify(value))
if (args[1] === 'inspect') print({ status: 'success', presentation: { slideCount: 1 } })
else if (args[1] === 'i18n-style-diff') print({ schemaVersion: 'pptx-i18n-style-diff/v1', status: 'pass', agentGate: { passed: true } })
else if (args[1] === 'i18n-scan') print({ schemaVersion: 'pptx-i18n-scan/v1', status: 'pass', agentGate: { passed: true } })
else if (args[1] === 'vision-diff') print({ schemaVersion: 'pptx-vision-diff/v1', status: 'success', agentGate: { passed: false, blockerCount: 1, blockersByEvidenceClass: { 'review-only': 1 } } })
else process.exit(2)
`,
  )
  const result = runNodeStatus(
    [
      skillPath('scripts/cli/translation/run.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--units-file',
      units,
      '--translations',
      translations,
      '--output',
      join(root, 'out.pptx'),
      '--run-dir',
      join(root, 'run'),
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    1,
  )
  const compact = JSON.parse(result.stdout)
  assert.equal(compact.status, 'failed')
  assert.deepEqual(compact.requiredReferences, [
    {
      path: 'references/translation/translation-mode.md',
      section: 'Visual Parity Gate',
      reason: 'Vision blockers require translation repair or a bound multi-column review.',
    },
  ])
  assert.equal(existsSync(join(root, 'out.pptx')), false)
})

test('translation runner rejects preview manifests whose slide PNGs are missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-preview-failure-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const units = join(root, 'units.json')
  const translations = join(root, 'translations.json')
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  writeJson(units, { schemaVersion: 'pptx-i18n-scan/v1', status: 'pass' })
  writeJson(translations, { schemaVersion: 'pptx-i18n-translations/v1', translations: [] })
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const after = (flag) => args[args.indexOf(flag) + 1]
const print = (value) => process.stdout.write(JSON.stringify(value))
if (args[1] === 'inspect') print({ status: 'success', presentation: { slideCount: 1 } })
else if (args[1] === 'i18n-style-diff') print({ schemaVersion: 'pptx-i18n-style-diff/v1', status: 'pass', agentGate: { passed: true } })
else if (args[1] === 'i18n-scan') print({ schemaVersion: 'pptx-i18n-scan/v1', status: 'pass', agentGate: { passed: true } })
else if (args[1] === 'vision-diff') print({ schemaVersion: 'pptx-vision-diff/v1', status: 'success', agentGate: { passed: true, blockersByEvidenceClass: {} } })
else if (args[1] === 'preview') {
  const dir = after('--output-dir')
  const contact = after('--contact-output')
  mkdirSync(dir, { recursive: true })
  writeFileSync(contact, 'contact')
  print({ schemaVersion: 'pptx-preview/v1', status: 'success', pages: [{ path: dir + '/missing.png', byteLength: 3, file: { path: dir + '/missing.png', status: 'ok', byteLength: 3, width: 100, height: 56 } }], contactSheet: { path: contact, byteLength: 7 } })
} else process.exit(2)
`,
  )
  const result = runNodeStatus(
    [
      skillPath('scripts/cli/translation/run.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--units-file',
      units,
      '--translations',
      translations,
      '--output',
      join(root, 'out.pptx'),
      '--run-dir',
      join(root, 'run'),
      '--xdoc-bin',
      fakeXdoc,
      '--json',
    ],
    1,
  )
  const compact = JSON.parse(result.stdout)
  assert.equal(compact.error.phase, 'translation-preview')
  assert.equal(compact.requiredReferences[0].section, 'Visual evidence and performance')
})

test('translation runner requires the reviewed vision report to match the current finalizer evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-translation-review-stale-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const units = join(root, 'units.json')
  const translations = join(root, 'translations.json')
  const visionDiff = join(root, 'reviewed-vision-diff.json')
  const review = join(root, 'multi-column-review.json')
  const gate = join(root, 'multi-column-review-gate.json')
  const pngPath = join(root, 'slide-001.png')
  const png = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0)
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12, 'ascii')
  png.writeUInt32BE(100, 16)
  png.writeUInt32BE(56, 20)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  writeFileSync(pngPath, png)
  writeJson(units, { schemaVersion: 'pptx-i18n-scan/v1', status: 'pass' })
  writeJson(translations, { schemaVersion: 'pptx-i18n-translations/v1', translations: [] })
  const issue = {
    kind: 'multi-column-text-layout-review',
    severity: 'medium',
    evidenceClass: 'review-only',
    slideIndex: 0,
    shapeId: 9,
  }
  const vision = {
    schemaVersion: 'pptx-vision-diff/v1',
    status: 'success',
    source,
    candidate,
    visualEvidence: {
      reportRole: 'observation-only',
      command: ['xdoc', 'pptx', 'visual-audit', '--candidate', candidate, '--reference', source],
    },
    newIssues: [issue],
    worsenedIssues: [],
    agentGate: {
      passed: false,
      blockerCount: 1,
      blockersByEvidenceClass: { 'review-only': 1 },
    },
  }
  writeJson(visionDiff, vision)
  const withPrefix = (path) => `sha256:${fileIdentity(path).sha256}`
  writeJson(review, {
    schemaVersion: 'pptx-nova-multi-column-review/v1',
    candidate: { path: candidate, sha256: withPrefix(candidate) },
    visionDiff: { path: visionDiff, sha256: withPrefix(visionDiff) },
    reviews: [
      {
        slideIndex: 0,
        shapeId: 9,
        reviewer: 'human',
        decision: 'pass',
        png: { path: pngPath, sha256: withPrefix(pngPath), width: 100, height: 56 },
        checks: {
          noClipping: true,
          columnFlowReadable: true,
          noOverlap: true,
          marginsAcceptable: true,
        },
        note: 'Reviewed at full size.',
      },
    ],
  })
  runNode([
    skillPath('scripts/cli/review/multi-column-gate.mjs'),
    '--candidate',
    candidate,
    '--vision-diff',
    visionDiff,
    '--review',
    review,
    '--output',
    gate,
    '--json',
  ])
  const pathOnlyVision = {
    ...vision,
    source: '/different/source.pptx',
    candidate: '/different/candidate.pptx',
    visualEvidence: {
      ...vision.visualEvidence,
      command: [
        'xdoc',
        'pptx',
        'visual-audit',
        '--candidate',
        '/different/candidate.pptx',
        '--reference',
        '/different/source.pptx',
      ],
    },
  }
  const positiveXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
const args = process.argv.slice(2)
const print = (value) => process.stdout.write(JSON.stringify(value))
if (args[1] === 'inspect') print({ status: 'success', presentation: { slideCount: 1 } })
else if (args[1] === 'i18n-style-diff') print({ schemaVersion: 'pptx-i18n-style-diff/v1', status: 'pass', agentGate: { passed: true } })
else if (args[1] === 'i18n-scan') print({ schemaVersion: 'pptx-i18n-scan/v1', status: 'pass', agentGate: { passed: true } })
else if (args[1] === 'vision-diff') process.stdout.write(${JSON.stringify(JSON.stringify(pathOnlyVision))})
else process.exit(2)
`,
  )
  const positiveRunDir = join(root, 'run-path-normalized')
  const positive = runNodeStatus(
    [
      skillPath('scripts/cli/translation/run.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--units-file',
      units,
      '--translations',
      translations,
      '--output',
      join(root, 'out-path-normalized.pptx'),
      '--run-dir',
      positiveRunDir,
      '--xdoc-bin',
      positiveXdoc,
      '--multi-column-review-gate',
      gate,
      '--json',
    ],
    1,
  )
  assert.equal(JSON.parse(positive.stdout).error.phase, 'preview-render')
  const positiveSummary = JSON.parse(
    readFileSync(join(positiveRunDir, 'translation-run-summary.json'), 'utf8'),
  )
  assert.equal(
    positiveSummary.gates.find((item) => item.name === 'multi-column-review-binding')?.passed,
    true,
  )
  const currentVision = {
    ...vision,
    agentGate: { ...vision.agentGate, reviewRequiredCount: 1 },
  }

  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
const args = process.argv.slice(2)
const print = (value) => process.stdout.write(JSON.stringify(value))
if (args[1] === 'inspect') print({ status: 'success', presentation: { slideCount: 1 } })
else if (args[1] === 'i18n-style-diff') print({ schemaVersion: 'pptx-i18n-style-diff/v1', status: 'pass', agentGate: { passed: true } })
else if (args[1] === 'i18n-scan') print({ schemaVersion: 'pptx-i18n-scan/v1', status: 'pass', agentGate: { passed: true } })
else if (args[1] === 'vision-diff') process.stdout.write(${JSON.stringify(JSON.stringify(currentVision))})
else process.exit(2)
`,
  )
  const result = runNodeStatus(
    [
      skillPath('scripts/cli/translation/run.mjs'),
      '--source',
      source,
      '--candidate',
      candidate,
      '--units-file',
      units,
      '--translations',
      translations,
      '--output',
      join(root, 'out.pptx'),
      '--run-dir',
      join(root, 'run'),
      '--xdoc-bin',
      fakeXdoc,
      '--multi-column-review-gate',
      gate,
      '--json',
    ],
    1,
  )
  const compact = JSON.parse(result.stdout)
  assert.equal(compact.error.phase, 'multi-column-review-binding')
  assert.equal(compact.requiredReferences[0].section, 'Visual Parity Gate')
})
