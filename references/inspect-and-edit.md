# 修改已有 PPTX 的完整套路

修改是 s8fy 相对其它工具的核心差异化场景。这里讲清楚 **怎样不踩坑地改一份
已有 deck**。

## 0. 心智模型

修改 deck 的成本主要花在 **定位** 上，不是写 op。
按 `inspect → select → dry-run → apply → verify` 顺序走，定位错误会在 dry-run
阶段就暴露，不会真的落坏数据。

```
                       ┌─ no risk ──→ 真 apply
inspect → 写 patch → dry-run ──┤
                       └─ has risk ─→ 按 fixPatch / suggestion 改写 patch
```

## 1. Inspect 拿基础结构

```bash
# 多步流程默认加 --daemon（v10 auto-spawn，按需自动起 daemon）；
# 单次一次性 inspect 不加也行。
s8fy pptx inspect input.pptx --daemon --json | save inspect.json
```

输出 `pptx-inspect/v1`，**实际结构**（注意字段名）：

```json
{
  "schemaVersion": "pptx-inspect/v1",
  "status": "ok",
  "input": "input.pptx",
  "presentation": {
    "slideSize": { "wEmu": "12192000", "hEmu": "6858000" },
    "slideCount": 6,
    "slideMasterCount": 1,
    "slideLayoutCount": 11,
    "hasNotesMaster": false,
    "masters": [...],
    "themes": [...],
    "layouts": [...]
  },
  "slides": [
    {
      "index": 0,
      "partName": "ppt/slides/slide1.xml",
      "slideId": 256,
      "name": "",
      "hasNotes": false,
      "semantic": {
        "pageType": "title",
        "confidence": 0.92,
        "keywords": [...],
        "topics": [...],
        "styleHeuristics": { "formality": "...", "colorMood": "...", "typographyStyle": "..." },
        "textDensity": {...},
        "elementStats": {...},
        "layoutContractMatches": [...]
      },
      "layout": {
        "index": 0,
        "partName": "ppt/slideLayouts/slideLayout1.xml",
        "name": "Title Slide",
        "type": "title",
        "masterPartName": "...",
        "usedBySlides": [0],
        "localOverrides": []
      },
      "shapes": [
        {
          "id": "2",
          "name": "Title 1",
          "shapeType": "textBox",
          "resolvedFrom": "element",
          "localOverrides": ["position", "size", "text", "fill"],
          "hasText": true,
          "contentKind": "text",
          "textPreview": "Q2 2026 Review",
          "bbox": { "xEmu": "1016000", "yEmu": "1920240", "wEmu": "10160000", "hEmu": "1097280" }
        }
      ],
      "geometryOverlaps": [],
      "textOverflowEstimates": []
    }
  ]
}
```

### 关键字段速记

| 取什么                      | 路径                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| Slide 数                    | `.presentation.slideCount`                                                                        |
| Deck 尺寸 (EMU)             | `.presentation.slideSize.{wEmu, hEmu}`（除以 914400 = 英寸）                                      |
| Layout 列表                 | `.presentation.layouts`                                                                           |
| 每页类型                    | `.slides[N].semantic.pageType`（`title / section / content / data / quote / ...`）                |
| 每页 layout 名              | `.slides[N].layout.name`                                                                          |
| 每页 shape                  | `.slides[N].shapes[]`                                                                             |
| Shape id（写 patch 用）     | `.slides[N].shapes[M].id`（字符串）                                                               |
| Shape name                  | `.slides[N].shapes[M].name`（写 patch 时优先用这个）                                              |
| Shape 类型                  | `.slides[N].shapes[M].shapeType`（`textBox / autoShape / picture / table / chart / group / ...`） |
| Shape 文字预览              | `.slides[N].shapes[M].textPreview`                                                                |
| Shape bbox (EMU)            | `.slides[N].shapes[M].bbox.{xEmu, yEmu, wEmu, hEmu}`                                              |
| 几何重叠（同 vision-check） | `.slides[N].geometryOverlaps[]`（`{topShapeId, bottomShapeId, overlapRatio, kind, severity}`）    |
| 文字溢出估计                | `.slides[N].textOverflowEstimates[]`（`{shapeId, estLines, fontPt}`）                             |

注意：

- `bbox` 用 `xEmu / yEmu / wEmu / hEmu`（字符串，单位 EMU；1 in = 914400 EMU）
- shape **不直接有** `placeholder` 字段，是否是 placeholder 看 `shapeType` 与 `name`；但**写 patch** 时仍可用 `{ "placeholder": { "type": "title" } }` selector
- preserve-only 状态（动画/SmartArt/过渡）通过顶层 `capabilities` 字段报告，不在每页上
- **`geometryOverlaps` / `textOverflowEstimates` 是每页的几何风险**，复用 `vision-check` 的重叠/溢出核心算出来——Edit 模式一次 inspect 就能看到这两类风险，不必单独再跑 `vision-check`；但对比度、装饰是否真盖住文字仍要 PNG 复核。`kind` 取 `both-text`（两个文本框重叠）或 `decoration-over-text`（色块压住文字）

### 用 nushell 高效消化 inspect

```nu
# 列出每页类型与第一句文字预览
^s8fy pptx inspect input.pptx --json | from json
  | get slides
  | each {|s| {
      idx: $s.index,
      type: $s.semantic.pageType,
      layout: $s.layout.name,
      first_text: ($s.shapes | get --optional 0.textPreview | default "")
    } }
  | table

# 找所有 name 包含 "KPI" 的 shape
^s8fy pptx inspect input.pptx --json | from json
  | get slides
  | each {|s| $s.shapes | each {|sh| { slide: $s.index, id: $sh.id, name: $sh.name, bbox: $sh.bbox } } }
  | flatten
  | where name =~ KPI

# 找所有 chart
^s8fy pptx inspect input.pptx --json | from json
  | get slides
  | each {|s| $s.shapes | where shapeType == "chart" | each {|sh| { slide: $s.index, shape: $sh.name, id: $sh.id } } }
  | flatten
```

## 2. 选 shape 的四种 selector

按"先确定再模糊"的顺序选：

### 2.1 `{ "id": "..." }` —— 最稳

inspect 给出的 `shape.id` 是 deck 内全局唯一的。一旦拿到，patch 直接引用：

```json
"shape": { "id": "shape-abc123" }
```

唯一缺点：deck 变化后 id 也可能变（重写后），不适合长期固化。

### 2.2 `{ "name": "..." }` —— 设计师友好

shape 在 PowerPoint Selection Pane 里能看到 name；设计师常给关键 shape 命名。
若 deck 同名 shape 多个，会 ambiguous，必须 disambiguate。

```json
"shape": { "name": "KPI Card 1" }
```

### 2.3 `{ "placeholder": { ... } }` —— layout 驱动 deck 的首选

```json
"shape": { "placeholder": { "type": "title" } }
"shape": { "placeholder": { "type": "body", "idx": 1 } }
```

`type` 取值：`title / ctrTitle / body / subTitle / dt / sldNum / ftr / hdr /
obj / chart / tbl / clipArt / dgm / media / sldImg / pic`。
`idx` 在同 type 多 placeholder 时区分（0-based）。

### 2.4 `{ "query": { ... } }` —— 模糊查找

```json
"shape": {
  "query": {
    "nameRegex": "^Section.*",
    "textRegex": "(?i)revenue",
    "placeholder": { "type": "title" },
    "bboxNear": { "x": "1in", "y": "1in", "radius": "0.25in" }
  }
}
```

query 几种模式都可组合（AND 关系）：

- `nameRegex` / `textRegex` —— 字面匹配 + `.*` 通配 + `^` / `$` 锚定
- `placeholder` —— 同上
- `bboxNear` —— 找 bbox 中心在 `(x, y)` 周围 `radius` 内的 shape

仍然唯一匹配才会执行；多匹配/无匹配都会失败。

## 3. Ambiguous selector 的自修复

dry-run 报告里会有：

```json
{
  "opIndex": 2,
  "status": "error",
  "error": {
    "kind": "AmbiguousSelector",
    "code": "AMBIGUOUS_SELECTOR",
    "message": "Shape selector matched 3 candidates",
    "suggestions": [
      {
        "kind": "use-id",
        "fixPatch": {
          "schemaVersion": 1,
          "ops": [
            { ...同 op 但 shape 改为 { "id": "shape-abc123" } }
          ]
        }
      },
      {
        "kind": "use-id",
        "fixPatch": {
          "schemaVersion": 1,
          "ops": [
            { ...同 op 但 shape 改为 { "id": "shape-def456" } }
          ]
        }
      }
    ],
    "candidates": [
      { "id": "shape-abc123", "name": "KPI Card 1", "bbox": {...} },
      { "id": "shape-def456", "name": "KPI Card 1", "bbox": {...} },
      { "id": "shape-789xyz", "name": "KPI Card 1", "bbox": {...} }
    ]
  }
}
```

挑一个 candidate（看 bbox 或上下文 textPreview），用对应的 fixPatch 替换原 op，
再 dry-run 一次。

## 4. dry-run 报告字段速记

| 字段                              | 看什么                                                            |
| --------------------------------- | ----------------------------------------------------------------- |
| `opResults[].status`              | success / error / skipped                                         |
| `opResults[].changedParts[]`      | 影响了哪些 OOXML part（`ppt/slides/slide1.xml` 等）               |
| `opResults[].resolvedSelectors[]` | 实际选到了哪个 shape（id + name）                                 |
| `opResults[].createdIds[]`        | 新创建对象的 id（apply 后下一个 op 可以引用）                     |
| `opResults[].analysis`            | 部分 op 的额外信息（如 `fit-text` 的 `appliedSize`）              |
| `opResults[].durationMs`          | op 耗时                                                           |
| `semanticChanges[]`               | Agent 可读的语义 diff（slide/shape/text/style/media/chart/table） |
| `visualRisks[]`                   | 结构性风险（文本溢出 / 表格越界 / 缺图尺寸 / OLE 缺 icon 等）     |
| `warnings[]`                      | 一般警告                                                          |
| `traces[]`                        | 调用链路（trace/debug level 才有）                                |
| `error`                           | 失败时的结构化错误（kind / code / opIndex / suggestions）         |

## 5. 常见修改模式

### 5.1 改某页标题文字

```json
{
  "op": "set-text",
  "slide": 2,
  "shape": { "placeholder": { "type": "title" } },
  "text": "新标题"
}
```

> `set-text` 会清掉原 text frame 里所有 run 与 paragraph。如果要保留多 run / 多段
> 结构，改用 `set-paragraph` + `set-run`。

### 5.2 改某段第一个 run 的字体颜色

```json
{
  "op": "set-run",
  "slide": 2,
  "shape": { "placeholder": { "type": "title" } },
  "paragraph": 0,
  "run": 0,
  "font": { "color": "1A73E8" }
}
```

### 5.3 加一页和现有 layout 一样的

```json
{
  "schemaVersion": 1,
  "ops": [
    {
      "op": "add-slide",
      "layout": { "name": "Title and Content" }
    }
  ]
}
```

或者直接复制：

```json
{ "op": "duplicate-slide", "slide": 1 }
```

### 5.4 换图但保留位置

```json
{
  "schemaVersion": 1,
  "ops": [
    {
      "op": "remove-shape",
      "slide": 0,
      "shape": { "name": "Hero Image" }
    },
    {
      "op": "add-picture",
      "slide": 0,
      "x": "1in",
      "y": "1in",
      "w": "8in",
      "h": "4.5in",
      "name": "Hero Image",
      "assetSource": { "path": "images/new-hero.png", "mime": "image/png" }
    }
  ]
}
```

### 5.5 整体换主题色（不改任何 slide 内容）

```json
{
  "schemaVersion": 1,
  "ops": [
    { "op": "set-theme-color", "scheme": "accent1", "value": "1A73E8" },
    { "op": "set-theme-color", "scheme": "accent2", "value": "34A853" }
  ]
}
```

### 5.6 表格内某列加 background

```json
{
  "schemaVersion": 1,
  "ops": [
    {
      "op": "set-table-cell-style",
      "slide": 1,
      "shape": { "name": "Metrics Table" },
      "row": 0,
      "col": 2,
      "fill": { "kind": "solid", "color": "EAF1FF" }
    }
  ]
}
```

或者整列循环：在 patch 数组里展开多个 row。

### 5.7 替换 chart 数据

```json
{
  "op": "replace-chart-data",
  "slide": 1,
  "shape": { "name": "Revenue Chart" },
  "data": {
    "categories": ["Q1", "Q2", "Q3", "Q4"],
    "series": [{ "name": "2026", "values": [15, 18, 21, 24] }]
  }
}
```

## 6. Preserve-only 提示

inspect 报告中下面三个布尔字段如果是 true，说明该页有 s8fy **当前不能编辑**的内容：

| 字段            | 含义                | 处理                                     |
| --------------- | ------------------- | ---------------------------------------- |
| `hasTransition` | 有 slide transition | 不要尝试 `set-transition`，preserve 即可 |
| `hasTiming`     | 有动画/timing       | 不要尝试改动画                           |
| `hasSmartArt`   | 有 SmartArt diagram | 不能编辑 SmartArt 内容，可以删整个 shape |

遇到时直接告诉用户："这页有 SmartArt / 动画，s8fy 当前只能保留原样不能编辑，
要改的话需要在 PowerPoint 里手工调整。" 不要假装做了。

## 7. Sidecar 时光机

每次 `apply`（除非 `--no-sidecar`）都会写一份 `<out>.s8fy.json` sidecar。用法：

```bash
# 回放（用 sidecar 从 input.pptx 重建 output.pptx，验证可重现性）
s8fy pptx replay --from-sidecar output.pptx.s8fy.json -o recovered.pptx

# 审计（输出 sidecar 的 op 列表与 createdIds）
s8fy pptx audit --from-sidecar output.pptx.s8fy.json --json

# 回滚（撤销最近一次 apply）
s8fy pptx rollback --from-sidecar output.pptx.s8fy.json -o input-restored.pptx
```

每次给用户输出 `.pptx` 时，也提醒一下 sidecar 在哪：用户可以保留它做 audit。
