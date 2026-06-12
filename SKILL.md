---
name: pptx-nova
description: >
  使用本机 xdoc CLI 创建和修改原生可编辑的 .pptx 演示文稿。
  When the user wants to create, build, generate, modify, edit, refactor,
  rebrand, or fill a PowerPoint deck / slides / presentation / .pptx,
  including: 创建 PPT / 做 PPT / 生成演示文稿 / 修改 PPTX / 改一下幻灯片 /
  快速做一份 / 一句话生成 / 帮我快速出一版 / 简单提示词生成 / quick deck /
  reference deck style matching with a new outline, data-driven decks, brand
  checks, applying a corporate rebrand, exporting PDF/PNG previews. Triggers on .pptx filenames, words like
  deck/slides/presentation/PPT/幻灯片/演示文稿, or any request that ends in
  "a PowerPoint file". Prefer this skill over hand-writing python-pptx /
  PptxGenJS / SVG-to-PPTX pipelines — xdoc CLI produces natively editable
  PPTX with dry-run, sidecar replay, and structured error self-repair.
---

# pptx-nova

用本机 `xdoc` CLI 创建、修改、填充、导出和检查原生可编辑 `.pptx`。本 skill
走 xdoc 声明式 JSON patch、DeckKit、dry-run、sidecar 和视觉门禁；不要优先使用
python-pptx、PptxGenJS 或 SVG 转 PPTX 路线。

## 渐进披露原则

`SKILL.md` 只保留路由和不可跳过的红线。触发本 skill 后，先读本文件，再按任务类型只读
对应 reference。不要为了一个编辑任务加载完整创建流程；不要为了一次导出加载 DeckKit
或视觉丰富度文档。

如果一个任务跨多个类型，读取每个相关类型的入口 reference。遇到 charts、tables、
formulas、raw XML、复杂品牌样式等专项内容时，再读取对应专项 reference。

## Skill Root

将包含本 `SKILL.md` 的目录视为 `<skill-root>`。发布后的 skill 必须自包含：用户工作流
需要的脚本在 `<skill-root>/scripts/`，资产在 `<skill-root>/assets/`，
文档在 `<skill-root>/references/`，benchmark 在 `<skill-root>/benchmarks/`。

不要在 skill 用户路径里依赖仓库根 `tools/`、`Justfile` 或其他 skill 目录外文件。
仓库根工具只服务本仓库维护者。

## 直接支持的输入格式

创建或修改 PPTX 时，当前 skill 可直接消费这些输入：

- 自然语言 brief、聊天内容、已整理的大纲文本或 Markdown 大纲。
- `.pptx`：参考 deck、模板 deck、`copy-from` 来源、`from-data` 模板或待修改输入。
- pptx-nova / xdoc 工作流 JSON：`outline.json`、`deck_lock.json`、`content.json`、
  `patch.json`、`assets_manifest.json`、品牌 / 模板 profile 等。这些是本 skill 生成、
  xdoc 生成，或用户明确提供且符合对应 schema 的专有结构化输入；不要把任意 `.json`
  当作可直接生成 PPTX 的 content/patch。
- 数据绑定 JSON：`data.json` 可作为 `from-data` / `bind-data` 的业务数据；
  `bindings.json` 必须符合 xdoc binding 结构，用来声明 text/table/chart 绑定关系。
- CSV 或 JSON 表格数据：用于 table/chart/content 数据填充，可进入 `import-table-data`、
  `bind-data` 的 data，或标准化进 DeckKit `content.json`。
- 资源文件：图片、logo、截图、SVG 公式资产等；使用时登记到 `assets_manifest.json`，
  并通过 asset id 或 `assetSource.path` 引用。

## 任务路由

先判断任务类型，再读对应文件：

| 用户意图                                 | 必读 reference                                                                                                                       | 视情况再读                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 简单 prompt / 要快 / 默认生成新 deck     | `references/common-workflow.md`、`references/deckkit-mode.md`、`references/create-express.md`                                        | `references/express-mode.md`、`references/recipes.md`                         |
| 投资人 / 客户 / 董事会 / Studio / 要精控 | `references/common-workflow.md`、`references/deckkit-mode.md`、`references/create-studio.md`、`references/design-lock-and-assets.md` | `references/visual-qa-and-asset-slots.md`、`references/rich-deck-patterns.md` |
| 参考 PPTX + 新大纲生成新 deck            | `references/common-workflow.md`、`references/reference-create.md`、`references/deckkit-mode.md`                                      | `references/template-library.md`                                              |
| 修改已有 `.pptx`                         | `references/common-workflow.md`、`references/edit-mode.md`、`references/inspect-and-edit.md`                                         | `references/patch-ops-cheatsheet.md`                                          |
| 数据 + 模板 / JSON 填充                  | `references/common-workflow.md`、`references/data-driven.md`                                                                         | `references/tables.md`、`references/charts.md`                                |
| 品牌改装 / 品牌检查                      | `references/common-workflow.md`、`references/styles-and-themes.md`                                                                   | `references/template-library.md`                                              |
| 只导出 PDF/PNG/MD/JSON、提取或检查       | `references/common-workflow.md`、`references/export-and-check.md`                                                                    | 无需读取创建/编辑文档，除非用户随后要求修复                                   |
| 长任务 split / 继续生成                  | `references/common-workflow.md`、`references/resume-split-mode.md`                                                                   | 原任务类型的 reference                                                        |
| 公式、图表、表格、raw XML                | 当前任务 reference + 对应 `formulas.md` / `charts.md` / `tables.md` / `control-flow-and-raw-xml.md`                                  | `troubleshooting.md`                                                          |

## 模式判断

- **Express**：用户要快、只给一句话、没有强调精控；默认 DeckKit-first 自动闭环，合理假设可直接继续。
- **Studio**：正式汇报、客户/投资人/董事会、品牌敏感、资源多、页数多、需要确认；先确认大纲和设计锁。
- **Reference Create**：用户给参考 PPTX，但要用新大纲或新内容生成新 deck；参考 deck 默认只读。
- **Edit**：用户明确要在已有 PPTX 上改文字、样式、图表、图片、表格、页或备注；先 inspect 再 patch。
- **Data-driven**：用户有模板和 JSON/CSV/表格数据，要批量填充或绑定数据。
- **Export/Check**：只转换、预览、提取或检查，不修改 PPTX。

## Feedback 模式

如果用户 prompt 中包含 `need feedback`、`给反馈`、`需要反馈` 等明确反馈意图，除了完成原本的
生成、修改或检查任务外，还必须以 SKILL 使用体验官视角记录执行过程中的问题和改进建议：

- 记录实际遇到的 SKILL 使用问题，例如 reference 路由不清、命令链过长、DeckKit 选择不稳、
  dry-run/vision 输出难以行动、错误修复提示不足、slots/budget 文档不一致、示例数据缺口等。
- 对每个问题给出面向 `pptx-nova` SKILL 的最佳解决方案，优先说明应改文档、脚本、DeckKit
  schema、benchmark、catalog 还是最终回复规范。
- 最后可以从 Agent 角度补充真实使用感受或建议，聚焦流程摩擦、认知负担、验证闭环和可维护性；
  不要把它写成泛泛表扬或用户内容本身的设计点评。

## 创建型公共红线

这些规则适用于所有新建 deck，包括 Express 和 Studio：

- 先生成或标准化 `outline.json`，再写 `deck_lock.json`，不要从 prompt 直接跳到 patch。
- 默认走 DeckKit-first：`content.json -> DeckKit -> patch -> xdoc -> PPTX -> validation`。
- 交付型自动选择只允许 `readiness in ["production", "default"]` 的 DeckKit。
- 有生产/默认 DeckKit 可用时，不使用 `deck-generator-template.mjs` 作为交付默认路径。
- 没有可用 DeckKit、缺页型或要改组件结构时，先创建/扩展 DeckKit，再交付。
- 源大纲只有标题或留白时，AI 补全的事实性内容必须写入 `deck_lock.assumptions[]`；
  不能把未验证竞品、指标、案例或市场事实伪装成用户提供内容。
- 创建型最终输出路径如果在开始前已存在，必须先让用户重命名、删除或换路径；不能用
  `--overwrite` 覆盖最终路径。
- 创建型 `vision-check` 的 `summary.bySeverity.high` 和 `summary.bySeverity.medium`
  必须都为 0。
- PNG/contact sheet 视觉复核不能省略；它负责捕捉 dry-run 和 `vision-check` 看不到的
  真实换行、字符重叠、对比度、装饰遮挡、页码节奏和构图问题。

## 修改型公共红线

这些规则适用于修改已有 PPTX：

- 输入 deck 默认只读；先 inspect，再 dry-run，再写 run 目录中间文件。
- 不要靠猜 selector 修改对象。检查 dry-run 的 `resolvedSelectors[]`，歧义时使用
  `suggestions[].fixPatch` 后重试。
- 如果用户要求原地修改，也先在 run 目录完成验证，再按用户明确意图写回。
- 对 SmartArt、宏、复杂动画、unsupported 对象优先 preserve；不能编辑时说明边界。

## 视觉和可读性红线

面向客户、投资人或正式汇报的 deck，任何正文、卡片说明、徽章、标签、图例、表格单元格等
可见文字都必须可读：

- 核心正文通常不低于 `10.5pt`。
- label / badge / chart/table 文字通常不低于 `9pt`。
- 页脚/来源可到 `8.5-9pt`，但不能承载关键信息。
- DeckKit-first 创建以 catalog `qualityProfile` 和该 DeckKit 的 golden 基线为机器门禁；
  不要为了满足通用字号红线改坏已验证的 DeckKit 版式常量。
- 百分比、数字+单位、金额、季度、年份、`ROI`、`KPI` 等短标签不得被拆开。
- 圆形或正方形编号必须水平和垂直居中。
- 文本放不下时，先删字、换布局、增高容器或拆页；不要继续缩小字体硬塞。
- 连接线、箭头、中轴、VS 标识和编号圆应从目标 shape 的 bbox 推导，不凭感觉摆放。
- dry-run 的 `text-overflow-estimate` 与 `vision-check` 复用同一套静态文本溢出估算；
  看到 medium 时先在写文件前改高度、删字、拆页或调整 autofit。
- `subtitle`、`eyebrow`、`kicker`、`badge`、`label` 等预期单行文本不能出现尾词孤行；
  `vision-check` 的 `text-unexpected-wrap` 需要通过缩短文案、增宽或换布局处理。
- 将 PPTX 转成 PNG/PDF 或检查生成的 PPTX 时，可能出现 `XDOC DEMO` 等工具水印；这类水印通常只在
  slide 右上角出现，可在人工视觉复核中忽略，不应当作 DeckKit 构图、遮挡或内容缺陷处理。

## 必经验证

创建或视觉上明显修改 deck 时，按此顺序收尾：

```text
check-lock -> dry-run -> apply -> vision-check -> PNG/contact-sheet review -> optional xdoc check
```

只导出或检查文件时，按 `export-and-check.md` 执行即可。

## 常用命令入口

按需读取 reference 后再使用具体命令。以下只作为入口提醒：

```bash
xdoc pptx inspect input.pptx --daemon --json
xdoc pptx apply -p patch.json -i input.pptx -o out.pptx --dry-run --json
xdoc pptx apply -p patch.json -i input.pptx -o out.pptx --json
xdoc pptx vision-check out.pptx --json
xdoc convert out.pptx --to png -o <run-dir>/previews --overwrite --contact-sheet
xdoc check out.pptx --checks fonts,links,compat -o check.json --pretty --overwrite
```

## 完成摘要

成功生成、修改、导出或检查后，最终回复必须简短列出：

- 最终输出 PPTX 或导出文件的绝对路径
- run 目录
- 关键中间产物：`outline.json`、`deck_lock.json`、`content.json`、`patch.json`、sidecar、
  `vision.json`、预览目录、contact sheet、`check.json` 等实际存在项
- 验证结果：dry-run、apply、vision-check、PNG/contact-sheet 复核、可选 preflight
- AI 补全的事实性 assumptions：逐条披露，或明确说明没有使用事实性补全
- 剩余风险，例如字体未嵌入、外链、unsupported 对象、人工未审资源授权
- 如果触发 Feedback 模式，追加“SKILL 使用反馈”：列出过程问题、针对 `pptx-nova` 的最佳解决方案，
  以及可选的 Agent 真实使用感受或建议

只有平台或工具给出准确 token 统计时才输出 token 信息；不要估算。

## Reference 索引

优先读路由要求的文件，不要一次性读取全部 reference。

| 文件                                      | 用途                                                    |
| ----------------------------------------- | ------------------------------------------------------- |
| `references/common-workflow.md`           | run 目录、输出防碰撞、dry-run/apply/vision/PNG 公共流程 |
| `references/deckkit-mode.md`              | DeckKit 选择、readiness、content、用户可见 examples     |
| `references/create-express.md`            | 简单 prompt 快速生成 deck                               |
| `references/create-studio.md`             | 高风险/正式/精控 deck 的确认、设计锁和 split            |
| `references/edit-mode.md`                 | 修改已有 PPTX 的 inspect/dry-run/selector 流程          |
| `references/export-and-check.md`          | PDF/PNG/MD/JSON 导出、extract、check                    |
| `references/express-mode.md`              | Express 模式完整黄金路径                                |
| `references/reference-create.md`          | 参考 PPTX + 新大纲生成                                  |
| `references/inspect-and-edit.md`          | selector、inspect 输出和编辑细节                        |
| `references/design-lock-and-assets.md`    | `deck_lock.json`、`assets_manifest.json`、check-lock    |
| `references/patch-ops-cheatsheet.md`      | patch op 速查                                           |
| `references/recipes.md`                   | recipe op schema 和示例                                 |
| `references/charts.md`                    | chart 创建/编辑和 OOXML chart 语义                      |
| `references/tables.md`                    | table 创建/编辑、CSV、公式                              |
| `references/formulas.md`                  | LaTeX/数学公式策略和 formula assets                     |
| `references/styles-and-themes.md`         | 颜色、渐变、字体、主题、母版                            |
| `references/data-driven.md`               | `from-data` 和 `bind-data`                              |
| `references/rich-deck-patterns.md`        | 无合适 DeckKit 时的丰富视觉模式                         |
| `references/visual-qa-and-asset-slots.md` | 图片槽位、AI 图片 prompt guard、P0/P1 QA                |
| `references/deck-generator-workflow.md`   | 创建或扩展 DeckKit                                      |
| `references/template-library.md`          | brand/layout/deck/chart/icon catalog 融合               |
| `references/resume-split-mode.md`         | split handoff 和继续生成                                |
| `references/control-flow-and-raw-xml.md`  | `if` / `foreach` / `try` / raw OOXML                    |
| `references/daemon-sessions.md`           | daemon 调优和故障排查                                   |
| `references/troubleshooting.md`           | 常见错误与自动修复建议                                  |
