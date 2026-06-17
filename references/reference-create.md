# Reference Create —— 参考 PPTX + 新大纲生成新 deck

当用户给一份 `.pptx` 作为参考，同时给新的大纲、主题或内容，并要求生成一份新的 `.pptx` 时使用。
目标是复用参考 deck 的视觉语言和可复用结构，但输出仍是新文件，源 PPTX 默认只读。

## 1. 先判定用户意图

| 用户意图                          | 路线                                           |
| --------------------------------- | ---------------------------------------------- |
| "严格套这个模板/保留原版式改内容" | Template Following，见 `template-following.md` |
| "按占位符填数据"                  | `from-data`，见 `data-driven.md`               |
| "风格像这份 PPT，内容按新大纲"    | `extract-style` + 新建 deck                    |
| "结构/版式也参考这份 PPT"         | `inspect` + `reference-map.json`               |
| "直接在这份 PPT 上改成新内容"     | Edit 模式，见 `inspect-and-edit.md`            |
| "这份模板以后反复复用"            | `import-template`，见 `template-library.md`    |

不要把"参考风格生成新文件"误判成 Edit，也不要把"严格套模板"误判成普通 Reference Create：
严格套模板必须走 `template-following.md`，复制或填充源模板的 inherited objects，不能只重画一份
看起来相似的新 deck。Edit 是修改用户已有 deck；Reference Create 是读取参考 deck 后新建 deck。

## 2. Run 目录产物

除 `common-workflow.md` 规定的通用产物外，Reference Create 还要把这些文件放在 run 目录：

- `reference-inspect.json`：`inspect` 输出，用来判断页面尺寸、layout、shape、文本密度和复杂对象。
- `reference-style.json`：`extract-style` 输出，包含主题色、字体、layout/slide 语义和 draft pack。
- `reference-map.json`：新大纲每页到参考页型/参考 slide 的映射。
- `outline.json`：用户大纲或标准化后的新大纲；用户已给大纲时直接采用。
- `template_fusion.json`：仅在多来源冲突、用户 override 或需要审计时记录完整段级融合结果。
- `deck_lock.json`：锁定参考 deck 可复用的风格/结构、模板融合、输出路径和每页页型/节奏。
- `assets_manifest.json`：仅在有被允许复用或新生成的 logo、图片、图标、数据截图等资源时创建。

## 3. 标准流程

```bash
xdoc pptx inspect reference.pptx --json > reference-inspect.json
xdoc pptx extract-style reference.pptx --output reference-style.json --json
```

然后创建 `reference-map.json`，最小结构如下：

```json
{
  "source": "reference.pptx",
  "strategy": "style-and-layout",
  "slides": [
    {
      "outlineIndex": 0,
      "outlineKind": "title",
      "referenceSlide": 0,
      "reuse": "style",
      "notes": "Use cover typography and chrome; create new text/content."
    }
  ]
}
```

`reuse` 建议值：

- `style`：只复用色彩、字体、chrome、密度，不复制整页。
- `layout`：复用版式结构和对象关系，用新内容重建。
- `copy-slide`：用 `copy-from` 复制整页骨架后替换内容；只在参考页结构很难重建、且不是严格模板跟随
  的普通 Reference Create 中使用。严格模板跟随改走 `template-following.md`。
- `template`：已有占位符模板，改走 `from-data`。

如果用户同时给了精确 brand/layout/deck catalog id 或显式模板路径，先按
`template-library.md` 的段级融合规则写入 `deck_lock.json.templateFusion`：

- brand 只覆盖 identity（颜色、字体、logo、图标风格、品牌口径）。
- layout 只覆盖 structure（画布、网格、页型结构、密度和 page rhythm）。
- deck 作为完整起点；显式 brand/layout 可分别覆盖它的 identity/structure。

融合结果进入 `deck_lock.json.templateFusion`。参考 PPTX 自身也是一个输入源，但它默认只提供
style/layout evidence；除非用户明确允许复用素材，不把参考 deck 的旧图片、logo 或图标复制进新文件。

生成路径：

1. 根据 `reference-style.json` 选择已有 theme/style，或临时使用抽取出的 draft pack。
2. 写 `deck_lock.json`：记录参考来源、template fusion、DeckKit/theme/style、每页
   `referenceSlide` / `reuse` / `slideType` / `rhythm` / `layoutIntent` /
   `visualDensity`，以及所有假设。
3. 只有允许复用或必须补齐图片/logo/图标/数据截图时才写 `assets_manifest.json`；未授权参考素材标为
   `needs-review` / `needs-user` / `forbidden`，不要在 patch 中偷偷引用。无外部资源时不要创建空 manifest。
4. 根据 `reference-map.json` 和 `deck_lock.json` 把 `outline.json` 转为 `content.json`
   或 generator 输入。
5. 优先用 DeckKit / generator 新建页面；只有 `reuse: copy-slide` 时才用 `copy-from`。
6. 生成 patch 后跑
   `node <skill-root>/scripts/pptx-nova-check-lock.mjs --lock deck_lock.json --content content.json --patch patch.json --json`；
   有 `assets_manifest.json` 时加 `--assets assets_manifest.json`。
7. 跑 dry-run，确认 selector、layout 和 visualRisks。
8. apply 到 run 目录中间 `.pptx`。
9. 跑 `vision-check`，创建型 deck 的 high/medium 必须清零。
10. 转 PNG/contact sheet，逐页检查参考风格是否一致、文字是否溢出、页面是否像新内容而不是旧页残留。

## 4. 复制整页时的规则

`copy-from` 适合保留复杂整页结构：

```bash
xdoc pptx copy-from target.pptx --from reference.pptx --slide 0 --output out.pptx --json
```

复制后必须立刻用 patch 替换旧文本、图表数据、表格数据和图片；不要交付带有参考 deck 旧内容的页面。
如果只是学习风格，不要整页复制，因为这会把旧内容、旧媒体和潜在授权风险一起带进新 deck。
复制后也不能用 overlay 遮住旧内容来伪装替换；必须改写、替换或删除 inherited 对象本身。
如果复制页中有空 title/body/date/footer/slide-number placeholder，必须显式填充或删除。

## 5. 质量和边界

- 用户给的新大纲是内容真源；参考 deck 是视觉和结构输入。不要为了贴近参考 deck 改写用户核心观点。
- `extract-style` 当前不会全量细抽 card radius、shadow、chart-specific style；这些需要用
  `inspect`、PNG 观察、generator token 和显式 patch ops 补齐。
- 如果参考 deck 含 logo、照片、插画、产品截图、客户 mark、App icon 或第三方图标，只有用户明确允许复用
  或来源可验证时才复制素材；否则抽象成布局和风格，不复制资产，不生成伪官方替代物。允许复用的素材必须
  登记到 `assets_manifest.json`。
- 如果参考 deck 有动画、转场、SmartArt、复杂 chartEx，`inspect` 发现后在摘要中说明保真风险；
  必要时改用普通可编辑 shape/table/chart 重建。
- 完成摘要必须列出参考 deck 路径、`reference-style.json`、`reference-map.json`、
  `template_fusion.json`（如有）、`deck_lock.json`、`assets_manifest.json`（如有）、最终 PPTX 路径、
  check-lock、vision-check 和 PNG 复核结果。
