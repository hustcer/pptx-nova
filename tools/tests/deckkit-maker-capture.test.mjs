import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const script = resolve('deckkit-maker/scripts/capture-html-slides.mjs')

// Emulate the browser boundary, but execute the exact injected scripts. Resource promises
// are deliberately delayed so the test exercises readiness rather than a canned response.
const browser = `const fs = require('node:fs');
const vm = require('node:vm');
const args = process.argv.slice(2);
const mode = process.env.CAPTURE_TEST_MODE;
fs.appendFileSync(process.env.CAPTURE_TEST_LOG, JSON.stringify(args) + '\\n');
if (args.includes('eval')) {
  let fontLoaded = false;
  const fonts = new Set(mode === 'font-error' ? [{ status: 'error', family: 'Missing' }] : []);
  fonts.ready = mode === 'font-pending' ? new Promise(() => {}) : new Promise(resolve => setTimeout(() => { fontLoaded = true; resolve(); }, 40));
  Object.defineProperty(fonts, 'status', { get: () => fontLoaded ? 'loaded' : 'loading' });
  const slides = [0, 1].map(() => ({
    style: { setProperty() {} }, classList: { add() {}, remove() {} },
    removeAttribute() {}, setAttribute() {}, scrollIntoView() {},
    getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0,
      right: mode === 'clipped' ? 1500 : 1440, bottom: 810, width: 1440, height: 810 }),
    querySelectorAll: () => [{ decode: () => new Promise((resolve, reject) => setTimeout(() =>
      mode === 'image-error' ? reject(new Error('Image decode failed')) : resolve(), 40)) }],
  }));
  const context = {
    document: { fonts, title: 'Capture fixture', head: { append() {} },
      getElementById: () => null, createElement: () => ({}), querySelectorAll: () => slides },
    window: { devicePixelRatio: 1, dispatchEvent() {} },
    location: { href: 'file:///fixture.html' }, navigator: { userAgent: 'Fixture Browser' },
    getComputedStyle: () => ({ display: mode === 'hidden' ? 'none' : 'grid', visibility: 'visible', opacity: '1' }),
    innerWidth: 1440, innerHeight: 810, Event: class {}, setTimeout, clearTimeout,
    requestAnimationFrame: callback => setTimeout(callback, 1),
  };
  Promise.resolve(vm.runInNewContext(fs.readFileSync(0, 'utf8'), context))
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
} else if (args.includes('screenshot')) {
  fs.writeFileSync(args.at(-1), mode === 'empty-png' ? '' : 'fixture-png-bytes');
}
`

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'deckkit-capture-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const browserScript = join(root, 'agent-browser.cjs')
  writeFileSync(browserScript, browser)
  // Launch the fixture through Node on every platform: Windows cannot execute
  // a POSIX shebang shim, and shell wrappers would change argument/stdin handling.
  const preload = join(root, 'browser-preload.cjs')
  writeFileSync(
    preload,
    `
const childProcess = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
const originalSpawnSync = childProcess.spawnSync;
childProcess.spawnSync = (command, args, options) => command === 'agent-browser'
  ? originalSpawnSync(process.execPath, [${JSON.stringify(browserScript)}, ...args], options)
  : originalSpawnSync(command, args, options);
syncBuiltinESMExports();
`,
  )
  const source = join(root, 'template.html')
  writeFileSync(source, '<html>capture fixture</html>')
  const out = join(root, 'capture')
  const log = join(root, 'browser-calls.jsonl')
  const run = (mode = '', extra = [], output = out) =>
    spawnSync(
      process.execPath,
      [
        '--require',
        preload,
        script,
        '--url',
        source,
        '--out',
        output,
        '--no-contact-sheet',
        '--json',
        ...extra,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CAPTURE_TEST_MODE: mode,
          CAPTURE_TEST_LOG: log,
        },
      },
    )
  return { root, source, out, log, run }
}

test('capture waits for resources, records hashes and owns a unique session', (t) => {
  const f = fixture(t)
  const result = f.run()
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.slideCount, 2)
  assert.equal(report.browser.userAgent, 'Fixture Browser')
  assert.equal(
    report.source.sha256,
    createHash('sha256').update(readFileSync(f.source)).digest('hex'),
  )
  for (const shot of report.screenshots) {
    assert.equal(shot.readiness.fonts, 'loaded')
    assert.equal(shot.readiness.decodedImages, 1)
    assert.equal(shot.sha256, createHash('sha256').update(readFileSync(shot.path)).digest('hex'))
  }
  const calls = readFileSync(f.log, 'utf8').trim().split('\n').map(JSON.parse)
  assert.ok(calls[0].includes('--allow-file-access'))
  assert.equal(
    calls.some((call) => call.includes('wait')),
    false,
  )
  assert.equal(calls.at(-1).at(-1), 'close')
  assert.ok(calls.every((call) => call[1] === report.session))
  const second = JSON.parse(f.run('', [], join(f.root, 'second')).stdout)
  assert.notEqual(second.session, report.session)
})

for (const mode of ['font-error', 'image-error', 'clipped', 'hidden']) {
  test(`capture fails without success evidence for ${mode}`, (t) => {
    const f = fixture(t)
    const result = f.run(mode)
    assert.equal(result.status, 1)
    assert.equal(existsSync(join(f.out, 'capture-manifest.json')), false)
    assert.equal(existsSync(join(f.out, 'slide-01.png')), false)
    assert.match(readFileSync(f.log, 'utf8').trim().split('\n').at(-1), /close/)
  })
}

test('capture rejects occupied output before touching a browser or old evidence', (t) => {
  const f = fixture(t)
  mkdirSync(f.out)
  const sentinel = join(f.out, 'capture-manifest.json')
  writeFileSync(sentinel, 'previous evidence')
  const result = f.run()
  assert.equal(result.status, 1)
  assert.match(result.stderr, /new or empty directory/)
  assert.equal(readFileSync(sentinel, 'utf8'), 'previous evidence')
  assert.equal(existsSync(f.log), false)
})

test('capture bounds resource waits and rejects empty screenshot evidence', (t) => {
  const f = fixture(t)
  const timed = f.run('font-pending', ['--timeout-ms', '2000'])
  assert.equal(timed.status, 1)
  assert.match(timed.stderr, /readiness timed out/)
  assert.equal(existsSync(join(f.out, 'capture-manifest.json')), false)
  const emptyOut = join(f.root, 'empty-png')
  const empty = f.run('empty-png', [], emptyOut)
  assert.equal(empty.status, 1)
  assert.match(empty.stderr, /Empty capture artifact/)
  assert.equal(existsSync(join(emptyOut, 'capture-manifest.json')), false)
})

test('capture rejects invalid dimensions and timeouts without opening a browser', (t) => {
  const f = fixture(t)
  for (const args of [
    ['--viewport', '0x810'],
    ['--timeout-ms', '0'],
    ['--contact-cols', '2junk'],
  ]) {
    assert.equal(f.run('', args).status, 1)
  }
  assert.equal(existsSync(f.log), false)
})
