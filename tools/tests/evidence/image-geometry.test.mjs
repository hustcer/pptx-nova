import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { skillUrl, skillPath } from '../helpers/common.mjs'
import { storedZip, contentTypes } from '../helpers/pptx-package.mjs'

const { buildImageGeometryReport } = await import(skillUrl('scripts/lib/review/image-geometry.mjs'))

function picturePptx(geometry, { partName = 'ppt/slides/slide1.xml', id = 7 } = {}) {
  const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
  const slide = partName.slice('ppt/'.length)
  const rels = partName.replace(/\/([^/]+)$/, '/_rels/$1.rels')
  return storedZip([
    [
      '[Content_Types].xml',
      contentTypes([
        [
          'ppt/presentation.xml',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
        ],
        [partName, 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'],
        ['ppt/media/image1.png', 'image/png'],
      ]),
    ],
    [
      'ppt/presentation.xml',
      `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="slide"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`,
    ],
    [
      'ppt/_rels/presentation.xml.rels',
      `<Relationships xmlns="${REL}"><Relationship Id="slide" Type="${R}/slide" Target="${slide}"/></Relationships>`,
    ],
    [
      partName,
      `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree><p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Proof"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="image"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="100000" y="100000"/><a:ext cx="500000" cy="500000"/></a:xfrm>${geometry}</p:spPr></p:pic></p:spTree></p:cSld></p:sld>`,
    ],
    [
      rels,
      `<Relationships xmlns="${REL}"><Relationship Id="image" Type="${R}/image" Target="../media/image1.png"/></Relationships>`,
    ],
    [
      'ppt/media/image1.png',
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6GQAAAAASUVORK5CYII=',
        'base64',
      ),
    ],
  ])
}

function deck({ w = 4000000, h = 6000000, x = 0, crop = null, maskPreset = 'rect' } = {}) {
  return {
    slides: [
      {
        index: 0,
        partName: 'ppt/slides/slide7.xml',
        shapes: [
          {
            id: 9,
            shapeType: 'picture',
            bbox: { xEmu: x, yEmu: 0, wEmu: w, hEmu: h },
            image: { crop, maskPreset },
          },
        ],
      },
    ],
  }
}

function report(source, candidate, geometries = []) {
  const root = mkdtempSync(join(tmpdir(), 'nova-picture-geometry-'))
  const paths = [join(root, 'source.pptx'), join(root, 'candidate.pptx')]
  try {
    for (const [index, inspect] of [source, candidate].entries()) {
      const slide = inspect.slides[0]
      const shape = slide?.shapes[0]
      const preset = shape?.image?.maskPreset ?? 'rect'
      writeFileSync(
        paths[index],
        picturePptx(geometries[index] ?? `<a:prstGeom prst="${preset}"/>`, {
          partName: slide?.partName,
          id: shape?.id,
        }),
      )
    }
    return buildImageGeometryReport({
      sourceInspect: source,
      candidateInspect: candidate,
      source: { path: paths[0] },
      candidate: { path: paths[1] },
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('inspect preset names alone cannot prove native mask geometry', () => {
  const r = buildImageGeometryReport({ sourceInspect: deck(), candidateInspect: deck() })
  assert.equal(r.status, 'fail')
  assert.ok(r.issues.some((issue) => issue.code === 'picture-mask-geometry-unverified'))
})

test('native preset adjustments are compared even when inspect reports the same preset', () => {
  const inspected = deck({ maskPreset: 'roundRect' })
  const geometry = (adjustment) =>
    `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adjustment}"/></a:avLst></a:prstGeom>`
  const changed = report(inspected, inspected, [geometry(0), geometry(50000)])
  assert.equal(changed.status, 'fail')
  assert.ok(changed.issues.some((issue) => issue.code === 'picture-mask-changed'))
  assert.equal(report(inspected, inspected, [geometry(50000), geometry(50000)]).status, 'pass')
})

test('empty adjustment lists and formula whitespace normalize without ignoring undisclosed geometry', () => {
  assert.equal(
    report(deck(), deck(), [
      '<a:prstGeom prst="rect"/>',
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
    ]).status,
    'pass',
  )
  const round = deck({ maskPreset: 'roundRect' })
  assert.equal(
    report(round, round, [
      '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst></a:prstGeom>',
      '<a:prstGeom prst="roundRect"><a:avLst><a:gd fmla=" val   50000 " name="adj"/></a:avLst></a:prstGeom>',
    ]).status,
    'pass',
  )
  for (const geometry of [
    '',
    '<a:prstGeom prst="ellipse"/>',
    '<a:prstGeom prst="rect"><a:avLst><a:gd name="adj"/></a:avLst></a:prstGeom>',
  ]) {
    const r = report(deck(), deck(), [geometry, geometry])
    assert.equal(r.status, 'fail')
    assert.ok(r.issues.some((issue) => issue.code === 'picture-mask-geometry-unverified'))
  }
})

test('picture geometry allows translation and uniform scaling with EMU rounding', () => {
  const r = report(deck(), deck({ w: 2000000, h: 3000001, x: 900000 }))
  assert.equal(r.status, 'pass')
  assert.equal(r.summary.picturesChecked, 1)
  assert.equal(r.pictures[0].moved, true)
})

test('unchanged media or crop cannot excuse nonuniform image scaling', () => {
  const r = report(deck(), deck({ w: 4000000, h: 4700000 }))
  assert.equal(r.status, 'fail')
  assert.ok(r.issues.some((i) => i.code === 'picture-nonuniform-scale'))
})

test('uniformly scaled frames still fail changed source crop or mask', () => {
  for (const candidate of [deck({ crop: { left: 0.1 } }), deck({ maskPreset: 'ellipse' })]) {
    assert.equal(report(deck(), candidate).status, 'fail')
  }
})

test('missing and ambiguous original identities fail without guessed remapping', () => {
  const missing = deck()
  missing.slides[0].shapes = []
  assert.equal(report(deck(), missing).status, 'fail')
  const ambiguous = deck()
  ambiguous.slides[0].shapes.push(ambiguous.slides[0].shapes[0])
  assert.equal(report(deck(), ambiguous).status, 'fail')
  const noId = deck()
  delete noId.slides[0].shapes[0].id
  assert.equal(report(noId, noId).status, 'fail')
})

test('missing geometry or crop disclosure is not a preservation pass', () => {
  const missing = deck()
  delete missing.slides[0].shapes[0].image
  assert.equal(report(deck(), missing).status, 'fail')
  const invalid = deck({ w: 0 })
  assert.equal(report(deck(), invalid).status, 'fail')
})

test('custom or undisclosed picture masks cannot pass as equal preset geometry', () => {
  const masked = (maskPreset) => {
    const inspect = deck()
    inspect.slides[0].shapes[0].image.maskPreset = maskPreset
    return inspect
  }
  for (const maskPreset of [null, '', undefined]) {
    for (const [source, candidate] of [
      [masked(maskPreset), masked(maskPreset)],
      [deck(), masked(maskPreset)],
      [masked(maskPreset), deck()],
    ]) {
      const r = report(source, candidate)
      assert.equal(r.status, 'fail')
      assert.ok(r.issues.some((issue) => issue.code === 'picture-mask-undisclosed'))
    }
  }
})

test('candidate-only pictures do not alter the source-picture preservation scope', () => {
  const candidate = deck()
  candidate.slides[0].shapes.push({ ...candidate.slides[0].shapes[0], id: 10 })
  const r = report(deck(), candidate)
  assert.equal(r.status, 'pass')
  assert.equal(r.summary.picturesChecked, 1)
})

test('an input without pictures is explicitly not applicable', () => {
  assert.equal(report({ slides: [] }, { slides: [] }).status, 'not-applicable')
})

test('CLI refuses overwriting input bytes through the report path or an alias', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-image-gate-'))
  const source = join(dir, 'source.pptx'),
    candidate = join(dir, 'candidate.pptx')
  writeFileSync(source, 'Source bytes')
  writeFileSync(candidate, 'Candidate bytes')
  const alias = join(dir, 'report.json')
  symlinkSync(source, alias)
  for (const output of [source, candidate, alias]) {
    const result = spawnSync(
      process.execPath,
      [
        skillPath('scripts/cli/review/image-geometry-gate.mjs'),
        '--source',
        source,
        '--candidate',
        candidate,
        '--output',
        output,
        '--overwrite',
      ],
      { encoding: 'utf8' },
    )
    assert.equal(result.status, 1)
    assert.match(result.stderr, /must differ/)
  }
  assert.equal(readFileSync(source, 'utf8'), 'Source bytes')
  assert.equal(readFileSync(candidate, 'utf8'), 'Candidate bytes')
})

test(
  'real inspect rejects changed custom masks while unchanged preset pictures still pass',
  {
    skip: !process.env.XDOC_TEST_BIN && 'Set XDOC_TEST_BIN to run executable contract tests',
  },
  () => {
    const root = mkdtempSync(join(tmpdir(), 'nova-native-picture-mask-'))
    const custom = (points) =>
      `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="1000" b="1000"/><a:pathLst><a:path w="1000" h="1000">${points.map(([x, y], i) => `<a:${i ? 'lnTo' : 'moveTo'}><a:pt x="${x}" y="${y}"/></a:${i ? 'lnTo' : 'moveTo'}>`).join('')}<a:close/></a:path></a:pathLst></a:custGeom>`
    for (const [name, geometry] of Object.entries({
      source: custom([
        [0, 0],
        [1000, 0],
        [1000, 1000],
        [0, 1000],
      ]),
      candidate: custom([
        [500, 0],
        [1000, 1000],
        [0, 1000],
      ]),
      preset: '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
      round0:
        '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 0"/></a:avLst></a:prstGeom>',
      round50:
        '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst></a:prstGeom>',
      presetAbsentList: '<a:prstGeom prst="rect"/>',
    }))
      writeFileSync(join(root, `${name}.pptx`), picturePptx(geometry))
    for (const [source, candidate, expected] of [
      ['source', 'candidate', 'fail'],
      ['preset', 'preset', 'pass'],
      ['round0', 'round50', 'fail'],
      ['round50', 'round50', 'pass'],
      ['presetAbsentList', 'preset', 'pass'],
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          skillPath('scripts/cli/review/image-geometry-gate.mjs'),
          '--source',
          join(root, `${source}.pptx`),
          '--candidate',
          join(root, `${candidate}.pptx`),
          '--xdoc-bin',
          resolve(process.env.XDOC_TEST_BIN),
          '--output',
          join(root, `${source}-${candidate}-report.json`),
          '--json',
        ],
        { encoding: 'utf8' },
      )
      assert.equal(result.status, expected === 'pass' ? 0 : 1, result.stderr || result.stdout)
      const report = JSON.parse(result.stdout)
      assert.equal(report.status, expected)
      assert.equal(report.summary.picturesChecked, 1)
      if (expected === 'fail')
        assert.ok(
          report.issues.some(
            (issue) =>
              issue.code ===
              (source === 'source' ? 'picture-mask-undisclosed' : 'picture-mask-changed'),
          ),
        )
    }
  },
)
