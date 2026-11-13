import { readFileSync } from 'node:fs'
import { assertDesignValue } from '../shared/design-contract.mjs'
import { compileForestLayout, resolveForestDeck } from './layouts.mjs'
export const FOREST_LAYOUTS = {
  cover: { hanging: ['stamp', 'hero', 'byline'], offset: ['stamp', 'hero', 'byline'] },
  index: { mosaic: ['title', 'tiles'], rows: ['title', 'tiles'] },
  quote: { broad: ['quote', 'attribution', 'details'], inset: ['quote', 'attribution', 'details'] },
  feature: { left: ['shell', 'title', 'body', 'meta'], right: ['shell', 'title', 'body', 'meta'] },
  chart: { full: ['title', 'legend', 'unit', 'plot'], rail: ['title', 'legend', 'unit', 'plot'] },
  process: { columns: ['title', 'steps'], rows: ['title', 'steps'] },
  stats: { band: ['title', 'stats'], rows: ['title', 'stats'] },
  matrix: { full: ['title', 'table', 'note'], inset: ['title', 'table', 'note'] },
  closing: { broad: ['title', 'items'], rail: ['title', 'items'] },
}
const schemaFor = (type) =>
  JSON.parse(readFileSync(new URL(`./schemas/${type}.schema.json`, import.meta.url), 'utf8'))
export function forestSpecimen(s, index = 0, maximum = false) {
  if (s['x-slotProbeValue'] !== undefined) return s['x-slotProbeValue']
  if (s.enum) return s.enum[0]
  if (s.type === 'object')
    return Object.fromEntries(
      Object.entries(s.properties).map(([k, v]) => [k, forestSpecimen(v, index, maximum)]),
    )
  if (s.type === 'array')
    return Array.from({ length: maximum ? s.maxItems : s.minItems }, (_, i) =>
      forestSpecimen(s.items, i, maximum),
    )
  if (s.type === 'number') return Math.max(1, s.minimum ?? 0, (s.exclusiveMinimum ?? 0) + 1)
  return 'x'
}
function assertForest(d, { assertFrame }) {
  const b = d.forest,
    seen = new Set()
  for (const [k, v] of Object.entries({
    paper: 'EFE7D4',
    ink: '2E4A2A',
    deep: '243A21',
    light: '3A5A36',
    accent: 'E89CB1',
    roseEdge: 'D27E96',
    pale: 'E6DCC4',
    body: '1A1A17',
  }))
    if (d.colors[k] !== v) throw Error(`Forest identity requires ${k} ${v}`)
  for (const [role, pair] of Object.entries({
    display: ['Georgia', 'Songti SC'],
    body: ['Georgia', 'Songti SC'],
    mono: ['JetBrains Mono', 'Noto Sans SC'],
  }))
    if (d.fonts[role]?.latin !== pair[0] || d.fonts[role]?.eastAsian !== pair[1])
      throw Error(`${role}: unregistered Forest font pair`)
  for (const [type, f] of Object.entries(b.families)) {
    const ex = FOREST_LAYOUTS[f.role]
    if (
      type !== `forest${f.role[0].toUpperCase()}${f.role.slice(1)}Slide` ||
      !ex ||
      seen.has(f.role)
    )
      throw Error(`${type}: unknown or duplicate Forest role`)
    seen.add(f.role)
    if (Object.keys(ex).join('|') !== Object.keys(f.variants).join('|'))
      throw Error(`${type}: unregistered layouts`)
    for (const [id, v] of Object.entries(f.variants)) {
      if (Object.keys(v.regions).sort().join('|') !== [...ex[id]].sort().join('|'))
        throw Error(`${type}.${id}: unregistered regions`)
      for (const [k, f] of Object.entries(v.regions)) assertFrame(d, f, `${type}.${id}.${k}`)
    }
  }
  if (seen.size !== 9) throw Error('Forest requires nine registered roles')
  for (const [k, v] of Object.entries(b.styles))
    if (!d.fonts[v.role] || !d.colors[v.color] || v.italic || v.sizePt < 11)
      throw Error(`${k}: upright readable registered typography required`)
  for (const [k, f] of Object.entries(b.chrome)) assertFrame(d, f, `forest.chrome.${k}`)
  for (const [k, v] of Object.entries(b.capacity))
    if (v.length !== 2 || v.some((n) => !Number.isInteger(n) || n < 1) || v[0] > v[1])
      throw Error(`${k}: invalid capacity`)
  if (b.spacing.rulePt !== 1) throw Error('Forest requires 1pt editorial rules')
}
function checkForest(d, op, fail) {
  if (op.op === 'add-chart' && op.kind !== 'column')
    fail('Only native clustered columns are registered')
  if (op.op === 'add-shape' && !['rectangle', 'ellipse'].includes(op.kind))
    fail('Unregistered shape')
  if (['add-image', 'add-group'].includes(op.op))
    fail('Forest registers native geometry and placeholder shells only')
  if (op.op === 'set-chart' && op.view3D) fail('Forest prohibits 3D')
  if (op.op === 'set-table' && (op.style?.horizontalBanding || op.style?.verticalBanding))
    fail('Open horizontal native table rules required')
  if (
    op.op === 'set-slide-background' &&
    (op.fill?.type !== 'solid' ||
      ![d.colors.paper, d.colors.ink, d.colors.accent].includes(op.fill.color))
  )
    fail('Unregistered paper surface')
  const walk = (v, k = '') => {
    if (!v || typeof v !== 'object') return
    if (k === 'font' && (v.italic || (v.underline && v.underline !== 'none')))
      fail('Typography must remain upright and without underline')
    if (k === 'fill' && ['gradient', 'pattern', 'picture'].includes(v.type))
      fail('Flat solid paper fills required')
    for (const [k, x] of Object.entries(v)) walk(x, k)
  }
  walk(op)
}
function budgets(d, f) {
  const type = Object.keys(d.forest.families).find((k) => d.forest.families[k] === f),
    schema = schemaFor(type),
    out = {}
  const add = (p, frame, st) => {
    if (!p?.startsWith('data.')) return
    const key = p.slice(5).replace(/\[\d+\]/g, '[]')
    let node = schema
    for (const k of key.replaceAll('[]', '.[]').split('.'))
      node = k === '[]' ? node?.items : node?.properties?.[k]
    if (node?.type !== 'string' || node['x-slotRole'] === 'control') return
    const v = {
      fontPt: st.sizePt,
      widthIn: frame[2],
      heightIn: frame[3],
      lineHeight: st.lineHeight,
      maxLines: Math.max(
        1,
        Math.floor(((frame[3] - 0.025) * 72) / (st.sizePt * (st.sizePt >= 23 ? 1.2 : 1.5))),
      ),
    }
    if (
      !out[key] ||
      v.widthIn < out[key].widthIn ||
      (v.widthIn === out[key].widthIn && v.heightIn < out[key].heightIn)
    )
      out[key] = v
  }
  let n = 0
  for (const [id, v] of Object.entries(f.variants)) {
    let plan
    try {
      plan = compileForestLayout(d, f.role, id, v.regions, forestSpecimen(schema, 0, true))
    } catch {
      continue
    }
    n++
    for (const c of plan.components) {
      if (c.bindings?.length) {
        for (const b of c.bindings) for (const p of b.paths) add(p, b.frame, b.style)
      } else if (c.style) {
        for (const p of c.paths ?? [c.path]) add(p, c.allocatedFrame ?? c.frame, c.style)
      }
      for (const p of c.inputPaths ?? []) add(p, [0, 0, c.frame[2] / 6, 0.5], d.forest.styles.small)
    }
  }
  if (!n) throw Error(`${type}: no valid projection specimen`)
  return out
}
export const FOREST_FAMILY = {
  key: 'forest',
  name: 'forest-editorial/v1',
  assert: assertForest,
  resolve: (d, c) =>
    resolveForestDeck(d, c, {
      validateData: (type, data, path) => {
        const s = schemaFor(type)
        assertDesignValue(data, s, s, path)
      },
    }),
  checks: { 'forest-language': checkForest },
  groups: {
    anchor: ['cover', 'closing'],
    editorial: ['index', 'quote', 'feature'],
    evidence: ['chart', 'stats', 'matrix'],
    process: ['process'],
  },
  projectedBudgets: budgets,
  projectedCapacities(d, f) {
    const c = d.forest.capacity
    return (
      {
        index: { items: c.items },
        feature: { paragraphs: c.paragraphs, metadata: c.metadata },
        chart: { categories: c.categories, series: c.series, 'series[].values': c.categories },
        process: { steps: c.steps },
        stats: { stats: c.stats },
        matrix: { columns: c.columns, rows: c.rows, 'rows[]': c.columns },
        closing: { items: c.takeaways },
      }[f.role] ?? {}
    )
  },
}
