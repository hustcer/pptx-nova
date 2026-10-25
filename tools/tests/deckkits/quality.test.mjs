import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runNodeStatus, skillPath, skillUrl, writeJson } from '../helpers/common.mjs'

test('DeckKit quality resolves the topmost containing panel without hiding real contrast failures', async () => {
  const { assessDeckQuality } = await import(
    skillUrl('assets/deckkits/shared/core-primitives.kit.mjs')
  )
  const patch = {
    schemaVersion: 'pptx-patch/v1',
    ops: [
      { op: 'add-slide' },
      {
        op: 'set-slide-background',
        slide: 0,
        fill: { type: 'solid', color: '111111' },
      },
      {
        op: 'add-shape',
        slide: 0,
        kind: 'rectangle',
        name: 'S0_BackPanel',
        x: '1in',
        y: '1in',
        w: '4in',
        h: '3in',
      },
      {
        op: 'set-shape',
        slide: 0,
        shape: { name: 'S0_BackPanel' },
        fill: { type: 'solid', color: '333333' },
      },
      {
        op: 'add-shape',
        slide: 0,
        kind: 'rectangle',
        name: 'S0_FrontPanel',
        x: '1.25in',
        y: '1.25in',
        w: '3.5in',
        h: '2.5in',
      },
      {
        op: 'set-shape',
        slide: 0,
        shape: { name: 'S0_FrontPanel' },
        fill: { type: 'solid', color: 'FFFFFF' },
      },
      {
        op: 'add-text-box',
        slide: 0,
        name: 'S0_PanelText',
        x: '1.5in',
        y: '1.5in',
        w: '3in',
        h: '1in',
      },
      {
        op: 'set-text-frame',
        slide: 0,
        shape: { name: 'S0_PanelText' },
        text: 'Readable on the front panel',
      },
      {
        op: 'set-run',
        slide: 0,
        shape: { name: 'S0_PanelText' },
        font: { size: '18pt', color: '111111' },
      },
      {
        op: 'add-text-box',
        slide: 0,
        name: 'S0_RealFailure',
        x: '6in',
        y: '1in',
        w: '2in',
        h: '1in',
      },
      {
        op: 'set-text-frame',
        slide: 0,
        shape: { name: 'S0_RealFailure' },
        text: 'Still unreadable',
      },
      {
        op: 'set-run',
        slide: 0,
        shape: { name: 'S0_RealFailure' },
        font: { size: '18pt', color: '111111' },
      },
    ],
  }

  const quality = assessDeckQuality({ patch })
  const contrastIssues = quality.issues.filter((issue) => issue.kind === 'low-contrast-text')

  assert.deepEqual(
    contrastIssues.map((issue) => issue.shapeName),
    ['S0_RealFailure'],
  )
  assert.equal(contrastIssues[0].metrics.backgroundColor, '111111')
})

test('official broadside example has no blocking build-quality issues', async () => {
  const { assessDeckQuality } = await import(
    skillUrl('assets/deckkits/shared/core-primitives.kit.mjs')
  )
  const { createDeck } = await import(skillUrl('assets/deckkits/broadside/broadside.kit.mjs'))
  const content = JSON.parse(
    readFileSync(skillPath('assets/deckkits/broadside/examples/content.json'), 'utf8'),
  )
  const { patch } = createDeck(content)
  const quality = assessDeckQuality({ patch, deckkit: 'broadside' })

  assert.equal(quality.issues.filter((issue) => issue.severity === 'error').length, 0)
  assert.notEqual(quality.status, 'error')
})

test('broadside bar chart uses explicit accents without an implicit trailing accent', async () => {
  const { createDeck } = await import(skillUrl('assets/deckkits/broadside/broadside.kit.mjs'))
  const buildBarColors = (bars) => {
    const { patch } = createDeck({
      slides: [
        {
          type: 'broadsideBarChartSlide',
          data: {
            title: 'Comparison',
            bars,
            unit: 'score',
            source: 'Synthetic test data',
            seriesName: 'Score',
          },
        },
      ],
    })
    return patch.ops
      .find((op) => op.op === 'set-chart')
      .series[0].points.map((point) => point.fill.color)
  }
  const bars = [
    { label: 'Product', value: 9.8, accent: true },
    { label: 'Peer A', value: 7.3 },
    { label: 'Peer B', value: 6.5 },
  ]

  assert.deepEqual(buildBarColors(bars), ['E85D26', '707068', '707068'])
  assert.deepEqual(buildBarColors(bars.map(({ accent: _accent, ...bar }) => bar)), [
    '707068',
    '707068',
    '707068',
  ])
})

test('broadside cover blocks text that exceeds every registered composition in delivery mode', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-nova-broadside-cover-budget-'))
  const contentPath = join(dir, 'content.json')
  const content = JSON.parse(
    readFileSync(skillPath('assets/deckkits/broadside/examples/content.json'), 'utf8'),
  )
  const cover = content.slides.find((slide) => slide.type === 'broadsideCoverSlide')
  cover.data.title = '重写演示文稿全链路基础设施能力版图'.repeat(3)
  writeJson(contentPath, content)

  const result = runNodeStatus(
    [
      skillPath('assets/deckkits/validate-content.mjs'),
      contentPath,
      '--deckkit',
      'broadside',
      '--mode',
      'delivery',
      '--json',
    ],
    1,
  )
  const validation = JSON.parse(result.stdout)

  assert.equal(validation.valid, false)
  assert.ok(
    validation.errors.some(
      (error) => error.type === 'design' && /slides\[0\].data.title/.test(error.message),
    ),
  )
})

test('manual DeckKit retry commands overwrite only the current-run candidate', () => {
  const deckkitMode = readFileSync(skillPath('references/deckkit-mode.md'), 'utf8')
  const skill = readFileSync(skillPath('SKILL.md'), 'utf8')

  assert.match(
    deckkitMode,
    /xdoc pptx apply -p patch\.json(?: -i input\.pptx)? -o <run-dir>\/candidate\.pptx --overwrite --dry-run --json/,
  )
  assert.match(
    deckkitMode,
    /xdoc pptx apply -p patch\.json(?: -i input\.pptx)? -o <run-dir>\/candidate\.pptx --overwrite --json/,
  )
  assert.doesNotMatch(skill, /xdoc pptx apply -p patch\.json .*<run-dir>\/candidate\.pptx/)
  assert.match(deckkitMode, /stop immediately and do not run vision-check on a stale candidate/i)
})

test('chart preview and Content_Types audit guidance stay current', () => {
  const charts = readFileSync(skillPath('references/charts.md'), 'utf8')
  const troubleshooting = readFileSync(skillPath('references/troubleshooting.md'), 'utf8')

  assert.match(charts, /当前预览支持/)
  assert.match(charts, /xdoc ≥0\.3\.1/)
  for (const feature of [
    'trendline',
    'errorBars',
    'dataTable',
    'displayUnits',
    '轴标题',
    'minorGridlines',
  ]) {
    assert.ok(charts.includes(feature))
  }
  assert.doesNotMatch(charts, /PNG\/PDF 预览链暂不渲染/)
  assert.doesNotMatch(charts, /预览链暂不渲染数据表/)
  assert.ok(troubleshooting.includes("'[[]Content_Types].xml'"))
  assert.match(troubleshooting, /set -o pipefail/)
  assert.match(troubleshooting, /unzip -p out\.pptx/)
  assert.match(troubleshooting, /xmllint --noout -/)
})

test('DeckKit diversity diagnostics disclose current, missing, and available groups', async () => {
  const { validateContent } = await import(
    skillUrl('assets/deckkits/shared/core-primitives.kit.mjs')
  )
  const content = {
    meta: { deckkit: 'cartesian' },
    slides: Array.from({ length: 7 }, () => ({
      type: 'cartesianCardsSlide',
      data: {
        label: 'Structure',
        title: 'Repeated structure',
        cards: [
          { title: 'A', body: 'One' },
          { title: 'B', body: 'Two' },
          { title: 'C', body: 'Three' },
        ],
      },
    })),
  }
  const validation = validateContent(content, { deckkit: 'cartesian', mode: 'delivery' })
  const diagnostic = validation.fitDiagnostics.find(
    (item) => item.code === 'diversity.uniqueGroups.tooLow',
  )

  assert.equal(validation.valid, false)
  assert.deepEqual(diagnostic.usedGroups, ['structure'])
  assert.deepEqual(diagnostic.missingGroups, ['anchor', 'statement', 'evidence'])
  assert.deepEqual(diagnostic.groupMembers.statement, ['cartesianStatementSlide'])
  assert.deepEqual(diagnostic.groupMembers.evidence, [
    'cartesianBarChartSlide',
    'cartesianImageStatsSlide',
    'cartesianLineChartSlide',
    'cartesianExhibitSlide',
    'cartesianAnalyticalSlide',
    'cartesianComparisonSlide',
    'cartesianSceneSlide',
    'cartesianFormulaSlide',
  ])
  assert.equal(diagnostic.slideGroups.length, 7)
  assert.deepEqual(diagnostic.slideGroups[0], {
    index: 0,
    slideType: 'cartesianCardsSlide',
    group: 'structure',
  })
  assert.match(diagnostic.message, /used groups: structure/)
  assert.match(diagnostic.message, /missing groups: anchor, statement, evidence/)
  assert.match(diagnostic.message, /statement=\[cartesianStatementSlide\]/)
})

test('placeholder-only DeckKit asset slots reject image injection in delivery mode', async () => {
  const { validateContent } = await import(
    skillUrl('assets/deckkits/shared/core-primitives.kit.mjs')
  )
  const content = JSON.parse(
    readFileSync(skillPath('assets/deckkits/broadside/examples/content.json'), 'utf8'),
  )
  const imageSlide = content.slides.find((slide) => slide.type === 'broadsideSplitSlide')
  imageSlide.imageSlots = { 'image.split': 'product_screenshot' }

  const validation = validateContent(content, { deckkit: 'broadside', mode: 'delivery' })
  const diagnostic = validation.fitDiagnostics.find(
    (item) => item.code === 'layout.assetSlot.unsupported',
  )

  assert.equal(validation.valid, false)
  assert.equal(diagnostic.path, 'slides[3].imageSlots.image.split')
  assert.equal(diagnostic.value, 'product_screenshot')
  assert.equal(diagnostic.assetSlot.id, 'image.split')
  assert.equal(diagnostic.assetSlot.acceptsAsset, false)
  assert.equal(diagnostic.assetSlot.placeholderBehavior, 'solid image shell')
  assert.match(diagnostic.message, /placeholder-only/)
  assert.match(diagnostic.message, /does not accept asset "product_screenshot"/)
})
