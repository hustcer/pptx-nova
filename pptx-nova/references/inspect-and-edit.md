# 修改已有 PPTX 的完整套路

修改是 xdoc 相对其它工具的核心差异化场景。这里讲清楚 **怎样不踩坑地改一份
已有 deck**。

## 0. 心智模型

修改 deck 的成本主要花在 **定位** 上，不是写 op。
按 `inspect → select → dry-run → apply → verify` 顺序走，定位错误会在 dry-run
阶段就暴露，不会真的落坏数据。

```
                       ┌─ no risk ──→ 真 apply
inspect → 写 patch → dry-run ──┤
                       └─ has risk ─→ 核对 remediation.kind 与目标，再 dry-run
```

## 1. Inspect 拿基础结构

```bash
# shell 驱动的多步流程默认加 --daemon（当前 runtime 会按需 auto-spawn）；
# 单次一次性 inspect 不加也行。
xdoc pptx inspect input.pptx --daemon --json | save inspect.json
```

输出 `pptx-inspect/v1`，**实际结构**（注意字段名）：

```json
{
  "schemaVersion": "pptx-inspect/v1",
  "status": "success",
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
          "id": 2,
          "patchSelector": { "id": 2 },
          "name": "Title 1",
          "shapeType": "textBox",
          "resolvedFrom": "element",
          "localOverrides": ["position", "size", "text", "fill"],
          "fillType": "solid",
          "fillColor": "FFFFFF",
          "lineColor": "D0D5DD",
          "lineWidthEmu": 12700,
          "hasText": true,
          "accessibility": {
            "title": null,
            "description": null,
            "decorative": null
          },
          "contentKind": "text",
          "textPreview": "Q2 2026 Review",
          "fontFacts": [],
          "textFrame": {
            "marginLeftEmu": null,
            "marginRightEmu": null,
            "marginTopEmu": null,
            "marginBottomEmu": null,
            "effectiveMarginLeftEmu": "91440",
            "effectiveMarginRightEmu": "91440",
            "effectiveMarginTopEmu": "45720",
            "effectiveMarginBottomEmu": "45720",
            "verticalAnchor": "middle",
            "wordWrap": true
          },
          "bbox": { "xEmu": 1016000, "yEmu": 1920240, "wEmu": 10160000, "hEmu": 1097280 }
        }
      ],
      "geometryOverlaps": [],
      "textOverflowEstimates": []
    }
  ]
}
```

### Shape 3D 的只读识别与保留

先从当前 runtime 的 capability truth 发现 `shape-3d/local-declarations`，分别读取
inspect、preserve、render 和 verify 轴；只有 schema 披露该字段时，才消费
`shapes[].threeDFacts[]`。没有字段表示未披露，空数组只表示未发现本地声明，不能据此
断言 layout/master/theme 中没有继承的 3D 效果。

每条事实按 `scope` 区分 `shape-properties`、`group-properties` 和 `text-body`。
`ownerShapeId` 才是声明的实际对象；顶层 group 的事实可能属于其子对象。
`groupPath` 相对于被 inspect 的对象，按外层到内层排列。ID 缺失或有歧义时先用
select 核实目标，不拼出猜测的 selector。读取 `inspectionStatus` 和 `diagnostics`，
未知或畸形字段不能用默认值补齐；`flatTx` 的存在也不证明可见的立体效果。

`scene.camera.zoomPercent1000` 是千分之一百分比，`100%` 和整数 token `100000`
都会精确读为 `100000`，不是倍率 `100000`。超出字段范围或精度、无法精确表达的合法
百分比保留为 `null`，并给出 `unrepresentable-attribute` 与 `rawValue`；语法畸形使用
`invalid-attribute`。不要四舍五入、钳制或把诊断中的原始值写回源 XML。

这些事实用于定位与复核，不是可回写的 patch。相邻文字、样式或元数据编辑后重新
inspect，按 owner/scope 核对 `sourceSha256`。摘要包含不透明 XML 和有效命名空间上下文，
摘要变化需要调查；摘要相同只证明该 XML 身份未变，不能证明整页布局或视觉不变。
还须核对授权范围外的对象几何，并在要求视觉保留时比较同一候选的独立 PowerPoint
渲染。内置 PDF/Viewer 对 Shape 3D 的支持以 render 轴为准；不要把其二维预览当成
camera、bevel、extrusion 或 material 已正确渲染的证据。即使当前预览能显示部分倒角、
光照或阴影，也不能提升 schema 尚未承诺的 render/verify 轴，更不能据此创建 3D XML。
渲染侧诊断与 `threeDFacts` 不是同一种证据：没有诊断不代表完整支持，模型被保留也不等于
源 XML 被保留。仅消费当前命令实际披露的报告，不给 CLI 臆造 SDK 回调或诊断参数。
Chart 3D 和 GLB 使用各自契约。

### 关键字段速记

| 取什么                        | 路径                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Slide 数                      | `.presentation.slideCount`                                                                                             |
| 包 conformance                | `.presentation.conformance.package`（`transitional / strict / mixed / undetermined`）与四个计数字段                    |
| Deck 尺寸 (EMU)               | `.presentation.slideSize.{wEmu, hEmu}`（除以 914400 = 英寸）                                                           |
| Layout 列表                   | `.presentation.layouts`                                                                                                |
| 每页类型                      | `.slides[N].semantic.pageType`（`blank / title / section / content / two-column / comparison / data / media / mixed`） |
| 每页 layout 名                | `.slides[N].layout.name`                                                                                               |
| 每页 shape                    | `.slides[N].shapes[]`                                                                                                  |
| Shape selector（写 patch 用） | `.slides[N].shapes[M].patchSelector`；当前 id 是非负整数，禁止转成字符串                                               |
| Shape name                    | `.slides[N].shapes[M].name`（写 patch 时优先用这个）                                                                   |
| Shape 类型                    | `.slides[N].shapes[M].shapeType`（`textBox / autoShape / picture / table / chart / group / ...`）                      |
| Shape 文字预览                | `.slides[N].shapes[M].textPreview`                                                                                     |
| Shape bbox (EMU)              | `.slides[N].shapes[M].bbox.{xEmu, yEmu, wEmu, hEmu}`                                                                   |
| Shape 填充                    | `.slides[N].shapes[M].fillType / fillColor / fillSchemeColor`                                                          |
| 图片内容 / shape 图片填充     | `.slides[N].shapes[M].image`（picture crop/mask）/ `.fillPicture`（shape picture fill）                                |
| 文本框布局                    | `.slides[N].shapes[M].textFrame`（显式/有效 margin、verticalAnchor、wordWrap）                                         |
| 字体事实                      | `.slides[N].shapes[M].fontFacts[]`（scope 与脚本字体等）                                                               |
| 图表 3D                       | `.slides[N].shapes[M].chart.{supportsView3D, kind, view3D}`                                                            |
| 无障碍元数据                  | `.slides[N].shapes[M].accessibility.{title, description, decorative}`                                                  |
| Shape 线条                    | `.slides[N].shapes[M].lineColor / lineSchemeColor / lineWidthEmu / lineDash / lineNoFill`                              |
| 几何重叠（同 vision-check）   | `.slides[N].geometryOverlaps[]`（`{topShapeId, bottomShapeId, overlapRatio, kind, severity}`）                         |
| 文字溢出估计                  | `.slides[N].textOverflowEstimates[]`（`{shapeId, estLines, fontPt}`）                                                  |

注意：

- shape `bbox` 用 `xEmu / yEmu / wEmu / hEmu`（整数，单位 EMU；1 in = 914400 EMU）；`presentation.slideSize.{wEmu,hEmu}` 则是数字字符串
- shape 只有在本身是 placeholder 时才带 `placeholder: { type, idx? }` 字段；普通 shape 没有该字段。**写 patch** 时可直接用 `{ "placeholder": "<type>", "idx": <idx> }` selector
- 普通 RGB 颜色在 inspect 中输出为不带 `#` 的 6 位大写十六进制；主题色输出在 `fillSchemeColor` /
  `lineSchemeColor`。shape 图片填充还会给出 `fillPicture` 的关系、mode、媒体类型、alpha 等
  事实，但内置 preview/PDF 对 crop/tile 仍是 partial；以 PowerPoint 原生渲染复核。
- picture shape 的 `image.crop` / `image.maskPreset` 对应 `set-image`；普通 shape 的
  `fillPicture` 对应 `set-shape.fill.type: "picture"`，不要混用两类契约。
- `textFrame` 同时区分显式 margin 与 effective margin。写入时省略字段表示保留，`null`
  清掉显式 `bodyPr` 值使继承/默认重新生效；不要把 effective 值误写成“原始显式值”。
- `fontFacts[]` 是按 text/chart scope 报出的字体事实。拉丁、东亚、复杂文字脚本分别对应
  patch font 的 `name`、`eastAsian`、`complexScript`；`letterSpacing` 是独立字符间距字段。
- 动画状态现在也在每页暴露：`timingSummary`、`animations[]`、`animationCapabilities`。
  只有 `animations[].editable == true` 的安全子集可用 `set-slide-animations`
  局部改；复杂 timing 仍看 `animationCapabilities.preserveOnly`。
- preserve-only 状态（SmartArt、复杂动画、复杂过渡等）也会通过 capabilities / per-slide
  summary 报告；不要只看一个布尔字段就决定能不能改。
- `presentation.conformance` 披露包用的是 ECMA-376 Transitional 还是 ISO/IEC 29500
  Strict 拼写（PowerPoint「Strict Open XML 演示文稿」另存会产出 `strict`）。两种输入都
  按同一身份读取，inspect / convert / check 结果与 Transitional 双胞胎一致，不需要任何
  预处理或转换。编辑 `strict` 包后未触达 part 保持原字节，新增 part 与 relationship 按
  Transitional 写出，输出变成 `mixed`（PowerPoint 正常打开）；apply / dry-run 会用
  `conformance:` 前缀的 warning 说明这一点，它是信息披露，不是缺陷，也不要为它重写 patch。
- **`geometryOverlaps` / `textOverflowEstimates` 是每页的几何风险**，复用 `vision-check` 的重叠/溢出核心算出来——Edit 模式一次 inspect 就能看到这两类风险，不必单独再跑 `vision-check`；但对比度、装饰是否真盖住文字仍要 PNG 复核。`kind` 取 `both-text`（两个文本框重叠）或 `decoration-over-text`（色块压住文字）

### 用 nushell 高效消化 inspect

```nu
# 列出每页类型与第一句文字预览
^xdoc pptx inspect input.pptx --json | from json
  | get slides
  | each {|s| {
      idx: $s.index,
      type: $s.semantic.pageType,
      layout: $s.layout.name,
      first_text: ($s.shapes | get --optional 0.textPreview | default "")
    } }
  | table

# 找所有 name 包含 "KPI" 的 shape
^xdoc pptx inspect input.pptx --json | from json
  | get slides
  | each {|s| $s.shapes | each {|sh| { slide: $s.index, id: $sh.id, name: $sh.name, bbox: $sh.bbox } } }
  | flatten
  | where name =~ KPI

# 找所有 chart
^xdoc pptx inspect input.pptx --json | from json
  | get slides
  | each {|s| $s.shapes | where shapeType == "chart" | each {|sh| { slide: $s.index, shape: $sh.name, id: $sh.id } } }
  | flatten

# 找某页的可见线条/规则线，适合视觉表格、分隔线、下划线等 shape-based 版式
^xdoc pptx inspect input.pptx --json | from json
  | get slides.4.shapes
  | where shapeType in ["autoShape" "connector" "freeform"]
  | select id name shapeType fillColor lineColor lineWidthEmu bbox
```

## 1.5 用 `xdoc pptx select` 缩小候选

当目标 shape 能用文字、名称、placeholder 或大致位置描述时，优先用只读
`select`，不要把完整 `inspect.json` 全量喂给模型反复筛选。

```bash
xdoc pptx select input.pptx --query '{"textRegex":"Revenue"}' --json \
  > <run-dir>/select-revenue.json

xdoc pptx select input.pptx --query '{"nameRegex":"^KPI"}' --slides 2-4 --json \
  > <run-dir>/select-kpi.json

xdoc pptx select input.pptx --query query.json --json > <run-dir>/select.json
```

`pptx-select/v1` 输出 `summary.matchCount` 和 `matches[]`，每个 match 含
`slideIndex`、`shapeId`、`name`、`kind`、`shapeType`、`contentKind`、
`placeholder`、`bbox`、`text` 与可直接复制的 `patchSelector`。

query 复用 patch 的 `ShapeQuery`：

`bboxNear` 的输入坐标与半径都必须显式带单位，不能用裸数字或无单位字符串。
半径不得为负；省略时使用现有 `0.25in` 默认值。报告的 `query.bboxNear`
单独回显整数 `xEmu/yEmu/radiusEmu`；省略半径时不补写 `radiusEmu`，
不要把这些报告键直接复制回查询输入。非法值通过 `invalid_parameter.details`
给出公开字段 Pointer、原因和可独立验证的约束。

```json
{
  "textRegex": "Revenue",
  "nameRegex": "^KPI",
  "placeholder": { "type": "title", "idx": 0 },
  "bboxNear": { "x": "1in", "y": "1in", "radius": "0.4in" }
}
```

可选范围：

- CLI `--slides 1,3-5` 是 1-based，适合人类页码。
- query 顶层 `slideIndex` 是 0-based 单页。
- query 顶层 `slides` 可写 1-based selector 字符串。

使用原则：

- `select` 用于**找候选**，不是替代 dry-run。写 patch 后仍必须检查
  `resolvedSelectors[]`。
  每项包含 `field`、规范化后的 `input` 和 `resolved`；用
  `resolved.slide`（0-based）与 `resolved.id` 一起定位。它描述执行该 op 时的对象，
  后续 op 可能移动或删除对象。数字简写回显为 `{id}`，bbox 查询回显为整数
  `xEmu` / `yEmu` / `radiusEmu`，不能把回显直接当作带单位的 patch 输入。
- `matchCount == 1` 时优先复制 `matches[0].patchSelector` 到 patch。
- `matchCount > 1` 时用 `bbox` / `text` / `name` 继续收窄 query，或改用具体
  `{ "id": <shapeId> }`。
- `matchCount == 0` 时回到 inspect 看实际文本、placeholder 和 group/SmartArt 边界，
  不要凭猜测生成 destructive op。

## 2. shape selector 的定位方式

按"先确定再模糊"的顺序选：

一个 selector 只能选择一种定位方式。不要组合 `id + name`、`id + query`、
`name + placeholder`，也不要将 `query` 与外层查询字段混用；即使额外字段的值是 `null`，
混合定位也会被拒绝。需要多个条件共同约束目标时，使用下文的显式或内联查询。

### 2.1 `{ "id": ... }` —— 最稳

将 inspect 给出的数字 `shape.id` 与操作的 `slide` 一起用于定位。一旦拿到，patch 直接引用：

```json
"shape": { "id": 12 }
```

唯一缺点：deck 变化后 id 也可能变（重写后），不适合长期固化。
注意不要把 inspect 中的数字 id 转成字符串；`shapeSelector.id` 要按原始类型写入 patch。
裸整数 `"shape": 12` 也表示 OOXML shape ID，不是形状数组下标。
如果 dry-run 报 selector schema 错误，先用 `xdoc schema --mode ops --ops <op>` 或一个最小 patch
确认当前 xdoc 版本的 selector 形态，再批量生成 patch。

### 2.2 `{ "name": "..." }` —— 设计师友好

shape 在 PowerPoint Selection Pane 里能看到 name；设计师常给关键 shape 命名。
若 deck 同名 shape 多个，会 ambiguous，必须 disambiguate。

```json
"shape": { "name": "KPI Card 1" }
```

### 2.3 `{ "placeholder": "...", "idx": ... }` —— layout 驱动 deck 的首选

```json
"shape": { "placeholder": "title" }
"shape": { "placeholder": "body", "idx": 1 }
```

`type` 取值：`title / ctrTitle / body / subTitle / dt / sldNum / ftr / hdr /
obj / chart / tbl / clipArt / dgm / media / sldImg / pic`。
`idx` 是 OOXML placeholder 的身份属性，不是数组下标；它只能与同层 `placeholder` 一起提供。

### 2.4 `{ "query": { ... } }` —— 模糊查找

```json
"shape": {
  "query": {
    "nameRegex": "^Section.*",
    "textRegex": "Revenue",
    "placeholder": { "type": "title" },
    "bboxNear": { "x": "1in", "y": "1in", "radius": "0.25in" }
  }
}
```

query 几种模式都可组合（AND 关系）：

- `nameRegex` / `textRegex` —— 字面匹配 + `.*` 通配 + `^` / `$` 锚定
- `placeholder` —— 同上
- `bboxNear` —— 点 `(x, y)` 位于 shape 的 bbox 内时直接匹配；否则判断它与 bbox 中心的距离是否不超过 `radius`

要求单个目标的操作仍需唯一匹配；多匹配/无匹配都会失败。

### 2.5 内联查询

也可在 selector 对象上直接提供至少一个 `nameRegex`、`textRegex` 或 `bboxNear`：

```json
"shape": { "nameRegex": "^Section", "textRegex": "Revenue" }
```

这些谓词同样按 AND 匹配，可带 `placeholder` 及其 `idx`，但不能再带 `id`、`name` 或 `query`。
`idx` 单独出现无效。表格数据绑定的 `tableId` 字符串名称简写保持可用；不要将它扩展为
所有 shape selector 的字符串入口。

## 3. Ambiguous selector 的自修复

dry-run 的 `error.candidates` 给出 `shape:12` 等候选引用，`suggestions[]` 给出
结构化诊断。用 `select` / `inspect` 查看候选的 bbox 和 textPreview，再选择建议。
可执行建议使用 `remediation.kind="replace-request"`，`request` 是完整请求，
其中只有对应 authored 节点的 selector 被改为具体 id；recipe、vars、preconditions
和未修改的创建操作都保持原位。

按 [troubleshooting.md](troubleshooting.md#两种-remediation-与重试流程) 使用
首次提交前保存的 capsule。核对请求 JCS 摘要、原输入摘要及冻结的相对资源后，
先 dry-run，再从原始输入重新执行完整请求。不得把 replacement 追加执行，
也不能拿展开后的 opIndex 直接改写顶层 ops。无唯一来源或完整上下文时只读诊断。

## 4. dry-run 报告字段速记

| 字段                              | 看什么                                                                     |
| --------------------------------- | -------------------------------------------------------------------------- |
| `opResults[].status`              | success / error / skipped                                                  |
| `opResults[].changedParts[]`      | 影响了哪些 OOXML part（`ppt/slides/slide1.xml` 等）                        |
| `opResults[].resolvedSelectors[]` | 规范化 selector 与实际 shape；用 slide + id 定位，name 可选且可能重复      |
| `opResults[].createdObjects[]`    | 唯一的创建对象数组；按 kind 读取定位字段，普通和控制流操作一致             |
| `opResults[].expandedOps[]`       | 只有 `{op}` 的展开名称摘要；可执行完整请求见 recipe compile 的 `patch`     |
| `opResults[].analysis`            | 按 kind 判别：fit-text / layout-impact / remap-theme                       |
| `opResults[].durationMs`          | op 耗时                                                                    |
| `semanticChanges[]`               | Agent 可读的语义 diff（slide/shape/text/style/media/chart/table）          |
| `visualRisks[]`                   | 结构性风险（文本溢出 / 表格越界 / 缺图尺寸 / OLE 缺 icon 等）              |
| `warnings[]`                      | 一般警告；`conformance:` 前缀只说明 Strict 输入将得到 mixed 输出，不需处理 |
| `traces[]`                        | 调用链路（trace/debug level 才有）                                         |
| `error`                           | 失败时的结构化错误（kind / code / opIndex / suggestions）                  |

`fit-text` 分支提供 `chosenFontSizePt`、带 `pt` 单位的 `chosenFontSize`、
`applied`、`overflow`、`strategy` 和 `evidence`；估算或 font-metrics fallback
不证明 PowerPoint 渲染一定无溢出。`layout-impact` 提供 `affectedSlides` 和
逐对象 `localOverrides`；`remap-theme` 提供 `scope`、`summary` 计数及逐对象
`objects` 结果。缺字段、错类型或未知结构不能作为已验证的编辑证据。

创建引用记录执行该 op 时的候选状态；后续移动或删除操作可能使索引失效，不能将它当作跨编辑的永久 ID。

| kind        | 定位字段                               | 范围                                                                                 |
| ----------- | -------------------------------------- | ------------------------------------------------------------------------------------ |
| `slide`     | `slide`                                | 从 0 开始的幻灯片索引                                                                |
| `shape`     | `slide`、`id`                          | `id` 为该页内的 OOXML `cNvPr/@id`，取值 0–4294967295；附带 `shapeType` 和可选 `name` |
| `layout`    | `layout`                               | 从 0 开始的版式索引；可选 `name`、`shapeType`，没有 `id`                             |
| `paragraph` | `slide`、`shapeId`、`paragraph`        | 父形状 ID 与其文本框内从 0 开始的段落索引                                            |
| `run`       | `slide`、`shapeId`、`paragraph`、`run` | 父形状和段落定位，加段落内从 0 开始的 run 索引                                       |

`name` 只是可选元数据，不保证唯一。根据 `xdoc schema` 的 apply/dry-run report schema 校验结果，再按 `kind` 分支读取；不要把整个对象当作 ID。`created` 和 `createdIds` 已移除。

## 5. 常见修改模式

### 5.1 改某页标题文字

```json
{
  "op": "set-text-frame",
  "slide": 2,
  "shape": { "placeholder": "title" },
  "text": "新标题"
}
```

> `set-text-frame` 会清掉原 text frame 里所有 run 与 paragraph。如果要保留多 run / 多段
> 结构，改用 `set-paragraph` + `set-run`。
> `textPreview` 只是 inspect 的摘要字段，不是可回写的内容真源；它可能被截断、合并 run，
> 或无法表达 tab stops、paragraph properties、table cell rich text 等结构。翻新已有 deck
> 时不要把 `textPreview` 原样喂给 `set-text-frame`，尤其不要用它重写 tab stop、富文本、多段落或表格文本。
> 这类页面优先用 `set-run` / 样式局部修改；完成后检查候选可见文本中没有 `<a:`、`<p:`、`xmlns`
> 等 OOXML 片段泄漏。

### 5.2 改某段第一个 run 的字体颜色

```json
{
  "op": "set-run",
  "slide": 2,
  "shape": { "placeholder": "title" },
  "paragraph": 0,
  "run": 0,
  "font": { "color": "1A73E8" }
}
```

### 5.3 加一页和现有 layout 一样的

```json
{
  "schemaVersion": "pptx-patch/v1",
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
  "schemaVersion": "pptx-patch/v1",
  "ops": [
    {
      "op": "remove-shape",
      "slide": 0,
      "shape": { "name": "Hero Image" }
    },
    {
      "op": "add-image",
      "slide": 0,
      "x": "1in",
      "y": "1in",
      "w": "8in",
      "h": "4.5in",
      "name": "Hero Image",
      "assetSource": { "path": "images/new-hero.png", "mimeType": "image/png" }
    }
  ]
}
```

### 5.5 整体换主题色（不改任何 slide 内容）

```json
{
  "schemaVersion": "pptx-patch/v1",
  "ops": [{ "op": "set-theme", "colors": { "accent1": "1A73E8", "accent2": "34A853" } }]
}
```

### 5.6 表格内某列加 background

```json
{
  "schemaVersion": "pptx-patch/v1",
  "ops": [
    {
      "op": "set-table",
      "slide": 1,
      "shape": { "name": "Metrics Table" },
      "cells": [
        { "row": 0, "column": 2, "style": { "fill": { "type": "solid", "color": "EAF1FF" } } }
      ]
    }
  ]
}
```

或者整列循环：在 `cells` 数组里展开多个 row。

### 5.7 替换 chart 数据

```json
{
  "op": "set-chart-data",
  "slide": 1,
  "shape": { "name": "Revenue Chart" },
  "data": {
    "categories": ["Q1", "Q2", "Q3", "Q4"],
    "series": [{ "name": "2026", "values": [15, 18, 21, 24] }]
  }
}
```

## 6. Preserve-only 与动画提示

inspect 报告中的这些字段说明该页有需要谨慎处理的内容：

| 字段            | 含义                | 处理                                                          |
| --------------- | ------------------- | ------------------------------------------------------------- |
| `hasTransition` | 有 slide transition | 基础转场可用 `set-slide-transition`，高级/未知转场 preserve   |
| `hasTiming`     | 有动画/timing       | 读 `timingSummary` / `animations[]` / `animationCapabilities` |
| `hasSmartArt`   | 有 SmartArt diagram | 不能编辑 SmartArt 内容，可以删整个 shape；语义摘要见下        |

SmartArt 虽不可编辑，但不再是黑盒：`preserveOnly[]` 中 `category == "smartArt"` 且
relationship 为 `diagramData` 的条目带只读 `diagram` 摘要 —— `layoutId`（如
`urn:microsoft.com/office/officeart/2005/8/layout/orgChart1`）、`nodeCount`（语义节点数，
不是 `pointCount` 原始点数，后者常是前者的 5-6 倍）、`connectionCount`、`textPreview`
（截断的节点文本）、`shapeId`/`shapeName`（与 `shapes[]` join，SmartArt graphicFrame 的
`contentKind` 为 `"diagram"`）。用途：向用户描述 diagram 内容；判断"保留 vs 用原生
shape 重建"（节点少且用户要可编辑时建议重建）；翻译/替换前识别哪些文本在 SmartArt 里 ——
`replace-text` / i18n ops **触达不了** SmartArt 文本，`textPreview` 里出现的词若需要改，
只能整体重建或明确告知用户此文本保持原样。

动画不是一概不能改：`animations[].editable == true` 的基础 entrance/exit 和安全文本 build
可以按稳定 `id` 用 `set-slide-animations` 修改或删除；新增安全子集也使用同一个 op。
如果 `animationCapabilities.preserveOnly` 包含 `media-timing`、
`interactive-trigger`、`unsupported-timing`、`motion-path`、`emphasis`、`chart-build` 或
`smartart-build`，默认 preserve。需要覆盖整棵 timing tree 时必须让用户确认 `mode: "replace"` 或
`mode: "clear"` 的语义损失，并按 `animations.md` 做结构和 PowerPoint clean-open 验证。

## 7. Sidecar 时光机

每次 `apply`（除非 `--no-sidecar`）都会写一份 `<out>.xdoc.json` sidecar。用法：

```bash
# 回放（用 sidecar 从 input.pptx 重建 output.pptx，验证可重现性）
xdoc pptx replay --from-sidecar output.pptx.xdoc.json -o recovered.pptx

# 审计（输出 sidecar 的 op 列表与 createdObjects）
xdoc pptx audit --from-sidecar output.pptx.xdoc.json --json

# 回滚（撤销最近一次 apply）
xdoc pptx rollback --from-sidecar output.pptx.xdoc.json -o input-restored.pptx
```

每次给用户输出 `.pptx` 时，也提醒一下 sidecar 在哪：用户可以保留它做 audit。
