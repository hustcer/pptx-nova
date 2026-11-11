import test from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { storedZip } from '../helpers/pptx-package.mjs'
import {
  PLAYBACK_SCRIPT,
  parseArgs,
  parseObservation,
  runProbe,
} from '../../../pptx-nova/scripts/cli/office/morph-playback.mjs'

const resavePrerequisite = {
  skip: !existsSync('/usr/bin/unzip') && 'Requires the platform archive checker',
}

test('consecutive Morph waits for the source entry before sending next', () => {
  const wait = PLAYBACK_SCRIPT.indexOf('delay (source_entry_duration + 0.35)')
  assert.ok(PLAYBACK_SCRIPT.startsWith('on run argv\n'))
  assert.ok(PLAYBACK_SCRIPT.endsWith('\nend run'))
  assert.ok(
    wait >
      PLAYBACK_SCRIPT.indexOf(
        'transition duration of slide show transition of slide from_slide_number',
      ),
  )
  assert.ok(wait < PLAYBACK_SCRIPT.indexOf('go to next slide show_view'))
  assert.match(PLAYBACK_SCRIPT, /source_entry_duration > navigation_timeout_seconds/)
})

test('playback observation rejects malformed timing and slide identity', () => {
  const row = 'deck\tentry effect morph by char\t1.3\ttrue\t29\t30\t2.9'
  assert.equal(parseObservation(row).transitionDurationMs, 1300)
  for (const invalid of [
    row.replace('1.3', 'NaN'),
    row.replace('true', 'yes'),
    row.replace('\t29\t', '\t29.5\t'),
    'partial',
  ]) {
    assert.throws(() => parseObservation(invalid))
  }
})

test('playback reports failures without losing input or owned staging cleanup', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'morph-node-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const input = join(root, 'input.pptx'),
    output = join(root, 'report.json')
  const base = join(root, 'Library/Containers/com.microsoft.Powerpoint/Data/tmp')
  mkdirSync(base, { recursive: true })
  writeFileSync(input, 'retained source')
  const args = parseArgs([
    input,
    '--from-slide',
    '29',
    '--to-slide',
    '30',
    '--mode',
    'by-char',
    '--duration-ms',
    '1300',
    '--output',
    output,
  ])
  let main = 0,
    closed = 0
  const report = runProbe(args, {
    platform: 'darwin',
    homeDir: root,
    execute(script) {
      if (script === PLAYBACK_SCRIPT) {
        main++
        throw new Error('wait-destination: controlled timeout')
      }
      if (script.startsWith('on run argv')) closed++
      return 'com.microsoft.Powerpoint'
    },
  })
  assert.equal(main, 1)
  assert.equal(closed, 1)
  assert.equal(report.status, 'fail')
  assert.match(JSON.parse(readFileSync(output)).error.message, /controlled timeout/)
  assert.equal(readFileSync(input, 'utf8'), 'retained source')
  assert.deepEqual(readdirSync(base), [])
})

test('playback requires matched mode, animation state and authored duration', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'morph-node-checks-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const input = join(root, 'input.pptx')
  const base = join(root, 'Library/Containers/com.microsoft.Powerpoint/Data/tmp')
  mkdirSync(base, { recursive: true })
  writeFileSync(input, 'retained source')
  const args = parseArgs([
    input,
    '--from-slide',
    '29',
    '--to-slide',
    '30',
    '--mode',
    'by-char',
    '--duration-ms',
    '1300',
  ])
  for (const [row, status] of [
    ['deck\tentry effect morph by char\t1.3\ttrue\t29\t30\t2.9', 'pass'],
    ['deck\tentry effect morph by word\t1.3\ttrue\t29\t30\t2.9', 'fail'],
    ['deck\tentry effect morph by char\t1.0\ttrue\t29\t30\t2.9', 'fail'],
    ['deck\tentry effect morph by char\t1.3\tfalse\t29\t30\t2.9', 'fail'],
  ])
    assert.equal(
      runProbe(args, {
        platform: 'darwin',
        homeDir: root,
        execute: (script) => (script === PLAYBACK_SCRIPT ? row : ''),
      }).status,
      status,
    )
  assert.deepEqual(readdirSync(base), [])
  assert.throws(() => runProbe({ ...args, output: input }), /must not overwrite/)
  assert.equal(readFileSync(input, 'utf8'), 'retained source')
  assert.equal(existsSync(join(root, 'report.json')), false)
})

test('playback budgets and adjacent slide ranges fail before execution', () => {
  const base = [
    'deck.pptx',
    '--from-slide',
    '29',
    '--to-slide',
    '30',
    '--mode',
    'by-char',
    '--duration-ms',
    '1300',
  ]
  for (const value of ['0', '601', '1.5'])
    assert.throws(() => parseArgs([...base, '--timeout-seconds', value]))
  assert.throws(() => parseArgs([...base, '--to-slide', '31']), /adjacent/)
})

function evidenceScenario(t) {
  const root = mkdtempSync(join(tmpdir(), 'morph-output-safety-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const input = join(root, 'input.pptx')
  writeFileSync(input, 'retained source')
  mkdirSync(join(root, 'Library/Containers/com.microsoft.Powerpoint/Data/tmp'), { recursive: true })
  const args = (extra = []) =>
    parseArgs([
      input,
      '--from-slide',
      '1',
      '--to-slide',
      '2',
      '--mode',
      'by-object',
      '--duration-ms',
      '900',
      ...extra,
    ])
  return { root, input, args }
}

test('report paths preserve physical symlink/.. identity before protecting the input', (t) => {
  if (process.platform === 'win32') return t.skip('POSIX physical traversal contract')
  const { root, args } = evidenceScenario(t)
  mkdirSync(join(root, 'physical', 'child'), { recursive: true })
  const input = join(root, 'physical', 'input.pptx')
  writeFileSync(input, 'retained physical source')
  const link = join(root, 'link')
  symlinkSync(join(root, 'physical', 'child'), link)
  assert.throws(
    () =>
      runProbe({ ...args(['--output', `${link}/../input.pptx`]), input }, { platform: 'linux' }),
    /must not overwrite the input PPTX/,
  )
  assert.equal(readFileSync(input, 'utf8'), 'retained physical source')
})

for (const flag of ['--output', '--resave-output']) {
  test(`${flag} rejects input hard links even with overwrite`, (t) => {
    const { root, input, args } = evidenceScenario(t)
    const alias = join(root, 'input-alias')
    linkSync(input, alias)
    assert.throws(
      () => runProbe(args([flag, alias, '--overwrite']), { platform: 'linux' }),
      /must not overwrite the input PPTX/,
    )
    assert.equal(readFileSync(input, 'utf8'), 'retained source')
    assert.equal(readFileSync(alias, 'utf8'), 'retained source')
  })
}

test('report and resave outputs cannot be hard links to each other', (t) => {
  const { root, args } = evidenceScenario(t)
  const output = join(root, 'report.json'),
    resave = join(root, 'resaved.pptx')
  writeFileSync(output, 'existing evidence')
  linkSync(output, resave)
  assert.throws(
    () =>
      runProbe(args(['--output', output, '--resave-output', resave, '--overwrite']), {
        platform: 'linux',
      }),
    /outputs must differ/,
  )
  assert.equal(readFileSync(output, 'utf8'), 'existing evidence')
})

test('a report created during the probe is never overwritten without authorization', (t) => {
  const { root, input, args } = evidenceScenario(t)
  const output = join(root, 'report.json')
  assert.throws(
    () =>
      runProbe(args(['--output', output]), {
        platform: 'darwin',
        homeDir: root,
        execute(script) {
          if (script === PLAYBACK_SCRIPT) {
            writeFileSync(output, 'concurrent evidence', { flag: 'wx' })
            return 'deck\tentry effect morph by object\t0.9\ttrue\t1\t2\t1.5'
          }
          return ''
        },
      }),
    /already exists|EEXIST/,
  )
  assert.equal(readFileSync(output, 'utf8'), 'concurrent evidence')
  assert.equal(readFileSync(input, 'utf8'), 'retained source')
})

test(
  'a resave created during the probe is retained and produces a failed report',
  resavePrerequisite,
  (t) => {
    const { root, input, args } = evidenceScenario(t)
    const output = join(root, 'report.json'),
      resave = join(root, 'resaved.pptx')
    const report = runProbe(args(['--output', output, '--resave-output', resave]), {
      platform: 'darwin',
      homeDir: root,
      execute(script, argv) {
        if (script === PLAYBACK_SCRIPT) {
          writeFileSync(argv[4], storedZip([['proof.txt', '']]))
          writeFileSync(resave, 'concurrent resave', { flag: 'wx' })
          return 'deck\tentry effect morph by object\t0.9\ttrue\t1\t2\t1.5'
        }
        return ''
      },
    })
    assert.equal(report.status, 'fail')
    assert.match(report.error.message, /already exists|EEXIST/)
    assert.equal(JSON.parse(readFileSync(output)).status, 'fail')
    assert.equal(readFileSync(resave, 'utf8'), 'concurrent resave')
    assert.equal(readFileSync(input, 'utf8'), 'retained source')
  },
)

test('authorized report replacement does not truncate other hard links to the old report', (t) => {
  const { root, args } = evidenceScenario(t)
  const output = join(root, 'report.json'),
    oldEvidence = join(root, 'retained-report.json')
  writeFileSync(output, 'old report')
  linkSync(output, oldEvidence)
  assert.equal(
    runProbe(args(['--output', output, '--overwrite']), { platform: 'linux' }).status,
    'skipped',
  )
  assert.equal(JSON.parse(readFileSync(output)).status, 'skipped')
  assert.equal(readFileSync(oldEvidence, 'utf8'), 'old report')
})

for (const overwrite of [false, true]) {
  test(
    `resave and report publish complete evidence with overwrite=${overwrite}`,
    resavePrerequisite,
    (t) => {
      const { root, input, args } = evidenceScenario(t)
      const output = join(root, 'report.json'),
        resave = join(root, 'resaved.pptx')
      const backup = join(root, 'retained-resave.pptx'),
        bytes = storedZip([['proof.txt', '']])
      if (overwrite) {
        writeFileSync(resave, 'old resave')
        linkSync(resave, backup)
        writeFileSync(output, 'old report')
      }
      const report = runProbe(
        args([
          '--output',
          output,
          '--resave-output',
          resave,
          ...(overwrite ? ['--overwrite'] : []),
        ]),
        {
          platform: 'darwin',
          homeDir: root,
          execute(script, argv) {
            if (script === PLAYBACK_SCRIPT) {
              writeFileSync(argv[4], bytes)
              return 'deck\tentry effect morph by object\t0.9\ttrue\t1\t2\t1.5'
            }
            return ''
          },
        },
      )
      assert.equal(report.status, 'pass')
      assert.equal(JSON.parse(readFileSync(output)).status, 'pass')
      assert.deepEqual(readFileSync(resave), bytes)
      if (overwrite) assert.equal(readFileSync(backup, 'utf8'), 'old resave')
      assert.equal(readFileSync(input, 'utf8'), 'retained source')
      assert.ok(!readdirSync(root).some((name) => name.startsWith('.pptx-evidence-')))
    },
  )
}

test('physical paths are used consistently for input, report and resave IO', (t) => {
  if (process.platform === 'win32') return t.skip('POSIX physical traversal contract')
  if (resavePrerequisite.skip) return t.skip(resavePrerequisite.skip)
  const { root, args } = evidenceScenario(t)
  mkdirSync(join(root, 'physical', 'child'), { recursive: true })
  const link = join(root, 'link')
  symlinkSync(join(root, 'physical', 'child'), link)
  writeFileSync(join(root, 'physical', 'input.pptx'), 'physical source')
  const bytes = storedZip([['proof.txt', '']])
  const report = runProbe(
    {
      ...args(['--output', `${link}/../report.json`, '--resave-output', `${link}/../resaved.pptx`]),
      input: `${link}/../input.pptx`,
    },
    {
      platform: 'darwin',
      homeDir: root,
      execute(script, argv) {
        if (script === PLAYBACK_SCRIPT) {
          assert.equal(readFileSync(argv[0], 'utf8'), 'physical source')
          writeFileSync(argv[4], bytes)
          return 'deck\tentry effect morph by object\t0.9\ttrue\t1\t2\t1.5'
        }
        return ''
      },
    },
  )
  assert.equal(report.input.byteLength, Buffer.byteLength('physical source'))
  assert.equal(JSON.parse(readFileSync(join(root, 'physical', 'report.json'))).status, 'pass')
  assert.deepEqual(readFileSync(join(root, 'physical', 'resaved.pptx')), bytes)
  assert.equal(existsSync(join(root, 'report.json')), false)
})
