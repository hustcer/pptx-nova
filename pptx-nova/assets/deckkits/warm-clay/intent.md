# Warm Clay

奶油纸底、墨棕正体衬线标题、陶土证据、粉色编号和角落圆环构成暖陶土风格。适合工作复盘、
项目报告与文化机构的证据叙述。身份、字号、区域和容量以 [design.json](design.json) 为事实源。
业务结论、单位、来源、日期、状态与阈值全部由 content 提供，不自动加入行业政策。

参考是 Warm Clay Works 的 design.md 和八页纵向合成图；每页均为 16:9，无比例冲突。
通用底稿声称“零装饰、无封面、每项指标必须目标/实际/达成率”，但具体规范与图像有封面、
角落圆环及独立大数字。具体视觉语言优先；通用业务规则不转为皮肤限制。
原稿正文小字和标签对比度不足，已加深可读陶土色、放大附注并预留页脚。
参考照片为一次性素材，不复制；封面保留带粉色偏移背板的原生占位外壳，暂不接收图片资产。
背板采用实际图像的左下偏移；规范文字中的左上偏移与图片冲突，已按画面裁决。

## 标准工作流

从 [合成示例](../warm-clay/examples/content.json) 开始；无需手写页面坐标：

```sh
node pptx-nova/scripts/cli/deckkits/design.mjs --deckkit warm-clay
node pptx-nova/assets/deckkits/validate-content.mjs content.json --deckkit warm-clay --mode delivery --json
node pptx-nova/scripts/cli/create/build.mjs --deckkit warm-clay content.json -o patch.json
```

标准 Create runner 使用同一合同、对象/数值回读和候选交付绑定。当前为 production，可参与自动交付选择。
完整 deck 用 `meta.designScope: "complete"`，
以封面开场、承诺页收束；单页及节选使用 `"excerpt"`。

| type                 | 职责                           | layoutId                             |
| -------------------- | ------------------------------ | ------------------------------------ |
| clayCoverSlide       | 文字、引文、指标及竖幅占位外壳 | portrait / editorial / statement     |
| clayOverviewSlide    | 指标与粉色编号发现             | rail / band                          |
| clayChartSlide       | 单系列原生柱图与解释           | chartLeft / chartRight               |
| clayComparisonSlide  | 原生比较表与引文证据           | side / stacked                       |
| clayProcessSlide     | 指标与编号处理链               | chain / vertical                     |
| clayKpiSlide         | 开放式指标与说明               | strip / rail                         |
| clayStatusSlide      | 原生状态表及附注               | wide                                 |
| clayNarrativeSlide   | 定性主张、语义分节与关系图     | leadLeft / columns / quadrants / hub |
| clayCommitmentsSlide | 基线、目标与机制               | columns / ledger                     |

`auto` 从容纳当前实例的构图中确定性选择；显式布局也须通过容量检查。
同内容可改变真实几何；KPI rail 适合两至三个短指标，strip 最多五个。
状态表六行适合短单行单元格，五行可容纳较长文字；实际列权重与文字组合共同决定容量。
数组上限不是所有字段最长文本能同时装下的承诺。超量须改用合法构图、重组或拆页。
本套件保留九种有明确用途的职责，不为凑页数新增装饰页型。

`clayNarrativeSlide`（0.2.0 新增）承载客户分群、经验贡献、定性优先级与支持诉求。
提供 `lead` 和 2–4 个 `sections[]`（`title`、`body`），不要求数字、目标、负责人或日期。
`leadLeft` 为左侧大字主张与右侧开放编号行；`columns` 为顶部主张与下方开放分栏。
`quadrants` 使用左侧主张和右侧开放 2×2 分区；`hub` 以短中心主题连接 2–4 个相关分支，
只用于真实的一对多关系，不暗示方向、顺序、权重或数据流。连线从分支区域和中心圆几何派生，
手工移动对象不会自动重路由；从 content 重建以保持连接。`statement` 封面使用 44pt 大主张，
既有 portrait/editorial 的字号与容量不变。不要把换图标或数字当作构图变化。
两种布局均检查实际文字容量，超量须换构图、重组或拆页，不静默缩字或截断。
既有页型输入与布局容量保持兼容；不要将无来源的数值填进指标页以承载定性内容。

并列概念可用 `sections[].icon` 或 overview 的 `findings[].icon` 选择捆绑 Tabler outline
语义图标，替换对应编号，保留 0.4in 标记区域、陶土单色与统一线宽。省略时兼容既有编号；
默认线宽为 `1.2`，由 `design.json` 的 `clay.spacing.iconStrokeWidth` 声明，上限 `1.5`。
普通客户群、能力和诉求优先语义图标，真实步骤、排名或交叉引用才优先编号。
图标是 SVG 图片，轮廓路径不承诺原生逐点编辑；不接受任意图片、外部 SVG 或第三方品牌标志。

## 编辑与验证边界

- 正文、标签、附注字号受合同约束；不无限缩字。保留输入大小写和原始数值。
- 数字和小号单位共享原生文字框及基线；编号由粉色方形自身持有文字并双向居中。
- 原生柱图仅单系列；全部类别、系列名和数值经应用后回读。负数、零、极小值不伪造最小条长。
  整数、小数、科学记数使用不同数字格式，避免 PowerPoint 整数尾随小数点。
  当前 canonical 渲染器可显示等值的完整十进制，不能据此推断原生显示格式一致。
- 原生表格逐格回读。数值列右对齐，横线分行；attention/normal 只控制文字颜色和字重，
  状态文案来自单元格，不按业务阈值自动推断，也不自动排序或添加红绿灯。
- 图表、表格、文字和形状原生可编辑。手工改数据不会自动同步独立解释、指标和来源文字，
  必须从 content 重建以保持同步；没有栅格化整页或栅格化图表。
  本机 PowerPoint 16.114.1 的 Excel 数值编辑探针还出现工作表已变、图表缓存及画面未更新：
  不承诺手工 Excel 编辑会自动更新图表，数值更新须走 content 重建。
  标题、系列名及表格单元格的原生编辑、保存重开已验证。
- 本机 PowerPoint PDF 导出与编辑器/放映显示不一致，不能作为合格导出路线。
  原生显示采用候选哈希绑定的放映窗口截图验证；跨宿主 PDF 导出未验证。
- 无渐变、阴影、冷色、纯装饰图标、卡片墙、饼/折线/3D 图。角落图形不承载数据意义。
- LXGW Bright、MiSans、Oranienbaum 在验证主机不可用；使用 Georgia / Songti SC 标题与数字，
  Arial / Arial Unicode MS 正文。字体不嵌入；中文粗体可能由宿主合成。不同字体/平台需复核。
- 不宣称源稿保留、任意已有 PPTX 翻新、native skinning、动画播放或图片导入能力。

实际覆盖、逐页审查、原生宿主结果和未验证项见 迁移验收报告（未随本仓库发布：`migration-report.md`）。
