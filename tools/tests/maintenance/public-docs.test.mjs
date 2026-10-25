import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { repoRoot, writeJson } from '../helpers/common.mjs'
import { publicXdocSchema } from '../helpers/xdoc-contracts.mjs'

test('public xdoc docs match the clean checked-in runtime schema', () => {
  const result = spawnSync('nu', ['tools/update-xdoc-public-docs.nu', '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('schema recipe captures the local xdoc runtime by default', () => {
  const justfile = readFileSync(join(repoRoot, 'Justfile'), 'utf8')
  assert.match(justfile, /^schema schema_file='':$/m)
  assert.match(justfile, /tools\/update-xdoc-public-docs\.nu/)
  assert.match(justfile, /\^xdoc schema \| complete/)
})

test('schema-public recipe delegates the controlled build and gate to one maintainer command', () => {
  const justfile = readFileSync(join(repoRoot, 'Justfile'), 'utf8')
  assert.match(justfile, /^schema-public manifest xdoc_repo='\.\.\/pptx':$/m)
  assert.match(justfile, /tools\/refresh-xdoc-public-docs\.nu/)
})

test('public xdoc docs refresher composes build, gate, capture, update, and check', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'xdoc-public-refresh-'))
  const xdocRepo = join(root, 'pptx')
  const novaRepo = join(root, 'pptx-nova')
  const xdocTools = join(xdocRepo, 'tools')
  const novaTools = join(novaRepo, 'tools')
  const novaDocs = join(novaRepo, 'docs')
  const manifest = join(xdocRepo, 'approved-manifest.json')
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(xdocTools, { recursive: true })
  mkdirSync(novaTools, { recursive: true })
  mkdirSync(novaDocs, { recursive: true })

  const schema = publicXdocSchema({
    version: '0.3.10 (deadbeef)',
    definitions: { first: {}, second: {} },
  })
  const isWindows = process.platform === 'win32'
  const binaryName = isWindows ? 'xdoc.exe' : 'xdoc'
  const fakeXdocName = isWindows ? 'fake-xdoc.exe' : 'fake-xdoc'
  const fakeXdoc = join(xdocRepo, fakeXdocName)
  const fakeXdocSource = `process.stdout.write(${JSON.stringify(JSON.stringify(schema))})\n`
  if (isWindows) {
    copyFileSync(process.execPath, fakeXdoc)
    writeFileSync(join(root, 'schema'), fakeXdocSource)
  } else {
    writeFileSync(fakeXdoc, `#!/usr/bin/env node\n${fakeXdocSource}`)
    chmodSync(fakeXdoc, 0o755)
  }
  writeJson(manifest, { schemaVersion: 'xdoc-cli-trust-profile/v1' })
  writeFileSync(
    join(xdocTools, 'build-production-xdoc-cli.nu'),
    [
      '#!/usr/bin/env nu',
      '',
      'def main [--manifest: path, --output-dir: path, --json] {',
      '  let root = ($env.CURRENT_FILE | path dirname | path dirname)',
      '  mkdir $output_dir',
      `  let binary = ($output_dir | path join '${binaryName}')`,
      `  cp ($root | path join '${fakeXdocName}') $binary`,
      ...(isWindows ? [] : ["  ^chmod '755' $binary"]),
      '  let revision = (^git -C $root rev-parse HEAD | str trim)',
      '  {',
      "    schemaVersion: 'xdoc-cli-controlled-build/v1'",
      "    status: 'built'",
      '    sourceRevision: $revision',
      '    binary: ($binary | path expand --strict | into string)',
      '  } | to json --raw | print',
      '}',
      '',
    ].join('\n'),
  )
  writeFileSync(
    join(xdocTools, 'xdoc-cli-release-check.nu'),
    [
      '#!/usr/bin/env nu',
      '',
      'def main [',
      '  --manifest: path',
      '  --package-dir: path',
      '  --source-revision: string',
      '  --report: path',
      '  --json',
      '] {',
      '  let value = {',
      "    schemaVersion: 'xdoc-cli-release-check/v1'",
      "    status: 'passed'",
      '    sourceRevision: $source_revision',
      `    binary: ($package_dir | path join '${binaryName}' | path expand --strict | into string)`,
      '  }',
      '  $value | to json | save --force $report',
      '  $value | to json --raw | print',
      '}',
      '',
    ].join('\n'),
  )

  writeFileSync(
    join(novaTools, 'update-xdoc-public-docs.nu'),
    readFileSync(join(repoRoot, 'tools/update-xdoc-public-docs.nu')),
  )
  writeJson(join(novaDocs, 'xdoc-schema.json'), {
    schemaVersion: 'cli-agent/v1',
    version: '0.3.9 (cafebabe)',
    commands: {
      pptx: {
        patchSchema: {
          jsonSchema: { $defs: { first: {} } },
        },
      },
    },
  })
  writeFileSync(
    join(novaDocs, 'xdoc-introducution.md'),
    [
      '> **Runtime build verified for this document:** `0.3.9 (cafebabe)`',
      '',
      '> **Verification date:** 2025-01-02',
      '',
      '| Patch schema definitions | 1 `$defs` in the current runtime schema |',
      '',
      'This document is anchored to xdoc 0.3.9 (cafebabe).',
      '',
    ].join('\n'),
  )

  for (const args of [
    ['init', '--quiet'],
    ['add', '.'],
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    ],
  ]) {
    const git = spawnSync('git', args, { cwd: xdocRepo, encoding: 'utf8' })
    assert.equal(git.status, 0, git.stderr)
  }

  const result = spawnSync(
    'nu',
    [
      '--no-config-file',
      join(repoRoot, 'tools/refresh-xdoc-public-docs.nu'),
      '--manifest',
      manifest,
      '--xdoc-repo',
      xdocRepo,
      '--nova-repo',
      novaRepo,
      '--verification-date',
      '2026-09-03',
    ],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /Public xdoc documentation refreshed from gated build/)
  const { build: _build, authContract: _authContract, ...contractSchema } = schema
  assert.deepEqual(
    JSON.parse(readFileSync(join(novaDocs, 'xdoc-schema.json'), 'utf8')),
    contractSchema,
  )
  const introduction = readFileSync(join(novaDocs, 'xdoc-introducution.md'), 'utf8')
  assert.match(introduction, /0\.3\.10 \(deadbeef\)/)
  assert.match(introduction, /Verification date:\*\* 2026-09-03/)
  assert.match(introduction, /2 `\$defs` in the current runtime schema/)
})

test('public xdoc docs updater replaces literal $defs text and keeps checks deterministic', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'xdoc-public-docs-'))
  const docsDir = join(root, 'docs')
  const schemaPath = join(root, 'runtime-schema.json')
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(docsDir, { recursive: true })
  const localSchema = publicXdocSchema({
    version: '1.2.3 (deadbeef)',
    definitions: { first: {}, second: {} },
  })
  localSchema.build.product = 'xdoc-server'
  localSchema.build.customerId = 'dev'
  localSchema.build.licenseId = 'lic_dev'
  localSchema.build.buildId = 'build_dev'
  localSchema.build.edition = 'development'
  localSchema.authContract.buildProfile = 'development'
  localSchema.authContract.buildId = 'dev'
  localSchema.prose = [
    'Generated from the same MoonBit modules the PDF renderer uses.',
    'Unavailable until the pure MoonBit reader lands.',
  ]
  localSchema.presets = ['moon', 'rect']
  writeJson(schemaPath, localSchema)
  writeJson(
    join(docsDir, 'xdoc-schema.json'),
    publicXdocSchema({
      version: '1.2.2 (cafebabe)',
      definitions: { first: {} },
    }),
  )
  writeFileSync(
    join(docsDir, 'xdoc-introducution.md'),
    [
      '> **Runtime build verified for this document:** `1.2.2 (cafebabe)`',
      '',
      '> **Verification date:** 2025-01-02',
      '',
      '| Patch schema definitions | 1 `$defs` in the current runtime schema |',
      '',
      'This document is anchored to xdoc 1.2.2 (cafebabe).',
      '',
    ].join('\n'),
  )

  const update = spawnSync(
    'nu',
    [
      join(repoRoot, 'tools/update-xdoc-public-docs.nu'),
      '--schema-file',
      schemaPath,
      '--verification-date',
      '2026-07-23',
    ],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(update.status, 0, update.stderr || update.stdout)
  assert.doesNotMatch(`${update.stdout}${update.stderr}`, /[\u3400-\u9fff]/u)
  const introduction = readFileSync(join(docsDir, 'xdoc-introducution.md'), 'utf8')
  assert.match(introduction, /2 `\$defs` in the current runtime schema/)
  assert.match(introduction, /1\.2\.3 \(deadbeef\)/)
  assert.match(introduction, /Verification date:\*\* 2026-07-23/)
  const writtenSchema = JSON.parse(readFileSync(join(docsDir, 'xdoc-schema.json'), 'utf8'))
  assert.equal('build' in writtenSchema, false)
  assert.equal('authContract' in writtenSchema, false)
  assert.deepEqual(writtenSchema.prose, [
    'Generated from the same shared geometry modules the PDF renderer uses.',
    'Unavailable until the alternative PDF reader lands.',
  ])
  assert.deepEqual(writtenSchema.presets, localSchema.presets)
  assert.doesNotMatch(readFileSync(join(docsDir, 'xdoc-schema.json'), 'utf8'), /moon|mbt/i)
  assert.deepEqual(JSON.parse(readFileSync(schemaPath, 'utf8')), localSchema)

  const check = spawnSync('nu', [join(repoRoot, 'tools/update-xdoc-public-docs.nu'), '--check'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(check.status, 0, check.stderr || check.stdout)
  assert.doesNotMatch(`${check.stdout}${check.stderr}`, /[\u3400-\u9fff]/u)
  const snapshotBefore = readFileSync(join(docsDir, 'xdoc-schema.json'))
  for (const [relativePath, term] of [
    ['README.md', 'MOONBIT'],
    ['pptx-nova/README.md', 'moon'],
    ['docs/nested/guide.md', 'mbt'],
  ]) {
    const path = join(root, relativePath)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, term)
    const rejected = spawnSync(
      'nu',
      [join(repoRoot, 'tools/update-xdoc-public-docs.nu'), '--check'],
      { cwd: root, encoding: 'utf8' },
    )
    assert.notEqual(rejected.status, 0, relativePath)
    assert.match(`${rejected.stdout}${rejected.stderr}`, /forbidden text/)
    assert.deepEqual(readFileSync(join(docsDir, 'xdoc-schema.json')), snapshotBefore)
    rmSync(path)
  }
})

test('public xdoc docs updater rejects development and spoofed CLI identities before writing', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'xdoc-public-identity-'))
  const docsDir = join(root, 'docs')
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(docsDir, { recursive: true })

  const checkedInSchema = publicXdocSchema({
    version: '1.2.2 (cafebabe)',
    definitions: { first: {} },
  })
  const snapshotPath = join(docsDir, 'xdoc-schema.json')
  const introductionPath = join(docsDir, 'xdoc-introducution.md')
  writeJson(snapshotPath, checkedInSchema)
  writeFileSync(
    introductionPath,
    [
      '> **Runtime build verified for this document:** `1.2.2 (cafebabe)`',
      '',
      '> **Verification date:** 2025-01-02',
      '',
      '| Patch schema definitions | 1 `$defs` in the current runtime schema |',
      '',
      'This document is anchored to xdoc 1.2.2 (cafebabe).',
      '',
    ].join('\n'),
  )
  const snapshotBefore = readFileSync(snapshotPath)
  const introductionBefore = readFileSync(introductionPath)

  const cases = [
    {
      name: 'development server build',
      mutate(schema) {
        schema.build.product = 'xdoc-server'
        schema.build.customerId = 'dev'
        schema.build.licenseId = 'lic_dev'
        schema.build.buildId = 'build_dev'
        schema.build.edition = 'development'
        schema.authContract.buildProfile = 'development'
        schema.authContract.buildId = 'dev'
      },
      expected: [/build\.product mismatch/, /xdoc-server/],
    },
    {
      name: 'product-only spoof',
      mutate(schema) {
        schema.build.customerId = 'dev'
        schema.build.licenseId = 'lic_dev'
        schema.build.buildId = 'build_dev'
        schema.build.edition = 'development'
        schema.authContract.buildProfile = 'development'
        schema.authContract.buildId = 'dev'
      },
      expected: [/build\.customerId mismatch/, /found dev/],
    },
  ]

  for (const candidateCase of cases) {
    const schema = publicXdocSchema({
      version: '1.2.3 (deadbeef)',
      definitions: { first: {}, second: {} },
    })
    candidateCase.mutate(schema)
    const schemaPath = join(root, `${candidateCase.name.replaceAll(' ', '-')}.json`)
    writeJson(schemaPath, schema)
    const result = spawnSync(
      'nu',
      [
        join(repoRoot, 'tools/update-xdoc-public-docs.nu'),
        '--schema-file',
        schemaPath,
        '--verification-date',
        '2026-07-23',
        '--require-public-build',
      ],
      { cwd: root, encoding: 'utf8' },
    )
    assert.notEqual(result.status, 0, candidateCase.name)
    const diagnostic = `${result.stdout}${result.stderr}`
    for (const expected of candidateCase.expected) {
      assert.match(diagnostic, expected)
    }
    assert.deepEqual(readFileSync(snapshotPath), snapshotBefore)
    assert.deepEqual(readFileSync(introductionPath), introductionBefore)
  }
})

test('public xdoc docs updater rejects a missing build descriptor from xdoc 0.3.10 onward', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'xdoc-public-build-required-'))
  const docsDir = join(root, 'docs')
  const schemaPath = join(root, 'runtime-schema.json')
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(docsDir, { recursive: true })

  const candidate = publicXdocSchema({
    version: '0.3.10 (deadbeef)',
    definitions: { first: {}, second: {} },
  })
  delete candidate.build
  writeJson(schemaPath, candidate)
  writeJson(join(docsDir, 'xdoc-schema.json'), {
    schemaVersion: 'cli-agent/v1',
    version: '0.3.9 (cafebabe)',
    commands: {
      pptx: {
        patchSchema: {
          jsonSchema: { $defs: { first: {} } },
        },
      },
    },
  })
  writeFileSync(
    join(docsDir, 'xdoc-introducution.md'),
    [
      '> **Runtime build verified for this document:** `0.3.9 (cafebabe)`',
      '',
      '> **Verification date:** 2025-01-02',
      '',
      '| Patch schema definitions | 1 `$defs` in the current runtime schema |',
      '',
      'This document is anchored to xdoc 0.3.9 (cafebabe).',
      '',
    ].join('\n'),
  )

  const result = spawnSync(
    'nu',
    [
      join(repoRoot, 'tools/update-xdoc-public-docs.nu'),
      '--schema-file',
      schemaPath,
      '--verification-date',
      '2026-07-23',
      '--require-public-build',
    ],
    { cwd: root, encoding: 'utf8' },
  )
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}${result.stderr}`, /requires an xdoc-build\/v1 descriptor/)

  const legacyCheck = spawnSync(
    'nu',
    [join(repoRoot, 'tools/update-xdoc-public-docs.nu'), '--check'],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(legacyCheck.status, 0, legacyCheck.stderr || legacyCheck.stdout)
})
