import { readFileSync } from 'node:fs'
export const pulseExample = () =>
  JSON.parse(
    readFileSync(
      new URL(
        '../../../pptx-nova/assets/deckkits/midnight-pulse/examples/content.json',
        import.meta.url,
      ),
    ),
  )
export function pulseVariants() {
  const c = pulseExample()
  const ids = [
    'photoRail',
    'gaugeBand',
    'auditRail',
    'trendBand',
    'targetLeft',
    'compareRows',
    'statusColumns',
    'routeLeft',
  ]
  c.slides.forEach((s, i) => {
    s.layoutId = ids[i]
  })
  return c
}
export function pulseStress() {
  const c = pulseExample()
  c.slides.forEach((s, i) => {
    s.layoutId = [
      'widePhoto',
      'gaugeRail',
      'auditWide',
      'trendRail',
      'targetRight',
      'compareColumns',
      'statusRows',
      'routeTop',
    ][i]
  })
  const audit = c.slides[2].data
  audit.rows = Array.from({ length: 8 }, (_, i) => ({
    label: `Measure ${i + 1}`,
    target: '100',
    actual: String(i ? 90 + i : 100),
    variance: String(i ? i - 10 : 0),
    status: i ? 'Miss' : 'Met',
    state: i ? 'miss' : 'met',
    detail: `Evidence ${i + 1} is traceable`,
  }))
  const trend = c.slides[3].data
  trend.title = 'Capacity recovered after the initial reset'
  trend.emphasis = ['initial reset']
  trend.seriesName = 'Net capacity change'
  trend.unit = 'units'
  trend.points = [-12, 0, 0.00001, 20, 34, 48, 62, 72, 88, 100].map((value, i) => ({
    label: `M${i + 1}`,
    value,
  }))
  trend.events = [
    { index: 0, label: 'Reset', note: '① Initial value is negative' },
    { index: 8, label: 'Scale', note: '② Positive capacity has recovered' },
  ]
  const factors = c.slides[4].data
  factors.title = 'All six signed drivers reconcile the full cost gap'
  factors.emphasis = ['six signed drivers']
  factors.target = 3
  factors.actual = 6
  factors.factors = [1, 1, 0, 1, -1, 1].map((value, i) => ({
    label: `Driver ${i + 1}`,
    value,
    group: i < 3 ? 0 : 1,
    note: `Signed evidence ${i + 1}`,
  }))
  c.slides[5].data.subjects.forEach((s) => s.kv.push({ label: 'Quality', value: '98%' }))
  c.slides[6].data.projects.forEach((p, i) => {
    p.progress = [0, 100, 50][i]
  })
  return c
}
export function pulseLibrary({ mixed = false } = {}) {
  const c = pulseExample()
  const titles = mixed
    ? [
        '借阅增长，服务仍需改善',
        '阅读服务达标，周转仍有差距',
        '每项偏差均有可追溯证据',
        '阅读活动推动借阅持续回升',
        '资源差异由六项因素解释',
        '三个分馆需要不同改善措施',
        '每个项目均有责任人与期限',
        '先改善服务，再扩大活动覆盖',
      ]
    : [
        'Reading grew; service needs a reset',
        'Circulation met plan; two gaps remain',
        'Each library gap has a recovery path',
        'Reading events lifted circulation',
        'Four factors explain the resource gap',
        'Three branches need different actions',
        'Every library project has an owner',
        'Improve service before expanding events',
      ]
  for (let i = 0; i < c.slides.length; i++) {
    const d = c.slides[i].data
    d.owner = mixed ? '示例市立图书馆 · Demo' : 'SYNTHETIC · Civic Library'
    d.report = mixed ? '2026年第三季度' : 'Q3 2026 · Library demo'
    d.title = titles[i]
    d.emphasis = []
    if (d.basis)
      d.basis = mixed ? '合成数据 · Synthetic data' : 'Synthetic library service data · Q3 2026'
    d.source = mixed
      ? '来源：合成阅读服务数据，非真实事实'
      : 'Source: synthetic library service dataset; not factual results'
    d.verdict = mixed
      ? '先补齐服务短板，再扩大阅读活动覆盖'
      : 'Stabilize library service before expanding community events'
  }
  const labels = mixed
    ? ['借阅量', '周转时间', '服务覆盖率']
    : ['Circulation', 'Turnaround', 'Coverage']
  for (const index of [0, 1])
    c.slides[index].data.metrics.forEach((m, i) => {
      m.label = labels[i]
      m.unit = mixed ? ['千册', '分钟', '%'][i] : ['1k books', 'min', '%'][i]
    })
  Object.assign(c.slides[0].data, {
    subtitle: mixed
      ? '常规字体与粗体 · Regular and bold'
      : 'Reading access, service and next-period commitments',
    imageLabel: mixed
      ? '图书馆图片槽位 · Library photo'
      : 'Optional library photograph · content-owned',
  })
  Object.assign(c.slides[1].data, {
    judgment: mixed ? '一项达标，两项待改善' : 'One met; two to improve',
    notes: mixed
      ? ['借阅量超过计划', '周转时间仍需改善', '服务覆盖存在短板']
      : ['Circulation above plan', 'Turnaround needs improvement', 'Coverage remains uneven'],
    actualLabel: mixed ? '实际' : 'Actual',
    targetLabel: mixed ? '目标' : 'Target',
  })
  const a = c.slides[2].data
  a.headers = mixed
    ? ['指标', '目标', '实际', '偏差', '状态', '追溯说明']
    : ['Measure', 'Target', 'Actual', 'Variance', 'Status', 'Evidence']
  a.rows.forEach((r, i) =>
    Object.assign(r, {
      label: mixed
        ? ['借阅量', '周转时间', '覆盖率', '资源用量', '反馈率'][i]
        : ['Books · 1k', 'Turnaround · min', 'Coverage · %', 'Resources · units', 'Feedback · %'][
            i
          ],
      status: mixed ? (i ? '未达标' : '达标') : i ? 'Miss' : 'Met',
      detail: mixed ? '阅读服务记录可追溯' : 'Library register provides evidence',
    }),
  )
  a.note = mixed
    ? '各指标均保留目标、实际与单位'
    : 'Read each library measure against its stated target'
  const t = c.slides[3].data
  t.seriesName = mixed ? '借阅量' : 'Books circulated'
  t.unit = mixed ? '千册' : '1k books'
  if (mixed)
    t.points.forEach((p, i) => {
      p.label = `${i + 1}月`
    })
  t.events = [
    {
      index: 5,
      label: mixed ? '活动上线' : 'Reading event',
      note: mixed ? '① 阅读活动提升参与' : '① Community reading event begins',
    },
    {
      index: 7,
      label: mixed ? '延长开放' : 'Longer hours',
      note: mixed ? '② 开放时长支持借阅' : '② Extended opening improves access',
    },
  ]
  const f = c.slides[4].data
  Object.assign(f, {
    unit: mixed ? '单位／借阅' : 'units / loan',
    totalLabel: mixed ? '资源差异' : 'Resource gap',
    targetLabel: mixed ? '目标' : 'Target',
    actualLabel: mixed ? '实际' : 'Actual',
    groups: mixed ? ['临时投入', '持续改善'] : ['Temporary inputs', 'Service improvements'],
  })
  f.factors.forEach((v, i) =>
    Object.assign(v, {
      label: mixed
        ? ['图书修复', '开放时长', '阅读活动', '其他资源'][i]
        : ['Book repairs', 'Opening hours', 'Reading events', 'Other resources'][i],
      note: mixed ? '资源记录均可追溯' : 'Resource register supplies evidence',
    }),
  )
  Object.assign(c.slides[5].data, {
    overview: mixed ? '326 · 合成借阅量' : '326 · synthetic circulation',
    overviewNote: mixed ? '各分馆按同一口径比较' : 'Compare branches on a common library basis',
  })
  c.slides[5].data.subjects.forEach((s, i) => {
    s.name = mixed ? ['中央馆', '北区馆', '东区馆'][i] : ['Central', 'North', 'East'][i]
    s.status = mixed ? '待跟踪' : 'Review'
    s.diagnosis = mixed ? '改善阅读服务体验' : 'Improve reading service'
    s.kv = (
      mixed ? ['周转时间', '资源用量', '反馈率'] : ['Turnaround', 'Resources', 'Feedback']
    ).map((label, j) => ({ label, value: ['27 min', '4.5', '0.8%'][j] }))
  })
  c.slides[6].data.projects.forEach((p, i) =>
    Object.assign(p, {
      name: mixed
        ? ['检索系统', '阅读活动', '馆藏更新'][i]
        : ['Search renewal', 'Reading programme', 'Collection refresh'][i],
      status: mixed ? ['按计划', '有风险', '已延迟'][i] : ['On track', 'At risk', 'Behind'][i],
      evidence: mixed ? '阶段任务已完成' : 'Library milestone recorded',
      blocker: mixed ? '等待资源确认' : 'Resource review pending',
      action: mixed ? '完成下一阶段验证' : 'Verify next library milestone',
      owner: mixed ? '服务团队' : 'Library team',
      date: mixed ? '10月31日' : '31 Oct',
    }),
  )
  c.slides[7].data.phases.forEach((p, i) =>
    Object.assign(p, {
      period: mixed ? ['十月', '十一月', '十二月'][i] : ['October', 'November', 'December'][i],
      name: mixed ? ['改善', '扩展', '复核'][i] : ['Improve', 'Expand', 'Review'][i],
      milestone: mixed ? '完成关键阅读服务任务' : 'Complete library milestone',
      gate: mixed ? '达到服务目标后启动' : 'Meet stated service target',
    }),
  )
  c.slides[7].data.decisions.forEach((d, i) =>
    Object.assign(d, {
      label: mixed ? `决策${i + 1}` : `Decision ${i + 1}`,
      request: mixed ? '批准阅读服务改善计划' : 'Approve library service plan',
      detail: mixed ? '按阶段分配阅读服务资源' : 'Allocate reading-service resources',
      consequence: mixed ? '延迟影响活动启动' : 'Delay affects programme launch',
      owner: mixed ? '馆务团队' : 'Library lead',
      date: mixed ? '10月20日' : '20 Oct',
    }),
  )
  return c
}
