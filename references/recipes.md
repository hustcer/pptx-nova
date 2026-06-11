# Recipes —— 高层意图 → 自动 patch

Recipe 是 xdoc 暴露的 **19 个高层意图 op**，相比手堆 `add-textbox`/`add-shape`，
recipe 已经把字体、间距、坐标、placeholder 类型预设好；模型选错坐标的概率几乎
为 0，是创建 deck 的首选。

每个 recipe 既可以**直接放进 `apply` 的 patch JSON**（自动 expand 成底层 patch），
也可以先 `--compile` 输出展开后的 patch JSON 供审查。报告会带 `expandedOps[]` 与
`createdIds[]`。

## 通用 envelope

所有 recipe 都嵌进同一种 patch envelope：

```json
{
  "schemaVersion": 1,
  "ops": [
    { "op": "add-title-slide", "title": "..." },
    { "op": "add-kpi-grid", "title": "...", "items": [...] }
  ]
}
```

mix 与底层 patch op 自由：可以一份 patch 里同时有 `add-title-slide` 与
`set-theme-color`，按数组顺序执行。

## Recipe 速览

| 类型        | op                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------- |
| 页面骨架    | `add-title-slide`, `add-section-slide`, `add-two-column-slide`, `add-image-with-caption`       |
| 指标 / 表格 | `add-kpi-grid`, `add-comparison-table`, `add-scorecard-table`, `add-comparison-cards`          |
| 商务图示    | `add-timeline`, `add-roadmap`, `add-matrix-2x2`, `add-process-flow`, `add-funnel`, `add-cycle` |
| 结构图示    | `add-swot`, `add-pyramid`, `add-hub-spoke`, `add-gantt`                                        |
| 品牌改装    | `apply-corporate-rebrand`                                                                      |

本文件展开核心页面 recipe 和 rebrand。native diagram/table preset 的完整输入示例
放在 `references/charts.md` 的 "Native diagram/table presets"。

## 通用 `theme` 字段

除 `apply-corporate-rebrand` 外，页面 / KPI / table / diagram recipe 都接受可选
`theme`，会覆盖该页的样式：

```json
"theme": {
  "accent": "#1A73E8",
  "background": "#FFFFFF",
  "text": "#1F1F1F"
}
```

颜色支持 `#RRGGBB` / `RRGGBB`（大小写不敏感）。省略 `theme` 使用 deck 当前主题。

---

## 1. `add-title-slide` —— 封面 / 章节扉页

```json
{
  "op": "add-title-slide",
  "title": "S8FY 季度业务回顾",
  "subtitle": "2026 Q2 · 业务部门",
  "level": "recipe"
}
```

| 字段       | 必填 | 说明                      |
| ---------- | ---- | ------------------------- |
| `title`    | ✅   | 主标题（非空字符串）      |
| `subtitle` |      | 副标题                    |
| `theme`    |      | 可选样式覆盖              |
| `level`    |      | 固定 `"recipe"`（可省略） |

适用：封面、章节扉页、模块引导页。

---

## 2. `add-section-slide` —— 大章节分割页

比 `add-title-slide` 多一个 `eyebrow`（眉标），适合 PART 01 / 章节序号那种风格。

```json
{
  "op": "add-section-slide",
  "title": "财务表现",
  "subtitle": "营收、利润率、现金流",
  "eyebrow": "PART 01"
}
```

---

## 3. `add-two-column-slide` —— 左右对照页

```json
{
  "op": "add-two-column-slide",
  "title": "新旧方案对比",
  "left": {
    "heading": "旧方案",
    "text": "依赖 python-pptx，需要本地运行环境",
    "bullets": ["运行慢", "无 dry-run", "错误不结构化"]
  },
  "right": {
    "heading": "新方案",
    "text": "xdoc CLI，单命令调用",
    "bullets": ["原生可编辑", "结构化错误", "可回放审计"]
  }
}
```

`left` / `right` 都是 `{ heading?, text?, bullets?[] }` 对象，任一字段可省略。

---

## 4. `add-image-with-caption` —— 大图 + 标题 + 说明

```json
{
  "op": "add-image-with-caption",
  "title": "新产品包装外观",
  "caption": "采用环保再生纸，符合 ESG 战略",
  "image": {
    "assetSource": { "path": "images/package.png", "mime": "image/png" }
  }
}
```

`image` 接受与 `add-picture` 相同的两种形态：

- `{ "assetSource": { "path": "<rel>", "mime": "<type>" } }` —— 推荐，配合
  `--asset-root` 限定本地资产根
- `{ "bytesBase64": "...", "mime": "image/png" }` —— 内联（适合代码生成的图片）

---

## 5. `add-kpi-grid` —— KPI 卡片网格（最适合季度报告）

```json
{
  "op": "add-kpi-grid",
  "title": "Q2 2026 关键指标",
  "items": [
    { "label": "营收", "value": "$42M", "delta": "+12% YoY" },
    { "label": "毛利率", "value": "58%", "delta": "+1.2pp" },
    { "label": "NPS", "value": "62", "delta": "+4" },
    { "label": "用户", "value": "1.2M", "delta": "+18%" }
  ]
}
```

每个 `item` 形如 `{ label, value, delta? }`，3 字段都是字符串。可选 `delta`
默认不渲染颜色趋势（recipe 会按文本启发式渲染，不会自动算 +/-）。

适合：仪表盘、季度报告、招股书指标页。

---

## 6. `add-comparison-table` —— 比较表格

```json
{
  "op": "add-comparison-table",
  "title": "三家供应商对比",
  "headers": ["维度", "供应商 A", "供应商 B", "供应商 C"],
  "rows": [
    ["报价", "$1.2M", "$1.5M", "$0.9M"],
    ["交付", "8 周", "6 周", "10 周"],
    ["质保", "12 个月", "24 个月", "6 个月"]
  ]
}
```

`headers` / `rows` 都是字符串数组；`rows[*].length` 应与 `headers.length` 一致，
不一致时会有 `visualRisks` 警告但仍会渲染。

---

## 7. `apply-corporate-rebrand` —— 一键品牌改装

```json
{
  "op": "apply-corporate-rebrand",
  "colors": {
    "accent1": "#1A73E8",
    "accent2": "#34A853",
    "accent3": "#FBBC04",
    "accent4": "#EA4335",
    "dk1": "#1F1F1F",
    "lt1": "#FFFFFF"
  },
  "fonts": {
    "major": "Inter",
    "minor": "Inter",
    "heading": "Inter"
  },
  "background": "#FFFFFF",
  "titleStyle": {
    "font": { "name": "Inter", "bold": true },
    "size": "32pt",
    "color": "#1F1F1F"
  },
  "bodyStyle": {
    "font": { "name": "Inter" },
    "size": "16pt",
    "color": "#1F1F1F"
  }
}
```

字段释义：

| 字段                       | 含义                                                           |
| -------------------------- | -------------------------------------------------------------- |
| `colors`                   | 主题色字典，键名走 `lt1/dk1/lt2/dk2/accent1..6/hlink/folHlink` |
| `fonts.major / heading`    | 大标题字体（OOXML `majorFont`）                                |
| `fonts.minor / body`       | 正文字体（OOXML `minorFont`）                                  |
| `background`               | 母版背景，可以是 `#RRGGBB` 或完整 fill 对象                    |
| `titleStyle` / `bodyStyle` | 默认标题 / 正文样式（覆盖 master `txStyles`）                  |

> ⚠️ `titleStyle` / `bodyStyle` **只接受** `font / color / size / spacing /
alignment` 五个字段，**不接受**顶层 `bold` / `italic` —— 这是新手最常犯的错。
> 要加粗 / 斜体，必须放进 `font` 子对象：
>
> ```json
> "titleStyle": { "font": { "name": "Inter", "bold": true } }
> ```
>
> 顶层写 `"bold": true` 会被 schema `additionalProperties: false` 拒绝。

底层会编译成 `set-theme-color` × N + `set-theme-font` × M + `set-master-bg` +
`set-master-placeholder-style` 等多个 patch op；`--compile` 可以看到展开后的
完整 patch。

适合：客户 deck 一键换 logo 色调；同一份 deck 给不同 BU 复用前的色彩对齐。

---

## Recipe 与 patch op 混用模式

下面这份 patch **同时**做 "一键改主题 + 加 KPI 页 + 加对比表"：

```json
{
  "schemaVersion": 1,
  "ops": [
    {
      "op": "apply-corporate-rebrand",
      "colors": { "accent1": "#1A73E8" },
      "fonts": { "major": "Inter", "minor": "Inter" }
    },
    {
      "op": "add-title-slide",
      "title": "Q2 2026 业务回顾"
    },
    {
      "op": "add-kpi-grid",
      "title": "关键指标",
      "items": [
        { "label": "营收", "value": "$42M", "delta": "+12%" },
        { "label": "NPS", "value": "62", "delta": "+4" }
      ]
    },
    {
      "op": "add-comparison-table",
      "title": "新旧方案",
      "headers": ["维度", "旧", "新"],
      "rows": [
        ["速度", "慢", "快"],
        ["可审计", "❌", "✅"]
      ]
    }
  ]
}
```

执行：`xdoc pptx apply -p patch.json -o out.pptx --dry-run --json` 看
`expandedOps[]`。

## 何时降级到底层 patch op

- 自定义形状（不是 layout placeholder）
- 自定义图表样式 / 坐标精确控制
- 已有 deck 的局部修改（recipe 主要面向"加新页"）
- 需要 `set-shape-effect` / `set-chart-axis-scale` 等细粒度 op

降级方法：去 `references/patch-ops-cheatsheet.md` 找对应 op。
