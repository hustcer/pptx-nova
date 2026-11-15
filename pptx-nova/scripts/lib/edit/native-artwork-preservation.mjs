import { isDeepStrictEqual } from 'node:util'
import { posix } from 'node:path'

const P = new Set([
  'http://schemas.openxmlformats.org/presentationml/2006/main',
  'http://purl.oclc.org/ooxml/presentationml/main',
])
const A = new Set([
  'http://schemas.openxmlformats.org/drawingml/2006/main',
  'http://purl.oclc.org/ooxml/drawingml/main',
])
const presentationNodes = new Set([
  'sp',
  'nvSpPr',
  'cNvPr',
  'cNvSpPr',
  'nvPr',
  'spPr',
  'style',
  'txBody',
])
const drawingNodes = new Set([
  'xfrm',
  'off',
  'ext',
  'custGeom',
  'avLst',
  'gdLst',
  'ahLst',
  'cxnLst',
  'rect',
  'pathLst',
  'path',
  'moveTo',
  'lnTo',
  'cubicBezTo',
  'pt',
  'close',
  'noFill',
  'solidFill',
  'srgbClr',
  'schemeClr',
  'ln',
  'lnRef',
  'fillRef',
  'effectRef',
  'fontRef',
  'bodyPr',
  'lstStyle',
  'p',
  'pPr',
  'effectLst',
  'endParaRPr',
])
const fail = (message) => {
  throw new Error(`Native artwork preservation: ${message}`)
}
const attr = (node, name) => node.attrs.find((a) => a.uri === '' && a.local === name)?.value
function child(node, name, ns, optional = false) {
  const matches = node.children.filter((c) => c.local === name && ns.has(c.uri))
  if (matches.length !== 1 && !(optional && matches.length === 0)) fail(`expected one ${name}`)
  return matches[0]
}
const tree = (root) => child(child(root, 'cSld', P), 'spTree', P)
function identity(shape) {
  const props = child(child(shape, 'nvSpPr', P), 'cNvPr', P)
  return { id: attr(props, 'id'), name: attr(props, 'name') }
}
function integer(node, name, positive = false) {
  const raw = attr(node, name)
  if (
    !/^\d+$/.test(raw ?? '') ||
    !Number.isSafeInteger(Number(raw)) ||
    (positive && Number(raw) <= 0)
  )
    fail(`invalid ${name}`)
  return Number(raw)
}
function project(node, offsets, omitted) {
  return {
    name: `${node.uri}#${node.local}`,
    namespaces: [...node.ns].sort(([a], [b]) => a.localeCompare(b)),
    attrs: node.attrs
      .map((a) => ({
        ...a,
        value:
          offsets.has(node) && ['x', 'y'].includes(a.local) && !a.uri
            ? String(offsets.get(node)[a.local])
            : a.value,
      }))
      .sort((a, b) => `${a.uri}#${a.local}`.localeCompare(`${b.uri}#${b.local}`)),
    text: node.text,
    children: node.children.filter((c) => !omitted.has(c)).map((c) => project(c, offsets, omitted)),
  }
}
function themeFormat(source, part) {
  const related = (owner, suffix) => {
    const rels = posix.join(posix.dirname(owner), '_rels', posix.basename(owner) + '.rels')
    const relationships = source
      .partTree(rels)
      .children.filter(
        (n) =>
          n.uri === 'http://schemas.openxmlformats.org/package/2006/relationships' &&
          n.local === 'Relationship',
      )
    if (relationships.some((n) => attr(n, 'Type')?.endsWith('/themeOverride')))
      fail('themeOverride requires a separate inherited-paint review')
    const links = relationships.filter((n) => attr(n, 'Type')?.endsWith('/' + suffix))
    if (links.length !== 1) fail('unresolved inherited theme style')
    return source.relatedPart(owner, attr(links[0], 'Id'))
  }
  const theme = related(related(related(part, 'slideLayout'), 'slideMaster'), 'theme')
  return child(child(source.partTree(theme), 'themeElements', A), 'fmtScheme', A)
}
function verifyThemeLine(shape, source, part) {
  const style = child(shape, 'style', P, true),
    ref = style && child(style, 'lnRef', A, true)
  if (!ref || integer(ref, 'idx') === 0) return
  const styles = child(themeFormat(source, part), 'lnStyleLst', A)
  const line = styles.children[integer(ref, 'idx', true) - 1]
  if (
    !line ||
    line.local !== 'ln' ||
    !A.has(line.uri) ||
    line.children.some(
      (n) =>
        !A.has(n.uri) ||
        !['solidFill', 'noFill', 'prstDash', 'round', 'bevel', 'miter'].includes(n.local),
    )
  )
    fail('inherited line decorations require a separate geometry review')
}
function verifyThemeEffects(shape, source, part) {
  const style = child(shape, 'style', P, true),
    ref = style && child(style, 'effectRef', A, true)
  if (!ref || integer(ref, 'idx') === 0) return
  const styles = child(themeFormat(source, part), 'effectStyleLst', A),
    effect = styles.children[integer(ref, 'idx', true) - 1]
  if (!effect || !A.has(effect.uri) || effect.local !== 'effectStyle')
    fail('unresolved inherited effect style')
  // An empty local effectLst overrides 2D effects, but not the style's 3D siblings.
  if (effect.children.some((n) => A.has(n.uri) && ['scene3d', 'sp3d'].includes(n.local)))
    fail('inherited theme 3D requires a separate geometry review')
  if (effect.children.some((n) => !A.has(n.uri) || !['effectLst', 'effectDag'].includes(n.local)))
    fail('unsupported inherited effect style requires a separate geometry review')
}
function verifyDrawing(shape, region, source, part) {
  if (
    !Array.isArray(region) ||
    region.length !== 4 ||
    region.some((v) => !Number.isFinite(v)) ||
    region[0] < 0 ||
    region[1] < 0 ||
    region[2] <= 0 ||
    region[3] <= 0
  )
    fail('a bounded nativeArtworkRegion is required for each produced shape')
  const visit = (node) => {
    if (
      !(P.has(node.uri)
        ? presentationNodes.has(node.local)
        : A.has(node.uri) && drawingNodes.has(node.local)) ||
      node.attrs.some((a) => a.uri) ||
      node.text.trim()
    )
      fail('only text-free native freeform paint is permitted')
    if (['avLst', 'gdLst', 'ahLst', 'cxnLst'].includes(node.local) && node.children.length)
      fail('geometry guides and connections are outside this profile')
    for (const c of node.children) visit(c)
  }
  visit(shape)
  const props = child(shape, 'spPr', P),
    transform = child(props, 'xfrm', A)
  const effects = child(props, 'effectLst', A)
  if (effects.children.length || effects.attrs.length) fail('explicit empty effects are required')
  verifyThemeEffects(shape, source, part)
  const paint = (owner) => {
    const fills = owner.children.filter(
      (n) => A.has(n.uri) && ['solidFill', 'noFill'].includes(n.local),
    )
    if (fills.length !== 1) fail('explicit local fill and line paint are required')
    if (fills[0].local === 'solidFill') {
      const rgb = child(fills[0], 'srgbClr', A)
      if (!/^[0-9a-f]{6}$/i.test(attr(rgb, 'val') ?? '') || rgb.children.length)
        fail('explicit RGB paint is required')
    }
    return fills[0].local
  }
  paint(props)
  if (transform.attrs.length) fail('transformed additions require a separate reviewed workflow')
  const off = child(transform, 'off', A),
    extent = child(transform, 'ext', A)
  const x = integer(off, 'x'),
    y = integer(off, 'y'),
    w = integer(extent, 'cx', true),
    h = integer(extent, 'cy', true)
  const line = child(props, 'ln', A)
  const halfStroke = paint(line) === 'noFill' ? 0 : integer(line, 'w', true) / 2
  if (halfStroke) verifyThemeLine(shape, source, part)
  // Reserve diagonal square caps and the unlimited miter reach at each tangent join.
  // A theme's miter limit can shorten this bound, never enlarge it.
  let strokeFactor = Math.SQRT2
  const [rx, ry, rw, rh] = region.map((v) => v * 914400)
  const geometry = child(props, 'custGeom', A),
    paths = child(geometry, 'pathLst', A).children
  if (!paths.length) fail('empty custom geometry')
  for (const path of paths) {
    if (!A.has(path.uri) || path.local !== 'path') fail('invalid custom path')
    const width = integer(path, 'w', true),
      height = integer(path, 'h', true)
    if (!path.children.length || path.children[0].local !== 'moveTo')
      fail('path must start with a move')
    let current, start, first, previous
    const join = (incoming, outgoing) => {
      if (!halfStroke || !incoming || !outgoing) return
      const dot = Math.max(-1, Math.min(1, incoming[0] * outgoing[0] + incoming[1] * outgoing[1]))
      if (1 + dot < 1e-8) fail('stroke cusp requires a separate geometry review')
      strokeFactor = Math.max(strokeFactor, Math.sqrt(2 / (1 + dot)))
    }
    const segment = (points) => {
      const end = points.at(-1),
        from = [current, ...points.slice(0, -1)]
      const distinct = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-9
      const head = points.find((p) => distinct(p, current)),
        tail = from.reverse().find((p) => distinct(p, end))
      if (!head || !tail) {
        current = end
        return
      }
      const unit = (a, b) => {
        const length = Math.hypot(b[0] - a[0], b[1] - a[1])
        return [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
      }
      const incoming = unit(current, head),
        outgoing = unit(tail, end)
      join(previous, incoming)
      first ??= incoming
      previous = outgoing
      current = end
    }
    for (const command of path.children) {
      const count = { moveTo: 1, lnTo: 1, cubicBezTo: 3, close: 0 }[command.local]
      if (count === undefined || command.children.length !== count) fail('unsupported path command')
      for (const point of command.children) {
        if (point.local !== 'pt' || integer(point, 'x') > width || integer(point, 'y') > height)
          fail('path controls escape the viewport')
      }
      const points = command.children.map((p) => [
        (integer(p, 'x') * w) / width,
        (integer(p, 'y') * h) / height,
      ])
      if (command.local === 'moveTo') {
        current = start = points[0]
        first = previous = undefined
      } else if (command.local === 'close') {
        segment([start])
        join(previous, first)
        first = previous = undefined
      } else segment(points)
    }
  }
  const strokeReach = halfStroke * strokeFactor
  if (
    x - strokeReach < rx - 1 ||
    y - strokeReach < ry - 1 ||
    x + w + strokeReach > rx + rw + 1 ||
    y + h + strokeReach > ry + rh + 1
  )
    fail('paint escapes its declared region')
}

/** Prove an add-only illustration edit independently of the semantic diff.
 * Original slide XML must be semantically identical after removing declared
 * drawings, except exact predeclared caption offsets. No resources are added.
 */
export function verifyNativeArtworkAdditions({ before, after, edit, slides, diff }) {
  if (
    edit.scope !== 'structural' ||
    edit.operationKind !== 'native-artwork' ||
    !edit.preserve?.includes('source-objects') ||
    !edit.preserve.includes('slide-count') ||
    edit.expectedStructure?.slideCountDelta !== 0
  )
    fail('explicit add-only artwork contract required')
  const produced = edit.targets.filter((t) => t.produced === true)
  if (
    !produced.length ||
    diff.summary.shapeAdded !== produced.length ||
    diff.summary.shapeRemoved !== 0 ||
    diff.summary.slideAdded !== 0 ||
    diff.summary.slideRemoved !== 0
  )
    fail('declared addition count differs from the candidate')
  let verified = 0
  for (const { slide, part } of before.slides().filter((s) => slides.includes(s.slide))) {
    const source = before.partTree(part),
      candidate = after.partTree(part)
    const sourceTree = tree(source),
      candidateTree = tree(candidate)
    const sourceShapes = sourceTree.children.filter((c) => P.has(c.uri) && c.local === 'sp')
    const sourceIds = new Set(),
      sourceNames = new Set()
    const collect = (node) => {
      if (P.has(node.uri) && node.local === 'cNvPr') {
        sourceIds.add(attr(node, 'id'))
        sourceNames.add(attr(node, 'name'))
      }
      for (const c of node.children) collect(c)
    }
    collect(sourceTree)
    const targets = edit.targets.filter((t) => t.slide === slide - 1)
    const additions = targets.filter((t) => t.produced === true)
    const omitted = new Set(),
      offsets = new Map(),
      seenNames = new Set(),
      seenIds = new Set()
    for (const shape of candidateTree.children.filter((c) => P.has(c.uri) && c.local === 'sp')) {
      const id = identity(shape)
      if (!/^\d+$/.test(id.id ?? '') || seenIds.has(id.id))
        fail('duplicate or invalid shape identity')
      seenIds.add(id.id)
      if (sourceIds.has(id.id)) continue
      if (seenNames.has(id.name)) fail('duplicate artwork name')
      seenNames.add(id.name)
      const target = additions.find((t) => t.resolvedIdentity?.name === id.name)
      if (!target || sourceNames.has(id.name)) fail('undeclared or colliding artwork object')
      verifyDrawing(shape, target.expected?.nativeArtworkRegion, before, part)
      omitted.add(shape)
      verified++
    }
    if (omitted.size !== additions.length) fail('missing declared artwork object')
    for (const target of targets.filter((t) => t.produced !== true)) {
      const position = target.expected?.nativeArtworkPosition
      if (
        !position ||
        !['x', 'y'].every((k) => Number.isSafeInteger(position[k]) && position[k] >= 0) ||
        !Number.isInteger(target.resolvedIdentity?.id)
      )
        fail('existing objects permit only exact declared caption offsets')
      const shape = sourceShapes.find((s) => identity(s).id === String(target.resolvedIdentity.id))
      if (!shape) fail('caption identity is absent from the source')
      const offset = child(child(child(shape, 'spPr', P), 'xfrm', A), 'off', A)
      integer(offset, 'x')
      integer(offset, 'y')
      offsets.set(offset, position)
    }
    if (
      !isDeepStrictEqual(
        project(source, offsets, new Set()),
        project(candidate, new Map(), omitted),
      )
    )
      fail('source objects or other slide XML changed beyond declared caption offsets')
  }
  if (verified !== produced.length) fail('artwork targets escaped the reviewed slides')
  return { addedFreeforms: verified, sourceObjects: 'preserved-except-declared-caption-offsets' }
}
