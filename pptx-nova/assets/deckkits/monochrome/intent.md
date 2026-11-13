# Monochrome：奶油纸上的单墨编辑系统

通过标准 `design / slots / validate-content / create build / create run` 使用；从同目录
`examples/content.json` 开始，只写内容与合法 `layoutId`，无需手写坐标。当前版本0.1.0，
readiness以catalog为准；candidate需要显式选择，不代表production/default交付选型资格。

## 身份与构图

奶油纸FAFADF、暖黑1A1A16、石墨解释、细黑规则线、宽非对称页边距和大面积留白构成身份。
标题/数字使用Avenir Next Ultra Light；正文Avenir Next；引文Georgia、洞察标题Georgia正体；
结构文字JetBrains Mono。中文使用Noto Sans SC，衬线角色Songti SC。字体不随套件打包。
正文12pt，长文紧凑规格10.5pt，元数据10.5pt。仅Latin引文使用真实斜体；含中文引文整体正体，
避免合成倾斜。文字大小写、数值、换行均来自content；英文结构标签建议由作者写成大写。
没有色彩驱动的风险/达标政策，也没有自动选择某个数值作为目标或强调的规则。

| 页型                | 职责           | 注册布局                    |
| ------------------- | -------------- | --------------------------- |
| monoCoverSlide      | 封面           | bottom / editorial          |
| monoOpeningSlide    | 章节或观点     | chapter / statement         |
| monoSplitSlide      | 文字与占位图壳 | right / left                |
| monoMetricsSlide    | 描述性指标     | row / rail                  |
| monoListSlide       | 建议清单       | split / wide                |
| monoComparisonSlide | 两种方案       | side / stacked              |
| monoQuoteSlide      | 引文           | inset / wide                |
| monoAnalysisSlide   | 双栏长文或洞察 | columns / insights          |
| monoChartSlide      | 数值证据       | wide / left / right         |
| monoProcessSlide    | 有序流程       | sequence / timeline / cycle |
| monoHierarchySlide  | 顺序层级       | pyramid / ladder            |
| monoClosingSlide    | 收束           | left / center               |

12类职责、26个构图。`auto`按真实内容容量和近期几何确定选择；显式布局也必须适配。
同一内容的合法变体改变实际位置、区域关系或层级宽度，不能仅修改名称。
完整deck从cover开始，以closing结束；独立摘录使用`meta.designScope: "excerpt"`。
留白和跨页节奏是判断，不通过编造内容强制凑页数。

## 容量与编辑边界

- 指标2–3项，普通清单2–5项，图文清单2–3项，两方案各1–3条，分析固定2个内容块。
  长文columns和较稀疏insights使用不同可读容量；容纳不了时换合法布局、重组或拆页。
- 原生单系列柱图/环图2–4分类，必须给原始数值、unit、seriesName、source与note。
  柱图允许负值、零、极小值；环图非负且总量大于零。wide仅支持柱图。
  显示格式按数值范围请求整数、小数或科学记数，不改变原值；canonical可能回退到完整小数显示。极小柱在共享线性轴上可能不可见。
  环图外部图例显示原值，单位独立标明；不把计数自动转换为百分比。
- 柱图采用统一墨色；环图使用受控灰阶。原生图表数据可编辑，独立图例/注记不会在手改数据后同步，
  须从content重新生成。不要把图表cache中存在文字当成可见槽位已验证。
- 流程2–5步：sequence最多4步，cycle恰好4步，timeline支持2–5步。
  可选date在每种布局都显示；顺序流程不用箭头，cycle保持正确闭环。
- 层级3–5层，宽度表达顺序而非数量。每层原生形状自身持有居中文字，浅深灰阶分别用深/浅文字。
- 图文页提供原生可编辑占位外壳和caption，不接收实际图片。没有注册原生表格页、任意图形输入、
  动画或现有源稿翻新能力；不要从generator能力推导这些能力。

所有声明字段均校验并可见；空白必填字符串、未知字段、非法图表值、超量条目、越界内容和
未知布局会失败。字号固定于合同，不会按内容无限缩小。schema预算是发现提示，最终以
逐实例计划、应用后回读及canonical实际画面为准。

## 来源与主要裁决

来源是Monochrome目录内全部三个文件。HTML实际16页，metadata声明18页，按DOM记录并
完成16页探索基线；正式示例16页保留全部原始页面语法（合并为12类公共职责）；补充证据覆盖其余合法构图。
默认16:9与实际浏览器用途一致。Jost/Lora未在本机安装，替代字体经实际canonical与PowerPoint探针选择；
字体名称存在或PostScript名称可写不足以证明字重正确。

metadata的“衬线标题”与详细设计/CSS矛盾，采用后者的轻量无衬线。
规范要求Latin引文斜体而CSS示例为正体，采用规范的真实斜体；中文依专门条款保持正体。
对“中文标题一律700”的建议作可读性裁决，采用正体常规标题，延续实际HTML的轻量身份；
粗体并不作为标题默认。隐藏侧栏、浏览器页码、导航和入场动画不迁移。
过淡小字改为可读石墨色并增大；手算柱高改为原生数值比例；循环左侧回箭头修正为向上。
原稿默认柱/目标柱的填色不转成业务默认政策，采用单墨柱；阶梯/环图保留灰阶。
仅文档/CSS存在、DOM缺失的洞察卡片作为有用途的analysis变体，不虚构源页。

所有正式示例、比例、引文与观察均明确标为合成演示；套件不声称它们是研究事实。
未携带一次性图片、参考截图或业务政策。`core-primitives`未修改。

验收范围、证据身份、逐页结果与原生宿主边界见
[迁移与验收记录](../../../benchmarks/visual/cases/monochrome/golden-library/review.md)。
