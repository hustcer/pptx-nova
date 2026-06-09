# pptx-nova Skill 使用指南

`pptx-nova` 用本机 `s8fy` CLI 创建、修改和检查原生可编辑的 `.pptx` 演示文稿。它适合让
Agent 交付真正的 PowerPoint 文件，而不是 SVG 截图、HTML 页面或不可编辑图片。

本文面向 skill 使用者和执行 Agent。维护者开发流程见仓库文档；使用本 skill 时不需要仓库根
`tools/` 或 `Justfile`。

## 适用场景

- 从一句话、需求说明、Markdown 大纲、表格或数据生成新的 `.pptx`。
- 按用户已经提供的大纲直接生成 deck。
- 参考一份已有 PPTX 的风格，再用新的大纲或内容生成新 PPTX。
- 修改已有 `.pptx`，例如改文字、增删页、替换图表数据、重排元素或套品牌色。
- 把数据填入模板，做季度汇报、路演、管理汇报、课程、产品更新等演示文稿。
- 导出 PNG/PDF 预览、做视觉检查、做品牌合规检查。

## 使用前提

- 本机可运行 `s8fy` CLI。
- 本机可运行 Node.js，用于 skill 内置脚本和 DeckKit 生成器。
- `skills/pptx-nova/` 目录保持完整，至少包含 `SKILL.md`、`assets/`、`references/` 和
  `scripts/`。
- 生成或修改 PPTX 时，Agent 会在当前工作目录下创建 `.pptx-nova/<run>/` 保存中间产物。

## 如何向 Agent 提需求

给的信息越明确，成品越稳定。建议至少说明：

- 目标：这份 deck 要解决什么问题，给谁看。
- 输出：最终文件名、语言、页数范围、是否需要 PDF/PNG 预览。
- 内容：已有大纲、每页标题、关键数据、表格、图表或材料链接。
- 风格：正式/咨询/产品/课程/极简，是否有品牌色、字体、参考 PPTX。
- 约束：必须保留的观点、不能改的页序、需要避开的表达或敏感信息。

示例：

```text
用 pptx-nova 生成一份 8 页中文投资人路演 PPTX，文件名叫 ai-roadshow.pptx。
受众是制造业 CIO，风格参考 reference.pptx，但内容按下面大纲走：
1. 封面：AI 质检平台
2. 行业痛点
3. 方案架构
4. 核心指标
5. 客户案例
6. 商业模式
7. 路线图
8. 融资用途
```

```text
修改 qbr.pptx，把第 3 页 KPI 数据替换成这个表格，并输出 qbr-updated.pptx。
不要覆盖原文件，完成后导出 PNG 预览。
```

## 生成新 PPTX 的工作流

新建 deck 默认走 DeckKit-first 路径：

```text
用户需求或大纲
  -> outline.json
  -> DeckKit 选择和 readiness 检查
  -> content.json 或 patch
  -> dry-run
  -> apply 生成 PPTX
  -> vision-check
  -> PNG/contact sheet 复核
```

如果用户已经提供大纲，Agent 会直接采用并标准化为 `outline.json`。只有大纲互相矛盾、内容明显
装不下、缺少关键数据，或用户要求优化结构时，才会先给修订版或问题让用户确认。

如果用户只给一句话且强调“快”，默认使用 Express 模式：Agent 会自行生成大纲并继续交付，在最终
摘要里列出关键假设。若是投资人路演、董事会、客户正式汇报、品牌口径敏感或用户明确要求“先给大纲”，
Agent 会先展示短大纲，确认后再生成 PPTX。

## 参考 PPTX 生成新文件

当用户提供参考 PPTX 和新大纲时，`pptx-nova` 会把参考文件当作视觉和结构输入，源文件默认只读。
常见路线：

- 只要风格相似：抽取参考 deck 的颜色、字体、密度和页面节奏，再用新内容重建。
- 需要版式相似：inspect 参考 deck，建立新大纲页到参考页型的映射。
- 需要复用模板占位符：走 data-driven/template 路线。
- 要直接改参考文件本身：走 Edit 模式，而不是 Reference Create。

交付时不应把参考 deck 的旧文本、旧数据或未授权图片带进新文件，除非用户明确要求复用。

## 修改已有 PPTX 的工作流

修改已有 deck 时，源文件默认只读。Agent 会先 inspect，再写 patch，并通过 dry-run 预演选择器和风险：

```text
input.pptx
  -> inspect.json
  -> patch.json
  -> dry-run
  -> apply 到新输出文件
  -> vision-check / PNG 复核
```

如果用户要求原地修改，也应先在 `.pptx-nova/<run>/` 里完成验证，再按用户明确意图写回原路径。

## 质量标准

创建型 deck 交付前必须通过这些检查：

- `s8fy pptx apply --dry-run --json` 没有未解决的语义风险。
- `s8fy pptx vision-check` 的 high 和 medium 都为 0。
- PNG 或 contact sheet 逐页复核无文字重叠、截断、贴边、页脚撞正文、连接线偏移等问题。
- 可见正文有阅读底线：核心正文通常不低于 `10.5pt`，辅助标签不低于 `9pt`。
- 最终 PPTX 是原生可编辑内容，不是整页截图或 SVG 中转。

如果任一检查失败，Agent 应回到 `outline.json`、`content.json`、DeckKit 或 patch 修正后重跑。

## 交付物

成功完成后，Agent 的最终回复应包含：

- 最终 `.pptx` 的绝对路径。
- run 目录路径，例如 `.pptx-nova/<slug>-<timestamp>/`。
- 关键中间产物：`outline.json`、`content.json` 或 `patch.json`、sidecar、`vision.json`、预览目录。
- 验证结果：dry-run、vision-check、PNG/contact sheet 复核。
- 尚需用户注意的风险，例如参考 deck 中未复用的复杂动画、缺失字体、授权素材未复制等。

## 内置脚本

`skills/pptx-nova/scripts/` 是发布包的一部分。常用脚本包括：

- `pptx-nova-deckkit-select.mjs`：选择符合场景、语言、密度和页型要求的 DeckKit。
- `pptx-nova-deckkit-readiness.mjs`：检查 DeckKit 是否满足 candidate/delivery/default 要求。
- `pptx-nova-deckkit-benchmark.mjs`：运行内置视觉 benchmark。
- `pptx-nova-deckkit-catalog-update.mjs`：更新 DeckKit 质量元数据。
- `pptx-nova-icons.mjs`：离线查询和读取内置 Tabler 图标 pack。

命令示例中的 `<skill-root>` 指 `skills/pptx-nova/` 目录：

```bash
node <skill-root>/scripts/pptx-nova-icons.mjs search "analytics dashboard" --json
node <skill-root>/scripts/pptx-nova-deckkit-select.mjs --target delivery --json
```

普通使用时通常不需要手动调用这些脚本；Agent 会在需要时调用它们。

## 不要这样使用

- 不要要求 Agent 用整页截图、SVG 中转或不可编辑图片冒充 PPTX。
- 不要在创建型 deck 中跳过大纲、dry-run、vision-check 或 PNG 复核。
- 不要把根仓库 `tools/`、`Justfile` 或 skill 目录外的脚本作为发布后使用路径。
- 不要直接覆盖用户已有 PPTX；除非用户明确要求，始终输出到新文件。
- 不要在用户已提供大纲时擅自重排核心页序或改写主要观点。

## 进一步阅读

- `SKILL.md`：Agent 执行时的完整规则。
- `references/express-mode.md`：一句话或已有大纲快速生成 deck。
- `references/reference-create.md`：参考 PPTX + 新大纲生成新 deck。
- `references/inspect-and-edit.md`：修改已有 PPTX。
- `references/data-driven.md`：数据驱动和模板填充。
- `references/troubleshooting.md`：常见失败与修复方式。
