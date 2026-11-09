import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileIdentity, runNodeStatus, skillPath, writeJson } from '../helpers/common.mjs'
import { writeFakeXdoc } from '../helpers/fake-xdoc.mjs'
import { proofPptx } from '../helpers/proof-fixtures.mjs'
import { readRefurbishSummary } from '../helpers/runner-fixtures.mjs'

function fixture(fill = '0000FF') {
  const root = mkdtempSync(join(tmpdir(), 'nova-refurbish-proof-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate-input.pptx')
  const output = join(root, 'out.pptx')
  const runDir = join(root, 'run')
  const proofMapPath = join(root, 'proof-map.json')
  const paint = (color) =>
    `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln>`
  writeFileSync(source, proofPptx(paint('0000FF')))
  writeFileSync(candidate, proofPptx(paint(fill)))
  const proofMap = {
    sourceSha256: fileIdentity(source).sha256,
    proofObjects: [{ slideNumber: 1, shapeId: 7, role: 'milestone-node' }],
  }
  writeJson(proofMapPath, proofMap)
  const fake = writeFakeXdoc(
    root,
    `#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const args = process.argv.slice(2)
const value = flag => args[args.indexOf(flag) + 1]
const print = report => process.stdout.write(JSON.stringify(report))
const identity = path => ({ path, byteLength: readFileSync(path).length, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') })
const visionDiff = { schemaVersion: 'pptx-vision-diff/v1', status: 'success', newIssues: [], changedIssues: [], worsenedIssues: [] }
const audit = { schemaVersion: 'pptx-refurbish-audit/v1', status: 'success', outcome: 'passed',
  summary: { errorCount: 0, warningCount: 0, baselineSlideCount: 1, targetSlideCount: 1, slideCountMatches: true }, issues: [] }
if (args[0] === 'schema') {
  print({ version: '9.9.9 (fake)', schemaVersion: 'cli-agent/v1', capabilities: {}, commands: { pptx: {
    subcommands: { inspect: {}, apply: {}, 'refurbish-skin': {}, 'chrome-detect': {}, 'vision-diff': {}, 'refurbish-audit': {}, preview: {}, diff: {} },
    patchSchema: {}, catalogs: { nativeDeckkits: { deckkits: [{ id: 'mckinsey-blue', readiness: 'production' }] } }
  } } })
} else if (args[0] === 'pptx' && args[1] === 'inspect') {
  // Rendering/audit stubs allow the real publication guard to decide from native bytes.
  print({ schemaVersion: 'pptx-inspect/v1', presentation: { slideCount: 1, size: { width: '10in', height: '5.625in' } },
    slides: [{ index: 0, partName: 'ppt/slides/proof.xml', shapes: [] }] })
} else if (args[0] === 'pptx' && args[1] === 'refurbish-skin') {
  copyFileSync(${JSON.stringify(candidate)}, value('--output'))
  print({ schemaVersion: 'pptx-refurbish-skin/v1', status: 'success', outcome: 'passed', gate: { passed: true, newHighIssues: 0, newMediumIssues: 0 }, reports: { visionDiff, audit } })
} else if (args[0] === 'pptx' && args[1] === 'chrome-detect') {
  print({ schemaVersion: 'pptx-chrome-detect/v1', status: 'success', slides: [] })
} else if (args[0] === 'pptx' && args[1] === 'apply') {
  if (!args.includes('--dry-run')) copyFileSync(${JSON.stringify(candidate)}, value('-o'))
  print({ schemaVersion: args.includes('--dry-run') ? 'pptx-dry-run/v1' : 'pptx-apply/v1', status: 'success', opResults: [] })
} else if (args[0] === 'pptx' && args[1] === 'vision-diff') {
  print(visionDiff)
} else if (args[0] === 'pptx' && args[1] === 'refurbish-audit') {
  print(audit)
} else if (args[0] === 'pptx' && args[1] === 'diff') {
  print({ schemaVersion: 'pptx-diff/v1', status: 'success', agentGate: { semanticStatus: 'pass' }, summary: { reliableChanges: 0, uncertainChanges: 0, unsupportedRegions: 0 }, slides: [] })
} else if (args[0] === 'pptx' && args[1] === 'preview') {
  const dir = value('--output-dir'), contact = value('--contact-output')
  mkdirSync(dir, { recursive: true })
  const page = join(dir, 'slide-001.png')
  writeFileSync(page, 'png')
  writeFileSync(contact, 'contact')
  print({ schemaVersion: 'pptx-preview/v1', status: 'success', pages: [{ slide: 1, path: page, status: 'success', width: 100, height: 56, byteLength: 3 }], contactSheet: { path: contact, width: 100, height: 56, byteLength: 7 } })
} else if (args[0] === 'pptx' && args[1] === 'contact-diff') {
  const proofMapPath = join(${JSON.stringify(runDir)}, 'proof-objects.json')
  if (process.env.FAKE_PROOF_MAP_CHANGE === 'missing') renameSync(proofMapPath, proofMapPath + '.lost')
  if (process.env.FAKE_PROOF_MAP_CHANGE === 'changed') {
    const map = JSON.parse(readFileSync(proofMapPath))
    map.proofObjects[0].role = 'changed-after-snapshot'
    writeFileSync(proofMapPath, JSON.stringify(map))
  }
  const output = value('--output'), dpi = Number(value('--dpi'))
  writeFileSync(output, 'compare')
  const agentPath = process.env.XDOC_CONTACT_DIFF_AGENT_REVIEW_OUTPUT
  if (agentPath) writeFileSync(agentPath, 'agent review')
  const scopeMode = args.includes('--slides') ? 'selected-slides' : 'all-slides'
  print({ schemaVersion: 'pptx-contact-diff/v1', status: 'success', baseline: identity(value('--source')), target: identity(value('--candidate')),
    baselinePath: value('--source'), targetPath: value('--candidate'), outputPath: output,
    summary: { pairCount: 1, scopeMode, dpi }, scope: { requested: args.includes('--slides') ? value('--slides') : null, slides: [1], basis: 'source-slides' },
    agentGate: { passed: true, status: 'pass', scopeMode, pairCount: 1 }, render: { path: output, width: 100, height: 56, dpi },
    agentReview: agentPath ? { status: 'success', path: agentPath, renderDpi: dpi, layoutDpi: Number(process.env.XDOC_CONTACT_DIFF_AGENT_REVIEW_LAYOUT_DPI), width: 50, height: 28, cacheReuse: 'same-render-dpi-page-cache' } : undefined })
} else { throw new Error('Unexpected command: ' + args.join(' ')) }
`,
  )
  const args = [
    skillPath('scripts/cli/refurbish/run.mjs'),
    '--deckkit',
    'mckinsey-blue',
    '--source',
    source,
    '--output',
    output,
    '--run-dir',
    runDir,
    '--xdoc-bin',
    fake,
    '--proof-map',
    proofMapPath,
    '--progress',
    'off',
    '--json',
  ]
  return { root, source, candidate, output, runDir, proofMapPath, proofMap, args }
}

for (const route of ['native', 'fallback']) {
  for (const visible of [true, false]) {
    test(`${route} runner ${visible ? 'publishes visible proofs' : 'blocks disappearing proofs'} from an external proof map`, () => {
      const f = fixture(visible ? '002A12' : 'FFFFFF')
      const sourceBefore = fileIdentity(f.source).sha256
      const result = runNodeStatus([...f.args, '--route', route], visible ? 0 : 1)
      const summary = readRefurbishSummary(result)
      assert.equal(existsSync(f.output), visible)
      assert.deepEqual(JSON.parse(readFileSync(join(f.runDir, 'proof-objects.json'))), f.proofMap)
      assert.equal(summary.artifacts.proofMap, join(f.runDir, 'proof-objects.json'))
      const phases = summary.phases.map((phase) => phase.name)
      assert.ok(phases.indexOf('proof-map-snapshot') < phases.indexOf('xdoc-capability-probe'))
      assert.equal(summary.handoff['--proof-map'], f.proofMapPath)
      const gate = JSON.parse(readFileSync(join(f.runDir, 'refurbish-compare-gate.json')))
      assert.equal(gate.proofVisibility.status, visible ? 'pass' : 'fail')
      if (visible) assert.equal(fileIdentity(f.output).sha256, fileIdentity(f.candidate).sha256)
      else {
        assert.equal(summary.error.phase, 'refurbish-compare-delivery')
        assert.match(summary.agentSummary.nextSteps.recoveryCommand, /--proof-map/)
        assert.ok(
          gate.proofVisibility.results[0].issues.some(
            (issue) => issue.code === 'proof-not-discernible',
          ),
        )
      }
      assert.equal(fileIdentity(f.source).sha256, sourceBefore)
      assert.deepEqual(JSON.parse(readFileSync(f.proofMapPath)), f.proofMap)
    })
  }
}

test('stale and empty proof maps fail before capability probing or publication', () => {
  for (const delta of [{ sourceSha256: '0'.repeat(64) }, { proofObjects: [] }]) {
    const f = fixture()
    writeJson(f.proofMapPath, { ...f.proofMap, ...delta })
    const summary = readRefurbishSummary(runNodeStatus(f.args, 1))
    assert.equal(summary.error.phase, 'proof-map')
    assert.equal(
      summary.phases.some((phase) => phase.name === 'xdoc-capability-probe'),
      false,
    )
    assert.equal(existsSync(f.output), false)
  }
})

test('a supplied proof map cannot disappear or change before publication', () => {
  for (const change of ['missing', 'changed']) {
    const f = fixture()
    const summary = readRefurbishSummary(
      runNodeStatus(f.args, 1, {
        env: { ...process.env, FAKE_PROOF_MAP_CHANGE: change },
      }),
    )
    assert.equal(summary.error.phase, 'proof-map-binding')
    assert.equal(existsSync(f.output), false)
    assert.equal(existsSync(join(f.runDir, 'refurbish-compare-gate.json')), false)
  }
})
