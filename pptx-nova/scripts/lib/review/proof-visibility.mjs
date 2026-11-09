import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readPptxPackage } from '../pptx/pptx-package.mjs'

const P = new Set([
  'http://schemas.openxmlformats.org/presentationml/2006/main',
  'http://purl.oclc.org/ooxml/presentationml/main',
])
const A = new Set([
  'http://schemas.openxmlformats.org/drawingml/2006/main',
  'http://purl.oclc.org/ooxml/drawingml/main',
])
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
const attr = (n, key) => n?.attrs.find((a) => a.local === key && !a.uri)?.value
const children = (n, ns, name) => n?.children.filter((x) => ns.has(x.uri) && x.local === name) ?? []
const child = (n, ns, name) => children(n, ns, name)[0]
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const boolean = (value) => {
  if (value === undefined || ['0', 'false'].includes(value.trim())) return false
  if (['1', 'true'].includes(value.trim())) return true
  return null
}
function descendant(root, ns, name) {
  if (ns.has(root.uri) && root.local === name) return root
  for (const node of root.children) {
    const found = descendant(node, ns, name)
    if (found) return found
  }
  return null
}
function shapes(root, grouped = false, kind = 'shape', branches = []) {
  return root.children.flatMap((n) =>
    P.has(n.uri) &&
    ((kind === 'shape' && n.local === 'sp') ||
      (kind === 'table' && n.local === 'graphicFrame' && descendant(n, A, 'tbl')))
      ? [
          {
            node: n,
            grouped,
            branches,
            id: Number(
              attr(
                child(child(n, P, kind === 'table' ? 'nvGraphicFramePr' : 'nvSpPr'), P, 'cNvPr'),
                'id',
              ),
            ),
          },
        ]
      : shapes(
          n,
          grouped || (P.has(n.uri) && n.local === 'grpSp'),
          kind,
          n.uri === MC && ['AlternateContent', 'Choice', 'Fallback'].includes(n.local)
            ? [...branches, { kind: n.local, requires: attr(n, 'Requires') ?? null }]
            : branches,
        ),
  )
}
function color(fill) {
  if (!fill) return null
  const srgb = child(fill, A, 'srgbClr')
  const hex = attr(srgb, 'val')
  if (!/^[0-9a-f]{6}$/i.test(hex ?? '')) return null
  if (srgb.children.some((n) => !A.has(n.uri) || n.local !== 'alpha')) return null
  const alphas = children(srgb, A, 'alpha')
  const alpha = alphas.length ? Number(attr(alphas[0], 'val')) / 100000 : 1
  if (alphas.length > 1 || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null
  return { rgb: [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)), alpha }
}
function paint(properties) {
  if (child(properties, A, 'noFill')) return { rgb: [0, 0, 0], alpha: 0 }
  return color(child(properties, A, 'solidFill'))
}
function luminance(rgb) {
  const values = rgb
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}
function contrast(paintValue, background) {
  if (!paintValue || !background) return null
  const rgb = paintValue.rgb.map(
    (v, i) => v * paintValue.alpha + background.rgb[i] * (1 - paintValue.alpha),
  )
  const x = luminance(rgb),
    y = luminance(background.rgb)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
function bbox(shape) {
  const transform = child(shape, P, 'xfrm') ?? child(child(shape, P, 'spPr'), A, 'xfrm')
  const off = child(transform, A, 'off'),
    ext = child(transform, A, 'ext')
  if (!off || !ext || Number(attr(transform, 'rot') ?? 0) % 21600000) return null
  const values = [attr(off, 'x'), attr(off, 'y'), attr(ext, 'cx'), attr(ext, 'cy')].map(Number)
  return values.every(Number.isFinite) ? values : null
}
function supportedShapeGeometry(properties) {
  const preset = child(properties, A, 'prstGeom')
  // These unadjusted presets have a nonempty closed contour and support both fill and outline.
  // Other presets and custom paths need actual path interpretation, not a bbox/paint guess.
  return (
    ['rect', 'roundRect', 'ellipse'].includes(attr(preset, 'prst')) &&
    !child(properties, A, 'custGeom') &&
    !child(preset, A, 'avLst')?.children.length
  )
}
const hasEffects = (properties) =>
  ['effectDag', 'effectLst'].some((name) => child(properties, A, name)?.children.length)
function unresolvedShapeEffects(shape, properties) {
  const effectRef = child(child(shape, P, 'style'), A, 'effectRef')
  return (
    boolean(attr(shape, 'useBgFill')) !== false ||
    hasEffects(properties) ||
    child(properties, A, 'scene3d') ||
    child(properties, A, 'sp3d') ||
    (effectRef && Number(attr(effectRef, 'idx')) !== 0)
  )
}

export function proofMapIssues(proofMap, sourceSha256) {
  const issues = []
  if (proofMap?.sourceSha256 !== sourceSha256)
    issues.push({
      code: 'proof-map-source-stale',
      message: 'Proof map must bind the current source SHA-256.',
    })
  if (!Array.isArray(proofMap?.proofObjects) || !proofMap.proofObjects.length)
    issues.push({
      code: 'proof-map-empty',
      message: 'Declare at least one protected proof object; zero checks cannot pass.',
    })
  return issues
}

/** Bounded native shape silhouettes and table-grid geometry; unresolved inheritance is review-required. */
export function buildProofVisibilityReport({ source, candidate, proofMap }) {
  const report = {
    schemaVersion: 'pptx-nova-proof-visibility/v1',
    status: 'fail',
    source: { path: source, sha256: hash(source) },
    candidate: { path: candidate, sha256: hash(candidate) },
    coverage:
      'Declared source-owned unadjusted rect/roundRect/ellipse silhouettes and table frame/grid/row consistency. Text fit, apparent size, cell readability, pixel occlusion, other/custom geometry, effects, inherited/theme/gradient/image paint, groups, rotations, AlternateContent branches and playback require separate evidence.',
    issues: [],
    results: [],
  }
  report.issues.push(...proofMapIssues(proofMap, report.source.sha256))
  const declarations = proofMap?.proofObjects
  if (report.issues.length) return report
  const a = readPptxPackage(source),
    b = readPptxPackage(candidate)
  const sa = a.slides(),
    sb = b.slides()
  const size = child(b.partTree('ppt/presentation.xml'), P, 'sldSz')
  const canvas = [attr(size, 'cx'), attr(size, 'cy')].map(Number)
  const seen = new Set()
  for (const declared of declarations) {
    const { slideNumber, shapeId, role, kind = 'shape' } = declared ?? {}
    const result = { slideNumber, shapeId, role, kind, status: 'pass', issues: [] }
    report.results.push(result)
    const fail = (code, message) => {
      result.status = 'fail'
      result.issues.push({ code, message })
    }
    const review = (code, message) => {
      if (result.status !== 'fail') result.status = 'review-required'
      result.issues.push({ code, message })
    }
    const key = `${slideNumber}:${kind}:${shapeId}`
    if (
      !Number.isInteger(slideNumber) ||
      slideNumber < 1 ||
      !Number.isInteger(shapeId) ||
      shapeId < 1 ||
      typeof role !== 'string' ||
      !role.trim() ||
      seen.has(key) ||
      !['shape', 'table'].includes(kind)
    ) {
      fail(
        'proof-declaration-invalid',
        'Use unique positive slideNumber/shapeId values and an explicit proof role.',
      )
      continue
    }
    seen.add(key)
    const originalSlide = sa[slideNumber - 1],
      finalSlide = sb[slideNumber - 1]
    if (!originalSlide || !finalSlide || originalSlide.part !== finalSlide.part) {
      fail(
        'proof-slide-unresolved',
        'Source slide ownership changed or could not be resolved; remapping was not guessed.',
      )
      continue
    }
    const before = shapes(a.partTree(originalSlide.part), false, kind).filter(
      (x) => x.id === shapeId,
    )
    const finalRoot = b.partTree(finalSlide.part)
    const after = shapes(finalRoot, false, kind).filter((x) => x.id === shapeId)
    if (before.length !== 1 || after.length !== 1) {
      fail(
        'proof-identity-unresolved',
        'Source and candidate must each contain exactly one original native shape.',
      )
      continue
    }
    const shape = after[0]
    const hidden = boolean(
      attr(
        child(child(shape.node, P, kind === 'table' ? 'nvGraphicFramePr' : 'nvSpPr'), P, 'cNvPr'),
        'hidden',
      ),
    )
    if (hidden === true) fail('proof-hidden', 'Protected proof is explicitly hidden.')
    else if (hidden === null)
      review('proof-visibility-unresolved', 'Unrecognized native visibility flag requires review.')
    if (before[0].branches.length || shape.branches.length) {
      result.branches = { source: before[0].branches, candidate: shape.branches }
      review(
        'proof-branch-unverified',
        'Source or candidate belongs to an AlternateContent branch; consumer branch selection requires separate evidence.',
      )
      continue
    }
    if (shape.grouped) {
      review(
        'proof-group-transform-unverified',
        'Grouped coordinates require independent transformed-geometry evidence.',
      )
      continue
    }
    const box = bbox(shape.node)
    result.bboxEmu = box
    if (!box || canvas.some((v) => !Number.isFinite(v) || v <= 0))
      review(
        'proof-geometry-unresolved',
        'Direct unrotated geometry and canvas dimensions are required.',
      )
    else if (
      box[2] <= 0 ||
      box[3] <= 0 ||
      box[0] < 0 ||
      box[1] < 0 ||
      box[0] + box[2] > canvas[0] ||
      box[1] + box[3] > canvas[1]
    )
      fail('proof-bounds-invalid', 'Protected proof has zero size or extends off the slide.')
    if (kind === 'table') {
      const table = descendant(shape.node, A, 'tbl')
      const columns = children(child(table, A, 'tblGrid'), A, 'gridCol').map((n) =>
        Number(attr(n, 'w')),
      )
      const rows = children(table, A, 'tr').map((n) => Number(attr(n, 'h')))
      const valid =
        columns.length > 0 &&
        rows.length > 0 &&
        [...columns, ...rows].every((v) => Number.isFinite(v) && v > 0)
      result.tableGrid = {
        columnWidthsEmu: columns,
        rowHeightsEmu: rows,
        widthEmu: columns.reduce((x, y) => x + y, 0),
        heightEmu: rows.reduce((x, y) => x + y, 0),
      }
      if (!valid)
        fail('table-grid-invalid', 'Native table needs positive column widths and row heights.')
      else if (box) {
        if (Math.abs(result.tableGrid.widthEmu - box[2]) > columns.length)
          fail(
            'table-grid-frame-width-mismatch',
            'Graphic frame width changed independently of the native column grid.',
          )
        if (Math.abs(result.tableGrid.heightEmu - box[3]) > rows.length)
          fail(
            'table-rows-frame-height-mismatch',
            'Graphic frame height changed independently of native row heights.',
          )
      }
      continue
    }
    const properties = child(shape.node, P, 'spPr')
    if (!supportedShapeGeometry(properties)) {
      review(
        'proof-shape-geometry-unverified',
        'Only unadjusted rect, roundRect and ellipse contours are supported; other geometry requires visual review.',
      )
      continue
    }
    if (unresolvedShapeEffects(shape.node, properties)) {
      review(
        'proof-effects-unresolved',
        'Shape effects, 3D or background-fill overrides can change effective paint and require review.',
      )
      continue
    }
    const backgroundProperties = child(child(child(finalRoot, P, 'cSld'), P, 'bg'), P, 'bgPr')
    const background = paint(backgroundProperties)
    if (!background || background.alpha !== 1 || hasEffects(backgroundProperties)) {
      review(
        'proof-background-unresolved',
        'Inherited, non-solid, non-opaque or effect-modified background requires visual review.',
      )
      continue
    }
    const fill = paint(properties),
      lineNode = child(properties, A, 'ln'),
      line = paint(lineNode)
    const fillContrast = contrast(fill, background),
      lineContrast = contrast(line, background)
    const declaredLineWidth = attr(lineNode, 'w')
    const lineWidth = declaredLineWidth === undefined ? null : Number(declaredLineWidth)
    const lineWidthKnown = Number.isFinite(lineWidth) && lineWidth >= 0
    result.paint = { fillContrast, lineContrast, lineWidthEmu: lineWidthKnown ? lineWidth : null }
    const visible =
      (fillContrast !== null && fillContrast >= 1.2) ||
      (lineContrast !== null && lineContrast >= 1.2 && lineWidthKnown && lineWidth > 0)
    if (!visible) {
      if (!fill || !line || (line.alpha > 0 && !lineWidthKnown))
        review(
          'proof-paint-unresolved',
          'Inherited or unsupported paint requires visual review; no visible silhouette was proven.',
        )
      else
        fail(
          'proof-not-discernible',
          'Neither fill nor outline is discernible against the slide background; object/text presence is insufficient.',
        )
    }
  }
  report.status = report.results.some((r) => r.status === 'fail')
    ? 'fail'
    : report.results.some((r) => r.status === 'review-required')
      ? 'review-required'
      : 'pass'
  report.summary = {
    declared: declarations.length,
    passed: report.results.filter((r) => r.status === 'pass').length,
    failed: report.results.filter((r) => r.status === 'fail').length,
    reviewRequired: report.results.filter((r) => r.status === 'review-required').length,
  }
  return report
}
