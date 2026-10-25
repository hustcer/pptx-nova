import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function writeFakeXdoc(root, source) {
  const scriptPath = join(root, 'fake-xdoc.mjs')
  // Model the current executable's evidence contract in every successful
  // rendering fixture. These helpers only construct test reports; production
  // gates still validate real artifact/input hashes independently.
  source = source.replace(
    /schemaVersion: '(pptx-preview|pptx-contact-diff|pptx-visual-evidence)\/v1'/g,
    "$&, renderContext: { schemaVersion: 'xdoc-render-context/v1', fieldDate: process.env.XDOC_FIELD_DATE, authorizationClock: 'independent', bitmapCacheBinding: 'pdf-sha256' }",
  )
  source = source.replace(
    /(else if \(args\[0\] === 'pptx' && args\[1\] === 'diff'\) \{[\s\S]*?)print\((\{[\s\S]*?\})\)/g,
    '$1print(__fakeFullDiff($2))',
  )
  source = source.replace(
    '\n',
    `
import { readFileSync as __read, writeFileSync as __write } from 'node:fs'
import { createHash as __hash } from 'node:crypto'
function __fakeFullDiff(report) {
  const argv = process.argv.slice(2)
  const value = flag => argv[argv.indexOf(flag) + 1]
  const hash = bytes => __hash('sha256').update(bytes).digest('hex')
  const inputBinding = { algorithm: 'sha256', baseline: hash(__read(value('--source'))), target: hash(__read(value('--candidate'))) }
  const full = { ...report, detail: 'full', inputBinding }
  const text = JSON.stringify(full)
  const path = value('--output')
  __write(path, text, { flag: 'wx' })
  return { ...report, detail: 'summary', inputBinding, fullEvidenceAvailable: true,
    fullEvidence: { path, sha256: hash(text), schemaVersion: 'pptx-diff/v1', detail: 'full' } }
}
`,
  )
  writeFileSync(scriptPath, source)
  chmodSync(scriptPath, 0o755)
  return scriptPath
}

export function writeMultipartContactDiffXdoc(root) {
  return writeFakeXdoc(
    root,
    `#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : ''
}
const selector = valueAfter('--slides')
const dpi = Number(valueAfter('--dpi'))
const output = valueAfter('--output')
const identity = (path) => {
  const bytes = readFileSync(path)
  return { path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
const startedAt = Date.now()
const delayMap = JSON.parse(process.env.FAKE_XDOC_DELAY_MAP || '{}')
const delayMs = Number(delayMap[selector] ?? 0)
if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
const log = process.env.FAKE_XDOC_LOG
if (log) appendFileSync(log, JSON.stringify({ selector, dpi, output, startedAt, endedAt: Date.now() }) + '\\n')
const mode = process.env.FAKE_XDOC_MODE || 'success'
const shouldFail192 = mode === 'retry-part-2' && selector === '21-40' && dpi === 192
const shouldFailBoth = mode === 'fail-part-2' && selector === '21-40'
const nonRetryable = mode === 'non-retryable' && selector === '21-40' && dpi === 192
if (shouldFail192 || shouldFailBoth || nonRetryable) {
  process.stdout.write(JSON.stringify({
    schemaVersion: 'pptx-contact-diff/v1',
    status: 'error',
    error: {
      kind: nonRetryable ? 'input_error' : 'render_error',
      code: nonRetryable ? 'input_error' : 'render_error',
      stage: 'render',
      retryable: !nonRetryable,
      requestedDpi: dpi,
      pairCount: selector === '41-48' ? 8 : 20,
      reason: nonRetryable ? 'invalid-input' : 'canvas-dimension-limit'
    }
  }))
  process.exit(7)
}
const [start, end] = selector.split('-').map(Number)
const pairCount = end - start + 1
writeFileSync(output, 'png:' + selector + ':' + dpi)
process.stdout.write(JSON.stringify({
  schemaVersion: 'pptx-contact-diff/v1',
  status: 'success',
  baseline: identity(valueAfter('--source')),
  target: identity(valueAfter('--candidate')),
  baselinePath: valueAfter('--source'),
  targetPath: valueAfter('--candidate'),
  outputPath: output,
  summary: { pairCount, scopeMode: 'selected-slides', dpi },
  scope: { requested: selector, slides: Array.from({ length: pairCount }, (_, index) => start + index), basis: 'source-slides' },
  agentGate: { passed: true, status: 'pass', scopeMode: 'selected-slides', pairCount },
  render: { path: output, width: 7043, height: pairCount * 500 + 73, dpi }
}))
`,
  )
}

export function successfulFakeXdocSource() {
  return `#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : ''
}
const print = (value) => process.stdout.write(JSON.stringify(value))

if (args[0] === 'schema') {
  print({
    version: '9.9.9 (fake)',
    schemaVersion: 'cli-agent/v1',
    capabilities: { schemaVersion: 'capabilities/v1' },
    commands: { pptx: { subcommands: { apply: {}, 'vision-check': {}, preview: {} }, patchSchema: {}, catalogs: {} } }
  })
} else if (args[0] === 'pptx' && args[1] === 'apply') {
  const output = valueAfter('-o')
  if (args.includes('--dry-run')) {
    print({ schemaVersion: 'pptx-dry-run/v1', status: 'success', warnings: [], changedParts: [], opResults: [], visualRisks: [], semanticIssues: [], wouldWrite: true, output })
  } else {
    writeFileSync(output, 'candidate pptx')
    print({ schemaVersion: 'pptx-apply/v1', status: 'success', warnings: [], changedParts: ['ppt/presentation.xml'], opResults: [], visualRisks: [], semanticIssues: [], output })
  }
} else if (args[0] === 'pptx' && args[1] === 'inspect') {
  // Runner orchestration fixture only; real native readback has separate integration evidence.
  const patch = JSON.parse(readFileSync(join(dirname(args[2]), 'patch.json'), 'utf8'))
  const slides = patch.ops.filter(op => op.op === 'add-slide').map((_, index) => ({ index, shapes: [] }))
  for (const op of patch.ops.filter(op => ['add-text-box', 'add-shape', 'add-image'].includes(op.op))) {
    const frame = patch.ops.filter(p => p.op === 'set-text-frame' && p.slide === op.slide && p.shape?.name === op.name).at(-1)
    const text = patch.ops.filter(p => p.op === 'set-text-frame' && p.slide === op.slide && p.shape?.name === op.name && typeof p.text === 'string').at(-1)?.text ?? ''
    const crop = patch.ops.filter(p => p.op === 'set-image' && p.slide === op.slide && p.shape?.name === op.name).at(-1)?.crop ?? {}
    slides[op.slide].shapes.push({ name: op.name, shapeType: op.op === 'add-image' ? 'picture' : 'shape',
      bbox: Object.fromEntries(['x','y','w','h'].map(k => [k+'Emu', Math.round(parseFloat(op[k])*914400)])),
      fontFacts: text.split('\\n').map((text, paragraph) => ({ scope: 'textRun', paragraph, text })),
      textFrame: frame?.frame ?? {}, image: { crop: { left: 0, right: 0, top: 0, bottom: 0, ...crop } } })
  }
  print({ schemaVersion: 'pptx-inspect/v1', slides })
} else if (args[0] === 'pptx' && args[1] === 'vision-check') {
  print({ schemaVersion: 'pptx-vision/v1', status: 'pass', summary: { issueCount: 0, bySeverity: { high: 0, medium: 0, low: 0 } }, issues: [], semanticSummary: { passed: true, issueCount: 0, sourceRuleCount: 82, normalizedRuleCount: 81 }, semanticIssues: [] })
} else if (args[0] === 'pptx' && args[1] === 'preview') {
  const outputDir = valueAfter('--output-dir')
  const contactSheet = valueAfter('--contact-output')
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(outputDir + '/slide-001.png', 'png')
  writeFileSync(contactSheet, 'contact')
  print({
    schemaVersion: 'pptx-preview/v1',
    status: 'success',
    pages: [{ index: 1, slide: 1, path: outputDir + '/slide-001.png', byteLength: 3, file: { path: outputDir + '/slide-001.png', status: 'ok', byteLength: 3, width: 100, height: 56 } }],
    contactSheet: { path: contactSheet, width: 100, height: 56, byteLength: 7 }
  })
} else {
  process.stderr.write('unexpected fake xdoc command: ' + args.join(' '))
  process.exit(2)
}
`
}
