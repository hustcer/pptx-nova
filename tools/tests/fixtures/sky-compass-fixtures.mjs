import { readFileSync } from 'node:fs'
import {
  DESIGN,
  createDeck,
} from '../../../pptx-nova/assets/deckkits/sky-compass/sky-compass.kit.mjs'
const root = new URL('../../../pptx-nova/assets/deckkits/', import.meta.url)
export const skyGolden = () =>
  JSON.parse(readFileSync(new URL('sky-compass/examples/content.json', root)))
export function skyVariants() {
  const c = skyGolden()
  for (const s of c.slides) s.layoutId = Object.keys(DESIGN.sky.families[s.type].variants)[1]
  return c
}
const titles = [
  '纺织产线复盘：产能提升与交付恢复',
  '本期产量达标，质量仍有改进空间',
  '生产结构集中，辅助环节需要支持',
  '工序偏差同时保留零值与正负变化',
  '交接等待仍是周期改善的关键',
  '三项原因完整解释本期交付差异',
  '三个责任明确的行动推动产线改善',
  '试验产线具备可跟踪的恢复路径',
  '实绩与计划在报告边界清楚分开',
  '具名驱动因素解释完整变化',
  '统一口径让生产台账可以回查',
  '批准资源与接口以守住改善目标',
]
export function skyStressBusiness() {
  const c = skyGolden()
  c.slides[0].data.metrics.push({ label: 'Yield', actual: 95, target: 96, unit: '%' })
  c.slides[5].data.issues.push({
    status: 'amber',
    statusLabel: 'Monitor',
    label: 'Scheduling',
    evidence: 'One controlled pilot needs review.',
    attribution: 0.2,
    owner: 'Plant lead',
    date: '15 Aug',
    action: 'Review the schedule.',
  })
  c.slides[5].data.gap = 2.2
  c.slides[9].data.drivers.push(
    { label: 'Training', value: 0 },
    { label: 'Scheduling', value: -0.2 },
  )
  c.slides[9].data.closing = 95.8
  const table = c.slides[10].data
  table.columns.push({ label: 'Review', weight: 1.5, align: 'left' })
  table.rows.forEach((r) => r.push('Checked'))
  while (table.rows.length < 8) table.rows.push(['Pilot', '1', '2', 'Controlled sample', 'Checked'])
  c.slides[11].data.items.push({
    request: 'Approve a pilot review',
    rationale: 'A stable trial supports the next stage.',
    owner: 'Plant lead',
    date: '30 Sep',
    consequence: 'The next stage moves by one cycle.',
  })
  const common = (key) =>
    ({
      section: '产线复盘',
      basis: '合成验证样本，统计范围保持一致',
      period: '2026年第二季度',
      source: '来源：合成纺织产线验证数据',
      verdict: '优先减少返工，并在下次复盘核对改善结果',
      masthead: '纺织产线季度复盘 · 合成验证版',
      reportLabel: '季度生产回顾',
      description: '合成样本用于检验产能、质量和责任链的表达能力。',
      context: '产量与质量使用同一统计范围，所有数据均为测试样本。',
      seriesName: '本期偏差',
      baselineName: '上期基准',
      changeLabel: '变化',
      mixNote: '组成合计为100%，所有类别采用同一统计范围',
      totalLabel: '处理周期',
      targetLabel: '目标周期',
      targetMarkerLabel: '平均目标不超过',
      reconciliationLabel: '归因核对',
      observedLabel: '实绩截至',
      planLabel: '计划开始',
      levelUnit: '%',
      openingLabel: '期初',
      closingLabel: '期末',
      methodology: '各列使用同一测试口径，真实报告必须提供自己的定义。',
      commitment: '批准必要资源，并在下一次月度复盘确认实施效果',
    })[key]
  function transform(v, s, key, mixed, index = 0) {
    if (s?.['x-slotRole'] === 'control') return v
    if (Array.isArray(v)) return v.map((x, i) => transform(x, s?.items, key, mixed, i))
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, transform(x, s?.properties?.[k], k, mixed, index)]),
      )
    if (typeof v !== 'string') return v
    if (common(key)) return common(key)
    const terms = {
      label: mixed ? '产线 Line ' + String.fromCharCode(65 + index) : '生产环节' + (index + 1),
      heading: mixed ? '产线检查 / Pilot review' : '关键工序的验证结果',
      body: mixed
        ? '产线 A uses a shared check for stable output.'
        : '合成产线样本显示返工仍需持续跟踪。',
      unit: '%',
      statusLabel: '跟踪中',
      statusNote: '本期验证结果',
      note: '按同一口径核对生产记录。',
      detail: '基准同期采用相同的统计范围。',
      evidence: mixed ? '试验记录 / controlled batch' : '试验记录支持后续复核。',
      owner: '制造主管',
      date: '8月15日',
      dateLabel: ['七月十五日', '八月三十一日', '九月三十日'][index % 3],
      action: '按计划完成复核',
      impact: '减少一个重复检查环节',
      dependency: '需要资源审批',
      request: '批准试验产线资源',
      rationale: '关键工序需要稳定的支持能力。',
      consequence: '审批延误将推迟下一轮试验。',
      value: '试验产线 A',
    }
    return terms[key] ?? (mixed ? '产线 Batch ' + (index + 1) : '试验记录' + (index + 1))
  }
  for (const [i, slide] of c.slides.entries()) {
    const schema = JSON.parse(
      readFileSync(new URL(`sky-compass/schemas/${slide.type}.schema.json`, root)),
    )
    slide.data = transform(slide.data, schema, 'data', i % 2 === 1)
    slide.data.title = titles[i] + (i % 2 === 1 ? ' / Pilot' : '')
    if (i === 0) {
      slide.data.title = '纺织产线\n季度运营复盘'
      slide.layoutId = 'rail'
    } else slide.layoutId = Object.keys(DESIGN.sky.families[slide.type].variants)[i % 2]
  }
  c.slides[3].data.unit = '小时'
  c.slides[3].data.points.forEach((v, i) => {
    v.value = [-2, 0, 1e-7, 3, 4, 6][i]
    v.baseline = [-1, 0, 0, 2, 5, 6][i]
    v.label = ['纺纱', '织造', '染整', '裁剪', '包装', '其他'][i]
  })
  c.slides[4].layoutId = 'vertical'
  c.slides[4].data.steps.forEach((v, i) => {
    v.duration = [0, 3, 6, 12, 0][i]
    v.label = ['到达', '排队', '处理', '交接', '完成'][i]
  })
  c.slides[4].data.unit = '分钟'
  c.slides[0].data.metrics.forEach((v, i) => {
    v.label = ['产出总量', '自动化占比', '准时交付', '成品良率'][i]
    v.unit = i === 0 ? '千件' : '%'
  })
  c.slides[1].data.headers = ['指标', '目标', '实绩', '达成率', '状态', '证据']
  c.slides[1].data.metrics.forEach((v, i) => {
    v.label = ['产出总量', '自动化占比', '准时交付', '质检评分'][i]
    v.unit = ['千件', '%', '%', '分'][i]
    v.statusLabel = ['达标', '达标', '恢复中', '关注'][i]
  })
  c.slides[2].data.seriesName = '工序工作量占比'
  c.slides[2].data.points.forEach((v, i) => (v.label = ['前处理', '织造', '后整理'][i]))
  c.slides[5].data.headers = ['状态', '问题', '证据', '归因', '负责人/日期', '行动']
  c.slides[5].data.unit = 'pp'
  c.slides[5].data.gap = 2
  c.slides[5].data.issues.forEach((v, i) => {
    v.label = ['交接返工', '设备故障', '排程偏差'][i]
    v.attribution = [1.1, 0.7, 0.2][i]
    v.statusLabel = i ? '关注' : '恢复中'
  })
  c.slides[6].data.ticks.forEach((v, i) => (v.label = ['七月', '八月', '九月'][i]))
  c.slides[6].data.items.forEach((v, i) => {
    v.label = ['设备巡检', '交接清单', '培训引导'][i]
    v.unit = ['次故障', '%返工', '%通过'][i]
    v.impact = ['降低高峰期停机风险', '恢复准时交付率', '提升培训一次通过率'][i]
    v.dependency = ['班组权限内实施', '审批一：人员支持', '审批二：质量接口'][i]
  })
  c.slides[7].data.metadata = [
    { label: '位置', value: '东侧车间' },
    { label: '规模', value: '12台织机' },
    { label: '阶段', value: '试生产' },
    { label: '下个里程碑', value: '8月31日' },
  ]
  c.slides[7].data.items.forEach((v, i) => {
    v.heading = ['试生产 / Pilot check', '接口依赖有责任人', '下一道闸门可量化'][i]
    v.action = ['复核剩余工序', '完成接口审批', '复盘试生产'][i]
  })
  c.slides[7].data.statusLabel = '关注'
  c.slides[8].data.seriesName = '按期交付率'
  c.slides[8].data.points.forEach(
    (v, i) => (v.label = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月'][i]),
  )
  c.slides[9].data.unit = 'pp'
  c.slides[9].data.drivers.forEach((v, i) => {
    v.label = ['清单', '设备', '培训', '排程'][i]
    v.value = [1.2, 1, 0, -0.2][i]
  })
  c.slides[9].data.closing = 96
  c.slides[10].data.columns.forEach(
    (v, i) => (v.label = ['指标', '上期', '本期', '定义', '复核'][i]),
  )
  c.slides[10].data.rows = [
    ['产量', '1210千件', '1286千件', '验收成品量', '已复核'],
    ['自动化占比', '49%', '54%', '自动流程比率', '已复核'],
    ['准时交付', '94%', '96%', '约定期内完成', '已复核'],
    ['质检评分', '4.5分', '4.6分', '质检平均评分', '已复核'],
    ['交接耗时', '24分钟', '20分钟', '工序交接时间', '已复核'],
    ['返工率', '8%', '6%', '重复加工比例', '已复核'],
    ['设备可用率', '96%', '98%', '计划时间可用', '已复核'],
    ['能耗指数', '102', '100', '同口径能耗', '已复核'],
  ]
  c.slides[11].data.headers = ['决策事项', '依据', '负责人/日期', '延误成本']
  c.slides[11].data.items.forEach(
    (v, i) => (v.request = ['批准高峰班组', '开放质量接口', '批准试验复盘'][i]),
  )
  return c
}
export function skyGeometryCoverage() {
  const a = createDeck(skyGolden()).designPlan.layouts,
    b = createDeck(skyVariants()).designPlan.layouts
  return a.map((v, i) => ({
    type: v.slideType,
    primary: v.layoutId,
    alternate: b[i].layoutId,
    distinct: v.fingerprint !== b[i].fingerprint,
  }))
}
