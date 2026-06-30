# 图表（Chart）创建与编辑

xdoc 支持 **19 种 chart kind**，每种支持若干 variant。背后映射 Office 标准
`XlChartType` 103 项 catalog；当前 45 项 supported / 32 项 partial / 26 项 unsupported。

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
add-chart / replace-chart-data，apply 后保存 final-inspect.json，并运行
pptx-nova-semantic-audit.mjs 输出 semantic-audit.json。该审计只做轻量语义门禁：
数据维度、数值类型、source/claim 披露和最终原生 chart 对象存在性；它不是完整 OOXML
chart 等价检查。semantic-audit.json 若为 fail，最终 evidence-summary 必须阻塞；warn
可以披露后继续视觉复核。

## Native diagram/table presets

常见商务图示优先用 recipe preset，而不是手算几十个 `add-shape` 坐标。这些 preset
会编译成原生可编辑 PPTX 对象，支持 `theme` 字段随 themePack 改色：

| preset           | op                     | 输入字段                       | 适用场景                     |
| ---------------- | ---------------------- | ------------------------------ | ---------------------------- |
| Timeline         | `add-timeline`         | `title`, `items[]`             | 里程碑、发布节奏、历史演进   |
| Roadmap          | `add-roadmap`          | `title`, `phases[]`            | 产品规划、季度计划、阶段目标 |
| 2x2 Matrix       | `add-matrix-2x2`       | `title`, `quadrants[4]`        | 优先级、定位、风险收益       |
| Process Flow     | `add-process-flow`     | `title`, `steps[]`             | 流程、操作步骤、转化前段     |
| Funnel           | `add-funnel`           | `title`, `stages[]`            | 销售漏斗、转化分析、pipeline |
| SWOT Matrix      | `add-swot`             | `title`, 四个象限列表          | 战略评估、市场分析、工作坊   |
| Pyramid          | `add-pyramid`          | `title`, `levels[]`            | 层级、成熟度、运营模型       |
| Hub Spoke        | `add-hub-spoke`        | `title`, `hub`, `spokes[]`     | 平台生态、能力地图、干系人   |
| Cycle            | `add-cycle`            | `title`, `steps[]`             | 反馈闭环、运营节奏、复盘流程 |
| Gantt            | `add-gantt`            | `title`, `tasks[]`             | 交付计划、项目排期、里程碑   |
| Scorecard Table  | `add-scorecard-table`  | `title`, `headers[]`, `rows[]` | 评分卡、供应商评估、就绪度   |
| Comparison Cards | `add-comparison-cards` | `title`, `cards[]`             | 方案比较、功能分组、场景权衡 |

### Timeline

```json
{
  "op": "add-timeline",
  "title": "Launch timeline",
  "items": [
    { "date": "Q1", "label": "Design", "text": "Prototype" },
    { "date": "Q2", "label": "Beta", "text": "Pilot customers" },
    { "date": "Q3", "label": "GA", "text": "Launch" }
  ],
  "theme": { "accent": "0A6BFF", "text": "111827", "muted": "667085", "background": "FFFFFF" }
}
```

### Roadmap

```json
{
  "op": "add-roadmap",
  "title": "Product roadmap",
  "phases": [
    { "label": "Now", "period": "Q1", "items": ["Stabilize core", "Instrument usage"] },
    { "label": "Next", "period": "Q2", "items": ["Self-serve onboarding", "Partner API"] },
    { "label": "Later", "period": "Q3", "items": ["Enterprise controls"] }
  ]
}
```

### 2x2 matrix

`quadrants` 必须正好 4 项，按左上、右上、左下、右下顺序填。

```json
{
  "op": "add-matrix-2x2",
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
```

### Process flow

```json
{
  "op": "add-process-flow",
  "title": "Sales process",
  "steps": [
    { "label": "Lead", "text": "Inbound capture" },
    { "label": "Qualify", "text": "Score fit" },
    { "label": "Close", "text": "Contract" }
  ]
}
```

### Funnel

```json
{
  "op": "add-funnel",
  "title": "Conversion funnel",
  "stages": [
    { "label": "Visitors", "value": "120k" },
    { "label": "Trials", "value": "18k" },
    { "label": "Paid", "value": "3.2k" }
  ]
}
```

### SWOT matrix

```json
{
  "op": "add-swot",
  "title": "Market view",
  "strengths": ["Brand", "Retention"],
  "weaknesses": ["Long sales cycle"],
  "opportunities": ["New segment"],
  "threats": ["Price pressure"]
}
```

### Pyramid

```json
{
  "op": "add-pyramid",
  "title": "Operating model",
  "levels": [
    { "label": "Strategy" },
    { "label": "Programs", "text": "Cross-functional bets" },
    { "label": "Execution" }
  ]
}
```

### Hub spoke

```json
{
  "op": "add-hub-spoke",
  "title": "Platform ecosystem",
  "hub": "Core API",
  "spokes": [
    { "label": "Partners" },
    { "label": "Apps" },
    { "label": "Data" },
    { "label": "Automation" }
  ]
}
```

### Cycle

```json
{
  "op": "add-cycle",
  "title": "Learning loop",
  "steps": [{ "label": "Plan" }, { "label": "Build" }, { "label": "Measure" }, { "label": "Learn" }]
}
```

### Gantt

`date` 和 `value` 分别作为开始/结束标签；当前 preset 生成可编辑的任务条，不依赖图表对象。

```json
{
  "op": "add-gantt",
  "title": "Delivery plan",
  "tasks": [
    { "label": "Design", "date": "Jan", "value": "Feb" },
    { "label": "Build", "date": "Feb", "value": "Apr" },
    { "label": "Launch", "date": "May", "value": "Jun" }
  ]
}
```

### Scorecard table

```json
{
  "op": "add-scorecard-table",
  "title": "Vendor scorecard",
  "headers": ["Vendor", "Score", "Risk"],
  "rows": [
    ["A", "92", "Low"],
    ["B", "84", "Medium"]
  ]
}
```

### Comparison cards

```json
{
  "op": "add-comparison-cards",
  "title": "Options",
  "cards": [
    { "label": "Fast", "text": "Ship now" },
    { "label": "Balanced", "text": "Stage rollout" },
    { "label": "Deep", "text": "Invest more" }
  ]
}
```

## chart kind × variant 速记

| kind                                                | 推荐 variant                                                          | 备注                                             |
| --------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| `column` / `bar`                                    | `clustered` / `stacked` / `percentStacked`                            | 最常用                                           |
| `column3D` / `bar3D`                                | `clustered` / `stacked` / `percentStacked`                            | 3D 版本                                          |
| `line`                                              | `standard` / `markers` / `stacked` / `percentStacked`                 | 加 marker 用 `markers`                           |
| `line3D`                                            | `standard`                                                            | 仅一种                                           |
| `area` / `area3D`                                   | `standard` / `stacked` / `percentStacked`                             |                                                  |
| `pie` / `pie3D`                                     | `standard` / `exploded`                                               | exploded 拉开扇区                                |
| `doughnut`                                          | `standard` / `exploded`                                               | 圈饼图                                           |
| `radar`                                             | `standard`                                                            | 雷达                                             |
| `scatter`                                           | `markers` / `lines` / `linesNoMarkers` / `smooth` / `smoothNoMarkers` | XY 散点                                          |
| `bubble` / `bubble3D`                               | `standard`                                                            | 气泡（含 size 维度）                             |
| `stock`                                             | `standard`                                                            | HLC/OHLC K 线                                    |
| `surface` / `surface3D`                             | `standard` / `wireframe`                                              | 曲面                                             |
| `combo`                                             | `standard`                                                            | 组合图；支持每个 series 加 `secondaryAxis: true` |
| `waterfall` / `funnel` / `histogram` / `pareto`     | `standard`                                                            | chartEx 系列（写到 `ppt/charts/chartExN.xml`）   |
| `treemap` / `sunburst` / `boxWhisker` / `regionMap` | `standard`                                                            | chartEx 系列；数据结构同直角坐标系               |

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
- 用 `replace-chart-data` 修改既有 stock chart 时，xdoc 会同步 chart XML 和 embedded
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

### ChartEx（waterfall / funnel / histogram / pareto / treemap / sunburst / boxWhisker / regionMap）

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

- `waterfall`：`points[].kind` 使用 `increase` / `decrease` / `subtotal` / `total`；
  subtotal/total 应映射到 `<cx:subtotals>`，不要凭空写 `<cx:aggregation/>`。
- `funnel`：`stages[]` 的数值维度应是 `numDim type="val"`，不是 `size`；通常需要
  value data labels 和 funnel 自己的 category axis gapWidth。
- `histogram`：用原始样本 `values[]`，PowerPoint 语义通常是
  `layoutId="clusteredColumn"` + `<cx:binning intervalClosed="r">`，不是自造普通柱图。
- `sunburst` / `treemap`：层级输入可用 `nodes[]`，但写入 ChartEx 时通常只输出叶子行；
  多级 category cache 按 PowerPoint 的 leaf-to-root 层级顺序写入，不能把中间节点也当成
  独立 data point。
- `boxWhisker`：每个 series 可带 `categories[]`，长度必须等于 `values[]`；重复的
  `Day1` / `Day2` / `Day3` 等 category label 用来形成分组轴，不能退化成单一 category。
- 参考 deck 复刻时，优先复用同类型既有 ChartEx 的 `chartStyle` / `chartColorStyle`
  关系，并补 parser/generator 回归测试固定上述语义。

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

## 编辑图表

### 改数据

```json
{
  "op": "replace-chart-data",
  "slide": 1,
  "shape": { "name": "Revenue Chart" },
  "data": { "categories": [...], "series": [...] }
}
```

改完 chart 数据后，至少做三步验证：

1. dry-run 中确认 `resolvedSelectors[]` 命中目标 chart，`changedParts[]` 包含 chart
   part；若是 embedded workbook-backed chart，也应看到 workbook part 变化。
2. 对关键业务语义做轻量审计，例如 stock 的 low/high 不变量、series/category 长度一致、
   legend 系列名不为空。把结果保存到 run 目录（如 `semantic-audit.json`）。
3. 做视觉复核。若 `xdoc convert --to png` 对某类复杂/长尾 chart 没有渲染完整图体，
   不要把空白预览当作 deck 内容缺失；改用 PowerPoint、LibreOffice、PDF 渲染或用户提供的
   权威预览作为视觉依据，并在 `visual_review.json` 中记录 fallback 原因。

### 一键换 PowerPoint 内置 style（1-48）

```json
{ "op": "set-chart-style", "slide": 1, "shape": {...}, "style": 6 }
```

清掉：

```json
{ "op": "set-chart-style", "slide": 1, "shape": {...}, "style": null }
```

PowerPoint 内置 1-48 covers warm/cool/mono/contrast 各种预设，比手动调色快。

### 改标题

```json
{
  "op": "set-chart-title-style",
  "slide": 1,
  "shape": {...},
  "text": "2026 vs 2025 营收",
  "font": { "name": "Inter", "size": "16pt", "bold": true, "color": "1F1F1F" }
}
```

### 改图例

```json
{
  "op": "set-chart-legend-style",
  "slide": 1,
  "shape": {...},
  "position": "bottom",
  "includeInLayout": false,
  "font": { "name": "Inter", "size": "10pt" }
}
```

### 改坐标轴

```json
{
  "op": "set-chart-axis-scale",
  "slide": 1,
  "shape": {...},
  "axis": "val",
  "min": 0,
  "max": 30,
  "majorUnit": 5,
  "minorUnit": 1
}
```

`axis` 取值（schema 同时接受新旧两套；推荐用全名）：

- 全名：`category` / `value` / `x` / `y` / `valueX` / `valueY` / `xAxis` / `yAxis`
- shorthand 兼容：`cat` / `val` / `categoryAxis` / `valueAxis`

> ⚠️ schema 同时收 `cat` 和 `category`、`val` 和 `value`；但 `ser`、`secondaryVal`、
> `date` **不在** enum 内。这些 axis-style op 当前只能针对**主轴**；combo 图的
> 次坐标轴(通过 `data.series[i].secondaryAxis: true` 创建,见 §数据结构 → Combo)
> 暂不能用 `set-chart-axis-style` 等 op 单独设样式 — 需要时只能用
> `raw-ooxml-patch`(`--allow-raw-xml`)直改 `c:secondaryValAx` 节点。

### 改轴线 / 网格线 / 刻度标签

```json
{ "op": "set-chart-axis-style", "slide": 1, "shape": {...}, "axis": "value",
  "style": { "line": "0.75pt", "color": "BFBFBF" } }

{ "op": "set-chart-gridline-style", "slide": 1, "shape": {...}, "axis": "value",
  "style": { "line": "0.5pt", "color": "EEEEEE", "dash": "dot" } }

{ "op": "set-chart-axis-ticks", "slide": 1, "shape": {...}, "axis": "value",
  "majorTick": "outside", "minorTick": "none", "tickLabelPosition": "nextToAxis",
  "numberFormat": "0.0%" }
```

`majorTick` / `minorTick` 取值：`cross / inside / none / outside`（**不接受**
`out` / `in` 等简写）。`tickLabelPosition` 取值：`high / low / nextToAxis / none`。

### 改某系列样式

```json
{
  "op": "set-chart-series-style",
  "slide": 1,
  "shape": {...},
  "series": 0,
  "fill": { "kind": "solid", "color": "1A73E8" },
  "line": { "width": "2pt", "color": "1A73E8" },
  "marker": { "symbol": "circle", "size": 6, "fill": {...} },
  "smooth": false,
  "invertIfNegative": true
}
```

`series` 是 0-based 索引；可以多 op 设置不同系列。

> ⚠️ marker 用 `symbol`（不是 `kind`）：常用值 `circle / square / diamond /
triangle / x / star / dash / dot / plus / none / auto`。

### 数据标签

```json
{
  "op": "set-chart-data-labels",
  "slide": 1,
  "shape": {...},
  "scope": { "series": 0 },
  "showValue": true,
  "showPercentage": false,
  "showCategoryName": false,
  "showSeriesName": false,
  "position": "outsideEnd",
  "numberFormat": "#,##0"
}
```

`scope` 是 **对象**（不是字符串）：

- 省略 `scope` → 整个 plot 0（= all 全部系列）
- `{ "series": 0 }` → 第 0 个系列
- `{ "series": 0, "point": 2 }` → 第 0 系列的第 2 个点
- 想同时给 plot 显式指定：`{ "plot": 0 }`

`position` 必须用全名（**shorthand 不接受**）：
`above / below / bestFit / center / insideBase / insideEnd / left / outsideEnd / right`。

> ⚠️ 老版本里见过的 `"all"` / `"ctr"` / `"l"` / `"r"` / `"t"` / `"b"` / `"inBase"` /
> `"inEnd"` / `"outEnd"` 全部被 schema 拒绝。

### Plot 区域（gap / overlap / vary）

```json
{
  "op": "set-chart-plot-style",
  "slide": 1,
  "shape": {...},
  "gapWidth": 150,
  "overlap": -10,
  "varyByCategories": true,
  "bubbleScale": 100
}
```

- `gapWidth` 0-500（柱间距百分比）
- `overlap` -100 to 100（柱重叠）
- `varyByCategories` 单系列时每类目不同颜色
- `bubbleScale` bubble 缩放

### 单点样式

```json
{
  "op": "set-chart-point-style",
  "slide": 1,
  "shape": {...},
  "series": 0,
  "point": 2,
  "fill": { "kind": "solid", "color": "EA4335" },
  "marker": { "kind": "diamond", "size": 10 }
}
```

适合"高亮某个数据点"。

### 标记线/虚线

```json
{
  "op": "set-chart-marker-style",
  "slide": 1,
  "shape": {...},
  "series": 0,
  "style": { "symbol": "square", "size": 6,
             "fill": { "kind": "solid", "color": "FFFFFF" },
             "line": { "width": "1pt", "color": "1A73E8" } }
}
```

## 完整示例：营收图

```json
{
  "schemaVersion": 1,
  "ops": [
    { "op": "add-slide", "layout": { "type": "title" } },
    {
      "op": "set-text",
      "slide": 0,
      "shape": { "placeholder": { "type": "title" } },
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
    { "op": "set-chart-style", "slide": 0, "shape": { "name": "Revenue" }, "style": 6 },
    {
      "op": "set-chart-data-labels",
      "slide": 0,
      "shape": { "name": "Revenue" },
      "showValue": true,
      "position": "outsideEnd",
      "numberFormat": "#,##0"
    }
  ]
}
```

> ⚠️ 上例最后一个 op 省略了 `scope` —— 这等价于 plot 0（覆盖所有系列）。要只标
> 某一个系列，加 `"scope": { "series": 1 }`。

## 时间序列 / 预测的视觉陷阱

按时间序列画 column / bar 时，如果只填了上半年实际数据、下半年用 `0` 占位，
渲染出来就像业务突然崩盘。处理方式：

1. **补预测值**：把 Q3 / Q4 用估算值填上，类目轴标注 `"Q3 (预测)"` / `"Q4 (预测)"`
2. **改用部分类目**：只展示已有数据的 `Q1 / Q2`，下半年单独做 callout
3. **添加 highlight 区**：用 `set-chart-point-style` 把预测点改成虚线/不同色

不要把"暂无数据"和"业务断崖"留给观众自己分辨。

## Unsupported 时怎么办

下列 Office `XlChartType` / 高级特性当前 xdoc 标为 unsupported：

- 3D series-axis / 高级 date-axis
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
- ❌ 不要假定 chart 内部坐标系跟 slide 一样 — `set-chart-axis-scale` 是 chart-local

## ChartEx creation and verification notes

For PowerPoint-only chart types such as `waterfall`, `sunburst`, `treemap`,
`histogram`, `boxWhisker`, and `funnel`, do not assume that a successful
`xdoc pptx apply --dry-run` means the object will render in PowerPoint.

- Use the ChartEx-specific `dataEx` payload shape. Do not pass the ordinary
  chart `data.categories` / `data.series` shape for these kinds unless the
  current xdoc schema explicitly documents that mapping.
- Avoid ordinary chart mutators on ChartEx parts. In particular, do not write
  normal `<c:title>` or `<c:legend>` nodes into `ppt/charts/chartEx*.xml`.
  Put page titles, legends, and explanatory labels in separate editable
  textboxes when needed.
- `xdoc convert` is not sufficient evidence for ChartEx rendering. Always
  verify these chart types with a non-interactive PowerPoint baseline render:
  `nu tools/pptx-snapshot.nu deck.pptx --slides N-M --out out/slide-%d.png --method pdf-render --json`.
  Treat user phrases such as "PowerPoint 截图" or "用 PowerPoint 显示效果对比" as
  PowerPoint render verification, not as permission to use window-mode screenshots.
  Use `--method window` only if `pdf-render` fails; keep the failed pdf-render
  report and record the fallback reason. Window capture is slow and can
  interfere with the user's desktop, so scope it to the minimum suspect slides.
- If PowerPoint displays `This chart isn't available in your version.`, the
  candidate is not shippable as a ChartEx object even if the OOXML is
  well-formed and xdoc inspect succeeds.
- When a deadline requires a PowerPoint-renderable deliverable before ChartEx
  OOXML support is fixed, use native editable shapes/text to recreate the
  visual chart and document that it is not a native chart object.
