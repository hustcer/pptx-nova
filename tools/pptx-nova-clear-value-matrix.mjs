#!/usr/bin/env node
// Maintainer-only robustness fixtures. Every accepted page still needs actual visual review.
import fs from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const argv = process.argv.slice(2)
if (argv.includes('--help')) {
  console.log(
    'Usage: node tools/pptx-nova-clear-value-matrix.mjs --out <new-directory> [--cases golden,variants,stress,mixed,unrelated,chart-boundaries,matrix-variants]',
  )
  process.exit(0)
}
if (
  ![2, 4].includes(argv.length) ||
  argv[0] !== '--out' ||
  (argv.length === 4 && argv[2] !== '--cases')
)
  throw Error('Expected --out <new-directory> [--cases <names>]')
const out = resolve(argv[1])
if (fs.existsSync(out)) throw Error('Preserve prior evidence; output must be new')
const read = (p) => JSON.parse(fs.readFileSync(p)),
  clone = structuredClone,
  original = read('pptx-nova/assets/deckkits/examples/clear-value-content.json'),
  design = read('pptx-nova/assets/deckkits/clear-value/design.json'),
  n = (heading, body) => ({ heading, body }),
  excerpt = (slides) => ({ meta: { deckkit: 'clear-value', designScope: 'excerpt' }, slides })
const single = clone(original.slides[8])
single.data.notes = [n('Read the evidence', 'Keep the measurement basis stable')]
const argument = clone(original.slides[11])
argument.data.paragraphs = [
  n('Record evidence', 'Keep original observations and an explicit comparison basis.'),
  n('Name assumptions', 'Write the conditions that would change the interpretation.'),
  n('Assign ownership', 'Record the next review and the person responsible.'),
]
const variants = excerpt([
  ...['rail', 'wide'].map((layoutId) => ({ ...clone(single), layoutId })),
  ...['column', 'split'].map((layoutId) => ({ ...clone(argument), layoutId })),
])
const stress = excerpt([
  clone(original.slides[5]),
  clone(original.slides[2]),
  clone(single),
  clone(original.slides[6]),
  clone(argument),
])
stress.slides[0].data.title = 'Seven by seven cells retain exact signs and precision'
stress.slides[0].data.columns = Array.from({ length: 7 }, (_, i) => ({
  heading: `C${i + 1}`,
  weight: 1,
  align: i ? 'right' : 'left',
}))
stress.slides[0].data.rows = Array.from({ length: 7 }, (_, i) => ({
  cells: Array.from({ length: 7 }, (_, j) => ({
    text:
      j === 0
        ? `Row ${i + 1}`
        : i === 0 && j === 1
          ? '-0.00000001'
          : j === 2
            ? '0'
            : `${(i + 1) * (j + 1)}.25`,
    tone: 'normal',
  })),
}))
stress.slides[0].data.note = 'Literal cells retain negative signs, zero and source precision.'
stress.slides[0].data.verdict =
  'Read the original source strings before aggregating the synthetic observations'
stress.slides[1].data.title = 'Four independent figures test one claim from different angles'
stress.slides[1].data.charts = [0, 1, 2, 3].map((i) => ({
  label: `0${i + 1}`,
  name: ['Output', 'Cost', 'Coverage', 'Quality'][i],
  basis: 'Synthetic boundary fixture',
  unit: 'units',
  kind: 'column',
  categories: ['Earlier', 'Current'],
  series: [{ name: 'Measured', values: [10 + i, 12 + i], tone: 'history' }],
  focus: 1,
}))
stress.slides[1].data.notes = []
stress.slides[2].layoutId = 'rail'
stress.slides[2].data.title = 'Native observations retain negatives, zero and small values'
stress.slides[2].data.charts[0].categories = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8']
stress.slides[2].data.charts[0].series[0].values = [-2, 0, 0.00000001, 1, 2, 4, 8, 16]
stress.slides[2].data.notes = [
  n(
    'Raw values remain native',
    'The shared scale does not make every tiny value separately visible.',
  ),
]
stress.slides[2].data.verdict =
  'Use editable series for exact observations; the linear axis summarizes the overall scale'
stress.slides[3].data.phases = [1, 2, 3, 4].map((duration, i) => ({
  label: `Stage ${i + 1}`,
  duration,
  detail: `Duration ${duration} units`,
}))
stress.slides[3].data.title = 'Unequal durations control four phase widths'
stress.slides[4].data.paragraphs.push(
  n('Revisit results', 'Compare the new record with the same original measurement basis.'),
)
stress.slides[4].layoutId = 'split'
const mixed = clone(original)
const titles = [
  '清晰价值\n证据先于判断',
  '可靠证据支持判断，明确边界决定节奏',
  '不同证据支持同一结论，口径仍须分别核对',
  '基准情景决定行动，不利情景约束边界',
  '区分收益来源，保留每一项假设',
  '每项调整都有来源，每个判断都有依据',
  '分阶段执行，让行动保持可观察和可调整',
  '批准有限行动，同时明确四项约束',
  '观察经营基础，验证变化是否持续',
  '历史是观察，预测是有条件的假设',
  '构成与规模回答不同的问题',
  '清晰的决策保留改变判断的条件',
]
for (const [i, s] of mixed.slides.entries()) {
  const d = s.data
  d.title = titles[i]
  d.basis = '合成验证情景 · 保留原始数据与解释边界'
  d.source = '来源：合成验证工作簿'
  d.asOf = '2026年10月22日'
  d.verdict = '仅用于验证设计与原生对象；实际决策须核对来源、假设和责任'
  if (d.abstract) d.abstract = '基于证据的研究审查\n记录口径、保留假设、明确下一项行动'
  if (d.metrics)
    d.metrics.forEach((m, j) => {
      m.label = ['审查周期（月）', '情景收益区间', '回撤预算', '配置总权重'][j]
      m.detail = '合成情景，非实际预测'
    })
  for (const key of ['items', 'notes', 'paragraphs'])
    if (d[key])
      d[key].forEach((x, j) => {
        x.heading =
          ['记录原始证据', '明确判断边界', '复核实际结果', '指定责任归属'][j] ?? '继续复核'
        x.body = '保留原始记录与人工复核，达到已约定的质量标准之后再推进。'
        if (x.emphasis) x.heading = '1.27倍：观察值变化'
      })
  if (d.side)
    d.side.forEach((x, j) => {
      x.label = ['依据与口径保持一致', '责任人复核后推进', '在下个节点重新审查'][j]
      if (s.type === 'valueDecisionSlide') x.value = ['执行之前', '每个阶段之后', '每季度'][j]
    })
  if (d.charts)
    d.charts.forEach((ch, j) => {
      ch.name = ['观察与参照', '构成与变化', '覆盖与质量', '趋势比较'][j]
      ch.basis = '合成验证样例'
      ch.unit = '单位'
      ch.categories = ch.categories.map((_, k) => `类别${k + 1}`)
      ch.series.forEach((ss, k) => (ss.name = ['观察', '参照', '其他', '补充'][k]))
    })
  if (d.columns) {
    d.tableName = '数据记录与后续行动'
    d.columns.forEach(
      (c, j) => (c.heading = ['对象', '数值', '口径', '参照', '后续行动', '责任', '状态'][j]),
    )
    d.rows.forEach((row, j) =>
      row.cells.forEach((c, k) => {
        if (k === 0) c.text = `对象${j + 1}`
        else if (d.columns[k].align === 'left') c.text = '责任人复核后推进'
      }),
    )
    d.note = '附注：保留完整来源口径，数值为合成样例。'
  }
  if (d.phases)
    d.phases.forEach((p, j) => {
      p.label = ['建立基线', '验证效果', '完成复核'][j]
      p.detail = '按已批准的范围推进'
    })
}
const unrelated = excerpt([clone(single), clone(original.slides[3]), clone(original.slides[7])])
const ec = unrelated.slides[0].data
Object.assign(ec, {
  title: 'Repeat habitat observations before choosing an intervention',
  basis: 'Synthetic ecology notebook · matched field periods',
  source: 'Synthetic field notebook',
  asOf: 'Survey fixture',
  verdict: 'Keep the observation method stable before interpreting change',
  notes: [n('Keep the baseline', 'Record the same observation area and collection method.')],
})
ec.charts[0] = {
  label: '01',
  name: 'Observed habitat cover',
  basis: 'Matched synthetic field samples',
  unit: 'percent',
  kind: 'line',
  categories: ['Visit 1', 'Visit 2', 'Visit 3', 'Visit 4'],
  series: [{ name: 'Coverage', values: [18, 21, 22, 25], tone: 'secondary' }],
}
const md = unrelated.slides[1].data
Object.assign(md, {
  title: 'Every field site retains a measurement and a next action',
  basis: 'Synthetic habitat survey',
  source: 'Synthetic field notebook',
  asOf: 'Survey fixture',
  verdict: 'Revisit each site using the same survey method',
  tableName: 'Site register',
  note: 'Synthetic field records; no market or allocation assumptions.',
})
md.columns = ['Site', 'Coverage', 'Condition', 'Observer', 'Next action'].map((heading, i) => ({
  heading,
  weight: i === 4 ? 2 : 1,
  align: i === 1 ? 'right' : 'left',
}))
md.rows = ['North', 'South', 'East'].map((name) => ({
  cells: [name, '24%', 'Recovering', 'Field team', 'Repeat survey'].map((text) => ({
    text,
    tone: 'normal',
  })),
}))
const dd = unrelated.slides[2].data
Object.assign(dd, {
  title: 'Approve a reversible restoration trial with named reviews',
  basis: 'Synthetic ecological review',
  source: 'Synthetic field notebook',
  asOf: 'Survey fixture',
  verdict: 'Decision requested: approve a bounded trial and retain the field record',
  items: [
    n('Observe', 'Record the matched survey area.'),
    n('Intervene', 'Choose one reversible intervention.'),
    n('Revisit', 'Repeat the same measurement.'),
  ],
  side: [
    { value: 'Before trial', label: 'Field lead records baseline', focus: false },
    { value: 'After trial', label: 'Review team compares observations', focus: false },
  ],
})
const boundaries = excerpt([clone(single), clone(single), clone(single)])
boundaries.slides.forEach((s) => {
  s.layoutId = 'wide'
  s.data.notes = []
})
boundaries.slides[0].data.title = 'Eight components retain readable native ring labels'
boundaries.slides[0].data.charts = [
  {
    label: '01',
    name: 'Composition boundary',
    basis: 'Synthetic components',
    unit: 'units',
    kind: 'donut',
    categories: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    series: [{ name: 'Composition', values: [32, 21, 16, 11, 8, 5, 4, 3], tone: 'history' }],
    focus: 1,
  },
]
boundaries.slides[1].data.title = 'Four series preserve eight category comparisons'
boundaries.slides[1].data.charts = [
  {
    label: '01',
    name: 'Grouped series boundary',
    basis: 'Synthetic comparison',
    unit: 'units',
    kind: 'column',
    categories: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'],
    series: ['current', 'secondary', 'history', 'negative'].map((tone, i) => ({
      name: `S${i + 1}`,
      tone,
      values: Array.from({ length: 8 }, (_, j) => 10 + i * 3 + j),
    })),
  },
]
boundaries.slides[2].data.title = 'A zero area omits the circle and retains the source label'
boundaries.slides[2].data.charts = [
  {
    label: '01',
    name: 'Measured magnitude',
    basis: 'Synthetic comparison',
    unit: 'units',
    kind: 'circles',
    categories: ['Earlier', 'Current'],
    series: [{ name: 'Scale', values: [100, 0], tone: 'current' }],
  },
]
for (const s of boundaries.slides)
  s.data.verdict = 'Boundary fixture: inspect every label against the exact native source values'
const matrixVariants = excerpt(
  ['full', 'compact'].map((layoutId) => ({ ...clone(original.slides[3]), layoutId })),
)
const cases = {
    golden: original,
    variants,
    stress,
    mixed,
    unrelated,
    'chart-boundaries': boundaries,
    'matrix-variants': matrixVariants,
  },
  selected = argv[3]?.split(',') ?? Object.keys(cases)
if (selected.some((k) => !Object.hasOwn(cases, k))) throw Error('Unknown case')
fs.mkdirSync(out, { recursive: true })
const results = []
for (const [name, content] of Object.entries(cases)) {
  if (!selected.includes(name)) continue
  const dir = resolve(out, name)
  fs.mkdirSync(dir)
  const write = (name, v) => fs.writeFileSync(resolve(dir, name), JSON.stringify(v, null, 2) + '\n')
  write('content.json', content)
  const slides = content.slides.map((s, index) => ({
    index,
    slideType: s.type,
    title: s.data.title,
    claimTitle: s.data.title,
    purpose: 'Verify reusable annual-report evidence under synthetic assumptions',
    proofObject: {
      kind: s.data.charts
        ? 'native-chart'
        : s.data.rows
          ? 'native-table'
          : s.data.phases
            ? 'phase-timeline'
            : 'editorial-argument',
      proves: s.data.verdict,
    },
    source: s.data.source,
    rhythm: /Cover|Summary|Decision|Argument/.test(s.type) ? 'anchor' : 'dense',
    layoutIntent: s.layoutId === 'auto' ? design.annual.families[s.type].role : s.layoutId,
    visualDensity: s.data.rows ? 'high' : 'medium',
    ...(s.data.rows ? { table: { source: s.data.source, role: 'comparison matrix' } } : {}),
  }))
  write('outline.json', { purpose: 'Verify Clear Value design language', slides })
  write('deck_lock.json', {
    schemaVersion: 'pptx-nova-deck-lock/v1',
    mode: 'create',
    canvas: design.canvas,
    colors: design.colors,
    typography: design.fonts,
    deckProfile: { primary: 'strategy-leadership' },
    outline: { purpose: 'Verify native evidence under synthetic scenarios' },
    assumptions: [
      'All examples are synthetic validation data, not financial or ecological advice.',
    ],
    slides,
  })
  const result = spawnSync(
    process.execPath,
    [
      'pptx-nova/scripts/pptx-nova-create-run.mjs',
      '--content',
      resolve(dir, 'content.json'),
      '--lock',
      resolve(dir, 'deck_lock.json'),
      '--output',
      resolve(dir, 'reviewed.pptx'),
      '--run-dir',
      resolve(dir, 'run'),
      '--progress',
      'off',
      '--json',
    ],
    {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, XDOC_FIELD_DATE: '2026-10-22' },
    },
  )
  fs.writeFileSync(resolve(dir, 'stdout.json'), result.stdout)
  fs.writeFileSync(resolve(dir, 'stderr.txt'), result.stderr)
  let summary
  try {
    summary = JSON.parse(result.stdout)
  } catch {
    summary = { status: 'invalid-output', error: result.stderr }
  }
  const row = {
    name,
    exitCode: result.status,
    status: summary.status,
    error: summary.error,
    visuallyReviewed: false,
  }
  results.push(row)
  console.log(JSON.stringify(row))
}
fs.writeFileSync(resolve(out, 'matrix.json'), JSON.stringify(results, null, 2) + '\n')
process.exitCode = results.every((r) => r.exitCode === 0 && r.status === 'needs-visual-review')
  ? 0
  : 1
