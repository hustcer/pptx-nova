#!/usr/bin/env node
// Maintainer-only robustness matrix; all runs retain independent standard-runner evidence.
import fs from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const argv = process.argv.slice(2)
if (argv.includes('--help')) {
  console.log('Usage: node tools/pptx-nova-black-gold-matrix.mjs --out <new-directory>')
  process.exit(0)
}
if (argv.length !== 2 || argv[0] !== '--out') throw new Error('--out <new-directory> is required')
const out = resolve(argv[1])
if (fs.existsSync(out)) throw new Error('Output must be new; preserve old evidence')
fs.mkdirSync(out, { recursive: true })
const original = JSON.parse(
  fs.readFileSync('pptx-nova/assets/deckkits/black-gold/examples/content.json'),
)
const clone = structuredClone
const variants = { meta: { deckkit: 'black-gold', designScope: 'excerpt' }, slides: [] }
for (const [idx, ids] of [
  [2, ['wide', 'rail']],
  [5, ['rail', 'wide']],
])
  for (const layoutId of ids) {
    const s = clone(original.slides[idx])
    delete s.data.secondary
    s.layoutId = layoutId
    variants.slides.push(s)
  }
const stress = {
  meta: { deckkit: 'black-gold', designScope: 'excerpt' },
  slides: [clone(original.slides[4]), clone(original.slides[3]), clone(original.slides[5])],
}
const a = stress.slides[0].data
delete a.support
a.title = 'Zero, negatives and small observations retain their values'
a.chart = {
  kind: 'line',
  name: 'Boundary observations',
  unit: 'units',
  categories: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  values: [-40, 0, 0.000001, 0.25, 12, 120, 160, 180],
  focus: 7,
}
a.notes = [
  { heading: 'Raw values', body: 'Values are synthetic and remain editable in the native series.' },
  {
    heading: 'No missing-value coercion',
    body: 'Missing observations must be resolved before authoring.',
  },
]
const m = stress.slides[1].data
m.rows.push({
  name: 'Boundary sample',
  amount: -0.000001,
  share: 100,
  representative: 'Synthetic observation',
  thesis: 'Finite value retention',
})
m.rows[0].share = 0
m.title = 'A five-row matrix retains zero, negatives and a full share'
m.totalLabel = 'Synthetic capacity fixture · not a business total'
const b = stress.slides[2].data
b.chart.values = [-40, 0, 0.25, 1000000]
b.metrics.forEach((x) => (x.focus = false))
b.title = 'Ranking retains negative, zero and large observations'
b.chart.focus = 3
for (const s of stress.slides) {
  s.data.basis = 'Synthetic boundary values; no real-world claim'
  s.data.source = 'Source: synthetic validation'
  s.data.asOf = 'Test fixture'
  s.data.unit = s.data.chart?.unit ?? 'RMB 100m'
  s.data.verdict = 'Every displayed observation retains its original source number.'
}
b.metrics = [
  { value: '1,000,000', label: 'MAXIMUM VALUE', basis: b.chart.unit },
  { value: '1', label: 'ZERO OBSERVATIONS', basis: 'Of four source observations' },
  { value: '1', label: 'NEGATIVE OBSERVATIONS', basis: 'Of four source observations' },
]
const mixed = clone(original)
mixed.slides.forEach((s, i) => {
  s.data.title = [
    '具身智能资本观察：资金回升，交易广度仍然不足',
    '大额融资推动总量增长，早期份额继续上升',
    '融资额回升与交易笔数下行同时发生',
    '人形平台融资占比领先，交付能力仍需验证',
    '早期项目融资份额连续八个季度上升',
    '长三角凭大额交易领先，资金集中度高于交易密度',
    '前五大交易占比超过一半，退出样本仍然较小',
    '维持当前预算，只有证据达到阈值才增加配置',
  ][i]
  if (s.type !== 'ledgerCoverSlide') s.data.basis = '合成验证数据；仅用于检验设计语言与原生对象'
  s.data.source = '来源：合成测试样例'
  s.data.asOf = '2026年第一季度'
  s.data.unit = s.data.unit === '%' ? '%' : '亿元'
  if (s.type !== 'ledgerCoverSlide') s.data.verdict = '结论必须能由同页证据支持；本页仅为设计验证。'
  if (s.data.notes)
    s.data.notes = s.data.notes.map((n, j) => ({
      heading: ['总量变化', '结构解释', '集中度观察'][j] ?? '说明',
      body: '保留原始数值，直接标注类别，并明确统计口径。',
    }))
  if (s.data.judgments)
    s.data.judgments = s.data.judgments.map((n, j) => ({
      heading: ['融资总量回升', '早期份额提高', '后期估值持平'][j],
      body: '示例使用合成数据，以验证中文标题、判断与证据之间的层级关系。',
    }))
  if (s.data.rows) {
    s.data.headers = ['细分赛道', '融资额', '早期占比', '代表项目', '发展主线']
    s.data.rows.forEach((r, j) => {
      r.name = ['人形机器人平台', '核心零部件', '仿真与数据服务', '部署运营'][j]
      r.representative = `示例项目${j + 1}，资金来源已披露`
      r.thesis = '生产交付与持续验证'
    })
  }
  if (s.data.chart) {
    s.data.chart.name = s.data.chart.unit === '%' ? '早期融资占比' : '融资观察'
    s.data.chart.unit = s.data.chart.unit === '%' ? '%' : '亿元'
    if (s.type === 'ledgerRankingSlide')
      s.data.chart.categories = [
        '长三角产业协同与制造集群',
        '京津冀技术研发与转化平台',
        '粤港澳大湾区供应链项目',
        '其他地区公共应用示范区',
      ].slice(0, s.data.chart.values.length)
    if (s.data.chart.categories.length !== s.data.chart.values.length)
      s.data.chart.categories = s.data.chart.values.map((_, j) => `示例项目${j + 1}`)
  }
  if (s.data.metrics)
    s.data.metrics.forEach((x, j) => {
      x.label = ['融资规模', '交易观察', '结构占比'][j] ?? '指标'
      x.basis = '合成样例 · 同一统计口径'
    })
})
const cases = { variants, stress, mixed },
  result = []
for (const [name, content] of Object.entries(cases)) {
  const dir = resolve(out, name)
  fs.mkdirSync(dir)
  const write = (file, data) =>
    fs.writeFileSync(resolve(dir, file), JSON.stringify(data, null, 2) + '\n')
  write('content.json', content)
  const design = JSON.parse(fs.readFileSync('pptx-nova/assets/deckkits/black-gold/design.json'))
  write('deck_lock.json', {
    schemaVersion: 'pptx-nova-deck-lock/v1',
    mode: 'create',
    canvas: design.canvas,
    colors: design.colors,
    typography: design.fonts,
    outline: { purpose: 'Validate Black Gold contract robustness' },
    slides: content.slides.map((s) => ({
      slideType: s.type,
      title: s.data.title,
      purpose: 'Contract robustness',
      layoutIntent: 'Content-driven editorial composition',
      rhythm:
        s.type.includes('Cover') || s.type.includes('Summary') || s.type.includes('Decision')
          ? 'anchor'
          : 'dense',
      ...(s.data.chart
        ? {
            chart: { kind: s.data.chart.kind, source: s.data.source },
            claimTitle: s.data.title,
            proofObject: 'Native chart data',
          }
        : {}),
      ...(s.data.rows ? { table: { source: s.data.source, role: 'ledger matrix' } } : {}),
    })),
  })
  const run = spawnSync(
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
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
  fs.writeFileSync(resolve(dir, 'stdout.json'), run.stdout)
  fs.writeFileSync(resolve(dir, 'stderr.txt'), run.stderr)
  const summary = JSON.parse(run.stdout)
  const row = {
    name,
    exitCode: run.status,
    status: summary.status,
    error: summary.error,
    visuallyReviewed: false,
  }
  result.push(row)
  console.log(JSON.stringify(row))
}
fs.writeFileSync(resolve(out, 'matrix.json'), JSON.stringify(result, null, 2) + '\n')
if (result.some((r) => r.exitCode !== 0)) process.exitCode = 1
