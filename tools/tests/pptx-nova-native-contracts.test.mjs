// Opt-in executable contracts; baseline skill users need only Node + xdoc.
// XDOC_TEST_BIN=/absolute/path/to/xdoc node --test tools/tests/pptx-nova-native-contracts.test.mjs
// Set XDOC_TEST_EVIDENCE_DIR to retain independent, newly allocated scenario directories.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'
import { prepareRemediation } from '../../pptx-nova/scripts/lib/remediation.mjs'
import { createDeck } from '../../pptx-nova/assets/deckkits/cartesian.kit.mjs'
import { composeChoreography } from '../../pptx-nova/scripts/lib/animation-choreography.mjs'
import { verifyDiffEvidence } from '../../pptx-nova/scripts/lib/diff-evidence.mjs'
import {
  createRunnerRuntime,
  summarizePhaseError,
} from '../../pptx-nova/scripts/lib/runner-runtime.mjs'

const binary = process.env.XDOC_TEST_BIN ? resolve(process.env.XDOC_TEST_BIN) : null
const evidence = process.env.XDOC_TEST_EVIDENCE_DIR
  ? resolve(process.env.XDOC_TEST_EVIDENCE_DIR)
  : null
const prepareScript = fileURLToPath(
  new URL('../../pptx-nova/scripts/pptx-nova-translation-prepare.mjs', import.meta.url),
)
const cartesianContent = fileURLToPath(
  new URL('../../pptx-nova/assets/deckkits/examples/cartesian-content.json', import.meta.url),
)
const skillScript = (name) =>
  fileURLToPath(new URL(`../../pptx-nova/scripts/${name}.mjs`, import.meta.url))
const nativeTest = (name, fn, { visual = false } = {}) =>
  test(
    name,
    {
      skip: !binary
        ? 'Set XDOC_TEST_BIN to run executable contract tests'
        : visual && process.env.XDOC_TEST_VISUAL !== '1'
          ? 'Set XDOC_TEST_VISUAL=1 with an installed unwatermarked CLI License'
          : false,
    },
    fn,
  )

// Independent readback for controlled native fixtures; never rewrites a package.
function nativeParts(input) {
  const bytes = readFileSync(input)
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  assert.ok(end >= 0)
  let offset = bytes.readUInt32LE(end + 16)
  const parts = new Map()
  for (let i = 0; i < bytes.readUInt16LE(end + 10); i++) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50)
    const method = bytes.readUInt16LE(offset + 10)
    const size = bytes.readUInt32LE(offset + 20)
    const length = bytes.readUInt16LE(offset + 28)
    const name = bytes.subarray(offset + 46, offset + 46 + length).toString('utf8')
    const local = bytes.readUInt32LE(offset + 42)
    assert.equal(bytes.readUInt32LE(local), 0x04034b50)
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28)
    const compressed = bytes.subarray(start, start + size)
    assert.ok(method === 0 || method === 8)
    parts.set(name, method === 0 ? compressed : inflateRawSync(compressed))
    offset += 46 + length + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32)
  }
  return parts
}

function scenario(t, { useInstalledAuthorization = false } = {}) {
  if (evidence) mkdirSync(evidence, { recursive: true })
  const directory = mkdtempSync(join(evidence || tmpdir(), 'nova-native-'))
  if (!evidence) t.after(() => rmSync(directory, { recursive: true, force: true }))
  else t.diagnostic(`Evidence: ${directory}`)
  const config = join(directory, 'config')
  mkdirSync(config)
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('XDOC_')),
  )
  Object.assign(env, {
    ...(useInstalledAuthorization ? {} : { XDOC_CONFIG_PATH: config }),
    XDOC_DAEMON_STATE: join(directory, 'daemon-state.json'),
    XDOC_DAEMON_LOG: join(directory, 'daemon.log'),
    CI: 'false',
  })
  let sequence = 0
  const write = (name, value) => {
    const path = join(directory, name)
    writeFileSync(
      path,
      typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value),
    )
    return path
  }
  const run = (args, expectedCode = null, executable = binary, { json = true } = {}) => {
    const result = spawnSync(executable, args, {
      cwd: directory,
      env,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    })
    const stem = `command-${sequence++}`
    write(`${stem}.json`, {
      executable,
      args,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    })
    assert.equal(result.error, undefined)
    assert.equal(result.signal, null)
    const report = json ? JSON.parse(result.stdout) : result.stdout
    if (typeof expectedCode === 'number') {
      assert.equal(result.status, expectedCode, result.stdout + result.stderr)
    } else if (expectedCode) {
      assert.notEqual(result.status, 0, result.stdout)
      assert.equal(report.error.code, expectedCode, result.stdout)
    } else {
      assert.equal(result.status, 0, result.stdout + result.stderr)
    }
    return report
  }
  const apply = (
    ops,
    input,
    { dryRun = false, error = null, assetRoot, allowRawXml = false } = {},
  ) => {
    const patch = write(`patch-${sequence++}.json`, { schemaVersion: 'pptx-patch/v1', ops })
    const output = join(directory, `candidate-${sequence++}.pptx`)
    const report = run(
      [
        'pptx',
        'apply',
        '--patch',
        patch,
        '--output',
        output,
        ...(input ? ['--input', input] : []),
        ...(dryRun ? ['--dry-run'] : []),
        ...(assetRoot ? ['--asset-root', assetRoot] : []),
        ...(allowRawXml ? ['--allow-raw-xml'] : []),
        '--json',
      ],
      error,
    )
    assert.equal(existsSync(output), !error && !dryRun)
    assert.equal(existsSync(`${output}.xdoc.json`), !error && !dryRun)
    if (!error) {
      assert.equal(report.status, 'success')
      assert.equal(report.semanticIssues.length, 0)
    }
    return { output, report }
  }
  const inspect = (input) => run(['pptx', 'inspect', input, '--json'])
  const body = (input) => inspect(input).slides[0].shapes.find((shape) => shape.name === 'Body')
  const create = (text = 'Quarterly review', pages = 1, frame = { autofit: { mode: 'none' } }) =>
    apply(
      Array.from({ length: pages }, (_, slide) => [
        { op: 'add-slide', layout: 'blank' },
        { op: 'add-text-box', slide, name: 'Body', x: '1in', y: '1in', w: '5in', h: '1in', text },
        {
          op: 'set-text-frame',
          slide,
          shape: { name: 'Body' },
          font: { name: 'Arial', size: '24pt' },
          frame,
        },
      ]).flat(),
    ).output
  return { directory, write, run, apply, inspect, body, create }
}

nativeTest('current authoring enums reject aliases without publishing partial files', (t) => {
  const s = scenario(t)
  const source = s.create()
  const bytes = readFileSync(source)
  const font = (underline) => ({
    op: 'set-run',
    slide: 0,
    shape: { name: 'Body' },
    paragraph: 0,
    run: 0,
    font: { underline },
  })
  for (const op of [
    font('single'),
    font('double'),
    { op: 'add-layout', name: 'Invalid layout', type: 'custom' },
    {
      op: 'add-layout-placeholder',
      layout: 0,
      type: 'hdr',
      x: '1in',
      y: '1in',
      w: '2in',
      h: '1in',
    },
    { op: 'add-placeholder', slide: 0, type: 'date' },
  ]) {
    for (const dryRun of [true, false]) s.apply([op], source, { dryRun, error: 'invalid_argument' })
  }
  for (const underline of ['sng', 'dbl', 'none']) s.apply([font(underline)], source)
  s.apply([{ op: 'add-layout', name: 'Custom layout', type: 'cust' }], source)
  assert.deepEqual(readFileSync(source), bytes)

  // Execute the user-facing font examples, so aliases cannot silently return.
  for (const reference of ['styles-and-themes.md', 'patch-ops-cheatsheet.md']) {
    const markdown = readFileSync(
      fileURLToPath(new URL(`../../pptx-nova/references/${reference}`, import.meta.url)),
      'utf8',
    )
    const example = [...markdown.matchAll(/```json\n([\s\S]*?)\n```/g)]
      .map((match) => {
        try {
          return JSON.parse(match[1])
        } catch {
          return null
        }
      })
      .find((op) => op?.op === 'set-run' && op.font?.underline)
    assert.ok(example, reference)
    s.apply([{ ...example, shape: { name: 'Body' } }], source)
  }
})

nativeTest('native connector sites resolve beyond four and reroute after target rotation', (t) => {
  const s = scenario(t)
  const source = s.apply([
    { op: 'add-slide', layout: 'blank' },
    {
      op: 'add-shape',
      slide: 0,
      kind: 'ellipse',
      name: 'Target',
      x: '1in',
      y: '2in',
      w: '2in',
      h: '1in',
    },
    {
      op: 'add-connector',
      slide: 0,
      name: 'Link',
      begin: { shape: { name: 'Target' }, site: 6, x: '0in', y: '0in' },
      end: { x: '6in', y: '4in' },
    },
  ]).output
  const part = s.inspect(source).slides[0].partName
  const xml = nativeParts(source).get(part).toString('utf8')
  assert.match(xml, /<a:stCxn[^>]*idx="6"/)
  // Ellipse site 6 is its right midpoint, overriding fallback (0, 0).
  assert.match(xml, /<a:off x="2743200" y="2286000"/)
  const edit = [{ op: 'set-shape', slide: 0, shape: { name: 'Target' }, rotation: 90 }]
  s.apply(edit, source, { dryRun: true })
  const candidate = s.apply(edit, source).output
  const after = nativeParts(candidate).get(part).toString('utf8')
  assert.match(after, /<a:stCxn[^>]*idx="6"/)
  assert.match(after, /<a:off x="1828800" y="3200400"/)
  s.apply(
    [
      {
        op: 'set-connector',
        slide: 0,
        shape: { name: 'Link' },
        begin: { shape: { name: 'Target' }, site: 8 },
      },
    ],
    source,
    { error: 'invalid_argument' },
  )
  assert.equal(nativeParts(source).get(part).toString('utf8'), xml)
})

nativeTest('copied chart and notes stay independent and area placement is owner checked', (t) => {
  const s = scenario(t)
  const data = { categories: ['A', 'B'], series: [{ name: 'Revenue', values: [10, 20] }] }
  const source = s.apply([
    { op: 'add-slide', layout: 'blank' },
    {
      op: 'add-chart',
      slide: 0,
      kind: 'area',
      name: 'Chart',
      title: 'Original',
      x: '1in',
      y: '1in',
      w: '8in',
      h: '4in',
      data,
    },
    { op: 'set-slide-notes', slide: 0, text: 'Original notes' },
  ]).output
  const duplicated = s.apply([{ op: 'duplicate-slide', slide: 0 }], source).output
  const original = nativeParts(source)
  const copies = nativeParts(duplicated)
  for (const pattern of [
    /^ppt\/charts\/chart\d+\.xml$/,
    /^ppt\/notesSlides\/notesSlide\d+\.xml$/,
    /^ppt\/embeddings\//,
  ]) {
    const before = [...original.keys()].filter((name) => pattern.test(name))
    assert.ok(before.length > 0)
    assert.equal([...copies.keys()].filter((name) => pattern.test(name)).length, before.length * 2)
    for (const name of before) assert.deepEqual(copies.get(name), original.get(name))
  }
  const changed = s.apply(
    [
      { op: 'set-slide-notes', slide: 1, text: 'Copy notes' },
      {
        op: 'set-chart-data',
        slide: 1,
        shape: { name: 'Chart' },
        data: { ...data, series: [{ name: 'Revenue', values: [30, 40] }] },
      },
      {
        op: 'set-chart',
        slide: 1,
        shape: { name: 'Chart' },
        title: { font: { color: 'FF0000', size: '20pt' } },
        dataLabels: [{ showValue: true }],
      },
      { op: 'set-chart-text', slide: 1, shape: { name: 'Chart' }, title: 'Changed copy' },
    ],
    duplicated,
  ).output
  const after = nativeParts(changed)
  for (const [name, bytes] of original) {
    if (/^ppt\/(charts|notesSlides|embeddings)\//.test(name))
      assert.deepEqual(after.get(name), bytes, name)
  }
  const changedChart = [...after].find(
    ([name, bytes]) =>
      /^ppt\/charts\/chart\d+\.xml$/.test(name) && /Changed copy/.test(bytes.toString()),
  )
  assert.ok(changedChart)
  const title = changedChart[1].toString().match(/<c:title>([\s\S]*?)<\/c:title>/)?.[1]
  assert.ok(title)
  assert.match(
    title,
    /<a:rPr\b[^>]*sz="2000"[^>]*>[\s\S]*?<a:srgbClr val="FF0000"\/>[\s\S]*?<\/a:rPr><a:t>Changed copy<\/a:t>/,
  )
  for (const scope of [{ plot: 0 }, { series: 0 }, { series: 0, point: 0 }]) {
    for (const dryRun of [true, false]) {
      s.apply(
        [
          {
            op: 'set-chart',
            slide: 1,
            shape: { name: 'Chart' },
            dataLabels: [{ scope, position: 'center' }],
          },
        ],
        changed,
        { dryRun, error: 'invalid_argument' },
      )
    }
  }
})

nativeTest('preset adjustment repair needs review and rejects stale exact-part evidence', (t) => {
  const s = scenario(t)
  const ops = [
    { op: 'add-slide', layout: 'blank' },
    {
      op: 'add-shape',
      slide: 0,
      kind: 'upArrow',
      name: 'Arrow',
      x: '1in',
      y: '1in',
      w: '2in',
      h: '3in',
    },
    {
      op: 'patch-ooxml',
      target: 'ppt/slides/slide1.xml',
      xpath: '//a:avLst',
      action: 'replace',
      value:
        '<a:avLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:gd name="adj2" fmla="val 25000"/></a:avLst>',
    },
  ]
  const request = { schemaVersion: 'pptx-patch/v1', ops }
  const patch = s.write('fixture.json', request)
  const source = join(s.directory, 'incomplete.pptx')
  s.run(['pptx', 'apply', '--patch', patch, '--output', source, '--allow-raw-xml', '--json'])
  const report = s.run(['pptx', 'vision-check', source, '--json'])
  const finding = report.semanticIssues.find((issue) => issue.code === 'preset-adjustments')
  assert.ok(finding?.remediation)
  const remediation = finding.remediation
  assert.equal(remediation.autoRetry, false)
  assert.equal(remediation.requiresRawXml, false)
  const context = {
    requestText: JSON.stringify(request),
    inputBytes: null,
    assets: [],
    assetRoot: s.directory,
  }
  assert.throws(
    () => prepareRemediation(remediation, context, { documentBytes: readFileSync(source) }),
    { code: 'review_required' },
  )
  const prepared = prepareRemediation(remediation, context, {
    documentBytes: readFileSync(source),
    reviewed: true,
  })
  const repaired = s.apply(prepared.patch.ops, source).output
  const checked = s.run(['pptx', 'vision-check', repaired, '--json'])
  assert.deepEqual(checked.semanticIssues, [])
  const xml = nativeParts(repaired).get('ppt/slides/slide1.xml').toString('utf8')
  assert.match(xml, /name="adj1"[^>]*fmla="val 50000"/)
  assert.match(xml, /name="adj2"[^>]*fmla="val 25000"/)
  const changed = s.apply(
    [
      {
        op: 'add-text-box',
        slide: 0,
        name: 'Unrelated note',
        x: '5in',
        y: '1in',
        w: '2in',
        h: '1in',
        text: 'Part changed',
      },
    ],
    source,
  ).output
  s.apply(prepared.patch.ops, changed, { error: 'invalid_operation' })
  const refreshed = s
    .run(['pptx', 'vision-check', changed, '--json'])
    .semanticIssues.find((issue) => issue.code === 'preset-adjustments').remediation
  s.apply(refreshed.patch.ops, changed)
})

nativeTest('sidecar collisions and existing sidecars fail before primary publication', (t) => {
  const s = scenario(t)
  const source = s.create()
  const sourceHash = createHash('sha256').update(readFileSync(source)).digest('hex')
  const patch = s.write('edit.json', {
    schemaVersion: 'pptx-patch/v1',
    ops: [{ op: 'set-text-frame', slide: 0, shape: { name: 'Body' }, text: 'Edited once' }],
  })
  const alias = join(s.directory, 'source-alias.pptx')
  symlinkSync(source, alias)
  for (const [index, sidecar] of [source, patch, alias].entries()) {
    const output = join(s.directory, `blocked-${index}.pptx`)
    s.run(
      [
        'pptx',
        'apply',
        '-i',
        source,
        '-p',
        patch,
        '-o',
        output,
        '--sidecar',
        sidecar,
        '--overwrite',
        '--json',
      ],
      'output_collision',
    )
    assert.equal(existsSync(output), false)
  }
  const output = join(s.directory, 'existing-sidecar.pptx')
  const sidecar = s.write('existing.json', 'Keep this evidence')
  s.run(
    ['pptx', 'apply', '-i', source, '-p', patch, '-o', output, '--sidecar', sidecar, '--json'],
    'output_exists',
  )
  assert.equal(existsSync(output), false)
  assert.equal(readFileSync(sidecar, 'utf8'), 'Keep this evidence')
  assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'), sourceHash)
})

nativeTest(
  'late sidecar failure leaves the primary PPTX and reaches the runner error summary',
  (t) => {
    const s = scenario(t)
    const source = s.create()
    const patch = s.write('edit.json', {
      schemaVersion: 'pptx-patch/v1',
      ops: [{ op: 'set-text-frame', slide: 0, shape: { name: 'Body' }, text: 'Edited once' }],
    })
    const blocker = s.write('not-a-directory', 'Retain this file')
    const output = join(s.directory, 'partial.pptx')
    const sidecar = join(blocker, 'sidecar.json')
    const report = s.run(
      ['pptx', 'apply', '-i', source, '-p', patch, '-o', output, '--sidecar', sidecar, '--json'],
      'output_error',
    )
    assert.equal(report.primaryOutputPublished, true)
    assert.equal(report.outputUntouched, false)
    assert.equal(report.output, output)
    assert.equal(report.blockedOutput, sidecar)
    assert.equal(s.body(output).textPreview, 'Edited once')
    assert.equal(s.body(source).textPreview, 'Quarterly review')
    assert.equal(report.retryCommand, undefined)
    assert.equal(report.error.retryCommand, undefined)
    const summary = { runDir: s.directory, phases: [], gates: [] }
    const secondOutput = join(s.directory, 'runner-partial.pptx')
    assert.throws(
      () =>
        createRunnerRuntime().runJsonPhase(summary, {
          name: 'apply',
          bin: binary,
          args: [
            'pptx',
            'apply',
            '-i',
            source,
            '-p',
            patch,
            '-o',
            secondOutput,
            '--sidecar',
            sidecar,
            '--json',
          ],
          artifact: join(s.directory, 'runner-apply.json'),
        }),
      (error) => {
        summary.error = summarizePhaseError(error)
        assert.equal(summary.error.primaryOutputPublished, true)
        assert.equal(summary.error.output, secondOutput)
        assert.equal(summary.error.blockedOutput, sidecar)
        return true
      },
    )
    s.write('runner-summary.json', summary)
    assert.equal(summary.phases[0].status, 'failed')
    assert.equal(s.body(secondOutput).textPreview, 'Edited once')
  },
)

nativeTest('brand and slide-copy reject duplicate input forms before file access', (t) => {
  const s = scenario(t)
  for (const action of ['apply-brand', 'slide-copy']) {
    const extra =
      action === 'apply-brand' ? ['--brand', 'missing.json'] : ['--source', 'missing.pptx']
    const args = [
      'pptx',
      action,
      'missing.pptx',
      '--input',
      'missing.pptx',
      ...extra,
      '-o',
      join(s.directory, `${action}.pptx`),
      '--json',
    ]
    const result = spawnSync(binary, args, { cwd: s.directory, encoding: 'utf8', timeout: 30_000 })
    s.write(`${action}-duplicate.json`, {
      args,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    })
    assert.equal(result.error, undefined)
    assert.equal(result.status, 2)
    assert.match(result.stderr, /input|target/i)
    assert.match(result.stderr, /both|duplicate|exactly one/i)
    assert.equal(existsSync(join(s.directory, `${action}.pptx`)), false)
  }
})

nativeTest(
  'letter spacing uses pt strings in text and rich notes, including dry-run validation',
  (t) => {
    const s = scenario(t)
    const source = s.create()
    for (const spacing of ['0.2pt', null, 2540]) {
      const ops = [
        {
          op: 'set-text-frame',
          slide: 0,
          shape: { name: 'Body' },
          font: { letterSpacing: spacing },
        },
        {
          op: 'set-slide-notes',
          slide: 0,
          paragraphs: [{ runs: [{ text: 'Speaker notes', font: { letterSpacing: spacing } }] }],
        },
      ]
      for (const op of ops) {
        for (const dryRun of [true, false]) {
          const result = s.apply([op], source, {
            dryRun,
            error: typeof spacing === 'number' ? 'invalid_argument' : null,
          })
          if (typeof spacing === 'number') {
            assert.equal(existsSync(result.output), false)
            assert.match(result.report.error.message, /letterSpacing|spacing/)
          } else assert.deepEqual(result.report.semanticIssues, [])
        }
      }
    }
  },
)

nativeTest(
  'Cartesian stock pages pass canonical PDF layout checks without shrinking display fonts',
  (t) => {
    const s = scenario(t, { useInstalledAuthorization: true })
    const { patch } = createDeck(JSON.parse(readFileSync(cartesianContent, 'utf8')))
    const candidate = s.apply(patch.ops).output
    const output = join(s.directory, 'visual-evidence')
    s.run([
      'pptx',
      'visual-audit',
      '--candidate',
      candidate,
      '--visual-mode',
      'create',
      '--output-dir',
      output,
      '--json',
    ])
    const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8'))
    assert.equal(
      manifest.checks.find((check) => check.id === 'pdf-final-layout').outcome,
      'pass',
      JSON.stringify(manifest.findings),
    )
    assert.equal(manifest.decision.action, 'proceed')
  },
  { visual: true },
)

nativeTest(
  'chart precision survives creation, format edits and canonical PDF rendering',
  (t) => {
    const s = scenario(t, { useInstalledAuthorization: true })
    const fieldDate = '2026-10-14'
    const surfaceData = {
      categories: ['A', 'B', 'C'],
      series: [
        { name: 'Front', values: [0, 0.1, 0.2] },
        { name: 'Back', values: [0.1, 0.2, 0.3] },
      ],
    }
    const cases = [
      ...[1234567890123, 1.23456789012345, 1.23456789012345].map((value, index) => ({
        name: ['General integer', 'General fraction', 'Fixed fraction'][index],
        kind: 'column',
        data: { categories: ['A'], series: [{ name: 'Value', values: [value] }] },
        format: 'General',
      })),
      {
        name: 'Finite histogram',
        kind: 'histogram',
        dataEx: { values: [-1e308, -5e307, 0, 5e307, 1e308], binCount: 2 },
      },
      ...['surface', 'surface-3d'].flatMap((kind) =>
        [false, true].map((reverseOrder) => ({
          name: `${kind} ${reverseOrder ? 'reversed' : 'automatic'}`,
          kind,
          data: surfaceData,
          scale: { majorUnit: 0.1, reverseOrder },
        })),
      ),
      {
        name: 'Authored tail',
        kind: 'surface',
        data: surfaceData,
        scale: { min: 0, max: 0.30000000000000004, majorUnit: 0.1 },
      },
    ]
    const ops = cases.flatMap(({ name, kind, data, dataEx, format, scale }, slide) => [
      { op: 'add-slide', layout: 'blank' },
      {
        op: 'add-text-box',
        slide,
        name: 'Caption',
        x: '0.65in',
        y: '0.55in',
        w: '12in',
        h: '0.5in',
        text: name,
      },
      {
        op: 'add-chart',
        slide,
        name: 'Chart',
        kind,
        x: '0.65in',
        y: '1.3in',
        w: '12in',
        h: '5.5in',
        ...(data ? { data, legend: 'right' } : { dataEx }),
      },
      ...(format
        ? [
            {
              op: 'set-chart',
              slide,
              shape: { name: 'Chart' },
              dataLabels: [
                {
                  showValue: true,
                  numberFormat: format,
                  position: 'outside-end',
                  font: { name: 'Arial', size: '14pt' },
                },
              ],
            },
          ]
        : []),
      ...(scale
        ? [
            {
              op: 'set-chart',
              slide,
              shape: { name: 'Chart' },
              axes: [{ axis: 'value', scale }],
            },
          ]
        : []),
    ])
    s.apply(ops, undefined, { dryRun: true })
    const source = s.apply(ops).output
    const sourceBytes = readFileSync(source)
    const edits = [
      { op: 'set-text-frame', slide: 0, shape: { name: 'Caption' }, text: 'Verified integer' },
      {
        op: 'set-chart',
        slide: 2,
        shape: { name: 'Chart' },
        dataLabels: [{ showValue: true, numberFormat: '0.00', position: 'outside-end' }],
      },
    ]
    s.apply(edits, source, { dryRun: true })
    const candidate = s.apply(edits, source).output
    const charts = (input, name) => {
      const path = join(s.directory, `${name}-data.json`)
      s.run(
        ['convert', input, '--to', 'json', '--output', path, '--field-date', fieldDate, '--quiet'],
        null,
        binary,
        { json: false },
      )
      return JSON.parse(readFileSync(path, 'utf8')).presentation.slides.map(
        (slide) => slide.elements.find((element) => element.kind === 'chart').chart,
      )
    }
    const before = charts(source, 'source')
    const after = charts(candidate, 'candidate')
    assert.deepEqual(after, before, 'Display formatting must not change the source data')
    for (const [index, item] of cases.entries()) {
      assert.deepEqual(
        after[index].series.map((series) => series.points.map((point) => point.y)),
        item.data ? item.data.series.map((series) => series.values) : [item.dataEx.values],
        item.name,
      )
    }
    const inspected = s.inspect(candidate)
    assert.deepEqual(
      inspected.slides.map(
        (slide) => slide.shapes.find((shape) => shape.name === 'Chart').chart.kind,
      ),
      cases.map((item) => item.kind),
    )
    const summary = s.run([
      'pptx',
      'diff',
      '--source',
      source,
      '--candidate',
      candidate,
      '--detail',
      'summary',
      '--output',
      join(s.directory, 'diff-full.json'),
      '--json',
    ])
    s.write('diff-summary.json', summary)
    const full = verifyDiffEvidence(summary, source, candidate)
    assert.equal(full.slides.length, cases.length)
    assert.ok(full.summary.reliableChanges > 0)
    assert.deepEqual(readFileSync(source), sourceBytes)
    const output = join(s.directory, 'visual-evidence')
    const manifest = s.run([
      'pptx',
      'visual-audit',
      '--candidate',
      candidate,
      '--visual-mode',
      'create',
      '--field-date',
      fieldDate,
      '--output-dir',
      output,
      '--json',
    ])
    assert.equal(manifest.renderContext.fieldDate, fieldDate)
    assert.equal(manifest.decision.action, 'proceed', JSON.stringify(manifest.findings))
    assert.equal(manifest.artifacts.filter((a) => a.mimeType === 'image/png').length, cases.length)
    const pdf = manifest.artifacts.find((a) => a.mimeType === 'application/pdf')
    const text = s.run(['pdf', 'extract-text', join(output, pdf.path), '--json'])
    s.write('pdf-text.json', text)
    assert.equal(text.pageCount, cases.length)
    const lines = text.pages.map((page) => page.text.split(/\r?\n/))
    assert.ok(lines[0].includes('1234567890123'))
    assert.ok(lines[1].includes('1.23456789012345'))
    assert.ok(lines[2].includes('1.23'))
    assert.ok(!lines[2].includes('1.23456789012345'))
    assert.match(text.pages[3].text, /\[-1e\+308, 0\]/)
    assert.match(text.pages[3].text, /\(0, 1e\+308\]/)
    assert.doesNotMatch(text.pages[3].text, /NaN|Infinity/)
    const bands = ['0.2–0.3', '0.1–0.2', '0–0.1']
    for (const index of [4, 5, 6, 7]) {
      assert.deepEqual(
        lines[index].filter((line) => line.includes('–')),
        index % 2 ? [...bands].reverse() : bands,
      )
    }
    assert.deepEqual(
      lines[8].filter((line) => line.includes('–')),
      ['0.3–0.30000000000000004', ...bands],
    )
  },
  { visual: true },
)

nativeTest(
  'source guards use stable IDs and the original complete paragraph across run edits',
  (t) => {
    const s = scenario(t)
    const first = s.create('Quarterly ')
    const source = s.apply(
      [{ op: 'add-run', slide: 0, shape: { name: 'Body' }, paragraph: 0, text: 'review' }],
      first,
    ).output
    const id = s.body(source).id
    const edit = {
      op: 'set-run',
      slide: 0,
      shape: { id },
      paragraph: 0,
      run: 0,
      sourceText: 'Quarterly review',
      text: 'Annual ',
    }
    for (const dryRun of [true, false]) {
      const changed = s.apply([edit, { ...edit, shape: id, run: 1, text: 'summary' }], source, {
        dryRun,
      })
      if (!dryRun) assert.equal(s.body(changed.output).textPreview, 'Annual summary')
      const invalid = s.apply([{ ...edit, shape: { name: 'Body' } }], source, {
        dryRun,
        error: 'invalid_parameter',
      })
      assert.equal(invalid.report.error.details.field, '/ops/0/shape')
      assert.equal(invalid.report.error.details.reason, 'unsupported')
      const stale = s.apply([{ ...edit, sourceText: 'Quarterly ' }], source, {
        dryRun,
        error: 'i18n_source_guard_mismatch',
      })
      assert.equal(stale.report.error.details.field, '/ops/0/sourceText')
      assert.equal(stale.report.error.details.reason, 'source_text_mismatch')
      assert.equal(stale.report.error.details.opIndex, 0)
    }
  },
)

nativeTest(
  'nested guards fail when reached; unused branches and try rollback keep ordinary semantics',
  (t) => {
    const s = scenario(t)
    const source = s.create()
    const edit = {
      op: 'set-run',
      slide: 0,
      shape: { id: s.body(source).id },
      paragraph: 0,
      run: 0,
      sourceText: 'Quarterly review',
      text: 'Changed',
    }
    const branch = {
      op: 'if',
      condition: { kind: 'slide-count', op: 'eq', value: 1 },
      then: [edit],
    }
    for (const dryRun of [true, false])
      s.apply([branch], source, { dryRun, error: 'invalid_argument' })
    const untouched = s.apply([{ ...branch, condition: { ...branch.condition, value: 2 } }], source)
    assert.equal(s.body(untouched.output).textPreview, 'Quarterly review')
    const recovered = s.apply(
      [
        {
          op: 'try',
          recoverable: ['invalid_argument'],
          body: [
            { op: 'set-text-frame', slide: 0, shape: { name: 'Body' }, text: 'Must roll back' },
            edit,
          ],
          catch: [{ op: 'set-slide-notes', slide: 0, text: 'Recovered' }],
        },
      ],
      source,
    )
    assert.equal(s.body(recovered.output).textPreview, 'Quarterly review')
    const { sourceText: _sourceText, ...ordinary } = edit
    const unguarded = s.apply([{ ...branch, then: [ordinary] }], source)
    assert.equal(s.body(unguarded.output).textPreview, 'Changed')
  },
)

nativeTest(
  'native shape autofit materializes geometry, preserves anchors, and rejects unsupported layouts atomically',
  (t) => {
    const s = scenario(t)
    const text = 'First paragraph\nSecond paragraph\nThird paragraph\nFinal marker'
    const source = s.create(text, 1, {
      autofit: { mode: 'shape' },
      wordWrap: true,
      verticalAnchor: 'top',
    })
    const original = s.body(source)
    const changed = s.apply(
      [{ op: 'set-text-frame', slide: 0, shape: { name: 'Body' }, text: 'Short' }],
      source,
    )
    const small = s.body(changed.output)
    assert.equal(small.bbox.wEmu, original.bbox.wEmu)
    assert.equal(small.bbox.yEmu, original.bbox.yEmu)
    assert(small.bbox.hEmu < original.bbox.hEmu)
    const again = s.apply(
      [
        {
          op: 'set-text-frame',
          slide: 0,
          shape: { name: 'Body' },
          frame: { autofit: { mode: 'shape' } },
        },
      ],
      changed.output,
    )
    assert.deepEqual(s.body(again.output).bbox, small.bbox)
    for (const dryRun of [true, false])
      s.apply(
        [
          {
            op: 'set-text-frame',
            slide: 0,
            shape: { name: 'Body' },
            frame: {
              autofit: { mode: 'shape' },
              direction: 'vertical',
            },
          },
        ],
        source,
        { dryRun, error: 'invalid_operation' },
      )
  },
)

nativeTest(
  'guarded text edits on shape-autofit frames disclose final geometry and fail strict style preservation',
  (t) => {
    const s = scenario(t)
    const text =
      'A long review paragraph with multiple observations and supporting evidence that wraps inside the frame.'
    const source = s.create(text, 1, { autofit: { mode: 'shape' }, wordWrap: true })
    const original = s.body(source)
    const changed = s.apply(
      [
        {
          op: 'set-run',
          slide: 0,
          shape: { id: original.id },
          paragraph: 0,
          run: 0,
          sourceText: text,
          text: 'Short review',
        },
      ],
      source,
    )
    assert(s.body(changed.output).bbox.hEmu < original.bbox.hEmu)
    const diff = s.run([
      'pptx',
      'diff',
      '--source',
      source,
      '--candidate',
      changed.output,
      '--detail',
      'full',
      '--json',
    ])
    const shape = diff.slides[0].shapeChanges.find((item) => item.target?.id === original.id)
    assert(shape.categories.includes('text'))
    assert(shape.categories.includes('shape'))
    const style = s.run(
      ['pptx', 'i18n-style-diff', '--source', source, '--candidate', changed.output, '--json'],
      3,
    )
    assert.equal(style.agentGate.passed, false)
    assert(style.styleBlockers.some((item) => item.field === 'styleSignature'))
  },
)

nativeTest(
  'text layout policy preserves geometry and autofit without cancelling pending reflow',
  (t) => {
    const s = scenario(t)
    const text = 'A long review paragraph with multiple observations that wraps inside the frame.'
    const source = s.create(text, 1, { autofit: { mode: 'shape' }, wordWrap: true })
    const original = s.body(source)
    const edit = {
      op: 'set-run',
      slide: 0,
      shape: { id: original.id },
      paragraph: 0,
      run: 0,
      sourceText: text,
      text: 'Short review',
      textLayout: 'preserve-geometry',
    }
    s.apply([edit], source, { dryRun: true })
    const kept = s.apply([edit], source)
    assert.equal(s.body(kept.output).textPreview, edit.text)
    assert.deepEqual(s.body(kept.output).bbox, original.bbox)
    assert.match(nativeParts(kept.output).get('ppt/slides/slide1.xml').toString(), /spAutoFit/)
    const style = s.run([
      'pptx',
      'i18n-style-diff',
      '--source',
      source,
      '--candidate',
      kept.output,
      '--json',
    ])
    assert.equal(style.agentGate.passed, true)
    for (const pending of [
      {
        op: 'set-text-frame',
        slide: 0,
        shape: { id: original.id },
        frame: { autofit: { mode: 'shape' } },
      },
      { ...edit, textLayout: 'respect-autofit' },
    ]) {
      const changed = s.apply([pending, edit], source)
      assert(s.body(changed.output).bbox.hEmu < original.bbox.hEmu)
    }
    for (const textLayout of [null, 'preserve', true]) {
      for (const dryRun of [true, false]) {
        s.apply([{ ...edit, textLayout }], source, { dryRun, error: 'invalid_argument' })
      }
    }
  },
)

nativeTest(
  'apply summary binds omitted Unicode values while retaining full candidate and sidecar text',
  (t) => {
    const s = scenario(t)
    const source = s.create('Original')
    const text = '季度报告📊'.repeat(220)
    const patch = s.write('long-text.json', {
      schemaVersion: 'pptx-patch/v1',
      ops: [{ op: 'set-run', slide: 0, shape: { name: 'Body' }, paragraph: 0, run: 0, text }],
    })
    const full = s.run([
      'pptx',
      'apply',
      '--input',
      source,
      '--patch',
      patch,
      '--dry-run',
      '--json',
    ])
    for (const dryRun of [true, false]) {
      const output = join(s.directory, dryRun ? 'dry.pptx' : 'summary.pptx')
      const summary = s.run([
        'pptx',
        'apply',
        '--input',
        source,
        '--patch',
        patch,
        '--output',
        output,
        '--detail',
        'summary',
        ...(dryRun ? ['--dry-run'] : []),
        '--json',
      ])
      assert.equal(summary.detail, 'summary')
      assert(summary.valueSummaries.length > 0)
      assert.deepEqual(summary.semanticIssues, full.semanticIssues)
      for (const item of summary.valueSummaries) {
        const keys = item.path
          .slice(1)
          .split('/')
          .map((key) => key.replaceAll('~1', '/').replaceAll('~0', '~'))
        const value = keys.reduce((node, key) => node[key], full)
        assert.equal(typeof value, 'string')
        assert.equal(Buffer.byteLength(value), item.utf8Bytes)
        assert.equal(createHash('sha256').update(value).digest('hex'), item.sha256)
        assert.equal(item.preview, [...value].slice(0, 128).join(''))
        assert.equal(item.previewTruncated, true)
        assert.equal(
          keys.reduce((node, key) => node?.[key], summary),
          undefined,
        )
      }
      assert.equal(existsSync(output), !dryRun)
      if (!dryRun) {
        assert(nativeParts(output).get('ppt/slides/slide1.xml').toString().includes(`>${text}<`))
        assert(readFileSync(`${output}.xdoc.json`, 'utf8').includes(text))
      }
    }
  },
)

nativeTest('daemon invalidates cached inspection after same-inode external writes', (t) => {
  const s = scenario(t)
  const source = s.create('Original cached text')
  const changed = s.create('Externally replaced text')
  try {
    const inspect = () => s.run(['pptx', 'inspect', source, '--daemon-strict', '--json'])
    const first = inspect()
    assert.deepEqual(inspect(), first)
    const inode = statSync(source).ino
    writeFileSync(source, readFileSync(changed))
    assert.equal(statSync(source).ino, inode)
    const fresh = inspect()
    assert.equal(
      fresh.slides[0].shapes.find((shape) => shape.name === 'Body').textPreview,
      'Externally replaced text',
    )
    assert.deepEqual(fresh, s.inspect(source))
  } finally {
    s.run(['daemon', 'stop', '--json'])
  }
})

nativeTest('strict slide preview refuses Free fallback without publishing artifacts', (t) => {
  const s = scenario(t)
  const source = s.create()
  const output = join(s.directory, 'strict-preview')
  const report = s.run(
    [
      'pptx',
      'preview',
      source,
      '--output-dir',
      output,
      '--require-entitlement',
      '--require-unwatermarked',
      '--json',
    ],
    4,
  )
  assert.equal(report.error.code, 'strict_mode_unsatisfied')
  assert.equal(report.error.stage, 'authorization')
  assert.equal(report.error.details.outputDisposition, 'deny')
  assert.equal(existsSync(output), false)
  const schema = s.run(['schema', '--command', 'pptx.preview'])
  const preview = schema.commands.pptx.subcommands.preview
  assert.deepEqual(preview.authorization.intentBindings, [
    { condition: 'without --layout', feature: 'convert', outputType: 'png' },
    { condition: 'with --layout', feature: 'modify', outputType: 'pptx' },
  ])
})

nativeTest('cross-deck copy retains source language and blocks destination locale leakage', (t) => {
  const s = scenario(t)
  const created = s.create('Source language')
  // Controlled fixture: expose presentation-level language inheritance.
  const base = s.apply(
    [
      {
        op: 'patch-ooxml',
        target: 'ppt/slides/slide1.xml',
        xpath: '//a:rPr/@lang',
        action: 'remove',
      },
    ],
    created,
    { allowRawXml: true },
  ).output
  const withDefaults = (input, language) =>
    s.apply(
      [
        {
          op: 'patch-ooxml',
          target: 'ppt/presentation.xml',
          xpath: '/p:presentation/p:defaultTextStyle',
          action: 'replace',
          value:
            '<p:defaultTextStyle xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
            `<a:lvl1pPr><a:defRPr${language ? ` lang="${language}"` : ''}/></a:lvl1pPr></p:defaultTextStyle>`,
        },
      ],
      input,
      { allowRawXml: true },
    ).output
  const target = withDefaults(base, 'de-DE')
  const source = withDefaults(base, 'en-US')
  const sourceBytes = readFileSync(source)
  const targetSlide = nativeParts(target).get('ppt/slides/slide1.xml')
  const args = (donor, output) => [
    'pptx',
    'slide-copy',
    '--input',
    target,
    '--source',
    donor,
    '--all',
    '--template-strategy',
    'register-source',
    '--size-strategy',
    'require-match',
    '--output',
    output,
    '--json',
  ]
  const copied = join(s.directory, 'copied.pptx')
  const preflight = s.run([...args(source, copied), '--dry-run'])
  assert.equal(preflight.preflight.ready, true)
  s.run(args(source, copied))
  const parts = nativeParts(copied)
  assert.deepEqual(parts.get('ppt/slides/slide1.xml'), targetSlide)
  assert.match(parts.get('ppt/slides/slide2.xml').toString(), /lang="en-US"/)
  assert.deepEqual(readFileSync(source), sourceBytes)
  const unset = withDefaults(base, null)
  for (const dryRun of [true, false]) {
    const output = join(s.directory, dryRun ? 'blocked-dry.pptx' : 'blocked-copy.pptx')
    const blocked = s.run([...args(unset, output), ...(dryRun ? ['--dry-run'] : [])], 3)
    assert(blocked.preflight.blockers.some((item) => item.code === 'unsupported-text-defaults'))
    assert.equal(existsSync(output), false)
  }
})

nativeTest(
  'translation planning binds retained parts to source relationships even for preserved units',
  (t) => {
    const s = scenario(t)
    const source = s.create('Quarterly review', 2, { autofit: { mode: 'shape' }, wordWrap: false })
    const scanFile = join(s.directory, 'scan.json')
    s.run([
      'pptx',
      'i18n-scan',
      '--source',
      source,
      '--source-lang',
      'en',
      '--mode',
      'source',
      '--output',
      scanFile,
      '--json',
    ])
    const scan = JSON.parse(readFileSync(scanFile, 'utf8'))
    const shapes = scan.i18nUnits.units.filter(
      (unit) => unit.sourceText === 'Quarterly review' && unit.selectors?.textPlan,
    )
    assert.equal(shapes.length, 2)
    const data = s.write('translations.json', {
      schemaVersion: 'pptx-i18n-translations/v1',
      sourceLang: 'en',
      targetLang: 'fr',
      translations: scan.i18nUnits.units
        .filter((unit) => unit.action === 'translate')
        .map(({ unitId, sourceHash, sourceText }) => ({
          unitId,
          sourceHash,
          sourceText,
          targetText: sourceText === 'Quarterly review' ? 'Revue trimestrielle' : sourceText,
        })),
    })
    const units = s.write('units.json', scan.i18nUnits)
    const planFile = join(s.directory, 'plan.json')
    s.run([
      'pptx',
      'i18n-plan',
      '--source',
      source,
      '--units-file',
      units,
      '--data',
      data,
      '--output',
      planFile,
      '--json',
    ])
    const plan = JSON.parse(readFileSync(planFile, 'utf8'))
    assert.equal(plan.status, 'pass')
    assert(plan.patch.ops.length > 0)
    assert(plan.patch.ops.every((op) => op.textLayout === 'preserve-geometry'))
    const textPlan = s.run([
      'pptx',
      'i18n-text-plan',
      '--source',
      source,
      '--data',
      s.write('text-plan-input.json', plan.textPlan),
      '--json',
    ])
    assert.deepEqual(textPlan.patch.ops, plan.patch.ops)
    for (const part of [undefined, 'missing/page.slide', shapes[1].part]) {
      for (const action of ['i18n-plan', 'i18n-anchor-draft']) {
        const inventory = structuredClone(scan.i18nUnits)
        const unit = inventory.units.find((item) => item.unitId === shapes[0].unitId)
        unit.action = 'preserve'
        if (part === undefined) delete unit.part
        else unit.part = part
        const badUnits = s.write(
          `invalid-${action}-${part ? part.replaceAll('/', '-') : 'missing'}.json`,
          inventory,
        )
        const output = join(
          s.directory,
          `rejected-${action}-${part ? part.replaceAll('/', '-') : 'missing'}.json`,
        )
        s.run(
          [
            'pptx',
            action,
            '--source',
            source,
            '--units-file',
            badUnits,
            '--data',
            data,
            '--output',
            output,
            '--json',
          ],
          'invalid_data',
        )
        assert.equal(existsSync(output), false)
      }
    }
  },
)

nativeTest(
  'published translation preparation preserves source identities through real guarded apply',
  (t) => {
    const s = scenario(t)
    const source = s.create('Quarterly review', 2, { autofit: { mode: 'shape' }, wordWrap: false })
    const sourceHash = createHash('sha256').update(readFileSync(source)).digest('hex')
    const runDir = join(s.directory, 'prepare')
    const args = [
      prepareScript,
      '--source',
      source,
      '--source-lang',
      'en',
      '--target-lang',
      'fr',
      '--run-dir',
      runDir,
      '--xdoc-bin',
      binary,
      '--progress',
      'off',
      '--json',
    ]
    const pending = s.run(args, null, process.execPath)
    assert.equal(pending.status, 'needs-translations')
    const memory = JSON.parse(readFileSync(join(runDir, 'translation-memory.json'), 'utf8'))
    const fill = s.write(
      'fill.jsonl',
      memory.entries
        .map(({ memoryId, sourceText }) =>
          JSON.stringify({
            memoryId,
            sourceText,
            targetText: sourceText === 'Quarterly review' ? 'Revue trimestrielle' : sourceText,
          }),
        )
        .join('\n') + '\n',
    )
    const prepared = s.run([...args, '--apply', '--fill', fill], null, process.execPath)
    assert.equal(prepared.status, 'prepared')
    const candidate = prepared.artifacts.candidate
    assert.equal(s.body(candidate).textPreview, 'Revue trimestrielle')
    assert.deepEqual(s.body(candidate).bbox, s.body(source).bbox)
    const style = s.run([
      'pptx',
      'i18n-style-diff',
      '--source',
      source,
      '--candidate',
      candidate,
      '--json',
    ])
    assert.equal(style.agentGate.passed, true)
    const unitsFile = prepared.artifacts.classifiedScan ?? prepared.artifacts.scan
    const classified = JSON.parse(readFileSync(unitsFile, 'utf8'))
    assert(
      classified.i18nUnits.units
        .filter((unit) => unit.selectors?.textPlan)
        .every((unit) => typeof unit.part === 'string' && unit.part.length > 0),
    )
    const gatePath = join(s.directory, 'candidate-gate.json')
    const gate = s.run([
      'pptx',
      'i18n-scan',
      '--source',
      candidate,
      '--mode',
      'candidate',
      '--units-file',
      unitsFile,
      '--data',
      prepared.artifacts.translations,
      '--output',
      gatePath,
      '--json',
    ])
    assert.equal(gate.agentGate.passed, true)
    assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'), sourceHash)
  },
)

nativeTest(
  'published Edit Contract closes real guarded text edits using native semantic and visual reports',
  (t) => {
    const s = scenario(t)
    const source = s.create()
    const id = s.body(source).id
    const output = join(s.directory, 'edited.pptx')
    const draft = s.write('edit-contract-draft.json', {
      schemaVersion: 'pptx-nova-edit-contract/v1',
      request: 'Rename the review title and preserve the other objects and styling',
      scope: 'single-object',
      operationKind: 'text-edit',
      targets: [
        {
          id: 'review-title',
          slide: 0,
          opIndexes: [0],
          selector: { shape: { id } },
          expected: {
            beforeText: 'Quarterly review',
            afterText: 'Annual review',
            changeCategories: ['text'],
          },
        },
      ],
      allowedChanges: ['text'],
      preserve: ['slide-count', 'non-target-shapes', 'target-text-style'],
      requiredEvidence: [
        'dry-run',
        'semantic-diff',
        'style-diff',
        'png-preview',
        'vision-diff',
        'final-inspect',
      ],
    })
    const contract = join(s.directory, 'edit-contract.json')
    s.run(
      [
        skillScript('pptx-nova-edit-contract'),
        '--draft',
        draft,
        '--source',
        source,
        '--output',
        contract,
        '--json',
      ],
      null,
      process.execPath,
    )
    const patch = s.write('edit.patch.json', {
      schemaVersion: 'pptx-patch/v1',
      ops: [
        {
          op: 'set-run',
          slide: 0,
          shape: { id },
          paragraph: 0,
          run: 0,
          sourceText: 'Quarterly review',
          text: 'Annual review',
        },
      ],
    })
    const applyArgs = [
      'pptx',
      'apply',
      '--input',
      source,
      '--patch',
      patch,
      '--output',
      output,
      '--json',
    ]
    const dryRun = s.write('dry-run.json', s.run([...applyArgs, '--dry-run']))
    s.run(applyArgs)
    const diff = s.run([
      'pptx',
      'diff',
      '--source',
      source,
      '--candidate',
      output,
      '--detail',
      'full',
      '--json',
    ])
    assert.equal(diff.summary.baselineSlideCount, 1)
    assert.equal(diff.summary.targetSlideCount, 1)
    assert.equal(
      diff.slides[0].shapeChanges.find((shape) => shape.target?.id === id).target.textPreview,
      'Annual review',
    )
    const reports = {
      'semantic-diff': s.write('pptx-diff.json', diff),
      'style-diff': s.write(
        'style-diff.json',
        s.run(['pptx', 'i18n-style-diff', '--source', source, '--candidate', output, '--json']),
      ),
      'png-preview': s.write(
        'preview.json',
        s.run([
          'pptx',
          'preview',
          output,
          '--slides',
          '1',
          '--output-dir',
          join(s.directory, 'previews'),
          '--json',
        ]),
      ),
      'vision-diff': s.write(
        'vision-diff.json',
        s.run([
          'pptx',
          'vision-diff',
          '--source',
          source,
          '--candidate',
          output,
          '--slides',
          '1',
          '--json',
        ]),
      ),
      'final-inspect': s.write('final-inspect.json', s.run(['pptx', 'inspect', output, '--json'])),
    }
    const manifest = join(s.directory, 'evidence-manifest.json')
    s.run(
      [
        skillScript('pptx-nova-edit-evidence-manifest'),
        '--candidate',
        output,
        ...Object.entries(reports).flatMap(([kind, path]) => ['--evidence', `${kind}=${path}`]),
        '--output',
        manifest,
        '--json',
      ],
      null,
      process.execPath,
    )
    const gate = s.run(
      [
        skillScript('pptx-nova-edit-contract-gate'),
        '--contract',
        contract,
        '--candidate',
        output,
        '--dry-run',
        dryRun,
        '--strict',
        '--json',
      ],
      null,
      process.execPath,
    )
    assert.equal(gate.agentGate.passed, true, JSON.stringify(gate.blockers))
    assert.equal(gate.status, 'pass')
    const summaryDiff = s.write(
      'summary-diff.json',
      s.run(['pptx', 'diff', '--source', source, '--candidate', output, '--json']),
    )
    const summaryManifest = join(s.directory, 'summary-evidence-manifest.json')
    s.run(
      [
        skillScript('pptx-nova-edit-evidence-manifest'),
        '--candidate',
        output,
        ...Object.entries({ ...reports, 'semantic-diff': summaryDiff }).flatMap(([kind, path]) => [
          '--evidence',
          `${kind}=${path}`,
        ]),
        '--output',
        summaryManifest,
        '--json',
      ],
      null,
      process.execPath,
    )
    const blocked = s.run(
      [
        skillScript('pptx-nova-edit-contract-gate'),
        '--contract',
        contract,
        '--candidate',
        output,
        '--diff',
        summaryDiff,
        '--evidence-manifest',
        summaryManifest,
        '--output',
        join(s.directory, 'summary-diff-gate.json'),
        '--strict',
        '--json',
      ],
      2,
      process.execPath,
    )
    assert.equal(blocked.agentGate.passed, false)
    assert.equal(blocked.agentGate.nextAction, 'collect-full-semantic-diff')
  },
)

nativeTest(
  'invalid lengths retain field identity and require the intended unit rather than deleting the op',
  (t) => {
    const s = scenario(t)
    const invalid = s.apply(
      [
        { op: 'add-slide' },
        {
          op: 'add-text-box',
          slide: 0,
          x: 1,
          y: '1in',
          w: '4in',
          h: '1in',
          text: 'Keep this content',
        },
      ],
      null,
      { dryRun: true, error: 'invalid_argument' },
    )
    assert.equal(invalid.report.error.path, '/ops/1/x')
    assert.equal(invalid.report.error.actual, 1)
    assert.equal(
      invalid.report.error.suggestions[0].remediationUnavailable.reason,
      'input-required',
    )
    assert.equal(invalid.report.error.suggestions[0].remediation, undefined)
  },
)

nativeTest(
  'asset roots reject absolute, traversal and escaping symlink paths before output publication',
  (t) => {
    const s = scenario(t)
    const root = join(s.directory, 'assets')
    mkdirSync(root)
    // A valid image ensures path rejection cannot be confused with decoding failure.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6GQAAAAASUVORK5CYII=',
      'base64',
    )
    const outside = s.write('outside.png', png)
    writeFileSync(join(root, 'inside.png'), png)
    symlinkSync(outside, join(root, 'escape.png'))
    const ops = (path) => [
      { op: 'add-slide' },
      {
        op: 'add-image',
        slide: 0,
        x: '1in',
        y: '1in',
        w: '1in',
        h: '1in',
        assetSource: { path, mimeType: 'image/png' },
      },
    ]
    s.apply(ops('inside.png'), null, { assetRoot: root })
    for (const path of [outside, '../outside.png', 'escape.png']) {
      for (const dryRun of [true, false])
        s.apply(ops(path), null, { assetRoot: root, dryRun, error: 'invalid_argument' })
    }
    assert.equal(
      createHash('sha256').update(readFileSync(outside)).digest('hex'),
      createHash('sha256').update(png).digest('hex'),
    )
  },
)

nativeTest(
  'fixed filter choreography creates logical effects and supports stable-id edits',
  (t) => {
    const s = scenario(t)
    const effects = ['box', 'dissolve']
    const basePatch = {
      schemaVersion: 'pptx-patch/v1',
      ops: effects.flatMap((effect, slide) => [
        { op: 'add-slide', layout: 'blank' },
        {
          op: 'add-text-box',
          slide,
          name: 'Body',
          x: '1in',
          y: '1in',
          w: '7in',
          h: '1in',
          text: `${effect}: entrance, then exit`,
        },
        {
          op: 'set-text-frame',
          slide,
          shape: { name: 'Body' },
          font: { name: 'Arial', size: '24pt' },
        },
      ]),
    }
    const choreography = {
      schemaVersion: 'pptx-patch/v1',
      ops: effects.map((effect, slide) => ({
        op: 'set-slide-animations',
        slide,
        animations: [
          { shape: { name: 'Body' }, effect, duration: 400, repeat: 1 },
          {
            shape: { name: 'Body' },
            effect,
            phase: 'exit',
            trigger: 'after-previous',
            duration: 600,
          },
        ],
      })),
    }
    const patch = composeChoreography({ basePatch, choreography, slideCount: 2 })
    s.write('choreography.json', choreography)
    s.apply(patch.ops, null, { dryRun: true })
    const source = s.apply(patch.ops).output
    const before = s.inspect(source)
    s.write('animation-source.json', { candidate: source, inspect: before })
    for (const [slide, effect] of effects.entries()) {
      const page = before.slides[slide]
      assert.equal(page.timingSummary.editableAnimationCount, 2)
      assert.equal(page.timingSummary.unattributedTimingCount, 0)
      assert.equal(page.timingSummary.mergeSafe, true)
      for (const [index, entry] of page.animations.entries()) {
        assert.equal(entry.kind, 'effect')
        assert.equal(entry.effect, effect)
        assert.equal(entry.phase, index ? 'exit' : 'entrance')
        assert.equal(entry.editable, true)
        assert.equal(entry.target, undefined)
        assert.deepEqual(entry.targets, [{ shapeId: page.shapes[0].id, shapeName: 'Body' }])
        assert.equal(entry.behaviors.length, 2, 'visibility and filter form one logical effect')
        assert.equal(entry.source.attributes.presetID, effect === 'box' ? '4' : '9')
        const filter = entry.behaviors.find((node) => node.tag.endsWith(':animEffect'))
        assert.equal(filter.attributes.filter, effect === 'box' ? 'box(in)' : 'dissolve')
      }
    }
    const id = before.slides[0].animations[0].id
    const edit = [
      { op: 'set-slide-animations', slide: 0, animations: [{ id, duration: 0, delay: 30 }] },
    ]
    s.apply(edit, source, { dryRun: true })
    const changed = s.apply(edit, source).output
    const after = s.inspect(changed)
    assert.equal(after.slides[0].animations[0].id, id)
    assert.equal(after.slides[0].animations[0].durationMs, 0)
    assert.equal(after.slides[0].animations[0].delayMs, 30)
    assert.deepEqual(after.slides[1].animations, before.slides[1].animations)
    const removed = s.apply(
      [{ op: 'set-slide-animations', slide: 0, remove: [id] }],
      changed,
    ).output
    assert.equal(s.inspect(removed).slides[0].animations.length, 1)
    assert.deepEqual(s.inspect(source), before, 'the original deck remains unchanged')
  },
)

nativeTest(
  'fixed filters reject text builds directions and indefinite repeats before publication',
  (t) => {
    const s = scenario(t)
    const source = s.create()
    const original = readFileSync(source)
    for (const effect of ['box', 'dissolve']) {
      for (const extra of [
        { direction: 'from-left' },
        { build: 'all-at-once' },
        { repeat: 'indefinite' },
        { target: { shape: { name: 'Body' }, paragraph: 0 } },
      ]) {
        const animation = { effect, ...extra }
        if (!animation.target) animation.shape = { name: 'Body' }
        const ops = [{ op: 'set-slide-animations', slide: 0, animations: [animation] }]
        for (const dryRun of [true, false])
          s.apply(ops, source, { dryRun, error: 'invalid_argument' })
      }
    }
    assert.deepEqual(readFileSync(source), original)
  },
)

nativeTest(
  'logical inspect retains every compound target and keeps unmodeled timing nullable',
  (t) => {
    const s = scenario(t)
    const source = s.create()
    const withShapes = s.apply(
      [
        {
          op: 'add-text-box',
          slide: 0,
          name: 'Other',
          x: '1in',
          y: '3in',
          w: '5in',
          h: '1in',
          text: 'Other',
        },
      ],
      source,
    ).output
    const page = s.inspect(withShapes).slides[0]
    const targets = ['Body', 'Other'].map(
      (name) => page.shapes.find((shape) => shape.name === name).id,
    )
    // Synthetic diagnostic fixture only; never a fallback for editing a user deck.
    const p = 'http://schemas.openxmlformats.org/presentationml/2006/main'
    const behavior = (tag, id, shape) =>
      `<p:${tag}><p:cBhvr><p:cTn id="${id}" dur="500"/>` +
      `<p:tgtEl><p:spTgt spid="${shape}"/></p:tgtEl></p:cBhvr></p:${tag}>`
    const timing =
      `<p:timing xmlns:p="${p}"><p:tnLst><p:par>` +
      '<p:cTn id="20" presetClass="emph" presetID="999" nodeType="clickEffect"><p:childTnLst>' +
      behavior('animScale', 21, targets[0]) +
      behavior('animRot', 22, targets[1]) +
      '</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>'
    const fixture = s.apply(
      [{ op: 'patch-ooxml', target: page.partName, xpath: '/p:sld', action: 'add', value: timing }],
      withShapes,
      { allowRawXml: true },
    ).output
    const inspected = s.inspect(fixture).slides[0]
    assert.equal(inspected.animations.length, 1)
    const entry = inspected.animations[0]
    assert.equal(entry.id, '20')
    assert.equal(entry.kind, 'effect')
    assert.deepEqual(
      entry.targets.map((target) => target.shapeId),
      targets,
    )
    assert.equal(entry.behaviors.length, 2)
    assert.equal(entry.durationMs, null)
    assert.equal(entry.delayMs, null)
    assert.equal(entry.editable, false)
    assert.equal(inspected.timingSummary.mergeSafe, false)
    assert.equal(inspected.timingSummary.preserveOnlyAnimationCount, 1)
    const original = readFileSync(fixture)
    for (const dryRun of [true, false])
      s.apply(
        [{ op: 'set-slide-animations', slide: 0, animations: [{ id: entry.id, duration: 300 }] }],
        fixture,
        { dryRun, error: 'invalid_operation' },
      )
    assert.deepEqual(readFileSync(fixture), original)
  },
)

nativeTest('decimal letter spacing rounds once with exact halves away from zero', (t) => {
  const s = scenario(t)
  const source = s.create()
  for (const [value, expected] of [
    ['0.005pt', 0.01],
    ['-0.005pt', -0.01],
    ['0.004999pt', 0],
    ['-0.004999pt', 0],
    ['0.014999pt', 0.01],
    ['-0.014999pt', -0.01],
  ]) {
    const ops = [
      {
        op: 'set-run',
        slide: 0,
        shape: { name: 'Body' },
        paragraph: 0,
        run: 0,
        font: { letterSpacing: value },
      },
    ]
    s.apply(ops, source, { dryRun: true })
    const output = s.apply(ops, source).output
    const facts = s.body(output).fontFacts
    assert(
      facts.some((fact) => fact.font.spacingPt === expected),
      JSON.stringify(facts),
    )
  }
})

nativeTest(
  'POSIX asset roots keep symlink parent traversal and literal output backslashes',
  (t) => {
    if (process.platform === 'win32') return t.skip('POSIX filesystem contract')
    const s = scenario(t)
    const root = join(s.directory, 'real')
    mkdirSync(join(root, 'child'), { recursive: true })
    symlinkSync(join(root, 'child'), join(s.directory, 'link'))
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6GQAAAAASUVORK5CYII=',
      'base64',
    )
    writeFileSync(join(root, 'inside.png'), png)
    const patch = s.write('real/patch.json', {
      schemaVersion: 'pptx-patch/v1',
      ops: [
        { op: 'add-slide' },
        {
          op: 'add-image',
          slide: 0,
          name: 'Asset',
          x: '1in',
          y: '1in',
          w: '1in',
          h: '1in',
          assetSource: { path: 'inside.png', mimeType: 'image/png' },
        },
      ],
    })
    s.write('literal', 'This file must not become a directory')
    for (const explicit of [true, false]) {
      // Do not use join/resolve for a path whose symlink/.. semantics are under test.
      const aliasedRoot = `${s.directory}/link/..`
      const output = `${s.directory}/literal\\${explicit ? 'explicit' : 'inferred'}.pptx`
      const result = s.run([
        'pptx',
        'apply',
        '-p',
        explicit ? patch : `${aliasedRoot}/patch.json`,
        '-o',
        output,
        ...(explicit ? ['--asset-root', aliasedRoot] : []),
        '--json',
      ])
      assert.deepEqual(result.semanticIssues, [])
      assert.equal(existsSync(output), true)
      assert.equal(existsSync(`${output}.xdoc.json`), true)
      assert.equal(
        s.inspect(output).slides[0].shapes.filter((shape) => shape.name === 'Asset').length,
        1,
      )
    }
    assert.equal(
      readFileSync(join(s.directory, 'literal'), 'utf8'),
      'This file must not become a directory',
    )
  },
)

nativeTest(
  'daemon late sidecar failure reports publication while preserving its input session',
  (t) => {
    const s = scenario(t)
    const source = s.create()
    try {
      s.run(['pptx', 'inspect', source, '--daemon-strict', '--json'])
      const patch = s.write('edit.json', {
        schemaVersion: 'pptx-patch/v1',
        ops: [
          {
            op: 'set-text-frame',
            slide: 0,
            shape: { name: 'Body' },
            text: 'Published before sidecar failure',
          },
        ],
      })
      const blocker = s.write('not-a-directory', 'Keep')
      const output = join(s.directory, 'partial.pptx')
      const sidecar = join(blocker, 'sidecar.json')
      const report = s.run(
        [
          'pptx',
          'apply',
          '-i',
          source,
          '-p',
          patch,
          '-o',
          output,
          '--sidecar',
          sidecar,
          '--daemon-strict',
          '--json',
        ],
        'output_error',
      )
      assert.equal(report.primaryOutputPublished, true)
      assert.equal(report.outputUntouched, false)
      assert.equal(report.output, output)
      assert.equal(report.blockedOutput, sidecar)
      assert.equal(report.retryCommand, undefined)
      assert.equal(report.error.retryCommand, undefined)
      assert.equal(s.body(output).textPreview, 'Published before sidecar failure')
      const live = s.run(['pptx', 'inspect', source, '--daemon-strict', '--json'])
      assert.equal(
        live.slides[0].shapes.find((shape) => shape.name === 'Body').textPreview,
        'Quarterly review',
      )
      assert.equal(existsSync(sidecar), false)
    } finally {
      // The state/log paths belong to this scenario, never the user's daemon.
      s.run(['daemon', 'stop', '--json'])
    }
  },
)

nativeTest('remediation preserves filesystem asset roots and the submitted patch parent', (t) => {
  if (process.platform === 'win32') return t.skip('POSIX filesystem contract')
  const s = scenario(t)
  const root = join(s.directory, 'real')
  mkdirSync(join(root, 'child'), { recursive: true })
  symlinkSync(join(root, 'child'), join(s.directory, 'link'))
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6GQAAAAASUVORK5CYII=',
    'base64',
  )
  writeFileSync(join(root, 'inside.png'), png)
  const patch = s.write('real/patch.json', {
    schemaVersion: 'pptx-patch/v1',
    ops: [
      { op: 'add-slide' },
      {
        op: 'add-image',
        slide: 0,
        name: 'Frozen asset',
        x: '1in',
        y: '1in',
        w: '1in',
        h: '1in',
        assetSource: { path: 'inside.png' },
      },
    ],
  })
  // A symlink to the patch does not move its caller-relative asset root.
  const submitted = join(s.directory, 'submitted')
  mkdirSync(submitted)
  symlinkSync(patch, join(submitted, 'patch.json'))
  writeFileSync(join(submitted, 'inside.png'), png)
  const aliasedRoot = `${s.directory}/link/..`
  for (const [index, options] of [
    ['--patch', patch, '--asset-root', aliasedRoot],
    ['--patch', `${aliasedRoot}/patch.json`],
    ['--patch', join(submitted, 'patch.json')],
  ].entries()) {
    const capsule = join(realpathSync.native(s.directory), `context-${index}`)
    const output = `${aliasedRoot}/frozen-${index}.pptx`
    s.run(
      [
        skillScript('pptx-nova-remediation'),
        'run',
        '--xdoc',
        binary,
        ...options,
        '--capsule',
        capsule,
        '--output',
        output,
      ],
      null,
      process.execPath,
    )
    assert.equal(existsSync(output), true)
    assert.equal(existsSync(join(s.directory, `frozen-${index}.pptx`)), false)
    assert.deepEqual(readFileSync(join(capsule, 'assets', 'inside.png')), png)
    const manifest = JSON.parse(readFileSync(join(capsule, 'context.json'), 'utf8'))
    assert.equal(manifest.sourceRoot.endsWith(index === 2 ? '/submitted' : '/real'), true)
    assert.equal(s.inspect(output).slides[0].shapes[0].name, 'Frozen asset')
  }
  symlinkSync(s.write('outside.png', png), join(root, 'escape.png'))
  const escapingPatch = JSON.parse(readFileSync(patch, 'utf8'))
  escapingPatch.ops[1].assetSource.path = 'escape.png'
  const output = join(root, 'blocked.pptx')
  s.run(
    [
      skillScript('pptx-nova-remediation'),
      'run',
      '--xdoc',
      binary,
      '--patch',
      s.write('escape.json', escapingPatch),
      '--asset-root',
      aliasedRoot,
      '--capsule',
      join(realpathSync.native(s.directory), 'context-blocked'),
      '--output',
      output,
    ],
    'context_unavailable',
    process.execPath,
  )
  assert.equal(existsSync(output), false)
})

nativeTest(
  'Create builds and renders manifest assets through POSIX aliased paths',
  (t) => {
    if (process.platform === 'win32') return t.skip('POSIX filesystem contract')
    const s = scenario(t, { useInstalledAuthorization: true })
    const root = join(s.directory, 'real')
    mkdirSync(join(root, 'child'), { recursive: true })
    symlinkSync(join(root, 'child'), join(s.directory, 'link'))
    const parent = `${s.directory}/link/..`
    s.write(
      'real/image.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#665D56"/><circle cx="800" cy="450" r="240" fill="#D9C7A4"/></svg>',
    )
    s.write('real/content.json', {
      meta: { deckkit: 'cartesian' },
      slides: [
        {
          type: 'cartesianImageStatsSlide',
          imageSlots: { 'image.editorial': 'picture' },
          data: {
            imageLabel: 'Filesystem contract',
            label: 'Runtime alignment',
            title: 'Asset paths',
            paragraphs: ['The image is loaded through a symlink and parent traversal.'],
            stats: [
              { value: '3', label: 'Root cases verified' },
              { value: '0', label: 'Escaping links' },
            ],
          },
        },
      ],
    })
    s.write('real/assets.json', {
      schemaVersion: 'pptx-nova-assets-manifest/v1',
      entries: [
        {
          id: 'picture',
          kind: 'image',
          path: 'image.svg',
          pptxUse: { slotId: 'image.editorial', ratio: '16:9', fitPolicy: 'contain' },
        },
      ],
    })
    const output = `${parent}/final.pptx`
    const runDir = `${parent}/run`
    s.write('real/lock.json', {
      schemaVersion: 'pptx-nova-deck-lock/v1',
      mode: 'express',
      objective: 'Verify native asset path propagation',
      output: { finalPptx: output, runDir },
      canvas: { format: 'ppt169', width: '13.333in', height: '7.5in' },
      deckkit: { id: 'cartesian' },
      slides: [
        {
          type: 'cartesianImageStatsSlide',
          title: 'Asset paths',
          purpose: 'Verify the image and statistics',
          rhythm: 'dense',
          imageSlots: { 'image.editorial': 'picture' },
        },
      ],
      assumptions: [],
    })
    const report = s.run(
      [
        skillScript('pptx-nova-create-run'),
        '--content',
        `${parent}/content.json`,
        '--lock',
        `${parent}/lock.json`,
        '--assets',
        `${parent}/assets.json`,
        '--output',
        output,
        '--run-dir',
        runDir,
        '--xdoc-bin',
        binary,
        '--json-full',
      ],
      null,
      process.execPath,
    )
    assert.equal(report.machineGatesPassed, true)
    assert.equal(report.deliveryReady, false, 'Actual visual review is still required')
    assert.equal(existsSync(output), false)
    assert.equal(existsSync(join(s.directory, 'run')), false)
    const candidate = join(root, 'run', 'candidate.pptx')
    const inspected = s.inspect(candidate)
    assert.equal(inspected.slides.length, 1)
    assert.equal(
      inspected.slides[0].shapes.filter((shape) => shape.shapeType === 'picture').length,
      1,
    )
    assert.equal(existsSync(join(root, 'run', 'visual-evidence', 'manifest.json')), true)
  },
  { visual: true },
)
