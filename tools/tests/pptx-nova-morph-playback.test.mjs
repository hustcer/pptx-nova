import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const script = join(repo, 'pptx-nova/scripts/pptx-nova-morph-playback.nu')
const stagingRoot = join(homedir(), 'Library/Containers/com.microsoft.Powerpoint/Data/tmp')
const available =
  process.platform === 'darwin' &&
  existsSync(stagingRoot) &&
  spawnSync('nu', ['--version']).status === 0 &&
  spawnSync('unzip', ['-v']).status === 0

// Exercise the real Nu report/publication boundary with controlled application
// responses. This does not launch PowerPoint or claim native playback evidence.
for (const resave of [null, '', 'not a ZIP']) {
  test(
    `playback evidence ${resave === null ? 'needs no resave' : `rejects ${resave ? 'corrupt' : 'empty'} resaves`}`,
    { skip: !available },
    (t) => {
      const root = mkdtempSync(join(tmpdir(), 'morph-playback-test-'))
      t.after(() => rmSync(root, { recursive: true, force: true }))
      const input = join(root, 'input.pptx')
      const report = join(root, 'report.json')
      const output = join(root, 'resaved.pptx')
      writeFileSync(input, 'retained input bytes')
      writeFileSync(
        join(root, 'osascript'),
        `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === '-e') { console.log('com.microsoft.Powerpoint'); }
else {
  fs.readFileSync(0, 'utf8');
  if (args.length > 2) {
    if (args[5]) fs.writeFileSync(args[5], ${JSON.stringify(resave ?? '')});
    console.log('candidate.pptx\\tentry effect morph by object\\t0.85\\ttrue\\t1\\t2\\t2.0');
  }
}
`,
        { mode: 0o755 },
      )
      const args = [
        '--no-config-file',
        script,
        input,
        '--duration-ms',
        '850',
        '--output',
        report,
        '--json',
      ]
      if (resave !== null) args.push('--resave-output', output)
      const result = spawnSync('nu', args, {
        encoding: 'utf8',
        timeout: 15000,
        env: { ...process.env, PATH: root + delimiter + process.env.PATH },
      })
      assert.equal(result.error, undefined)
      assert.equal(readFileSync(input, 'utf8'), 'retained input bytes')
      if (resave === null) {
        assert.equal(result.status, 0, result.stderr)
        assert.equal(JSON.parse(readFileSync(report, 'utf8')).status, 'pass')
        assert.equal(JSON.parse(readFileSync(report, 'utf8')).resave, null)
      } else {
        assert.notEqual(result.status, 0)
        assert.match(result.stderr, /not a complete PPTX ZIP package/)
        assert.equal(existsSync(report), false)
        assert.equal(existsSync(output), false)
      }
    },
  )
}
