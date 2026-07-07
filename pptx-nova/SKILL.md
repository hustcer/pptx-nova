---
name: pptx-nova
description: >
  Create and edit native editable PPTX decks with the local xdoc CLI.
  When the user wants to create, build, generate, modify, edit, refactor,
  rebrand, or fill a PowerPoint deck / slides / presentation / .pptx,
  including: 创建 PPT / 做 PPT / 生成演示文稿 / 修改 PPTX / 改一下幻灯片 /
  快速做一份 / 一句话生成 / 帮我快速出一版 / 简单提示词生成 / quick deck /
  reference deck style matching with a new outline, data-driven decks, brand
  checks, applying a corporate rebrand, creating or safely editing PPTX
  animations/transitions, exporting PDF/PNG previews. Triggers on .pptx filenames, words like
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

## xdoc 渐进式能力发现

每个 run 创建后先运行一次 `<skill-root>/scripts/pptx-nova-probe.mjs`，将结果保存为
`xdoc-capabilities.json`。标准 refurbish runner 会在自己的 run 目录内自动执行该 probe；
使用 `pptx-nova-refurbish-run.mjs` 时不要先手动初始化完整 run。若显式传 `--run-dir`，
目录必须是新目录、空目录，或只包含 `xdoc-capabilities.json` 的预探测目录。版本号只用于审计，
命令路由以运行时 schema 和实际 dry-run 证据为准。能力快照是名称索引，不是 allowlist；
未出现的能力表示 `undisclosed`，不能直接判定为 `unsupported`。

不确定时按需深入：先查 `xdoc-capabilities.json` 中的 op 索引；快照缺失或需要刷新时才用
`xdoc schema --index`。再用 `xdoc schema --op <name> --minimal` 查字段和 enum；
theme/style/native DeckKit 从快照对应 catalog 索引读取；selector 依次依据 inspect、目标
op schema 和 dry-run suggestions。`xdoc <command...> --help` 仅作补充，不要假设
`--help --json` 输出 JSON。
顶层 `xdoc convert` / `xdoc check` 也不能默认追加 `--json`：PPTX PNG 结构化预览优先用
`xdoc pptx preview --json`，单文件 preflight 结构化结果优先用 `xdoc check ... -o check.json`。
若当前 `xdoc-capabilities.json#capabilities.commandFlags` 或 `xdoc <command> --help` 披露
`--report`，只把它当 report/summary sidecar，不替代 `preview.json` 或单文件 `check.json`。
只有调用方显式要求 strict gate 且任务必需能力仍未披露时才阻塞；否则继续探索或走已有
fallback，不得因快照精简而禁用 xdoc 新能力。

### Run 复用与隔离

`.pptx-nova/<run>/` 可以作为历史证据读取，但不能自动成为当前任务的执行上下文。新任务、
旧反馈审计、工具能力排查、升级后复核，或用户质疑旧结果时，创建新的当前上下文；旧 run
只读用于解释当时发生了什么。

只有用户明确要求继续同一任务，且 source、输出目标和任务目标未变化时，才复用旧 run 执行。
即使复用，也先重新 probe 当前 `xdoc`；旧 `xdoc-capabilities.json` 只能说明当时披露了什么，
不能作为当前能力事实。开发、升级或恢复旧 run 时，凡涉及"能力缺失"判断，必须用当前
runtime/schema/help 反查后再下结论。

## 产物保留与清理策略

`.pptx-nova/<slug>-<timestamp>/` 是可审计 run 目录，不是普通缓存。任务完成后不要默认删除
整个 run 目录，也不要在最终回复前清理会影响复现、审计或继续编辑的证据。

默认保留最小证据包：`xdoc-capabilities.json`、`outline.json`、`deck_lock.json`、
`content.json`、`patch.json`、sidecar、dry-run/apply/refurbish 报告、`vision.json`、
`pptx-diff.json`、`visual_review.json`、`clean-open.json`、`check.json`、`evidence-summary.json`、
`layout-final.json`、`fidelity-gate.json`、`content-audit-final.json`、`i18n-text-plan.json`、
`i18n-scan.json`、`i18n-plan.json`、`i18n-style-diff.json`、
`translation-compare.png`、`translation-compare.json`、`refurbish-compare.png`、`refurbish-compare.json`、
最终候选 PPTX、contact sheet 和人工复核
必需的少量问题页 PNG、`replace-text.json`。实际不存在的项无需补造。

成功交付后可以瘦身当前 run 的可重建重型产物，例如全量逐页 PNG、重复导出目录、临时转换缓存、
调试日志、失败迭代的中间 PPTX 和不再引用的 scratch 文件；但必须保留 contact sheet、失败或可疑
页面的 PNG、最终候选、关键 JSON 报告和 sidecar。任务失败、被中断、验证未通过或用户可能继续排错时，
保留完整现场，不做自动瘦身。

清理只能作用于本次 run 的可重建产物。不得删除用户源 PPTX、最终输出、用户提供的资源文件、
参考模板、工作区外路径、整个 `.pptx-nova` 目录，或任何不是本 skill 当前 run 创建的内容。
跨 run 清理必须由用户显式要求，并先列出候选 run、清理范围和保留证据；建议只清理成功 run 中
超过 14 天的可重建重型产物，并保留每个 run 的最小证据包。

如果用户显式要求 `--cleanup`、"清理中间产物" 或等价指令，执行最小证据包保留策略，而不是删除
全部证据。如果用户要求 `--keep-all` 或需要 debug / 复现 / 继续编辑，保留全部产物。发生清理时写
`cleanup-manifest.json`，记录保留证据和删除的可重建产物类型。最终摘要必须说明 run 目录是否已瘦身、
保留了哪些关键证据、删除了哪类可重建产物；未执行清理时也要说清楚。

## 快速路径

先用下面的最短路径定向，再进入任务路由表读取细节。不要把它当成替代流程；它只是防止
简单任务被过度展开、复杂任务漏掉关键门禁。

- **新建 deck**：`outline.json -> deck_lock.json -> content.json -> pptx-nova-create-run -> PNG/contact-sheet review`。
- **修改 deck**：`inspect -> select(定位候选) -> patch -> dry-run -> resolvedSelectors -> apply 到 run 目录 -> changed-slide PNG review -> final output`。
- **动画 / 转场**：先 `inspect` 看 `timing_summary`、`animations[]` 和 `animation_capabilities`。新增或安全子集改动用
  `set-slide-animations` / `update-slide-animation` / `remove-slide-animation`；复杂 timing、media timing、interactive trigger、
  motion path、emphasis、chart/SmartArt build 默认 preserve-only，不用 raw XML 猜改。
- **PPTX 语义 diff / 变更审计**：当已有 source/candidate 且需要确认实际变更范围时，在候选稳定后低频运行一次
  `xdoc pptx diff --source source.pptx --candidate candidate.pptx --detail summary --json > <run-dir>/pptx-diff.json`。
  该命令通常耗时约 10 秒，不要放进每轮 patch 迭代；只有需要追查具体证据时再用 `--detail full`。
  只把 `agentGate`、`summary.reliableChanges`、`changeRollup.reliable` 和 `slides[]` 的可靠变更条目当作机器事实；
  `uncertain` / `unsupported` 是复核信号，不能当通过证据，仍需配合 preview、vision 或内容 audit。
- **PPTX PNG 预览 / 截图复核**：优先运行
  `xdoc pptx preview deck.pptx --output-dir <run-dir>/previews --contact-sheet <run-dir>/previews/contact-sheet.png --overwrite --json`
  生成逐页 PNG、contact sheet 和 `pptx-preview/v1` stdout manifest；如果输出目录在当前 run
  内且是本轮可重建预览，重跑时加 `--overwrite`。只复核改动页时加 `--slides 2,5-7`。
  读取 manifest 后确认 `status=success`、`pages[]` 的 path/status/width/height/byteLength/SHA-256
  hash、`contactSheet` 路径和尺寸，再把 contact sheet 或可疑页 PNG 交给多模态审查。PPTX 视觉预览默认用这条短路径；
  `xdoc convert --to png --contact-sheet` 仅作为通用转换或调试 fallback。
- **翻新已有 deck 且保持内容**：默认运行
  `node <skill-root>/scripts/pptx-nova-refurbish-run.mjs --deckkit <id> --source source.pptx --output out.pptx --json`
  一次执行 probe、plan、inspect、native/fallback 路线、机器门禁和 PNG/contact sheet 生成；用户显式指定非
  production/default DeckKit 时加 `--explicit`。runner 只在机器门禁通过后发布最终输出，成功状态仍是
  `needs-human-review`，必须打开 contact sheet/逐页 PNG 复核后才能交付。只想预检路线或调试低层命令时，
  再单独运行 `pptx-nova-refurbish-plan.mjs`。runner 默认优先运行
  `xdoc pptx refurbish-skin --source source.pptx --deckkit <id> --output out.pptx --json`；
  该命令会复制保留源 deck，替换旧 chrome/background，应用目标 DeckKit chrome，remap text/shapes/tables/charts，并运行
  `vision-diff` + native `refurbish-audit` gate。只有在目标 DeckKit 不支持 native skinning、需要跳过/定制 chrome-remove、
  或需要逐页局部 polish 时，才按计划退回 fallback。若 plan 返回 `manual-fallback` 或
  `explicit-manual-fallback`，先运行 `scripts/pptx-nova-refurbish-fallback-patch.mjs` 从
  `reference-inspect.json` 和 `chrome-detect.json` 生成 `patch.json`、`deck_lock.json`、
  baseline `content-audit.json` 和 `reference-map.json`，再 dry-run/apply；不要临场手写大批 selector ops。该通用 fallback
  适用于所有 DeckKit：优先使用 `refurbishProfile.fallback`，缺失时从 `visualGrammar`
  合成 palette/字体/对象保留策略；它默认保留源 slide 和可编辑对象，不截图化、不拆页。
  整 text frame 换字体/字号/颜色优先用 `set-text-style` / `set-shape-text-style`，不要为未知段落/run
  数量生成猜测性 `set-run` 队列。
  `contact-diff` 不再作为默认同步 gate；需要人工视觉复核时显式运行并保存并排 contact sheet。
  源 deck 是内容真源；默认保持页数和全部用户可见内容，任何拆页、合页、对象降级或内容丢失都必须先确认。
  翻新目标是"内容不变 + 目标 DeckKit 风格一致"：色系、字体层级、header/footer、页码、背景、规则线和 page chrome
  必须跟目标 DeckKit 对齐。
  "美化/翻新"同时要求可见视觉差异：不能只加页眉、细线、页码或轻量 chrome 后交付。
  源页 PNG/contact sheet 只能用于审计和对比，禁止把原页面整页截图嵌入输出页来替代可编辑重建。
  必要时可以复制原 slide 或原对象作为保真起点，再调整主题色、布局、header/footer 和目标 DeckKit chrome；
  复制对象仍必须是可编辑内容，不得变成源页截图或截图 overlay。
  只有当 skin-first 换肤后仍不可读、目标风格与源结构冲突、用户要求重排，或源对象无法安全保留且用户同意时，
  才进入从源内容抽取后 DeckKit 重建的 fallback。
  如果目标 DeckKit 缺少能承载源页内容的页型，必须扩展该 DeckKit 或阻塞说明缺口；不能为了套现有页型而压缩、
  改写、省略、合并或降级源内容。
  交付前运行 `xdoc pptx refurbish-audit` 生成 `content-audit-final.json`，用当前源/候选 PPTX
  自动检查页数、源文本、shape type、媒体、备注、外链和 reference-map 覆盖；仅在还需要 OOXML
  可见文本泄漏扫描或 forbidden shape name regex 时，再运行 `scripts/pptx-nova-refurbish-audit.mjs`
  作为 legacy supplemental audit。标准 runner 还会生成 `fidelity-gate.json` 汇总并加严
  `vision-diff`、`refurbish-audit` 和可用 `reference-map` 证据。最终翻新交付还必须生成
  `refurbish-compare.png`：单张图片包含全部 slides，左列为翻新前源稿，右列为翻新后交付稿，
  默认 192dpi；通过验证后必须把对比图复制到最终 PPTX 同目录，命名为
  `<output-stem>-refurbish-compare-<MMDDhhmmss>.png`。标准 runner 会自动运行
  `pptx-nova-compare.mjs --kind refurbish` 和 `pptx-nova-compare-gate.mjs --kind refurbish --publish`，
  并要求 `refurbish-compare-gate.json.status=pass`。
- **严格套模板**：复制或继承源 slide / placeholder，再编辑原对象；不重画一个"相似"页面。
- **导出 / 检查 / 提取**：创建 run 目录；PPTX PNG/contact-sheet 预览默认用
  `xdoc pptx preview`，PDF/MD/JSON/text 或非 PPTX 通用转换用 `xdoc convert`，检查用
  `xdoc check` / `xdoc pptx inspect`。无需读取创建型文档。
- **小改文字、备注、页脚或元数据**：只读 `common-workflow.md` 和
  `micro-edit-cheatsheet.md`，仍走 inspect、dry-run 和 selector 校验；不读取 DeckKit、设计锁、
  叙事质量或完整 edit 文档，除非 selector 模糊、涉及复杂对象或改动影响版式/品牌。
- **Studio / 高风险 deck**：用 `deck_lock.json` 锁定轻量确认、页级节奏、模板融合、资源状态和 chart/table 语义；
  用 `pptx-nova-finalize-evidence.mjs` 固化最终结构证据，不要引入 SVG-first 或逐页手写流程。

## Skill Root

将包含本 `SKILL.md` 的目录视为 `<skill-root>`。发布后的 skill 必须自包含：用户工作流
需要的脚本在 `<skill-root>/scripts/`，资产在 `<skill-root>/assets/`，
文档在 `<skill-root>/references/`，benchmark 在 `<skill-root>/benchmarks/`。

不要在 skill 用户路径里依赖仓库根 `tools/`、`Justfile` 或其他 skill 目录外文件。
仓库根工具只服务本仓库维护者。

## 直接支持的输入格式

创建或修改 PPTX 时，当前 skill 可直接消费这些输入：

- 自然语言 brief、聊天内容、已整理的大纲文本或 Markdown 大纲。
- HTML 文件、网页 URL、PDF：作为素材输入。先用 `xdoc html2md`（HTML/URL）或
  `xdoc pdf extract-text`（PDF）归一化为 Markdown/文本，再当作 brief 或大纲来源进入
  create / data / edit 管道；不是把网页或 PDF 一键变成成品 deck。摄取产物等同用户提供的
  brief，仍需走 outline → content → DeckKit → 验证。PDF 文本保真度因源文件而异（扫描件、
  嵌字异常会缺字或乱序），据此补全的事实必须写入 `deck_lock.assumptions[]`。把原始摄取
  结果存到 run 目录（如 `source_brief.md` / `source_extract.txt`），摄取细节见
  `references/common-workflow.md` 的 Source Ingestion。
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

| 用户意图                                          | 必读 reference                                                                                                                                                          | 视情况再读                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 简单 prompt / 要快 / 默认生成新 deck              | `references/common-workflow.md`、`references/deckkit-mode.md`、`references/create-express.md`                                                                           | `references/narrative-quality.md`（6+ 页或需要说服力时）、`references/express-mode.md`、`references/recipes.md`   |
| 投资人 / 客户 / 董事会 / Studio / 要精控          | `references/common-workflow.md`、`references/deckkit-mode.md`、`references/create-studio.md`、`references/design-lock-and-assets.md`、`references/narrative-quality.md` | `references/visual-qa-and-asset-slots.md`、`references/rich-deck-patterns.md`                                     |
| 严格跟随已有 PPTX 模板 / 套模板改内容             | `references/common-workflow.md`、`references/template-following.md`、`references/edit-mode.md`                                                                          | `references/design-lock-and-assets.md`、`references/inspect-and-edit.md`                                          |
| 参考 PPTX + 新大纲生成新 deck                     | `references/common-workflow.md`、`references/reference-create.md`、`references/deckkit-mode.md`                                                                         | `references/template-library.md`                                                                                  |
| 美化 / 翻新已有 PPTX，保持原内容但换风格          | `references/common-workflow.md`、`references/reference-create.md`、`references/deckkit-mode.md`                                                                         | `references/inspect-and-edit.md`、`references/export-and-check.md`                                                |
| 少量文字/备注/页脚/元数据小改                     | `references/common-workflow.md`、`references/micro-edit-cheatsheet.md`                                                                                                  | selector 模糊、复杂图片或多对象编辑时再读 `references/edit-mode.md`、`references/inspect-and-edit.md`             |
| 翻译已有 `.pptx` 并保持原版式                     | `references/common-workflow.md`、`references/edit-mode.md`、`references/inspect-and-edit.md`、`references/translation-mode.md`                                          | 图表/表格较多时读 `references/charts.md`、`references/tables.md`；只做检查时再读 `references/export-and-check.md` |
| 修改已有 `.pptx`                                  | `references/common-workflow.md`、`references/edit-mode.md`、`references/inspect-and-edit.md`                                                                            | `references/patch-ops-cheatsheet.md`                                                                              |
| 添加/修改/删除动画或转场                          | `references/common-workflow.md`、`references/edit-mode.md`、`references/animations.md`、`references/inspect-and-edit.md`                                                | `references/patch-ops-cheatsheet.md`、复杂 timing 时读 `references/control-flow-and-raw-xml.md` 仅作风险判断      |
| 数据 + 模板 / JSON 填充                           | `references/common-workflow.md`、`references/data-driven.md`                                                                                                            | `references/tables.md`、`references/charts.md`                                                                    |
| 品牌改装 / 品牌检查                               | `references/common-workflow.md`、`references/styles-and-themes.md`                                                                                                      | `references/template-library.md`                                                                                  |
| 只导出 PDF/PNG/MD/JSON、提取、检查或比较两个 PPTX | `references/common-workflow.md`、`references/export-and-check.md`                                                                                                       | 无需读取创建/编辑文档，除非用户随后要求修复                                                                       |
| 长任务 split / 继续生成                           | `references/common-workflow.md`、`references/resume-split-mode.md`                                                                                                      | 原任务类型的 reference                                                                                            |
| 公式、图表、表格、raw XML                         | 当前任务 reference + 对应 `formulas.md` / `charts.md` / `tables.md` / `control-flow-and-raw-xml.md`                                                                     | `troubleshooting.md`                                                                                              |

用户给 HTML 文件、网页 URL 或 PDF 作为素材时，先按 `references/common-workflow.md` 的
Source Ingestion 用 xdoc 归一化为 Markdown/文本，再按真正的任务类型（create / data / edit）
路由到上表对应 reference；摄取本身不改变目标任务类型。若用户只想把 HTML/URL/PDF 转成
Markdown/文本而不生成 deck，按 `references/export-and-check.md` 执行即可。

## 模式判断

- **Express**：用户要快、只给一句话、没有强调精控；默认 DeckKit-first 自动闭环，合理假设可直接继续。
- **Studio**：正式汇报、客户/投资人/董事会、品牌敏感、资源多、页数多、需要确认；先确认大纲和设计锁。
- **Template Following**：用户要求"套这个模板"、"严格按这份 PPT"、"保留模板版式/占位符/品牌 chrome"
  并替换内容；复制源 slide 或使用模板占位符，编辑 inherited objects，不重画一个"看起来像"的版本。
- **Reference Create**：用户给参考 PPTX，但要用新大纲或新内容生成新 deck；参考 deck 默认只读。
- **Refurbish Existing Deck**：用户要求"美化/翻新/重写这份 PPTX"且"内容不变/保持内容"，
  但指定新风格、DeckKit 或更高质量外观；源 PPTX 默认只读，先复制或保留源 slide/object 作为
  保真起点，再用 xdoc 的 chrome 与 remap 能力换成目标视觉系统。不要误判成普通 Edit，也不要为了
  保持原页数压缩文字导致不可读。
  翻新必须在内容不变的基础上采用目标 DeckKit 的风格，尤其保持目标色系一致；不能为了风格一致
  改写或删减内容，也不能为了内容保真而完全保留原 deck 的视觉系统。
  "内容不变"默认包含文本、表格、chart、SmartArt、图片、图标、媒体、备注和页级结构的用户可见语义；
  不能保真时必须阻塞并请求确认，不能静默丢弃或只保留可见文本。
  翻新输出默认必须是可编辑对象重建：不能把源 slide 的渲染截图、整页图片或截图面板当作内容保留策略。
  允许把原 slide 或原对象复制到输出 deck 作为保真起点，但随后必须重新主题化：映射到目标 DeckKit
  palette、字体层级、header/footer、页码、背景和 chrome；不要把原 deck 的色系和页眉页脚原样带入。
  当前优先使用 `xdoc pptx refurbish-skin --source source.pptx --deckkit <id> --output out.pptx --json`
  执行 skin-first 流程；它会内置旧 chrome 替换、DeckKit 背景、remap、vision-diff、refurbish-audit
  和 fidelity gate。
  手工串联 `chrome-detect` / `chrome-remove` / `remap-theme` / `chrome-apply` 只作为 fallback 或局部修复路径。
  运行前先确认当前 xdoc 版本真的支持目标 DeckKit 的 `refurbish-skin` / `chrome-apply` native skinning
  和对应 `remap-theme` alias；如果用户显式指定的 DeckKit 还不是 delivery-ready，或 CLI 只支持部分
  DeckKit chrome，不要静默改用其它风格。记录 readiness/CLI 限制后，改用 `apply-brand` +
  inspect 驱动的批量 patch 显式实现目标 palette、字体、背景、规则线和页码 chrome。
  `remap-theme` 已可覆盖 text、shapes、tables、charts 的 MVP 换肤，并通过 dry-run 报告对象级
  changed/skipped/unsupported/preserved；这些报告要用于判断旧风格残留，而不是只看最终文件。
  从零重建只是 fallback：源页本身不可读、用户明确要求重排/拆合页、skin-first 无法达到目标风格，
  或对象无法安全保留且用户同意可编辑重建时才使用。
  目标 DeckKit 缺少合适页型时，应先扩展 DeckKit 的可复用页型/组件/slot contract，再继续生成；
  不允许为了适配现有 DeckKit 而削足适履，导致内容、省略项、对象语义或可编辑性发生变化。
  如果用户认可了某个预览页或小样，后续全量输出必须以该小样作为视觉目标，而不是退回保守保真版本。
  全量候选需要人工视觉复核时，显式运行 `xdoc pptx contact-diff` 和源稿并排复核：大多数页面应有明确的版式、层级、留白、网格或色彩变化；
  若肉眼看起来"基本没变"，视为未完成，即使 check-lock 和 vision-check 通过。
  候选稳定后运行一次 `xdoc pptx diff` 保存 `pptx-diff.json`，用可靠语义变更核对预期的文本、几何、样式、
  表格/chart/media 摘要变化；`uncertain` 或 `unsupported` 只能说明需要人工/专项 audit，不能证明保真。
  同时必须运行 `xdoc pptx vision-diff` 做 delta 判断；源稿已有 high/medium 不等于可忽略，
  但候选不得新增 high；由本轮新增 chrome、背景、页码、文字颜色或布局造成的 medium 必须迭代修复到 0。
  只有无法不改变源内容语义时，才可把新增 medium 作为已复核风险列入最终摘要。
  最终必须运行 `xdoc pptx refurbish-audit`，确认 slide count、源文本、媒体、备注、外链和
  shape type 没有未经批准的减少；如果原生命令崩溃、空输出或非零退出，记录 exit/stderr，
  再运行 legacy supplemental audit 和 inspect 数量/文本对账，且最终摘要必须说明 native audit
  未通过工具层面执行。不要用移出画布、截图 overlay 或清空未重建文本来隐藏旧内容。
- **Edit**：用户明确要在已有 PPTX 上改文字、样式、图表、图片、表格、页或备注；先 inspect 再 patch。
- **Translation Mode**：用户要求翻译已有 PPTX 并保持原版式；默认先复制源 deck，再在副本上原位替换
  可见文本。必须保留粗体、斜体、下划线、删除线、对齐、段落属性、文本框属性、表格/chart 样式和动画；
  版式修复顺序必须是先压缩译文，再小幅调整字体大小，最后才在确有可用空白时小幅调整几何尺寸。
  几何调整不得造成 shape 重叠、贴边、节奏拥挤或相邻对象间距异常，且必须通过 `vision-diff`、PNG/contact sheet
  和审计记录证明。必须额外抽取 shape/table/chart 可见文本、生成中英对照和样式签名审计、
  做源稿/译稿 `vision-diff` 新增问题 gate、contact-diff 和高 DPI 全量逐页并排对比图，并以版式一致性
  作为交付门禁。最终翻译交付除译后 PPTX 外，必须额外交付 `translation-compare.png`：单张图片包含
  全部 slides，左列为翻译前源稿，右列为对应译稿，默认 192dpi；如需更高视觉保真度应增加 `--dpi` 而非事后放大。
  通过验证后，除保留 run 目录内的 `translation-compare.png` / `.json` 证据外，还必须把对比图复制到最终
  PPTX 同目录，命名为 `<output-stem>-translation-compare-<MMDDhhmmss>.png`，方便用户及时发现和检查；
  交付前运行 `pptx-nova-compare-gate.mjs --kind translation --publish` 并要求
  `translation-compare-gate.json.status=pass`。
- **Animation Edit**：用户要求动画、出现顺序、点击/自动播放、with previous / after previous、逐条 bullet、退出动画、
  motion path、emphasis 或 slide transition；读 `animations.md`，只编辑 xdoc 标记为 editable 的安全子集。
- **Micro Edit**：只改少量文字、备注、页脚或元数据；走 `micro-edit-cheatsheet.md` 的一屏路径，
  保持 inspect、dry-run、`resolvedSelectors[]` 和 run-dir 副本门禁，但避免加载创建型和普通 Edit
  重文档。
- **Data-driven**：用户有模板和 JSON/CSV/表格数据，要批量填充或绑定数据。
- **Export/Check**：只转换、预览、提取或检查，不修改 PPTX。

## Feedback 模式

如果用户 prompt 中包含 `need feedback`、`给反馈`、`需要反馈`、`有什么使用反馈` 等明确反馈意图，
读取 `references/feedback-mode.md`。一旦触发 Feedback 模式，必须先写入当前 run 目录的
`skill-feedback.md`。反馈少于或等于 3 条时，最终回复可以同时给出文件路径并在会话中显示
反馈详情；超过 3 条、需要证据或需要分优先级时，最终回复只给出反馈文件路径，不重复粘贴全文。
最终回复前必须运行反馈门禁：若原 prompt 可用，用
`node <skill-root>/scripts/pptx-nova-feedback-gate.mjs --run-dir <run-dir> --prompt-file <prompt.txt> --strict --overwrite --json > <run-dir>/feedback-gate.json`；
若 prompt 未保存但已知用户要求反馈，用 `--require-feedback`。门禁失败时先补真实反馈，不发送最终回复。

## 创建型公共红线

这些规则适用于所有新建 deck，包括 Express 和 Studio：

- 先生成或标准化 `outline.json`，再写 `deck_lock.json`，不要从 prompt 直接跳到 patch。
- 默认走 DeckKit-first：`content.json -> DeckKit -> patch -> xdoc -> PPTX -> validation`。
- 正式汇报、客户/投资人/董事会/路演/策略/product-platform 等说服型 deck 必须读取
  `references/narrative-quality.md`，在 `deck_lock.json` 中锁定 `deckProfile`、每页
  `claimTitle` / `proofObject` / `rhythm` / `layoutIntent` / `visualDensity`，并在 PNG
  复核后写 `narrative_quality_review.json`。
- 写 `content.json` 或手工 patch 前，先按页对照 `deck_lock.slides[]`，确认页型、节奏、
  结构意图、密度和证明对象没有靠记忆漂移；发现不匹配时先改 lock 或内容源，不在 patch
  里临时补救。
- 非 appendix 页应有明确观点或方向；展示主标题/副标题优先短、可扫读并适配 DeckKit 槽位，
  避免纯 `产品概览`、`市场分析`、`路线图` 这类 topic label。完整结论写入 `claimTitle`，
  必要时拆到 subtitle、callout 或 `proofObject`，不要为了结论化牺牲布局。
- 主标题和副标题默认不使用句末句号；问号/感叹号只在语气或互动意图明确时使用。
- 如果用户给定的大纲已经明确指定主标题或副标题，指定文案优先；不要为了改成结论句、
  缩短或去句号而静默改写。把来源写入 `titleSource: "user"` / `subtitleSource: "user"`，
  只有在硬性版式溢出或用户要求润色时才调整，并说明 tradeoff。
- 交付型自动选择只允许 `readiness in ["production", "default"]` 的 DeckKit。
- 有生产/默认 DeckKit 可用时，不使用 `deck-generator-template.mjs` 作为交付默认路径。
- 没有可用 DeckKit、缺页型或要改组件结构时，先创建/扩展 DeckKit，再交付。
- 参考模板、品牌或布局时，按 `brand` / `layout` / `deck` 语义分层写入
  `deck_lock.templateFusion`；冲突和 override 不在 generator 中临时猜。
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
- 不要靠猜 selector 修改对象。目标对象不明确时先用
  `xdoc pptx select input.pptx --query '{"textRegex":"..."}' --json` 或 query 文件缩小候选，
  再写 patch。检查 dry-run 的 `resolvedSelectors[]`，歧义时使用
  `suggestions[].fixPatch` 后重试。
- 严格模板跟随时，必须编辑 copied / inherited 对象或模板 placeholder；不要用新 textbox、
  半透明矩形或整页图片 overlay 掩盖旧内容来制造"看起来对"的页面。
- 复制源 slide 或填模板时，空结构 placeholder（title/body/dt/sldNum/ftr 等）也必须显式填充或删除；
  不能因为 PNG 里看不见就保留 PowerPoint 编辑态的空占位符。
- logo、客户 mark、产品截图、人物照片、App icon、第三方品牌图形等身份资产必须来自用户提供、
  源 deck 允许复用、官方可验证来源或已登记授权；无法确认时用文字/原生 shape 代替，不生成伪官方素材。
- 使用外部、复用、生成或公式资产时，`assets_manifest.json` 必须记录 `status`、
  `source.kind`、`licenseRisk` 和 PPTX 使用槽位；`missing` / `needs-user` /
  `forbidden` 阻塞交付。
- 如果用户要求原地修改，也先在 run 目录完成验证，再按用户明确意图写回。
- 对 SmartArt、宏、复杂动画、unsupported 对象优先 preserve；动画只在 `inspect.animations[].editable`
  或当前 schema 明确支持的创建安全子集内编辑，不能编辑时说明边界。
- **PowerPoint Repair 是交付阻断问题**：任何候选 PPTX 在 PowerPoint 中出现
  "PowerPoint found a problem with content"、`Repair` 按钮、打开后自动修复、或等价损坏提示，
  都视为失败候选，不能交付，也不能把 PowerPoint 修复后的文件当作无根因的最终产物。
  必须保留触发问题的候选 PPTX、patch、dry-run/apply 报告和最小复现证据，定位到具体 op /
  OOXML part / 结构顺序后再生成新候选。
- 对 chart、table、raw OOXML、关系包、嵌入 workbook、主题/样式等高风险修改，`xdoc check`、
  `vision-check` 和 PNG 预览不能单独作为结构安全证明；还要做 OPC/OOXML 结构校验，例如
  `unzip -t`、XML well-formed 检查、专项语义审计（chart axis/legend/data-label/gridline
  子元素顺序、关系目标、embedded workbook 同步等）。发现 op 对某类输入会生成 PowerPoint
  Repair 文件时，正确行为是在 xdoc/pptx-gen 源头让该 op 报错，而不是生成有问题的内容。

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
- 主标题和副标题不应为了表达完整句子而破坏版式；句末句号默认移除，过长内容拆到
  subtitle、callout、正文或 notes。
- 将 PPTX 转成 PNG/PDF 或检查生成的 PPTX 时，可能出现 `XDOC DEMO` 等工具水印；这类水印通常只在
  slide 右上角出现，可在人工视觉复核中忽略，不应当作 DeckKit 构图、遮挡或内容缺陷处理。
- 凡是需要以 PowerPoint 显示效果为准进行截图、预览、并排对比或视觉验证时，优先使用
  `nu tools/pptx-snapshot.nu ... --method pdf-render`。只有 `pdf-render` 失败并保留失败
  JSON/stderr 证据后，才允许退回 `--method window`；不要把用户说的"PowerPoint 截图"理解成
  默认使用窗口模式截图。

PNG/contact-sheet 复核要按找问题的心态做，而不是确认成功。机器门禁不能看出所有像素级缺陷，
尤其要检查：

- 对翻新 deck，先问一个更直接的问题：不看文件名时，这份输出是否明显是重新设计过的版本？
  若只是原稿加线、加页码、加浅色背景或局部 accent，不能交付为"翻新/美化"。
- 标题换行后是否撞到装饰、分隔线、页眉或 logo。
- 正文、来源、脚注、图例、表格单元格是否被截断、重叠或贴边。
- 相邻卡片、列、图标圆、编号圆、箭头和连接线是否对齐，间距是否忽大忽小。
- 深浅背景上的文字、图标、边框和网格线是否有足够对比。
- 模板页是否残留 placeholder、旧页脚、旧日期、旧页码、空图框或看不见但可编辑的空对象。
- 多页 contact sheet 是否出现重复的版式节奏、无意义装饰容器、topic-only 标题或突兀留白。
- chart/table 页是否通过专项语义检查：数据维度、系列/类目、legend/label、table 行列和
  绑定来源必须与内容一致，再看 PNG 是否遮挡。
- 对可交付 PPTX，尤其是正式/企业用户、图表/表格/OOXML 高风险变更，若当前环境是 macOS
  且本机有 Microsoft PowerPoint for Mac，必须运行 clean-open smoke gate：
  `node <skill-root>/scripts/pptx-nova-clean-open.mjs --pptx out.pptx --output <run-dir>/clean-open.json --json`。
  live clean-open helper 仅支持 macOS + PowerPoint for Mac + `osascript`/System Events；Windows/Linux
  不运行等价 PowerPoint clean-open。macOS 没有 PowerPoint、缺 `osascript` 或没有 UI scripting
  权限时，helper 返回 `status: "skipped"` 且不阻塞交付；最终摘要必须明确说明 clean-open gate
  未运行，并列出已执行的替代结构校验。该 helper 会把文件暂存到 PowerPoint sandbox、自动打开候选并通过
  System Events 检查 Repair 类 modal。只检查 presentation 对象是否打开不够，因为 PowerPoint
  可能同时打开对象并弹出 Repair 对话。普通 `Cancel` 按钮不是失败；只有 Repair 文案、`Repair`/`修复`
  按钮或等价修复提示才是阻断。`--classify-ui` 只用于离线 UI snapshot 分类测试，可跨平台运行。

## 必经验证

创建或视觉上明显修改 deck 时，按此顺序收尾：

```text
check-lock -> dry-run -> apply -> vision-check -> structure-check when needed -> high-risk evidence finalizer when required -> PNG/contact-sheet review -> visual_review.json -> clean-open gate when available/high-risk -> narrative quality review when required -> optional xdoc check
```

Refurbish Existing Deck 还必须追加：

```text
refurbish-skin report gate -> one final pptx semantic diff when source/candidate are stable -> refurbish-compare delivery gate -> optional contact-diff for manual review -> optional legacy supplemental audit
```

动画、结构或兼容性高风险任务还必须追加：

```text
OPC zip check -> XML well-formed check -> targeted OOXML semantic audit -> PowerPoint clean-open smoke gate when available
```

若任一门禁发现 PowerPoint Repair、OOXML 子元素顺序错误、关系目标缺失、embedded workbook
与 chart cache 不一致、动画 timing tree 损坏、或 op 对输入组合生成损坏内容，停止交付；
先修 xdoc/pptx-gen 源头并补回归测试。
回归测试应覆盖失败前会生成坏文件的场景，并断言修复后要么生成结构合法文件，要么在 op 层返回清晰错误。

只导出或检查文件时，按 `export-and-check.md` 执行即可。

## 常用命令入口

按需读取 reference 后再使用具体命令。以下只作为入口提醒：

```bash
xdoc html2md page.html -o source_brief.md             # HTML 文件 / URL → Markdown 素材
xdoc pdf extract-text input.pdf -o source_extract.txt # PDF → 文本素材
node <skill-root>/scripts/pptx-nova-create-run.mjs --deckkit <id> --content content.json --lock deck_lock.json --output out.pptx --run-dir <run-dir> --json
xdoc pptx inspect input.pptx --daemon --json
xdoc pptx select input.pptx --query '{"textRegex":"Revenue"}' --json
xdoc pptx select input.pptx --query query.json --slides 1,3-5 --json
xdoc pptx apply -p patch.json -i input.pptx -o out.pptx --dry-run --json
xdoc pptx apply -p patch.json -i input.pptx -o out.pptx --json
xdoc schema --op set-slide-animations --minimal
xdoc schema --op update-slide-animation --minimal
xdoc schema --op remove-slide-animation --minimal
xdoc pptx vision-check out.pptx --json
xdoc pptx vision-check out.pptx --slides 25-38 --json
xdoc pptx chrome-detect source.pptx --json
xdoc pptx chrome-remove source.pptx --roles header,footer,page-number,rule --output clean.pptx --json
xdoc pptx remap-theme clean.pptx --to corporate-blue --scope text,shapes,tables,charts --output remapped.pptx --dry-run --json
xdoc pptx remap-theme clean.pptx --to corporate-blue --scope text,shapes,tables,charts --output remapped.pptx --json
xdoc pptx chrome-apply remapped.pptx --deckkit mckinsey-blue --output styled.pptx --json
xdoc pptx refurbish-skin --source source.pptx --deckkit mckinsey-blue --output out.pptx --json
xdoc pptx diff --source source.pptx --candidate out.pptx --detail summary --json
xdoc pptx i18n-plan --source source.pptx --units i18n-scan-source.json --data translations.json --json
xdoc pptx i18n-text-plan --source source.pptx --data translations.json --json
xdoc pptx i18n-scan --source source.pptx --source-lang multi --mode source --json
xdoc pptx i18n-scan --source translated.pptx --source-lang multi --mode candidate --json
xdoc pptx replace-text --source source.pptx --data replacements.json --output updated.pptx --json
xdoc pptx replace-chart-text --source source.pptx --data chart-replacements.json --output updated.pptx --visible-cache-only --json
xdoc pptx i18n-style-diff --source source.pptx --candidate translated.pptx --json
xdoc pptx i18n-style-diff --source source.pptx --candidate translated.pptx --allow-text-attrs tooltip,descr,title --json
xdoc pptx vision-diff --source source.pptx --candidate out.pptx --json
xdoc pptx vision-diff --source source.pptx --candidate out.pptx --slides 25-38 --json
xdoc pptx contact-diff --source source.pptx --candidate out.pptx --output <run-dir>/contact-diff.png --json
xdoc pptx contact-diff --source source.pptx --candidate out.pptx --slides 25-38 --output <run-dir>/contact-diff.png --json
node <skill-root>/scripts/pptx-nova-compare.mjs --source source.pptx --candidate translated.pptx --run-dir <run-dir> --kind translation --output <run-dir>/translation-compare.png --report <run-dir>/translation-compare.json --dpi 192 --json
node <skill-root>/scripts/pptx-nova-compare-gate.mjs --run-dir <run-dir> --final-pptx translated.pptx --kind translation --publish --overwrite --json > <run-dir>/translation-compare-gate.json
node <skill-root>/scripts/pptx-nova-compare.mjs --source source.pptx --candidate refurbished.pptx --run-dir <run-dir> --kind refurbish --output <run-dir>/refurbish-compare.png --report <run-dir>/refurbish-compare.json --dpi 192 --json
node <skill-root>/scripts/pptx-nova-compare-gate.mjs --run-dir <run-dir> --final-pptx refurbished.pptx --kind refurbish --publish --overwrite --json > <run-dir>/refurbish-compare-gate.json
xdoc pptx refurbish-audit --source source.pptx --final out.pptx --map <run-dir>/reference-map.json --json
xdoc pptx preview out.pptx --output-dir <run-dir>/previews --contact-sheet <run-dir>/previews/contact-sheet.png --overwrite --json
xdoc pptx preview out.pptx --slides 25-38 --output-dir <run-dir>/previews --contact-sheet <run-dir>/previews/contact-sheet.png --overwrite --json
xdoc convert out.pptx --to png -o <run-dir>/previews --overwrite --contact-sheet # fallback/debug only
node <skill-root>/scripts/pptx-nova-clean-open.mjs --pptx out.pptx --output <run-dir>/clean-open.json --json
xdoc check out.pptx --checks fonts,links,compat -o check.json --pretty --overwrite
node <skill-root>/scripts/pptx-nova-feedback-gate.mjs --run-dir <run-dir> --require-feedback --strict --overwrite --json > <run-dir>/feedback-gate.json
```

## 完成摘要

成功生成、修改、导出或检查后，最终回复按 4 块压缩，避免把完整 checklist 倒给用户：

1. **输出**：最终 PPTX/导出文件绝对路径 + run 目录；翻译任务同时列出最终 PPTX 同目录的
   `<output-stem>-translation-compare-<MMDDhhmmss>.png` 和 run 目录内的 `translation-compare.png`；
   翻新任务同时列出最终 PPTX 同目录的
   `<output-stem>-refurbish-compare-<MMDDhhmmss>.png` 和 run 目录内的 `refurbish-compare.png`；
   同目录 PNG 必须由对应 `*-compare-gate.json.status=pass` 证明。
2. **验证**：一行列出实际执行的关键 gate 及状态，例如
   `dry-run pass; apply pass; vision high=0 medium=0; preview reviewed; clean-open not run`。
3. **证据**：只列最关键 3-6 个 artifact，例如 `patch.json`、`vision.json`、
   preview manifest/contact sheet、`pptx-diff.json`、`evidence-summary.json`；不存在的不补列。
4. **风险/后续**：只写仍需用户知道的事项，例如 clean-open 未运行、字体未嵌入、外链、
   unsupported 对象、人工未审资源授权、AI 事实性 assumptions，或无剩余风险。

条件性补充只在相关时出现：高风险任务列 `evidence-summary.json` / `layout-final.json`；
图表/表格/XML 风险列专项审计；翻新/严格套模板列 fidelity/template/content audit；
正式说服型 deck 列叙事质量结论；发生清理时说明保留证据和删除的可重建产物；触发
Feedback 模式时按 `references/feedback-mode.md` 保存反馈，并列出 `skill-feedback.md`
路径；反馈少于或等于 3 条时可同时展示详情，超过 3 条时只列路径；同时保留
`feedback-gate.json`。不要输出 xdoc 版本、
CLI schema、能力披露等审计细节，除非它影响结果、使用了 fallback，或用户明确要求。

只有平台或工具给出准确 token 统计时才输出 token 信息；不要估算。

## Reference 索引

优先读路由要求的文件，不要一次性读取全部 reference。

| 文件                                      | 用途                                                             |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `references/common-workflow.md`           | run 目录、输出防碰撞、产物保留/清理、公共流程                    |
| `references/deckkit-mode.md`              | DeckKit 选择、readiness、content、用户可见 examples              |
| `references/create-express.md`            | 简单 prompt 快速生成 deck                                        |
| `references/create-studio.md`             | 高风险/正式/精控 deck 的确认、设计锁和 split                     |
| `references/edit-mode.md`                 | 修改已有 PPTX 的 inspect/dry-run/selector 流程                   |
| `references/micro-edit-cheatsheet.md`     | 少量文字、备注、页脚、元数据和单对象小改的极速路径               |
| `references/translation-mode.md`          | 翻译已有 PPTX、可见文本覆盖、中英对照和版式一致性视觉门禁        |
| `references/feedback-mode.md`             | SKILL 使用反馈、旧 run 反馈审计和反馈落盘规则                    |
| `references/template-following.md`        | 严格套模板：复制源 slide、编辑 inherited objects、placeholder QA |
| `references/export-and-check.md`          | PDF/PNG/MD/JSON 导出、extract、check、PPTX semantic diff         |
| `references/express-mode.md`              | Express 模式完整黄金路径                                         |
| `references/reference-create.md`          | 参考 PPTX + 新大纲生成                                           |
| `references/inspect-and-edit.md`          | selector、inspect 输出和编辑细节                                 |
| `references/design-lock-and-assets.md`    | `deck_lock.json`、`assets_manifest.json`、check-lock             |
| `references/narrative-quality.md`         | deck profile、claim spine、contact-sheet plan、comeback review   |
| `references/patch-ops-cheatsheet.md`      | patch op 速查                                                    |
| `references/animations.md`                | PPTX 动画/转场创建、安全编辑、preserve-only 边界和验证           |
| `references/recipes.md`                   | recipe op schema 和示例                                          |
| `references/charts.md`                    | chart 创建/编辑和 OOXML chart 语义                               |
| `references/tables.md`                    | table 创建/编辑、CSV、公式                                       |
| `references/formulas.md`                  | LaTeX/数学公式策略和 formula assets                              |
| `references/styles-and-themes.md`         | 颜色、渐变、字体、主题、母版                                     |
| `references/data-driven.md`               | `from-data` 和 `bind-data`                                       |
| `references/rich-deck-patterns.md`        | 无合适 DeckKit 时的丰富视觉模式                                  |
| `references/schema-discovery.md`          | xdoc schema / dry-run --explain 的渐进式能力发现                 |
| `references/visual-qa-and-asset-slots.md` | 图片槽位、AI 图片 prompt guard、P0/P1 QA                         |
| `references/deck-generator-workflow.md`   | 创建或扩展 DeckKit                                               |
| `references/template-library.md`          | brand/layout/deck/chart/icon catalog 融合                        |
| `references/resume-split-mode.md`         | split handoff 和继续生成                                         |
| `references/control-flow-and-raw-xml.md`  | `if` / `foreach` / `try` / raw OOXML                             |
| `references/daemon-sessions.md`           | daemon 调优和故障排查                                            |
| `references/troubleshooting.md`           | 常见错误与自动修复建议                                           |
