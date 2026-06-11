# 错误排查与自修复

s8fy 的错误是**结构化的**，每个错误带：

```json
{
  "kind": "<class>",
  "code": "<MACHINE_CODE>",
  "severity": "error / warning / info",
  "message": "human-readable",
  "opIndex": 2,
  "docsRef": "https://...",
  "autoRetry": true,
  "suggestions": [
    {
      "kind": "...",
      "message": "...",
      "fixPatch": { "...": "可直接重试的 patch" },
      "confidence": 0.82,
      "autoRetry": true
    }
  ]
}
```

遇到错误时**第一步永远是读 `suggestions[]`** —— 很多错误直接附带 `fixPatch`，
不用自己想。

## `autoRetry` 标志位 —— 哪些 `fixPatch` 可以"无脑重试"

每条 `suggestions[i]` 现在都带 `autoRetry: bool`，顶层 `error.autoRetry` 是
"这些 suggestions 里有没有任何一条标了 autoRetry=true"的聚合。Agent 决策可以
直接按它走：

| 场景                                                              | suggestion.autoRetry | Agent 该怎么做                                     |
| ----------------------------------------------------------------- | -------------------- | -------------------------------------------------- |
| ambiguous selector 候选 id / fuzzy enum / 颜色规整 / 拼字符近义层 | `true`               | 直接拿 `fixPatch` 替换原 op 重 dry-run，无需问用户 |
| `layout-contract` 自动补全 / 兜底建议（无 op 索引时）             | `false`              | 把 suggestion 文字给用户看,确认后再改 patch        |
| 兜底"用 enum.values 之一" / "改 layout type"                      | `false`              | 多个 candidate 没有明显赢家,需要人/上层 Agent 决策 |

**首选 `autoRetry=true` 的 suggestion**：confidence 一般 ≥ 0.68（fuzzy 修复
0.72-0.74，ambiguous 修复 0.82）；这一档不要再问用户，直接合 patch 走起。

`autoRetry=false` 仍然附带 `fixPatch`，只是建议人类先看一眼 — 比如把某 op
直接删掉的兜底方案。

> ⚠️ `autoRetry=true` 是"机器有信心的修复"，但**不能跳过 dry-run** — 重试时
> 仍然先 `--dry-run`，因为修一处可能引出另一处歧义/错误。

## errorCatalog.scenarioCoverage —— 5 个最常见场景的快速 fixPatch

`s8fy schema` 的 `errorCatalog.scenarioCoverage` 给出当前覆盖最完整的 5 个修复场景。
拿到错误时先按 `id` 匹配,直接抄 `typicalFixPatch`:

| id                          | 触发                                                                  | 修复策略                                                       |
| --------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| `missing-shape`             | selector 一个都没匹配到                                               | 移除该 op 当 fallback,先 `inspect` 拿到真实 shape id 再重试    |
| `ambiguous-selector`        | selector 匹配多个 shape,报告里有候选 id                               | 改写 selector 为 `{ "shape": { "id": <候选 id> } }`            |
| `invalid-chart-kind`        | `add-chart.kind` / `variant` 拼错                                     | 用 `enumRegistry.chartKind` / `chartVariant` 的 fuzzy 候选改写 |
| `font-color-shape-spelling` | 字体名 / 颜色 / 主题色拼错,或 RGB 不是 6 位大写 hex                   | 用 `enumRegistry` 的 fuzzy 候选;或 `1A73E8`(不带 `#`,全大写)   |
| `layout-contract`           | `fill-layout.content` 缺必填字段,或在 strict 模式下出现了非法额外字段 | 补上 placeholder 或删除非法字段;严格模式见 `recipes.md`        |

完整 schema(含 docsRef 与 typicalFixPatch JSON 例子):

```bash
s8fy schema | jq '.errorCatalog.scenarioCoverage'
```

> Agent 流程建议:dry-run 报错 → grep `code` → 按 `scenarioCoverage[].code` 匹配 →
> 直接抄 `typicalFixPatch` → 重试。比读 `suggestions[]` 里的自由文本更快。

## 错误分类速查（24 类 errorCatalog）

| code                       | 含义                                            | 处理                                                                     |
| -------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| `INVALID_SCHEMA`           | patch JSON 不符合 schema                        | 按 `path` / `expected` 改字段                                            |
| `INVALID_OPERATION`        | op 字段错或必填缺失                             | 检查 `s8fy schema --op <name>`                                           |
| `UNSUPPORTED_FEATURE`      | 用了 s8fy 不支持的 op / 枚举值                  | 告诉用户限制，找替代                                                     |
| `AMBIGUOUS_SELECTOR`       | shape selector 匹配多个                         | 用 `suggestions[].fixPatch` 选具体 id                                    |
| `MISSING_SELECTOR_TARGET`  | selector 没匹配到                               | 重新 inspect 确认 shape 真存在                                           |
| `INVALID_LAYOUT_SELECTOR`  | `add-slide.layout` 选不到                       | 报告会给候选 layouts                                                     |
| `MISSING_ASSET`            | `assetSource.path` 找不到文件                   | 检查路径 / `--asset-root`                                                |
| `ASSET_OUTSIDE_ROOT`       | 资产路径逃出 `--asset-root`                     | 改用相对路径                                                             |
| `ASSET_TOO_LARGE`          | 资产超过 `S8FY_PPTX_MAX_ASSET_BYTES`            | 压缩或调高上限                                                           |
| `PATCH_TOO_LARGE`          | patch JSON 超过 `S8FY_PPTX_MAX_PATCH_BYTES`     | 拆 patch                                                                 |
| `ENCRYPTED_DOCUMENT`       | input.pptx 加密                                 | 先用 PowerPoint 去掉密码                                                 |
| `SIGNED_DOCUMENT`          | input.pptx 已签名，修改会破坏签名               | 用 `remove_signatures` API                                               |
| `MACRO_REJECTED`           | macro_policy=reject 时遇到 macro                | 改 policy 或先 strip                                                     |
| `CHART_DATA_MISMATCH`      | chart data 形状错                               | 看 `expected` / `actual`                                                 |
| `TABLE_DIMENSION_MISMATCH` | set-table-data 无 resize 时维度错               | 加 `resize: true` 或对齐                                                 |
| `MERGE_CONFLICT`           | merge 与既有合并冲突                            | 先 unmerge 再合并                                                        |
| `INVALID_LENGTH`           | length 字段格式错                               | 用 `"1in"` / 数字 EMU                                                    |
| `INVALID_COLOR`            | color 格式错                                    | 用 6 位 hex                                                              |
| `OutputExists`             | `-o` 指向的文件已存在                           | 加 `--overwrite` 或换路径                                                |
| `InvalidSidecar`           | sidecar JSON 不是 `pptx-apply-sidecar/v1`       | 重新生成 sidecar / 换路径                                                |
| `DaemonUnavailable`        | `--daemon` / `--daemon-strict` 时 daemon 不可达 | 关 `--daemon-strict` 或检查 `S8FY_DAEMON_AUTO_SPAWN` / `S8FY_DAEMON_LOG` |
| `InvalidRequest`           | daemon RPC params 缺字段                        | 修 daemon 客户端调用,重发请求                                            |
| `ProtocolError`            | daemon RPC frame 解析失败                       | 重新连接 daemon 重发完整 JSON                                            |
| `UnknownMethod`            | daemon RPC method 名不支持                      | 用 `commands.daemon` 列出的方法名                                        |

## Fuzzy 修复支持别名（alias-aware）

写错枚举名时,suggestions 不只看 Levenshtein 距离,还会优先匹配**别名表**。
下面这些常见拼写都会自动得到正确候选(同时 `autoRetry=true` 直接重试):

| 枚举类型      | 你写的（别名 / 拼错）                                                                                                       | suggestion 给出的正解                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `themeColor`  | `accent-1` / `text1` / `background1` / `hyperlink` / `followedHyperlink`                                                    | `accent1` / `tx1` / `bg1` / `hlink` / `folHlink`                                                                 |
| `fontFamily`  | `aptos-body` / `aptos-display` / `calibri-body` / `calibri-light` / `times` / `times-new-roman` / `courier` / `noto-cjk-sc` | `Aptos` / `Aptos Display` / `Calibri` / `Calibri Light` / `Times New Roman` / `Courier New` / `Noto Sans CJK SC` |
| `layoutName`  | `title` / `section` / `two-column` / `picture-caption`                                                                      | `Title Slide` / `Section Header` / `Two Content` / `Picture with Caption`                                        |
| `shapePreset` | 形状的所有 alias(参考 `pptx catalog shapes`)                                                                                | 标准 preset 名(如 `rectangel` → `rectangle`)                                                                     |

**推论**:写 enum 时如果不确定标准名,先用直觉拼一个看 dry-run — 大概率会收到
带 `autoRetry: true` 的修复建议,而不是 `UNSUPPORTED_FEATURE` 死路。

`s8fy schema | jq '.enumRegistry.fuzzySuggest.examples'` 会给出 4 类常见错拼
的真实候选示例,可以离线对照。

## 常见错误对照与修复

### 1. AMBIGUOUS_SELECTOR（最常见）

```json
{
  "error": {
    "code": "AMBIGUOUS_SELECTOR",
    "message": "shape selector matched 3 candidates",
    "suggestions": [
      { "kind": "use-id", "fixPatch": { ...op with id A... } },
      { "kind": "use-id", "fixPatch": { ...op with id B... } },
      { "kind": "use-id", "fixPatch": { ...op with id C... } }
    ],
    "candidates": [
      { "id": "A", "name": "...", "bbox": {...}, "textPreview": "..." },
      ...
    ]
  }
}
```

修复：

1. 看 `candidates[]` 的 `bbox` / `textPreview` 决定哪个才是目标
2. 复制对应 `fixPatch` 的 op 到原 patch（替换 ambiguous op）
3. 重新 dry-run

### 2. MISSING_SELECTOR_TARGET

```json
{ "code": "MISSING_SELECTOR_TARGET", "message": "no shape matched name='KPI'" }
```

修复：

1. `s8fy pptx inspect input.pptx --json | jq '.slides[].shapes[] | select(.name | test("KPI"))'`
2. 确认 name 拼写、slide 索引、shape 真存在
3. 如果 shape 被层级嵌套（group），把 selector 改成更宽松的 query

### 3. INVALID_LAYOUT_SELECTOR

```json
{
  "code": "INVALID_LAYOUT_SELECTOR",
  "message": "no layout matched type='custom'",
  "candidates": [
    { "index": 0, "name": "Title Slide", "type": "title" },
    { "index": 1, "name": "Title and Content", "type": "obj" },
    { "index": 2, "name": "Section Header", "type": "secHead" }
  ]
}
```

修复：从 candidates 抄一个 `name` / `type` / `index`。

### 4. CHART_DATA_MISMATCH

scatter / bubble 误传 `categories + values`：

```json
{
  "code": "CHART_DATA_MISMATCH",
  "message": "scatter chart requires series.points, got series.values"
}
```

修复：scatter / bubble 改用 `{ series: [{ name, points: [{x,y}] }] }`。

### 5. ASSET_OUTSIDE_ROOT

```json
{ "code": "ASSET_OUTSIDE_ROOT", "message": "../secret.pdf outside --asset-root" }
```

修复：

1. 把资源移进 `--asset-root` 指定的目录
2. 或扩大 `--asset-root` 范围
3. 不要用绝对路径或 `..`

### 6. INVALID_LENGTH

```json
{ "code": "INVALID_LENGTH", "message": "field x: expected length, got '1 inch'" }
```

修复：

| 写错              | 改成                                  |
| ----------------- | ------------------------------------- |
| `"1 inch"`        | `"1in"`                               |
| `"1.5 in"`        | `"1.5in"`（去空格）                   |
| `1` 想表达 1 英寸 | `"1in"`（裸数字是 EMU，1 EMU ≠ 1 in） |

### 7. INVALID_COLOR

```json
{ "code": "INVALID_COLOR", "message": "field color: expected #RRGGBB, got 'blue'" }
```

修复：CSS 颜色名不支持，必须 hex。`blue` → `"0000FF"`，`red` → `"FF0000"`。

### 8. UNSUPPORTED_FEATURE

```json
{
  "code": "UNSUPPORTED_FEATURE",
  "message": "chart kind 'waterfall' is unsupported",
  "suggestions": [
    {
      "kind": "alternative",
      "message": "Use column chart with manually colored points to simulate waterfall"
    }
  ]
}
```

修复：按 suggestion 找替代，或告诉用户这种特性 s8fy 当前不支持。

### 9. layout.requiredSlot.missing（DeckKit validate-content）

来源是 DeckKit 的 `validate-content.mjs`（layout-contract），不是 s8fy：

```text
[error] slides[3]: required layout slot "data.eyebrow" is missing or empty
  — swiss-grid 内页 eyebrow 为顶部排版必填项；页码型 kicker 填 "P · <两位页码>" ...
```

修复：按错误信息尾部的 hint 补齐对应槽位（hint 来自 catalog `layoutContract.slotHints`）。
常见案例 swiss-grid 的 `data.eyebrow`：它是顶部排版契约的一部分，**必填且不可放宽**；
不需要可见 kicker 时填页码型 `"P · <两位页码>"`（与页码一致，如第 4 页填 `"P · 04"`，
chrome 会抑制重复显示），需要可见 kicker 时填自定义短文案（如 `"ARGUMENT · 07"`）。
没有 hint 的槽位按 DeckKit 的 `assets/examples/<deckkit>/content.json` 对照补齐。

## visualRisks[] 警告处理

`visualRisks[]` 不是 error，是**潜在视觉问题**。每条 risk 形如：

```json
{
  "kind": "text-overflow",
  "severity": "warning",
  "slide": 0,
  "shape": { "id": "..." },
  "message": "text content estimated to exceed shape bounds",
  "estimatedOverflow": "0.4in"
}
```

常见 risk kind：

| kind                         | 含义                    | 处理                                       |
| ---------------------------- | ----------------------- | ------------------------------------------ |
| `text-overflow`              | 文字可能超出 shape 边界 | 加大 shape / 用 `fit-text` / 缩短文本      |
| `chart-dense-labels`         | chart 标签太密          | 改 `set-chart-data-labels.position` 或缩放 |
| `table-overflow`             | 表格内容超出 cell       | 加列宽 / 缩字号                            |
| `missing-picture-dimensions` | 加图片没指定 w/h        | 加 `w` / `h` 字段                          |
| `ole-missing-icon`           | OLE 没显式 icon         | 省略 icon 会用内置 ProgID matrix，可忽略   |

不一定每条 risk 都要处理 —— **轻量警告可以让用户决定**。但 PPT 给老板看的话，
至少把 `text-overflow` 和 `chart-dense-labels` 处理掉。

## 调试技巧

### 看完整 trace

```bash
s8fy pptx apply -p patch.json -o out.pptx --dry-run --json --log-level trace 2>&1
```

`--log-level trace` 让报告里多出 `traces[]`，可以看到每个 op 的 sub-call 链路与耗时。

### 用 `--explain` 把"这个 op 该怎么写"摊在面上

```bash
s8fy pptx apply -p patch.json -i in.pptx --dry-run --explain --json | save dry.json
```

在已有的 dry-run 报告基础上追加 `explanations[]`：每个 op 的 `summary`（一句话）、
`schema.requiredFields` / `optionalFields` / `fieldNotes` 直接告诉你"这个 op
还少什么"，比单独 `s8fy schema --op <name>` 更精准 —— 只覆盖**当前 patch 里
真用到**的 op。详见 `references/schema-discovery.md` 末尾。

### 拆 patch 二分

如果一个大 patch 里某个 op 报错难定位：

1. 复制 patch，只保留前 N/2 ops
2. dry-run，如果不报错则错误在后半
3. 再二分定位

### Schema validate

```bash
# 单独用 jq 检查 patch 是否符合 schema (基础校验)
cat patch.json | jq -e '.schemaVersion == 1 and (.ops | type == "array")'
```

### Sidecar 回滚

如果意外把 deck 改坏了：

```bash
s8fy pptx rollback --from-sidecar out.pptx.s8fy.json -o restored.pptx
```

会用 sidecar 重新执行除最后一次 apply 之外的所有历史 op，给出修改前的 deck。

## 不要做的事

- ❌ 不要忽略 `suggestions[].fixPatch` 自己瞎猜 — 那是机器给的最优修复路径
- ❌ 不要把 `--dry-run` 报告当 "warning 没什么" 跳过 — `visualRisks[]` 是设计师在意的
- ❌ 不要不读 `opIndex` 直接重写整个 patch — opIndex 精确告诉你哪一条出错
- ❌ 不要假装做了 — 如果 apply 反复失败，把完整报告给用户，让他决定下一步
