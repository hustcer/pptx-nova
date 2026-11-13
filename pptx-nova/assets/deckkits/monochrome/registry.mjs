import { readFileSync } from 'node:fs'
import { assertDesignValue } from '../shared/design-contract.mjs'
import { compileMonochromeLayout, resolveMonochromeDeck } from './layouts.mjs'

export const MONOCHROME_LAYOUTS = {
  cover: { bottom: ['section', 'title', 'body'], editorial: ['section', 'title', 'body'] },
  opening: { chapter: ['section', 'title', 'body'], statement: ['title', 'body'] },
  split: {
    right: ['body', 'items', 'asset', 'caption'],
    left: ['body', 'items', 'asset', 'caption'],
  },
  metrics: { row: ['metrics'], rail: ['metrics'] },
  list: { split: ['title', 'body', 'items'], wide: ['title', 'body', 'items'] },
  comparison: { side: ['panels'], stacked: ['panels'] },
  quote: {
    inset: ['section', 'title', 'body', 'source'],
    wide: ['section', 'title', 'body', 'source'],
  },
  analysis: { columns: ['blocks'], insights: ['blocks'] },
  chart: Object.fromEntries(
    ['wide', 'left', 'right'].map((k) => [k, ['chart', 'ring', 'head', 'legend', 'note']]),
  ),
  process: { sequence: ['steps'], timeline: ['steps'], cycle: ['steps'] },
  hierarchy: { pyramid: ['body', 'levels'], ladder: ['body', 'levels'] },
  closing: {
    left: ['section', 'title', 'body', 'source'],
    center: ['section', 'title', 'body', 'source'],
  },
}
const schemaFor = (type) =>
  JSON.parse(readFileSync(new URL(`./schemas/${type}.schema.json`, import.meta.url)))
export function validateMonochromeData(type, data, path) {
  const s = schemaFor(type)
  assertDesignValue(data, s, s, path)
}
function assertMonochrome(design, { assertFrame }) {
  const b = design.monochrome,
    seen = new Set()
  if (design.colors.paper !== 'FAFADF' || design.colors.ink !== '1A1A16')
    throw Error('Monochrome requires ivory paper and warm black ink')
  if (Object.keys(b.families).length !== 12)
    throw Error('Monochrome requires twelve registered responsibilities')
  for (const [type, f] of Object.entries(b.families)) {
    const expected = MONOCHROME_LAYOUTS[f.role]
    if (!type.startsWith('mono') || !expected || seen.has(f.role))
      throw Error(`${type}: unknown or duplicate monochrome role`)
    seen.add(f.role)
    if (Object.keys(f.variants).join('|') !== Object.keys(expected).join('|'))
      throw Error(`${type}: unregistered layouts`)
    for (const [id, v] of Object.entries(f.variants)) {
      if (Object.keys(v.regions).sort().join('|') !== [...expected[id]].sort().join('|'))
        throw Error(`${type}.${id}: unregistered regions`)
      for (const [key, f] of Object.entries(v.regions))
        assertFrame(design, f, `${type}.${id}.${key}`)
    }
  }
  for (const [name, s] of Object.entries(b.styles)) {
    if (!design.fonts[s.role] || !design.colors[s.color] || s.sizePt < 10.5)
      throw Error(`${name}: readable registered typography required`)
    if (s.italic && name !== 'quote') throw Error(`${name}: italic is reserved for quotations`)
    if (s.role === 'display' && s.bold) throw Error(`${name}: display type must remain light`)
  }
  for (const [key, f] of Object.entries(b.chrome)) {
    if (f.length === 4) assertFrame(design, f, `monochrome.chrome.${key}`)
    else assertFrame(design, [...f, b.spacing.ruleIn], `monochrome.chrome.${key}`)
  }
  for (const [key, [lo, hi]] of Object.entries(b.capacity))
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 1 || hi < lo)
      throw Error(`${key}: invalid capacity`)
  if (b.spacing.rulePt > 0.8 || b.spacing.ruleIn > 0.012)
    throw Error('Monochrome requires hairline rules')
}
function checkMonochrome(design, op, fail) {
  if (
    op.op === 'add-chart' &&
    (!['column', 'doughnut'].includes(op.kind) || op.data?.series?.length !== 1)
  )
    fail('Monochrome registers single-series columns and doughnuts only')
  if (op.op === 'add-shape' && !['rectangle', 'ellipse', 'rounded-rectangle'].includes(op.kind))
    fail('Unregistered monochrome shape')
  if (op.op === 'add-freeform' && !/_(?:AssetShell|InsightSurface\d+)$/.test(op.name ?? ''))
    fail('Unregistered monochrome path')
  if (['add-image', 'add-group', 'add-table'].includes(op.op))
    fail('No image, group or table ingestion is registered')
  if (
    op.op === 'set-slide-background' &&
    (op.fill?.type !== 'solid' ||
      ![design.colors.paper, design.colors.warm].includes(op.fill.color))
  )
    fail('Monochrome requires paper surfaces')
  const walk = (v, key = '') => {
    if (!v || typeof v !== 'object') return
    if (key === 'font' && v.italic && v.name !== design.fonts.serif.latin)
      fail('Italic requires the registered quotation serif')
    if (key === 'fill' && ['gradient', 'pattern', 'picture'].includes(v.type))
      fail('Monochrome prohibits decorative fills')
    for (const [k, x] of Object.entries(v)) walk(x, k)
  }
  walk(op)
}
export function monochromeSpecimen(s, index = 0, maximum = true) {
  if (s['x-slotProbeValue'] !== undefined) return s['x-slotProbeValue']
  if (s.enum) return s.enum[0]
  if (s.type === 'object')
    return Object.fromEntries(
      Object.entries(s.properties).map(([k, v]) => [k, monochromeSpecimen(v, index, maximum)]),
    )
  if (s.type === 'array')
    return Array.from({ length: maximum ? s.maxItems : s.minItems }, (_, i) =>
      monochromeSpecimen(s.items, i, maximum),
    )
  if (s.type === 'number') return index + 1
  return 'x'
}
function projectedBudgets(design, family) {
  const type = Object.keys(design.monochrome.families).find(
      (k) => design.monochrome.families[k] === family,
    ),
    schema = schemaFor(type),
    data = monochromeSpecimen(schema),
    budgets = {}
  if (family.role === 'process') data.steps = data.steps.slice(0, 4)
  const add = (path, frame, style) => {
    if (!path?.startsWith('data.')) return
    const key = path.slice(5).replace(/\[\d+\]/g, '[]')
    let node = schema
    for (const part of key.replaceAll('[]', '.[]').split('.'))
      node = part === '[]' ? node?.items : node?.properties?.[part]
    if (node?.type !== 'string' || node['x-slotRole'] === 'control') return
    const v = {
      fontPt: style.sizePt,
      widthIn: frame[2],
      heightIn: frame[3],
      lineHeight: style.lineHeight,
      maxLines: Math.max(
        1,
        Math.floor(((frame[3] - 0.025) * 72) / style.sizePt / (style.sizePt >= 23 ? 1.18 : 1.5)),
      ),
    }
    if (!budgets[key] || v.widthIn < budgets[key].widthIn) budgets[key] = v
  }
  let count = 0
  for (const [id, v] of Object.entries(family.variants)) {
    let cs
    try {
      cs = compileMonochromeLayout(design, family, id, v, data)
    } catch {
      continue
    }
    count++
    for (const c of cs) {
      if (c.style) for (const p of c.paths ?? [c.path]) add(p, c.allocatedFrame ?? c.frame, c.style)
      if (c.kind === 'chart')
        for (let i = 0; i < data.points.length; i++)
          add(
            `data.points[${i}].label`,
            [0, 0, c.frame[2] / data.points.length, 0.5],
            design.monochrome.styles.small,
          )
    }
  }
  if (!count) throw Error(`${type}: no valid projection specimen`)
  return budgets
}
export const MONOCHROME_FAMILY = {
  key: 'monochrome',
  name: 'monochrome-ledger/v1',
  assert: assertMonochrome,
  resolve: (d, c) => resolveMonochromeDeck(d, c, { validateData: validateMonochromeData }),
  checks: { 'monochrome-language': checkMonochrome },
  groups: {
    anchor: ['cover', 'opening', 'closing'],
    narrative: ['list', 'quote', 'analysis', 'split'],
    evidence: ['metrics', 'chart', 'comparison', 'hierarchy'],
    process: ['process'],
  },
  projectedBudgets,
  projectedCapacities(d, f) {
    const c = d.monochrome.capacity
    return (
      {
        split: { items: [2, 3] },
        metrics: { metrics: c.metrics },
        list: { items: c.items },
        comparison: { panels: c.panels, 'panels[].items': c.panelItems },
        analysis: { blocks: c.blocks },
        chart: { points: c.points },
        process: { steps: c.steps },
        hierarchy: { levels: c.levels },
      }[f.role] ?? {}
    )
  },
}
