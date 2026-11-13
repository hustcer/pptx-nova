import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  renameSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { test } from 'node:test'
import {
  repoRoot,
  runNode,
  runNodeStatus,
  skillPath,
  writeJson,
  fileIdentity,
} from '../helpers/common.mjs'
import { writeMultipartContactDiffXdoc } from '../helpers/fake-xdoc.mjs'
import {
  writeCompareGateFixture,
  runCompareGateFixture,
  contactDiffReport,
} from '../helpers/compare-fixtures.mjs'

test('refurbish publication rejects a stale protected-proof map before writing the delivery', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-proof-publication-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const runDir = join(root, 'run'),
    source = join(root, 'source.pptx'),
    candidate = join(root, 'candidate.pptx'),
    delivery = join(root, 'delivery.pptx')
  mkdirSync(runDir)
  writeFileSync(source, 'source bytes')
  writeFileSync(candidate, 'candidate bytes')
  const compare = join(runDir, 'refurbish-compare.png')
  writeFileSync(compare, 'compare png')
  writeJson(
    join(runDir, 'refurbish-compare.json'),
    contactDiffReport({ compare, sourcePptx: source, finalPptx: candidate }),
  )
  writeJson(join(runDir, 'proof-objects.json'), {
    sourceSha256: '0'.repeat(64),
    proofObjects: [{ slideNumber: 1, shapeId: 7, role: 'milestone-node' }],
  })
  const result = spawnSync(
    process.execPath,
    [
      skillPath('scripts/cli/review/compare-gate.mjs'),
      '--run-dir',
      runDir,
      '--final-pptx',
      delivery,
      '--final-pptx-source',
      candidate,
      '--kind',
      'refurbish',
      '--publish',
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(result.status, 2, result.stdout)
  assert.match(JSON.parse(result.stdout).blockers.join('\n'), /proof/i)
  assert.equal(existsSync(delivery), false)
})

test('multipart compare reports retain proof-map binding without the runner summary', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'nova-multipart-proof-binding-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const runDir = join(root, 'run'),
    source = join(root, 'source.pptx'),
    candidate = join(root, 'candidate.pptx')
  mkdirSync(runDir)
  writeFileSync(source, 'source fixture bytes')
  writeFileSync(candidate, 'candidate fixture bytes')
  const map = join(runDir, 'proof-objects.json')
  writeJson(map, {
    sourceSha256: fileIdentity(source).sha256,
    proofObjects: [{ slideNumber: 1, shapeId: 7, role: 'proof' }],
  })
  const expected = fileIdentity(map).sha256
  runNode([
    skillPath('scripts/cli/review/compare.mjs'),
    '--source',
    source,
    '--candidate',
    candidate,
    '--run-dir',
    runDir,
    '--kind',
    'refurbish',
    '--slide-count',
    '48',
    '--xdoc-bin',
    writeMultipartContactDiffXdoc(root),
    '--json',
  ])
  const manifest = JSON.parse(readFileSync(join(runDir, 'refurbish-compare.json')))
  assert.deepEqual(manifest.pptxNovaCompare.proofMapBinding, { required: true, sha256: expected })
  runNode([
    skillPath('scripts/cli/review/compare.mjs'),
    '--source',
    source,
    '--candidate',
    candidate,
    '--run-dir',
    runDir,
    '--kind',
    'refurbish',
    '--slide-count',
    '48',
    '--xdoc-bin',
    join(root, 'fake-xdoc.mjs'),
    '--overwrite',
    '--json',
  ])
  const cached = JSON.parse(readFileSync(join(runDir, 'refurbish-compare.json')))
  assert.ok(cached.parts.every((part) => part.cache.status === 'hit'))
  assert.deepEqual(cached.pptxNovaCompare.proofMapBinding, manifest.pptxNovaCompare.proofMapBinding)
  renameSync(map, map + '.retained')
  const reportBefore = readFileSync(join(runDir, 'refurbish-compare.json'), 'utf8')
  for (const kind of ['refurbish', 'compare']) {
    const blocked = runNodeStatus(
      [
        skillPath('scripts/cli/review/compare.mjs'),
        '--source',
        source,
        '--candidate',
        candidate,
        '--run-dir',
        runDir,
        '--kind',
        kind,
        '--slide-count',
        '48',
        '--report',
        join(runDir, 'refurbish-compare.json'),
        '--xdoc-bin',
        join(root, 'fake-xdoc.mjs'),
        '--overwrite',
        '--json',
      ],
      1,
    )
    assert.match(blocked.stderr, /proof map.*missing/i)
    assert.equal(readFileSync(join(runDir, 'refurbish-compare.json'), 'utf8'), reportBefore)
  }
  const delivery = join(root, 'delivery.pptx')
  const result = runNodeStatus(
    [
      skillPath('scripts/cli/review/compare-gate.mjs'),
      '--run-dir',
      runDir,
      '--final-pptx',
      delivery,
      '--final-pptx-source',
      candidate,
      '--kind',
      'refurbish',
      '--publish',
      '--json',
    ],
    2,
  )
  assert.match(JSON.parse(result.stdout).blockers.join('\n'), /proof map.*missing/i)
  assert.equal(existsSync(delivery), false)
})

test('compare gate publishes every multipart sibling and rejects duplicate coverage', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-multipart-gate-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const finalPptx = join(root, 'final.pptx')
  const runDir = join(root, 'run')
  const fakeXdoc = writeMultipartContactDiffXdoc(root)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  runNode([
    skillPath('scripts/cli/review/compare.mjs'),
    '--source',
    source,
    '--candidate',
    candidate,
    '--run-dir',
    runDir,
    '--kind',
    'refurbish',
    '--slide-count',
    '48',
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])

  const gateResult = runNode([
    skillPath('scripts/cli/review/compare-gate.mjs'),
    '--run-dir',
    runDir,
    '--final-pptx',
    finalPptx,
    '--final-pptx-source',
    candidate,
    '--kind',
    'refurbish',
    '--publish',
    '--timestamp',
    '0711230000',
    '--overwrite',
    '--json',
  ])
  const gate = JSON.parse(gateResult.stdout)
  assert.equal(gate.status, 'pass')
  assert.equal(gate.finalBinding.status, 'bound')
  assert.equal(readFileSync(finalPptx, 'utf8'), 'candidate pptx')
  assert.equal(gate.finalBinding.comparedCandidate.sha256, fileIdentity(candidate).sha256)
  assert.equal(gate.finalBinding.stagedFinal.sha256, fileIdentity(candidate).sha256)
  assert.equal(gate.finalBinding.publishedFinal.sha256, fileIdentity(finalPptx).sha256)
  assert.deepEqual(
    gate.agentSummary.siblingPaths.map((path) => basename(path)),
    [
      'final-refurbish-compare-0711230000-01.png',
      'final-refurbish-compare-0711230000-02.png',
      'final-refurbish-compare-0711230000-03.png',
    ],
  )
  assert.equal(
    gate.siblings.every((sibling) => sibling.exists && sibling.byteLength > 0),
    true,
  )

  const manifestPath = join(runDir, 'refurbish-compare.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.parts[1].slides[0] = 20
  writeJson(manifestPath, manifest)
  const invalidGate = spawnSync(
    process.execPath,
    [
      skillPath('scripts/cli/review/compare-gate.mjs'),
      '--run-dir',
      runDir,
      '--final-pptx',
      finalPptx,
      '--final-pptx-source',
      candidate,
      '--kind',
      'refurbish',
      '--json',
      '--overwrite',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(invalidGate.status, 2)
  assert.match(JSON.parse(invalidGate.stdout).blockers.join('\n'), /duplicate|coverage/i)
})

// These cases exercise generic bundle identity. Translation publication has
// additional workflow/style proof requirements in translation-visual-evidence.
test('compare gate publishes the exact single-file candidate bytes and records a bound receipt', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-single-binding-'))
  const runDir = join(root, 'run')
  const source = join(root, 'source.pptx')
  const candidate = join(runDir, 'candidate.pptx')
  const finalPptx = join(root, 'delivery.pptx')
  const compare = join(runDir, 'compare-compare.png')
  const reportPath = join(runDir, 'compare-compare.json')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(source, 'source bytes')
  writeFileSync(candidate, 'compared candidate bytes')
  writeFileSync(finalPptx, 'old delivery bytes')
  writeFileSync(compare, 'compare png')
  writeJson(reportPath, contactDiffReport({ compare, sourcePptx: source, finalPptx: candidate }))

  const result = runNode([
    skillPath('scripts/cli/review/compare-gate.mjs'),
    '--run-dir',
    runDir,
    '--final-pptx',
    finalPptx,
    '--final-pptx-source',
    candidate,
    '--kind',
    'compare',
    '--publish',
    '--overwrite',
    '--timestamp',
    '0711230001',
    '--json',
  ])
  const gate = JSON.parse(result.stdout)

  assert.equal(gate.status, 'pass')
  assert.equal(gate.finalBinding.status, 'bound')
  assert.equal(readFileSync(finalPptx, 'utf8'), 'compared candidate bytes')
  assert.equal(gate.finalBinding.comparedCandidate.sha256, fileIdentity(candidate).sha256)
  assert.equal(gate.finalBinding.publishedFinal.sha256, fileIdentity(finalPptx).sha256)
  assert.equal(gate.published.at(-1).label, 'final PPTX')
})

test('compare gate rejects an unbound cache-hit attempt', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-cache-hit-binding-'))
  const runDir = join(root, 'run')
  const source = join(root, 'source.pptx')
  const candidate = join(runDir, 'candidate.pptx')
  const finalPptx = join(root, 'delivery.pptx')
  const compare = join(runDir, 'compare-compare.png')
  const reportPath = join(runDir, 'compare-compare.json')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(source, 'source bytes')
  writeFileSync(candidate, 'candidate bytes')
  writeFileSync(compare, 'compare png')
  const report = contactDiffReport({ compare, sourcePptx: source, finalPptx: candidate })
  report.pptxNovaCompare = {
    attempts: [{ dpi: 192, status: 'cache-hit' }],
    cache: { status: 'hit', key: '0'.repeat(64), imageSha256: 'unbound' },
  }
  writeJson(reportPath, report)

  const result = runNodeStatus(
    [
      skillPath('scripts/cli/review/compare-gate.mjs'),
      '--run-dir',
      runDir,
      '--final-pptx',
      finalPptx,
      '--final-pptx-source',
      candidate,
      '--kind',
      'compare',
      '--publish',
      '--overwrite',
      '--json',
    ],
    2,
  )
  assert.match(JSON.parse(result.stdout).blockers.join('\n'), /attempt history/i)
  assert.equal(existsSync(finalPptx), false)
})

test('compare gate check-only mode binds an existing final without a staged source', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-check-binding-'))
  const runDir = join(root, 'run')
  const source = join(root, 'source.pptx')
  const candidate = join(runDir, 'candidate.pptx')
  const finalPptx = join(root, 'delivery.pptx')
  const compare = join(runDir, 'compare-compare.png')
  const reportPath = join(runDir, 'compare-compare.json')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(source, 'source bytes')
  writeFileSync(candidate, 'candidate bytes')
  writeFileSync(compare, 'compare png')
  writeJson(reportPath, contactDiffReport({ compare, sourcePptx: source, finalPptx: candidate }))

  runNode([
    skillPath('scripts/cli/review/compare-gate.mjs'),
    '--run-dir',
    runDir,
    '--final-pptx',
    finalPptx,
    '--final-pptx-source',
    candidate,
    '--kind',
    'compare',
    '--publish',
    '--overwrite',
    '--timestamp',
    '0711230004',
    '--json',
  ])

  const checked = JSON.parse(
    runNode([
      skillPath('scripts/cli/review/compare-gate.mjs'),
      '--run-dir',
      runDir,
      '--final-pptx',
      finalPptx,
      '--kind',
      'compare',
      '--overwrite',
      '--json',
    ]).stdout,
  )

  assert.equal(checked.status, 'pass')
  assert.equal(checked.mode, 'check-binding')
  assert.equal(checked.finalBinding.status, 'bound')
  assert.equal(checked.finalBinding.stagedFinal, null)
  assert.equal(checked.finalBinding.publishedFinal.sha256, fileIdentity(finalPptx).sha256)
  assert.deepEqual(checked.published, [])
})

test('compare gate rejects a different staged final and preserves the existing delivery', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-binding-mismatch-'))
  const runDir = join(root, 'run')
  const source = join(root, 'source.pptx')
  const comparedCandidate = join(runDir, 'compared.pptx')
  const wrongCandidate = join(runDir, 'wrong.pptx')
  const finalPptx = join(root, 'delivery.pptx')
  const compare = join(runDir, 'compare-compare.png')
  const reportPath = join(runDir, 'compare-compare.json')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(source, 'source bytes')
  writeFileSync(comparedCandidate, 'compared candidate bytes')
  writeFileSync(wrongCandidate, 'different staged bytes')
  writeFileSync(finalPptx, 'existing delivery bytes')
  writeFileSync(compare, 'compare png')
  writeJson(
    reportPath,
    contactDiffReport({ compare, sourcePptx: source, finalPptx: comparedCandidate }),
  )
  const gatePath = join(runDir, 'compare-compare-gate.json')
  writeJson(gatePath, { status: 'pass', stale: true })

  const result = runNodeStatus(
    [
      skillPath('scripts/cli/review/compare-gate.mjs'),
      '--run-dir',
      runDir,
      '--final-pptx',
      finalPptx,
      '--final-pptx-source',
      wrongCandidate,
      '--kind',
      'compare',
      '--publish',
      '--overwrite',
      '--timestamp',
      '0711230002',
      '--json',
    ],
    2,
  )
  const gate = JSON.parse(result.stdout)

  assert.equal(gate.status, 'fail')
  assert.equal(gate.finalBinding.status, 'mismatch')
  assert.match(gate.blockers.join('\n'), /staged final PPTX SHA-256/i)
  assert.equal(readFileSync(finalPptx, 'utf8'), 'existing delivery bytes')
  assert.equal(gate.agentSummary.siblingPaths.length, 1)
  assert.equal(existsSync(gate.agentSummary.siblingPaths[0]), false)
  assert.equal(JSON.parse(readFileSync(gatePath, 'utf8')).status, 'fail')
})

test('compare gate rejects a candidate overwritten after compare evidence was created', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-stale-candidate-'))
  const runDir = join(root, 'run')
  const source = join(root, 'source.pptx')
  const candidate = join(runDir, 'candidate.pptx')
  const finalPptx = join(root, 'delivery.pptx')
  const compare = join(runDir, 'compare-compare.png')
  const reportPath = join(runDir, 'compare-compare.json')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(source, 'source bytes')
  writeFileSync(candidate, 'compared bytes')
  writeFileSync(finalPptx, 'existing delivery')
  writeFileSync(compare, 'compare png')
  writeJson(reportPath, contactDiffReport({ compare, sourcePptx: source, finalPptx: candidate }))
  writeFileSync(candidate, 'overwritten after compare')

  const result = runNodeStatus(
    [
      skillPath('scripts/cli/review/compare-gate.mjs'),
      '--run-dir',
      runDir,
      '--final-pptx',
      finalPptx,
      '--final-pptx-source',
      candidate,
      '--kind',
      'compare',
      '--publish',
      '--overwrite',
      '--timestamp',
      '0711230003',
      '--json',
    ],
    2,
  )
  const gate = JSON.parse(result.stdout)

  assert.equal(gate.status, 'fail')
  assert.match(gate.blockers.join('\n'), /compare candidate (byteLength|SHA-256)/i)
  assert.equal(readFileSync(finalPptx, 'utf8'), 'existing delivery')
})

test('compare gate rejects a multipart part report with a different input identity', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-multipart-identity-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const finalPptx = join(root, 'final.pptx')
  const runDir = join(root, 'run')
  const fakeXdoc = writeMultipartContactDiffXdoc(root)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  runNode([
    skillPath('scripts/cli/review/compare.mjs'),
    '--source',
    source,
    '--candidate',
    candidate,
    '--run-dir',
    runDir,
    '--kind',
    'refurbish',
    '--slide-count',
    '48',
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])

  const manifest = JSON.parse(readFileSync(join(runDir, 'refurbish-compare.json'), 'utf8'))
  const partReportPath = manifest.parts[1].reportPath
  const partReport = JSON.parse(readFileSync(partReportPath, 'utf8'))
  partReport.target.sha256 = '0'.repeat(64)
  writeJson(partReportPath, partReport)

  const result = runNodeStatus(
    [
      skillPath('scripts/cli/review/compare-gate.mjs'),
      '--run-dir',
      runDir,
      '--final-pptx',
      finalPptx,
      '--final-pptx-source',
      candidate,
      '--kind',
      'refurbish',
      '--publish',
      '--overwrite',
      '--timestamp',
      '0711230005',
      '--json',
    ],
    2,
  )
  const gate = JSON.parse(result.stdout)

  assert.equal(gate.status, 'fail')
  assert.match(gate.blockers.join('\n'), /part 2 candidate identity/i)
  assert.equal(existsSync(finalPptx), false)
  assert.equal(
    gate.agentSummary.siblingPaths.every((path) => !existsSync(path)),
    true,
  )
})

test('compare gate fails closed for a legacy multipart manifest without identities', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-compare-gate-legacy-manifest-'))
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  const finalPptx = join(root, 'final.pptx')
  const runDir = join(root, 'run')
  const fakeXdoc = writeMultipartContactDiffXdoc(root)
  writeFileSync(source, 'source pptx')
  writeFileSync(candidate, 'candidate pptx')
  writeFileSync(finalPptx, 'existing delivery')
  runNode([
    skillPath('scripts/cli/review/compare.mjs'),
    '--source',
    source,
    '--candidate',
    candidate,
    '--run-dir',
    runDir,
    '--kind',
    'refurbish',
    '--slide-count',
    '48',
    '--xdoc-bin',
    fakeXdoc,
    '--json',
  ])
  const manifestPath = join(runDir, 'refurbish-compare.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  delete manifest.source
  delete manifest.candidate
  writeJson(manifestPath, manifest)

  const result = runNodeStatus(
    [
      skillPath('scripts/cli/review/compare-gate.mjs'),
      '--run-dir',
      runDir,
      '--final-pptx',
      finalPptx,
      '--final-pptx-source',
      candidate,
      '--kind',
      'refurbish',
      '--publish',
      '--overwrite',
      '--timestamp',
      '0711230010',
      '--json',
    ],
    2,
  )
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'fail')
  assert.equal(report.finalBinding.status, 'mismatch')
  assert.ok(report.blockers.some((blocker) => /compare source path is missing/i.test(blocker)))
  assert.ok(
    report.blockers.some((blocker) => /compare candidate SHA-256 is missing/i.test(blocker)),
  )
  assert.equal(readFileSync(finalPptx, 'utf8'), 'existing delivery')
  assert.equal(
    report.agentSummary.siblingPaths.every((path) => !existsSync(path)),
    true,
  )
})

test('compare gate fails closed when the published final PPTX is missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-compare-gate-missing-final-'))
  const fixture = writeCompareGateFixture(root, (context) => contactDiffReport(context))
  rmSync(fixture.finalPptx)

  const report = runCompareGateFixture(fixture)

  assert.equal(report.status, 'fail')
  assert.equal(report.finalBinding.status, 'pending')
  assert.ok(report.blockers.some((blocker) => /final PPTX is missing/i.test(blocker)))
})

test('compare gate blocks contact-diff reports without explicit all-slides scopeMode', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-compare-gate-missing-scope-'))
  const fixture = writeCompareGateFixture(root, (context) => ({
    ...contactDiffReport({ ...context, scopeMode: undefined }),
    scope: { requested: '3' },
  }))

  const report = runCompareGateFixture(fixture)

  assert.equal(report.status, 'fail')
  assert.ok(
    report.blockers.includes(
      'contact-diff scopeMode is missing; final delivery requires all-slides contact-diff',
    ),
    report.blockers.join('\n'),
  )
})

test('compare gate blocks contact-diff reports whose output path differs from checked PNG', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-compare-gate-path-mismatch-'))
  const fixture = writeCompareGateFixture(root, (context) =>
    contactDiffReport({ ...context, outputPath: join(context.runDir, 'old-compare.png') }),
  )

  const report = runCompareGateFixture(fixture)

  assert.equal(report.status, 'fail')
  assert.ok(
    report.blockers.some((blocker) =>
      blocker.includes('contact-diff output differs from checked compare path:'),
    ),
    report.blockers.join('\n'),
  )
})

test('compare gate blocks contact-diff reports whose render path differs from checked PNG', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-compare-gate-render-path-mismatch-'))
  const fixture = writeCompareGateFixture(root, (context) => {
    const report = contactDiffReport(context)
    report.render.path = join(context.runDir, 'old-render.png')
    return report
  })

  const report = runCompareGateFixture(fixture)

  assert.equal(report.status, 'fail')
  assert.ok(
    report.blockers.some((blocker) =>
      blocker.includes('contact-diff output differs from checked compare path:'),
    ),
    report.blockers.join('\n'),
  )
})

test('compare gate blocks contact-diff reports without a reported output path', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-compare-gate-missing-path-'))
  const fixture = writeCompareGateFixture(root, (context) => {
    const report = contactDiffReport(context)
    delete report.outputPath
    delete report.render.path
    return report
  })

  const report = runCompareGateFixture(fixture)

  assert.equal(report.status, 'fail')
  assert.ok(
    report.blockers.includes('contact-diff output path is missing'),
    report.blockers.join('\n'),
  )
})
