# 图表（Chart）创建与编辑

当前 `add-chart` schema 发布 **27 种 chart kind**，每种支持若干 variant。把
`xdoc schema --mode ops --ops add-chart` 当作当前可写契约；操作名存在不等于内置 PDF/Viewer
拥有 PowerPoint 渲染等价性，尤其是 3D 和 ChartEx。

## 专项语义验证

chart 页的目标是原生、可编辑、语义正确，不做 SVG 像素坐标校准。写 chart 前先在
`deck_lock.slides[].chart` 记录 kind、数据来源和验证点；生成 `patch.json` 后由
`pptx-nova-check-lock.mjs` 做静态语义检查，再交给 xdoc dry-run / vision-check / PNG
复核。

最小检查清单：

- `categories.length` 必须和每个普通 series 的 `values.length` 一致。
- 每个 series 要有可读 `name`；多系列图尤其不能留空，否则 legend 失去语义。
- `combo` 必须真的是组合：至少两种 series kind，或至少一个 `secondaryAxis: true`。
- legend、data label、axis tick label 使用 schema 全名，不用 `b`、`r`、`outEnd` 之类简写。
- 图表要能证明 slide 的 `claimTitle` / `proofObject`，不要只因为有数据就塞图。
- PNG/contact-sheet 复核负责判断 legend、axis、data label、callout 是否遮挡；静态语义检查
  不替代视觉复核。

在 Studio、data-driven、结构编辑、模板跟随或手工 refurbish 路线中，只要 patch 含
add-chart / set-chart / set-chart-data / set-chart-text，apply 后保存 final-inspect.json，并运行
pptx-nova-semantic-audit.mjs 输出 semantic-audit.json。该审计只做轻量语义门禁：
数据维度、数值类型、source/claim 披露和最终原生 chart 对象存在性；它不是完整 OOXML
chart 等价检查。semantic-audit.json 若为 fail，最终 evidence-summary 必须阻塞；warn
可以披露后继续视觉复核。

`pptx-nova-semantic-audit.mjs` 与 `pptx-nova-check-lock.mjs` 共用同一个 chart
semantic normalizer：经典 Chart 读取 `data`，ChartEx 读取 `dataEx`，并按 chart kind
检查 points/stages/values/nodes/series 等最小语义。数据来源优先读取 op 自身，再读取
`deck_lock.slides[].chart.semanticSource` / `source` / `dataSource`；不要为了消除假警告而
给 `add-chart` 伪造 schema 不存在的 `source` 字段。

## Native diagram/table presets

常见商务图示优先用 `add-slide.recipe` preset，而不是手算几十个 `add-shape` 坐标。
这些 preset 会编译成原生可编辑 PPTX 对象，支持 `theme` 字段随 themePack 改色：

| preset           | `recipe.kind`      | 输入字段                       | 适用场景                     |
| ---------------- | ------------------ | ------------------------------ | ---------------------------- |
| Timeline         | `timeline`         | `title`, `items[]`             | 里程碑、发布节奏、历史演进   |
| Roadmap          | `roadmap`          | `title`, `phases[]`            | 产品规划、季度计划、阶段目标 |
| 2x2 Matrix       | `matrix-2x2`       | `title`, `quadrants[4]`        | 优先级、定位、风险收益       |
| Process Flow     | `process-flow`     | `title`, `steps[]`             | 流程、操作步骤、转化前段     |
| Funnel           | `funnel`           | `title`, `stages[]`            | 销售漏斗、转化分析、pipeline |
| SWOT Matrix      | `swot`             | `title`, 四个象限列表          | 战略评估、市场分析、工作坊   |
| Pyramid          | `pyramid`          | `title`, `levels[]`            | 层级、成熟度、运营模型       |
| Hub Spoke        | `hub-spoke`        | `title`, `hub`, `spokes[]`     | 平台生态、能力地图、干系人   |
| Cycle            | `cycle`            | `title`, `steps[]`             | 反馈闭环、运营节奏、复盘流程 |
| Gantt            | `gantt`            | `title`, `tasks[]`             | 交付计划、项目排期、里程碑   |
| Scorecard Table  | `scorecard-table`  | `title`, `headers[]`, `rows[]` | 评分卡、供应商评估、就绪度   |
| Comparison Cards | `comparison-cards` | `title`, `cards[]`             | 方案比较、功能分组、场景权衡 |

### Timeline

```json
{
  "op": "add-slide",
  "recipe": {
    "kind": "timeline",
    "title": "Launch timeline",
    "items": [
      { "date": "Q1", "label": "Design", "text": "Prototype" },
      { "date": "Q2", "label": "Beta", "text": "Pilot customers" },
      { "date": "Q3", "label": "GA", "text": "Launch" }
    ],
    "theme": { "accent": "0A6BFF", "text": "111827", "muted": "667085", "background": "FFFFFF" }
  }
}
```

### Roadmap

```json
{
  "op": "add-slide",
  "recipe": {
    "kind": "roadmap",
    "title": "Product roadmap",
    "phases": [
      { "label": "Now", "period": "Q1", "items": ["Stabilize core", "Instrument usage"] },
      { "label": "Next", "period": "Q2", "items": ["Self-serve onboarding", "Partner API"] },
      { "label": "Later", "period": "Q3", "items": ["Enterprise controls"] }
    ]
  }
}
```

### 2x2 matrix

`quadrants` 必须正好 4 项，按左上、右上、左下、右下顺序填。

```json
{
  "op": "add-slide",
  "recipe": {
    "kind": "matrix-2x2",
    "title": "Prioritization matrix",
    "xAxis": "Impact",
    "yAxis": "Effort",
    "quadrants": [
      { "label": "Quick wins", "text": "Ship now" },
      { "label": "Big bets", "text": "Sequence carefully" },
      { "label": "Fill-ins", "text": "Batch work" },
      { "label": "Avoid", "text": "Revisit later" }
    ]
  }
}
```

### Process flow

```json
{
  "op": "add-slide",
  "recipe": {
    "kind": "process-flow",
    "title": "Sales process",
    "steps": [
      { "label": "Lead", "text": "Inbound capture" },
      { "label": "Qualify", "text": "Score fit" },
      { "label": "Close", "text": "Contract" }
    ]
  }
}
```

### Funnel

```json
{
  "op": "add-slide",
  "recipe": {
    "kind": "funnel",
    "title": "Conversion funnel",
    "stages": [
      { "label": "Visitors", "value": "120k" },
      { "label": "Trials", "value": "18k" },
      { "label": "Paid", "value": "3.2k" }
    ]
  }
}
```

### SWOT matrix

```json
{
  "op": "add-slide",
  "recipe": {
    "kind": "swot",
    "title": "Market view",
    "strengths": ["Brand", "Retention"],
    "weaknesses": ["Long sales cycle"],
    "opportunities": ["New segment"],
    "threats": ["Price pressure"]
  }
}
```

### Pyramid

```json
{
  "op": "add-slide",
  "recipe": {
    "kind": "pyramid",
    "title": "Operating model",
    "levels": [
      { "label": "Strategy" },
      { "label": "Programs", "text": "Cross-functional bets" },
      { "label": "Execution" }
    ]
  }
}
```

### Hub spoke

```json
{
  "op": "add-slide",
  "recipe": {
    "kind": "hub-spoke",
    "title": "Platform ecosystem",
    "hub": "Core API",
    "spokes": [
      { "label": "Partners" },
      { "label": "Apps" },
      { "label": "Data" },
      { "label": "Automation" }
    ]
  }
}
```

### Cycle

```json
{
  "op": "add-slide",
  "recipe": {
    "kind": "cycle",
    "title": "Learning loop",
    "steps": [
      { "label": "Plan" },
      { "label": "Build" },
      { "label": "Measure" },
      { "label": "Learn" }
    ]
  }
}
```

### Gantt

`date` 和 `value` 分别作为开始/结束标签；当前 preset 生成可编辑的任务条，不依赖图表对象。

```json
{
  "op": "add-slide",
  "recipe": {
    "kind": "gantt",
    "title": "Delivery plan",
    "tasks": [
      { "label": "Design", "date": "Jan", "value": "Feb" },
      { "label": "Build", "date": "Feb", "value": "Apr" },
      { "label": "Launch", "date": "May", "value": "Jun" }
    ]
  }
}
```

### Scorecard table

```json
{
  "op": "add-slide",
  "recipe": {
    "kind": "scorecard-table",
    "title": "Vendor scorecard",
    "headers": ["Vendor", "Score", "Risk"],
    "rows": [
      ["A", "92", "Low"],
      ["B", "84", "Medium"]
    ]
  }
}
```

### Comparison cards

```json
{
  "op": "add-slide",
  "recipe": {
    "kind": "comparison-cards",
    "title": "Options",
    "cards": [
      { "label": "Fast", "text": "Ship now" },
      { "label": "Balanced", "text": "Stage rollout" },
      { "label": "Deep", "text": "Invest more" }
    ]
  }
}
```

## chart kind × variant 速记

| kind                                                  | 推荐 variant                                                              | 备注                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| `column` / `bar`                                      | `clustered` / `stacked` / `percent-stacked`                               | 最常用                                           |
| `column-3d` / `bar-3d`                                | `clustered` / `stacked` / `percent-stacked`                               | 3D 版本                                          |
| `line`                                                | `standard` / `markers` / `stacked` / `percent-stacked`                    | 加 marker 用 `markers`                           |
| `line-3d`                                             | `standard`                                                                | 仅一种                                           |
| `area` / `area-3d`                                    | `standard` / `stacked` / `percent-stacked`                                |                                                  |
| `pie` / `pie-3d`                                      | `standard` / `exploded`                                                   | exploded 拉开扇区                                |
| `doughnut`                                            | `standard` / `exploded`                                                   | 圈饼图                                           |
| `radar`                                               | `standard`                                                                | 雷达                                             |
| `scatter`                                             | `markers` / `lines` / `lines-no-markers` / `smooth` / `smooth-no-markers` | XY 散点                                          |
| `bubble` / `bubble-3d`                                | `standard`                                                                | 气泡（含 size 维度）                             |
| `stock`                                               | `standard`                                                                | HLC/OHLC K 线                                    |
| `surface` / `surface-3d`                              | `standard` / `wireframe`                                                  | 曲面                                             |
| `combo`                                               | `standard`                                                                | 组合图；支持每个 series 加 `secondaryAxis: true` |
| `waterfall` / `funnel` / `histogram` / `pareto`       | `standard`                                                                | chartEx 系列（写到 `ppt/charts/chartExN.xml`）   |
| `treemap` / `sunburst` / `box-whisker` / `region-map` | `standard`                                                                | chartEx 系列；数据结构同直角坐标系               |

不合法的 kind/variant 组合在写之前就会被 schema 拒绝；apply 前用 `--dry-run` 兜底。

## 数据结构（关键）

### 直角坐标系（column / bar / line / area / radar / pie / doughnut）

```json
{
  "categories": ["Q1", "Q2", "Q3", "Q4"],
  "series": [
    { "name": "2025", "values": [10, 12, 14, 16] },
    { "name": "2026", "values": [15, 18, 21, 24] }
  ]
}
```

### XY 散点 / 气泡

```json
{
  "series": [
    {
      "name": "Region A",
      "points": [
        { "x": 1.0, "y": 2.0 },
        { "x": 1.5, "y": 3.2 }
      ]
    }
  ]
}
```

bubble 多一个 `size`：

```json
{ "x": 1.0, "y": 2.0, "size": 0.5 }
```

### Stock（K 线）

```json
{
  "categories": ["2025-01", "2025-02"],
  "open": [10, 12],
  "high": [15, 17],
  "low": [8, 9],
  "close": [12, 14]
}
```

`open` 可省略 → HLC；含 `open` → OHLC。volume stock 暂未支持。

Stock 数据必须先做语义不变量检查，再写入或交付：

- HLC：每个 category 上必须满足 `low[i] <= close[i] <= high[i]`。
- OHLC：每个 category 上必须满足
  `low[i] <= min(open[i], close[i], high[i])` 且
  `high[i] >= max(open[i], close[i], low[i])`。
- 修复单个异常点时，优先做最小数据改动，保持趋势、类别、系列名称和图表样式不变。
- 用 `set-chart-data` 修改既有 stock chart 时，xdoc 会同步 chart XML 和 embedded
  workbook；不要用 raw XML 只改 `ppt/charts/chartN.xml`，否则 PowerPoint 刷新图表时
  可能从 workbook 恢复旧数据。

### Combo

`combo` 的 `data.series` 每个元素可加 `kind`（覆盖 chart kind）；要把某个系列
挂到次坐标轴上,加 `secondaryAxis: true`:

```json
{
  "kind": "combo",
  "data": {
    "categories": ["Q1", "Q2", "Q3", "Q4"],
    "series": [
      { "name": "Revenue", "kind": "column", "values": [10, 12, 14, 16] },
      { "name": "Growth %", "kind": "line", "values": [5, 8, 12, 15], "secondaryAxis": true }
    ]
  }
}
```

校验规则:同一个 combo **要么** 包含 ≥2 种 plot kind(column/line/area 任意两个),
**要么** 至少有一个 `secondaryAxis: true` 的系列;两者满足其一即可通过。换句话说,
单 plot kind + 二轴(经典"柱+折线但都是 column"的伪二轴)现在合法。

### ChartEx（waterfall / funnel / histogram / pareto / treemap / sunburst / box-whisker / region-map）

走同样的 `add-chart`,kind 选对即可;内部会写入 `ppt/charts/chartExN.xml`(modern
chart 部件),并自动建立 `chartEx` 关系类型。`variant` 必须是 `standard`。
这些 PowerPoint-only 图表必须使用 ChartEx 专用 `dataEx` 载荷，不要把普通
`data.categories` / `data.series` 当作等价输入，除非当前 xdoc schema 明确说明支持自动
lowering。对照参考 deck 时，以 PowerPoint 生成的 `chartEx*.xml` 语义为准，而不是用
普通 chart 经验猜维度、axis、dataLabels 或 layoutPr。

```json
{
  "op": "add-chart",
  "slide": 0,
  "kind": "waterfall",
  "variant": "standard",
  "x": "1in",
  "y": "1.5in",
  "w": "10in",
  "h": "5in",
  "title": "现金流桥接",
  "dataEx": {
    "points": [
      { "label": "起始", "value": 100, "kind": "total" },
      { "label": "Q1", "value": -20, "kind": "decrease" },
      { "label": "Q2", "value": 35, "kind": "increase" },
      { "label": "Q3", "value": 50, "kind": "increase" },
      { "label": "结束", "value": 165, "kind": "total" }
    ]
  }
}
```

ChartEx 语义要点：

- 非空 `title` 会写入原生 `cx:title/cx:tx/cx:txData/cx:v`。省略或传空白标题时
  不写空 `cx:title`，避免 PowerPoint 合成 “Chart Title”；后续
  `set-chart-data.dataEx` 会保留既有标题。
- ChartEx 目前不支持用 `add-chart.legend` 显式控制 legend 位置。显式传入会
  fail closed，而不是被静默忽略；需要自定义 legend 时省略该字段并使用独立的
  可编辑文本/形状，或保留当前 PowerPoint 默认 legend 语义。
- `waterfall`：`points[].kind` 使用 `increase` / `decrease` / `subtotal` / `total`；
  subtotal/total 应映射到 `<cx:subtotals>`，不要凭空写 `<cx:aggregation/>`。
- `funnel`：`stages[]` 的数值维度应是 `numDim type="val"`，不是 `size`；通常需要
  value data labels 和 funnel 自己的 category axis gapWidth。
- `histogram`：用原始样本 `values[]`，PowerPoint 语义通常是
  `layoutId="clusteredColumn"` + `<cx:binning intervalClosed="r">`，不是自造普通柱图。
- `sunburst` / `treemap`：层级输入可用 `nodes[]`，但写入 ChartEx 时通常只输出叶子行；
  多级 category cache 按 PowerPoint 的 leaf-to-root 层级顺序写入，不能把中间节点也当成
  独立 data point。
- `box-whisker`：每个 series 可带 `categories[]`，长度必须等于 `values[]`；重复的
  `Day1` / `Day2` / `Day3` 等 category label 用来形成分组轴，不能退化成单一 category。
- 参考 deck 复刻时，优先复用同类型既有 ChartEx 的 `chartStyle` / `chartColorStyle`
  关系，并补 parser/generator 回归测试固定上述语义。
- 修改既有 chart（经典或 ChartEx）的系列配色时，优先用 `set-chart.colorStyle`
  重写 colorStyle part（见下节），不要对 `colors*.xml` 写 raw OOXML。

### 系列配色：`set-chart.colorStyle`（经典 + ChartEx 通用）

chart 的系列默认颜色来自 chart part 关联的 colorStyle part（`ppt/charts/colors*.xml`，
`cs:colorStyle` 颜色循环）：系列 i 在无内联 fill override 时取 `colors[i % n]`。
`set-chart.colorStyle` 是编辑该循环的高层 op，经典 `c:` 与 ChartEx `cx:` 图表通用：

```json
{
  "op": "set-chart",
  "slide": 42,
  "shape": { "id": 22 },
  "colorStyle": { "method": "cycle", "colors": ["1B2566", "C9563B", { "scheme": "accent3" }] }
}
```

- `colors` 是完整替换的颜色循环（hex 字符串或 `{"scheme": ...}` 主题色）；
  既有 `cs:variation` 与 style-family `id` 保留。
- `method` 映射 `meth` 属性（`cycle` / `withinLinear` / `acrossLinear` /
  `withinLinearReversed` / `acrossLinearReversed`），省略时保留原值。
- chart 没有 colorStyle part 时会自动创建并注册 rels / Content-Types。
- dry-run 的 `semanticChanges` 会输出 `before -> after` 颜色 token diff，
  可在 apply 前确认改动命中的 part 与颜色。
- 一个 colors part 可能被多个同类 ChartEx 共享（创建时按 kind 复用关系）；
  共享时 apply 会报 `chart-color-style:` warning 并给出引用数——确认是否
  有意让全部引用图表同步换色。
- ChartEx 数据标签文字颜色走 `set-chart.dataLabels[].font`（写
  `cx:dataLabels/cx:txPr`），不再需要 raw XML；`numberFormat` / `separator` /
  `showPercentage` / `showLegendKey` 在 ChartEx 上仍会明确拒绝。
- xdoc 预览对 colorStyle 的还原不保证与 PowerPoint 一致；最终视觉仍按下文
  ChartEx PowerPoint baseline 规则复核。

### 系列配色对比度指引

选择 `colorStyle.colors` / 系列色时，按以下通用规则减少人工试色与返工：

- 浅色背景（paper/白）配深色系列（如 navy/deep coral/teal 系），保证
  柱/线与背景对比度 ≥ 3:1；数据标签文字与其所在填充色对比度 ≥ 4.5:1。
- 数据标签压在系列填充上时，标签颜色相对填充色取深色（深底白字/浅底深字），
  不要沿用主题 accent 亮色（亮黄标签压珊瑚填充是本条的反例）。
- 系列数超过调色板长度时颜色会循环；相邻系列避免只靠亮度区分，
  优先给出 ≥ 系列数的颜色数组而不是依赖 `withinLinear` 自动变体。
- 色盲可区分性：避免仅红/绿对比，优先蓝-橙、蓝-棕等组合。

> ⚠️ chartEx 部件在 PowerPoint 2016+ 才完整支持;部分老旧渲染器(WPS 旧版、
> LibreOffice <7.4) 会忽略 chartEx 节点回退到 fallback 图。要 100% 兼容时优先
> 用经典 chart(column 模拟 waterfall、bar 模拟 funnel)。

## 创建图表

```json
{
  "op": "add-chart",
  "slide": 0,
  "kind": "column",
  "variant": "clustered",
  "x": "1in",
  "y": "1.5in",
  "w": "8in",
  "h": "5in",
  "name": "Revenue Chart",
  "title": "营收趋势",
  "legend": "bottom",
  "data": {
    "categories": ["Q1", "Q2", "Q3", "Q4"],
    "series": [
      { "name": "2025", "values": [10, 12, 14, 16] },
      { "name": "2026", "values": [15, 18, 21, 24] }
    ]
  }
}
```

`legend` 位置（**必须用全名**，shorthand 不接受）：
`right / left / top / bottom / corner / none`。

> ⚠️ schema 严格匹配 — `"b"` / `"r"` / `"tr"` 之类的简写都会被拒绝。

### 创建原生日期轴（`c:dateAx`）

日期轴创建必须显式写 `categoryAxis.type: "date"`；xdoc 不会根据
`data.categories` 的字符串外观猜测日期语义。类别必须是严格 Gregorian
`YYYY-MM-DD`，范围 `1900-01-01..9999-12-31`。写出时 chart cache 和 embedded
workbook 都使用 Excel 1900 日期系统数值，并显式写入 `c:date1904 val="0"` 与
`workbookPr date1904="0"`，避免 PowerPoint for Mac 按 1904 系统偏移 1462 天；`1900-02-29`
是 Excel 的虚构日期，输入会被拒绝，而 `1900-02-28` / `1900-03-01` 分别写为 59 / 61。

```json
{
  "op": "add-chart",
  "slide": 0,
  "kind": "line",
  "variant": "markers",
  "x": "1in",
  "y": "1.5in",
  "w": "10in",
  "h": "5in",
  "name": "Monthly Revenue",
  "categoryAxis": {
    "type": "date",
    "formatCode": "mmm yyyy",
    "baseTimeUnit": "days",
    "majorUnit": 1,
    "majorTimeUnit": "months",
    "minorUnit": 7,
    "minorTimeUnit": "days"
  },
  "data": {
    "categories": ["2026-01-01", "2026-02-01", "2026-03-01"],
    "series": [{ "name": "Revenue", "values": [10, 14, 18] }]
  }
}
```

支持 column/bar/line/area/radar/surface 及其 3D 对应类型。pie/doughnut、
scatter/bubble、stock/combo 和所有 ChartEx `dataEx` kind 都会 fail closed。
`formatCode` 默认 `yyyy-mm-dd`；时间单位只接受 `days / months / years`，
`majorUnit` / `minorUnit` 必须为正数。生成器会保留正确的 axId、position、scaling、
delete 和 crossAx 配对，并把 series category cache 写成带格式码的 `c:numRef/c:numCache`。

## 编辑图表

### 只改文本 / 翻译 label

翻译 chart title、category labels、series names、data labels 时，优先用 top-level
安全命令：

```bash
xdoc pptx replace-chart-text \
  --source source.pptx \
  --data chart-replacements.json \
  --output translated.pptx \
  --visible-cache-only \
  --dry-run \
  --json > replace-chart-text-dry-run.json
```

输入 JSON 使用 role + sourceText/sourceHash + targetText 定位已有可见 cache
文本；`index` 是同一 chart part 内该 role 的 0-based 序号：

```json
{
  "schemaVersion": "pptx-chart-text-replacements/v1",
  "replacements": [
    {
      "part": "ppt/charts/chart1.xml",
      "role": "category",
      "index": 0,
      "sourceText": "产品",
      "targetText": "Product"
    }
  ]
}
```

经典 Chart 和 ChartEx 的应用默认标题 `Chart Title` 可能不是普通可见文本节点。
翻译模式下不要搜索这个字面量，也不要手工构造标题 selector；应直接使用
`i18n-scan` inventory 经 `i18n-plan.replaceChartText` 生成的 replacement。此类
replacement 会额外携带 `sourceState=generated-default-title`、`chartDialect` 和
`structureSignature`，三个守卫字段必须原样保留。`replace-chart-text` 会在写入前
重新验证状态，并只物化对应 dialect 的最小标题文本子树，保留已有 layout、overlay、
shape properties 和 text properties。

该 generated-title 路径只适用于标题容器中完全没有对应 dialect `tx` 子节点的情况。
只要已经存在任何 `tx`（包括空的 rich-text 容器），就必须 preserve/manual-review；
不要自动补文本，也不要用临时 OOXML fallback 绕过这个安全边界。

只有 dry-run 报告满足 `agentGate.passed=true`、`changedNodes[]` 符合预期、
`structureChecks[]` 全部通过时，才去掉 `--dry-run` 写候选文件。该命令只写
`ppt/charts/*.xml` 中的可见文本节点；不会修改 external workbook path、chart
relationship target、embedded workbook 数据/sharedStrings 或 `formatCode`。

普通 chart 编辑仍可用 patch op `set-chart-text`。它会改已有 chart 文本缓存和
embedded workbook 中对应标签，不重建 chart data XML，适合需要保持 workbook-backed
chart 标签同步的非翻译场景。

```json
{
  "op": "set-chart-text",
  "slide": 1,
  "shape": { "name": "Revenue Chart" },
  "title": "Revenue Trend",
  "categories": [
    { "index": 0, "text": "Q1" },
    { "index": 1, "text": "Q2" }
  ],
  "series": [{ "index": 0, "name": "Actual" }]
}
```

不要把 `set-chart-data` 当作 chart 文本翻译工具：它会重建 chart XML / workbook
数据区域，适合真的替换数据集，但可能丢失或重排既有标题、layout、样式和扩展节点。
patch op `set-chart-text` 目前只覆盖经典 chart part。翻译模式下，top-level
`xdoc pptx replace-chart-text --visible-cache-only` 已原生支持经典 chart 与 ChartEx，
并通过 namespace-aware 定位处理 ChartEx direct/nested point text，以及两种 dialect
的 generated default title。ChartEx 翻译应优先使用该 helper；未知扩展结构和任何
已有 `tx` 的标题默认 preserve-only。只有不涉及上述安全边界、helper 明确报告不支持、
且确实需要修改时，才使用带完整报告、ZIP/XML 校验与 clean-open 验证的定向 OOXML
fallback。

### 改数据

```json
{
  "op": "set-chart-data",
  "slide": 1,
  "shape": { "name": "Revenue Chart" },
  "data": { "categories": [...], "series": [...] }
}
```

ChartEx 使用同一个 `set-chart-data` op，但载荷仍是 `dataEx`。它只替换 ChartEx
数据维度并保留已有 native title；不要把普通 `data` 当作 ChartEx 的等价输入：

```json
{
  "op": "set-chart-data",
  "slide": 1,
  "shape": { "name": "Conversion Funnel" },
  "dataEx": {
    "stages": [
      { "label": "Visitors", "value": 120000 },
      { "label": "Trials", "value": 18000 },
      { "label": "Paid", "value": 3200 }
    ]
  }
}
```

改完 chart 数据后，至少做三步验证：

1. dry-run 中确认 `resolvedSelectors[]` 命中目标 chart，`changedParts[]` 包含 chart
   part；若是 embedded workbook-backed chart，也应看到 workbook part 变化。
2. 对关键业务语义做轻量审计，例如 stock 的 low/high 不变量、series/category 长度一致、
   legend 系列名不为空。把结果保存到 run 目录（如 `semantic-audit.json`）。
3. 做视觉复核。优先用 `xdoc pptx preview` 生成预览；若某类复杂/长尾 chart 没有渲染完整图体，
   不要把空白预览当作 deck 内容缺失；改用 PowerPoint、LibreOffice、PDF 渲染或用户提供的
   权威预览作为视觉依据，并在 `visual_review.json` 中记录 fallback 原因。

### 一键换 PowerPoint 内置 style（1-48）

```json
{ "op": "set-chart", "slide": 1, "shape": {...}, "style": 6 }
```

清掉：

```json
{ "op": "set-chart", "slide": 1, "shape": {...}, "style": null }
```

PowerPoint 内置 1-48 covers warm/cool/mono/contrast 各种预设，比手动调色快。

### 修改 3D 视角

```json
{
  "op": "set-chart",
  "slide": 1,
  "shape": { "name": "Revenue 3D" },
  "view3D": {
    "rotX": 20,
    "rotY": 35,
    "rightAngleAxes": false,
    "perspective": 60,
    "depthPercent": 120,
    "heightPercent": 90
  }
}
```

`view3D` 仅能写入含原生 3D chart group 的图表；对 2D 或 ChartEx 目标会在 mutation
前 fail closed。每个字段设 `null` 会移除对应 OOXML 元素，省略则保留。
`rightAngleAxes: true` 时 perspective 不生效。apply 后通过 inspect 的
`chart.supportsView3D`、`chart.kind`、`chart.view3D` 回读场景值。

原生 OOXML authoring 是 supported，但 PDF 和 bundled Viewer 的 3D rendering 分别是
partial：投影、遮挡和默认着色有覆盖，不保证 bevel、material、custom lightRig 或所有
surface/legend 细节与 PowerPoint 相同。3D 图表的最终视觉证据必须包含 PowerPoint
原生渲染或 clean-open 复核，不能用 xdoc PNG/PDF 单独证明 Office parity。

### 改标题

标题文本和标题样式是两个 op：`set-chart-text` 改文字，`set-chart` 改样式：

```json
{ "op": "set-chart-text", "slide": 1, "shape": {...}, "title": "2026 vs 2025 营收" }

{
  "op": "set-chart",
  "slide": 1,
  "shape": {...},
  "title": { "font": { "name": "Inter", "size": "16pt", "bold": true, "color": "1F1F1F" } }
}
```

### 改图例

```json
{
  "op": "set-chart",
  "slide": 1,
  "shape": {...},
  "legend": {
    "position": "bottom",
    "includeInLayout": false,
    "font": { "name": "Inter", "size": "10pt" }
  }
}
```

`legend` 还支持 `horizontalOffset`（数值，水平偏移）。

### 改坐标轴

```json
{
  "op": "set-chart",
  "slide": 1,
  "shape": {...},
  "axes": [
    {
      "axis": "value",
      "scale": { "min": 0, "max": 30, "majorUnit": 5, "minorUnit": 1 }
    }
  ]
}
```

`axes[].axis` 是严格 enum，只收 canonical 全名：`category` / `value` / `x` / `y`
（直角坐标图用 category/value；scatter / bubble 用 x/y）。`scale` 还支持
`reverseOrder` / `crosses`（`auto / custom / max / min`）/ `crossesAt`，以及
`logBase`（2..1000，仅 value 轴，对数刻度）和 `crossBetween`
（`between / mid-category`，仅 value 轴）。

日期轴时间单位（仅当 deck 里已有 `c:dateAx` 时可用；它可以来自 PowerPoint，或由
上面的 `add-chart.categoryAxis.type=date` 创建）：`scale` 支持
`baseTimeUnit` / `majorTimeUnit` / `minorTimeUnit`
（`days / months / years`，`null` 恢复自动），用 `axis: "category"` 定位日期轴；
`majorUnit`/`minorUnit` 此时是"每 N 个时间单位"的计数（如 `majorUnit: 2` +
`majorTimeUnit: "months"` = 每 2 个月一个主刻度）。典型场景：日粒度数据的
X 轴标签挤成一团 → 设 `majorTimeUnit: "months"`。普通 `c:catAx` 对这些时间单位
仍会 fail closed（含 `null` 清除）；需要日期语义时必须在创建阶段显式选择日期轴，
不能用 `set-chart` 猜测或转换既有分类轴。

轴条目还支持（xdoc ≥0.3.1，方案 7 长尾补齐）：

```json
{ "op": "set-chart", "slide": 1, "shape": {...},
  "axes": [
    { "axis": "value",
      "title": { "text": "USD (thousands)", "font": { "bold": true }, "rotation": -90 },
      "displayUnits": { "unit": "thousands", "showLabel": true } },
    { "axis": "category", "title": null }
  ] }
```

- `title`：轴标题。`text` / `font` / `rotation`（-90..90 度）；`null` 删除轴标题。
- `displayUnits`：仅 value 轴。`unit` 取内置档位
  `hundreds / thousands / ten-thousands / hundred-thousands / millions /
ten-millions / hundred-millions / billions / trillions`，或直接给正数作自定义
  除数（写 `c:custUnit`）；`showLabel: true` 同时显示单位标签；`null` 移除。
  金额类轴强烈建议用它代替手改数据（"以千为单位"的正确语义表达）。

> ⚠️ `cat` / `val` / `categoryAxis` / `valueAxis` / `valueX` / `xAxis` 之类的旧简写，
> 以及 `ser`、`secondaryVal`、`date`，**都不在** enum 内。axis 定位当前只能针对
> **主轴**；combo 图的次坐标轴(通过 `data.series[i].secondaryAxis: true` 创建,
> 见 §数据结构 → Combo)暂不能用 `set-chart` 的 `axes` 条目单独设样式 — 需要时
> 只能用 `patch-ooxml`(`--allow-raw-xml`)直改 `c:secondaryValAx` 节点。

### 改轴线 / 网格线 / 刻度标签

```json
{ "op": "set-chart", "slide": 1, "shape": {...},
  "axes": [{ "axis": "value", "line": { "width": "0.75pt", "color": "BFBFBF" } }] }

{ "op": "set-chart", "slide": 1, "shape": {...},
  "axes": [{ "axis": "value", "gridlines": { "width": "0.5pt", "color": "EEEEEE" },
             "minorGridlines": { "width": "0.25pt", "color": "F5F5F5" } }] }

{ "op": "set-chart", "slide": 1, "shape": {...},
  "axes": [{ "axis": "value", "gridlines": null }] }

{ "op": "set-chart", "slide": 1, "shape": {...},
  "axes": [{ "axis": "value",
             "ticks": { "major": "outside", "minor": "none",
                        "labelPosition": "next-to-axis", "numberFormat": "0.0%" } }] }

{ "op": "set-chart", "slide": 1, "shape": {...},
  "axes": [{ "axis": "category",
             "ticks": { "rotation": -45, "labelSkip": 2, "font": { "size": "9pt" } } }] }
```

`ticks.major` / `ticks.minor` 取值：`cross / inside / none / outside`（**不接受**
`out` / `in` 等简写）。`ticks.labelPosition` 取值：`high / low / next-to-axis / none`。
`gridlines` / `minorGridlines` 都接受 `null` 表示删除该组网格线。

`ticks` 还支持刻度标签排版（拥挤类目轴的首选修复手段，优先于缩字号）：

- `rotation`：-90..90 度，写入轴 `txPr` 的 bodyPr rot（**PNG 预览可见**）；
- `font`：刻度标签字体（同通用 font 对象）；
- `labelSkip` / `markSkip`：每 N 个类目显示一个标签 / 刻度线（≥1，仅类目轴）；
- `labelOffset`：0..1000，标签与轴的距离百分比（100 = 默认，仅类目轴）；
- `labelAlignment`：`center / left / right`（仅类目轴）。

> ⚠️ **刻度线默认是画出来的（xdoc ≥0.3.4）**：`c:majorTickMark` /
> `c:minorTickMark` 元素**缺失**时按 OOXML 默认值 `cross` 渲染 —— 轴线两侧
> 各伸出一小段，PowerPoint 也是这样。`add-chart` 不写这两个元素，所以**新建
> 图表默认两条轴都带 cross 刻度线**。要走极简风格（多数咨询版式的做法），必须
> 显式关掉：
>
> ```json
> { "op": "set-chart", "slide": 1, "shape": {...},
>   "axes": [{ "axis": "category", "ticks": { "major": "none", "minor": "none" } },
>            { "axis": "value",    "ticks": { "major": "none", "minor": "none" } }] }
> ```
>
> 另外三条相关事实，做视觉复核时会用到：
>
> - 刻度线用**轴线本身**的颜色与线宽；把轴线设成无线条（`line` 删除/无填充）
>   会连刻度线一起去掉，这与 PowerPoint 一致。
> - 长度按**轴标签字号**成比例（major ≈ 0.32 字号，minor ≈ 0.24 字号），
>   所以缩小刻度标签字号也会让刻度线变短；不存在单独调长度的开关。
> - 类目轴的 major 落在**类目带边界**（N 个类目 = N+1 条），minor 落在中点；
>   数值轴 major 落在主刻度、minor 落在次刻度。雷达图与饼图不画刻度线。

### 改某系列样式

```json
{
  "op": "set-chart",
  "slide": 1,
  "shape": {...},
  "series": [
    {
      "series": 0,
      "fill": { "type": "solid", "color": "1A73E8" },
      "line": { "width": "2pt", "color": "1A73E8" },
      "marker": { "symbol": "circle", "size": 6, "fill": "FFFFFF" },
      "smooth": false,
      "invertIfNegative": true
    }
  ]
}
```

`series` 是 0-based 索引；同一个 `series` 数组里可以给不同系列各写一条（同一系列
重复出现且字段冲突会被拒绝）。

> ⚠️ marker 用 `symbol`（不是 `kind`）：严格 enum，只收
> `auto / circle / dash / diamond / dot / none / picture / plus / square / star /
triangle / x`（其它值直接被 schema 拒绝）。marker 的 `fill` /
> `line` 取颜色字符串（如 `"FFFFFF"`），不是对象。

### 趋势线 / 误差线（系列级分析装饰）

```json
{ "op": "set-chart", "slide": 1, "shape": {...},
  "series": [
    { "series": 0,
      "trendlines": [
        { "type": "linear", "forward": 2,
          "displayEquation": true, "displayRSquared": true,
          "label": {
            "numberFormat": "0.0000",
            "font": { "name": "Aptos", "size": "9pt", "bold": false,
                      "color": "336699" },
            "rotation": -15
          } },
        { "type": "moving-average", "period": 3 }
      ] },
    { "series": 1,
      "errorBars": { "valueType": "percentage", "value": 5 } }
  ] }
```

- 推荐使用 `trendlines`，它按数组顺序**完整替换**同一系列的趋势线集合；数组顺序是
  唯一稳定 identity，不要假设可按 index 增删。`trendlines: []` 或
  `trendlines: null` 都会清空全部趋势线。
- 兼容入口 `trendline` 仍可用：对象表示完整替换为单条，`null` 表示清空。一个 series
  entry 同时出现 `trendline` 与 `trendlines` 会 fail-closed；不要混用。
- 每条趋势线的 `type`：`exponential / linear / logarithmic / moving-average /
polynomial / power`；`order`（2..6）仅 polynomial，`period`（2..255）仅
  moving-average，`intercept` 仅 exponential/linear/polynomial（组合错会被
  dry-run 拒绝并说明）；还支持 `forward` / `backward`（外推期数）、`name`、
  `line`（线样式）。pie/doughnut/radar 等不支持趋势线的 series 会拒绝非空集合，
  但仍允许清空。
- `label` 只负责 PowerPoint 自动生成的方程/R² 标签格式，首版安全字段为
  `numberFormat`、`font.name/size/bold/color` 和 `rotation`（-90..90）。只要提供
  `label`，同一趋势线必须显式设置 `displayEquation: true` 或
  `displayRSquared: true`；`label: null` 表示不写格式容器。当前不承诺自定义
  `<c:tx>` 文本或 manual layout，不能用 `label` 替换 PowerPoint 生成的公式内容。
- `label.font.size` 对齐 DrawingML `a:defRPr/@sz` 的 100..400000 centipoint
  边界，只接受带显式 `pt` 后缀的 1pt..4000pt 字符串，小数最多 4 位。其他
  单位、数字裸值和越界值会 fail-closed。
- `errorBars.valueType`：`fixed / percentage / std-dev`（需配 `value`）、
  `std-err`（不带 value）、`custom`（需 `plus` + `minus` 两个数值数组，长度=
  点数）；可选 `type`（`both / minus / plus`，默认 both）、`direction`
  （`x / y`，scatter/bubble 用）、`noEndCap`、`line`。`errorBars: null` 删除。

趋势线集合与标签属于高风险 chart XML 改动：先 dry-run 确认 selector、changedParts、
semantic/structure gate，再 apply；随后用 inspect/parse 回读确认趋势线数量、顺序、类型、
方程/R² 开关和 label 格式，最后执行 ZIP/XML 校验、预览复核，并在可用时跑 PowerPoint
clean-open。只看到 patch 成功不足以证明数组顺序和 `bold: false` 等显式值被保留。

> ✅ **当前预览支持（xdoc ≥0.3.1）**：PNG/PDF 预览链会渲染
> `trendlines`（以及兼容入口 `trendline`）/ `errorBars` / `dataTable` /
> `displayUnits` / 轴标题 /
> `minorGridlines`，包括趋势线方程与 R²、单位标签以及图下数据表布局。
> 刻度标签 `rotation` 也可见。若 capability probe 显示当前 runtime 不支持某项，
> 再按 [故障排查](troubleshooting.md) 中的 XML/Office fallback 复核；不要把旧
> runtime 的能力差异误判为写出失败。

### 数据标签

```json
{
  "op": "set-chart",
  "slide": 1,
  "shape": {...},
  "dataLabels": [
    {
      "scope": { "series": 0 },
      "showValue": true,
      "showPercentage": false,
      "showCategoryName": false,
      "showSeriesName": false,
      "position": "outside-end",
      "numberFormat": "#,##0"
    }
  ]
}
```

`scope` 是 **对象**（不是字符串）：

- 省略 `scope` → 整个 plot 0（= all 全部系列）
- `{ "series": 0 }` → 第 0 个系列
- `{ "series": 0, "point": 2 }` → 第 0 系列的第 2 个点
- 想同时给 plot 显式指定：`{ "plot": 0 }`

`position` 必须用全名（**shorthand 不接受**）：
`above / below / best-fit / center / inside-base / inside-end / left / outside-end / right`。

> ⚠️ 老版本里见过的 `"all"` / `"ctr"` / `"l"` / `"r"` / `"t"` / `"b"` / `"inBase"` /
> `"inEnd"` / `"outEnd"` 全部被 schema 拒绝。

`dataLabels[]` 还支持 `separator`（多字段标签的分隔符字符串，如 `"; "`）与
`font`（标签字体对象）；两者仅 plot / series 作用域，point 作用域目前只收
`position`。

### Plot 区域（gap / overlap / vary）

```json
{
  "op": "set-chart",
  "slide": 1,
  "shape": {...},
  "plot": {
    "gapWidth": 150,
    "overlap": -10,
    "varyByCategories": true,
    "bubbleScale": 100
  }
}
```

- `index` 多 plot 图表用来选 plot（非负整数，默认 0）
- `gapWidth` 0-500（柱间距百分比）
- `overlap` -100 to 100（柱重叠）
- `varyByCategories` 单系列时每类目不同颜色
- `bubbleScale` bubble 缩放
- `firstSliceAngle` 0-360（pie / doughnut 首片起始角，**预览可见**）
- `holeSize` 1-90（仅 doughnut 环孔大小百分比，**预览可见**；数值越小环越粗）
- `sizeRepresents` `area / width`（仅 bubble：气泡大小映射面积还是直径）

### 图表级选项（displayBlanksAs / roundedCorners / dataTable）

```json
{ "op": "set-chart", "slide": 1, "shape": {...},
  "displayBlanksAs": "span",
  "roundedCorners": false,
  "dataTable": { "showHorizontalBorder": true, "showVerticalBorder": true,
                 "showOutline": true, "showKeys": true } }
```

- `displayBlanksAs`：`gap / span / zero` — 折线图有缺失数据时的语义选择
  （`span` 连线跨过空值，`zero` 按 0 画；创建时默认 `gap`）。
- `roundedCorners`：图表外框圆角开关。
- `dataTable`：图下数据表（四个 show* 开关至少给一个；`null` 移除整个数据表）。
  xdoc ≥0.3.1 的 PNG/PDF 预览会显示数据表布局。

### 单点样式

```json
{
  "op": "set-chart",
  "slide": 1,
  "shape": {...},
  "series": [
    {
      "series": 0,
      "points": [
        {
          "point": 2,
          "fill": { "type": "solid", "color": "EA4335" },
          "marker": { "symbol": "diamond", "size": 10 }
        }
      ]
    }
  ]
}
```

适合"高亮某个数据点"。

### 只改 marker（标记符号）

```json
{
  "op": "set-chart",
  "slide": 1,
  "shape": {...},
  "series": [
    {
      "series": 0,
      "marker": { "symbol": "square", "size": 6, "fill": "FFFFFF", "line": "1A73E8" }
    }
  ]
}
```

## 完整示例：营收图

```json
{
  "schemaVersion": "pptx-patch/v1",
  "ops": [
    { "op": "add-slide", "layout": { "type": "title" } },
    {
      "op": "set-text-frame",
      "slide": 0,
      "shape": { "placeholder": "title" },
      "text": "营收分析"
    },
    {
      "op": "add-chart",
      "slide": 0,
      "kind": "column",
      "variant": "clustered",
      "x": "1in",
      "y": "2in",
      "w": "11in",
      "h": "4.5in",
      "name": "Revenue",
      "title": "季度营收（万元）",
      "legend": "bottom",
      "data": {
        "categories": ["Q1", "Q2", "Q3", "Q4"],
        "series": [
          { "name": "2025", "values": [1000, 1200, 1400, 1600] },
          { "name": "2026", "values": [1500, 1800, 2100, 2400] }
        ]
      }
    },
    {
      "op": "set-chart",
      "slide": 0,
      "shape": { "name": "Revenue" },
      "style": 6,
      "dataLabels": [{ "showValue": true, "position": "outside-end", "numberFormat": "#,##0" }]
    }
  ]
}
```

> ⚠️ 上例 `dataLabels` 条目省略了 `scope` —— 这等价于 plot 0（覆盖所有系列）。要只标
> 某一个系列，加 `"scope": { "series": 1 }`。

## 时间序列 / 预测的视觉陷阱

按时间序列画 column / bar 时，如果只填了上半年实际数据、下半年用 `0` 占位，
渲染出来就像业务突然崩盘。处理方式：

1. **补预测值**：把 Q3 / Q4 用估算值填上，类目轴标注 `"Q3 (预测)"` / `"Q4 (预测)"`
2. **改用部分类目**：只展示已有数据的 `Q1 / Q2`，下半年单独做 callout
3. **添加 highlight 区**：用 `set-chart` 的 `series[].points` 把预测点改成虚线/不同色

不要把"暂无数据"和"业务断崖"留给观众自己分辨。

## Unsupported 时怎么办

下列 Office `XlChartType` / 高级特性当前 xdoc 标为 unsupported：

- 3D series-axis，以及日期轴的高级手工 layout/多轴变体（显式单 category
  `c:dateAx` 创建和时间单位已支持）
- volume stock（含 volume 维度的 K 线）
- 极少数 chartEx 子类型（`paretoLine` 等非主线变体）

遇到时：

1. 告诉用户 "这种图表 xdoc 当前不支持，可以用..." 给出替代方案
2. 备选方案：
   - volume stock → 拆成 stock + bar 两张图
   - 高级 secondary-axis 之外的多轴 → 用 `combo` 的 `secondaryAxis` 加单轴方案
3. 不要假装做了 — 一定要让用户知道

## 不要做的事

- ❌ 不要把 `categories` 当成 `series`（categories 是 X 轴标签，series 才是数据线）
- ❌ scatter / bubble 用了 `categories + values` 会失败 — 用 `points: [{x,y}]`
- ❌ stock 的 high/low/close 数组长度必须等于 categories
- ❌ 不要假定 chart 内部坐标系跟 slide 一样 — `set-chart` 的 `axes[].scale` 是 chart-local

## ChartEx creation and verification notes

For PowerPoint-only chart types such as `waterfall`, `sunburst`, `treemap`,
`histogram`, `box-whisker`, and `funnel`, do not assume that a successful
`xdoc pptx apply --dry-run` means the object will render in PowerPoint.

- Use the ChartEx-specific `dataEx` payload shape. Do not pass the ordinary
  chart `data.categories` / `data.series` shape for these kinds unless the
  current xdoc schema explicitly documents that mapping.
- `add-chart.title` is ChartEx-aware: non-empty text writes native `cx:title`,
  blank text omits the container, and `set-chart-data.dataEx` preserves it.
  Never write classic `<c:title>` into `chartEx*.xml`. Explicit
  `add-chart.legend` control remains unsupported and is rejected instead of
  ignored; use the default ChartEx legend semantics or separate editable
  labels when a custom legend is required.
- `xdoc convert` is not sufficient evidence for ChartEx rendering. Always
  use a non-interactive PowerPoint baseline render when the optional macOS +
  scriptable PowerPoint + Nushell + `mutool` evidence route is available:
  `nu <skill-root>/scripts/pptx-nova-powerpoint-snapshot.nu deck.pptx --slides N-M --out <run-dir>/powerpoint/slide-%d.png --method pdf-render --json > <run-dir>/powerpoint-native-render.json`.
  Then run the high-risk finalizer with `--candidate deck.pptx
--powerpoint-native-render <run-dir>/powerpoint-native-render.json`. It reads
  the final ZIP, maps every `chartEx*.xml` relationship back to its 1-based
  slide, and requires candidate/hash/image-bound coverage for all such slides.
  When the complete optional route is available, absence or staleness is a hard
  failure. When any prerequisite is unavailable, the baseline workflow remains
  usable but the result is an explicit unverified warning rather than a pass;
  stop if the user or delivery policy explicitly requires PowerPoint-native proof.
  Treat user phrases such as "PowerPoint 截图" or "用 PowerPoint 显示效果对比" as
  PowerPoint render verification, not as permission to use window-mode screenshots.
  Use `--method window` only if `pdf-render` fails; keep the failed pdf-render
  report and record the fallback reason. Window mode now fails closed unless
  the frontmost process, staged presentation path/name, window title, current
  slide, canvas rectangle, and PNG/Retina scale remain consistent before and
  after capture. It is still a fallback and does not satisfy the ChartEx
  `pdf-render` gate. Scope it to the minimum suspect slides.
- If PowerPoint displays `This chart isn't available in your version.`, the
  candidate is not shippable as a ChartEx object even if the OOXML is
  well-formed and xdoc inspect succeeds.
- When a deadline requires a PowerPoint-renderable deliverable before ChartEx
  OOXML support is fixed, use native editable shapes/text to recreate the
  visual chart and document that it is not a native chart object.
