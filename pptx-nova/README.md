# pptx-nova 使用指南

`pptx-nova` 可以帮你制作、修改、翻新和检查 PowerPoint 演示文稿。你只需要用日常语言说明想要什么，
它会尽量交付一份真正可编辑的 `.pptx` 文件，而不是一张张截图。

这份文档写给普通使用者。你不需要了解命令行、配置文件或内部流程。

## 你可以让它做什么

你可以用 `pptx-nova` 做这些事情：

- 从一句话或一段说明生成一份新的 PPT。
- 根据你给的大纲、文档、网页、PDF 或表格资料整理成 PPT。
- 参考一份已有 PPT 的风格，做一份内容不同的新 PPT。
- 套用公司模板，把新内容填进去。
- 翻新一份旧 PPT，让它更统一、更专业，但保留原本内容。
- 修改已有 PPT，比如改标题、替换数据、调整页面、换图片、改配色。
- 把 CSV、JSON 或表格数据做成表格页或图表页。
- 导出 PDF 或图片预览，方便检查和分享。
- 检查 PPT 是否有文字重叠、内容被截断、页面不整齐等问题。

网页、HTML 和 PDF 可以作为内容素材输入。`pptx-nova` 会先把它们提取成 Markdown 或文本，
再进入 PPT 生成流程；它不会默认把网页或 PDF 的原始版式、图片和样式完整搬进 PPT。

## 最简单的用法

你可以直接这样说：

```text
用 pptx-nova 做一份 8 页中文路演 PPT，主题是 AI 质检平台，受众是制造业 CIO，
风格要专业、清爽，输出 ai-roadshow.pptx。
```

也可以这样说：

```text
把 qbr.pptx 翻新一下，内容不要变，视觉更像咨询公司汇报，输出 qbr-new.pptx。
```

或者：

```text
修改 qbr.pptx，把第 3 页的 KPI 数据换成 data.csv 里的数据，不要覆盖原文件。
```

## 你最好提供哪些信息

不需要一次说得很完美，但如果你能提供下面这些信息，结果通常会更好：

- **用途**：这是路演、内部汇报、销售材料、培训课件，还是客户提案？
- **受众**：给老板、客户、投资人、同事、学生，还是公开演讲？
- **页数**：大概几页，或者是否有固定页数。
- **语言**：中文、英文，还是中英混合。
- **内容**：大纲、文档、CSV/JSON 表格数据、旧 PPT、网页链接、PDF、图片或 logo。
- **风格**：正式、简洁、咨询风、科技感、品牌规范、课程风等。
- **限制**：哪些内容不能改，哪些页面必须保留，是否允许重排结构。
- **输出**：最终文件名，是否需要 PDF 或图片预览。

你可以只给一句话开始；如果信息不够，助手会根据任务情况继续推进，或在关键地方向你确认。

## 常见需求写法

### 1. 快速生成一份新 PPT

```text
用 pptx-nova 快速做一份 6 页中文产品介绍 PPT，主题是企业知识库助手。
受众是销售团队，风格简洁、商务，输出 product-intro.pptx。
```

适合：你有一个主题，但还没有完整大纲。

### 2. 按大纲生成 PPT

```text
根据下面大纲生成一份 10 页 PPT，中文，风格正式，用于季度业务复盘。
1. 封面
2. 本季度业绩概览
3. 收入变化
4. 用户增长
5. 重点项目进展
6. 风险与问题
7. 下季度目标
8. 资源需求
9. 行动计划
10. Q&A
```

适合：你已经知道每页要讲什么。

### 3. 参考已有 PPT 风格

```text
参考 reference.pptx 的视觉风格，用 new-outline.md 的内容生成一份新 PPT。
不要复用 reference.pptx 里的旧文案，只参考风格和页面节奏。
```

适合：你喜欢某份 PPT 的风格，但要做一份新内容。

### 4. 翻新旧 PPT

```text
翻新 old-report.pptx，页数和内容保持不变，整体更专业、更统一。
输出 old-report-refined.pptx，并给我图片预览。
```

适合：旧 PPT 内容还可以，但视觉过时、不统一或不够正式。

### 5. 修改已有 PPT

```text
修改 sales.pptx：
第 2 页标题改成「2026 年销售目标」；
第 5 页替换成 new-chart-data.csv 的数据；
输出 sales-updated.pptx。
```

适合：你只想改现有 PPT 的一部分。

### 6. 套公司模板

```text
用 company-template.pptx 的模板和品牌风格，把 outline.md 做成一份新 PPT。
尽量保留模板的版式和占位符。
```

适合：公司有固定模板，不能随便换风格。

### 7. 只做检查或导出

```text
检查 final.pptx 有没有文字重叠、截断或版式问题，不要修改文件。
```

```text
把 final.pptx 导出成 PDF 和每页 PNG 预览。
```

适合：你已经有 PPT，只需要确认质量或导出材料。

## 交付时你会得到什么

通常会包含：

- 一份最终 `.pptx` 文件。
- 如果你要求，会有 PDF 或图片预览。
- 简短说明：改了什么、生成了什么、有没有需要你注意的地方。
- 如果任务复杂，会保留一份可审计的工作记录，例如 `outline.json`、`deck_lock.json`、
  `content.json`、`patch.json`、检查报告、预览图和 contact sheet，方便后续继续修改或排查问题。

默认不会覆盖你的原始 PPT。除非你明确要求“直接覆盖原文件”，否则会输出到一个新文件。

## 哪些材料特别有帮助

如果你有这些材料，可以一起提供：

- 公司 logo、品牌色、字体要求。
- 以前做过且你喜欢的 PPT。
- 公司标准模板。
- 产品截图、架构图、人物照片、客户案例图片。
- 表格数据、图表数据、指标口径说明。
- 参考文案、官网、白皮书、PDF、会议纪要。

如果缺少 logo、截图或官方素材，助手不会假装生成“官方素材”。它会用文字、简单图形或占位说明替代，
并在结果里告诉你。

## 翻新 PPT 时要知道的事

“翻新”通常表示：内容不变，视觉变好。

所以默认会尽量保留：

- 原来的页数。
- 原来的文字和主要观点。
- 表格、图表、图片、备注等可见内容。
- 页面之间的逻辑顺序。

如果旧 PPT 本身内容太密、页面装不下，通常会先尝试保留原生对象并调整版式；确实需要拆页、
合页、重排或删减内容时，必须先让你确认。默认不会把源页整页截图塞进新 PPT 来冒充可编辑翻新。
机器检查通过后，翻新类任务通常仍需要打开 contact sheet 或逐页图片做最终视觉复核。

## 什么时候需要先确认

这些情况通常更适合先确认大纲或方向，再生成完整 PPT：

- 投资人路演、董事会材料、客户正式提案。
- 公司品牌要求很严格。
- 页数很多，或资料很多。
- 你要求“严格套模板”。
- 你不希望助手自行补充事实或改写观点。
- 旧 PPT 内容很复杂，翻新时可能影响原内容。

如果你赶时间，也可以直接说明“先快速出一版”，助手会尽量减少来回确认。

## 不适合这样要求

为了保证 PPT 能继续编辑，不建议这样使用：

- “直接把每页截图塞进 PPT 就行。”
- “旧内容可以随便删，只要看起来高级。”
- “参考 PPT 里的图片都拿来用”，但没有授权或来源说明。
- “覆盖原文件”，但没有明确备份或输出路径。
- “严格按模板”，同时又要求完全不同的页面结构。

## 一句话模板

你可以复制下面这个格式来提需求：

```text
用 pptx-nova 做一份【页数】【语言】PPT，主题是【主题】，
受众是【受众】，用途是【用途】，
风格希望【风格】，
内容来自【大纲/文档/旧 PPT/CSV 或 JSON 表格/链接】，
输出文件名是【文件名.pptx】。
```

示例：

```text
用 pptx-nova 做一份 12 页中文 PPT，主题是 2026 年产品路线图，
受众是公司管理层，用途是季度战略会，
风格希望正式、清爽、偏咨询风，
内容来自 roadmap.md 和 metrics.csv，
输出文件名是 product-roadmap-2026.pptx。
```

## 维护者说明

这一节面向维护和发布 `pptx-nova` skill 的开发者。普通使用者不需要阅读。

### 独立运行契约

`pptx-nova` 发布后应能作为独立 skill 运行，不依赖当前开发 monorepo 的根目录文件。

- 脚本从自身位置推导 `<skill-root>`，不要依赖仓库根开发工具、本地环境文件或 agent 私有上下文文件。
- 项目输入通过显式参数传入，例如 `--root`、`--asset-root`、`--xdoc-bin`、PPTX 路径或
  已文档化的环境变量。
- Deck generation path 使用 bundled assets；不要从网络或本机 checkout 动态读取图标、模板或私有素材。
- `xdoc` 是主要外部 CLI 依赖。没有 `xdoc` 时，内容验证、DeckKit 选择、icon 查询和 patch build
  仍应可跑；真实 apply、convert、vision-check 会失败或被上层跳过。

### 公开前检查

在公开仓库根目录中至少跑：

```bash
node tools/pptx-nova-smoke-test.mjs
node tools/pptx-nova-audit-public.mjs --strict
```

`tools/pptx-nova-smoke-test.mjs` 只使用 `pptx-nova/` 内 bundled files。它覆盖：
content validation、DeckKit patch build、icon pack query、DeckKit selector。

`tools/pptx-nova-audit-public.mjs` 检查：

- 维护者机器上的绝对路径和私有仓库路径。
- 当前 monorepo 私有上下文泄漏。
- unexpected binary files。
- Tabler icon pack license 是否随包携带。
- examples 是否声明 synthetic / redistributable policy。

### Tabler 图标包

运行时查询使用 bundled `assets/icons/tabler-icons.pack.br`。在 `pptx-nova/` 目录内刷新图标包时，
必须显式提供 Tabler checkout：

```bash
node scripts/pptx-nova-icons.mjs generate --source-root <tabler-icons-checkout>
node scripts/pptx-nova-icons.mjs generate --source-root <tabler-icons-checkout> --check
```

也可以设置：

```bash
TABLER_ICONS_ROOT=<tabler-icons-checkout>
```

不要在源码、manifest 或文档中保存维护者机器上的 Tabler checkout 绝对路径。
