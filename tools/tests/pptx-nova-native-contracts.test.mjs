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
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createDeck } from '../../pptx-nova/assets/deckkits/cartesian.kit.mjs'

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
  const run = (args, expectedCode = null, executable = binary) => {
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
    const report = JSON.parse(result.stdout)
    if (expectedCode) {
      assert.notEqual(result.status, 0, result.stdout)
      assert.equal(report.error.code, expectedCode, result.stdout)
    } else {
      assert.equal(result.status, 0, result.stdout + result.stderr)
    }
    return report
  }
  const apply = (ops, input, { dryRun = false, error = null, assetRoot } = {}) => {
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
  return { directory, write, run, apply, body, create }
}

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
  'translation planning binds retained parts to source relationships even for preserved units',
  (t) => {
    const s = scenario(t)
    const source = s.create('Quarterly review', 2)
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
    assert.equal(JSON.parse(readFileSync(planFile, 'utf8')).status, 'pass')
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
    const source = s.create('Quarterly review', 2)
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
