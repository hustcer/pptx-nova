# DeckKit 设计合同试点：第一、二阶段结果

日期：2026-10-21。分支：`re/design`。试点：`biennale-yellow` 0.2.0，保持已有 production 状态。
实际运行时：`xdoc 0.13.0 (ea2c8e58)`。没有修改 `core-primitives.kit.mjs` 或 xdoc schema 快照。

## 已落地

### 第一阶段：合同与执行分离

- [design.json](../pptx-nova/assets/deckkits/biennale-yellow/design.json) 成为颜色、字体、语义角色、文字槽位与新布局的事实源。
- [intent.md](../pptx-nova/assets/deckkits/biennale-yellow/intent.md) 说明设计意图、适用边界与视觉判断。
- 抽取了 48 个文字槽位定义；旧 kit 的 39 处文字调用改为读取合同，原有八种内容输入继续兼容。
- 抽取后先将完整 671 条旧 patch 逐项比对；仅归一化新增的 CJK 字体声明，几何、内容、字体、色彩、效果和段落操作一致。
- 随后修复真实 canonical 检查发现的旧问题：标签/来源字号、文字框高度、页脚容量、KPI 重叠、programme 分隔线，以及引文孤行。没有通过放宽视觉门禁解决问题。
- 生成 schema 槽位预算与翻新颜色/字体投影，支持 `--check` 检测漂移。重复槽位按实际实例解析，value+suffix 采用组合预算。
- 标准构建保存合同快照、设计计划、规则报告；标准创建增加文本、几何、原生图表数据回读，并将证据绑定到最终交付。

### 第二阶段：受约束的多样性

- 新增 `biennaleEvidenceSlide`，使用原生 PowerPoint bar/line chart；原始类别、系列名和数值可回读。
- 三种构图：图表 + KPI 侧栏、顶部 KPI + 下方图表、顶部图表 + 下方 KPI。
- `layoutId: "auto"` 根据内容容量确定性选择，优先使用较少出现的合法构图，并基于解析后几何/组件样式的指纹避免连续重复。改变布局名称不会绕过重复检查。
- 纯证据页 deck 使用真实构图节奏检查，避免因同属一个页型而被旧分组门禁阻断。八页样例稳定轮换三种构图；显式重复产生复核 warning。旧页型和混合页型仍走原分组检查。
- 标题可扩展到两行；正文和标签容量有边界。中文布局换行保留全部字符并避免标点孤行。
- 缺失值、非有限数值、超量内容、多个强调点和不合法布局会失败并给出调整方向，不静默改成零或删内容。
- 原生负值条保持目标色，分类标签放在低侧，折线明确关闭平滑插值。旧形状条不再把零强制画成 4%。
- 共享证据组件读取语义角色，不依赖 Biennale 的物理色名；另有不同角色映射/配色的复用测试。

## 验证结果

| 验证                               | 结果                                                       |
| ---------------------------------- | ---------------------------------------------------------- |
| 全仓测试                           | 461 项：423 通过、38 跳过、0 失败                          |
| smoke / strict public audit        | 通过                                                       |
| 全部 DeckKit slot consistency      | 通过                                                       |
| 投影生成 `--check`                 | 通过                                                       |
| Biennale 两个注册 golden benchmark | 全部通过，vision high/medium/low 均为 0                    |
| live readiness                     | candidate / delivery 通过；保持 production，不变为 default |
| 原八页 canonical Create            | proceed，0 findings                                        |
| 同内容三构图                       | 3 页，proceed，0 findings                                  |
| 密度/零值/负值/长数值/极小数值     | 3 页，proceed，0 findings                                  |
| 中文/长标题/长分类标签             | 3 页，proceed，0 findings                                  |
| 长篇纯证据页自动构图               | 8 页，三种构图，proceed，0 findings                        |
| 对象/文本/原生数值回读             | 25 页全部通过；其中 17 页包含原生图表数值                  |
| Agent PNG / contact sheet 复核     | 8 页原样例 + 17 页新证据矩阵，未发现 hard defect           |

38 项跳过属于既有测试的环境/可选集成条件；不将其计为通过。原八页仍有两条保守的文字容量
估计 warning，已用实际 canonical PDF/PNG 验证无溢出，未取消容量检查。

同输入确定性测试、非法规则/颜色/字体/效果反例、改名相同几何反例、数据类型与强调冲突、
数值/对象/文本变更回读、设计证据篡改和旧合同交付拒绝均有回归覆盖。

## Agent 使用入口

完整操作见 [design-contracts.md](../pptx-nova/references/design-contracts.md)。日常内容作者仍只写
`content.json`，然后使用原来的 validate/build/create runner，无需另写生成脚本或原始坐标。

```bash
node pptx-nova/scripts/pptx-nova-deckkit-design.mjs --deckkit biennale-yellow
node pptx-nova/scripts/pptx-nova-deckkit-design.mjs --deckkit biennale-yellow --content content.json
```

维护者可重跑 `node tools/generate-pptx-design-projections.mjs biennale-yellow --check`，以及
`node tools/pptx-nova-design-matrix.mjs --out <new-directory>`。后者保存完整输入、锁、能力、patch、
回读、canonical 报告与 PNG，且拒绝复用已有输出目录。

## 本次证据与示例

已复核并完成最终交付绑定的文件：

- [八页原输入回归 PPTX](../.tmp/deckkit-biennale-yellow-contract-20261021/legacy.pptx)
- [同内容三种构图 PPTX](../.tmp/deckkit-biennale-yellow-contract-20261021/matrix/09/variants/reviewed.pptx)
- [数值压力测试 PPTX](../.tmp/deckkit-biennale-yellow-contract-20261021/matrix/09/stress/reviewed.pptx)
- [中文与长文本 PPTX](../.tmp/deckkit-biennale-yellow-contract-20261021/matrix/09/mixed/reviewed.pptx)
- [八页自动构图 PPTX](../.tmp/deckkit-biennale-yellow-contract-20261021/matrix/09/long/reviewed.pptx)
- [八页构图总览 PNG](../.tmp/deckkit-biennale-yellow-contract-20261021/matrix/09/long/contact.png)

这些链接指向本次本地证据，不是仓库分发资产。原输入回归覆盖原八种页型；字体/可读性和
已记录的空间修正属于有意改进，不宣称与旧预览逐像素相同。新证据组件的文件包括
`assets/deckkits/design-contract.mjs`、`design-text.mjs`、`evidence-components.mjs`、
`validate-deckkit.mjs`；代理入口为 `scripts/pptx-nova-deckkit-design.mjs`。合同 schema、
九个页型 schema、catalog、原/新增内容样例、两个 golden cases 与针对性测试同步更新。

所有迭代保存在 `.tmp/deckkit-biennale-yellow-contract-20261021/`，未清理旧轮次，生成的 PPTX、
PNG/PDF 和完整报告不提交到源码。主要证据为：

- `baseline/contract-extraction-comparison.json`：第一阶段抽取前后比对。
- `legacy-final-03/`：最终八页原输入回归。
- `matrix/09/`：最终 variants / stress / mixed 三组各三页，以及 long 八页；全部已复核并绑定交付。
- `benchmark/08/`：两个注册 benchmark 的当前 live 证据。
- `all-tests-03.txt`、`final-smoke-02.txt`、`final-slots-02.json`：最终测试记录。
- `skill-feedback.md`：工具流程摩擦及修复记录。

## 当前边界

这是 Biennale 的 opt-in 试点，其他七套 DeckKit 没有批量迁移。旧数据页/日程页仍为形状和文本；
原生数值图表使用新证据页。新页当前要求两项 KPI、有限数量的 bar/line 数据，不是任意内容的
通用排版求解器；不合适时由 Agent 调整内容组织或拆页。

机器验证覆盖明确的硬规则、文本/对象和原生数值；不等于完整 OOXML/工作簿等价或 PowerPoint
渲染保真证明。字体必须由实际环境解析。当前 xdoc 对所请求的科学计数格式采用完整数值回退，
已分别检查显示与原值，不能把“请求了格式”称为“已验证该格式渲染”。

## deckkit-maker 改进意见和反馈

1. 操作数量曾被写成视觉质量下限，容易诱导无意义装饰；已修正文档，质量改由内容与渲染证明。
2. 长哨兵无法进入合法的组合 KPI 槽位，造成 slot consistency 误报；已缩短哨兵并通过全套件回归。
3. 旧 golden 历史通过不足以证明当前 Create 通过；本次发现并修复真实溢出、小字和分隔线问题。
4. 图表字段虽出现在 schema 中，也未必适用于每种 chart kind；`invertIfNegative` 在 line 系列产生
   OOXML warning。本次执行器已按 kind 分支，保留 dry-run 阻断，未绕过语义检查。
5. 旧分组多样性检查将长篇纯数据内容判为缺少其他页型；已为合同证据页增加真实构图检查，
   并用八页自动构图、显式重复和旧门禁保留三个方向验证，避免要求 Agent 编造无关页面。
