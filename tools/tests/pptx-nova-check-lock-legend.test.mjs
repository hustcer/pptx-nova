import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const checker = fileURLToPath(
  new URL('../../pptx-nova/scripts/pptx-nova-check-lock.mjs', import.meta.url),
)
const directory = mkdtempSync(join(tmpdir(), 'nova-legend-contract-'))
const hashFile = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const lock = join(directory, 'deck-lock.json')
writeFileSync(
  lock,
  JSON.stringify({
    schemaVersion: 'pptx-nova-deck-lock/v1',
    mode: 'studio',
    canvas: { format: 'ppt169' },
    deckkit: { id: 'cartesian' },
    typography: { body: 'Arial, sans-serif' },
    colors: { text: '111111' },
    deckProfile: { primary: 'general-business' },
    slides: [
      {
        slideType: 'cartesianStatementSlide',
        title: 'Revenue increased',
        claimTitle: 'Revenue increased',
        proofObject: { kind: 'chart' },
        rhythm: 'anchor',
        layoutIntent: 'chart',
      },
    ],
  }),
)

function check(legend) {
  const op = {
    op: 'add-chart',
    slide: 0,
    kind: 'column',
    x: '1in',
    y: '1in',
    w: '6in',
    h: '4in',
    data: { categories: ['A', 'B'], series: [{ name: 'Revenue', values: [10, 20] }] },
    ...(legend === undefined ? {} : { legend }),
  }
  const patch = join(directory, 'patch.json')
  writeFileSync(
    patch,
    JSON.stringify({
      schemaVersion: 'pptx-patch/v1',
      ops: [{ op: 'add-slide', layout: 'blank' }, op],
    }),
  )
  const result = spawnSync(
    process.execPath,
    [checker, '--lock', lock, '--patch', patch, '--json'],
    {
      encoding: 'utf8',
      timeout: 10000,
    },
  )
  assert.equal(result.error, undefined)
  assert.notEqual(result.status, null)
  return {
    status: result.status,
    report: JSON.parse(result.stdout),
    patch,
    patchSha256: hashFile(patch),
  }
}

test(
  'legend checks agree with the executable schema and native dry-run',
  {
    skip: !process.env.XDOC_TEST_BIN && 'Set XDOC_TEST_BIN to run executable contract tests',
  },
  () => {
    const binary = process.env.XDOC_TEST_BIN
    const config = join(directory, 'config')
    mkdirSync(config)
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('XDOC_')),
    )
    env.XDOC_CONFIG_PATH = config
    const run = (args) => {
      const result = spawnSync(binary, args, { env, encoding: 'utf8', timeout: 30000 })
      assert.equal(result.error, undefined)
      assert.notEqual(result.status, null)
      return { status: result.status, report: JSON.parse(result.stdout) }
    }
    const schema = run(['schema', '--mode', 'ops', '--ops', 'add-chart', '--fields', 'legend'])
    assert.equal(schema.status, 0)
    const positions = schema.report.operations[0].jsonSchema.$defs.legendPosition.enum
    assert.deepEqual(positions, ['right', 'left', 'top', 'bottom', 'top-right'])
    const values = [
      undefined,
      ...positions,
      'corner',
      'none',
      'tr',
      '',
      null,
      false,
      0,
      ['right'],
      { position: 'right' },
    ]
    const observations = values.map((legend, index) => {
      const checked = check(legend)
      const output = join(directory, `native-${index}.pptx`)
      const native = run([
        'pptx',
        'apply',
        '--patch',
        checked.patch,
        '--output',
        output,
        '--dry-run',
        '--json',
      ])
      assert.equal(existsSync(output), false)
      assert.equal(existsSync(output + '.xdoc.json'), false)
      assert.equal(hashFile(checked.patch), checked.patchSha256)
      return {
        legend: legend ?? (legend === undefined ? '(omitted)' : null),
        checker: checked,
        native,
      }
    })
    writeFileSync(
      join(directory, 'native-observations.json'),
      JSON.stringify(observations, null, 2),
    )
    for (const row of observations) {
      assert.equal(row.checker.status === 0, row.native.status === 0, JSON.stringify(row))
      if (row.native.status !== 0) {
        assert.equal(row.native.report.error.code, 'invalid_argument')
        assert.equal(row.native.report.error.opIndex, 1)
        assert.match(row.native.report.error.message, /legend/)
      }
    }
  },
)

for (const legend of [undefined, 'right', 'left', 'top', 'bottom', 'top-right']) {
  test(`check-lock accepts canonical chart legend ${legend ?? '(omitted)'}`, () => {
    const { status, report } = check(legend)
    assert.equal(status, 0, JSON.stringify(report))
    assert.deepEqual(report.errors, [])
  })
}

for (const legend of [
  'corner',
  'none',
  'tr',
  '',
  null,
  false,
  0,
  ['right'],
  { position: 'right' },
]) {
  test(`check-lock rejects noncanonical chart legend ${JSON.stringify(legend)}`, () => {
    const { status, report } = check(legend)
    assert.notEqual(status, 0)
    const error = report.errors.find((item) => item.code === 'chart-legend-invalid')
    assert.ok(error, JSON.stringify(report))
    assert.match(error.message, /right, left, top, bottom, top-right/)
  })
}
