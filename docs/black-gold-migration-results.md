# 第三阶段：Black Gold 迁移与抽象验证

2026-10-21；运行时 `xdoc 0.13.0 (ea2c8e58)`。新 DeckKit：`black-gold` 0.1.0，
readiness 为 **candidate**。没有修改 core-primitives 或 xdoc schema 快照。

## 结论

JSON 合同 + Markdown 意图 + 注册视觉组件的方案已在第二种设计语言上成立。
Black Gold 使用灰阶证据、无纵轴/网格图表、原生细线矩阵和深色判断阶段，保留自身视觉语法。
它复用合同校验、theme/字体、确定性构图选择、回读和交付绑定，没有复制 Biennale 生成器。
套件适配器仅负责加载合同并调用共享的 editorial family。

这证明两种视觉语言可以共存，并支持继续迁入同类编辑式风格；不等于任意风格都能零代码迁移。
新视觉语法仍可能需要增加有界组件；通用排版求解器、完整金融分析和 PowerPoint 渲染保真
没有因本次迁移而自动成立。

## 输入与设计裁决

输入为用户给定的 Black Gold Ledger `design.md` 和八页纵向合成参考图。来源 hash、
1920×8640 尺寸、八个建议裁图与原图审查记录保存在本次 source manifest 中。未引用隐藏
HTML/PPTX，也没有将参考图片作为页面背景。所有参考文件只读。

用户允许主动改善不合理参考，因此覆盖八个参考页面角色，建立可读的视觉基线，未要求像素复刻：

- 文字规范的深色摘要/行动页、单一金色焦点优先于截图中的白底阶段、多金色 KPI。
- 金色文字采用可读的 `B18400`；水印与来源文字提高对比度，扩大文字框，不以豁免通过门禁。
- 用单焦点、深浅职责、细线矩阵、左右不对称布局维持设计身份；动作页的三个全宽条带有明确职责。
- 大数值条形采用深灰填充和金色描边，避免整条金色填充侵占注意力；折线保留小型金色端点。
- 双单位“金额柱 + 笔数线”改为上下排列的两个原生图表，各自标明单位。
  当前 combo 的 JSON 投影探针未回读完整系列，不能据此宣称数据验证通过。
- 表格内进度条从 share 数值推导；原生单元格保留百分比与全部文字。
- 示例均为明确标记的合成/说明性数据；复核并修正历史观察，使环比 +18.0%、同比 −5.3%
  在声明精度下与示例数列一致。这是样例审查，不是通用金融论证验证器。

## 落盘与复用边界

| 层         | 实现                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| 设计事实   | `assets/deckkits/black-gold/design.json`：tokens、角色、字号、区域、容量、八类检查规则 |
| 意图       | `black-gold/intent.md`：阅读路径、密度、适配理由、人工检查范围                         |
| 视觉执行   | `editorial-components.mjs`、`editorial-layouts.mjs`：六种页面职责、原生证据、容量筛选  |
| 共同能力   | `design-contract.mjs`：合同、theme/字体、选版排序、patch 检查、对象/图表/表格回读      |
| 接入       | `black-gold.kit.mjs`、六个 schema、catalog、样例、golden benchmark 与 baseline         |
| Agent 流程 | 原 validate/build/create runner；表格增加 semantic audit，报告参与最终交付绑定         |
| 金融政策   | `references/policies/finance-research.md`：按内容需要显式读取，不因选择皮肤而自动启用  |

六类页面为封面、摘要、趋势、矩阵、排名和行动。趋势与排名均用同内容验证了两种真实构图；
趋势还支持第二图表模块。完整 deck 约四分之一深色属于偏好，角色与位置有明确约束。
`meta.designScope: "excerpt"` 允许长证据节选，避免插入无关判断页面。

身份规则与原始数值交给程序执行；断言是否有说服力、视觉张力和金色像素面积仍需人工/Agent
逐图审查。图表类别和系列值完整回读；表格逐格检查文字与维度，未声称完整样式/XML 等价。

## 验证结果

| 验证                 | 结果                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| 全仓测试             | 473 项：435 通过、38 条件跳过、0 失败                                                          |
| 新增针对性测试       | 反例、真实构图、跨 token 映射、长证据节选、数值精度、表格篡改、来源助手、审计覆盖              |
| 槽位审计             | 全九套通过；互斥可选组件使用多组探针，全部声明字段至少覆盖一次                                 |
| Black Gold canonical | 八页主样例 + 四页构图变化 + 三页压力 + 八页混排 + 三页非金融，共 26 页，均 proceed、0 findings |
| 原生回读             | 新样例全部通过；20 个原生图表、117 个数值点、4 个原生表格和 100 个单元格                       |
| 表格 semantic audit  | 四组含表格样例均 pass，0 errors / warnings                                                     |
| 内容泄漏             | 非金融样例 57 项文字/原生标签/单元格检查，6 个来源业务词，0 命中                               |
| Biennale 回归        | 两个 golden benchmark 通过；17 页新 canonical 回归全部 proceed、0 findings                     |
| 图像复核             | 新样例逐页 PNG/contact 复核；Biennale 与此前已复核 PNG 做 hash 回归核对                        |
| readiness            | Black Gold candidate live PASS；未提升 production/default                                      |
| 发布与维护检查       | smoke、strict public audit、投影漂移、lint、format、typos、skill quick validation 通过         |

38 项跳过是原有环境/可选集成条件，不计为通过。new style 的长期 golden 只登记代表性八页；
stress、mixed、非金融和中间轮次保留在本地 run，不进入发布包。

## 可查看的样例

- [八页主样例 PPTX](../.tmp/deckkit-black-gold-ledger-contract-20261021/reference.pptx)
- [主样例总览](../.tmp/deckkit-black-gold-ledger-contract-20261021/iterations/12/contact.png)
- [同内容的趋势/排名构图变化](../.tmp/deckkit-black-gold-ledger-contract-20261021/matrix/06/variants/reviewed.pptx)
- [中英混排](../.tmp/deckkit-black-gold-ledger-contract-20261021/matrix/06/mixed/reviewed.pptx)
- [数值与密度边界](../.tmp/deckkit-black-gold-ledger-contract-20261021/matrix/06/stress/reviewed.pptx)
- [相同皮肤的非金融主题](../.tmp/deckkit-black-gold-ledger-contract-20261021/non-finance/reviewed.pptx)

这些是本地证据链接，生成 PPTX、PNG/PDF 不提交到源码。当前 run 为
`.tmp/deckkit-black-gold-ledger-contract-20261021/`，历史目录名保留来源名称；套件 id 已统一为 `black-gold`。
最终主样例使用 `iterations/12`，压力/混排使用 `matrix/06`，live golden 证据使用 `benchmark/04`。

## 后续迁移入口与 deckkit-maker 改进意见和反馈

[deckkit-maker 新输入路线](../deckkit-maker/references/design-source-migration.md) 已结合本次实际过程完善：

1. 支持 design.md + 单图/多图/合成图，区分来源事实、软偏好、领域政策和设计裁决。
2. 新增 `analyze-design-source.mjs`，保存输入指纹、尺寸、建议分割与可选裁图；拒绝覆盖旧证据。
   它不自动理解设计、不验证 EXIF 方向；等高分割必须看图确认。
3. 不要求额外 HTML/PPTX，不把参考图质量当作设计上限；按用户授权修正对比度、层级与构图。
4. 内容泄漏审计原来只覆盖文字 op，现增加原生表格单元格及经典图表类别/系列名，并有反例测试。
5. 槽位探针原来同时填入所有可选字段，会制造非法组合；新增 `x-slotProbeVariants`，只允许省略
   可选字段，要求所有字段至少被一组探针覆盖，未弱化审计。已有八套回归通过。
6. 原生能力须先做完整性探针；canonical PDF 可发现 vision 未发现的实际字框溢出。

新增风格应先提取自己的身份和构图，再选择已有视觉族；有新语法才扩展组件，最后走同一套
输入、数据、渲染和交付门禁。不要只给通用卡片换色，也不要承诺 Markdown 自动变成合规 PPTX。

## 当前边界

- 仍是 candidate，生成质量已验证；自动生产选择与 promotion 资格是另一层状态。
- 单元格暂限一个作者段落，可自动换行；复杂合并、财务敏感性模型和任意表格尚未覆盖。
- 进度条为生成时派生的原生形状；在 PowerPoint 内单独改表格值后不会自动同步。
- combo 的限制针对本次运行时投影证据，未宣布引擎不能创建 combo。
- 未验证完整 OOXML/工作簿、实际字体跨环境一致性或 PowerPoint 宿主全部渲染行为。
- 金色像素占比、完整金融政策、事实与推理质量没有自动验证器；皮肤不替代内容审查。
- 未验证任意旧 deck 的 Black Gold 翻新路径；其创建能力不构成翻新保真证明。
