import { readFileSync } from 'node:fs'
export const violetGolden = () =>
  JSON.parse(
    readFileSync(
      new URL(
        '../../../pptx-nova/assets/deckkits/violet-momentum/examples/content.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )
export function violetDifferentDomain(language = 'en') {
  const c = violetGolden()
  c.meta.designScope = 'excerpt'
  const cn = language !== 'en',
    mixed = language === 'mixed'
  const names = {
    title: cn
      ? mixed
        ? '社区学习：证据与行动 · Review'
        : '社区学习：证据与行动'
      : 'Community learning reaches its next milestone',
    eyebrow: cn ? '社区学习 / 合成验证' : 'COMMUNITY LEARNING / SYNTHETIC',
    description: cn
      ? '通过开放活动连接参与者，验证下一阶段的学习计划。'
      : 'Open workshops connect learners and inform the next program.',
    verdict: cn
      ? '先确认参与证据，再安排下一阶段资源。'
      : 'Confirm participation evidence before scheduling the next program.',
    metricHeading: cn ? '核心观察' : 'PROGRAM READOUT',
    period: cn ? '第三季度 · 合成示例' : 'Q3 · synthetic program',
    basis: cn ? '演示数据，不代表真实研究结论' : 'Illustrative workshop counts; no research claim',
    source: cn ? '来源：合成验证数据' : 'Source: synthetic program fixture',
    judgment: cn ? '参与稳步提升' : 'Participation grows',
    context: cn
      ? '对比三个学习项目的参与情况与下一步安排。'
      : 'Compare learning programs, participation and next steps.',
    unit: cn ? '人' : 'people',
    gapUnit: cn ? '人' : 'people',
    label: cn ? '参与人数' : 'Participants',
    targetLabel: cn ? '目标' : 'Target',
    statusLabel: cn ? '待复核' : 'Reviewed',
    seriesName: cn ? '参与人数' : 'Participants',
    beforeLabel: cn ? '前期截止' : 'Prior end',
    afterLabel: cn ? '本期开始' : 'Current start',
    totalLabel: cn ? '总增量' : 'Total gain',
    name: cn ? '学习项目' : 'Workshop',
    evidence: cn ? '活动记录完整，可追溯。' : 'Attendance records available.',
    action: cn ? '安排下一场开放活动。' : 'Schedule an open session.',
    blocker: cn ? '等待场地确认。' : 'Room confirmation pending.',
    owner: cn ? '项目团队' : 'Program team',
    date: cn ? '十月十五日' : 'Oct 15',
    impact: cn ? '新增十名参与者' : 'Ten additional learners',
    request: cn ? '批准活动资源' : 'Approve session resources',
    rationale: cn ? '支持下一阶段开放学习' : 'Support the next open program',
    consequence: cn ? '延迟将影响活动日期' : 'Delay changes the session date',
    decisionHeading: cn ? '资源决策' : 'Resource decisions',
  }
  const walk = (v, key = '') => {
    if (Array.isArray(v))
      return v.map((x, i) =>
        typeof x === 'string'
          ? key === 'headers'
            ? cn
              ? ['指标', '目标', '实际', '差异', '状态', '证据'][i]
              : 'Label ' + (i + 1)
            : cn
              ? '学习记录'
              : 'Program record'
          : walk(x, key),
      )
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]))
    if (typeof v === 'string')
      return key === 'state' ? 'neutral' : (names[key] ?? (cn ? '学习证据' : 'Program evidence'))
    return v
  }
  c.slides = c.slides.map((s) => ({ ...s, data: walk(s.data), layoutId: 'auto' }))
  c.slides.find((s) => s.type === 'violetSummarySlide').data.headers = cn
    ? ['指标', '实际', '目标', '差异', '状态']
    : ['Metric', 'Actual', 'Target', 'Gap', 'Status']
  c.slides
    .find((s) => s.type === 'violetTrendSlide')
    .data.points.forEach((p, i) => (p.label = cn ? `月${i + 1}` : `M${i + 1}`))
  return c
}
export function violetStress() {
  const c = violetDifferentDomain('mixed')
  c.slides.forEach((s) => (s.layoutId = 'auto'))
  const by = (t) => c.slides.find((s) => s.type === t).data
  const repeat = (a, n) => Array.from({ length: n }, (_, i) => structuredClone(a[i % a.length]))
  by('violetScorecardSlide').rows = repeat(by('violetScorecardSlide').rows, 6)
  by('violetRatingSlide').ratings = repeat(by('violetRatingSlide').ratings, 4)
  by('violetRatingSlide').ratings.forEach((v, i) => (v.position = [1, 5, 9, 10][i]))
  by('violetActionsSlide').phases = repeat(by('violetActionsSlide').phases, 4)
  by('violetActionsSlide').phases.forEach((v, i) => {
    v.date = '阶段' + (i + 1)
    v.label = ['准备', '试行', '扩展', '复核'][i]
  })
  by('violetSummarySlide').description =
    '参与人数增长，但场地与课程安排仍需进一步协调；先核对活动记录，再确定下一阶段资源。'
  by('violetCoverSlide').title = '社区学习项目复盘\n从参与证据到下一阶段行动'
  const trend = by('violetTrendSlide')
  trend.points = [-12, 0, 0.000001, 18.25, 27, 30, 35, 42, 50].map((value, i) => ({
    label: `月${i + 1}`,
    value,
  }))
  trend.events = [
    { index: 0, label: 'Signed start' },
    { index: 7, label: 'New session' },
  ]
  const at = by('violetAttributionSlide')
  at.drivers = [
    { label: '新增课程', value: 2, evidence: '合成参与增量' },
    { label: '取消场次', value: -1, evidence: '合成参与减少' },
    { label: '保持不变', value: 0, evidence: '零增量保留' },
    { label: '开放活动', value: 3, evidence: '合成参与增量' },
  ]
  at.total = 4
  const p = by('violetProjectsSlide')
  p.projects.forEach((v, i) => (v.progress = [0, 50, 100][i]))
  return c
}
