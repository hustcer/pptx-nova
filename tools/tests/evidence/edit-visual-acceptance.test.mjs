import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { contentTypes, storedZip } from '../helpers/pptx-package.mjs'
import { readPptxPackage } from '../../../pptx-nova/scripts/lib/pptx/pptx-package.mjs'
import { verifyNativeArtworkAdditions } from '../../../pptx-nova/scripts/lib/edit/native-artwork-preservation.mjs'
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

function fixture(mutateParts = () => {}, selectedBody = '') {
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
      `<p:sld xmlns:p="${p}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:feature="http://schemas.microsoft.com/office/powerpoint/2010/main"><p:cSld name="${name}">${name === 'chosen' ? selectedBody : ''}</p:cSld></p:sld>`,
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

function nativeArtworkFixture(mutate = (xml) => xml, duplicateCaption = false) {
  const art =
    '<p:sp><p:nvSpPr><p:cNvPr id="8" name="Artwork"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="100000" y="100000"/><a:ext cx="500000" cy="500000"/></a:xfrm><a:custGeom><a:pathLst><a:path w="100" h="100"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="100" y="100"/></a:lnTo></a:path></a:pathLst></a:custGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:srgbClr val="112233"/></a:solidFill></a:ln><a:effectLst/></p:spPr></p:sp>'
  const caption =
    '<p:sp><p:nvSpPr><p:cNvPr id="7" name="Caption"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="10000" y="10000"/><a:ext cx="500000" cy="200000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t> </a:t></a:r></a:p></p:txBody></p:sp>'
  const f = fixture(
    (parts) => {
      const slide = parts.find(([name]) => name.endsWith('/chosen.xml'))
      slide[1] = mutate(
        slide[1]
          .replace('name="Edited"', 'name="chosen"')
          .replace('</p:spTree>', art + '</p:spTree>'),
      )
    },
    '<p:spTree><p:nvGrpSpPr/><p:grpSpPr/>' +
      caption +
      (duplicateCaption ? caption.replace('id="7"', 'id="9"') : '') +
      '</p:spTree><mc:AlternateContent><mc:Choice Requires="feature"/><mc:Fallback/></mc:AlternateContent>',
  )
  const contract = JSON.parse(readFileSync(f.contract))
  Object.assign(contract, {
    scope: 'structural',
    operationKind: 'native-artwork',
    preserve: ['slide-count', 'source-objects'],
    expectedStructure: { slideCountDelta: 0, changedSlides: [1], objectTypes: ['freeform'] },
    targets: [
      {
        id: 'artwork',
        slide: 1,
        produced: true,
        resolvedIdentity: { slide: 1, name: 'Artwork', id: null },
        expected: { nativeArtworkRegion: [0, 0, 2, 2] },
      },
    ],
    requiredEvidence: [...contract.requiredEvidence, 'structure-check'],
  })
  f.write('contract.json', contract)
  const diff = JSON.parse(readFileSync(join(f.root, 'diff-full.json')))
  diff.summary.shapeAdded = 1
  f.write('diff-full.json', diff)
  const summary = JSON.parse(readFileSync(f.gate.artifacts.semanticDiff))
  summary.summary = diff.summary
  summary.fullEvidence.sha256 = fileSha256(join(f.root, 'diff-full.json'))
  f.write('diff.json', summary)
  return f
}

test('native artwork scoped acceptance permits declared additions while retaining the native oracle', async () => {
  const f = nativeArtworkFixture()
  const report = await evaluate(f)
  assert.equal(report.deliveryAuthorized, true)
  assert.equal(report.acceptance.policyId, 'pptx-nova-native-artwork-edit-acceptance/v1')
  assert.equal(report.decision.action, 'require-human-confirmation')
})

test('native artwork acceptance rejects undeclared objects, active content, escaping paths and source mutations', async () => {
  for (const mutate of [
    (s) => s.replace('name="Artwork"', 'name="Undeclared"'),
    (s) => s.replace('<p:nvPr/>', '<p:nvPr><p:extLst/></p:nvPr>'),
    (s) => s.replace('x="100000"', 'x="9000000"'),
    (s) => s.replace('x="100" y="100"', 'x="900" y="100"'),
    (s) => s.replace('name="chosen"', 'name="Unrelated change"'),
    (s) =>
      s.replace(
        'xmlns:feature="http://schemas.microsoft.com/office/powerpoint/2010/main"',
        'xmlns:feature="urn:unsupported"',
      ),
    (s) => s.replace('<a:effectLst/>', ''),
    (s) => s.replace('<a:effectLst/>', '<a:effectLst><a:outerShdw/></a:effectLst>'),
    (s) => s.replace('<a:ln w="12700">', '<a:ln>'),
    (s) => s.replace('<a:t> </a:t>', '<a:t></a:t>'),
    (s) => s.replace('x="10000" y="10000"', 'x="20000" y="10000"'),
    (s) => s.replace('</p:sld>', '<p:transition><p:fade/></p:transition></p:sld>'),
    (s) =>
      s.replace(
        '<a:noFill/>',
        '<a:noFill/><a:blip r:embed="rId9" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>',
      ),
  ]) {
    await assert.rejects(() => evaluate(nativeArtworkFixture(mutate)))
  }
})

test('native artwork preserves legal source name duplicates and requires structure evidence', async () => {
  const f = nativeArtworkFixture((s) => s, true)
  assert.equal((await evaluate(f)).deliveryAuthorized, true)
  const c = JSON.parse(readFileSync(f.contract))
  c.requiredEvidence = c.requiredEvidence.filter((e) => e !== 'structure-check')
  f.write('contract.json', c)
  await assert.rejects(() => evaluate(f), /structure-check/)
})

test('native artwork stroke bounds reserve square end caps beyond half the line width', async () => {
  const f = nativeArtworkFixture((s) => s.replace('<a:ln w="12700">', '<a:ln w="12700" cap="sq">'))
  const c = JSON.parse(readFileSync(f.contract))
  c.targets[0].expected.nativeArtworkRegion = [
    93650 / 914400,
    93650 / 914400,
    512700 / 914400,
    512700 / 914400,
  ]
  f.write('contract.json', c)
  await assert.rejects(() => evaluate(f), /escapes/)
})

test('native artwork rejects a theme override before trusting the safe base theme', () => {
  const f = nativeArtworkFixture((s) =>
    s.replace(
      '</a:ln><a:effectLst/></p:spPr>',
      '</a:ln><a:effectLst/></p:spPr><p:style><a:lnRef idx="1"/></p:style>',
    ),
  )
  const edit = JSON.parse(readFileSync(f.contract)),
    source = readPptxPackage(edit.source.pptx)
  const relation = (id, type) => ({
    uri: 'http://schemas.openxmlformats.org/package/2006/relationships',
    local: 'Relationship',
    attrs: [
      { uri: '', local: 'Id', value: id },
      {
        uri: '',
        local: 'Type',
        value: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + type,
      },
    ],
    children: [],
    text: '',
  })
  const a = (local, children = []) => ({
    uri: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    local,
    attrs: [],
    children,
    text: '',
  })
  const before = {
    ...source,
    partTree: (p) =>
      p === 'ppt/slides/_rels/chosen.xml.rels'
        ? { children: [relation('rLayout', 'slideLayout'), relation('rOverride', 'themeOverride')] }
        : p === 'layout-rels'
          ? { children: [relation('rMaster', 'slideMaster')] }
          : p === '_rels/layout.xml.rels'
            ? { children: [relation('rMaster', 'slideMaster')] }
            : p === '_rels/master.xml.rels'
              ? { children: [relation('rTheme', 'theme')] }
              : p === 'theme.xml'
                ? a('theme', [a('themeElements', [a('fmtScheme', [a('lnStyleLst', [a('ln')])])])])
                : source.partTree(p),
    relatedPart: (_owner, id) =>
      ({ rLayout: 'layout.xml', rMaster: 'master.xml', rTheme: 'theme.xml' })[id],
  }
  assert.throws(
    () =>
      verifyNativeArtworkAdditions({
        before,
        after: readPptxPackage(f.candidate),
        edit,
        slides: [2],
        diff: { summary: { shapeAdded: 1, shapeRemoved: 0, slideAdded: 0, slideRemoved: 0 } },
      }),
    /themeOverride/,
  )
})

test('native artwork permits only the declared caption offset without rewriting its text or size', async () => {
  const f = nativeArtworkFixture((s) => s.replace('x="10000" y="10000"', 'x="20000" y="30000"'))
  await assert.rejects(() => evaluate(f), /source objects/)
  const contract = JSON.parse(readFileSync(f.contract))
  contract.targets.push({
    id: 'caption',
    slide: 1,
    resolvedIdentity: { id: 7 },
    expected: { nativeArtworkPosition: { x: 20000, y: 30000 } },
  })
  f.write('contract.json', contract)
  f.gate.summary.targetCount = f.gate.summary.coveredTargetCount = 2
  assert.equal((await evaluate(f)).deliveryAuthorized, true)
  contract.targets[1].expected.nativeArtworkPosition.x++
  f.write('contract.json', contract)
  await assert.rejects(() => evaluate(f), /source objects/)
})

test('native artwork XML preservation covers inherited semantic comparison gaps', async () => {
  const f = nativeArtworkFixture()
  const path = join(f.root, 'diff-full.json'),
    diff = JSON.parse(readFileSync(path))
  diff.slides[1].unsupported.push({ reason: 'animation-or-transition', side: 'baseline' })
  f.write('diff-full.json', diff)
  const summary = JSON.parse(readFileSync(f.gate.artifacts.semanticDiff))
  summary.fullEvidence.sha256 = fileSha256(path)
  f.write('diff.json', summary)
  assert.equal((await evaluate(f)).deliveryAuthorized, true)
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
