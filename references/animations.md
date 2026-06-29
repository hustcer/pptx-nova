# PPTX 动画与转场

读取本文件的场景：用户要求新增、修改或删除 PPTX 动画/转场，或提到点击顺序、自动播放、
`with previous` / `after previous`、逐条 bullet、退出动画、motion path、emphasis、timing tree。

## 能力发现

动画能力变化较快，先用运行时 schema 和 dry-run 证据，不靠记忆：

```bash
xdoc schema --op set-slide-animations --minimal > <run-dir>/schema-set-slide-animations.json
xdoc schema --op update-slide-animation --minimal > <run-dir>/schema-update-slide-animation.json
xdoc schema --op remove-slide-animation --minimal > <run-dir>/schema-remove-slide-animation.json
```

当前 xdoc 0.2.5 暴露的安全子集包括：

- 创建/替换/清理：`set-slide-animations`，字段 `mode: "merge-safe" | "replace" | "clear"`。
- 局部安全编辑：`update-slide-animation`，用 `inspect.animations[].id` 定位。
- 局部安全删除：`remove-slide-animation`，用 `inspect.animations[].id` 定位。
- 支持的创建效果：入口 `appear/fade/wipe/fly`；退出安全子集 `disappear/fadeOut/wipeOut/flyOut`
  或 `phase: "exit"`。
- 支持的 trigger：`onClick`、`withPrevious`、`afterPrevious`。
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

- `timing_summary`: `has_timing`、`has_media_timing`、`has_interactive_trigger`、
  `has_unsupported_timing`、`editable_animation_count`、`preserve_only_animation_count`。
- `animations[]`: 稳定 `id`、`target`、`effect`、`phase`、`trigger`、`duration_ms`、`delay_ms`、
  `editable` 和 preserve-only reason。
- `animation_capabilities`: `editable`、`preserve_only`、`unsupported_create`。

只有 `editable: true` 的既有 step 可以用 `update-slide-animation` 或 `remove-slide-animation`
局部编辑。`preserve_only` 命中的 timing 不要 raw XML 猜改；需要重建时必须让用户确认
`mode: "replace"` 或 `mode: "clear"` 会改变原动画语义。

## 新增动画

新增动画仍是用户显式要求时才做；不要给普通商务 deck 自动加动效。

最小 patch：

```json
{
  "schemaVersion": 1,
  "ops": [
    {
      "op": "set-slide-animations",
      "slide": 0,
      "mode": "merge-safe",
      "animations": [
        {
          "shape": { "name": "KPI Card" },
          "effect": "fade",
          "trigger": "onClick",
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

## 安全编辑既有动画

先从 inspect 复制动画 `id`，再 patch：

```json
{
  "schemaVersion": 1,
  "ops": [
    {
      "op": "update-slide-animation",
      "slide": 0,
      "id": "animation-id-from-inspect",
      "effect": "fade",
      "trigger": "afterPrevious",
      "duration": 650,
      "delay": 120
    }
  ]
}
```

删除：

```json
{
  "schemaVersion": 1,
  "ops": [
    {
      "op": "remove-slide-animation",
      "slide": 0,
      "id": "animation-id-from-inspect"
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
      "trigger": "onClick"
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
  "type": "fade",
  "speed": "med",
  "advanceOnClick": true,
  "advanceAfter": 5000
}
```

如果 inspect 已有 p14/p15 扩展转场、声音、复杂 timing 或用户要求 Morph/Zoom 等高级转场，默认 preserve-only。
只有 schema 明确支持并通过 PowerPoint clean-open 与播放验证时才创建。

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
PowerPoint clean-open -> 播放/点击复核(可用时) -> final summary
```

结构证据：

- `unzip -t out.pptx`
- 检查修改过的 `ppt/slides/slideN.xml` well-formed。
- 对新增/编辑 timing，确认 `<p:timing>` 位于合法 slide 子元素顺序，`bldLst` 与目标 shape id 对齐。
- PowerPoint clean-open 不得出现 Repair。

视觉/播放证据：

- PNG/contact sheet 只能证明静态最终态可读，不能证明动画顺序正确。
- 若用户关心播放，必须用 PowerPoint 或 viewer 播放复核点击次数、触发顺序、delay/duration 和自动切页。
- 有 `withPrevious` / `afterPrevious` 时，检查 dry-run/diff 是否报告 timing 改动符合预期，不要把 delay 累加成意外长等待。

最终摘要列出动画能力审计：xdoc 版本、相关 op schema 是否披露、涉及的动画 id、哪些 step 被编辑/删除、
哪些 preserve-only 风险保留，以及 clean-open / 播放复核是否完成。
