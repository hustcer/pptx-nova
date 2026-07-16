# xdoc Schema 渐进式披露

xdoc 的 `schema` 子命令是机器可读的 JSON Schema 入口。完整 schema 几千行 / 几十万 token
——你不需要一次拉全部，按需取就行。

## 拉法

```bash
xdoc schema                          # 完整 schema（贵）
xdoc schema --index                  # 只 op 名 + level + required/optional 字段
xdoc schema --op add-text-box         # 单个 op 完整 jsonSchema
xdoc schema --ops add-slide,add-chart   # 多个 op
xdoc schema --examples               # 内置 12 个 patch 示例
xdoc schema --minimal                # 删 verbose 字段（与上面任一组合用）
```

约束：`--examples` 和 `--op/--ops` 互斥（要看示例就单独跑一次）。

## 典型 Agent 用法

### 1. 初次进 deck → 取 op 索引

```bash
xdoc schema --index | save -f schema-index.json
```

得到所有 120 个 op 名、`level`（patch / recipe）、required / optional 字段名 —— 用来
决定 "我要 `add-chart` 还是 `add-text-box`"。

### 2. 选定 op → 拉单个 schema

```bash
xdoc schema --op add-chart --minimal | save -f schema-add-chart.json
```

拿到完整 jsonSchema，里面有：

- 每个字段的 type / enum / pattern
- `$ref` 指向的 `$defs`（如 `length` / `color` / `chartKind`）
- required vs optional 列表

### 2b. 动画 op 必须按需拉 schema

动画字段和安全边界更新频繁，涉及动画时先拉这三个 op：

```bash
xdoc schema --op set-slide-animations --minimal | save -f schema-set-slide-animations.json
xdoc schema --op set-slide-animations --minimal | save -f schema-set-slide-animations.json
xdoc schema --op set-slide-animations --minimal | save -f schema-set-slide-animations.json
```

重点看 `mode`、`effect`、`phase`、`target`、`build`、`trigger` 的 enum。不要把旧版本
`set-slide-animations` 只能做入口动画的记忆当成当前事实；也不要把 schema 未披露的高级动画
当作已支持。

### 3. 想抄个例子 → 拉 examples

```bash
xdoc schema --examples | save -f examples.json
```

里面 12 个示例覆盖 populate-slide / bind-data / rich notes / charts / tables /
shape effects / hyperlinks 等。对照修改最快。

## Schema 关键 `$defs` 速记

### `length`

```
number | "^-?[0-9]+(\\.[0-9]+)?(emu|in|cm|mm|pt|px)?$"
```

裸 number 是 EMU；字符串可以是 `"1in"` / `"2.54cm"` / `"96px"` 等。

### `color`

```
"^#?[0-9A-Fa-f]{6}$"
```

6 位十六进制，可选 `#` 前缀；大小写不敏感。

### `themeColorScheme`

```
lt1 / dk1 / lt2 / dk2 / accent1..6 / hlink / folHlink
```

### `themeFontKind`

```
majorFont / minorFont / major / minor / heading / body
```

### `chartKind`

```
column / column3D / bar / bar3D / line / line3D / area / area3D /
pie / pie3D / surface / surface3D / stock / doughnut /
radar / scatter / bubble / bubble3D / combo
```

### `chartVariant`

```
standard / clustered / stacked / percentStacked / markers /
lines / linesNoMarkers / smooth / smoothNoMarkers / exploded / wireframe
```

（kind/variant 合法组合详见 `charts.md`）

### `chartData`

- 直角坐标系（column/bar/line/area/radar/doughnut/pie）：
  ```json
  { "categories": ["Q1", "Q2"], "series": [{ "name": "Sales", "values": [10, 20] }] }
  ```
- scatter / bubble：
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

- solid: `{ "kind": "solid", "color": "RRGGBB" }`
- gradient: `{ "kind": "gradient", "stops": [{ "pos": 0, "color": "..." }, ...], "angle": 45 }`
- pattern: `{ "kind": "pattern", "preset": "wdDnDiag", "fg": "...", "bg": "..." }`
- preset gradient: `{ "kind": "gradient", "preset": "topSpotlight1" }`
- none: `{ "kind": "none" }`

### `legendPosition`

```
none / r / l / t / b / tr
```

### `alignment`

```
left / center / right / justify / distributed / thaiDistribute
```

### `effect.kind`

```
outerShadow / innerShadow / glow / reflection / softEdge
```

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
xdoc schema --index --minimal | from json | get operations | where op =~ 'table' | select op level required

# 看 add-chart 必填 / 可选字段
xdoc schema --op add-chart --minimal | from json | get operations.0 | { required: $in.required, optional: $in.optional }

# 把所有 recipe op 列出来
xdoc schema --index | from json | get operations | where level == 'recipe' | select op required optional
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

报告顶层会新增 `explanations[]`，与 `opResults[]` / `traces[]` 一一对应，每项形如：

```json
{
  "opIndex": 1,
  "op": "add-text-box",
  "status": "success",
  "summary": "Create a text box shape on a slide.",
  "reason": "Create a text box shape on a slide. Its arguments are validated against the published patch schema metadata before the bridge applies the concrete operation.",
  "expandedOps": ["add-text-box"],
  "schema": {
    "level": "patch",
    "requiredFields": ["slide", "x", "y", "w", "h"],
    "optionalFields": ["text", "name", "anchor", "verticalText", "fontSize", "..."],
    "fieldNotes": [
      { "name": "slide", "required": true, "schemaRef": "#/$defs/nonNegativeInteger" },
      { "name": "x", "required": true, "schemaRef": "#/$defs/length" },
      {
        "name": "text",
        "required": false,
        "description": "Text content; supports \\n for line breaks."
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

### 约束

- **只对 `pptx apply --dry-run` 生效**：在 `inspect` / 真正 apply 上加 `--explain`
  会被 CLI 拒绝（`--explain is only valid with apply --dry-run`）
- 报告 schema 版本仍是 `pptx-dry-run/v1`，新字段 `explanations` 是向后兼容追加
- 出错时同样会附 explanations（与 op_results 一一对应），方便你看错的 op 本来
  期望什么字段
