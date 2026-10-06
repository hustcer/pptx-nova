# xdoc Schema 渐进式披露

xdoc 的 `schema` 子命令是机器可读的 JSON Schema 入口。完整 schema 几千行 / 几十万 token
——你不需要一次拉全部，按需取就行。

## 拉法

```bash
xdoc schema                          # 完整 schema（贵）
xdoc schema --mode index                  # 只 op 名 + summary + required/optional 字段 + constraints
xdoc schema --mode ops --ops add-text-box         # 单个 op 完整 jsonSchema
xdoc schema --mode ops --ops add-slide,add-chart   # 多个 op
xdoc schema --mode ops --ops set-shape --fields name,shape,slide --defs summary --minimal # 字段 + 紧凑定义摘要
xdoc schema --mode ops --ops set-shape --fields name,shape,slide --defs full --minimal # 字段 + 完整定义闭包
xdoc schema --mode examples               # 当前运行时的 patch 示例
xdoc schema --minimal                # 删 verbose 字段（与上面任一组合用）
```

约束：视图由 `--mode` 明说，不靠优先级推断——`--ops`/`--fields` 只属于 `--mode ops`，
用在别的 mode 上直接报错。`--fields` 的 required 字段会自动保留，未知字段直接报错；
`--defs` 只用于字段投影，因此也要求 `--fields`，默认值为 `full`。

能力探测同时读取 `schemaDisclosure.modes` 和 `schemaDisclosure.refinements`；
新版将 `--fields` / `--defs` 放在 refinements，旧版可能放在 modes。
`commands.schema.disclosure` 也可提供这份合同。以当前 snapshot 的
`fieldsAvailable` / `summaryDefsAvailable` 选路，不因 mode 列表里没有字段 flag
而退回完整 schema；未披露时仍用当前 help/schema 确认。

## Action 级 CLI 帮助

只需要确认某个 PPTX action 的调用方式时，先用低成本的 action help，无需拉完整 schema：

```bash
xdoc help                         # 根帮助
xdoc help pptx                    # PPTX action 总览
xdoc pptx apply --help            # apply 的 usage / options / examples
xdoc help pptx visual-audit      # 等价的 help verb 形式
```

每个 `xdoc pptx <action> --help` 都由运行时
`commands.pptx.subcommands.<action>` 合同生成；其中 option 定义投影自同一 PPTX 父命令，
因此适合发现 CLI flag、默认值和示例。它不是 patch operation JSON Schema：需要字段类型、
selector、enum 或完整校验合同，仍按下文使用 `xdoc schema --mode ops --ops ...`。help 是人类文本，
不要附加 `--json` 或把输出当 JSON 解析。

## 典型 Agent 用法

### 1. 初次进 deck → 取 op 索引

```bash
xdoc schema --mode index | save -f schema-index.json
```

得到当前 op 名、summary、required / optional 字段名与 constraints —— 用来
决定 "我要 `add-chart` 还是 `add-text-box`"。index 视图没有 `level` 字段（`--mode ops`
里所有 op 的 `level` 都是 `patch`）；18 种 recipe kind 不是独立 op，而是
`add-slide.recipe.kind`，清单在完整 schema 的 `commands.pptx.recipeOps[]`。

### 2. 选定 op → 先拉所需字段

只确认 selector、name 等少量字段时，优先使用字段投影：

```bash
xdoc schema --mode ops --ops set-shape --fields name,shape,slide --defs summary --minimal \
  | save -f schema-set-shape-name.json
```

`--defs summary` 只保留投影字段直接引用的定义，并在 `$defs.*.x-xdoc-summary` 中披露类型、
属性名、required 组合、引用和顶层枚举/分支数量；它用于低 token 成本的字段与定义发现。
输出中的 `disclosure.completeValidation=false` 表示它不是完整校验合同。开始构造嵌套 selector、
需要传递引用时，应改用 `--defs full`。即使如此，字段投影仍不是完整校验合同；需要检查全部
可选字段或执行完整离线验证时，应省略 `--fields`（也可用 `apply --dry-run` 校验最终 patch）：

```bash
xdoc schema --mode ops --ops set-shape --fields name,shape,slide --defs full --minimal \
  | save -f schema-set-shape-name-full.json
xdoc schema --mode ops --ops add-chart --minimal | save -f schema-add-chart.json
```

`--defs full` 保留投影字段可达的完整 `$defs` 闭包；省略 `--defs` 与显式 `full` 等价。

拿到完整 jsonSchema，里面有：

- 每个字段的 type / enum / pattern
- `$ref` 指向的 `$defs`（如 `length` / `color` / `chartKind`）
- required vs optional 列表

### 2b. 动画 op 必须按需拉 schema

动画字段和安全边界更新频繁，涉及动画时先拉对应 op：

```bash
xdoc schema --mode ops --ops set-slide-animations --minimal | save -f schema-set-slide-animations.json
```

重点看 `mode`、`effect`、`phase`、`target`、`build`、`trigger` 的 enum。不要把旧版本
`set-slide-animations` 只能做入口动画的记忆当成当前事实；也不要把 schema 未披露的高级动画
当作已支持。

### 3. 想抄个例子 → 拉 examples

```bash
xdoc schema --mode examples | save -f examples.json
```

示例覆盖 populate-slide / bind-data / rich notes / charts / tables /
shape effects / hyperlinks 等。对照修改最快。

## Schema 关键 `$defs` 速记

`convert` / `extract` / `check` 的页码参数统一为 `--slides`（短参数 `-s`），
从 1 开始，支持逗号与范围；省略表示全部。不要使用已移除的 `--slide`。
此规则不改名 skill 自有 helper 的参数；helper 仍以自身 `--help` 为准。
所有 FontPatch 的 `letterSpacing` 使用显式 `pt` 字符串或 `null`，包括 chart、
table、notes 的 run；裸数字会被拒绝，notes 的非法 font 不再可当作忽略样式继续执行。

### `length`

```
"^-?[0-9]+(\\.[0-9]+)?(emu|in|cm|mm|pt|px)$"
```

必须带单位后缀的字符串：`"1in"` / `"2.54cm"` / `"96px"` / `"914400emu"` 等；
裸 number 与无单位字符串会被拒收（EMU 用 `"…emu"` 显式表达）。

### `color`

```
"^#?[0-9A-Fa-f]{6}$"
```

6 位十六进制，可选 `#` 前缀；大小写不敏感。

### `themeColorScheme`

```
lt1 / dk1 / lt2 / dk2 / accent1..6 / hlink / folHlink
```

### Theme fonts

`set-theme.fonts` 使用 `major` / `minor` 两个槽位；每个槽位是字体对象，例如
`{ "typeface": "Inter", "eastAsian": "Source Han Sans SC" }`。不要使用已删除的
`themeFontKind` / `majorFont` / `minorFont` 别名。

### `chartKind`

```
column / column-3d / bar / bar-3d / line / line-3d / area / area-3d /
pie / pie-3d / doughnut / radar / surface / surface-3d / stock /
scatter / bubble / bubble-3d / combo / waterfall / funnel / histogram /
pareto / treemap / sunburst / box-whisker / region-map
```

### `chartVariant`

```
standard / clustered / stacked / percent-stacked / markers /
lines / lines-no-markers / smooth / smooth-no-markers / exploded / wireframe
```

（kind/variant 合法组合详见 `charts.md`）

### `chartData`

- 直角坐标系（column/bar/line/area/radar/doughnut/pie）：
  ```json
  { "categories": ["Q1", "Q2"], "series": [{ "name": "Sales", "values": [10, 20] }] }
  ```
- scatter：
  ```json
  { "series": [{ "name": "A", "points": [{ "x": 1, "y": 2 }] }] }
  ```
- bubble：
  ```json
  { "series": [{ "name": "A", "points": [{ "x": 1, "y": 2, "size": 0.5 }] }] }
  ```
- stock：
  ```json
  {
    "categories": ["d1", "d2"],
    "high": [12, 15],
    "low": [8, 9],
    "close": [11, 14],
    "open": [9, 10]
  }
  ```

### `fill`

- solid: `{ "type": "solid", "color": "RRGGBB" }`
- gradient: `{ "type": "gradient", "stops": [{ "position": 0, "color": "..." }, ...], "angle": 45 }`
- radial gradient: `{ "type": "gradient", "path": "circle", "stops": [...] }`
- pattern: `{ "type": "pattern", "pattern": "wdDnDiag", "foregroundColor": "...", "backgroundColor": "..." }`
- preset gradient: `{ "type": "gradient", "preset": "daybreak" }`
- none: `{ "type": "none" }`

### `legendPosition`

```
right / left / top / bottom / top-right
```

### `alignment`

```
left / center / right / justify / justify-low / distribute / thai-distribute
```

### `effect`

`set-shape.effect` 使用 `shadow` / `glow` / `reflection` / `softEdge` 子对象；不要使用
`effect.kind`。只查询 effect 时优先使用
`xdoc schema --mode ops --ops set-shape --fields effect,shape,slide --defs summary --minimal`；构造 effect
对象时切换到 `--defs full`，完整合同再省略 `--fields`。

## Catalog 命令

| Catalog               | 拉法                                                        |
| --------------------- | ----------------------------------------------------------- |
| 182 个 preset shape   | `xdoc pptx catalog shapes --json`                           |
| 103 个 XlChartType    | 在 `schema` 输出的 `commands.pptx.catalogs.xlChartTypeMap`  |
| 24 个 preset gradient | 在 `schema` 输出的 `commands.pptx.catalogs.presetGradients` |
| Layout 契约           | 在 `schema` 输出的 `commands.pptx.catalogs.layouts`         |
| Brand profile         | 在 `schema` 输出的 `commands.pptx.catalogs.brands`          |
| Chart styles 1-48     | 在 `schema` 输出的 `commands.pptx.catalogs.chartStyles`     |

## Select 查询 schema

`xdoc pptx select` 用于只读定位 shape 候选。完整 schema 中相关入口：

- `commands.pptx.subcommands.select`：CLI 用法、IO contract、`--slides` 范围规则。
- `commands.pptx.selectReportSchema`：`pptx-select/v1` 输出结构。
- `commands.pptx.patchSchema.jsonSchema.$defs.shapeQuery`：query 字段定义。

典型查询：

```bash
xdoc pptx select input.pptx --query '{"textRegex":"Revenue"}' --json
xdoc pptx select input.pptx --query '{"nameRegex":"^KPI","slideIndex":0}' --json
xdoc pptx select input.pptx --query query.json --slides 1,3-5 --json
```

`select` 是定位工具，不能替代 `apply --dry-run` 的 `resolvedSelectors[]` 校验。

## Schema 检索的 nushell 高效模式

```nu
# 找 "做表" 相关的 op
xdoc schema --mode index --minimal | from json | get operations | where op =~ 'table' | select op summary required

# 看 add-chart 必填 / 可选字段
xdoc schema --mode ops --ops add-chart --minimal | from json | get operations.0 | { required: $in.required, optional: $in.optional }

# 把所有 recipe kind 列出来（recipe 不是独立 op，index 视图没有 level 字段）
xdoc schema | from json | get commands.pptx.recipeOps | select recipeKind description
```

## 何时不查 schema

简单常见任务（加封面、改标题文字、改颜色）按 cheatsheet / recipes 写就行，不必每次
都拉 schema。schema 主要在：

- 拿不准字段名 / 类型
- 想看 `enum` 全集（如 `chartKind` / `placeholder.type`）
- 写完 patch 想离线 validate

这种时候才花一次 schema 拉取的 token。

## `--explain`：dry-run 报告里直接拿"该 op 的 schema 摘要"

当你只想了解"**当前 patch 里这个 op** 的字段约束 / 该 op 做什么"，而不需要
schema 全集时，可以在 `apply --dry-run` 上加 `--explain`：

```bash
xdoc pptx apply -p patch.json -i in.pptx --dry-run --explain --json | save dry.json
```

报告顶层会新增 `explanations[]`，与 `opResults[]` / `traces[]` 一一对应，每项形如
（`expandedOps` 只在 `if` / `foreach` / `try` / `use-macro` / recipe 等会展开的元 op 上出现）：

```json
{
  "opIndex": 1,
  "op": "add-text-box",
  "status": "success",
  "summary": "Create a text box shape on a slide.",
  "reason": "Create a text box shape on a slide. Its arguments are validated against the published patch schema metadata before the bridge applies the concrete operation.",
  "schema": {
    "level": "patch",
    "requiredFields": ["slide", "x", "y", "w", "h"],
    "optionalFields": ["marginBottom", "marginLeft", "marginRight", "marginTop", "name", "text"],
    "fieldNotes": [
      {
        "name": "slide",
        "required": true,
        "type": "integer",
        "schemaRef": "",
        "description": "0-based slide index.",
        "strict": false
      },
      {
        "name": "x",
        "required": true,
        "type": "string",
        "schemaRef": "#/$defs/length",
        "description": "Length value: a unit suffix is required, ...",
        "strict": false
      },
      {
        "name": "text",
        "required": false,
        "type": "string",
        "schemaRef": "",
        "description": "",
        "strict": false
      }
    ]
  }
}
```

适用场景：

- **Agent 不读源码也能用**：拿到 dry-run 错误时，比 grep schema 更直接 —
  `explanations[opIndex].schema.{required,optional,fieldNotes}` 直接告诉你这条
  op 还缺什么字段、字段类型是什么 `$ref`
- **元 op 展开审计**：对 `if` / `foreach` / `try` / `use-macro` / recipe 等会展开的
  元 op，`explanations[i].expandedOps[]` 列出展开后实际执行的底层 op 名，比
  自己读 `opResults[].controlExpansion` 更直观
- **token 友好**：与 `xdoc schema` 一次性几万 token 不同，`--explain` 只在
  dry-run 时按需附带、且只覆盖当前 patch 里**真正用到**的 op
- **rename 可自证**：对 `set-shape` rename，检查对应 `semanticChanges[]` 的
  `before` / `after`；`explanations[].reason` 会明确说明名称从旧值变为新值。

### 约束

- **只对 `pptx apply --dry-run` 生效**：在 `inspect` / 真正 apply 上加 `--explain`
  会被 CLI 拒绝（`--explain is only valid with apply --dry-run`）
- 报告 schema 版本仍是 `pptx-dry-run/v1`，新字段 `explanations` 是向后兼容追加
- 出错时同样会附 explanations（与 op_results 一一对应），方便你看错的 op 本来
  期望什么字段
