import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runNode, skillPath } from '../helpers/common.mjs'
import { writeFakeXdoc } from '../helpers/fake-xdoc.mjs'

test('capability probe advertises field-scoped schema lookup when disclosed', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-probe-fields-'))
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] === 'schema') {
  process.stdout.write(JSON.stringify({
    version: '9.9.9 (fake)',
    schemaVersion: 'cli-agent/v1',
    capabilities: { schemaVersion: 'capabilities/v1' },
    commands: {
      pptx: {
        subcommands: { apply: {} },
        schemaDisclosure: {
          modes: [
            { flag: '--mode ops --ops a,b,c' },
            { flag: '--fields a,b,c' },
            { flag: '--defs summary|full' },
            { flag: '--minimal' }
          ],
          agentHint: 'Use --mode ops with --fields for focused discovery.'
        },
        patchSchema: {
          supportedOps: ['set-shape', 'set-shape'],
          operations: [{ op: 'set-shape' }]
        },
        catalogs: {}
      }
    }
  }))
  process.exit(0)
}
if (args.at(-1) === '--help') {
  process.stdout.write('--json --report --output preview')
  process.exit(0)
}
process.exit(2)
`,
  )
  const result = runNode([
    skillPath('scripts/cli/runtime/probe.mjs'),
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.capabilities.schemaSlicing.available, true)
  assert.equal(report.capabilities.schemaSlicing.fieldsAvailable, true)
  assert.equal(report.capabilities.schemaSlicing.defsAvailable, true)
  assert.deepEqual(report.capabilities.schemaSlicing.defsModes, ['summary', 'full'])
  assert.ok(report.capabilities.schemaSlicing.modes.includes('--fields a,b,c'))
  assert.match(
    report.disclosure.targetedLookup.operationSchema,
    /--fields <needed-fields> --defs summary/,
  )
  assert.match(report.disclosure.targetedLookup.operationSchema, /--defs full before constructing/)
  assert.match(report.disclosure.targetedLookup.operationSchema, /complete operation validation/)
  assert.deepEqual(report.capabilities.patchOperations, ['set-shape'])
})

test('capability probe keeps the unprojected lookup for older xdoc schemas', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-probe-legacy-schema-'))
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] === 'schema') {
  process.stdout.write(JSON.stringify({
    version: '8.8.8 (fake)',
    schemaVersion: 'cli-agent/v1',
    commands: {
      pptx: {
        subcommands: {},
        schemaDisclosure: {
          modes: [{ flag: '--mode ops --ops a,b,c' }, { flag: '--minimal' }]
        },
        patchSchema: {},
        catalogs: {}
      }
    }
  }))
  process.exit(0)
}
if (args.at(-1) === '--help') process.exit(0)
process.exit(2)
`,
  )
  const result = runNode([
    skillPath('scripts/cli/runtime/probe.mjs'),
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.capabilities.schemaSlicing.fieldsAvailable, false)
  assert.equal(report.capabilities.schemaSlicing.defsAvailable, false)
  assert.deepEqual(report.capabilities.schemaSlicing.defsModes, [])
  assert.equal(
    report.disclosure.targetedLookup.operationSchema,
    'xdoc schema --mode ops --ops <name> --minimal',
  )
})
