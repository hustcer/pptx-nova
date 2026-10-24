# Clear Impact 0.1.0 迁移验收

状态：`candidate`，2026-10-24。十二类职责、二十四个有界构图均经注册合同执行。
须显式选择，未提升为 production/default；未修改 core-primitives，未新增外部运行依赖。

## 来源与裁决

参考 `moon-white-imagery/design.md` 和 `moon-white-imagery.jpg` 全部只读保留。
文档 SHA-256：`30e29b39a01630a1fa91b915731a5529b559fcec42a32def2c071be3f0c9dfcd`。
图片 SHA-256：`b0e3108684e7dea8326107457e4f6fcda485e26a84a1068e2dc8faecc2388baa`。
图片实际为 1920×8640，即八张 1920×1080 页面，采用 16:9，无比例冲突。
文档“38 页、23 张摄影页”与实图冲突：采用共同支持的白底、深绿层级、鲜绿重点、细线和开放模块，
不将未见摄影语法注册为已验证能力。保留八张参考页的全部职责，另按授权扩展达成、差异、里程碑和决策四类。

主要适配：Arial / Arial Unicode MS 替代无法确认的 Liter / MiSans；浅灰小字加深，白底绿字改用可读深绿；
来源与表格至少 10.5pt；衬线表格、黑色结尾统一为正体深绿无衬线。安全边距和可读性优先于贴边、小字。
本机 Arial 使用实际 Regular/Bold；Arial Unicode MS 仅有 Regular，中文粗体由宿主合成，已检查无意外倾斜。
未加入摄影、渐变或圆角卡片。业务实体、年份、阈值、状态、观点与来源只来自 content，所有验证数据均标为合成/示意。

## 公共产物

[design.json](design.json) 是 token、字号、空间、区域、容量及布局的唯一事实源，
[intent.md](intent.md) 记录身份、构图自由度、编辑边界和标准工作流。
[薄适配器](../clear-impact.kit.mjs) 经 [注册器](../impact-registry.mjs)、[布局解析](../impact-layouts.mjs)
和 [组件执行](../impact-components.mjs) 实现 `impact-evidence/v1`。
十二份页型 schema、content/design schema、catalog、槽位投影、示例 build、
[完整合成内容](../examples/clear-impact-content.json)、golden fixture 和仓库测试均已同步。

## 最新有效证据

运行根目录为仓库下 `.tmp/deckkit-clear-impact/`，被 git 忽略。下表路径相对运行根目录。
PPTX/PNG/PDF 及完整报告未提交；完整路径、哈希和逐页记录见运行目录 `acceptance-report.md`、`audit/visual-review-ledger.json`。

| 样例               | 有效 PPTX                                        | canonical 逐页结果                                         |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------------- |
| 完整英文示例       | `final/clear-impact-example.pptx`                | `final/create-golden-03/visual-evidence/candidate/`，12/12 |
| 第二构图           | `coverage/alternate/iteration-05/deck.pptx`      | 同目录 `canonical/candidate/`，12/12                       |
| 密度与边界         | `coverage/stress-density/iteration-04/deck.pptx` | 同目录 `canonical/candidate/`，12/12                       |
| 中文、图书馆跨主题 | `coverage/chinese/iteration-04/deck.pptx`        | 同目录 `canonical/candidate/`，12/12                       |
| 中英混排           | `coverage/mixed-language/iteration-04/deck.pptx` | 同目录 `canonical/candidate/`，12/12                       |

最终示例经标准 Create runner 发布，`delivered` / `deliveryReady=true`，与已审 candidate 字节一致。
新证据替代 `final/create-golden-02/`、alternate `iteration-04/` 及另外三组 `iteration-03/` 的质量结论；旧文件留存。
Phase 1 基线为 `iterations/10/deck.pptx`，参考职责覆盖 8/8，另有四页授权扩展。

## 分层验收与覆盖

机器：五组 content、dry-run、apply、inspect、canonical、设计对象回读通过。
完整示例回读 296 对象、1 原生柱图、2 原生表格，逐格文字及图表数值一致。
五组 vision high/medium 均为 0；最新 golden benchmark high/medium/low 为 0/0/0。
十二页型 slot-consistency 无 ghost slot；中文/混排 patch 和实际 PPTX 提取文本均无参考领域文案泄漏。
最新 benchmark 与 required-live candidate readiness 通过，catalog 同步本轮结果及人工 hard defects=0。
仓库脚本测试 118/118、smoke、strict public audit 通过。

视觉：同一候选文件的 60 张 canonical PNG 全部逐张检查，contact sheet 仅检查节奏。
状态单元格、密集表格、图表负数/零/极小值、纵向反馈箭头、深色底带及附注放大复核。
未发现缺字、意外斜体、标签溢出、压线或未关闭 hard defect。
迭代修复了日期穿线、反馈箭头、结论距末横线、指标换行和 PowerPoint 整数标签尾随小数点。

复用：全部 24 布局有最小输入及显式布局测试，十二组实际几何不同；其中十页变体使用相同内容，
流程首节点等义重排，容量竖排另用两条显式指标，未冒充五指标等价验证。
压力样例覆盖合理最大数量：5 个指标、6 个柱值、4×5 比较表、6×5 状态表、4 个流程/承诺/进度/里程碑及 3 个决策；
另含负数、零、极小数、120% 达成及零差异。未穷尽二十四布局所有字段同时达到最长字符数；超容量须换布局或拆页。
缺单位/来源、多 focus、超容量、未知字段/规则、customOps、错误合计、非正目标、错列数、长标题和越权视觉样式均被阻断。

原生：Microsoft PowerPoint for Mac 16.114.1 实际打开五份最终候选，另存副本、关闭重开，无 Repair、内容移除或丢页。
保存前后全部对象种类/数量、正文、表格文字、图表系列与原始值一致。
最终源码对应的隔离副本经 Excel 修改柱值 96→97、原生表格修改 47→48，保存重开并回读确认。
记录见 `audit/native-host.json`、`audit/native-editability.json`。
可选 System Events clean-open helper 超时返回 skipped，不计为通过；原生验收由独立 CUA GUI 与保存文件回读完成。
其他 Office 版本/平台、完整嵌入工作簿 XML 等价及跨渲染器逐像素一致性未验证。
极小数在 PowerPoint 按格式显示科学记数，当前 xdoc canonical 可能显示等值十进制，原始值一致且可读。

## 边界与 deckkit-maker 反馈

柱图、表格、文字、线条和形状原生可编辑。达成条、差异桥来自同一数值来源，属于原生形状，
不冒充原生瀑布图。手工修改不会自动同步独立旁注、状态和派生几何，应修改 content 重新生成。
无摄影、图标、多系列/组合图、动画、既有 PPTX 原生翻新或 customOps；字体不嵌入。

已落实三项改进：数值联动合同支持有限数值 `x-slotProbeValue`，保留可见字符串哨兵；
视觉指南增加分隔线端点、结论与横线间距及纵横反馈箭头复核；原生数值标签检查发现格式差异，
生成端使用整数 `0`、常规小数 `General`、极值科学记数并补回归测试，指南同步检查项。
未关闭阻塞问题：无。以上不代表 production 资格。
