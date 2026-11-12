import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { writeFakeXdoc } from '../helpers/fake-xdoc.mjs'
import {
  captureVisualBinding,
  fileSha256,
  REVIEW_CHECKS,
} from '../../../pptx-nova/scripts/lib/review/canonical-visual-evidence.mjs'
import { recordTranslationEvidence } from '../../../pptx-nova/scripts/lib/translation/visual-acceptance.mjs'

// Exercise the public consumer: a translation must not need user permission
// merely because its fully reviewed text differs from the reference pixels.
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'translation-visual-'))
  const write = (name, value) => {
    const path = join(root, name)
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
    return path
  }
  const files = {
    source: write('source.pptx', 'original'),
    candidate: write('candidate.pptx', 'translated'),
    units: write('units.json', { schemaVersion: 'pptx-i18n-scan/v1', i18nUnits: { units: [] } }),
    translations: write('translations.json', {
      schemaVersion: 'pptx-i18n-translations/v1',
      translations: [],
    }),
    styleDiff: write('style.json', {
      schemaVersion: 'pptx-i18n-style-diff/v1',
      status: 'pass',
      agentGate: { passed: true },
      blockers: [],
      styleBlockers: [],
    }),
    candidateScan: write('scan.json', {
      schemaVersion: 'pptx-i18n-candidate-result/v1',
      status: 'pass',
      agentGate: { passed: true, blockerCount: 0 },
    }),
    visionDiff: write('vision.json', {
      schemaVersion: 'pptx-vision-diff/v1',
      status: 'success',
      agentGate: { passed: true, scopeMode: 'full-deck' },
      newIssues: [],
      worsenedIssues: [],
    }),
    renderContext: write('render-context.json', {
      schemaVersion: 'xdoc-render-context/v1',
      fieldDate: '2026-11-12',
    }),
  }
  const manifest = {
    schemaVersion: 'pptx-visual-evidence/v1',
    status: 'success',
    policyId: 'pptx-visual-oracle-default/v1',
    renderContext: {
      schemaVersion: 'xdoc-render-context/v1',
      fieldDate: '2026-11-12',
      authorizationClock: 'independent',
      bitmapCacheBinding: 'pdf-sha256',
    },
    subjects: ['reference', 'candidate'].map((id) => ({
      id,
      sha256: fileSha256(files[id === 'reference' ? 'source' : 'candidate']),
      byteLength: readFileSync(files[id === 'reference' ? 'source' : 'candidate']).length,
      slideCount: 1,
      selectedSlides: [1],
    })),
    artifacts: ['reference', 'candidate'].flatMap((subjectId) =>
      [
        ['png', 'image/png', 1],
        ['pdf', 'application/pdf', null],
      ].map(([ext, mimeType, slide]) => {
        const name = `${subjectId}.${ext}`,
          path = write(name, name)
        return {
          id: name,
          path: name,
          mimeType,
          slide,
          subjectId,
          sha256: fileSha256(path),
          byteLength: readFileSync(path).length,
        }
      }),
    ),
    checks: [
      'input-integrity',
      'static-layout',
      'pdf-final-layout',
      'pdfium-raster',
      'pixel-diff',
      'ocr-overflow',
      'font-resolution',
      'region-attribution',
      'independent-reference',
      'policy',
    ].map((id, i) => ({
      id,
      required: i < 5 || id === 'policy',
      outcome: ['pixel-diff', 'policy'].includes(id) ? 'inconclusive' : i < 4 ? 'pass' : 'skipped',
    })),
    findings: [
      {
        checkId: 'pixel-diff',
        kind: 'raster-content-changed',
        severity: 'review',
        subjectId: 'candidate',
        slide: 1,
      },
    ],
    decision: {
      action: 'require-human-confirmation',
      assurance: 'same-renderer-change-detected',
      reasons: [],
    },
  }
  const manifestPath = join(root, 'manifest.json')
  const evidencePath = join(root, 'translation-evidence.json')
  const reviewPath = join(root, 'review.json')
  const save = () => {
    writeFileSync(manifestPath, JSON.stringify(manifest))
    writeFileSync(
      evidencePath,
      JSON.stringify({
        schemaVersion: 'pptx-nova-translation-evidence/v1',
        files: Object.fromEntries(
          Object.entries(files).map(([k, path]) => [k, { path, sha256: fileSha256(path) }]),
        ),
      }),
    )
    writeFileSync(
      reviewPath,
      JSON.stringify({
        schemaVersion: 'pptx-nova-visual-review/v1',
        mode: 'translation',
        status: 'pass',
        reviewer: 'agent',
        binding: captureVisualBinding(manifestPath, files.candidate),
        summary: { slidesReviewed: 1 },
        checks: REVIEW_CHECKS.map((name) => ({ name, status: 'pass' })),
        issues: [],
        errors: [],
        warnings: [],
      }),
    )
  }
  save()
  const run = ({ review = true, translation = true, evidence = evidencePath } = {}) => {
    const result = spawnSync(
      process.execPath,
      [
        'pptx-nova/scripts/cli/review/visual-evidence-gate.mjs',
        '--manifest',
        manifestPath,
        '--candidate',
        files.candidate,
        ...(translation ? ['--translation-evidence', evidence] : []),
        ...(review ? ['--review', reviewPath] : []),
        '--json',
      ],
      { encoding: 'utf8' },
    )
    assert.ok(result.stdout, result.stderr)
    return { exit: result.status, report: JSON.parse(result.stdout) }
  }
  return { root, files, manifest, manifestPath, evidencePath, reviewPath, save, run, write }
}

function runFinalizer(
  f,
  mutateAfterCompare = '',
  { failCommand = '', failPublication = false, withReview = true } = {},
) {
  const runDir = join(f.root, 'finalize')
  const output = join(f.root, 'translated.pptx')
  const fake = writeFakeXdoc(
    f.root,
    `#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
if (args[1] === process.env.FAKE_FAIL_COMMAND) process.exit(9)
const after = flag => args[args.indexOf(flag) + 1]
const print = value => process.stdout.write(JSON.stringify(value))
const identity = path => {
  const bytes = readFileSync(path)
  return { path, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
const reports = ${JSON.stringify({
      inspect: { status: 'success', presentation: { slideCount: 1 } },
      'i18n-style-diff': JSON.parse(readFileSync(f.files.styleDiff)),
      'i18n-scan': JSON.parse(readFileSync(f.files.candidateScan)),
      'vision-diff': JSON.parse(readFileSync(f.files.visionDiff)),
    })}
if (reports[args[1]]) print(reports[args[1]])
else if (args[0] === 'pptx' && args[1] === 'preview') {
  const dir = after('--output-dir'), contact = after('--contact-output')
  mkdirSync(dir, { recursive: true })
  const page = dir + '/slide-001.png'
  writeFileSync(page, 'png')
  writeFileSync(contact, 'contact')
  print({ schemaVersion: 'pptx-preview/v1', status: 'success',
    pages: [{ path: page, byteLength: 3, width: 100, height: 56 }],
    contactSheet: { path: contact, byteLength: 7, width: 100, height: 56 } })
} else if (args[0] === 'pptx' && args[1] === 'diff') {
  print({ schemaVersion: 'pptx-diff/v1', status: 'success', agentGate: { semanticStatus: 'pass' } })
} else if (args[0] === 'pptx' && args[1] === 'contact-diff') {
  const output = after('--output'), dpi = Number(after('--dpi'))
  const scopeMode = args.includes('--slides') ? 'selected-slides' : 'all-slides'
  writeFileSync(output, 'comparison')
  if (process.env.FAKE_BLOCK_OUTPUT) mkdirSync(process.env.FAKE_BLOCK_OUTPUT)
  const changed = process.env.FAKE_MUTATE_AFTER_COMPARE
  if (changed) writeFileSync(changed, readFileSync(changed, 'utf8') + ' ')
  print({ schemaVersion: 'pptx-contact-diff/v1', status: 'success',
    baseline: identity(after('--source')), target: identity(after('--candidate')),
    baselinePath: after('--source'), targetPath: after('--candidate'), outputPath: output,
    summary: { baselineSlideCount: 1, targetSlideCount: 1, pairCount: 1, scopeMode, dpi },
    scope: { requested: args.includes('--slides') ? after('--slides') : null, slides: [1], basis: 'baseline-slides' },
    agentGate: { passed: true, status: 'pass', scopeMode, pairCount: 1 },
    render: { path: output, width: 100, height: 56, dpi } })
} else process.exit(9)
`,
  )
  const result = spawnSync(
    process.execPath,
    [
      'pptx-nova/scripts/cli/translation/run.mjs',
      '--source',
      f.files.source,
      '--candidate',
      f.files.candidate,
      '--units-file',
      f.files.units,
      '--translations',
      f.files.translations,
      ...(withReview ? ['--visual-manifest', f.manifestPath, '--visual-review', f.reviewPath] : []),
      '--run-dir',
      runDir,
      '--output',
      output,
      '--xdoc-bin',
      fake,
      '--json',
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        XDOC_FIELD_DATE: '2026-11-12',
        FAKE_MUTATE_AFTER_COMPARE: mutateAfterCompare,
        FAKE_FAIL_COMMAND: failCommand,
        FAKE_BLOCK_OUTPUT: failPublication ? output : '',
      },
    },
  )
  assert.ok(result.stdout, result.stderr)
  return {
    exit: result.status,
    compact: JSON.parse(result.stdout),
    summary: JSON.parse(readFileSync(join(runDir, 'translation-run-summary.json'))),
    runDir,
    output,
  }
}

test('independent translation delivery rejects evidence from an incomplete finalizer', () => {
  for (const options of [
    { failCommand: 'preview' },
    { failCommand: 'diff' },
    { failCommand: 'contact-diff' },
    { failPublication: true },
  ]) {
    const f = fixture()
    const r = runFinalizer(f, '', options)
    assert.equal(r.exit, 1)
    assert.equal(r.compact.machineGatesPassed, false)
    assert.equal(existsSync(r.output) && statSync(r.output).isFile(), false)
    const record = JSON.parse(readFileSync(join(r.runDir, 'translation-evidence.json')))
    assert.equal(record.completion, undefined)
    const gate = f.run({ evidence: join(r.runDir, 'translation-evidence.json') })
    assert.equal(gate.exit, 7, `${JSON.stringify(options)} failure must not authorize delivery`)
    assert.equal(gate.report.deliveryAuthorized, false)
    assert.equal(gate.report.machineChecksPassed, false)
  }
})

test('a reviewed translation authorizes delivery only after machine workflow and publication complete', () => {
  const f = fixture()
  const r = runFinalizer(f)
  assert.equal(r.exit, 0, JSON.stringify(r.compact))
  assert.equal(r.compact.status, 'completed')
  assert.equal(r.compact.deliveryReady, true)
  assert.equal(r.compact.machineGatesPassed, true)
  assert.equal(r.compact.needsVisualReview, false)
  assert.equal(r.compact.needsHumanReview, false)
  assert.equal(r.compact.agentSummary.decision, 'deliver')
  assert.deepEqual(readFileSync(r.output), readFileSync(f.files.candidate))
  for (const name of [
    'translation-visual-acceptance',
    'translation-preview',
    'pptx-semantic-diff',
    'translation-compare-artifact',
    'translation-publication-acceptance',
    'translation-compare-delivery',
    'translation-delivery-acceptance',
  ])
    assert.equal(r.summary.gates.find((g) => g.name === name)?.passed, true, name)
  const acceptance = JSON.parse(readFileSync(r.summary.artifacts.visualAcceptance))
  assert.equal(acceptance.deliveryAuthorized, true)
  assert.deepEqual(acceptance.decision, f.manifest.decision)
  const compare = JSON.parse(readFileSync(r.summary.artifacts.compareGate))
  assert.equal(compare.finalBinding.publishedFinal.sha256, fileSha256(r.output))
  assert.ok(compare.agentSummary.siblingPaths.every((path) => existsSync(path)))
  const gate = f.run({ evidence: r.summary.artifacts.translationEvidence })
  assert.equal(gate.exit, 0, JSON.stringify(gate.report))
  assert.equal(gate.report.deliveryAuthorized, true)
  assert.equal(gate.report.machineChecksPassed, true)
})

test('a completed machine-only run accepts later bound Agent review without rendering again', () => {
  const f = fixture()
  const r = runFinalizer(f, '', { withReview: false })
  assert.equal(r.exit, 0, JSON.stringify(r.compact))
  assert.equal(r.compact.status, 'needs-visual-review')
  assert.equal(r.compact.deliveryReady, false)
  const evidence = join(r.runDir, 'translation-evidence.json')
  assert.ok(JSON.parse(readFileSync(evidence)).completion)
  const missing = f.run({ evidence, review: false })
  assert.equal(missing.exit, 6)
  assert.equal(missing.report.machineChecksPassed, true)
  assert.equal(missing.report.deliveryAuthorized, false)
  const reviewed = f.run({ evidence })
  assert.equal(reviewed.exit, 0, JSON.stringify(reviewed.report))
  assert.equal(reviewed.report.deliveryAuthorized, true)
  assert.equal(reviewed.report.requiresUserApproval, false)
})

test('independent delivery rejects changed machine reports, rendered images and published bytes', () => {
  const f = fixture()
  const r = runFinalizer(f)
  assert.equal(r.exit, 0, JSON.stringify(r.compact))
  const evidence = r.summary.artifacts.translationEvidence
  const record = JSON.parse(readFileSync(evidence))
  for (const { path } of Object.values(record.completion.files)) {
    const before = readFileSync(path)
    writeFileSync(path, Buffer.concat([before, Buffer.from(' ')]))
    const rejected = f.run({ evidence })
    assert.notEqual(rejected.exit, 0, path)
    assert.equal(rejected.report.deliveryAuthorized, false, path)
    writeFileSync(path, before)
  }
  assert.equal(f.run({ evidence }).exit, 0)
  const incomplete = { ...record }
  delete incomplete.completion
  writeFileSync(evidence, JSON.stringify(incomplete))
  assert.equal(f.run({ evidence }).exit, 7, 'legacy evidence needs fresh finalization')
  for (const completion of [
    { ...record.completion, gates: [] },
    { ...record.completion, files: {} },
  ]) {
    writeFileSync(evidence, JSON.stringify({ ...record, completion }))
    const rejected = f.run({ evidence })
    assert.equal(rejected.exit, 3)
    assert.equal(rejected.report.deliveryAuthorized, false)
  }
  writeFileSync(evidence, JSON.stringify(record))
  assert.equal(f.run({ evidence }).exit, 0)
})

test('publication rechecks frozen translation reports and canonical PNGs after comparison', () => {
  for (const changedFile of ['i18n-style-diff.json', 'candidate.png']) {
    const f = fixture()
    const path = changedFile.endsWith('.json')
      ? join(f.root, 'finalize', changedFile)
      : join(f.root, changedFile)
    const r = runFinalizer(f, path)
    assert.equal(r.exit, 1, JSON.stringify(r.compact))
    assert.equal(r.compact.error.phase, 'translation-publication-acceptance')
    assert.equal(r.compact.deliveryReady, false)
    assert.equal(
      r.summary.gates.find((g) => g.name === 'translation-visual-acceptance')?.passed,
      true,
    )
    assert.equal(
      r.summary.gates.find((g) => g.name === 'translation-compare-artifact')?.passed,
      true,
    )
    assert.equal(existsSync(r.summary.artifacts.compare), true, 'the mutation follows comparison')
    assert.equal(existsSync(r.output), false)
    const acceptance = JSON.parse(readFileSync(r.summary.artifacts.visualAcceptance))
    assert.equal(acceptance.deliveryAuthorized, false)
    assert.match(acceptance.errors.join(';'), /stale/)
  }
})

test('reviewed pixels without machine completion cannot authorize translation delivery', () => {
  const f = fixture(),
    { exit, report } = f.run()
  assert.equal(exit, 7)
  assert.equal(report.deliveryAuthorized, false)
  assert.equal(report.machineChecksPassed, false)
  assert.equal(report.visualReviewPassed, true)
  assert.equal(report.requiresUserApproval, false)
  assert.deepEqual(report.decision, f.manifest.decision, 'retain the original machine verdict')
  assert.equal(report.acceptance.policyId, 'pptx-nova-translation-acceptance/v1')
  assert.equal(f.run({ translation: false }).exit, 5, 'generic regression behavior stays unchanged')
})

test('missing translation review needs Agent review rather than user permission', () => {
  const f = fixture(),
    { exit, report } = f.run({ review: false })
  assert.equal(exit, 6)
  assert.equal(report.status, 'needs-visual-review')
  assert.equal(report.requiresUserApproval, false)
  assert.equal(report.deliveryAuthorized, false)
})

test('translation cannot override real content blockers or environment-dependent decisions', () => {
  for (const [action, assurance, check, expected] of [
    ['stop', 'content-blocked', 'pdf-final-layout', 4],
    ['require-human-confirmation', 'environment-dependent', 'font-resolution', 5],
  ]) {
    const f = fixture()
    f.manifest.decision = { action, assurance, reasons: [] }
    f.manifest.checks.find((c) => c.id === check).outcome = 'fail'
    f.manifest.checks.find((c) => c.id === 'policy').outcome =
      action === 'stop' ? 'fail' : 'inconclusive'
    f.save()
    const r = f.run()
    assert.equal(r.exit, expected)
    assert.equal(r.report.deliveryAuthorized, false)
  }
})

test('translation acceptance rejects stale files, failed checks, different source, scope and unreviewed findings', () => {
  for (const mutate of [
    (f) => writeFileSync(f.files.candidate, 'changed candidate'),
    (f) => writeFileSync(join(f.root, 'candidate.png'), 'changed PNG'),
    (f) => writeFileSync(f.files.translations, '{}'),
    (f) => {
      f.write('style.json', {
        schemaVersion: 'pptx-i18n-style-diff/v1',
        status: 'fail',
        agentGate: { passed: false },
      })
      f.save()
    },
    (f) => {
      f.write('scan.json', {
        schemaVersion: 'pptx-i18n-candidate-result/v1',
        status: 'pass',
        agentGate: { passed: false },
      })
      f.save()
    },
    (f) => {
      f.manifest.subjects[0].sha256 = '0'.repeat(64)
      f.save()
    },
    (f) => {
      f.manifest.subjects[0].slideCount = 2
      f.save()
    },
    (f) => {
      f.manifest.artifacts = f.manifest.artifacts.filter((a) => a.id !== 'reference.png')
      f.save()
    },
    (f) => {
      f.manifest.subjects.forEach((s) => (s.slideCount = 2))
      f.save()
    },
    (f) => {
      f.manifest.findings.push({
        checkId: 'pdf-final-layout',
        kind: 'rendered-text-frame-overflow',
        severity: 'medium',
      })
      f.save()
    },
    (f) => {
      f.manifest.findings.push({
        checkId: 'pixel-diff',
        kind: 'unknown-new-finding',
        severity: 'review',
      })
      f.save()
    },
    (f) => {
      delete f.manifest.findings
      f.save()
    },
    (f) => {
      f.write('render-context.json', {
        schemaVersion: 'xdoc-render-context/v1',
        fieldDate: '2026-11-13',
      })
      f.save()
    },
    (f) => {
      const r = JSON.parse(readFileSync(f.reviewPath))
      r.checks.pop()
      writeFileSync(f.reviewPath, JSON.stringify(r))
    },
  ]) {
    const f = fixture()
    mutate(f)
    const r = f.run()
    assert.notEqual(r.exit, 0)
    assert.equal(r.report.deliveryAuthorized, false)
  }
})

test('reviewed low static estimates do not become a user approval request', () => {
  const f = fixture()
  f.manifest.checks.find((c) => c.id === 'static-layout').outcome = 'fail'
  f.manifest.findings.push({
    checkId: 'static-layout',
    kind: 'text-unexpected-wrap',
    severity: 'low',
  })
  f.save()
  const accepted = f.run()
  assert.equal(accepted.exit, 7, JSON.stringify(accepted.report))
  assert.equal(accepted.report.visualReviewPassed, true)
})

test('rendered-disproved medium/high static estimates retain their facts without blocking translation acceptance', () => {
  for (const severity of ['medium', 'high']) {
    for (const proceed of [false, true]) {
      const f = fixture()
      const finding = {
        checkId: 'static-layout',
        kind: 'text-overflow',
        severity,
        disposition: 'contradicted-by-rendered-layout',
      }
      f.manifest.findings.push(finding)
      if (proceed) {
        f.manifest.decision = {
          action: 'proceed',
          assurance: 'same-renderer-regression',
          reasons: [],
        }
        f.manifest.checks
          .filter((c) => c.required)
          .forEach((c) => {
            c.outcome = 'pass'
          })
        f.manifest.findings = [finding]
      } else {
        f.manifest.checks.find((c) => c.id === 'static-layout').outcome = 'fail'
      }
      f.save()
      const accepted = f.run()
      assert.equal(accepted.exit, 7, JSON.stringify(accepted.report))
      assert.equal(accepted.report.visualReviewPassed, true)
      assert.equal(
        f.run({ review: false }).exit,
        6,
        'resolved estimates still require Agent review',
      )
      const retained = JSON.parse(readFileSync(f.manifestPath)).findings
      assert.equal(retained.find((v) => v.kind === finding.kind).severity, severity)

      // The static arbitration is not a general-purpose waiver for other checks.
      finding.checkId = 'pdf-final-layout'
      f.save()
      assert.equal(f.run().exit, 3)
    }
  }
})

test('a contradicted static finding cannot override a canonical content stop', () => {
  const f = fixture()
  f.manifest.findings.push({
    checkId: 'static-layout',
    kind: 'text-overflow',
    severity: 'high',
    disposition: 'contradicted-by-rendered-layout',
  })
  f.manifest.decision = { action: 'stop', assurance: 'content-blocked', reasons: [] }
  f.manifest.checks.find((c) => c.id === 'pdf-final-layout').outcome = 'fail'
  f.manifest.checks.find((c) => c.id === 'policy').outcome = 'fail'
  f.save()
  const result = f.run()
  assert.equal(result.exit, 4)
  assert.equal(result.report.deliveryAuthorized, false)
})

test('the finalizer consumes translation review before publishing or rendering the compare bundle', () => {
  for (const stopped of [false, true]) {
    const f = fixture()
    if (stopped) {
      f.manifest.decision = { action: 'stop', assurance: 'content-blocked', reasons: [] }
      f.manifest.checks.find((c) => c.id === 'pdf-final-layout').outcome = 'fail'
      f.manifest.checks.find((c) => c.id === 'policy').outcome = 'fail'
      f.save()
    }
    const fake = writeFakeXdoc(
      f.root,
      `#!/usr/bin/env node
const args = process.argv.slice(2)
const reports = ${JSON.stringify({
        inspect: { status: 'success', presentation: { slideCount: 1 } },
        'i18n-style-diff': JSON.parse(readFileSync(f.files.styleDiff)),
        'i18n-scan': JSON.parse(readFileSync(f.files.candidateScan)),
        'vision-diff': JSON.parse(readFileSync(f.files.visionDiff)),
      })}
if (reports[args[1]]) process.stdout.write(JSON.stringify(reports[args[1]]))
else process.exit(9)
`,
    )
    const runDir = join(f.root, 'run'),
      output = join(f.root, 'out.pptx')
    const r = spawnSync(
      process.execPath,
      [
        'pptx-nova/scripts/cli/translation/run.mjs',
        '--source',
        f.files.source,
        '--candidate',
        f.files.candidate,
        '--units-file',
        f.files.units,
        '--translations',
        f.files.translations,
        '--visual-manifest',
        f.manifestPath,
        '--visual-review',
        f.reviewPath,
        '--run-dir',
        runDir,
        '--output',
        output,
        '--xdoc-bin',
        fake,
        '--json',
      ],
      { encoding: 'utf8', env: { ...process.env, XDOC_FIELD_DATE: '2026-11-12' } },
    )
    assert.equal(r.status, 1, r.stderr)
    const summary = JSON.parse(r.stdout)
    assert.equal(summary.error.phase, stopped ? 'translation-visual-acceptance' : 'preview-render')
    const acceptance = JSON.parse(readFileSync(join(runDir, 'translation-visual-acceptance.json')))
    assert.equal(acceptance.deliveryAuthorized, false)
    assert.equal(acceptance.visualReviewPassed === true, !stopped)
    assert.equal(existsSync(output), false, 'a canonical content stop must block publication')
  }
})

test('translation retains the bound multi-column exception and rejects its stale page evidence', () => {
  const f = fixture()
  const finding = {
    kind: 'multi-column-text-layout-review',
    evidenceClass: 'review-only',
    severity: 'medium',
    slideIndex: 0,
    shapeId: 9,
  }
  const vision = JSON.parse(readFileSync(f.files.visionDiff))
  vision.candidate = f.files.candidate
  vision.newIssues = [finding]
  Object.assign(vision.agentGate, {
    passed: false,
    blockerCount: 1,
    blockersByEvidenceClass: { 'review-only': 1 },
  })
  f.write('vision.json', vision)
  const png = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12, 'ascii')
  png.writeUInt32BE(100, 16)
  png.writeUInt32BE(56, 20)
  const page = join(f.root, 'columns.png')
  writeFileSync(page, png)
  const review = f.write('column-review.json', {
    schemaVersion: 'pptx-nova-multi-column-review/v1',
    candidate: { path: f.files.candidate, sha256: 'sha256:' + fileSha256(f.files.candidate) },
    visionDiff: { path: f.files.visionDiff, sha256: 'sha256:' + fileSha256(f.files.visionDiff) },
    reviews: [
      {
        slideIndex: 0,
        shapeId: 9,
        reviewer: 'agent',
        decision: 'pass',
        note: 'Both columns fit and preserve reading order.',
        png: { path: page, sha256: 'sha256:' + fileSha256(page), width: 100, height: 56 },
        checks: {
          noClipping: true,
          columnFlowReadable: true,
          noOverlap: true,
          marginsAcceptable: true,
        },
      },
    ],
  })
  f.manifest.findings.push({ ...finding, checkId: 'static-layout' })
  f.save()
  const gate = f.write('columns-gate.json', {
    candidate: f.files.candidate,
    visionDiff: f.files.visionDiff,
    review,
  })
  writeFileSync(
    f.evidencePath,
    JSON.stringify(recordTranslationEvidence({ ...f.files, multiColumnReviewGate: gate })),
  )
  const accepted = f.run()
  assert.equal(accepted.exit, 7, JSON.stringify(accepted.report))
  assert.equal(accepted.report.visualReviewPassed, true)
  writeFileSync(page, 'stale page')
  assert.notEqual(f.run().exit, 0)
})
