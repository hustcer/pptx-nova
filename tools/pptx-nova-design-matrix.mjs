#!/usr/bin/env node
// Maintainer validation matrix. Every run allocates fresh evidence directories.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const argv = process.argv.slice(2)
if (argv.includes('--help')) {
  console.log(
    'Usage: node tools/pptx-nova-design-matrix.mjs --out <new-directory> [--content <evidence-content.json>]',
  )
  process.exit(0)
}
const args = {}
for (let i = 0; i < argv.length; i++) {
  if (!['--out', '--content'].includes(argv[i]) || !argv[i + 1]) {
    throw new Error(`Unknown/incomplete argument ${argv[i]}`)
  }
  args[argv[i].slice(2)] = argv[++i]
}
if (!args.out) throw new Error('--out is required')
const out = resolve(args.out)
if (existsSync(out)) {
  throw new Error('Matrix output must be a new directory; preserve previous evidence')
}
mkdirSync(out, { recursive: true })
const write = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
const content = JSON.parse(
  readFileSync(
    resolve(
      args.content ??
        fileURLToPath(
          new URL(
            '../pptx-nova/assets/deckkits/examples/biennale-yellow-evidence-content.json',
            import.meta.url,
          ),
        ),
    ),
    'utf8',
  ),
)
const variants = structuredClone(content)
const stress = structuredClone(content)
const mixed = structuredClone(content)
const long = {
  meta: structuredClone(content.meta),
  slides: Array.from({ length: 8 }, () => ({
    ...structuredClone(content.slides[0]),
    layoutId: 'auto',
  })),
}
stress.slides.forEach((slide, i) => {
  slide.layoutId = 'auto'
  slide.data.kind = i === 1 ? 'line' : 'bar'
  slide.data.title = [
    'Zero and negative values remain meaningful',
    'Ten observations retain their raw values',
    'Wide ranges retain exact source numbers',
  ][i]
  const values =
    i === 2
      ? [0, 0.000001, 1.23456789012345, 1234567890123]
      : [-40, 0, 0.25, 12, 45, 89, 120, 150, 160, 180]
  slide.data.points = values.map((value, n) => ({
    label: `P${n + 1}`,
    value,
    emphasis: n === values.length - 1,
  }))
  slide.data.label = 'SYNTHETIC VALIDATION'
  slide.data.source = 'Source: synthetic regression fixture · no real-world claim'
  slide.data.unit = 'units'
  slide.data.seriesName = 'Boundary value'
  slide.data.stats = [
    {
      value: String(values.length),
      suffix: '',
      label: 'OBSERVATIONS',
      description: 'Synthetic points verify data retention.',
    },
    {
      value: i === 2 ? '18' : '1',
      suffix: i === 2 ? 'orders' : '',
      label: i === 2 ? 'RANGE IN MAGNITUDE' : 'ZERO VALUES',
      description: 'Raw numbers remain in the native chart.',
    },
  ]
})
mixed.slides.forEach((slide, i) => {
  slide.layoutId = 'auto'
  slide.data.title = [
    '文化场馆参与人数持续增长',
    '从公共项目观察长期回访与交流',
    'Participation grows across communities',
  ][i]
  slide.data.label = '公共文化计划 · 2022—2026'
  slide.data.unit = '人'
  slide.data.seriesName = '年度参与人数'
  slide.data.source = '来源：年度参与记录 · 统计口径：实际到访人次'
  slide.data.points = [120, 180, 215, 320, 410].map((value, n) => ({
    label:
      i === 0
        ? `第${n + 1}年`
        : [
            '公共展览与社区共同创作项目',
            '教育工作坊与驻地交流计划',
            '公共空间长期观察研究项目',
            '跨学科出版与青年作者计划',
            '开放讨论与公众参与计划',
          ][n],
    value,
    emphasis: n === 4,
  }))
  slide.data.stats = [
    {
      value: '410',
      suffix: '人',
      label: '年度参与人数',
      description: '项目持续连接创作者与公众，形成稳定交流。',
    },
    {
      value: '74',
      suffix: '%',
      label: '长期回访参与率',
      description: '回访者继续参与公共活动与跨学科讨论。',
    },
  ]
  if (i === 0) slide.data.title = '公共文化项目持续连接跨学科创作者与社区公众并形成长期参与网络'
  if (i === 1) slide.data.points[0].label = '公共展览与社区共同创作跨学科长期开放参与观察记录计划'
})
const results = []
for (const [name, input] of Object.entries({ variants, stress, mixed, long })) {
  const dir = resolve(out, name)
  mkdirSync(dir)
  const contentPath = resolve(dir, 'content.json')
  const lockPath = resolve(dir, 'deck_lock.json')
  write(contentPath, input)
  write(lockPath, {
    schemaVersion: 'pptx-nova-deck-lock/v1',
    mode: 'create',
    canvas: { widthIn: 13.333, heightIn: 7.5 },
    outline: { purpose: 'Design contract validation matrix' },
    slides: input.slides.map((s) => ({
      slideType: s.type,
      title: s.data.title,
      purpose: 'Validate native data and constrained composition',
      rhythm: 'dense',
      chart: { kind: s.data.kind, source: s.data.source },
    })),
  })
  const command = [
    resolve(root, 'pptx-nova/scripts/pptx-nova-create-run.mjs'),
    '--content',
    contentPath,
    '--lock',
    lockPath,
    '--output',
    resolve(dir, 'reviewed.pptx'),
    '--run-dir',
    resolve(dir, 'run'),
    '--progress',
    'off',
    '--json',
  ]
  const run = spawnSync(process.execPath, command, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  writeFileSync(resolve(dir, 'stdout.json'), run.stdout ?? '')
  writeFileSync(resolve(dir, 'stderr.txt'), run.stderr ?? '')
  const manifestPath = resolve(dir, 'run/visual-evidence/manifest.json')
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath)) : null
  const summary = {
    name,
    exitCode: run.status,
    machinePassed: run.status === 0,
    decision: manifest?.decision ?? null,
    findings: manifest?.findings?.length ?? null,
    needsVisualReview: true,
    manifestPath,
  }
  results.push(summary)
  console.log(JSON.stringify(summary))
}
write(resolve(out, 'matrix.json'), {
  schemaVersion: 'pptx-nova-design-matrix/v1',
  cases: results,
  machinePassed: results.every((r) => r.machinePassed),
  visuallyReviewed: false,
})
if (results.some((r) => !r.machinePassed)) process.exitCode = 1
