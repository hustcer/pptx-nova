# Long Table 2.0 迁移与验收

日期：2026-10-22。`long-table` **2.0.0 / candidate**，默认场景为空。
八类原有职责已全部进入 `design.json + intent.md + long-table-editorial/v1` 注册执行链。
旧固定生成器、旧 schemas/示例/低风险基线已被替换，发布树没有并行的旧版执行路径。
本次使用 `xdoc 0.13.0 (92a5aa13)`、PowerPoint for Mac 16.114；结论只覆盖下述样例与环境。

## 实现范围

`.kit.mjs` 只加载合同并调用执行入口。布局模块编译完整组件计划，组件模块只执行计划，
registry 接入共享断言、容量、风格检查和发现投影。没有向 core-primitives 加入风格特例，
也没有另建生成/视觉验证/原生回读流程。

| 保留入口                | 注册构图           | 信息与对象                                                        |
| ----------------------- | ------------------ | ----------------------------------------------------------------- |
| longTableCoverSlide     | split / verso      | 徽章、标题、两枚胶囊、统计/说明、导语、独立可选的大编号/标签/资料 |
| longTableManifestoSlide | letter / wide      | 标识、眉题、标题、1–3 段正文、署名、出处                          |
| longTableIndexSlide     | cards / register   | 标题、副题、1–3 项完整索引，含编号、城市、标题、说明和两项资料    |
| longTableFeaturedSlide  | right / left       | 徽章、眉题、标题、说明、两枚胶囊、1–5 对键值资料                  |
| longTableMenuSlide      | ledger / programme | 标题、副题、1–5 组序号/名称/说明/搭配；节目单变体突出副题         |
| longTableQuoteSlide     | centered / reading | 标签、引文、作者、身份                                            |
| longTableCalendarSlide  | ledger             | 原生五列表格、1–6 行、全部表头和单元格，独立原生状态轮廓          |
| longTableClosingSlide   | left / centered    | 标识、眉题、标题、正文、站点、行动胶囊、1–3 组尾注                |

共 15 个注册构图。同内容逐个显式构建并检查文本完整与实际几何指纹差异；不是只更换布局名。
`auto` 使用共享确定性选择与实例容量检查；显式布局仍须满足容量。完整套件首尾必须是封面和收束，
抽取页显式使用 `meta.designScope: "excerpt"`。不支持任意坐标输入或通用排版求解。

## 参考与差异

只读参考为本地 `refs/beautiful-html-templates/templates/long-table` 的八页 HTML、design.md 和 template.json。
八张网页与八张旧版 canonical 均实际查看；先完成独立八页视觉基线，再注册和扩展。

- 保留奶油纸底、锈红单墨、重无衬线标题、衬线斜体正文、圆形版号、细线、胶囊与编辑式留白。
- 原字体未安装，采用 Arial Black / Georgia；中英混排使用正体 Arial Unicode MS。字体不随包分发，
  跨平台不保证同字形或同换行。示例尾注中原作者的字体名称仍是输入文案，不代表实际渲染字体。
- 原生 pattern 实验在 PowerPoint 中呈现奶油底与细点，但同文件 canonical 底色变白；该实验未获验收。
  最终明确采用纯奶油色底，省略纹理，无全页截图或背景位图。
- 修复旧版圆底遮住编号；圆、标签和胶囊由形状持有居中文字。胶囊为可编辑自由路径，端点为半圆。
- 提高正文/资料字号，保留末行、分隔线和页脚间距。单项资料、单卡、单行表格不再拉满页面。
- 网页导航和动效不迁入静态 PPTX；不新增图表、图片输入或业务默认内容。

日程的状态文字在原生表格内，轮廓是独立路径。PowerPoint 手工修改表格行高/列宽不会同步轮廓，
应从 content 重新生成。数字和日期均为展示文本；不宣称数值图表语义。
独立 `refurbishProfile` 保留并同步字体角色；创建链迁移不证明任意旧 PPTX 翻新无损。

## 分开验收的三类证据

本次证据根为 [运行目录](../.tmp/deckkit-long-table-v2-20261022/)。最终权威矩阵是 `matrix/04/`。
`iterations/03/` 仅为接受的探索基线；`matrix/03/` 不再是最终交付路径。

| 样例      | 页数 | 覆盖                                                 |
| --------- | ---: | ---------------------------------------------------- |
| golden    |    8 | 全职责、全部默认构图与签名元素                       |
| variants  |    7 | 同内容逐个替代构图；与 golden 合计覆盖 15 个注册布局 |
| mixed     |    8 | 中文、英文、混排、常规/粗体及正体 CJK                |
| unrelated |    8 | 明确标注为合成内容的天文主题；无示例业务文案泄漏     |
| stress    |    8 | 最大条目数、长段落/卡片/表格；合成内容               |
| sparse    |    6 | 每类可重复字段的最小数量；单项几何紧凑               |

**机器验证：**六组 ZIP 完整性、全部 XML/rels 良构、结构/字体/颜色、Office 365 compat gate、
语义检查、对象/表格逐格回读均通过。45 页的 vision high/medium/low 全为 0，canonical 全为 proceed。
无关主题共 139 个输出字符串，对六组旧业务词的泄漏检查为 0 命中。
单测包含空字段、错误类型/数量、未知布局、超容量、错误字体/色值/纹理/效果及缺失回读对象等反例。
见 [机器审计](../.tmp/deckkit-long-table-v2-20261022/audit/final-02/summary.json)、
[泄漏检查](../.tmp/deckkit-long-table-v2-20261022/content-leak-audit.json)。

共享 semantic audit 在含表格的五组中各保留一项非阻塞 `table-source-missing` 提醒：输入没有
额外的表格 source 元数据，验证数据的合成身份已在正文披露，golden 为原始参考文案。
开发 fixture 的 deck_lock 还包含未声明规划色板/字体/布局意图、通用 rhythm 名和有意句末标点等提醒；
实际设计身份由合同、完整计划、inspect 与 PNG 检查。生成时的 experimental 登记提醒反映当时状态，
最终 catalog 已经重新检查为 candidate。这些提醒未被描述为“零警告”，也没有关闭或放宽门禁。

**实际视觉：**45 页逐张 canonical PNG 已检查；另看全部六组总览及放大的徽章、中文状态、页脚、
最大密度表格末行和稀疏资料卡。没有硬缺陷。最终 sparse 修复后重新生成了全部六组；前五组 39 页
PPTX 与每张 PNG 字节相同，完整计划除合同 hash 外相同，旧的实际审图结论经逐文件 hash 重绑定；
新的 6 页 sparse 重新逐张检查。没有用机器通过代替审图。
见 [逐页 ledger](../.tmp/deckkit-long-table-v2-20261022/matrix/04/visual-ledger.json)、
[放大与节奏记录](../.tmp/deckkit-long-table-v2-20261022/matrix/04/detail-review.json)、
[源文件绑定](../.tmp/deckkit-long-table-v2-20261022/final-source-binding.json)。

**原生宿主：**PowerPoint for Mac 16.114 打开全部六组无 Repair；每组实际另存、关闭、重开亦无 Repair。
另存结果逐对象文本/几何和原生表格逐格回读通过。另在副本实际编辑了标题、圆内编号、胶囊文字和
日程表格首个表头，再保存、关闭、重开、回读，四项变更均保留。未把“可选中”视作编辑证明。
见 [原生汇总](../.tmp/deckkit-long-table-v2-20261022/native-summary.json)、
[四项编辑回读](../.tmp/deckkit-long-table-v2-20261022/matrix/04/golden/native-edit-readback.json)。

六组最终 PPTX 都由标准 Create 的 hash-bound visual review 后 `--finalize` 发布；发布字节等于已验收候选。
见 [最终接受清单](../.tmp/deckkit-long-table-v2-20261022/final-acceptance.json)。

## 清理和共享回归

| 对象                                                     | 处置                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| long-table.kit.mjs 原固定绘制函数、空纹理 helper         | 移除；同名入口成为合同薄适配器，旧代码只留 Git 历史和隔离证据 |
| 原八个 schemas、内容示例、catalog 几何/预算              | 更新为合同投影和新验证边界，旧预算退役                        |
| 旧 golden 41 项 low baseline                             | 整体更新为本轮 0 low baseline，无旧问题豁免                   |
| assets/examples/long-table 五个文件、manifest/decks 索引 | 由官方维护工具重新生成；旧 0.1.0 deck/预览/摘要被替换         |
| golden benchmark expected / example build 入口           | 仍有效，保留；review.md 更新实际 2.0 验收结论                 |
| 独立翻新 profile、公共 slide type/id、参考/历史证据      | 保留；不新建永久 legacy 分发目录，不删除无关内容              |

共享 benchmark 19 个 case 全通过；该轮早于 sparse 几何修正，Long Table golden 与最终字节相同，
其他套件源码未被本次修改。修正后另跑 Long Table benchmark 并更新 baseline：8/8 PNG、0 fit、
0 high/medium/low。投影防漂移、槽位一致性、完整单测、smoke 和 strict public audit 的最终结果见
[完成审计](../.tmp/deckkit-long-table-v2-20261022/requirement-completion-audit.json)。
没有修改 `docs/xdoc-schema.json`，没有改动 xdoc 或引入外部运行依赖。
完整仓库测试为 514 项通过、38 项按 opt-in 配置跳过、0 失败；另有 58 项合同族回归全部通过。
未验证 Windows PowerPoint、其他 Office 版本、跨平台字体一致性、任意旧稿翻新保真，以及本套件不提供的
图表/图片/动画输入。原生通过仅指本次 Mac 宿主与明确列出的对象组合。

## 可直接查看的文件

- [随包示例 PPTX](../pptx-nova/assets/examples/long-table/deck.pptx)、[总览预览](../pptx-nova/assets/examples/long-table/contact-sheet.webp)
- [最终 golden PPTX](../.tmp/deckkit-long-table-v2-20261022/matrix/04/golden/reviewed.pptx)、[逐页预览](../.tmp/deckkit-long-table-v2-20261022/matrix/04/golden/run/visual-evidence/review.html)
- [最终中英混排 PPTX](../.tmp/deckkit-long-table-v2-20261022/matrix/04/mixed/reviewed.pptx)、[预览](../.tmp/deckkit-long-table-v2-20261022/matrix/04/mixed/contact-sheet.png)
- [最大密度 PPTX](../.tmp/deckkit-long-table-v2-20261022/matrix/04/stress/reviewed.pptx)、[最小数量 PPTX](../.tmp/deckkit-long-table-v2-20261022/matrix/04/sparse/reviewed.pptx)
- [原生另存副本](../.tmp/deckkit-long-table-v2-20261022/matrix/04/golden/native-resaved.pptx)、[原生编辑副本](../.tmp/deckkit-long-table-v2-20261022/matrix/04/golden/native-edit-proof.pptx)

随包示例的 SHA-256 为 `28b35d2c35a4ed50e8790cd6e301b664168d5d59dc195dff051326bf07d14e44`，
与最终 golden 一致。`.tmp` 证据只保留在当前工作区，不随 skill 发布，也不以大批临时图片污染仓库。

## deckkit-maker 改进反馈

已据实修订两处指引：HTML 参考路线明确“pattern 写入通过”不证明 canonical/原生渲染一致，
必须比较纯色基准并记录近似裁决；组件化路线区分动态胶囊的公共可用容量与 sentinel 的实际占用宽度。
本次 projection 已修正这项容量误报，并有回归断言。没有因此禁止所有 pattern，也没有扩写尚未实现的能力。
