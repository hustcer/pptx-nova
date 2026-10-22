# Cartesian 2.0 迁移与验收记录

日期：2026-10-22。`cartesian` 已从 0.3.1 / production 迁为 **2.0.0 / candidate**。
起点为 `33cf03a`；本次只清理 Cartesian 的旧创建路径，未宣称全部旧 DeckKit 已退役。
依据：[设计语言评估](design-language-contract-evaluation.md)、[清理方案](legacy-deckkit-cleanup.md)。

## 执行与能力边界

新链路为：

```text
标准 content + assets manifest
  → schema / 语义与实例容量 → 注册布局 → 组件计划
  → 原生文字、形状、图表、图片 → patch / designPlan
  → 标准 Create / 对象与数值回读 / canonical PDF+PNG / PowerPoint
```

[kit](../pptx-nova/assets/deckkits/cartesian.kit.mjs) 保留 `createDeck(content, options)`、
`C`、`FONT_DISPLAY`、`FONT_BODY`，并导出 `DESIGN`。
[design.json](../pptx-nova/assets/deckkits/cartesian/design.json) 承载数值事实，
[intent.md](../pptx-nova/assets/deckkits/cartesian/intent.md) 承载设计判断。
`cartesian-layouts.mjs` 将角色、内容和容量解析为组件计划；`cartesian-components.mjs`
消费计划，不再按旧 slide type 分支绘制页面。`cartesian-registry.mjs` 通过新注册 seam 接入
共享合同断言、布局选择、风格检查、预算投影与回读；没有复制整个生成器基础设施。

| 保留职责    | 注册布局                 | 内容与验证重点                                 |
| ----------- | ------------------------ | ---------------------------------------------- |
| Cover       | hero / wide              | 两行长标题、合成说明与同心圆留白               |
| Agenda      | split / stacked          | 3–5 项；独立行或单一原生段落框                 |
| Statement   | centered / reading       | 引语、署名与阅读停顿                           |
| Bar chart   | rail / wide              | 2–6 类、两个原生系列、单位/来源、合法轴域      |
| Image/stats | image-left / image-right | 1–2 段、2–3 指标、真实图片槽位                 |
| Cards       | row / register           | 2–3 项；形状拥有编号文字；长说明转换为条目构图 |
| Line chart  | wide / rail              | 2–8 类、两个原生系列、直线连接与自动轴域       |
| Timeline    | horizontal / vertical    | 3–4 个完整阶段                                 |
| Team        | row                      | 2–4 人；圈内缩写和名称/角色                    |
| Closing     | centered                 | 标题、行动提示与联系方式                       |

`auto` 按实际容量和近期构图确定性选择，显式 `layoutId` 仍须通过容量检查。
组合内容超限会失败，应调整组织或拆页；没有删字段、篡改数值、无限缩字或放宽门禁。
完整 deck 以封面开场、结束页收束；独立片段使用 `meta.designScope: "excerpt"`。

## 字段与兼容性裁决

- 两类图表新增必填 `data.unit`、`data.source`。旧 categories、两个 series 的名字和 raw values
  保留，不能从参考图猜测单位或来源。非有限值、长度不符、非法或裁切数据的轴域明确失败。
  numberFormat 作用于可见刻度；微小值在共用线性轴上可能小于一个像素，回读仍验证原值。
- 其余可见字段名称保留。Agenda 的 `textLayout: "paragraphs"`、
  `S{index}_AgendaParagraphs` 与逐项 level 保留；独立行模式不接受被忽略的 level。
- `image.editorial` 及其 catalog assetSlots 保留，通过正常 assets manifest 解析。
  contain/cover 均实测；不绑定图片时的交叉线框是显式组件行为，非遗留的未替换哨兵。
- 统计数字是展示字符串，不驱动假图形。唯一数据图形是带原始数值的原生图表。
- 参考中的通用业务观点仅存在于示例内容，套件不带金融或企业策略政策。
  另以公共图书馆主题和全部可见字段的最小中性输入检查参考文案泄漏。

## 与第一手参考的差异

只读参考为 `beautiful-html-templates/templates/cartesian` 的 design.md、template.html、template.json。
全部十页已截图和逐张检查，且与同 runtime 的旧十页 canonical 基线对照。
保留暖石底色、Playfair Display 常规衬线标题、Inter 支撑文字、taupe 细线、同心圆及稀疏构图。

改动出于可读性与数据语义：小字提高到至少 10pt 并适当加深；图片页段落与指标分隔线保留间距；
圆内文字改为形状自带并居中；图表补单位/来源，移除旧固定 0–60 折线轴与平滑插值。
新增合法替代布局用于不同密度，没有把所有页面改成通用卡片。
浏览器导航、hover 和键盘交互不进入 PPTX；没有复制照片或使用整页位图/栅格化图表。

Latin 为 Playfair Display / Inter，CJK 标题为 Songti SC、支撑文字为 Arial Unicode MS。
实际常规、粗体与混排已查看。字体不打包，其他机器仍需检查字体与最终渲染。

## 最终验证证据

唯一 run 为 `.tmp/deckkit-cartesian-v2-20261022-01/`（下文简称 RUN）。
runtime：`xdoc 0.13.0 (92a5aa13)`；原生宿主：macOS 的 Microsoft PowerPoint 16.114。

| 最终样例                              | 页数 | RUN 内路径                           |
| ------------------------------------- | ---: | ------------------------------------ |
| 英文完整 golden                       |   10 | `iterations/10/matrix/golden/`       |
| 全部替代构图                          |    8 | `iterations/10/matrix/alternatives/` |
| 长文本、最大密度、负数/零/微小值/大数 |   10 | `iterations/11/matrix/stress/`       |
| 公共图书馆中英混排主题                |   10 | `iterations/10/matrix/mixed/`        |
| 3/5 项原生分层段落                    |    2 | `iterations/10/matrix/paragraphs/`   |
| 真图片 contain / cover                |    2 | `iterations/12/matrix/assets/`       |

各目录的 `reviewed.pptx` 为标准 Create 最终产物，`finalized.json` 均为
`delivered / deliveryReady=true`。`run/visual-evidence/candidate/slide-N.png` 是所审查的
同一候选 canonical PNG，`run/visual_review.json` 绑定候选与图像字节。
`final-visual-review-ledger.json` 保存全部 42 页哈希和逐页观察；没有用 contact sheet 替代逐页检查。
`current-candidate-binding.json` 证明当前公共源码重生成的 patch 和完整 designPlan 与六份候选完全相同。

**机器检查：** 六份样例均通过输入、设计、dry-run、apply、原生回读与 canonical 门禁；
vision high/medium 为零，语义规则 107 源项 / 106 归一化项均无失败。
`--all` 共享 benchmark 为 19 案例 / 141 页，通过且没有新增 low；其他风格既有 low 不代表本任务验收。
Cartesian live golden 为 H0/M0/L0。旧 24 项小字允许基线已由新的零问题 baseline 替换。
候选晋级和显式 delivery 审计使用同一 `benchmark-accepted/` 实证目录，均 pass；
普通自动 delivery 仍受 candidate 状态限制。

全量 Node 测试为 519 项：481 pass、0 fail、38 个显式原生测试默认跳过。
另外启用真实 runtime 的 Cartesian stock canonical 与资产路径两项测试，2/2 pass。
专项覆盖全部布局、确定性、最大/最小容量、可见字段、风格/非法输入反例、图片回读篡改与投影元数据保留。
槽位一致性为 10/10；Cartesian 和 Biennale 投影 `--check` 通过。
主要报告：`all-tests-final-02.txt`、`native-contracts.txt`、`benchmark-rendered.json`、
`benchmark-accepted.json`、`readiness-candidate.json`、`readiness-delivery-explicit.json`、`slots-02.json`。

**视觉检查：** Phase 1 先验收十个参考页、十个旧基线页与十八个探索构图。
正式源码随后另行检查上述 42 张 canonical 图，包括图表轴/类别/图例、来源、长段落、指标、圈内字与图片裁切。
draft 04 静态 vision 为零却有最终排版溢出，已修正文行高估算；draft 05 的 auto 绕过坏 hero，
由逐布局显式探针检出并修复。旧失败证据保留，不作为最终通过依据；最终未关闭缺陷为零。

**原生宿主：** 六份候选全部在 PowerPoint 中打开、另存、关闭、重开，无 Repair、丢页或内容移除。
每份 `run/native-resaved.pptx` 又经独立对象/文字/几何/图表值回读；图片样例同时核对图片身份与 crop。
报告为 `native-readback-results.json`、`native-readback-paragraphs-assets.json`。
`native-edit-proof.pptx` 通过真实 UI 将标题改为 Cartesian 2.0、圈内 I 改为 IV、内嵌 Excel B2
从 2.4 改为 2.6，保存重开后 `native-edit-readback.json` 检查 99 个对象和两个图表通过。
三个 `native-*-edit.png` / `native-chart-updated.png` 截图保留原生操作证据。

原动画 fixture 的目标和 choreography 保留，重新构建、组合、dry-run/apply 成功，语义通过，
vision H0/M0/L2（低项为 Morph 页的 arrangement-imbalance 提示）。此项不代表动画播放验收。
另逐张查看其八页 canonical 图，确认该页左侧标题与右侧独立编号列表被误分为同一行卡片；
画面无裁切/重叠。`animation-compat/compatibility-review.json` 保留判断及原始门禁状态，
该候选仍未作为标准 Create 交付。追加的动画宿主复核因 CUA native pipe 启动失败未完成；
不影响此前六份主矩阵及真实编辑已经完成的宿主证据，也不外推其通过结果到动画播放。
未验证完整 OOXML/workbook 字节等价、所有宿主/平台、所有字体环境、任意旧稿翻新保真；
本套件也没有新增原生表格能力。机器回读与实测宿主结果不能外推为这些保证。

## 清理清单与维护改进

- 删除原 `makeCartesianOps`、`renderSlide` 及十个固定页型绘制分支，颜色/几何/容量不再由旧生成器维护。
  公共 `.kit.mjs` 被原位替换为薄适配器；没有 `legacy` 目录、第二运行器或静默旧分支。
- 原位替换旧 schema/预算、示例内容、showcase PPTX/WebP/摘要、baseline 和质量登记。
  新 showcase 与已验收 golden 是相同 PPTX 字节；旧产物不再随 skill 分发。
- 保留有效 build 胶水、动画内容/choreography、图片槽位、theme/style packs、nativeSkinning 和
  explicit-only refurbishProfile。创建迁移不授权删除仍有效的翻新能力，也不证明该能力本次复验。
- `core-primitives.kit.mjs`、`docs/xdoc-schema.json`、只读参考、用户文件与无关历史运行产物未修改或删除。

deckkit-maker 新增 [旧套件迁移参考](../deckkit-maker/references/legacy-deckkit-migration.md)，
入口与组件化指南已接入。落实的经验包括：调用/资产清单、先视觉基线后合同、每个布局显式探针、
实际行高与 canonical 反证、投影保留资产/翻新元数据、最小全字段泄漏测试、宿主真实编辑后回读，
以及验收后再退役旧资源。可选 enclosed-text 像素诊断对细笔画/黑字遮罩的误判也已修复并新增独立回归。

最新可查看示例：`pptx-nova/assets/examples/cartesian/deck.pptx`，
预览：`pptx-nova/assets/examples/cartesian/contact-sheet.webp`。
本记录与正式源码、测试、发布资源一起提交；临时完整证据留在 RUN，不随 skill 打包。
