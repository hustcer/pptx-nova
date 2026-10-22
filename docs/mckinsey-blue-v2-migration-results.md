# McKinsey Blue 2.0 迁移与验收

日期：2026-10-22。DeckKit：`mckinsey-blue`；版本：`2.0.0`；readiness：`candidate`。
八类职责全部进入 `design.json + intent.md + mck-consulting/v1` 注册执行链，
旧固定渲染器退役。须显式选择，不继承旧版 production/default 资格。当前没有未关闭阻塞缺陷。

## 第一手来源与设计裁决

第一依据是 `63-麦肯锡风-kimsoong-customer-loyalty.pptx` 全部八页；来源 SHA-256：
`dd5a8c790fcc86ef8296e5e2dfb4d5854fb8c5b5d279b981673afe07d905b0c3`。
原稿和旧版各八页均逐张检查，来源只读保留。

- 保留白底、观点标题、深蓝结论带、细规则、直接数值、渐进蓝色支柱和跨页分析→行动节奏。
  封面保留渐变、斜切、同心圆、项目明细和双指标，不把后续页面都做成通用卡片。
- 补回旧产物遗漏的四支柱图标、五项举措图标、阶段任务图标、责任方、资金分摊和底部治理栏。
  原稿有 82 个 freeform、8 个 group，媒体目录不能代表图标库存。新图标来自已有离线 Tabler SVG，
  是语义替代与矢量图片，不冒充原稿路径或可编辑路径节点。
- 放大原稿密集小字并调整分区、对比和留白。主要正文 11pt，辅助文字最低 10pt；
  编号由形状持有并居中，浅色编号条自动选择深色字。
- Arial / Arial Unicode MS 为明确字体选择，中文替代原稿 Microsoft YaHei，不嵌入字体。
  本机 canonical 字体报告中常规/粗体均解析为请求样式，逐页未见意外倾斜或缺字。
- 人口画像三图和损失驱动条图改为原生图表；替代排序布局使用原生 5×4 表格。
  cohort 宽度与数值成比例，零值没有伪造最小条；矩阵直径按权重平方根计算，面积表达相对权重。
- 原始业务数值不擅自归一化。收入 82 / 16 / 5 合计 103%，样例保留并明确提示检查分母。
  参考数据、目标和结论均标为未验证演示；异领域数据明确标为合成。
- 实体、观点、来源、时间、责任方、单位说明、保密文字与资金政策都来自 content。
  纵向排序不再沿用“从左到右”的方向文案；公共示例改用与两个构图都相容的优先级说明。

## 公共合同与字段迁移

入口仍为 `mckinsey-blue.kit.mjs::createDeck(content)`。适配器加载合同、解析完整组件计划、
执行注册组件并进入共享检查；不再保留第二套旧绘制器。通过 discovery、content 和 `layoutId`
创作，不要求后续 Agent 手写页面坐标。相同输入的布局选择、计划与 patch 确定。

| 职责        | 注册布局              | 保留的内容与主要表达                           |
| ----------- | --------------------- | ---------------------------------------------- |
| cover       | split / band          | 标题、导语、四组项目明细、双指标与全部尾注     |
| snapshot    | stacked / rail        | 三指标、分段 cohort、合计说明与三类发现        |
| profile     | quadrants / bands     | 三个原生条图、分组注释、兴趣编号与说明         |
| matrix      | rail / reversed       | 数值坐标、面积圆、四象限、图例与发现/行动      |
| drivers     | rail / wide           | 原生驱动条图、逐项行动、可控/不可控摘要        |
| pillars     | columns / rows        | 编号、图标、四项原则、成果、KPI、时间          |
| initiatives | columns / ledger      | 五项排序、图标、描述、成本、支柱、负责人及明细 |
| roadmap     | horizontal / vertical | 四阶段、任务图标、三个指标与三组治理资料       |

八个旧页型名保留；不提供永久猜测兼容器。封面 title 数组改为可换行字符串，位置 tuple 改为命名对象，
参与计算的百分比改为 0..100 数值，任意 hex 改为语义 tone，矩阵旧直径 size 的平方映射为 weight。
固定页脚保密文案退出皮肤；labels、单位/分母说明、ownerDetail、finding.action、defaultTimeframe 等显式输入。
详见 [intent.md](../pptx-nova/assets/deckkits/mckinsey-blue/intent.md)。

未知字段、布局、图标、任意 customOps、缺必填值、非有限/字符串/越界百分比、非法圆位置和重叠、
超容量和文字溢出均失败。auto 可选择另一合法构图；没有可用构图时应重组或拆页，不能静默删字段、
改值或无限缩字。schemas、catalog 必填槽位、发现输出、预算投影与实际解析器一致。

## 最终复用矩阵

证据根目录为本机忽略目录 `.tmp/deckkit-mckinsey-blue-20261022/`，以下均相对该目录。
探索 `iterations/01..04`、`matrix/01..06` 和第七轮早期候选只读保留，不能替代最终文件。

| 最终组     | 页数 | 有效候选目录                   | 覆盖                                              |
| ---------- | ---: | ------------------------------ | ------------------------------------------------- |
| golden     |    8 | matrix/07/golden/run           | 第一手完整英文叙事、全部可见字段与主要组件        |
| variants   |    8 | matrix/07/variants/run         | 相同内容全部选择第二布局，实际几何与 golden 不同  |
| chinese    |    8 | matrix/07/chinese/run          | 合成城市图书馆服务主题、中文常规/粗体、不同领域   |
| mixed      |    8 | matrix/07/mixed/run            | 同一异领域主题的中英混排                          |
| stress     |    8 | matrix/07/stress/run-final     | 第一布局的合理密度、五 cohort、五面积圆、六驱动等 |
| sparse     |    8 | matrix/07/sparse/run           | 明示验证夹具；最少一项、0 / 0.0001 / 100 数值边界 |
| stress-alt |    8 | matrix/07/stress-alt/run-final | 第二布局密度、十五个人口类别、五行原生表格等      |

所有十六个布局均覆盖。重要数量上限还包括四组明细、五兴趣、四支柱、五举措、四阶段×两任务、
三指标和三治理项。数量上限不是任意文本组合的容量承诺：quadrants 中文图表标签实测每图四项；
五项应使用 bands。五段 rail cohort 使用短标签且无附注；较长五项内容会被容量检查阻断。
ledger 每格最多 80 字符，窄中文列可能自然换行标点；较长举措应使用 columns 或重组拆页。
这些边界来自实际失败/通过样本，没有降低门禁或在生成端截断内容。

## 三类验收证据

**机器检查：**七组标准 Create 的 schema、实例容量、check-lock、dry-run、apply、设计检查、
原生图表/表格回读、vision、canonical final-layout 与最终交付绑定均通过。
每组四张原生图表，共 28 张；variants 与 stress-alt 各一张原生表格。高/中/低 vision 问题均为 0。
最终源码重新调用 createDeck 后，七组 patch 与 design plan 均与接受候选完全一致，见
`matrix/07/final-binding.json`。候选及原生另存文件共十四份默认 preflight 均 passed、零 issue；
Microsoft 365 compat 的 full-package integrity 均 completed / passed / issueCount=0。
该检查不是完整 OOXML XSD 验证或 Office 播放证书。

**视觉检查：**56 张最终候选 canonical PNG 全部实际逐张查看；`visual-review-ledger.json`
记录每页候选、manifest 和 PNG SHA-256。另查看七张同源 contact sheet 评估节奏，并放大检查
编号/图标、极小图表数值、密集原生表格和治理栏/页脚。无缺字、遮挡、截断、偏心、压线或意外倾斜；
窄中文表格的自然断行作为容量边界披露。`detail-and-rhythm-review.json` 保存补充记录。
七组均通过标准 `--finalize --visual-review` 发布同一候选，未用旧通过记录代替新文件。

**原生宿主检查：**PowerPoint for Mac 16.114 实际打开、另存、关闭、重开七组共 56 页，
无 Repair、丢页或内容移除；保存文件通过完整组件与数据回读，见 `matrix/07/final-native.json`
和各组 `native*/final-readback.json`。另在专用编辑副本实际修改已有标题、形状持有编号、
原生图表首值 48→49，以及原生表格单元格 After-Sales→NATIVE，保存重开后修改保留。
图表缓存和其嵌入工作簿 B2 均为 49；正确选中单元格内部编辑后的表格列宽保持。
`native-edit-check.json` 和 `structural-content-final.json` 记录编辑与结构核对。

早期脚本 clean-open 超时的 skipped 记录保留，未计为通过；后续已用真实 UI 完成所需验收。
中文版额外以字节相同的唯一文件名 `chinese/native/chinese-reopened.pptx` 重开，确认八页与无 Repair。
第一次表格编辑误双击列边触发列宽调整，失败副本保留；从干净另存副本重做后列宽一致。
编辑验证副本不是交付样例，其中初次误操作新增的验证文本框也没有混入交付候选。

本轮实际生成/检查 runtime 为 `xdoc 0.13.0 (92a5aa13-dirty)`，冻结 field date 为 2026-10-22。
这里记录测试环境，不把该本机构建声明为公开安装渠道或已批准的发布二进制；未改 schema 快照。

最终全仓 567 项测试：529 通过、38 条件跳过、零失败；McKinsey 专项七项全部通过。
smoke、严格公开审计、投影检查、十套槽位一致性、showcase 重生成一致性与 lint 均通过；
公开审计零 error / warning。最后仅移除三处未使用变量，七组 patch/plan 一致性与专项测试再次通过。
其余 catalog 条目和已有 design schema 定义语义未变，共享 primitives 与 xdoc schema 快照未修改。

不同领域的五组 patch 和独立 PPTX 可见文字对 Kimsoong、售后、折扣、欧洲、巴黎、50/50 等参考实体/
政策词零匹配；执行模块也不含原稿业务实体与数值结论。字体和套件元数据不混算为业务文案泄漏。

## 修复、技能改进与旧资产清理

本轮关闭的具体问题包括：多段表格单元格在最终 PDF 中意外放大后续段落、过高空文字框导致碰撞、
矩阵控制探针生成同坐标、表格缺显式维数、窄表容量不明确和替代布局的方向性文案。
多段表格问题尚未归因到 renderer 或宿主；改用单个明确样式段落与行内分隔后，canonical 与原生验收通过。
没有用静态 vision=0 掩盖曾经的失败样本。

`deckkit-maker` 已落实：清点 freeform/group 图标；区分容量 allocatedFrame 与实际文字框；
明确 add-table rows/columns、逐格回读、原生内部选字编辑及多段落最终渲染风险；修正文档命令续行。
共享槽位探针新增仅限数组控制字段的 `x-slotProbeSequence`，拒绝可见文字、数组外字段、空序列或与
`x-slotProbeValue` 共存，并有正反例回归；不放宽生产内容校验。

| 对象                                                       | 处理                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| 旧 mckinsey-blue.kit.mjs 固定绘制函数/坐标                 | 删除旧实现，原入口替换为合同薄适配器，无旧 fallback              |
| 旧 tuple、百分比字符串、自由颜色和固定业务 footer          | 从活动 schema/示例移除，改为新语义字段                           |
| 旧 stress/mixed 输入及预期                                 | 原位替换，原 2 / 3 页回归各扩为 8 页，保留 case id               |
| 三份旧 vision baseline                                     | 经新视觉检查后替换为本轮零 issue 记录，不继承旧豁免              |
| assets/examples/mckinsey-blue/ 的旧五份分发资产            | 由官方更新工具全部替换为新 content、PPTX、预览、brief 和 summary |
| gallery/catalog/manifest                                   | 同步新 hash、8 页、2.0.0 与 candidate / preview 状态             |
| 参考源、旧轮次、失败样本                                   | 只读保留；旧分发资产另存 retired-assets/ 对照                    |
| corporate-blue / consulting 换肤配置及共享 primitives/图标 | 保留有效消费者，不误删独立翻新或其他套件依赖                     |

已无本套旧创建器专属的失效分发资产；相同公共文件名保留是替换内容后的有效入口。
consulting-dark 仍为唯一未迁移创建器，共享旧机制的全仓退役不在本次范围。

## 最新文件与复现

- 有效分发示例：[deck.pptx](../pptx-nova/assets/examples/mckinsey-blue/deck.pptx)
- 分发预览：[contact-sheet.webp](../pptx-nova/assets/examples/mckinsey-blue/contact-sheet.webp)
- 内容与摘要：[content.json](../pptx-nova/assets/examples/mckinsey-blue/content.json)、[summary.json](../pptx-nova/assets/examples/mckinsey-blue/summary.json)
- 本机完整示例：`matrix/07/golden/reviewed.pptx`；同内容替代构图：`matrix/07/variants/reviewed.pptx`
- 中文 / 混排 / 最小值：`matrix/07/{chinese,mixed,sparse}/reviewed.pptx`
- 密度与替代密度：`matrix/07/{stress,stress-alt}/reviewed-final.pptx`
- 每组 canonical 预览：上述有效 run 目录的 `visual-evidence/candidate/slide-1.png` 至 `slide-8.png`
- live benchmark：`benchmark-final/`；candidate 报告：`readiness-final.json`

新分发 deck 与逐张接受的 golden 候选字节相同，SHA-256：
`41f09bebfb16710771d861d5508be86aeaace418b6f003e7c050c8258bb564f0`。
以上新文件替代旧 0.1 showcase 和旧轮次展示产物；历史样本不能用来展示新版质量。

```sh
node --test tools/tests/*.test.mjs
node tools/pptx-nova-smoke-test.mjs
node tools/pptx-nova-audit-public.mjs --strict
node tools/generate-pptx-design-projections.mjs mckinsey-blue --check
node pptx-nova/scripts/pptx-nova-deckkit-slot-consistency.mjs --json
node pptx-nova/scripts/pptx-nova-deckkit-benchmark.mjs --deckkit mckinsey-blue --all --repeat 3 --out <fresh-run>
node pptx-nova/scripts/pptx-nova-deckkit-readiness.mjs --deckkit mckinsey-blue --target candidate --benchmark-mode required-live --out <fresh-run>
node tools/update-pptx-nova-deckkit-examples.mjs --deckkit mckinsey-blue --check --tmp <fresh-showcase-run> --no-clean
```

## 已知限制与未验证项

本套原生条图只表达 0..100 百分比，unit 为分母/口径说明，不是任意量纲图表接口；非有限、越界或
字符串百分比被拒绝。六位以内小数按精度显示，极小数使用 General 保留值；数据标签可能采用科学记数。
cohort、面积圆和图表旁注是独立可编辑对象，在 PowerPoint 手改数据、文字或形状后不会自动联动，须从 content 重建。

Windows、其他 Office 版本、跨宿主像素一致性和源稿翻新保真未验证。未声明原稿动画、照片输入、
任意自由坐标、通用图表或任意长度内容的自动排版。SVG 路径节点不可按原生形状编辑。
字体不打包、不嵌入；其他字体环境应重新验收。candidate 不等于 production/default 资格。
全仓测试中 38 项需要 `XDOC_TEST_BIN` 的其他运行时集成条件跳过，未计作已验证；本套真实 Create、
图表/表格、canonical 与 PowerPoint 验收另有上述直接证据。
