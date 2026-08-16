# PPTX 动画与转场

读取本文件的场景：用户要求新增、修改或删除 PPTX 动画/转场，或提到点击顺序、自动播放、
`with previous` / `after previous`、逐条 bullet、退出动画、motion path、emphasis、timing tree。

## 能力发现

动画能力变化较快，先用运行时 schema 和 dry-run 证据，不靠记忆：

```bash
xdoc schema --mode ops --ops set-slide-animations --minimal > <run-dir>/schema-set-slide-animations.json
```

当前运行时 schema 暴露的安全子集包括：

- 创建/替换/清理：`set-slide-animations`，字段 `mode: "merge-safe" | "replace" | "clear"`。
- 局部安全编辑：`set-slide-animations`，用 `inspect.animations[].id` 定位。
- 局部安全删除：`set-slide-animations`，用 `inspect.animations[].id` 定位。
- 支持的创建效果：入口 `appear/fade/wipe/fly`；退出安全子集 `disappear/fade-out/wipe-out/fly-out`
  或 `phase: "exit"`。
- 支持的 trigger：`on-click`、`with-previous`、`after-previous`。
- 支持的 timing modifier：`repeat`、`autoReverse`、`restart`、
  `easing.accelerate/decelerate`。
- 支持的文本 build：`target: { shape, paragraph?, level? }` 配合
  `build: "all-at-once" | "by-paragraph" | "by-level"`。

未在 schema 中披露的能力按 `undisclosed` 处理，不直接当成 `unsupported`；但交付前必须以 dry-run、
inspect 回读、PNG/播放复核和 clean-open gate 证明。

## Inspect First

动画编辑必须从 inspect 开始：

```bash
xdoc pptx inspect input.pptx --daemon --json > <run-dir>/inspect.json
```

看每页：

- `timingSummary`: timing 是否存在、media/interactive/unsupported timing、editable 与
  preserve-only 数量。
- `animations[]`: 稳定 `id`、`target`、`effect`、`phase`、`trigger`、`durationMs`、`delayMs`、
  `repeat`、`autoReverse`、`restart`、`easing`、`editable` 和 preserve-only reason。
- `animationCapabilities`: `editable`、`preserveOnly`、`unsupportedCreate`。

只有 `editable: true` 的既有 step 才能用 `set-slide-animations` 局部编辑或删除。
`preserveOnly` 命中的 timing 不要 raw XML 猜改；需要重建时必须让用户确认
`mode: "replace"` 或 `mode: "clear"` 会改变原动画语义。

## 新增动画

新增动画仍是用户显式要求时才做；不要给普通商务 deck 自动加动效。

最小 patch：

```json
{
  "schemaVersion": "pptx-patch/v1",
  "ops": [
    {
      "op": "set-slide-animations",
      "slide": 0,
      "mode": "merge-safe",
      "animations": [
        {
          "shape": { "name": "KPI Card" },
          "effect": "fade",
          "trigger": "on-click",
          "duration": 450,
          "delay": 0
        }
      ]
    }
  ]
}
```

`merge-safe` 是默认思路：如果现有 timing 含 media timing、interactive trigger、unsupported timing、
motion path、emphasis 或复杂 build，dry-run 应拒绝覆盖。不要为通过门禁而改成 `replace`，除非用户明确
接受丢弃/重建既有动画树。

## 基础动画 timing modifier

四个 modifier 只适用于当前 schema 披露的 8 个基础 entrance/exit effect，不会解锁 motion path、
emphasis、sequence/parallel、chart build、media timing 或 shape-trigger：

```json
{
  "op": "set-slide-animations",
  "slide": 0,
  "mode": "merge-safe",
  "animations": [
    {
      "shape": { "name": "KPI Card" },
      "effect": "fade",
      "duration": 400,
      "repeat": 2,
      "autoReverse": true,
      "restart": "when-not-active",
      "easing": {
        "accelerate": 0.25,
        "decelerate": 0.5
      }
    }
  ]
}
```

严格语义：

- `repeat` 是非负整数或字符串 `"indefinite"`。有限整数表示总播放次数；显式 `0` 会被保留，
  不会偷偷归一成 `1`。xdoc 会按 OOXML 要求将次数编码为千分之一单位，Agent 不应直接传 wire 值。
- `autoReverse` 是 boolean，对应每个有限循环先正向、再反向播放；因此 `repeat: 1` 也包含一正一反
  两段。它不会让 Viewer 获得完整 PowerPoint restart 激活状态机。
- `restart` 只接受 `always`、`when-not-active`、`never`。
- `easing.accelerate` / `easing.decelerate` 都是闭区间 `[0, 1]` 的比例；对象至少提供一侧。
- 有限 repeat 会扩展 `after-previous` 的调度总时长；启用 autoReverse 时每个循环按两倍基础 duration
  计时。Viewer 支持有限 repeat、autoReverse 和 easing；
  `repeat: 0`、`repeat: "indefinite"` 当前不播放，`restart` 只作为结构化 metadata 保留。
- 同一个 direct timing group 若混入 preserve-only 节点，或存在无法完成的 indefinite 前驱，整组按
  preserve-only 处理；不要尝试按稳定 ID 局部改写或删除其中某个 leaf。创建/更新形成同 click group 的
  `indefinite -> after-previous` 会被拒绝，应改成新的 on-click group 或移除 indefinite。
- `ext:repeatCount`、`ext:childTnLst` 等带扩展 namespace 的同名 QName 不属于标准 timing 字段；inspect
  会保留并把相关 leaf 降为 preserve-only，Agent 不应通过 raw XML 把它们改写为无前缀属性。
- PDF/PNG 仍是静态结果，不能用来证明 modifier 的播放语义。

按 inspect 返回的稳定 `id` 更新时使用三态契约：字段省略表示保留，`null` 表示清除，合法值表示写入。
`easing` 对象是完整替换：只提供 `accelerate` 会清除旧的 `decelerate`，反之亦然；`easing: null`
清除两侧。创建新 step 时不要传 modifier `null`，因为没有既有值可清除。

```json
{
  "op": "set-slide-animations",
  "slide": 0,
  "animations": [
    {
      "id": "animation-id-from-inspect",
      "repeat": null,
      "autoReverse": false,
      "restart": null,
      "easing": { "accelerate": 0 }
    }
  ]
}
```

apply 后必须重新 inspect，确认 omitted/null/value 语义、stable id 和目标对象都保持预期；不要只看
patch 成功状态。

## 六轴 capability truth

probe snapshot 中若 capability entry 的 `axes` 非 null，不能只看 entry-level `status`。逐轴读取
`status`、`limits`、`officeTarget` 和 `evidenceIds`：

- `pptx-capability-truth/v3` 的六轴 contract 无效时，整份 truth 不可用；不能退回 entry-level status。
- contract 的 `requiredFor` 条目若缺失完整 axes 或任一轴畸形，该 feature/subset 视为
  `undisclosed`，不能因为 operation 已披露就推断为 supported。

- `slide-animation/basic-shape-and-text-builds`：create/edit/inspect 为 `supported`，preserve/render
  为 `partial`，verify 为 `inconclusive`。
- `slide-transition/morph-authoring`：create/edit/inspect/preserve 为 `supported`，render 为
  `unsupported`，verify 为 `inconclusive`，直到引用到受控 Windows PowerPoint evidence。

`verify` 的 `supported` 必须来自该轴引用的目标 Office evidence。结构 round-trip、Viewer 测试、
静态 PDF/PNG 和 Morph fade fallback 都不能替代 PowerPoint clean-open/resave/playback 证据；环境不可用时
保持 `skipped` 或 `inconclusive`。

## 安全合并既有动画

使用 `set-slide-animations` 的 `merge-safe` 模式提交局部更新；复杂 timing 会拒绝覆盖：

```json
{
  "schemaVersion": "pptx-patch/v1",
  "ops": [
    {
      "op": "set-slide-animations",
      "slide": 0,
      "mode": "merge-safe",
      "animations": [
        {
          "shape": { "name": "KPI Card" },
          "effect": "fade",
          "trigger": "after-previous",
          "duration": 650,
          "delay": 120
        }
      ]
    }
  ]
}
```

dry-run 重点看：

- `opResults[]` 成功且没有 preserve-only 拒绝。
- `semanticChanges[]` / diff 中只有预期的 animation 变化。
- 更新 target 时目标 shape 解析唯一；歧义时先 `select` 或改用 inspect 的 shape id/name。

## 文本逐条出现

优先表达成 paragraph/bullet build，不拆 word/character：

```json
{
  "op": "set-slide-animations",
  "slide": 2,
  "mode": "merge-safe",
  "animations": [
    {
      "target": {
        "shape": { "name": "Body" },
        "paragraph": 0
      },
      "build": "by-paragraph",
      "effect": "appear",
      "trigger": "on-click"
    }
  ]
}
```

`paragraph` 和 `level` 是 0-based。不要为了 word/character 动画给文本额外包大量 shape 或 span；
当前创建 schema 不暴露 word/character，遇到这类需求说明会降级到 paragraph/shape 或要求 PowerPoint 手工处理。

## Slide Transition

基础转场继续用 `set-slide-transition`，它与 shape animation 是不同层：

```json
{
  "op": "set-slide-transition",
  "slide": 0,
  "kind": "fade",
  "speed": "medium",
  "advanceOnClick": true,
  "advanceAfter": 5000
}
```

如果 inspect 已有未披露的 p14/p15 扩展转场、声音或复杂 timing，默认 preserve-only。Zoom 等未被
能力事实列为可创建的高级转场也保持 preserve-only。Morph 使用下面的专用流程，不要把它归入普通转场
或 shape animation。

## Morph 专用流程

先从当前运行时确认 Morph 契约，不能仅凭 xdoc 版本号推断：

```bash
xdoc schema --mode ops --ops set-slide-transition --minimal > <run-dir>/schema-set-slide-transition.json
xdoc pptx inspect input.pptx --daemon --json > <run-dir>/inspect-before.json
```

只有 schema 同时披露 `kind: "morph"`、`morphMode` 和需要的 mode 时才创建。Morph 目标是相邻的
source/destination slide pair；`set-slide-transition.slide` 是 **0-based destination slide index**。
对象配对是显式契约：在两页上给对应 shape 设置完全相同、区分大小写的 `!!` 前缀名称，例如
`!!Hero`。不要宣称 xdoc 会按文本、位置或普通 shape name 自动推断配对。

最小 patch：

```json
{
  "schemaVersion": "pptx-patch/v1",
  "ops": [
    {
      "op": "set-slide-transition",
      "slide": 1,
      "kind": "morph",
      "morphMode": "by-object",
      "duration": 900
    }
  ]
}
```

`morphMode` 只使用 schema 披露的严格枚举：`by-object`、`by-word`、`by-char`。在 apply 前后都对
确切相邻页运行诊断，并保存 `pptx-morph-check/v1` 报告：

```bash
xdoc pptx morph-check input.pptx --from-slide 1 --to-slide 2 --json \
  > <run-dir>/morph-check-before.json
xdoc pptx apply -i input.pptx --patch <run-dir>/patch.json --dry-run --json \
  > <run-dir>/dry-run.json
xdoc pptx apply -i input.pptx --patch <run-dir>/patch.json -o <run-dir>/candidate.pptx --json \
  > <run-dir>/apply.json
xdoc pptx inspect <run-dir>/candidate.pptx --daemon --json \
  > <run-dir>/inspect-after.json
xdoc pptx morph-check <run-dir>/candidate.pptx --from-slide 1 --to-slide 2 --json \
  > <run-dir>/morph-check-after.json
```

交付前要求 `morph-check-after.json` 中预期显式配对成功且没有 blocking finding，并确认 inspect 回读
到 `type: morph`、正确的 mode/duration、extension wrapper 以及 fade fallback。若两页本来没有 `!!`
名称，先通过普通 inspect/select 和受支持的重命名操作建立显式配对；不要通过 raw XML 绕过诊断。

`clean-open.mjs` 在可用时按主流程运行。下面的 Nushell 播放探针是可选的、能力门控的
PowerPoint-native 证据，仅在 macOS + PowerPoint + Nushell 都可用时运行：

```bash
node <skill-root>/scripts/pptx-nova-clean-open.mjs \
  --pptx <run-dir>/candidate.pptx --output <run-dir>/clean-open.json --json
nu <skill-root>/scripts/pptx-nova-morph-playback.nu <run-dir>/candidate.pptx \
  --from-slide 1 --to-slide 2 --mode by-object --duration-ms 900 \
  --output <run-dir>/morph-playback.json --json
```

缺少 Nushell 或其他可选前置不阻断基线 Morph 流程，但必须把 PowerPoint 播放证据标为
unverified，不能声称已经验证；若用户或交付策略明确要求 PowerPoint-native Morph 证明，
则该证明门禁保持阻塞，直到可选前置可用。

`--duration-ms` 是通过门禁的必填预期值，必须来自 patch 或 inspect，不能省略后仍宣称时长已验证。
需要验证 PowerPoint 保存往返时，再加 `--resave-output <run-dir>/powerpoint-resaved.pptx`，随后对该文件
重复 inspect 和 morph-check，并对 destination slide 的关键 XML 做可归因 diff。下面以 destination index
1 对应 `slide2.xml` 为例；其他页按实际 part 调整：

```bash
unzip -p <run-dir>/candidate.pptx ppt/slides/slide2.xml \
  | xmllint --format - > <run-dir>/slide2-before.xml
unzip -p <run-dir>/powerpoint-resaved.pptx ppt/slides/slide2.xml \
  | xmllint --format - > <run-dir>/slide2-after.xml
diff -u <run-dir>/slide2-before.xml <run-dir>/slide2-after.xml \
  > <run-dir>/slide2-powerpoint.diff || true
```

逐项归因 namespace/attribute order 等 PowerPoint 规范化；`p159:morph` mode/duration、
`mc:AlternateContent` Choice 和 fade Fallback 的删除或语义变化必须阻断。播放探针证明 PowerPoint 识别
目标 Morph mode、启用动画并从 source 前进到 destination；它不捕获中间帧，也不证明视觉插值像素一致。
该技能脚本只提供 macOS PowerPoint 证据；不可用时输出结构化 `skipped`。如果交付目标明确要求 Windows
PowerPoint，必须在 Windows fixture 补证，否则该维度保持 `inconclusive`。

清除 Morph 时使用同一 canonical operation，不直接删 XML：

```json
{
  "op": "set-slide-transition",
  "slide": 1,
  "clear": true
}
```

若调用方要求保留兼容转场，则用同一 operation 将 `kind` 明确设为 `fade`（或 schema 披露的其他基础
转场），不要把它与 `clear: true` 混用。apply 后 inspect 必须回读为无 transition 或指定基础转场，且
目标 slide 不得残留 Morph namespace、extension wrapper 或失效 Choice。

当前 xdoc viewer/parser 只消费 OOXML `mc:Fallback` 的 fade 语义；PDF/PNG 是静态结果。因此 viewer
播放、PNG、PDF 和普通语义 diff 都不能作为 Morph 插值已实现或视觉等价的证据。PowerPoint 播放与
保存往返是当前兼容性权威；若 PowerPoint 不可用，必须明确写成未验证风险，不能把 fallback 当作通过。

## Preserve-only 边界

这些场景默认不能用普通 patch 改：

- motion path / custom path 创建。
- emphasis（grow-shrink、spin、color 等）主动创建。
- media/video timing、interactive trigger、点击某个 shape 触发。
- chart/SmartArt build。
- word/character 级文本动画。
- inspect 标记 `editable: false` 或 `animation_capabilities.preserve_only` 的 timing。

raw OOXML 不是常规 fallback。只有用户明确要求、你能写出最小 XPath 修改，并完成 OPC/XML/PowerPoint
clean-open 与播放验证时，才读 `control-flow-and-raw-xml.md` 评估风险。

## 验证

动画任务的收尾比普通编辑多几步：

```text
inspect -> patch -> dry-run --json -> apply -> inspect回读 -> pptx diff -> preview/contact sheet ->
PowerPoint clean-open -> 播放/点击复核(可用时) -> Morph 时运行 morph-check + PowerPoint 播放探针 -> final summary
```

结构证据：

- `unzip -t out.pptx`
- 检查修改过的 `ppt/slides/slideN.xml` well-formed。
- 对新增/编辑 timing，确认 `<p:timing>` 位于合法 slide 子元素顺序，`bldLst` 与目标 shape id 对齐。
- PowerPoint clean-open 不得出现 Repair。

视觉/播放证据：

- PNG/contact sheet 只能证明静态最终态可读，不能证明动画顺序正确。
- 若用户关心播放，必须用 PowerPoint 或 viewer 播放复核点击次数、触发顺序、delay/duration 和自动切页。
- 有 `with-previous` / `after-previous` 时，检查 dry-run/diff 是否报告 timing 改动符合预期，不要把 delay 累加成意外长等待。

最终摘要列出动画能力审计：xdoc 版本、相关 op schema 是否披露、涉及的动画 id、哪些 step 被编辑/删除、
哪些 preserve-only 风险保留，以及 clean-open / 播放复核是否完成。
