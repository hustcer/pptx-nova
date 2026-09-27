# 错误排查与自修复

xdoc 的错误是结构化的。先读 `error.code`、诊断和 `suggestions[]`；可执行建议统一放在 `remediation` 中：

```json
{
  "code": "<snake_case_code>",
  "severity": "fatal / error / warning / info",
  "message": "human-readable",
  "opIndex": 2,
  "docsRef": "https://...",
  "suggestions": [
    {
      "reason": "Review the corrected selector",
      "remediationUnavailable": { "reason": "context-unavailable" }
    }
  ]
}
```

上例没有可执行建议。`remediationUnavailable` 与 `remediation` 互斥，原因只可能是
`identity-unavailable`、`context-unavailable`、`ambiguous-source`、`target-unavailable`、
`payload-limit`。保留诊断，按实际原因恢复输入或修正请求，不能把缺少摘要当作跳过校验。

## 两种 remediation 与重试流程

| kind                | 完整载荷                                                       | 执行目标                                           |
| ------------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| `replace-request`   | `request`，保留版本、ops、recipe、vars、preconditions 等上下文 | 从原始输入重新执行完整请求；不得追加到原 ops       |
| `apply-to-document` | `patch:{schemaVersion,ops}`，只含文档修复操作                  | 在诊断所依据的精确文档上执行一次；不重跑原创建操作 |

`replace-request.target` 必含 `kind:"original-input"`、
`requestCanonicalization:"jcs-rfc8785"`、`requestSha256`、`inputSha256`。
明确从空文档开始时 `inputSha256:null`；已有输入时必须是其 SHA-256。
`apply-to-document.target` 必含 `kind:"document"` 和文档的 `inputSha256`。
所有摘要均为 64 位小写十六进制。消费者对自己保存的原请求/文档计算摘要后比较，
不使用报告中的摘要替代自己的预期。

`remediation.reason` 是非空说明，`confidence` 是 0–1 有限数，`autoRetry` 是必填
boolean。`autoRetry:true` 只允许按已有策略尝试，仍须验证完整 shape、目标和上下文，
再 dry-run、重新授权和执行。删除失败操作改变请求意图，固定为 `autoRetry:false`；
复核具体变更后才传 `--reviewed`，不要用该参数跳过用户当前要求的批准。

要跨进程保留请求、输入和相对资源，在**首次提交前**使用快照脚本。先确认当前
`xdoc schema --mode full` 披露 `commands.pptx.remediationSchema`；脚本会自动检查，
旧运行时不提供旧字段 fallback。以下路径均为示例，输出与 capsule 必须使用新路径：

```bash
node scripts/pptx-nova-remediation.mjs run \
  --patch request.json --input original.pptx --asset-root assets \
  --capsule run/remediation-context --output run/first.pptx > run/first-report.json

node scripts/pptx-nova-remediation.mjs apply \
  --capsule run/remediation-context --report run/first-report.json \
  --pointer /error/suggestions/0 --output run/repaired.pptx
```

从空文档开始时省略 `--input`。`run` 支持 `--transport json-rpc`、`--dry-run`、
`--intent intent.json` 和已有授权下的 `--allow-raw-xml`。首次提交和重试都使用同一
capsule 中的相对资源根；之后同名源文件变化不会换掉已冻结的资产。
capsule 含私有原请求、PPTX 和资源，应保留到重试结束。没有首次提交的 capsule
时不自动应用旧报告；重新组织一次有完整上下文的新请求。

`apply` 按 kind 分派，只选一个具体 JSON Pointer，先校验、dry-run，再实际 apply。
文档修复额外传 `--document diagnosed.pptx`。成功建议记录回执，同一建议不会重复执行。
原始 intent、raw XML 约束和资产字节预算不会被放宽；当前授权仍由 xdoc 再次求解。
任一摘要/上下文不匹配不写目标文件。修完后重新诊断新文档，再选择下一条建议，
不要把同一旧文档的多条建议盲目合并。单份报告内可执行建议累计最多 1 MiB，
超限建议保留诊断和 `payload-limit` 标记。

## errorCatalog.scenarioCoverage —— 修复场景与手工模板

`commands.pptx.errorCatalog.scenarioCoverage` 提供场景说明及
`patchTemplate:{schemaVersion,ops}`，同时标记 `autoApplicable:false`。
模板没有本次请求身份，不能作为可执行建议直接复制重试。

| id                          | 触发                                                                     | 修复策略                                                       |
| --------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `missing-shape`             | selector 一个都没匹配到                                                  | 移除该 op 当 fallback,先 `inspect` 拿到真实 shape id 再重试    |
| `ambiguous-selector`        | selector 匹配多个 shape,报告里有候选 id                                  | 改写 selector 为 `{ "shape": { "id": <候选 id> } }`            |
| `invalid-chart-kind`        | `add-chart.kind` / `variant` 拼错                                        | 用 `enumRegistry.chartKind` / `chartVariant` 的 fuzzy 候选改写 |
| `font-color-shape-spelling` | 字体名 / 颜色 / 主题色拼错,或 RGB 不是 6 位大写 hex                      | 用 `enumRegistry` 的 fuzzy 候选;或 `1A73E8`(不带 `#`,全大写)   |
| `layout-contract`           | `populate-slide.content` 缺必填字段,或在 strict 模式下出现了非法额外字段 | 补上 placeholder 或删除非法字段;严格模式见 `recipes.md`        |

完整 schema（含 docsRef 与手工模板）：

```bash
xdoc schema --mode full | jq '.commands.pptx.errorCatalog.scenarioCoverage'
```

模板用于理解诊断。实际自动尝试只消费带完整目标身份的 `remediation`。

## OOXML 数值范围拦截 —— 报错自带允许范围与出处，改值即可

dry-run / apply 现在按 **OOXML 权威范围**拦截数值字段（约束抽取自
Open-XML-SDK schema，ajv 与 dry-run 双侧同判）。报错 message 直接给出
字段路径、边界值和 OOXML 出处，例如：

```
set-paragraph.format.lineSpacing must be at most 132
  (line spacing multiple written as a:spcPct val (1.0 = 100000) — OOXML a:spcPct@val 0..13200000)
```

优先检查 `suggestions[].remediation`：这类错误可能带一条
`autoRetry: true`（confidence 0.8）的 clamp/wrap 修复，把越界值收回边界
（角度按 360 取模而非截断），且引擎已验证修复后的 op 能通过契约校验，
核对原请求身份后用完整 `replace-request.request` 重做 dry-run：

```
"reason": "Clamp /ops/1 out-of-range values to the OOXML bounds: plot.gapWidth: 501 -> 500 (…)"
```

没有 clamp suggestion 的情况（如 `majorUnit <= 0` 这类无确定替代值的
exclusive 边界）才需要按 message 里的范围手改。写 patch 前就用对范围
仍能省一轮 dry-run：

| 字段（wire 单位）                    | 允许范围  | 易错点                     |
| ------------------------------------ | --------- | -------------------------- |
| `plot.gapWidth`                      | 0..500    | 柱间距百分比               |
| `plot.overlap`                       | -100..100 | 柱重叠百分比               |
| `plot.bubbleScale`                   | 0..300    | 气泡缩放百分比             |
| `marker.size` / line 系列 `size`     | 2..72     | **最小值是 2 不是 1**      |
| chart `style`                        | 1..48     | c:style 内置样式号         |
| `format.lineSpacing`（数字＝倍数）   | >0..132   | 1.0＝单倍行距；上限 132    |
| `fill.angle` / shadow `angle`（度）  | 0..<360   | **360 本身非法**，整圈用 0 |
| `axes.*.scale.majorUnit`/`minorUnit` | >0        | 0 或负数非法               |
| `alpha` / gradient stop `position`   | 0..1      | 小数分数，**不是 0..100**  |
| autofit `fontScale`                  | 1..100    | 且要求 `mode: "text"`      |

## 写出侧自检 warnings 与 semanticIssues[] —— 语义审计信号

apply / dry-run 报告的 `warnings[]` 里有一组**写出侧自检**前缀（按 OOXML 规范
对 xdoc 本次生成/改写的 part 做的检查；下表是最常见的五类，完整集合见
`semanticIssues[].code` 枚举）：

| 前缀            | 含义                                                                                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `child-order:`  | 子元素被写到 OOXML 规范顺序之外（含期望顺序全文）                                                                                                                                                                                                          |
| `dangling-rel:` | r:id / r:embed / r:link 引用在所属 `.rels` 里不存在                                                                                                                                                                                                        |
| `dangling-ref:` | 动画/build 的 `spid` 引用了 part 内不存在的形状 id（cNvPr）                                                                                                                                                                                                |
| `duplicate-id:` | cNvPr / sldId 等 id 在 part 内重复（PowerPoint 会提示"修复"）                                                                                                                                                                                              |
| `part-truth:`   | relationship 指向缺失 part / 类型错配 / part 缺 Content-Types 声明                                                                                                                                                                                         |
| `part-graph:`   | part 挂错父级（如 notes 直接挂在 presentation 下）/ 一个 slide 两个 notesSlide / 缺必需 slideMaster / 媒体引用挂在不允许的容器；ruleId `sdk/part-graph/<not-allowed\|required\|only-one\|content-type\|data-reference>/<Parent>/<Child>`，只报告不自动修复 |

例：`child-order: ppt/slides/slide1.xml: <a:pPr> child <a:spcAft> must come
before <a:buChar> (schema order: …)`。

`conformance:` 前缀**不属于**这组自检：它只说明输入包是 ISO Strict（或已是 mixed），
未触达 part 保持原字节、新增内容按 Transitional 写出，输出包会被 inspect 报为
`conformance.package: "mixed"`。这是信息披露，PowerPoint 正常打开 mixed 包，不要为它
改写 patch 或重跑。

**来源判断**：从零由 xdoc 生成的 deck 上出现这些告警 = xdoc writer 内部 bug，
不要为绕过它改写 patch，应把完整 warning 上报维护者。**编辑既有 deck** 时它们
更多是原文件里预存的缺陷（外部工具删了形状却留下动画引用等）——这时走下面的
`semanticIssues[]` 修复循环。

### `semanticIssues[]` —— 结构化语义问题与文档修复

同一批发现还会以结构化形式出现在 apply / dry-run 报告顶层 `semanticIssues[]`：

```jsonc
{
  "code": "dangling-ref", // 枚举: dangling-rel | rel-type-mismatch | dangling-ref | duplicate-id | part-truth | value-out-of-range | invalid-attribute-value | missing-required-attribute | invalid-attribute-comparison | invalid-xml | invalid-relationships | child-order | child-cardinality | child-choice | part-graph
  "ruleId": "<rule id>",
  "part": "ppt/slides/slide1.xml",
  "message": "<p:spTgt> spid=\"2\" references no <cNvPr> with id=\"2\" in the part",
  "remediation": {
    "kind": "apply-to-document",
    "target": { "kind": "document", "inputSha256": "<64 lowercase hex characters>" },
    "patch": {
      "schemaVersion": "pptx-patch/v1",
      "ops": [{ "op": "set-slide-animations", "slide": 0, "remove": ["5"] }],
    },
    "reason": "remove the 1 animation entries targeting missing shape id 2 …",
    "confidence": 0.9,
    "autoRetry": true,
    "requiresRawXml": false,
  },
}
```

处理规则：

- 仅对可重新取得的精确文档执行 `apply-to-document.patch`；使用上述脚本并传
  `--document`。dry-run 的未交付候选不能冒充原文件，缺目标时只读诊断。
- `requiresRawXml:true` 必须已有相应权限；不能为执行建议自动增开权限。
  受限 `repair-child-order` / `repair-relationships` 仍由当前运行时声明其权限要求。
- 没有 remediation 的 issue 可能是修复不确定（多个候选孤儿 part、preserve-only 动画等），
  保持现状并把 message 原文上报，不要自造修复。
- `remove-shape` 已自动清理被删形状（含组内子形状）的动画与 build 引用，删除
  带动画的形状**不需要**先手动清动画；出现 `dangling-ref` 通常来自 deck 预存
  缺陷而非本次操作。

### `[Content_Types].xml` 的 shell 审计

PPTX 本质上是 ZIP。`unzip` 会自行按 pattern 匹配条目，因此单纯给文件名加 shell
引号仍会把方括号当作 pattern；`[Content_Types].xml` 必须写成
`'[[]Content_Types].xml'`，其中 `[[]` 才表示一个字面量左方括号。建议把 ZIP 完整性、
Content Types XML，以及图表关键节点放在同一段可复现审计中：

```bash
set -o pipefail
unzip -t out.pptx
unzip -p out.pptx '[[]Content_Types].xml' | xmllint --noout -
unzip -p out.pptx 'ppt/charts/chart1.xml' |
  rg '<c:(trendline|errBars|dTable|dispUnits|minorGridlines|title)'
```

`chart1.xml` 这里只是示例；先用 `unzip -Z1 out.pptx` 或
`xdoc pptx inspect out.pptx` 找到实际的 chart part，再替换命令中的路径。
`set -o pipefail` 可确保上游 `unzip` 读取或匹配失败时整段审计返回失败，而不是被
下游命令的成功状态掩盖。

## 退出码速查（`xdoc schema` 的 `.exitCodes`）

| code | stage         | 含义                                                                     |
| ---- | ------------- | ------------------------------------------------------------------------ |
| 0    | success       | 成功；gate/planner 类报告的裁决在 JSON 里，不在退出码里                  |
| 1    | failed        | 未分类失败，当 bug 上报，不要按它分支                                    |
| 2    | args          | CLI 参数解析/校验失败                                                    |
| 3    | input         | 输入无效/不可读，或结构化 gate 报告以非 pass 状态完成（stdout 仍有报告） |
| 4    | authorization | 授权拒绝（Free 限额超限、License 无效等），不写产物                      |
| 5    | slide         | slide 选择超出范围                                                       |
| 6    | parse         | PPTX 解析失败                                                            |
| 7    | pdf           | PDF 生成失败                                                             |
| 8    | png           | PNG 生成失败                                                             |
| 9    | output        | 输出目标校验或写入失败（含输出已存在且未加 `--overwrite`）               |
| 10   | dependency    | 后端依赖不可用                                                           |
| 11   | internal      | 内部错误                                                                 |
| 12   | batch         | 批处理至少一项失败（convert/html2md/extract/check），看 `--report`       |

## 错误分类速查（errorCatalog 注册表）

PPTX 业务错误的 `error.code` 使用 **snake_case**，当前目录见本次运行的
`xdoc schema` 中 `commands.pptx.errorCatalog.codes`。按命令的
`ioContract.failure.schemaRef` 读取完整失败报告；精简错误不一定有
`severity`、`suggestions` 或 `docsRef`，不能补造修复建议。协议错误单独按
daemon / JSON-RPC / MCP 契约处理，不能把数字协议码当作业务错误码。
高频类：

| code                                    | 含义                                                                                  | 处理                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `invalid_json`                          | patch / recipe 不是合法 JSON                                                          | 修 JSON 语法后重发                                                       |
| `invalid_argument`                      | 字段缺失、形状/取值错、资产路径读不到                                                 | 按 `path` / `expected` / `actual` 改字段                                 |
| `invalid_arguments`                     | CLI 调用缺参数                                                                        | 按帮助补齐命令行                                                         |
| `unsupported_feature`                   | 用了不支持的 op / schemaVersion                                                       | `xdoc schema --mode ops --ops <name>` 查能力，找替代                     |
| `invalid_operation`                     | patch 合法但当前 deck 应用不了（selector 匹配 0 或 >1 个、layout 找不到、维度冲突等） | 看 message / `candidates[]`，核对完整 `suggestions[].remediation` 的目标 |
| `invalid_package` / `invalid_xml`       | 输入包结构或 OOXML 解析失败                                                           | 换来源文件或先修复                                                       |
| `missing_part` / `missing_relationship` | 输入包缺 part / relationship                                                          | 用 repair-relationships 或换文件                                         |
| `encrypted_package` / `signed_package`  | 输入加密 / 已签名                                                                     | 先去密码；签名文件按策略处理                                             |
| `zip_error`                             | ZIP 读写失败                                                                          | 检查文件完整性与磁盘                                                     |
| `patch_too_large` / `asset_too_large`   | patch / 资产超上限                                                                    | 拆 patch；压缩资产或调 `XDOC_PPTX_MAX_*`                                 |
| `input_error` / `input_changed`         | 输入路径读不到 / 请求期间输入被改                                                     | 核对路径；重跑                                                           |
| `output_error` / `output_exists`        | 输出写失败 / 输出已存在                                                               | 检查磁盘；加 `--overwrite` 或换路径                                      |
| `session_conflict`                      | 输出被另一 daemon 会话占用                                                            | 换路径或等会话结束                                                       |
| `invalid_sidecar`                       | sidecar 不是 `pptx-apply-sidecar/v1`                                                  | 重新生成 sidecar                                                         |
| `daemon_unavailable` / `shutting_down`  | daemon 不可达 / 正在退出                                                              | 关 `--daemon-strict` 或检查 `XDOC_DAEMON_AUTO_SPAWN` / `XDOC_DAEMON_LOG` |
| `internal_error` / `unknown_error`      | 内部错误                                                                              | 附 message 上报                                                          |
| `resource_*` 族                         | 工程安全预算超限（输入/ZIP/XML/图像/图表槽位/超时/临时盘/输出）                       | 看 `details.stage/subject/unit/limit/observed`，按实际超限项处理         |

`resource_chart_slots_exceeded` 的 `stage` 为 `chart`、`unit` 为 `slots`，限制的是
图表展开后的逻辑槽位，不是 PPTX 压缩字节数。极大的稀疏点索引、声明的点数或
系列/样式投影也可能让很小的文件触发此错误。先定位诊断中的 `subject` 并核对源数据；
仅在确认输入错误时修正索引/计数，否则按用户意图拆分或缩小数据范围。
不要压紧合法稀疏索引、把缺失值填成零或反复重试相同文件来绕过限制。
工程上限不能靠购买授权解除，运行时配置只能收紧已编译的上限；按当前 schema 的
`resourcePolicy` 读取实际限制和配置边界，
不要把 `XDOC_PPTX_MAX_*` 当作所有 `resource_*` 的通用开关。

## PNG 预览落点漂移 / 陈旧 PNG

如果复核 PNG 时看到旧内容，先确认本轮 `xdoc convert` 的实际输出目录。旧版 xdoc
曾经把 `-o previews` 的语义绑定到文件系统状态：第一次 `previews` 不存在时写到
`previews/slide-*.png`，第二次目录已存在时可能静默写到
`previews/<deck>-img/slide-*.png`，导致 agent 误读上一轮 PNG。

当前工作流规避方式：

1. 预览输出放在当前 run 目录，例如 `-o <run-dir>/previews`。
2. 无尾随分隔符的 `-o <dir>` 表示 `<dir>` 就是 PNG/multi 输出根；有尾随分隔符的
   `-o <dir>/` 才表示父目录模式。
3. 重渲前只清理当前 run 的 preview 根，或使用 `--overwrite` 替换它。不要清理用户
   自有目录。
4. 复核前确认 `contact-sheet.png` 和 `slide-*.png` 的修改时间属于本轮命令，并在完成
   摘要里写出实际预览目录和 contact sheet 路径。

## Fuzzy 修复支持别名（alias-aware）

写错枚举名时,suggestions 不只看 Levenshtein 距离,还会优先匹配**别名表**。
下面这些常见拼写都会自动得到正确候选(同时 `autoRetry=true` 直接重试):

| 枚举类型      | 你写的（别名 / 拼错）                                                                                                       | suggestion 给出的正解                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `themeColor`  | `accent-1` / `text1` / `background1` / `hyperlink` / `followedHyperlink`                                                    | `accent1` / `dk1` / `lt1` / `hlink` / `folHlink`                                                                                |
| `fontFamily`  | `aptos-body` / `aptos-display` / `calibri-body` / `calibri-light` / `times` / `times-new-roman` / `courier` / `noto-cjk-sc` | `Aptos` / `Aptos Display` / `Calibri` / `Calibri Light` / `Times New Roman` / `Courier New` / `Noto Sans CJK SC`                |
| `layoutName`  | `Title Slide` / `title` / `section` / `two-column` / `picture-caption`                                                      | `title-slide` / `section-header` / `two-content` / `picture-with-caption`（真实 deck 版式名仍按字面/大小写/kebab 归一三级匹配） |
| `shapePreset` | 形状的所有 alias(参考 `pptx catalog shapes`)                                                                                | 标准 preset 名(如 `rectangel` → `rectangle`)                                                                                    |

**推论**:写 enum 时如果不确定标准名,先用直觉拼一个看 dry-run — 大概率会收到
带 `autoRetry: true` 的修复建议,而不是 `unsupported_feature` 死路。

`xdoc schema | jq '.commands.pptx.enumRegistry.fuzzySuggest.examples'` 会给出 4 类常见错拼
的真实候选示例,可以离线对照。

## 常见错误对照与修复

### 1. selector 匹配多个（最常见）

`error.candidates` 给出例如 `shape:12`、`shape:27` 的候选引用；用 `select` / `inspect`
读取对应 bbox 和文本。可用建议的 `remediation.kind` 为 `replace-request`，其中
`request` 保留整份原请求，仅将对应 authored 节点的 selector 改为具体 id。

修复：

1. 对照候选引用的 bbox / textPreview 决定哪个才是目标。
2. 用首次提交的 capsule 核对该建议的请求、输入和资源上下文。
3. 运行本页通用消费者，重新 dry-run，再从原输入执行完整 replacement request。

### 2. selector 没匹配到

```json
{ "code": "invalid_operation", "message": "shape name 'KPI' not found" }
```

修复：

1. `xdoc pptx inspect input.pptx --json | jq '.slides[].shapes[] | select(.name | test("KPI"))'`
2. 确认 name 拼写、slide 索引、shape 真存在
3. 如果 shape 被层级嵌套（group），把 selector 改成更宽松的 query

### 3. layout 选不到

```json
{
  "code": "invalid_operation",
  "message": "slide layout not found by name 'custom'. available layouts: [{index:0, name:'Title Slide', type:'title'}, {index:1, name:'Title and Content', type:'obj'}, {index:2, name:'Section Header', type:'secHead'}]"
}
```

修复：从 `message` 内嵌的 available layouts 列表抄一个 `name` / `type` / `index`
（`candidates` 是字符串数组，此场景为 `null`，不要依赖它）。

### 4. chart data 形状错

scatter / bubble 误传 `categories + values`：

```json
{
  "code": "invalid_argument",
  "message": "add-chart has invalid data"
}
```

修复：scatter / bubble 改用 `{ series: [{ name, points: [{x,y}] }] }`。

### 5. 资产路径逃出 --asset-root

```json
{ "code": "invalid_argument", "message": "assetSource.path escapes --asset-root" }
```

修复：

1. 把资源移进 `--asset-root` 指定的目录
2. 或扩大 `--asset-root` 范围
3. 不要用绝对路径或 `..`

### 6. length 格式错

```json
{ "code": "invalid_argument", "message": "add-text-box requires x" }
```

非法 length（含裸数字）会被当作字段缺失报告，message 不会回显原值。修复：

| 写错                         | 改成                                                      |
| ---------------------------- | --------------------------------------------------------- |
| `"1 inch"`                   | `"1in"`                                                   |
| `"1.5 in"`                   | `"1.5in"`（去空格）                                       |
| `1` / `914400` 想表达 1 英寸 | `"1in"`（裸数字被拒绝，必须带 `in/cm/mm/pt/px/emu` 单位） |

### 7. color 格式错

```json
{ "code": "invalid_argument", "message": "set-shape has invalid fill" }
```

修复：CSS 颜色名不支持，必须 hex。`blue` → `"0000FF"`，`red` → `"FF0000"`。

### 8. 不支持的 op / 枚举值

```json
{
  "code": "unsupported_feature",
  "message": "unknown patch op 'add-sparkline'",
  "suggestions": [
    {
      "reason": "Replace /ops/0/op 'add-sparkline' with 'add-slide'.",
      "path": "/ops/0/op",
      "expected": "supported patch op",
      "actual": "add-sparkline",
      "replacement": "add-slide",
      "remediation": {
        "kind": "replace-request",
        "autoRetry": false,
        "confidence": 0.78,
        "...": "..."
      }
    }
  ]
}
```

`unsupported_feature` 只用于未知 op / schemaVersion；拼错的 chart kind、枚举值走
`invalid_argument`（如 `add-chart has invalid kind 'bogus-kind'`）并附带 fuzzy
`replace-request` 建议。`waterfall`、`funnel`、`treemap` 等 chartEx kind 现已在
`enumRegistry.chartKind` 中。修复：按 suggestion 找替代，或告诉用户这种特性 xdoc 当前不支持。

### 9. layout.requiredSlot.missing（DeckKit validate-content）

来源是 DeckKit 的 `validate-content.mjs`（layout-contract），不是 xdoc;

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
  "code": "text-overflow-estimate",
  "severity": "medium",
  "message": "text is unlikely to fit its box at the current font size",
  "target": { "kind": "shape", "slide": 0, "id": 12, "name": "Title" },
  "detail": "textLength=42 estLines=2 fontPt=44"
}
```

常见 risk code：

| code                           | 含义                    | 处理                                        |
| ------------------------------ | ----------------------- | ------------------------------------------- |
| `text-overflow-estimate`       | 文字可能超出 shape 边界 | 加大 shape / 用 `fit-text` / 缩短文本       |
| `text-unexpected-wrap`         | 预期单行文本出现孤行    | 缩短 subtitle/label / 加宽 / 换布局         |
| `chart-label-density-possible` | chart 标签太密          | 改 `set-chart.dataLabels[].position` 或缩放 |
| `table-data-outside-grid`      | 表格数据超出 grid       | 加行列 / 调整数据                           |
| `table-cell-overflow-possible` | 表格单元格文本过长      | 加列宽 / 缩字号 / 拆行                      |
| `picture-missing-dimension`    | 加图片没指定 w/h        | 加 `w` / `h` 字段                           |
| `ole-icon-missing-or-unsized`  | OLE icon 未显式定尺寸   | 加 `iconW` / `iconH` 或确认默认 icon        |

不一定每条 risk 都要处理 —— **轻量警告可以让用户决定**。但 PPT 给老板看的话，
至少把 `text-overflow-estimate`、`text-unexpected-wrap` 和 chart/table 相关风险处理掉。

## 调试技巧

### 看完整 trace

```bash
xdoc pptx apply -p patch.json -o out.pptx --dry-run --json --log-level trace 2>&1
```

dry-run 报告默认就带 `traces[]`（每个 op 的 `name` / `status` / `durationMs`）；
`--log-level trace` 额外把逐步诊断日志打到 stderr，所以需要 `2>&1` 或分开重定向。

### 用 `--explain` 把"这个 op 该怎么写"摊在面上

```bash
xdoc pptx apply -p patch.json -i in.pptx --dry-run --explain --json | save dry.json
```

在已有的 dry-run 报告基础上追加 `explanations[]`：每个 op 的 `summary`（一句话）、
`schema.requiredFields` / `optionalFields` / `fieldNotes` 直接告诉你"这个 op
还少什么"，比单独 `xdoc schema --mode ops --ops <name>` 更精准 —— 只覆盖**当前 patch 里
真用到**的 op。详见 `references/schema-discovery.md` 末尾。

### 拆 patch 二分

如果一个大 patch 里某个 op 报错难定位：

1. 复制 patch，只保留前 N/2 ops
2. dry-run，如果不报错则错误在后半
3. 再二分定位

### Schema validate

```bash
# 单独用 jq 检查 patch 是否符合 schema (基础校验)
jq -e '.schemaVersion == "pptx-patch/v1" and (.ops | type == "array")' patch.json
```

### Sidecar 回滚

如果意外把 deck 改坏了：

```bash
xdoc pptx rollback --from-sidecar out.pptx.xdoc.json -o restored.pptx
```

rollback 不会重放任何 op：它直接复制 sidecar 记录的修改前输入（`strategy: "copy-recorded-input"`），
sidecar 来自 `new` 时则输出一个最小空 deck（`"minimal-deck"`）；报告为 `pptx-rollback/v1`，
`--from-sidecar` 与 `-o` 必填，不接受位置参数。

## 不要做的事

- ❌ 不要忽略结构化诊断，也不要把 `remediation` 当作授权；先核对目标和当前请求意图。
- ❌ 不要把 `--dry-run` 报告当 "warning 没什么" 跳过 — `visualRisks[]` 是设计师在意的
- ❌ 不要不读 `opIndex` 直接重写整个 patch — opIndex 精确告诉你哪一条出错
- ❌ 不要假装做了 — 如果 apply 反复失败，把完整报告给用户，让他决定下一步
