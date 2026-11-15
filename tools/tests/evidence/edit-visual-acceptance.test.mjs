import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { contentTypes, storedZip } from '../helpers/pptx-package.mjs'
import {
  captureVisualBinding,
  fileSha256,
  REVIEW_CHECKS,
} from '../../../pptx-nova/scripts/lib/review/canonical-visual-evidence.mjs'

async function evaluate(fixture) {
  const { acceptScopedEditVisuals } =
    await import('../../../pptx-nova/scripts/lib/edit/visual-acceptance.mjs')
  return acceptScopedEditVisuals(fixture)
}

function fixture(mutateParts = () => {}) {
  const root = mkdtempSync(join(tmpdir(), 'nova-edit-visual-'))
  const write = (name, value) => {
    const path = join(root, name)
    writeFileSync(
      path,
      typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value),
    )
    return path
  }
  const p = 'http://schemas.openxmlformats.org/presentationml/2006/main'
  const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  // Presentation order deliberately differs from slide filenames.
  const parts = [
    [
      '[Content_Types].xml',
      contentTypes(
        ['first', 'chosen', 'last'].map((name) => [
          `ppt/slides/${name}.xml`,
          'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
        ]),
      ),
    ],
    [
      'ppt/presentation.xml',
      `<p:presentation xmlns:p="${p}" xmlns:r="${r}"><p:sldIdLst>${[1, 2, 3].map((i) => `<p:sldId id="${255 + i}" r:id="r${i}"/>`).join('')}</p:sldIdLst></p:presentation>`,
    ],
    [
      'ppt/_rels/presentation.xml.rels',
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${['first', 'chosen', 'last'].map((name, i) => `<Relationship Id="r${i + 1}" Type="${r}/slide" Target="slides/${name}.xml"/>`).join('')}</Relationships>`,
    ],
    ...['first', 'chosen', 'last'].map((name) => [
      `ppt/slides/${name}.xml`,
      `<p:sld xmlns:p="${p}"><p:cSld name="${name}"/></p:sld>`,
    ]),
    ['ppt/charts/chart1.xml', '<chart>Original data</chart>'],
  ]
  const edited = parts.map(([name, value]) => [
    name,
    name.endsWith('/chosen.xml') ? value.replace('chosen', 'Edited') : value,
  ])
  mutateParts(edited)
  const source = write('source.pptx', storedZip(parts)),
    candidate = write('candidate.pptx', storedZip(edited))
  const identity = (pptx) => ({
    pptx,
    sha256: fileSha256(pptx),
    byteLength: readFileSync(pptx).length,
  })
  const contract = write('contract.json', {
    schemaVersion: 'pptx-nova-edit-contract/v1',
    scope: 'single-slide',
    operationKind: 'style-edit',
    source: identity(source),
    targets: [{ id: 'title', slide: 1 }],
    requiredEvidence: ['dry-run', 'semantic-diff', 'png-preview', 'vision-diff', 'final-inspect'],
  })
  const manifestValue = {
    schemaVersion: 'pptx-visual-evidence/v1',
    policyId: 'pptx-visual-oracle-default/v1',
    status: 'success',
    subjects: [
      ['reference', source],
      ['candidate', candidate],
    ].map(([id, path]) => ({
      id,
      sha256: fileSha256(path),
      byteLength: readFileSync(path).length,
      slideCount: 3,
      selectedSlides: [2],
    })),
    artifacts: ['reference', 'candidate'].flatMap((subjectId) =>
      ['png', 'pdf'].map((ext) => {
        const path = write(`${subjectId}.${ext}`, `${subjectId} fixture ${ext}`)
        return {
          id: `${subjectId}-${ext}`,
          path: `${subjectId}.${ext}`,
          subjectId,
          mimeType: ext === 'png' ? 'image/png' : 'application/pdf',
          slide: ext === 'png' ? 2 : null,
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
      outcome: i < 4 ? 'pass' : id === 'pixel-diff' || id === 'policy' ? 'inconclusive' : 'skipped',
    })),
    findings: [{ checkId: 'pixel-diff', kind: 'raster-content-changed', severity: 'review' }],
    decision: {
      action: 'require-human-confirmation',
      assurance: 'same-renderer-change-detected',
      reasons: ['Pixels changed'],
    },
  }
  const manifest = write('manifest.json', manifestValue)
  const binding = captureVisualBinding(manifest, candidate)
  const review = write('review.json', {
    schemaVersion: 'pptx-nova-visual-review/v1',
    mode: 'edit',
    status: 'pass',
    reviewer: 'agent',
    binding,
    summary: { slidesReviewed: 1 },
    checks: REVIEW_CHECKS.map((name) => ({ name, status: 'pass' })),
  })
  const gate = {
    schemaVersion: 'pptx-nova-edit-contract-gate/v1',
    status: 'pass',
    contract,
    source: identity(source),
    candidate: identity(candidate),
    summary: {
      targetCount: 1,
      coveredTargetCount: 1,
      outOfScopeReliableChangeCount: 0,
      blockerCount: 0,
    },
    blockers: [],
    agentGate: { passed: true, nextAction: 'publish', scope: '2' },
    checks: ['source-freshness', 'target-coverage', 'semantic-diff-locality'].map((name) => ({
      name,
      status: 'pass',
    })),
  }
  const inputBinding = {
    algorithm: 'sha256',
    baseline: fileSha256(source),
    target: fileSha256(candidate),
  }
  const summary = { slideAdded: 0, slideRemoved: 0, shapeAdded: 0, shapeRemoved: 0 }
  const full = write('diff-full.json', {
    schemaVersion: 'pptx-diff/v1',
    status: 'success',
    detail: 'full',
    inputBinding,
    summary,
    slides: [1, 2, 3].map((slide) => ({ slide, unsupported: [], shapeChanges: [] })),
  })
  gate.artifacts = {
    semanticDiff: write('diff.json', {
      inputBinding,
      summary,
      fullEvidenceAvailable: true,
      fullEvidence: { path: full, sha256: fileSha256(full) },
    }),
  }
  return { candidate, contract, manifest, review, gate, root, write }
}

test('reviewed intentional scoped edits preserve native oracle decision and accept only the bound contract', async () => {
  const f = fixture(),
    report = await evaluate(f)
  assert.equal(report.deliveryAuthorized, true)
  assert.equal(report.acceptance.policyId, 'pptx-nova-scoped-edit-acceptance/v1')
  assert.equal(report.decision.action, 'require-human-confirmation')
  assert.equal(report.decision.assurance, 'same-renderer-change-detected')
  assert.deepEqual(report.acceptance.slides, [2])
})

test('scoped acceptance rejects stale files, incomplete scope, failed checks and unresolved findings', async () => {
  const cases = [
    (f) => writeFileSync(f.candidate, 'stale candidate'),
    (f) => writeFileSync(JSON.parse(readFileSync(f.contract)).source.pptx, 'stale source'),
    (f) => {
      f.gate.status = 'fail'
    },
    (f) => {
      f.gate.summary.outOfScopeReliableChangeCount = 1
    },
    (f) => {
      f.gate.checks.pop()
    },
    (f) => {
      const c = JSON.parse(readFileSync(f.contract))
      c.requiredEvidence = ['dry-run']
      f.write('contract.json', c)
    },
    (f) => {
      const c = JSON.parse(readFileSync(f.contract))
      c.targets.push({ id: 'other', slide: 0 })
      f.write('contract.json', c)
    },
    (f) => {
      const m = JSON.parse(readFileSync(f.manifest))
      m.checks[2].outcome = 'fail'
      f.write('manifest.json', m)
    },
    (f) => {
      const m = JSON.parse(readFileSync(f.manifest))
      m.checks[4].outcome = 'fail'
      f.write('manifest.json', m)
    },
    (f) => {
      const m = JSON.parse(readFileSync(f.manifest))
      m.findings.push({
        checkId: 'static-layout',
        kind: 'unknown-defect',
        severity: 'high',
        disposition: 'contradicted-by-rendered-layout',
      })
      f.write('manifest.json', m)
    },
    (f) => {
      const m = JSON.parse(readFileSync(f.manifest))
      m.findings.push({ checkId: 'static-layout', kind: 'low-contrast-text', severity: 'low' })
      f.write('manifest.json', m)
    },
    (f) => {
      const r = JSON.parse(readFileSync(f.review))
      r.issues = [{ message: 'Still too small' }]
      f.write('review.json', r)
    },
  ]
  for (const change of cases) {
    const f = fixture()
    change(f)
    await assert.rejects(evaluate(f))
  }
})

test('structural edits and environment uncertainty keep their separate workflows', async () => {
  for (const change of [
    (f) => {
      const c = JSON.parse(readFileSync(f.contract))
      c.operationKind = 'structural-edit'
      f.write('contract.json', c)
    },
    (f) => {
      const m = JSON.parse(readFileSync(f.manifest))
      m.decision.assurance = 'environment-dependent'
      f.write('manifest.json', m)
    },
  ]) {
    const f = fixture()
    change(f)
    await assert.rejects(evaluate(f))
  }
})

test('normalized multi-slide scope is accepted and the nonexistent slide-range alias is rejected', async () => {
  const f = fixture(),
    edit = JSON.parse(readFileSync(f.contract))
  edit.scope = 'multi-slide'
  f.write('contract.json', edit)
  assert.equal((await evaluate(f)).deliveryAuthorized, true)
  edit.scope = 'slide-range'
  f.write('contract.json', edit)
  await assert.rejects(evaluate(f), /Contract/)
})

test('native full diff files need no compact-summary availability flag', async () => {
  const f = fixture(),
    summary = JSON.parse(readFileSync(f.gate.artifacts.semanticDiff))
  f.gate.artifacts.semanticDiff = summary.fullEvidence.path
  assert.equal((await evaluate(f)).deliveryAuthorized, true)
  const full = JSON.parse(readFileSync(summary.fullEvidence.path))
  delete full.slides
  f.write('diff-full.json', full)
  await assert.rejects(evaluate(f), /incomplete/)
})

test('actual structural object changes cannot hide behind a single-object scope', async () => {
  for (const key of ['shapeAdded', 'shapeRemoved', 'slideAdded', 'slideRemoved']) {
    const f = fixture(),
      summary = JSON.parse(readFileSync(f.gate.artifacts.semanticDiff))
    const full = JSON.parse(readFileSync(summary.fullEvidence.path))
    full.summary[key] = 1
    f.write('diff-full.json', full)
    f.gate.artifacts.semanticDiff = summary.fullEvidence.path
    await assert.rejects(evaluate(f), /added or removed/)
  }
})

test('uncompared content outside reviewed slide XML must retain exact package bytes', async () => {
  for (const mutate of [
    (parts) => {
      parts.find(([name]) => name.endsWith('/last.xml'))[1] += '<!-- hidden cell edit -->'
    },
    (parts) => {
      parts.find(([name]) => name.endsWith('/chart1.xml'))[1] = '<chart>Changed data</chart>'
    },
    (parts) => {
      parts.push(['ppt/notesSlides/notesSlide1.xml', '<notes>Added</notes>'])
    },
    (parts) => {
      parts.splice(
        parts.findIndex(([name]) => name.endsWith('/chart1.xml')),
        1,
      )
    },
    (parts) => {
      parts.push([...parts.find(([name]) => name.endsWith('/last.xml'))])
    },
  ]) {
    const f = fixture(mutate)
    await assert.rejects(evaluate(f), /part|ZIP/i)
  }
})

test('selected pages with unsupported semantic regions need a separate preservation review', async () => {
  const f = fixture()
  const compact = JSON.parse(readFileSync(f.gate.artifacts.semanticDiff))
  const full = JSON.parse(readFileSync(compact.fullEvidence.path))
  full.slides[1].unsupported.push({ category: 'table', reason: 'table-internals' })
  f.write('diff-full.json', full)
  f.gate.artifacts.semanticDiff = compact.fullEvidence.path
  await assert.rejects(evaluate(f), /unsupported|uncertain/i)
})

test('byte-identical unsupported parts on other slides do not expand the review scope', async () => {
  const f = fixture()
  const compact = JSON.parse(readFileSync(f.gate.artifacts.semanticDiff))
  const full = JSON.parse(readFileSync(compact.fullEvidence.path))
  full.slides[2].unsupported.push({ category: 'table', reason: 'table-internals' })
  f.write('diff-full.json', full)
  f.gate.artifacts.semanticDiff = compact.fullEvidence.path
  const report = await evaluate(f)
  assert.deepEqual(report.acceptance.preservation.reviewedParts, ['ppt/slides/chosen.xml'])
  assert.equal(report.acceptance.preservation.unchangedParts, 6)
})
