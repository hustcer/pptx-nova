# 表格（Table）创建与编辑

xdoc 的表格支持完整的对象模型：创建、改单元格、改样式、改宽高、合并、边框、
导入 CSV/JSON、静态公式。

## 专项语义验证

在 Studio、data-driven、结构编辑、模板跟随或手工 refurbish 路线中，只要 patch 含
add-table / set-table-data / import-table-data，apply 后保存 final-inspect.json，并运行
pptx-nova-semantic-audit.mjs 输出 semantic-audit.json。该审计只做轻量语义门禁：
行列维度、header/source/unit 或时间范围披露，以及最终原生 table 对象存在性；它不是完整
table XML 等价检查。semantic-audit.json 若为 fail，最终 evidence-summary 必须阻塞；warn
可以披露后继续视觉复核。

table 页优先保留 PowerPoint 原生 table 语义；只有 inspect 证明源 deck 是视觉表格时，才按
普通 shape 编辑。写 table 前先在 `deck_lock.slides[].table` 记录数据来源、表格角色和验证点；
生成 `patch.json` 后由 `pptx-nova-check-lock.mjs` 检查明显行列错误，再交给 dry-run /
vision-check / PNG 复核。

在已有 deck 美化 / 翻新场景中，源表格若是 `shapeType == "table"` 且用户要求内容或样式不变，
默认处理方式是 `preserved`：复制或保留原生 table 对象，只在页级添加新风格 chrome。不要用
DeckKit 的视觉表格页型、文本框网格或重新 `add-table` 来替代，除非已逐项重建并验证这些语义：
单元格 fill、run 样式、字号、颜色、加粗/斜体/下划线/删除线、对齐、边框、合并、表格 styleId、
行高和列宽。无法验证等价时，`content-audit.json.tables.status` 必须保持 `preserved` 或
`blocked`，不能写成已完成的 `rebuilt-editable`。

若同一任务还要求明显翻新页面，保留 table 不代表整页保持原样。正确处理是：保留原生 table 的 XML /
对象语义，同时重做页眉、标题层级、网格、留白、说明和页脚节奏；表格可以在新网格内重新定位或缩放，
但不能丢失 PowerPoint 原生 table。最终必须重新 `inspect` 输出 PPTX，并把对应页记录为
`shapeType == "table"`；只看 PNG 像表格不算通过。
当前 xdoc 的 `remap-theme --scope tables` 已能对 table fill、border 和字体做 MVP 换肤。
翻新时先用 dry-run 报告确认 table 对象是 `changed`、`preserved` 还是 `skipped`；如果跳过后仍明显
带着旧主题色，再用 table ops 做最小补丁，不要直接把原生 table 重画成文本框网格。

最小检查清单：

- `add-table` 必须有正数 `rows` / `cols`。
- `data` 每一行列数一致；不一致是数据错误，不靠视觉裁切掩盖。
- `data` 行列数和声明表格尺寸不一致时，显式写 `resize: true`，否则修正尺寸或数据。
- header、单位、时间范围、来源说明必须随表格进入 content/patch，不能只在备注里解释。
- 单元格字号和边距要满足 deck 的可读性红线；PNG 复核仍要看截断、贴边、合并区域和网格线。
- 翻新后重新 `inspect` 输出 PPTX，确认需要保真的表格仍然是 `shapeType == "table"`，而不是一组
  `textBox` / `autoShape`。

## 先分辨：真表格还是视觉表格

编辑已有 deck 前先看 inspect。只有 `shapeType == "table"` 的对象才使用
`set-table-cell`、`set-table-data`、`set-table-range-borders` 等 table ops。

很多高设计感 deck 会用文本框 + 细矩形/连接线模拟表格。这类对象在 inspect 中通常表现为：

- 多个 `textBox` 单元格文字
- 多个 `autoShape` / `connector` / `freeform` 分割线
- shape name 常含 `TableCell`、`TableRowRule`、`TableColRule`、`Rule`、`Divider`
- 没有任何 `shapeType == "table"` 对象

遇到这种视觉表格时，不要强行使用 table ops；按普通 shape 编辑：

```nu
^xdoc pptx inspect input.pptx --json | from json
  | get slides.4.shapes
  | where shapeType in ["autoShape" "connector" "freeform"]
  | where ($it.name =~ "Table|Rule|Divider") or ($it.fillColor? != null) or ($it.lineColor? != null)
  | select id name shapeType fillColor lineColor lineWidthEmu bbox
```

改视觉表格分割线颜色时，优先用这些 line/rule shape 的 `id` 或唯一 `name` 写
`set-shape-fill` / `set-shape-line`，再 dry-run 检查 `resolvedSelectors[]`。若分割线是
细矩形，通常要改 `fill`；若是 connector/freeform 线，通常要改 `line`。

## 创建

```json
{
  "op": "add-table",
  "slide": 0,
  "rows": 4,
  "cols": 3,
  "x": "1in",
  "y": "1.5in",
  "w": "8in",
  "h": "3in",
  "name": "Metrics Table",
  "data": [
    ["指标", "Q1", "Q2"],
    ["营收", "$10M", "$12M"],
    ["毛利", "$5M", "$6M"],
    ["NPS", "60", "62"]
  ]
}
```

`data` 可选 — 不写就是空表，后续用 `set-table-cell` 一格一格填，或 `set-table-data`
整表覆盖。

## 写数据

### 单元格

```json
{
  "op": "set-table-cell",
  "slide": 0,
  "shape": { "name": "Metrics Table" },
  "row": 1,
  "col": 1,
  "text": "$12M"
}
```

`row` / `col` 都是 0-based。

### 整表覆盖

```json
{
  "op": "set-table-data",
  "slide": 0,
  "shape": { "name": "Metrics Table" },
  "data": [["..."], ["..."]],
  "resize": true
}
```

`resize: true` 会按 `data` 行列数**自动加减行列**（保留 grid widths / row heights /
style flags / 合并属性）；`resize: false`（默认）则数据维度必须与现有表一致，
否则报错。

> 注意：`resize: true` 不会"打断"已有 merge —— 如果新尺寸会切到 merge 中间，
> 会结构化拒绝（不会强行截断）。

### 导入 CSV / JSON

```json
{
  "op": "import-table-data",
  "slide": 0,
  "shape": { "name": "Metrics Table" },
  "format": "csv",
  "csv": "指标,Q1,Q2\n营收,$10M,$12M\n毛利,$5M,$6M\n",
  "resize": true
}
```

JSON 形式：

```json
{
  "op": "import-table-data",
  "slide": 0,
  "shape": {...},
  "format": "json",
  "json": [
    { "指标": "营收", "Q1": "$10M", "Q2": "$12M" },
    { "指标": "毛利", "Q1": "$5M",  "Q2": "$6M" }
  ],
  "resize": true
}
```

JSON 模式会自动从对象的 keys 推首行 header。

## 样式

### 单元格样式

```json
{
  "op": "set-table-cell-style",
  "slide": 0,
  "shape": {...},
  "row": 0,
  "col": 0,
  "fill": { "kind": "solid", "color": "1A73E8" },
  "font": { "name": "Inter", "size": "14pt", "bold": true, "color": "FFFFFF" },
  "alignment": "center",
  "verticalAnchor": "ctr",
  "marginLeft": "6pt",
  "marginRight": "6pt",
  "marginTop": "4pt",
  "marginBottom": "4pt"
}
```

`alignment` 取值与段落对齐相同；`verticalAnchor` = `t / ctr / b`。

### 边框（单格）

```json
{
  "op": "set-table-cell-style",
  "slide": 0,
  "shape": {...},
  "row": 0,
  "col": 0,
  "line": "1pt",
  "borders": {
    "top":    { "line": "1pt", "color": "1A73E8" },
    "bottom": { "line": "1pt", "color": "1A73E8" },
    "left":   { "line": "1pt", "color": "BFBFBF" },
    "right":  { "line": "1pt", "color": "BFBFBF" }
  }
}
```

### 区域边框（批量加边框）

```json
{
  "op": "set-table-range-borders",
  "slide": 0,
  "shape": {...},
  "startRow": 0,
  "startCol": 0,
  "endRow": 3,
  "endCol": 2,
  "borders": {
    "outline":  { "line": "1.5pt", "color": "1F1F1F" },
    "insideH":  { "line": "0.5pt", "color": "BFBFBF" },
    "insideV":  { "line": "0.5pt", "color": "BFBFBF" },
    "cross":    { "line": "1pt",   "color": "1A73E8" }
  }
}
```

- `outline` 外框
- `insideH` 内部横线
- `insideV` 内部竖线
- `cross` 对角线（不常用）

### 表格整体样式

```json
{
  "op": "set-table-style",
  "slide": 0,
  "shape": {...},
  "firstRow": true,
  "lastRow": false,
  "firstCol": false,
  "lastCol": false,
  "horzBanding": true,
  "vertBanding": false,
  "styleId": "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"
}
```

`styleId` 是 PowerPoint 内置表格样式 GUID — 不需要硬记，从 deck 里 inspect 一个
现有 styled table 抄一下就行。常用的"firstRow + banding" 组合就够 95% 场景。

## 列宽 / 行高

```json
{ "op": "set-table-column-width", "slide": 0, "shape": {...}, "col": 0, "width": "2in" }
{ "op": "set-table-row-height",   "slide": 0, "shape": {...}, "row": 0, "height": "0.5in" }
```

## 合并

```json
{
  "op": "merge-table-cells",
  "slide": 0,
  "shape": {...},
  "startRow": 0,
  "startCol": 0,
  "endRow": 0,
  "endCol": 2
}
```

横/竖向合并都用同一个 op，靠 startRow/Col + endRow/Col 表达范围。

## 静态公式

```json
{
  "op": "set-cell-formula",
  "slide": 0,
  "shape": {...},
  "row": 4,
  "col": 1,
  "formula": "SUM(B2:B4)"
}
```

支持的公式：`SUM / AVG / AVERAGE / COUNT / MIN / MAX`。
**注意：** 这是**静态**公式 — xdoc 在生成时计算结果存入单元格，公式本身不写入
PowerPoint（PPTX 表格不像 Excel 那样有计算引擎）。再次改数据时需要手动重写公式或
用 `bind-data` 重新算。

## 表格 + `bind-data` 数据绑定

如果数据来自 JSON：

```json
{
  "schemaVersion": 1,
  "ops": [
    {
      "op": "add-table",
      "slide": 0,
      "rows": 1,
      "cols": 1,
      "x": "1in",
      "y": "1.5in",
      "w": "8in",
      "h": "3in",
      "name": "Metrics"
    },
    {
      "op": "bind-data",
      "data": {
        "rows": [
          ["指标", "Q1", "Q2"],
          ["营收", "$10M", "$12M"]
        ]
      },
      "bindings": [
        {
          "type": "table",
          "slide": 0,
          "shape": { "name": "Metrics" },
          "data": "{{rows}}",
          "resize": true
        }
      ]
    }
  ]
}
```

详见 `data-driven.md`。

## 完整示例：KPI 表

```json
{
  "schemaVersion": 1,
  "ops": [
    { "op": "add-slide", "layout": { "type": "title" } },
    {
      "op": "set-text",
      "slide": 0,
      "shape": { "placeholder": { "type": "title" } },
      "text": "关键指标"
    },
    {
      "op": "add-table",
      "slide": 0,
      "rows": 4,
      "cols": 3,
      "x": "1in",
      "y": "2in",
      "w": "11in",
      "h": "3in",
      "name": "KPI",
      "data": [
        ["指标", "Q1 2026", "Q2 2026"],
        ["营收", "$10M", "$12M"],
        ["毛利率", "55%", "58%"],
        ["NPS", "58", "62"]
      ]
    },
    {
      "op": "set-table-style",
      "slide": 0,
      "shape": { "name": "KPI" },
      "firstRow": true,
      "horzBanding": true
    },
    {
      "op": "set-table-range-borders",
      "slide": 0,
      "shape": { "name": "KPI" },
      "startRow": 0,
      "startCol": 0,
      "endRow": 3,
      "endCol": 2,
      "borders": {
        "outline": { "line": "1pt", "color": "1F1F1F" },
        "insideH": { "line": "0.5pt", "color": "BFBFBF" }
      }
    },
    {
      "op": "set-table-cell-style",
      "slide": 0,
      "shape": { "name": "KPI" },
      "row": 0,
      "col": 0,
      "fill": { "kind": "solid", "color": "1A73E8" },
      "font": { "color": "FFFFFF", "bold": true }
    }
  ]
}
```

## 不要做的事

- ❌ 不要在 `set-table-data` 时假定 `resize: false` 会自动加减行列 — 不写 `resize: true`
  时维度必须严格匹配
- ❌ 不要用 `set-table-cell` 配合 newline (`\n`) 期望换行 — 单元格内换行用
  `set-paragraph` / `add-paragraph` 多段写入
- ❌ 不要给已合并区域再次 merge（会冲突）
- ❌ 不要忘了 `set-cell-formula` 是**静态**的 — 改基础数据后公式不会自动重算
