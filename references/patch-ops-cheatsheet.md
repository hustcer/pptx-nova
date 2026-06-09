# Patch Ops Cheatsheet —— 109 个 op 按场景速查

下面把 s8fy schema v1 的 109 个 op 按 **"我想做什么"** 反向归类。每条只列
关键字段；完整 schema 用 `s8fy schema --op <name>` 拉。

> 通用：所有 patch op 都嵌进 `{ "schemaVersion": 1, "ops": [ { "op": "...", ... } ] }`。
>
> 通用：`slide` 字段是 **0-based** 索引；`paragraph` / `run` / `row` / `col` 同样 0-based。
>
> 通用：长度字段（`x` / `y` / `w` / `h` / `width` / `height`）接受 number（EMU）
> 或字符串 `"1in"` / `"2cm"` / `"96px"` / `"72pt"`。**别裸写数字 1 当成 1 英寸**。

---

## 1. 演示文稿与 slide 级

| op                     | 用途                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `add-slide`            | 加一页，`layout` 可按 `{ index }` / `{ name }` / `{ type }` 选 |
| `remove-slide`         | 删除指定 slide                                                 |
| `move-slide`           | 改 slide 顺序（`from` / `to` 都是 0-based）                    |
| `duplicate-slide`      | 复制 slide（保留全部内容，包括 notes）                         |
| `set-slide-size`       | 改 deck 尺寸：`"16:9"` / `"4:3"` / `{ w, h }`                  |
| `set-slide-background` | 改某页背景：`{ fill: ..., followMaster: false }`               |
| `set-core-prop`        | core props（`title` / `author` / `subject` / `keywords` 等）   |

### Slide notes

| op                          | 用途                                   |
| --------------------------- | -------------------------------------- |
| `set-slide-notes`           | plain text 备注（覆盖）                |
| `append-slide-notes`        | 追加 plain text                        |
| `set-slide-notes-rich-text` | rich notes（paragraphs + runs + font） |
| `clear-slide-notes`         | 清空 notes 文本但保留 notes slide      |
| `remove-slide-notes`        | 整页 notes 删除（包括 part）           |

### Layout / Master / Theme

| op                                    | 用途                                                      |
| ------------------------------------- | --------------------------------------------------------- |
| `add-slide-layout`                    | 新建 layout（`type` 可选 `title` / `obj` / `secHead` 等） |
| `copy-slide-layout`                   | 复制 layout 到新 layout part                              |
| `rename-slide-layout`                 | 重命名 layout                                             |
| `set-slide-layout-type`               | 改 layout type                                            |
| `add-slide-layout-placeholder`        | 给 layout 加 placeholder（type + idx）                    |
| `set-theme-color`                     | 改主题色（`scheme: accent1` / `dk1` / ...）               |
| `set-theme-font`                      | 改主题字体（`kind: majorFont` / `minorFont`）             |
| `set-master-bg`                       | 改 master 背景 fill                                       |
| `set-master-placeholder-style`        | 改 master 占位符默认（font/color/size/align）             |
| `set-presentation-default-text-style` | 整个 deck 的默认文字样式                                  |

详见 `styles-and-themes.md`。

---

## 2. Shape 创建

| op                | 用途                                                                              |
| ----------------- | --------------------------------------------------------------------------------- |
| `add-shape`       | 加预设形状（182 个 catalog，`shape: "rounded-rectangle"` 或 `prst: "roundRect"`） |
| `add-textbox`     | 纯文本框                                                                          |
| `add-placeholder` | 加 placeholder shape（type=title/body/content/...）                               |
| `add-picture`     | 加图片（`assetSource.path` 或 `bytesBase64`）                                     |
| `add-formula`     | 加数学公式 SVG（`latex` fallback 或 `assetSource.path` 渲染资产）                 |
| `add-movie`       | 加视频，含 poster frame                                                           |
| `add-ole-object`  | 嵌入 OLE 对象（Excel/Word/PDF 等），含 ProgID 与 icon                             |
| `add-group`       | 创建空 group shape，可后续填子 shape                                              |
| `add-connector`   | 加连接线（`kind: straight / elbow / curve`）                                      |
| `add-freeform`    | 自由曲线（`points: [[x,y], ...]`，可 `close: true`）                              |
| `add-table`       | 加表 `rows x cols`，可选 `data: [[...]]` 初始化                                   |
| `add-chart`       | 加图表，详见 `charts.md`                                                          |

### add-shape 示例

```json
{
  "op": "add-shape",
  "slide": 0,
  "shape": "rounded-rectangle",
  "x": "1in",
  "y": "1in",
  "w": "3in",
  "h": "1.2in",
  "name": "KPI Card"
}
```

用 `s8fy pptx catalog shapes --json` 看完整 182 个预设；常用别名：
`rounded-rectangle / right-arrow / star-5 / smiley-face / pentagon / cube /
cloud-callout`。

---

## 3. Shape 几何 / 样式

| op                       | 用途                                                 |
| ------------------------ | ---------------------------------------------------- |
| `set-shape-position`     | 移动（`x`, `y`）                                     |
| `set-shape-size`         | 缩放（`w`, `h`）                                     |
| `set-shape-rotation`     | 旋转（`degrees`）                                    |
| `set-shape-flip`         | 水平/垂直翻转                                        |
| `set-shape-name`         | 改 shape name（修改时定位用）                        |
| `set-shape-fill`         | 改 fill：solid / gradient / pattern / none           |
| `set-shape-line`         | 改边框（width, color, dash, noLine）                 |
| `set-shape-outline`      | 同 line，但带完整 `line` 对象                        |
| `set-shape-effect`       | 阴影 / 发光 / 反射 / 柔化（`effect: { kind, ... }`） |
| `set-shape-click-action` | 点击跳转（链接 / 跳页 / 运行宏）                     |
| `remove-shape`           | 删除                                                 |

### Fill 示例

```json
{
  "op": "set-shape-fill",
  "slide": 0,
  "shape": { "name": "KPI Card" },
  "fill": { "kind": "solid", "color": "1A73E8" }
}
```

支持 `solid` / `gradient` / `pattern` / `none`；24 个 preset gradients；
gradient stop 可用 `schemeClr` 引用主题色。详见 `styles-and-themes.md`。

### Effect 示例

```json
{
  "op": "set-shape-effect",
  "slide": 0,
  "shape": { "id": "shape-abc" },
  "effect": { "kind": "outerShadow", "blur": "6pt", "distance": "4pt", "color": "00000040" }
}
```

可选 `kind`: `outerShadow` / `innerShadow` / `glow` / `reflection` / `softEdge`。

---

## 4. 文本编辑

文本写入有两条路径：**简单文本** 用 `set-text`；**段落 / 段落格式 / run 字体**
用 `set-paragraph` / `set-paragraph-format` / `set-run` / `add-paragraph` / `add-run`。

| op                     | 用途                                          |
| ---------------------- | --------------------------------------------- |
| `set-text`             | 整个 text frame 覆盖 plain text               |
| `add-paragraph`        | 在 text frame 末尾加段（可带 `text`）         |
| `set-paragraph`        | 改某段的文字                                  |
| `set-paragraph-format` | 改对齐 / 缩进 / 行距 / 段前段后 / RTL / level |
| `set-paragraph-bullet` | 改 bullet（none / dot / number / image）      |
| `add-run`              | 给段加 run                                    |
| `set-run`              | 改某 run 文字与字体                           |
| `set-run-hyperlink`    | run 加超链接                                  |
| `clear-run-hyperlink`  | run 清超链接                                  |

### set-paragraph-format 关键字段

```json
{
  "op": "set-paragraph-format",
  "slide": 0,
  "shape": { "name": "Title 1" },
  "paragraph": 0,
  "level": 0,
  "alignment": "center",
  "lineSpacing": 1.2,
  "spaceBefore": "6pt",
  "spaceAfter": "6pt",
  "indent": "0.25in"
}
```

`alignment`: `left / center / right / justify / distributed / thaiDistribute`。
`lineSpacing`: 数字 = 倍数；字符串 `"24pt"` = 固定行高。
任意字段可加 `clearXxx: true` 清掉该属性。

### Run 字体

```json
{
  "op": "set-run",
  "slide": 0,
  "shape": { "id": "title-1" },
  "paragraph": 0,
  "run": 0,
  "text": "Q2 2026",
  "font": {
    "name": "Inter",
    "size": "32pt",
    "bold": true,
    "italic": false,
    "underline": "single",
    "color": "1F1F1F",
    "fill": { "kind": "solid", "color": "1F1F1F" }
  }
}
```

### Text frame 行为

| op                             | 用途                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `set-text-frame-auto-size`     | 文本框自适应（`autoSize: true`, `mode: "shape" / "text" / "off"`）                                   |
| `set-text-frame-vertical-text` | 竖排 / RTL 文本方向                                                                                  |
| `fit-text`                     | 给 text frame 算合适字号（`maxSize` / `minSize`，可选 `strategy: "deterministic" / "font-metrics"`） |
| `autofit-text`                 | 同 PowerPoint 的 normal autofit（`mode: "normal" / "shape"`）                                        |

---

## 5. 表格

| op                        | 用途                                                  |
| ------------------------- | ----------------------------------------------------- |
| `add-table`               | 加表（详见 `tables.md`）                              |
| `set-table-cell`          | 改单元格文字                                          |
| `set-table-cell-style`    | 单元格 fill/font/border/margin/对齐                   |
| `set-table-data`          | 整表数据覆盖，`resize: true` 自动改行列数             |
| `import-table-data`       | 从 CSV / JSON 字符串导入                              |
| `set-table-column-width`  | 改列宽                                                |
| `set-table-row-height`    | 改行高                                                |
| `set-table-style`         | 表格 banding / first-row / styleId                    |
| `set-table-range-borders` | 区域批量加边框（outline / insideH / insideV / cross） |
| `merge-table-cells`       | 合并                                                  |
| `set-cell-formula`        | 静态公式（SUM/AVG/COUNT/MIN/MAX）                     |

完整示例见 `tables.md`。

---

## 6. 图表

| op                         | 用途                                                |
| -------------------------- | --------------------------------------------------- |
| `add-chart`                | 创建（19 个 kind, 详见 `charts.md`）                |
| `replace-chart-data`       | 替换数据                                            |
| `set-chart-style`          | PowerPoint 内置 chartStyle 1-48                     |
| `set-chart-title-style`    | 标题                                                |
| `set-chart-legend-style`   | 图例                                                |
| `set-chart-axis-scale`     | 轴刻度 min/max/unit/crosses                         |
| `set-chart-axis-style`     | 轴线样式                                            |
| `set-chart-axis-ticks`     | 刻度 / 标签位置 / number format                     |
| `set-chart-gridline-style` | 网格线                                              |
| `set-chart-plot-style`     | gapWidth / overlap / varyByCategories / bubbleScale |
| `set-chart-marker-style`   | 系列 marker                                         |
| `set-chart-series-style`   | 系列 fill/line/marker/smooth/invert                 |
| `set-chart-point-style`    | 单点样式                                            |
| `set-chart-data-labels`    | 数据标签                                            |

详见 `charts.md`。

---

## 7. 图片 / 媒体

| op                 | 用途                                                 |
| ------------------ | ---------------------------------------------------- |
| `add-picture`      | 加图片                                               |
| `set-picture-crop` | 裁剪（left/right/top/bottom 比例，或 `clear: true`） |
| `add-movie`        | 加视频                                               |
| `add-ole-object`   | 嵌入 OLE 对象（如 Excel）                            |

资产推荐用 `assetSource.path` + `--asset-root`：

```json
{
  "op": "add-picture",
  "slide": 0,
  "x": "1in",
  "y": "1in",
  "w": "4in",
  "h": "3in",
  "assetSource": { "path": "images/hero.png", "mime": "image/png" }
}
```

---

## 8. 高层 / Recipe / 数据驱动 / 控制流

| op                        | 等级   | 用途                                                     |
| ------------------------- | ------ | -------------------------------------------------------- |
| `add-title-slide`         | recipe | 封面                                                     |
| `add-section-slide`       | recipe | 章节扉页                                                 |
| `add-two-column-slide`    | recipe | 左右对照                                                 |
| `add-image-with-caption`  | recipe | 大图 + 说明                                              |
| `add-kpi-grid`            | recipe | KPI 网格                                                 |
| `add-comparison-table`    | recipe | 对比表                                                   |
| `add-timeline`            | recipe | 时间线 / 里程碑                                          |
| `add-roadmap`             | recipe | 产品路线图 / 阶段计划                                    |
| `add-matrix-2x2`          | recipe | 2x2 矩阵                                                 |
| `add-process-flow`        | recipe | 流程图                                                   |
| `add-funnel`              | recipe | 漏斗 / pipeline                                          |
| `add-swot`                | recipe | SWOT 四象限                                              |
| `add-pyramid`             | recipe | 金字塔 / 层级模型                                        |
| `add-hub-spoke`           | recipe | 中心辐射 / 能力地图                                      |
| `add-cycle`               | recipe | 闭环 / 复盘循环                                          |
| `add-gantt`               | recipe | 甘特 / 项目排期                                          |
| `add-scorecard-table`     | recipe | 评分卡表格                                               |
| `add-comparison-cards`    | recipe | 方案比较卡片                                             |
| `apply-corporate-rebrand` | recipe | 一键品牌改装                                             |
| `fill-layout`             | patch  | 填 layout 契约（title-and-content/two-column/...）       |
| `bind-data`               | patch  | JSON 数据绑定 text / table / chart                       |
| `if`                      | patch  | 控制流：按状态分支（slide-count / selector-match / ...） |
| `foreach`                 | patch  | 控制流：对 `items[]` 数组循环展开 `do[]` 子 ops          |
| `try`                     | patch  | 控制流：高风险 op 失败时退到 `catch[]` 分支              |
| `define`                  | patch  | 宏：注册一个命名 op 块（`{{args.*}}` 占位符）            |
| `use`                     | patch  | 宏：展开已 `define` 的命名宏，用 `with` 传参             |
| `raw-ooxml-patch`         | patch  | 逃生口：直接 XPath 改 OOXML（需 `--allow-raw-xml`）      |

详见 `recipes.md` / `data-driven.md` / `control-flow-and-raw-xml.md`。

---

## 9. 常见模式片段

### 9.1 加封面 + 加 KPI 页 + 设置主题色

```json
{
  "schemaVersion": 1,
  "ops": [
    { "op": "set-theme-color", "scheme": "accent1", "value": "1A73E8" },
    { "op": "add-title-slide", "title": "Q2 2026 Review", "subtitle": "Aug 2026" },
    {
      "op": "add-kpi-grid",
      "title": "Key Metrics",
      "items": [{ "label": "Revenue", "value": "$42M", "delta": "+12%" }]
    }
  ]
}
```

### 9.2 改某页标题颜色 + 加粗

```json
{
  "schemaVersion": 1,
  "ops": [
    {
      "op": "set-run",
      "slide": 2,
      "shape": { "placeholder": { "type": "title" } },
      "paragraph": 0,
      "run": 0,
      "font": { "bold": true, "color": "1A73E8" }
    }
  ]
}
```

### 9.3 替换某图表数据

```json
{
  "schemaVersion": 1,
  "ops": [
    {
      "op": "replace-chart-data",
      "slide": 1,
      "shape": { "name": "Revenue Chart" },
      "data": {
        "categories": ["Q1", "Q2", "Q3", "Q4"],
        "series": [
          { "name": "2025", "values": [10, 12, 14, 16] },
          { "name": "2026", "values": [15, 18, 21, 24] }
        ]
      }
    }
  ]
}
```

### 9.4 给页面加水印形状

```json
{
  "schemaVersion": 1,
  "ops": [
    {
      "op": "add-shape",
      "slide": 0,
      "shape": "rectangle",
      "x": "0in",
      "y": "7in",
      "w": "13.333in",
      "h": "0.5in",
      "name": "Watermark"
    },
    {
      "op": "set-shape-fill",
      "slide": 0,
      "shape": { "name": "Watermark" },
      "fill": { "kind": "solid", "color": "1A73E8" }
    },
    {
      "op": "set-text",
      "slide": 0,
      "shape": { "name": "Watermark" },
      "text": "CONFIDENTIAL · 内部资料"
    }
  ]
}
```
