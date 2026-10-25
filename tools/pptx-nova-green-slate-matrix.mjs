#!/usr/bin/env node
// Maintainer-only fixtures and standard runner. Never overwrite previous evidence.
import fs from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log(
    'Usage: node tools/pptx-nova-green-slate-matrix.mjs --out <new-directory> [--cases golden,variants,stress,mixed,unrelated]',
  )
  process.exit(0)
}
if (
  ![2, 4].includes(args.length) ||
  args[0] !== '--out' ||
  (args.length === 4 && args[2] !== '--cases')
)
  throw Error('--out <new-directory> [--cases <comma-separated-names>] is required')
const out = resolve(args[1])
if (fs.existsSync(out)) throw Error('Output must be new; preserve old evidence')
fs.mkdirSync(out, { recursive: true })
const read = (p) => JSON.parse(fs.readFileSync(p))
const design = read('pptx-nova/assets/deckkits/green-slate/design.json')
const original = read('pptx-nova/assets/deckkits/green-slate/examples/content.json')
const clone = structuredClone
const n = (heading, body) => ({ heading, body })
const excerpt = (slides) => ({ meta: { deckkit: 'green-slate', designScope: 'excerpt' }, slides })
const range = clone(original.slides[2])
range.data.notes = [
  n('Plan conservatively', 'Use the lower bound as the planning case'),
  n('Test the upside', 'Scale only after usage is demonstrated'),
]
const flow = clone(original.slides[7])
flow.data.steps = [
  n('Observe', 'Record the baseline'),
  n('Design', 'Set the handoff and fallback'),
  n('Validate', 'Compare quality and adoption'),
]
flow.data.notes = [
  n('Keep records', 'Inputs and decisions remain traceable'),
  n('Assign ownership', 'An accountable owner approves expansion'),
]
const variants = excerpt([
  ...['rail', 'wide'].map((layoutId) => ({ ...clone(range), layoutId })),
  ...['vertical', 'horizontal'].map((layoutId) => ({ ...clone(flow), layoutId })),
])
const stress = excerpt([
  clone(original.slides[3]),
  clone(range),
  clone(original.slides[6]),
  clone(original.slides[9]),
  clone(original.slides[5]),
])
stress.slides[0].layoutId = 'full'
stress.slides[0].data.columns = ['Work item', 'Hours', 'Quality', 'Status', 'Owner', 'Action'].map(
  (heading) => ({ heading, weight: 1, align: 'left' }),
)
stress.slides[0].data.rows = [
  ['Negative sample', '-0.00000001', '99.8%', 'Review', 'Team A', 'Retain sign'],
  ['Zero sample', '0', '100%', 'Stable', 'Team B', 'Keep zero'],
  ['Small sample', '0.000001', '98.5%', 'Review', 'Team C', 'Keep precision'],
  ['Large sample', '1,000,000', '97.2%', 'Review', 'Team D', 'Keep magnitude'],
  ['Coverage', '120', '96.0%', 'Stable', 'Team E', 'Review scope'],
  ['Boundary', '240', '95.0%', 'Review', 'Team F', 'Verify owner'],
].map((cells) => ({ cells: cells.map((text) => ({ text, tone: 'normal' })) }))
stress.slides[0].data.title = 'Six rows retain exact values without shrinking the type'
stress.slides[0].data.basis = 'Synthetic boundary values · exact strings in native cells'
stress.slides[0].data.legend = 'Exact source strings; no selected operating mode is implied'
stress.slides[0].data.verdict =
  'Retain signs, zero and magnitude without changing the source strings'
stress.slides[1].layoutId = 'rail'
Object.assign(stress.slides[1].data.range, {
  categories: ['A', 'B', 'C', 'D', 'E', 'F'],
  low: [0, 2, 4, 6, 8, 10],
  high: [0, 4, 8, 12, 16, 20],
})
stress.slides[1].data.title = 'Six intervals retain zero and degenerate ranges'
stress.slides[2].data.chart.categories = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8']
stress.slides[2].data.chart.series = [
  { name: 'Scenario A', values: [-2, 0, 0.000001, 1, 2, 4, 8, 16] },
  { name: 'Scenario B', values: [-1, 0, 0.000002, 2, 3, 6, 10, 20] },
]
stress.slides[2].data.title = 'Eight native observations preserve signs and small values'
stress.slides[2].data.label = 'BOUNDARY OBSERVATIONS'
stress.slides[2].data.basis = 'Synthetic boundary series · original source values'
stress.slides[2].data.chart.name = 'Boundary observations'
stress.slides[2].data.chart.unit = 'units'
stress.slides[2].data.verdict =
  'Read precise observations from the editable series; the axis gives the overall scale'
stress.slides[2].data.notes = [
  n('Raw source values', 'Negative, zero and small observations remain in the editable series'),
  n('Display precision', 'An axis does not make every small observation separately visible'),
]
stress.slides[3].data.steps.push(n('Monitor', 'Review outcomes and refresh assumptions'))
stress.slides[3].data.title = 'Five method steps fit without reducing the body size'
stress.slides[4].data.phases = [
  { label: 'Discover', duration: 4, gate: 'G1 / scope ready' },
  { label: 'Pilot', duration: 4, gate: 'G2 / quality stable' },
  { label: 'Scale', duration: 8, gate: 'G3 / adoption proven' },
  { label: 'Sustain', duration: 8, gate: 'G4 / value accepted' },
]
for (const track of stress.slides[4].data.tracks)
  track.activities = ['Map evidence', 'Test controls', 'Expand scope', 'Review outcomes']
stress.slides[4].data.title = 'Four gates retain duration and operational ownership'
const mixed = clone(original)
const titles = [
  '服务转型：\n以实际采用验证价值',
  '先验证六条工作流，再分阶段释放产能',
  '结构化任务具备更高的产能改善空间',
  '判断保留人工责任，文档处理逐步自动化',
  '数据与责任边界就绪之后才能扩大部署',
  '先验证、再推广，最后调整运营方式',
  '持续采用之后，收益才可能超过投入',
  '先明确决策权，再扩大工作流范围',
  '方法论\n证据先于扩张',
  '四项检查将潜在机会转为受控试点',
  '使用情景分析\n保留独立判断',
  '从小范围开始\n衡量实际变化',
]
for (const [i, s] of mixed.slides.entries()) {
  const d = s.data
  d.title = titles[i]
  d.label = [
    '决策摘要',
    '管理层摘要',
    '机会评估',
    '任务重构',
    '准备度',
    '实施路线',
    '价值分析',
    '治理机制',
    '方法论',
    '诊断步骤',
    '阅读说明',
    '下一项决策',
  ][i]
  d.source = '来源：合成验证样例'
  d.asOf = '2026年10月22日'
  if (d.basis) d.basis = '合成测试数据 · 保留原始数值、统计口径与责任边界'
  if (d.verdict) d.verdict = '本页用于检验设计与原生对象，不代表实际经营结果'
  if (d.abstract) d.abstract = '以明确的证据、可编辑对象和可追溯的责任关系支持判断'
  if (d.callout) d.callout = '验证价值之后再扩大范围'
  if (d.metrics)
    d.metrics.forEach((m, j) => {
      m.label = (
        s.type === 'slateSummarySlide'
          ? ['产能改善空间', '优先工作流']
          : ['验证周期（月）', '试点任务（项）', '产能空间', '回收周期（月）']
      )[j]
      m.detail = '合成样例 · 口径保持一致'
    })
  for (const key of ['notes', 'findings', 'steps'])
    if (d[key])
      d[key].forEach((v, j) => {
        v.heading =
          ['记录原始证据', '明确判断边界', '复核实际结果', '验证责任归属'][j] ?? '持续监测'
        v.body = '保留原始记录与人工复核，达到质量标准之后再扩展'
      })
  if (d.range) {
    d.range.name = '各类任务的产能改善情景'
    d.range.categories = ['案件分流', '知识检索', '文档核验', '复杂争议']
    d.range.lowerLabel = '下界情景'
    d.range.spanLabel = '增量空间'
  }
  if (d.columns) {
    d.columns.forEach((c, j) => (c.heading = ['维度', '当前', '目标', '关键差距', '后续行动'][j]))
    d.rows.forEach((r, j) =>
      r.cells.forEach(
        (cell, k) =>
          (cell.text =
            k === 0
              ? ['数据', '接口', '治理', '人才'][j]
              : k === 1
                ? '待改善'
                : k === 2
                  ? '已明确'
                  : k === 3
                    ? '需要验证'
                    : '负责人复核后推进'),
      ),
    )
  }
  if (d.phases) {
    d.unit = '个月累计'
    d.phases.forEach((p, j) => {
      p.label = ['试点', '推广', '重构'][j]
      p.gate = '审查质量与实际采用'
    })
    d.tracks.forEach((track, j) => {
      track.label = ['平台', '人员', '控制'][j]
      track.activities = ['验证基础能力', '扩展受控范围', '复核持续成效']
    })
  }
  if (d.chart) {
    d.chart.name = '累计投入与情景收益'
    d.chart.unit = '百万美元'
    d.chart.series.forEach((v, j) => (v.name = ['累计投入', '累计收益'][j]))
  }
  if (d.investment) {
    d.investment.name = '投入分配'
    d.investment.unit = '百万美元'
    d.investment.categories = ['阶段一', '阶段二']
    d.investment.series.forEach((v, j) => (v.name = ['技术', '交付', '培训'][j]))
  }
  if (d.legend) d.legend = '薄荷绿表示目标或优选方式；玫红表示文字已注明的关键差距'
  if (d.paragraphs)
    d.paragraphs = [
      '本演示使用合成数据验证设计语言，不描述任何真实组织，也不构成经营预测。使用者应独立核对数据口径与假设。',
      '产能改善不等于现金节约。实际收益取决于采用程度、任务结构、控制要求和实施成本。请在决策前完成验证。',
    ]
  if (d.next) d.next = '批准试点\n明确验证边界'
  if (d.contact) d.contact = '工作团队 / 服务负责人\n在首个证据节点复核'
}
const unrelated = excerpt([clone(range), clone(original.slides[3]), clone(flow)])
Object.assign(unrelated.slides[0].data, {
  title: 'Compare habitat recovery across three field conditions',
  label: 'FIELD OBSERVATIONS',
  basis: 'Synthetic ecology scenario · coverage percentage',
  source: 'Synthetic field notebook',
  asOf: 'Survey fixture',
  verdict: 'Repeat the survey before choosing a restoration action',
  notes: [
    n('Compare like with like', 'Keep site size and observation dates consistent'),
    n('Record uncertainty', 'A range is an observation boundary, not a promise'),
  ],
})
Object.assign(unrelated.slides[0].data.range, {
  name: 'Observed habitat coverage',
  categories: ['Seeded plots', 'Restored sites', 'Control plots'],
  low: [12, 20, 8],
  high: [25, 38, 16],
  lowerLabel: 'Observed lower bound',
  spanLabel: 'Observed span',
})
const md = unrelated.slides[1].data
Object.assign(md, {
  title: 'Retain a named observation and action for every site',
  label: 'SITE REGISTER',
  basis: 'Synthetic habitat review',
  source: 'Synthetic field notebook',
  asOf: 'Survey fixture',
  verdict: 'Recheck each site after the next survey',
  legend: 'All entries are synthetic; words state the next action',
})
md.columns = ['Site', 'Coverage', 'Condition', 'Observer', 'Next action'].map((heading) => ({
  heading,
  weight: 1,
  align: 'left',
}))
md.rows = ['North', 'South', 'East'].map((name) => ({
  cells: [name, '24%', 'Recovering', 'Field team', 'Repeat survey'].map((text) => ({
    text,
    tone: 'normal',
  })),
}))
Object.assign(unrelated.slides[2].data, {
  title: 'Observe, compare and restore with a recorded baseline',
  label: 'FIELD METHOD',
  basis: 'Synthetic ecological workflow',
  source: 'Synthetic field notebook',
  asOf: 'Survey fixture',
  verdict: 'Choose a reversible intervention and repeat the same observation',
  steps: [
    n('Observe', 'Record a fixed survey area'),
    n('Compare', 'Use matched observation dates'),
    n('Restore', 'Record the intervention and revisit'),
  ],
  notes: [
    n('Protect comparability', 'Keep the survey method stable'),
    n('Keep the record', 'Save observations before intervention'),
  ],
})
const cases = { golden: original, variants, stress, mixed, unrelated },
  results = []
const selected = args[3]?.split(',') ?? Object.keys(cases)
if (selected.some((key) => !Object.hasOwn(cases, key))) throw Error('Unknown case name')
for (const [name, content] of Object.entries(cases)) {
  if (!selected.includes(name)) continue
  const dir = resolve(out, name)
  fs.mkdirSync(dir)
  const write = (file, data) =>
    fs.writeFileSync(resolve(dir, file), JSON.stringify(data, null, 2) + '\n')
  const slides = content.slides.map((s, i) => ({
    index: i,
    slideType: s.type,
    title: s.data.title,
    claimTitle: s.data.title,
    purpose: 'Verify reusable design under explicit illustrative assumptions',
    proofObject: {
      kind: s.data.range
        ? 'range-chart'
        : s.data.chart
          ? 'native-chart'
          : s.data.rows
            ? 'native-table'
            : s.data.phases
              ? 'phase-roadmap'
              : s.data.steps
                ? 'workflow'
                : 'editorial-hierarchy',
      proves: s.data.verdict ?? s.data.abstract,
    },
    source: s.data.source,
    rhythm: /Cover|Summary|Section|Closing|Notice/.test(s.type) ? 'anchor' : 'dense',
    layoutIntent: s.layoutId ?? design.strategy.families[s.type].role,
    visualDensity: s.data.rows ? 'high' : 'medium',
    ...(s.data.rows ? { table: { source: s.data.source, role: 'comparison matrix' } } : {}),
    ...(s.data.chart ? { chart: { kind: 'line', source: s.data.source } } : {}),
  }))
  write('outline.json', { purpose: 'Verify Green Slate design language', slides })
  write('deck_lock.json', {
    schemaVersion: 'pptx-nova-deck-lock/v1',
    mode: 'create',
    canvas: design.canvas,
    colors: design.colors,
    typography: design.fonts,
    deckProfile: { primary: 'strategy-leadership' },
    outline: { purpose: 'Verify Green Slate with synthetic scenarios' },
    assumptions: [
      'All sample data and decision statements are illustrative, not real organizational facts.',
    ],
    slides,
  })
  write('content.json', content)
  const r = spawnSync(
    process.execPath,
    [
      'pptx-nova/scripts/cli/create/run.mjs',
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
  fs.writeFileSync(resolve(dir, 'stdout.json'), r.stdout)
  fs.writeFileSync(resolve(dir, 'stderr.txt'), r.stderr)
  let summary
  try {
    summary = JSON.parse(r.stdout)
  } catch {
    summary = { status: 'invalid-output', error: r.stderr }
  }
  const row = {
    name,
    exitCode: r.status,
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
