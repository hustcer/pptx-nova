import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runNode, skillPath } from '../helpers/common.mjs'
import { writeFakeXdoc } from '../helpers/fake-xdoc.mjs'

test('run initializer creates standard artifacts and reusable commands', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-init-run-'))
  const fakeXdoc = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
if (process.argv[2] === 'schema') {
  process.stdout.write(JSON.stringify({
    version: '9.9.9 (fake)',
    schemaVersion: 'cli-agent/v1',
    capabilities: { schemaVersion: 'capabilities/v1' },
    commands: { pptx: { subcommands: {}, patchSchema: {}, catalogs: {} } }
  }))
  process.exit(0)
}
process.exit(2)
`,
  )
  const result = runNode([
    skillPath('scripts/cli/runtime/init-run.mjs'),
    '--slug',
    'script test',
    '--deckkit',
    'swiss-grid',
    '--root',
    root,
    '--output',
    'script-test.pptx',
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])
  const paths = JSON.parse(result.stdout)

  for (const path of [
    paths.outlinePath,
    paths.deckLockTemplatePath,
    paths.contentTemplatePath,
    paths.assetsDir,
  ]) {
    assert.equal(existsSync(path), true, path)
  }
  assert.equal(existsSync(paths.deckLockPath), false, paths.deckLockPath)
  assert.equal(existsSync(paths.contentPath), false, paths.contentPath)
  const commands = JSON.parse(readFileSync(join(paths.runDir, 'commands.json'), 'utf8'))
  assert.match(commands.run, /cli\/create\/run\.mjs/)
  assert.match(commands.run, /--run-dir/)
  assert.match(commands.run, /--json/)
  assert.match(commands.build, /cli\/create\/build\.mjs/)
  assert.match(commands.probe, /cli\/runtime\/probe\.mjs/)
  assert.match(commands.probe, /xdoc-capabilities\.json/)
  assert.match(commands.validate, /--mode delivery/)
  assert.match(commands.checkLock, /cli\/create\/check-lock\.mjs/)
  assert.match(commands.dryRun, /candidate\.pptx/)
  assert.match(commands.dryRun, /--overwrite/)
  assert.match(commands.apply, /candidate\.pptx/)
  assert.match(commands.apply, /--overwrite/)
  assert.match(commands.vision, /vision-check/)
  assert.match(commands.preview, /--contact-sheet/)
  assert.match(commands.visualVerify, /--visual-mode create/)
  assert.match(commands.visualEvidenceGate, /--candidate/)
  assert.match(commands.finalize, /--finalize --visual-review/)
  const contentTemplate = JSON.parse(readFileSync(paths.contentTemplatePath, 'utf8'))
  const deckLockTemplate = JSON.parse(readFileSync(paths.deckLockTemplatePath, 'utf8'))
  assert.equal(contentTemplate._template, true)
  assert.equal(deckLockTemplate._template, true)
  assert.equal(paths.capabilityPath, join(paths.runDir, 'xdoc-capabilities.json'))
  assert.equal(paths.candidatePath, join(paths.runDir, 'candidate.pptx'))
  assert.equal(paths.dryRunPath, join(paths.runDir, 'dry-run.json'))
  assert.equal(paths.applyPath, join(paths.runDir, 'apply.json'))
  assert.equal(paths.visionPath, join(paths.runDir, 'vision.json'))
  assert.equal(paths.previewReportPath, join(paths.runDir, 'preview.json'))
  assert.equal(paths.commandsPath, join(paths.runDir, 'commands.json'))
  assert.equal(paths.previewsDir, join(paths.runDir, 'previews'))
  assert.equal(paths.contactSheetPath, join(paths.runDir, 'previews', 'contact-sheet.png'))
  assert.equal(paths.finalPptx, join(root, 'script-test.pptx'))
})
