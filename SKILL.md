---
name: deckkit-maker
description: >
  从参考 .pptx 文件为 pptx-nova SKILL 创建新的 DeckKit（开发者侧 skill，操作
  skills/pptx-nova/ 源码）。当用户提供一个参考 .pptx 文件和新 DeckKit 的名字，
  要求"创建 DeckKit / 新增 DeckKit / 把这个 pptx 做成 DeckKit / 复刻这个 pptx
  的风格做成套件 / 模仿这个 deck 新建 DeckKit" 时触发。两阶段工作流：
  第一阶段对参考 deck 做高保真重建（保留所有 slides、风格、主题、内容可照搬），
  第二阶段组件化抽象为 <id>.kit.mjs + schema + catalog + benchmark 并走 readiness
  流程。不要把本 skill 用于普通交付型 deck 生成——那是 pptx-nova 的 DeckKit 模式。
---

# deckkit-maker

从一个参考 `.pptx` 文件出发，为 pptx-nova 创建新的 DeckKit。目标是让以后的 Agent
能用 `content.json → DeckKit → patch → xdoc` 稳定高效地产出同主题、同质量的 PPTX。

本 skill 是 **开发者侧** skill：它修改 `skills/pptx-nova/` 源码，可以使用仓库根
`tools/`、`Justfile` 等 developer-only 工具链；但写进 pptx-nova 的任何用户路径
（kit、schema、scripts、references）必须保持 skill 自包含，不得依赖 skill 目录外文件。

## 输入

用户会提供：

1. **参考 `.pptx` 文件路径** —— 风格、主题、模板、内容的唯一事实来源。参考文件只读。
2. **新 DeckKit 的名字** —— kebab-case id（如 `swiss-grid`、`consulting-dark`）。

如果两者缺一，先向用户索取，不要自己猜测或挑选文件。

## 前置阅读（必读，按序）

1. `skills/pptx-nova/SKILL.md` —— pptx-nova 路由与红线
2. `docs/skill-dev-guide.md` —— §3 术语（DeckKit / content 契约 / content leak 防线 /
   字符串分层规则 / 新增 DeckKit 准入标准）、§4 开发流程、§5 benchmark 与 readiness
3. `skills/pptx-nova/assets/deckkits/README.md` —— core-primitives 职责边界、冻结准入
4. `skills/pptx-nova/references/deck-generator-workflow.md` —— 探索生成器方法与避坑

已有先例：`swiss-grid` DeckKit 即从 `demos/67-swiss-grid-systems.pptx` 复刻而来
（见 catalog `knownLimits`），本 skill 把这条路径固化为标准流程。

## 两阶段总览

```text
参考 .pptx + 新 DeckKit 名字
  │
  ├─ Phase 0  分析参考 deck            → references/analyze-reference.md
  │    unpack → 参考 PNG 基准 → style-spec.md + slide-inventory.md
  │
  ├─ Phase 1  高保真重建（第一交付物）  → references/rebuild-high-fidelity.md
  │    探索生成器 generate.mjs → 重建全部 slides → 逐页与参考 PNG 对比
  │    门禁：dry-run 无阻塞 + vision-check high/medium=0 + 逐页人工对比通过
  │
  └─ Phase 2  组件化抽象（第二交付物）  → references/componentize.md
       抽 <id>.kit.mjs + schemas + content.json + catalog 注册
       → slots/slot-consistency → benchmark(golden/stress/mixed-language)
       → validation tests + content leak regression → readiness audit
```

**先完成并验收 Phase 1，再开始 Phase 2。** 高保真重建是组件化的证据基础：没有逐页
对比通过的重建产物，就没有资格冻结 kit。两阶段的产物都保留在 run 目录中。

## 不可跳过的红线

- **core-primitives 只读为默认**。`core-primitives.kit.mjs` 不承担任何 DeckKit 专属
  风格。只有当一段逻辑"换了主题色/间距后仍然正确"且至少有跨 kit 复用证据时，才考虑
  下沉；下沉前必须与用户确认，并跑全部现有 DeckKit 的 validation tests。
- **参考 pptx 只读**。所有分析在 `.tmp-slides/`（unpack 输出）和 run 目录中进行。
- **content leak 防线**（详见 `docs/skill-dev-guide.md` §3 字符串分层规则）：
  `.kit.mjs` 只冻结视觉语言、几何、chrome、结构标签；参考 deck 的业务文案
  （标题、观点、指标、实体、年份、来源、callout 强调词）最终只能进入
  `content.json` / examples / benchmark fixture。Phase 1 的探索生成器里可以暂时
  内联内容，Phase 2 抽取时必须全部移出。反例教训：swiss-grid 早期把
  `'Aa'`、`'所有距离的最小公因子'` 等示例内容硬编码进页型，导致三个版型跨主题不可复用。
- **坐标必须推导**：所有 op 坐标走 primitives（`nm()`/`grid()`/`txH()`）或显式
  bounds 计算，不凭目测摆放。幕布 13.333in × 7.5in。
- **图标只用 pptx-nova 现有 Tabler pack**：用
  `node skills/pptx-nova/scripts/pptx-nova-icons.mjs search <query> --json` 查询、
  `createOps().icon()` 内联。参考 deck 中的图标/装饰图找最接近的 Tabler 替代；
  不联网取图，不把参考 deck 的位图直接打进 kit。
- **视觉门禁**：每次 build 走
  `dry-run → apply → vision-check(high/medium=0) → PNG/contact-sheet 人工逐页`。
  dry-run 与 vision-check 的溢出估算阈值不同，两个都要跑。
- **字号下限**：正文 ≥10.5pt；label/badge/chart/table ≥9pt；页脚/来源 8.5–9pt。
  若参考 deck 本身使用更小的风格字号（如 Swiss 标签），在 catalog
  `qualityProfile` 中声明并说明理由，不要静默违反。
- **readiness 不跳级**：新 kit 从 `experimental` 起步，benchmark 通过后
  `candidate`；`production` 必须 benchmark + 人工 PNG review +
  `--confirm-manual-png-review`。本 skill 默认推进到 `candidate`，
  promotion 到 `production` 需用户确认。

## 长任务管理

本任务通常跨 50+ 工具调用，建议配合 planning-with-files SKILL：开工即建
`task_plan.md` / `findings.md` / `progress.md`，把风格提取结论、逐页对比结果、
踩坑记录及时落盘。需要深入读取参考 pptx 内部 XML 之外的内容（如嵌入对象）时，
可借助 pptx SKILL。

## Run 目录约定

```text
.tmp-deckkit-<id>/
├── ref-previews/          # 参考 deck PNG 基准（contact-sheet + 逐页）
├── style-spec.md          # Phase 0 风格提取结论
├── slide-inventory.md     # Phase 0 逐页清单与页型归并
├── generate.mjs           # Phase 1 探索生成器
├── patch.json / out.pptx / dry-run.json / vision.json
├── previews/              # 重建 deck PNG（每次重渲前 rm -rf）
└── compare-notes.md       # Phase 1 逐页对比记录
```

`.tmp-deckkit-*` 与 `.tmp-slides/` 均不提交。Phase 2 的正式产物写入
`skills/pptx-nova/`（kit、schema、catalog、examples、benchmark、tests）。

## 完成摘要

任务结束时最终回复必须列出：

- 新 DeckKit id、版本、readiness 结论与 catalog 路径
- Phase 1 重建 deck 路径与逐页对比结论（保留页数 / 参考页数）
- Phase 2 落盘文件清单（kit / schemas / content / catalog / benchmark / tests）
- 验证结果：validate-content、dry-run、vision-check、slot-consistency、
  benchmark summary、readiness audit
- 与参考 deck 的已知差异（字体替代、图标替代、未还原元素）逐条披露
- 是否动了 core-primitives；若动了，列出改动与全量 DeckKit 回归结果

## Reference 索引

| 文件                                  | 用途                                               |
| ------------------------------------- | -------------------------------------------------- |
| `references/analyze-reference.md`     | Phase 0：解包、PNG 基准、风格提取、页型归并        |
| `references/rebuild-high-fidelity.md` | Phase 1：探索生成器、逐页重建与对比循环、避坑清单  |
| `references/componentize.md`          | Phase 2：抽 kit/schema/catalog/benchmark/readiness |
