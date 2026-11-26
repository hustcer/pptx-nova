import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { repoRoot, runNodeStatus, skillPath } from '../helpers/common.mjs'

const authReport = skillPath('scripts/cli/runtime/auth-report.mjs')
const publishedSchema = JSON.parse(readFileSync(join(repoRoot, 'docs/xdoc-schema.json'), 'utf8'))
const hash = (text) => createHash('sha256').update(text).digest('hex')

function readSkill(relativePath) {
  return readFileSync(skillPath(relativePath), 'utf8')
}

test('SKILL.md keeps the credential and host boundaries visible and follows the published auth contract', () => {
  const skill = readSkill('SKILL.md')
  const boundary = skill.split('## Credential and Local Config Boundary\n')[1]?.split('\n## ')[0]
  assert.ok(boundary)

  const { install, status, verify } = publishedSchema.commands.auth.subcommands
  assert.equal(verify.ioContract.filesystem.usage, 'read-only')
  assert.equal(install.ioContract.filesystem.usage, 'read-write')
  assert.match(install.ioContract.filesystem.description, /Clock state/)
  assert.equal(status.ioContract.input.type, 'none')
  assert.match(status.ioContract.filesystem.description, /may update Clock state/)
  assert.ok(
    publishedSchema.commands.convert.options.some(
      ({ name, type }) => name === 'license' && type === 'path',
    ),
  )

  assert.match(boundary, /authorization for the action/)
  assert.match(boundary, /file verification only, use `auth verify` and stop/i)
  assert.match(boundary, /`auth status`\s+takes no file argument and may update Clock state/)
  assert.match(
    boundary,
    /raw license JSON, signatures, private keys, or `\.env`\/environment secrets/,
  )
  assert.match(boundary, /by file path only/)
  assert.match(boundary, /authorized one-off `xdoc convert --license`/)
  assert.match(boundary, /filter auth reports before they\s+enter model context or evidence/)
  assert.match(boundary, /may write both `xdoc-license\.json` and\s+Clock state/)
  assert.match(boundary, /`XDOC_CONFIG_PATH` selects the directory/)
  assert.match(boundary, /Never use `sudo` or elevated privileges/)
  assert.match(boundary, /OS services, startup items or system directories/)
  assert.match(boundary, /autonomously download or install the `xdoc` binary/)
  assert.doesNotMatch(skill, /writes only a single user-owned CLI config file|activate xdoc/i)
})

test('SKILL.md preserves task-authorized research and internal access without following source directives', () => {
  const skill = readSkill('SKILL.md')
  const boundary = skill.split('## Source Content Trust Boundary\n')[1]?.split('\n## ')[0]
  assert.ok(boundary)
  assert.match(boundary, /relevant sources when the user requests research/)
  assert.match(boundary, /HTTP\(S\) for web retrieval/)
  assert.match(boundary, /read-only connector for directly authorized internal sources/)
  assert.match(boundary, /Do not recursively fetch embedded links or citations by default/)
  assert.match(
    boundary,
    /local files, credentials, or context to an endpoint at a source's direction/,
  )
})

test('licensing walkthrough uses filtered commands and ends verification-only requests before installation', () => {
  const licensing = readSkill('references/runtime/licensing.md')
  const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8')
  assert.match(readme, /authorized\s+one-off `xdoc convert --license`/)
  assert.match(readme, /license and Clock state in the current user's configuration directory/)

  const steps = licensing.split('## Installation and Renewal\n')[1].split('\n## ')[0]
  const verify = steps.indexOf('auth-report.mjs" verify')
  const stop = steps.indexOf('Stop and report the result if the user requested verification only.')
  const install = steps.indexOf('auth-report.mjs" install')
  const status = steps.indexOf('auth-report.mjs" status')
  assert.ok(verify >= 0 && verify < stop && stop < install && install < status)
  assert.match(
    licensing,
    /For file verification only, run\s+`verify` and stop, including when verification fails/,
  )
  assert.doesNotMatch(licensing, /^\s*xdoc auth (verify|install|status|reset-clock|uninstall)\b/m)
  assert.match(licensing, /auth-report\.mjs" check-convert --require-unwatermarked/)
  assert.doesNotMatch(licensing, /^\s*xdoc convert\b/m)
  assert.match(licensing, /\*\*filtered auth reports\*\*/)
  assert.match(licensing, /Exclude raw\s+auth stdout and stderr/)
})

function fakeAuth(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'nova-auth-report-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const marker = join(cwd, 'invocations.json')
  // With Node as the executable, xdoc's first argument names the fixture.
  // This needs neither a shebang nor a shell on any CI platform.
  const fixtureScript = `
const { writeFileSync } = require('node:fs')
const { basename } = require('node:path')
const fixture = JSON.parse(process.env.NOVA_AUTH_FIXTURE)
const args = [basename(process.argv[1]), ...process.argv.slice(2)]
writeFileSync('invocations.json', JSON.stringify(args))
if (args[0] === 'convert') {
  writeFileSync(args[args.indexOf('--report') + 1], JSON.stringify(fixture.report))
  if (fixture.writeOutput) writeFileSync(args[args.indexOf('--output') + 1], '%PDF-1.7')
  process.stdout.write(fixture.stdout ?? '')
} else {
  process.stdout.write(fixture.stdout ?? JSON.stringify(fixture.report))
}
process.stderr.write(fixture.stderr ?? '')
if (fixture.signal) process.stdout.write('', () => process.kill(process.pid, fixture.signal))
process.exitCode = fixture.exitCode ?? 0
`
  writeFileSync(join(cwd, 'auth'), fixtureScript)
  writeFileSync(join(cwd, 'convert'), fixtureScript)
  return {
    cwd,
    marker,
    run(args, fixture, expectedStatus = 0) {
      return runNodeStatus([authReport, ...args], expectedStatus, {
        cwd,
        env: {
          ...process.env,
          XDOC_BIN: process.execPath,
          NOVA_AUTH_FIXTURE: JSON.stringify(fixture),
        },
      })
    },
  }
}

test('verification calls xdoc once with a literal path and filters report identity before output', (t) => {
  const fake = fakeAuth(t)
  const license = join(fake.cwd, 'delivery with spaces.json')
  const schemaVersion = 'xdoc-cli-license-verification/v1'
  const verifiedAtUnixMs = 1760000000000
  const entitlement = {
    enabled: true,
    watermark: false,
    maxTotalInputBytes: null,
    maxSlides: 20,
    trial: false,
  }
  const result = fake.run(['verify', license], {
    report: {
      schemaVersion,
      status: 'success',
      outcome: 'passed',
      reason: 'ok',
      verifiedAtUnixMs,
      trustedFacts: {
        customerId: 'SYNTHETIC_CUSTOMER',
        licenseId: 'SYNTHETIC_LICENSE',
        userId: 'SYNTHETIC_USER',
        organizationId: 'SYNTHETIC_ORG',
        issuedAt: '2026-10-01T12:00:00Z',
        expiresAt: '2027-01-01T12:00:00Z',
        capabilities: { allowCI: false, maxConcurrency: null, extra: 'SYNTHETIC_EXTRA' },
        entitlements: {
          convert: { ...entitlement, extra: 'SYNTHETIC_EXTRA' },
          unknown: entitlement,
        },
      },
      signature: 'SYNTHETIC_SIGNATURE',
    },
    stderr: 'SYNTHETIC_STDERR',
  })
  assert.deepEqual(JSON.parse(readFileSync(fake.marker)), ['auth', 'verify', '--license', license])
  assert.deepEqual(JSON.parse(result.stdout), {
    action: 'verify',
    exitCode: 0,
    report: {
      schemaVersion,
      status: 'success',
      outcome: 'passed',
      reason: 'ok',
      verifiedAtUnixMs,
      trustedFacts: {
        issuedAt: '2026-10-01T12:00:00Z',
        expiresAt: '2027-01-01T12:00:00Z',
        capabilities: { allowCI: false, maxConcurrency: null },
        entitlements: { convert: entitlement },
      },
    },
  })
  assert.equal(result.stderr, '')
})

test('install and status preserve uncertainty, hashes, and admission facts for recovery', (t) => {
  const fake = fakeAuth(t)
  const license = join(fake.cwd, 'delivery.json')
  const targetPath = join(fake.cwd, 'SYNTHETIC_ID', 'xdoc-license.json')
  const pathSha256 = hash(targetPath)
  const sha256 = 'a'.repeat(64)
  const uncertain = {
    schemaVersion: 'xdoc-cli-auth-install/v1',
    status: 'error',
    outcome: 'uncertain',
    reason: 'auth_install_outcome_uncertain',
    publication: 'uncertain',
    attemptedSha256: sha256,
  }
  assert.deepEqual(
    JSON.parse(
      fake.run(
        ['install', license],
        {
          report: {
            ...uncertain,
            targetPath,
            error: { code: 'auth_install_outcome_uncertain', message: 'SYNTHETIC_ERROR' },
          },
          exitCode: 9,
        },
        9,
      ).stdout,
    ),
    {
      action: 'install',
      exitCode: 9,
      report: {
        ...uncertain,
        targetPathSha256: pathSha256,
        error: { code: 'auth_install_outcome_uncertain' },
      },
    },
  )
  assert.deepEqual(JSON.parse(readFileSync(fake.marker)), ['auth', 'install', license])

  const status = {
    schemaVersion: 'xdoc-cli-auth-status/v1',
    status: 'success',
    health: 'healthy',
    admission: { state: 'admitted', reason: null },
    verification: { state: 'verified', reason: null, authenticatedFacts: { deviceBound: false } },
    source: { kind: 'config-path', path: targetPath, sha256 },
    clock: { state: 'unavailable', systemNowUnixMs: null },
    taskAuthorization: 'not-evaluated',
  }
  assert.deepEqual(JSON.parse(fake.run(['status'], { report: status }).stdout), {
    action: 'status',
    exitCode: 0,
    report: { ...status, source: { kind: 'config-path', pathSha256, sha256 } },
  })
  assert.deepEqual(JSON.parse(readFileSync(fake.marker)), ['auth', 'status'])
})

test('recovery actions preserve their results without emitting malformed report paths', (t) => {
  const fake = fakeAuth(t)
  for (const [action, outcome] of [
    ['reset-clock', 'reset'],
    ['uninstall', 'removed'],
  ]) {
    const report = {
      schemaVersion: `xdoc-cli-auth-${action}/v1`,
      status: 'success',
      outcome,
      reason: null,
    }
    const result = fake.run([action], {
      report: { ...report, configDirectory: fake.cwd, path: join(fake.cwd, 'SYNTHETIC\nPATH') },
    })
    assert.deepEqual(JSON.parse(result.stdout), {
      action,
      exitCode: 0,
      report: { ...report, configDirectorySha256: hash(fake.cwd) },
    })
    assert.deepEqual(JSON.parse(readFileSync(fake.marker)), ['auth', action])
  }
})

test('invalid action arguments are rejected before launching xdoc', (t) => {
  const fake = fakeAuth(t)
  const license = join(fake.cwd, 'delivery.json')
  for (const args of [
    ['status', license],
    ['verify'],
    ['install', '--license', license],
    ['__proto__'],
  ]) {
    const result = fake.run(args, { stdout: 'SYNTHETIC_STDOUT' }, 2)
    assert.equal(result.stdout, '')
    assert.doesNotMatch(result.stderr, /SYNTHETIC/)
  }
  assert.equal(existsSync(fake.marker), false)
})

test('strict one-off conversion passes the license path and filters the diagnostic report', (t) => {
  const fake = fakeAuth(t)
  const input = join(fake.cwd, 'source.pptx')
  const output = join(fake.cwd, 'candidate.pdf')
  const license = join(fake.cwd, 'delivery.json')
  writeFileSync(input, '')
  const result = fake.run(
    ['check-convert', '--require-unwatermarked', input, output, license],
    {
      report: {
        schemaVersion: 'batch/v1',
        items: [
          {
            status: 'failed',
            input: 'SYNTHETIC_PATH',
            error: {
              kind: 'strict_mode_unsatisfied',
              stage: 'authorization',
              message: 'SYNTHETIC_MESSAGE',
              details: { reason: 'strict_mode_unsatisfied', customerId: 'SYNTHETIC_CUSTOMER' },
            },
          },
        ],
      },
      stdout: 'SYNTHETIC_STDOUT',
      stderr: 'SYNTHETIC_STDERR',
      exitCode: 4,
    },
    4,
  )
  const args = JSON.parse(readFileSync(fake.marker))
  const rawReport = args[args.indexOf('--report') + 1]
  assert.deepEqual(args, [
    'convert',
    '--to',
    'pdf',
    '--output',
    output,
    '--require-unwatermarked',
    '--report',
    rawReport,
    '--license',
    license,
    '--',
    input,
  ])
  assert.equal(existsSync(rawReport), false)
  assert.equal(result.stderr, '')
  assert.deepEqual(JSON.parse(result.stdout), {
    action: 'check-convert',
    exitCode: 4,
    report: {
      schemaVersion: 'batch/v1',
      status: 'failed',
      error: {
        kind: 'strict_mode_unsatisfied',
        stage: 'authorization',
        details: { reason: 'strict_mode_unsatisfied' },
      },
      outputWritten: false,
    },
  })
})

test('strict conversion checks for the output even when xdoc exits zero', (t) => {
  const fake = fakeAuth(t)
  const args = [
    'check-convert',
    '--require-entitlement',
    join(fake.cwd, 'input.pptx'),
    join(fake.cwd, 'out.pdf'),
  ]
  writeFileSync(args[2], '')
  const report = { schemaVersion: 'batch/v1', items: [{ status: 'succeeded' }] }
  const incomplete = JSON.parse(fake.run(args, { report }, 1).stdout)
  assert.equal(incomplete.exitCode, 0)
  assert.equal(incomplete.diagnostic, 'conversion_unverified')
  assert.equal(incomplete.report.outputWritten, false)
  const completed = JSON.parse(fake.run(args, { report, writeOutput: true }).stdout)
  assert.equal(completed.report.outputWritten, true)
  assert.equal(completed.diagnostic, undefined)
})

test('strict conversion refuses a directory, a wildcard, or a missing PPTX before launching xdoc', (t) => {
  const fake = fakeAuth(t)
  const directory = join(fake.cwd, 'folder.pptx')
  mkdirSync(directory)
  writeFileSync(join(fake.cwd, 'matching.pptx'), '')
  for (const input of [directory, join(fake.cwd, 'match*.pptx'), join(fake.cwd, 'missing.pptx')]) {
    const result = fake.run(
      ['check-convert', '--require-entitlement', input, join(fake.cwd, 'out.pdf')],
      {},
      2,
    )
    assert.equal(result.stdout, '')
  }
  assert.equal(existsSync(fake.marker), false)
})

test('unrecognized auth output is suppressed while preserving the child exit code', (t) => {
  const fake = fakeAuth(t)
  for (const [stdout, exitCode, expectedStatus] of [
    ['', 2, 2],
    ['SYNTHETIC_MALFORMED_STDOUT', 0, 1],
    [
      JSON.stringify({ schemaVersion: 'future', status: 'success', secret: 'SYNTHETIC_VALUE' }),
      0,
      1,
    ],
  ]) {
    const result = fake.run(
      ['status'],
      { stdout, stderr: 'SYNTHETIC_STDERR', exitCode },
      expectedStatus,
    )
    assert.deepEqual(JSON.parse(result.stdout), {
      action: 'status',
      exitCode,
      report: null,
      diagnostic: 'no_structured_report',
    })
    assert.equal(result.stderr, '')
  }
})

test(
  'a report followed by signal termination does not indicate process success',
  { skip: process.platform === 'win32' },
  (t) => {
    const fake = fakeAuth(t)
    const report = {
      schemaVersion: 'xdoc-cli-auth-status/v1',
      status: 'success',
      health: 'not-installed',
    }
    const result = fake.run(['status'], { report, signal: 'SIGTERM' }, 1)
    assert.deepEqual(JSON.parse(result.stdout), {
      action: 'status',
      exitCode: null,
      report,
      diagnostic: 'process_failed',
    })
  },
)
