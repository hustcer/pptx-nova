# Broadside 标题大小写调整

日期：2026-10-22。`broadside` 保持 **2.0.0 / candidate**。
这是[2.0 迁移](broadside-v2-migration-results.md)之后的定向文案与指南修订，
未修改渲染器、设计 JSON、字体、布局几何、容量或数值模型。

## 撰写规则

- 普通英文标题默认 **sentence case**：首词大写，保留专有名词和缩写的正确写法。
  覆盖页面标题、比较面标题、流程/闭环步骤、时间线节点及层级名称。
- 换行不重新大写。示例从 `research in\nthe open` 改为 `Research in\nthe open`。
- 封面、章节和短宣言可以有意使用全小写；衰减词口号和结尾行动短句属于这个选项。
  这不是每页标题的硬性要求，也不覆盖用户或品牌指定的 Title Case 等约定。
- 渲染器保留输入大小写和标点，不自动转换，也不拒绝其他合法写法。
  `AI`、`PowerPoint`、机构名等不得因追求小写而改变。中文不受大小写规则影响。

已统一 catalog 的 visualGrammar、翻新标题提示、intent、DeckKit README 和公共合同指南。
移除了“不要大写标题”的绝对指令。完整示例、登记的压力与混排 fixture 共调整 37 处标题，
另将结尾联系方式里的机构名恢复为 `Field Studio`；正文、数字、来源和其他事实保留。

## 当前产物与验收

独立 run 为 `.tmp/deckkit-broadside-casing-20261022/`，下文简称 RUN；
运行时为 `xdoc 0.13.0 (92a5aa13)`，冻结日期为 2026-10-22。

| 当前样例             | 页数 | RUN 内路径                                 |
| -------------------- | ---: | ------------------------------------------ |
| 完整英文示例         |   16 | `iterations/01/golden/reviewed.pptx`       |
| 同内容的全部替代构图 |   12 | `iterations/01/alternatives/reviewed.pptx` |
| 登记的密度边界样例   |    4 | `iterations/01/stress/reviewed.pptx`       |
| 登记的中英混排样例   |    3 | `iterations/01/mixed/reviewed.pptx`        |

四份文件均走标准 Create、绑定实际 canonical PNG 的视觉记录及 finalize；
各自 `run/create-run-summary.json` 为 `delivered / deliveryReady=true`。
当前源码生成的 patch 和完整 designPlan 与这四份候选一致。

**机器检查：** 内容校验、dry-run/apply、设计对象与数值回读、vision 和 canonical 门禁通过。
Broadside 三类 live benchmark 通过，vision H0/M0/L0；candidate readiness 通过，未放宽旧基线或门禁。
38 项 Broadside/合同测试通过；`input-casing-audit.json` 的 78 次探针覆盖 sentence case、
Title Case、全小写与 `AI in PowerPoint`，确认全部 26 个含该类文字槽位的布局保留原输入。
统计页的两个布局没有此类标题槽位；它们仍包含在 28 布局的生成回归及实际视觉覆盖中。
另有 119 项工作流与展示更新工具测试通过，本次共 157 项测试通过、0 失败、0 跳过。
smoke、strict public audit、投影和提交前检查见 RUN 的 `final-audit.json`。

**视觉检查：** 对上述当前候选共 35 张 canonical PNG 逐张以原分辨率查看，
见 `visual-review-ledger.json`。另放大检查橙色比较面、五层带底色标签、密集时间线底部及
横向时间线的两行标题，见 `details/manifest.json`。没有截断、越界、缺字或需修复的换行。
contact sheet 只用于检查整体节奏，不代替逐页检查。

**原生宿主：** 当前 golden 通过 macOS PowerPoint clean-open，无 Repair，报告为 `clean-open.json`。
本次未重跑完整的四份另存重开和代表对象编辑矩阵；[迁移报告](broadside-v2-migration-results.md)
中的那些结果绑定当时的候选，不作为本次新 PPTX 字节的验证结果。

## 展示替换与维护反馈

当前 [deck.pptx](../pptx-nova/assets/examples/broadside/deck.pptx) 和
[contact-sheet.webp](../pptx-nova/assets/examples/broadside/contact-sheet.webp)，连同 content、brief、
summary 由标准展示更新工具同步；有变更的文件原位替换，brief 及两级展示索引也由工具检查。
最新公开 PPTX 与本轮 golden 的 SHA-256 相同：
`30fe8fa99f987cd876c218791c7f780aaaf2fd050ef0e9b57bd0baebcca4f45c`。
旧参考与旧轮次证据只读保留。

deckkit-maker 的 componentize 指南补充：区分参考大小写偏好与必要身份，不把一次性示例
推广为绝对规则；保护专名、缩写和用户输入，改写示例后重新检查宽度与换行。
本次没有新增大小写转换器、大小写校验门禁或未关闭的 skill 问题。

套件仍为 candidate。字体不嵌入、环图独立图例需重新生成同步等既有能力边界不变；
本次结果不外推为所有平台、字体环境、动画或任意旧稿翻新通过。
