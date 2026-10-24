# Warm Clay 迁移验收记录

2026-10-25；`warm-clay@0.1.0`，目标与结果均为 **candidate**。
机器门禁、canonical 视觉验收和原生宿主结果分别记录，candidate 不代表 production/default。
本次使用 xdoc `0.15.0 (6fa897c7)`，16:9 画布，合成示例均明确标识为非真实事实。

## 设计来源与裁决

只读来源为 Warm Clay Works 的 design.md 与八页纵向参考图。逐页分析覆盖 8/8，
各 panel 为 1920×1080，没有画布比例冲突。保留奶油纸、墨棕正体衬线、陶土证据、
粉色自持编号、角落四分之一圆/细环、开放列与水平表格线、底部结论/来源的身份。

具体规范与画面覆盖通用底稿中的“零装饰、无封面、每项指标必须目标/实际/达成率”；
业务实体、结论、日期、阈值、来源不进入皮肤。粉色照片背板按图像向左下偏移。
LXGW Bright、MiSans、Oranienbaum 在验证主机缺失，改用 Georgia / Songti SC 与
Arial / Arial Unicode MS，字体不嵌入。加深可读陶土色至 994614，正文/附注最低 10.5pt，
放大附注、增加页脚与规则间距，修正流程轴贴标题、收束页分隔线碰机制线的问题。
不复制参考照片；仅保留原生占位外壳，图片导入不属于本版能力。

## 可复用实现

[design.json](design.json) 为公共视觉合同，[intent.md](intent.md) 为调用与边界说明。
thin kit 通过已注册 clay family 执行组件、布局计划和标准 build/Create 工作流运行；
复用既有校验、布局选择、原生对象回读与候选交付绑定，没有复制完整生成器，未修改 core-primitives。

八职责与十五布局：封面 portrait/editorial、总览 rail/band、图表 chartLeft/chartRight、
比较 side/stacked、流程 chain/vertical、KPI strip/rail、状态 wide、承诺 columns/ledger。
每个布局均覆盖；同内容构图测试验证真实几何不同且字段完整。
图表仅单系列原生柱图；表格、文字、编号、角落图形均为原生对象。
数值、单位、来源与阈值完全来自 content。超量输入被阻断，须重组、选合法构图或拆页。

## 有效交付与证据

- 最新示例：[deck.pptx](../../examples/warm-clay/deck.pptx)。
- 最新整体预览：[contact-sheet.webp](../../examples/warm-clay/contact-sheet.webp)。
- 可复用 content：[warm-clay-content.json](../examples/warm-clay-content.json)。
- PPTX SHA-256：`15e124139fe7a40218a36b0ec356541d08a48ac0ad9fa72c4a365e2af6abfc54`。
- 本机详细验收：仓库 `.tmp/deckkit-warm-clay/acceptance-report.json` 与 `.md`。
- 同一最终候选的 canonical：`.tmp/deckkit-warm-clay/create/01/visual-evidence/`，
  `candidate/slide-1.png` 至 `slide-8.png`；索引 `review.html`。
- 标准 Create 交付：`.tmp/deckkit-warm-clay/final/warm-clay.pptx`、`delivered.json`。
  curated 示例与该候选逐字节一致。
- Phase 1 基线：`.tmp/deckkit-warm-clay/iterations/04/deck.pptx`；逐页比较见 run 中
  `compare-notes.md`，8/8 职责保留，允许设计优化，无逐像素复刻承诺。

上述最终示例替代 iterations/01–04 与 qa/01–02 的旧样例；qa/03 是当前复用验证集。
旧轮次及异常证据只读保留，临时产物按仓库规则忽略，不纳入发布文件。

## 验证覆盖与结果

| 覆盖                   | 数量与结果                                                                        |
| ---------------------- | --------------------------------------------------------------------------------- |
| 完整英文合成工作坊示例 | 8 页；全部主要职责和特征组件                                                      |
| 同内容合法变体         | 8 页；覆盖另外七布局及 KPI 两种组织                                               |
| 最大合理密度/边界      | 6 页；比较表五列四行的两构图、四类别带负数/零/极小值、六短行/五长行状态表、五指标 |
| 中文 / 混排            | 4 / 3 页；实际常规/粗体、衬线/无衬线、数字及小单位                                |
| 不同主题               | 3 页博物馆档案；文案/政策泄漏扫描零匹配                                           |
| 普通小数               | 1 页；负小数、零及不同精度                                                        |
| 非法输入/规则反例      | 16 个针对性测试中的相应断言；容量、枚举、字段、数值、风格与回读篡改被阻断         |

完整示例 8 页和额外 25 页 canonical 均逐张实际查看；不是以 contact sheet 代替。
完整示例逐页：1 封面/外壳/小单位、2 编号发现、3 柱内值、4 比较表/引文、
5 流程轴/编号、6 五指标、7 状态表/附注、8 基线目标/机制，全部通过。
编号、柱内数值、密集表格和页脚另作放大检查；无未关闭 canonical 视觉缺陷。

validate-content、dry-run/apply、结构 inspect、数值与逐格表格回读、vision-check、
canonical visual-audit、slot-consistency、benchmark 与 candidate required-live readiness 通过。
benchmark/02：906 ops，errors/warnings/fit=0，dry-run High/Medium=0，vision H/M/L=0，PNG 8/8。
dry-run 另有一项 Low 提示；不等同于 vision 缺陷，未修改门禁以隐藏它。
全仓测试 612 项：573 通过、39 显式跳过、0 失败；跳过项不声明验证。
全部 DeckKit 的 slot-consistency 通过；smoke/public strict audit 通过。
delivery readiness 未通过属于预期：candidate 未取得 production/default 与持久视觉 baseline 资格。

## PowerPoint 原生宿主与限制

宿主为 macOS PowerPoint **16.114.1**。最终哈希候选打开无 Repair；八页放映窗口截图
在屏幕内 1200×675 逻辑画布上取得身份绑定证据，见 run 的 `native/03/golden/`。
原生编辑副本已修改标题、图表系列名和表格单元格，保存、关闭、重开后八页和关键对象保留，
无 Repair、内容移除或原生对象损坏。中文四页和整数/小数/科学记数探针另有原生检查。

**明确未通过/不承诺的编辑边界：** Excel 中 B2 从 48 改为 49 后，嵌入工作表保存了 49，
图表缓存仍为 48；该手工编辑同步路线不接受。生成时工作表与缓存同源一致，
数据更新使用 content 重建；独立解释、指标和来源也须同步重建。
不能把“能打开 Excel”记成数据编辑传播通过。

本机 PowerPoint **PDF 导出**出现部分副标题/结论缺失和表格位移，编辑器/放映显示完整。
异常 `native/02/golden` PDF 渲染证据保留但不接受；实际原生显示采用窗口路径复核，
不将宿主导出差异改写为套件内容，也不声称 PDF 导出通过。
默认 1440 宽窗口越出本机屏幕，身份门禁正确阻断；1200 宽重采集通过，未放宽门禁。
跨平台、其他 Office/字体、动画、图片导入、任意已有 PPTX 保留/翻新均未验证。
这些边界不改变本版的 content → 原生 PPTX candidate 能力，不授予自动 production 资格。

## 本次落实的 maker 改进

- 单页 slot 探针显式使用 excerpt，修复完整 deck 首尾规则误报，保留完整 deck 校验。
- 共享原生回读按 paragraph 回放 add-run，跟踪 shape rename，修复小单位误判丢失；有失败前/后回归。
- 更新组件化和视觉验收指南：流程轴/标题、分隔线/机制线的具体反例。
- 原生发现 `0.##` 整数尾小数点，修正为按值选整数/小数/科学记数格式并加回归。
- 增加编辑同步检查要求：同时查嵌入工作表、cache 和实际原生画面，分开报告显示与导出结果。

详细原始证据留在 run 目录；本记录描述实际验证能力，不用测试数量替代视觉质量。
