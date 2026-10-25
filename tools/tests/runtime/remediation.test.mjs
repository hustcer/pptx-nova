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
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'
import {
  compactRemediationJson,
  parseRemediationJson,
  prepareRemediation,
  requestJcsSha256,
  validateRemediation,
} from '../../../pptx-nova/scripts/lib/runtime/remediation.mjs'

const runtime = fileURLToPath(
  new URL('../../../pptx-nova/scripts/cli/runtime/remediation.mjs', import.meta.url),
)
// Real-runtime tests are opt-in; the baseline suite needs only Node and Nushell.
// An explicitly supplied but invalid runtime must fail, rather than silently skip.
const binary = process.env.XDOC_TEST_BIN ? resolve(process.env.XDOC_TEST_BIN) : null
const integrationTest = (name, fn) =>
  test(name, { skip: binary ? false : 'Set XDOC_TEST_BIN to run real xdoc integration tests' }, fn)
const hash = (value) => createHash('sha256').update(value).digest('hex')

// Independent ZIP readback for the small, controlled decks created below.
// This is a test oracle, not a general archive reader in the published runtime.
function mediaBytes(path) {
  const bytes = readFileSync(path)
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  assert.ok(end >= 0)
  const count = bytes.readUInt16LE(end + 10)
  let offset = bytes.readUInt32LE(end + 16)
  const media = []
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50)
    const method = bytes.readUInt16LE(offset + 10)
    const size = bytes.readUInt32LE(offset + 20)
    const nameLength = bytes.readUInt16LE(offset + 28)
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    if (name.startsWith('ppt/media/')) {
      const local = bytes.readUInt32LE(offset + 42)
      assert.equal(bytes.readUInt32LE(local), 0x04034b50)
      const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28)
      const compressed = bytes.subarray(start, start + size)
      assert.ok(method === 0 || method === 8)
      media.push(method === 0 ? compressed : inflateRawSync(compressed))
    }
    offset += 46 + nameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32)
  }
  return media
}
const request = { schemaVersion: 'pptx-patch/v1', ops: [{ op: 'add-slide' }] }
const proposal = () => ({
  kind: 'replace-request',
  target: {
    kind: 'original-input',
    requestCanonicalization: 'jcs-rfc8785',
    requestSha256: requestJcsSha256(request),
    inputSha256: null,
  },
  request,
  reason: 'Retry the corrected request',
  confidence: 1,
  autoRetry: true,
})

test('remediation shape and local identity are checked before execution', () => {
  assert.equal(
    requestJcsSha256({ b: 2, a: 1 }),
    '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777',
  )
  assert.throws(() => parseRemediationJson('{"a":1,"\\u0061":2}'), { code: 'duplicate_key' })
  assert.equal(
    compactRemediationJson(' {\n "number":9007199254740993, "text":"a b\\n\\\""\n}\n'),
    '{"number":9007199254740993,"text":"a b\\n\\\""}',
  )
  for (const unsafe of ['9007199254740993', '1e400', '-9007199254740993']) {
    assert.throws(() => requestJcsSha256(parseRemediationJson(`{"n":${unsafe}}`)), {
      code: 'identity_unavailable',
    })
  }
  for (const value of [
    { ...proposal(), patch: request },
    { ...proposal(), confidence: Infinity },
    { ...proposal(), target: { ...proposal().target, inputSha256: undefined } },
    { ...proposal(), request: { ...request, vars: { invalid: NaN } } },
    {
      ...proposal(),
      target: { ...proposal().target, requestSha256: { toString: () => 'a'.repeat(64) } },
    },
  ])
    assert.throws(() => validateRemediation(value))
  const context = {
    requestText: JSON.stringify(request),
    inputBytes: null,
    assets: [],
    assetRoot: '/snapshot',
  }
  assert.deepEqual(prepareRemediation(proposal(), context).patch, request)
  assert.throws(() => prepareRemediation(proposal(), { ...context, inputBytes: undefined }), {
    code: 'context_unavailable',
  })
  assert.throws(
    () =>
      prepareRemediation(proposal(), {
        ...context,
        requestText: JSON.stringify({ ...request, vars: { changed: true } }),
      }),
    { code: 'request_mismatch' },
  )
})

function fixture(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'nova-remediation-')))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const config = join(directory, 'config')
  mkdirSync(config)
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('XDOC_')),
  )
  Object.assign(env, { XDOC_CONFIG_PATH: config, CI: 'false' })
  let sequence = 0
  const run = (args, executable = process.execPath) => {
    const result = spawnSync(executable, args, {
      cwd: directory,
      env,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    })
    assert.equal(result.error, undefined)
    assert.equal(result.signal, null)
    assert.ok(result.stdout.trim(), result.stderr)
    return { ...result, report: JSON.parse(result.stdout) }
  }
  const write = (name, value) => {
    const path = join(directory, name)
    writeFileSync(
      path,
      typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value),
    )
    return path
  }
  const first = (patch, { transport = 'cli', intent, input } = {}) => {
    const capsule = join(directory, `context-${sequence++}`)
    const output = join(directory, `first-${sequence++}.pptx`)
    const patchPath = write(`request-${sequence++}.json`, patch)
    return {
      ...run([
        runtime,
        'run',
        '--xdoc',
        binary,
        '--patch',
        patchPath,
        '--capsule',
        capsule,
        '--output',
        output,
        '--transport',
        transport,
        ...(input ? ['--input', input] : []),
        ...(intent ? ['--intent', write(`intent-${sequence++}.json`, intent)] : []),
      ]),
      capsule,
      output,
    }
  }
  const repair = (firstRun, report, pointer, extra = []) => {
    const output = join(directory, `repair-${sequence++}.pptx`)
    return {
      ...run([
        runtime,
        'apply',
        '--capsule',
        firstRun.capsule,
        '--report',
        write(`report-${sequence++}.json`, report),
        '--pointer',
        pointer,
        '--output',
        output,
        '--reviewed',
        ...extra,
      ]),
      output,
    }
  }
  return { directory, run, write, first, repair }
}

for (const transport of ['cli', 'json-rpc'])
  integrationTest(
    `capsule ${transport}: frozen relative assets and complete replacement execute once`,
    (t) => {
      const f = fixture(t)
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6V6sAAAAASUVORK5CYII=',
        'base64',
      )
      const imagePath = f.write('pixel.png', png)
      const original = {
        schemaVersion: 'pptx-patch/v1',
        vars: { label: 'kept' },
        preconditions: { review: 'preserved' },
        ops: [
          { op: 'add-slide' },
          {
            op: 'add-image',
            slide: 0,
            x: '1in',
            y: '1in',
            w: '1in',
            h: '1in',
            assetSource: { path: 'pixel.png' },
            name: 'frozen-picture',
          },
          {
            op: 'if',
            condition: { kind: 'slide-count', op: 'eq', value: 1 },
            then: [{ op: 'set-text-frame', slide: 0, shape: { name: 'missing' }, text: 'fails' }],
          },
        ],
      }
      const failed = f.first(JSON.stringify(original, null, 2) + '\n', { transport })
      assert.notEqual(failed.status, 0)
      assert.equal(existsSync(failed.output), false)
      assert.ok(Array.isArray(failed.report.error?.suggestions), failed.stdout)
      const index = failed.report.error.suggestions.findLastIndex((item) => item.remediation)
      assert.ok(index >= 0, JSON.stringify(failed.report))
      const remediation = failed.report.error.suggestions[index].remediation
      assert.equal(remediation.kind, 'replace-request')
      assert.equal(remediation.target.requestSha256, requestJcsSha256(original))
      assert.deepEqual(remediation.request.vars, original.vars)
      assert.deepEqual(remediation.request.preconditions, original.preconditions)
      assert.equal(remediation.request.ops[2]?.op, 'if', JSON.stringify(failed.report))
      assert.deepEqual(remediation.request.ops[2].then, [])
      assert.equal(remediation.autoRetry, false)
      const pointer = `/error/suggestions/${index}`
      const mismatch = structuredClone(failed.report)
      mismatch.error.suggestions[index].remediation.target.requestSha256 = '0'.repeat(64)
      const rejected = f.repair(failed, mismatch, pointer)
      assert.notEqual(rejected.status, 0)
      assert.equal(rejected.report.error.code, 'request_mismatch')
      assert.equal(existsSync(rejected.output), false)
      writeFileSync(imagePath, 'changed after the first submission')
      const repaired = f.repair(failed, failed.report, pointer)
      assert.equal(repaired.status, 0, repaired.stdout)
      const inspected = f.run(['pptx', 'inspect', repaired.output, '--json'], binary).report
      assert.equal(inspected.slides.length, 1)
      assert.equal(
        inspected.slides[0].shapes.filter((shape) => shape.name === 'frozen-picture').length,
        1,
      )
      assert.deepEqual(mediaBytes(repaired.output).map(hash), [hash(png)])
      const duplicate = f.repair(failed, failed.report, pointer)
      assert.notEqual(duplicate.status, 0)
      assert.equal(duplicate.report.error.code, 'already_applied')
      assert.equal(existsSync(duplicate.output), false)
      const reordered = structuredClone(failed.report)
      reordered.error.suggestions[index].remediation = Object.fromEntries(
        Object.entries(remediation).reverse(),
      )
      const same = f.repair(failed, reordered, pointer)
      assert.equal(same.report.error.code, 'already_applied')
      assert.equal(existsSync(same.output), false)
    },
  )

integrationTest(
  'missing context, altered snapshots, templates and unreviewed changes cannot write output',
  (t) => {
    const f = fixture(t)
    const failed = f.first({
      ...request,
      ops: [...request.ops, { op: 'set-shape', slide: 0, shape: { name: 'missing' }, name: 'new' }],
    })
    assert.ok(Array.isArray(failed.report.error?.suggestions), failed.stdout)
    const index = failed.report.error.suggestions.findLastIndex((item) => item.remediation)
    assert.ok(index >= 0)
    const pointer = `/error/suggestions/${index}`
    const missing = f.repair({ capsule: join(f.directory, 'absent') }, failed.report, pointer)
    assert.notEqual(missing.status, 0)
    assert.equal(existsSync(missing.output), false)
    const unreviewedOutput = join(f.directory, 'unreviewed.pptx')
    const unreviewed = f.run([
      runtime,
      'apply',
      '--capsule',
      failed.capsule,
      '--report',
      f.write('unreviewed-report.json', failed.report),
      '--pointer',
      pointer,
      '--output',
      unreviewedOutput,
    ])
    assert.equal(unreviewed.report.error.code, 'review_required')
    assert.equal(existsSync(unreviewedOutput), false)
    const manual = f.repair(
      failed,
      {
        suggestions: [
          {
            patchTemplate: request,
            autoApplicable: false,
            remediationUnavailable: { reason: 'context-unavailable' },
          },
        ],
      },
      '/suggestions/0',
    )
    assert.equal(manual.report.error.code, 'remediation_unavailable')
    assert.equal(existsSync(manual.output), false)
    writeFileSync(join(failed.capsule, 'request.json'), JSON.stringify(request))
    const changed = f.repair(failed, failed.report, pointer)
    assert.equal(changed.report.error.code, 'context_changed')
    assert.equal(existsSync(changed.output), false)
  },
)

integrationTest(
  'original input digest and explicit intent survive a document repair attempt',
  (t) => {
    const f = fixture(t)
    const intent = {
      schemaVersion: 'xdoc-cli-feature-intent/v1',
      product: 'xdoc-cli',
      feature: 'create',
      outputType: 'pptx',
      requireEntitlement: false,
      requireUnwatermarked: false,
      allowFallback: true,
    }
    const created = f.first(
      {
        ...request,
        ops: [
          ...request.ops,
          {
            op: 'add-text-box',
            slide: 0,
            x: '-1in',
            y: '1in',
            w: '2in',
            h: '1in',
            name: 'outside',
            text: 'move',
          },
        ],
      },
      { intent },
    )
    assert.equal(created.status, 0, created.stdout)
    const original = readFileSync(created.output)
    const vision = f.run(['pptx', 'vision-check', created.output, '--json'], binary).report
    const index = vision.issues.findIndex((item) => item.kind === 'shape-out-of-bounds')
    const rejected = f.repair(created, vision, `/issues/${index}`, ['--document', created.output])
    assert.notEqual(
      rejected.status,
      0,
      'The create intent must not become a modify intent during remediation',
    )
    assert.equal(existsSync(rejected.output), false)
    assert.deepEqual(readFileSync(created.output), original)
    const failed = f.first(
      { ...request, ops: [{ op: 'set-shape', slide: 0, shape: { name: 'missing' }, name: 'new' }] },
      { input: created.output },
    )
    const suggestion = failed.report.error.suggestions.findIndex((item) => item.remediation)
    assert.ok(suggestion >= 0)
    assert.equal(
      failed.report.error.suggestions[suggestion].remediation.target.inputSha256,
      hash(original),
    )
    const wrong = structuredClone(failed.report)
    wrong.error.suggestions[suggestion].remediation.target.inputSha256 = null
    const mismatch = f.repair(failed, wrong, `/error/suggestions/${suggestion}`)
    assert.equal(mismatch.report.error.code, 'input_mismatch')
    assert.equal(existsSync(mismatch.output), false)
  },
)

integrationTest('document repair rejects stale target and uses only its repair operations', (t) => {
  const f = fixture(t)
  const created = f.first({
    schemaVersion: 'pptx-patch/v1',
    ops: [
      { op: 'add-slide' },
      {
        op: 'add-text-box',
        slide: 0,
        x: '-1in',
        y: '1in',
        w: '2in',
        h: '1in',
        name: 'outside',
        text: 'move',
      },
    ],
  })
  assert.equal(created.status, 0, created.stdout)
  const bytes = readFileSync(created.output)
  const vision = f.run(['pptx', 'vision-check', created.output, '--json'], binary).report
  const index = vision.issues.findIndex((item) => item.kind === 'shape-out-of-bounds')
  assert.ok(index >= 0)
  assert.equal(vision.issues[index].remediation.target.inputSha256, hash(bytes))
  const stalePath = f.write('stale.pptx', Buffer.concat([bytes, Buffer.from('stale')]))
  const stale = f.repair(created, vision, `/issues/${index}`, ['--document', stalePath])
  assert.notEqual(stale.status, 0)
  assert.equal(stale.report.error.code, 'document_mismatch')
  assert.equal(existsSync(stale.output), false)
  const repaired = f.repair(created, vision, `/issues/${index}`, ['--document', created.output])
  assert.equal(repaired.status, 0, repaired.stdout)
  assert.deepEqual(readFileSync(created.output), bytes)
  const inspected = f.run(['pptx', 'inspect', repaired.output, '--json'], binary).report
  assert.equal(inspected.slides.length, 1)
  const checked = f.run(['pptx', 'vision-check', repaired.output, '--json'], binary).report
  assert.equal(
    checked.issues.filter(
      (item) => item.kind === 'shape-out-of-bounds' && item.shapeName === 'outside',
    ).length,
    0,
  )
})
