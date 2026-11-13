# Monochrome 0.1.0 迁移与验收

目标与结果：candidate。默认16:9，中文、英文及混排；十二类公共职责、二十六种注册构图。
最终完整示例保留原始HTML的十六种页面语法；参考文字、数值、实体和领域政策均未进入可复用逻辑。
所有示例数据与引文明确标为合成演示。

## 来源与裁决

输入为Monochrome目录全部三个文件：design.md、template.html、template.json。
metadata声明18页，DOM实际16页，以实际DOM逐页基线为准。HTML流式画布没有相反的固定比例，采用16:9。
metadata的Lora标题与详细规范/CSS的Jost轻标题冲突，采用轻量无衬线身份。
本机没有Jost/Lora；实际canonical和PowerPoint字体探针后选Avenir Next Ultra Light、Avenir Next、
Georgia、JetBrains Mono，CJK使用Noto Sans SC/Songti SC。字体不打包，其他环境须重新核验。

奶油纸、单墨、灰阶、非对称留白、细规则线、em dash列表、衬线引文和开放结构保持。
元数据由原稿约6.9pt提高到10.5pt并加深；常规正文12pt，长文10.5pt。
中文标题采用正体常规，保留实际HTML的轻量身份；Latin引文真实斜体，含CJK引文整体正体。
源柱高并不严格比例，改为原生数值图；cycle左侧向下的回箭头改为向上闭环。
CSS固定小圆角采用有界原生路径，避免预设roundRect随高度放大。
隐藏侧栏、浏览器导航和动画不迁移；图壳保留为明确标识的原生占位。

## 最终样例与逐页结论

发布示例：[PPTX](../../../../../assets/examples/deckkits/monochrome/deck.pptx)、
[预览](../../../../../assets/examples/deckkits/monochrome/contact-sheet.webp)、
[内容](../../../../../assets/deckkits/monochrome/examples/content.json)。
最终PPTX SHA256：`14770af5fac3528078f825c225752a46fb50493b5c0306783fb55bbfe7c9a46e`。
canonical Create审查、benchmark及发布showcase为同一PPTX字节；冻结field date为2026-11-13。

|  页 | 构图         | 实际canonical PNG检查                  |
| --: | ------------ | -------------------------------------- |
|   1 | 底置封面     | 轻标题、留白、来源完整                 |
|   2 | 章节         | 双行主张与支撑段分离                   |
|   3 | 观点         | 独立规则线、主张和支撑段完整           |
|   4 | 图文右壳     | 三条动作、居中标签和caption完整        |
|   5 | 横排指标     | 三个大数字、描述与依据无相碰           |
|   6 | 非对称清单   | 五条动作及限定段完整                   |
|   7 | 双方案       | 开放双栏与中央线清晰                   |
|   8 | 引文         | 真实斜体、虚构归属和来源清楚           |
|   9 | 开放长文栏   | 两个块及所有文字保留                   |
|  10 | 全宽柱图     | 原值18/27/35/44、单位、来源完整        |
|  11 | 四步序列     | 无箭头规则线、编号和正文完整           |
|  12 | 左侧环图     | 四分类原值及独立图例完整               |
|  13 | 五步时间线   | 日期、圆点、末段与页脚有间隔           |
|  14 | 四步闭环     | 日期齐全，向上回箭头正确               |
|  15 | 五层序数结构 | 每层原生形状持有居中文字，灰阶对比合格 |
|  16 | 左置收束     | 双行结尾、支撑段及来源完整             |

最终完整示例16/16、同内容替代样例16/16、混排异主题12/12、纯中文4/4、
全布局与压力样本30/30均实际逐页看过canonical PNG，总计78页；contact sheet仅补充节奏判断。
关键标签、层级居中、图表标签/来源、五步时间线底部、洞察圆角另作150–160%放大检查。
未注册圆内文字或表格，其专项检查不适用。零未关闭人工硬缺陷。

## 机器覆盖

- 标准Create链路：content、lock、dry-run、apply、设计回读、vision与canonical Create全部通过；
  五组最终候选经hash绑定的design/visual review后由runner finalize发布。
- 每个注册布局、每类最小/最大合理条目数、未知字段、空白必填、超量、非法布局、
  非法环图值、非有限数、实际容量超界、任意颜色/字体/效果反例均有测试。
- 同内容替代样例14页改变真实几何；五步时间线与语义闭环在无其他合法变体时保留原构图。
- 负数、零、极小值、最多四分类环图、带日期流程、五层结构、长文空段落及中文字体均有实际样本。
- 异主题使用河岸社区材料；九项参考专有词denylist、全部emitted strings回归及应用后回读均通过。
- dry-run/apply各有两条低风险chart-label-density-unknown提示（第10/12页），实际图表与标签审查通过；
  golden benchmark三次构建重复通过，vision高/中/低均为零；required-live candidate readiness通过。
  投影生成检查、slot consistency、全套测试、smoke、公共审计和showcase重生成检查均纳入本轮记录。

## PowerPoint原生验证

PowerPoint for Mac16.115实际打开最终16页样例，无Repair。
同源30页组合验证副本包含全部布局、六个原生图表和路径/层级文字，实际编辑标题、保存、关闭并重开；
30页及其他所有对象/文字保留，六个图表数值语义不变。Office将0.000001序列化为更长的小数字串，
仍是同一IEEE754数值。另一个验证副本实际在嵌入Excel中将柱图18改为21，柱高/标签同步更新，保存重开与回读通过。
上述编辑仅作用于独立副本，发布PPTX不含验证标记。

原生导出覆盖主示例16页、压力样本30页、混排12页；人工原生抽查主示例5/12/13/15页，
压力16/22/29/30页、混排7/9页和独立字体探针。未把原生全量导出等同于原生全量人工审查。
最终自动clean-open助手因System Events超时标记skipped；保留报告，以CUA实际观察、原生导出、
保存重开与结构回读完成替代验证。未使用Repair后的删除内容文件。

未验证：Windows PowerPoint、freeform逐点编辑、环图嵌入Excel改单元格。
候选级别不代表production/default；其他系统和字体配置需重验。

## 已知边界与迁移

首次发布0.1.0，无旧API迁移；使用标准workflow提供content与layoutId，无需坐标。
指标最多3项、清单最多5项、图表单系列2–4分类；流程sequence最多4步、timeline最多5步、cycle恰好4步；
层级3–5层且宽度只表达顺序。无法容纳时换合法布局、重组或拆页，禁止静默截断或改值。
图壳不接收实际图片，没有注册表格、动画、任意图形输入或现有PPTX翻新能力。
独立环图图例/注记不会随手改图表数据同步，须从content重生成。
极小柱可能不可见；科学记数格式在PowerPoint正常显示，canonical预览可能回退完整小数。
两端数值/几何一致且可读，此预览格式差异已作为非阻塞限制披露。

## 流程改进

修复HTML捕获对display:none侧栏的误报，保留透明可布局文字的阻断；加入双向回归。
修复共享执行器对空段落run0的无效寻址，以及应用后回读丢失空段落索引的误报，仍阻断真实缺失/错序。
在deckkit-maker前置流程加入字体/固定圆角/新组合的一页探针与实际宿主比较，
并要求长任务核对可执行文件SHA256；本次升级后重验16页旧基线，全部PNG逐字节相同。
这些改进适用于其他套件；未修改core-primitives，也未复制一整套生成器。

本轮完整证据保留在仓库本地`.tmp/deckkit-monochrome/`：最终主示例为`validation/golden/05/`，
benchmark/readiness同用`benchmark/03/`；详见`acceptance-report.md`、`visual-review-ledger.md`、
`native-host-review.json`和`skill-feedback.md`。临时证据未作为公共运行时依赖。
