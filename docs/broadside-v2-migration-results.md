# Broadside 2.0 迁移与验收记录

日期：2026-10-22。`broadside` 从 **0.1.0 / production** 迁为 **2.0.0 / candidate**。
起点为 `2a9cde1`；依据为[设计语言评估](design-language-contract-evaluation.md)、
[旧套件清理方案](legacy-deckkit-cleanup.md)和用户补充的完整验收要求。
本次只退役 Broadside 的旧创建实现与旧产物，不代表全部旧 DeckKit 已清理。

本文保留迁移时的验收范围与历史产物绑定。当前标题撰写约定及最新展示已按
[大小写调整记录](broadside-title-casing-results.md)更新：普通英文标题默认 sentence case，
全小写仅作为封面、章节和短宣言的可选海报表达。

## 执行合同与能力

[design.json](../pptx-nova/assets/deckkits/broadside/design.json) 是颜色、字体角色、空间、容量和
布局的事实源；[intent.md](../pptx-nova/assets/deckkits/broadside/intent.md) 记录设计判断、
兼容决策和边界。[公共入口](../pptx-nova/assets/deckkits/broadside.kit.mjs) 保留
`createDeck(content)`、`C`、`FONT_DISPLAY`、`FONT_MONO`、`FONT_CN` 并导出 `DESIGN`。

`broadside-layouts.mjs` 将语义、容量和显式/自动布局解析成组件计划；
`broadside-components.mjs` 执行原生文字、形状和图表；`broadside-registry.mjs` 接入共享的
合同断言、选择、规则检查和投影接口。没有第二运行器或旧生成分支，未修改 core-primitives。
标准 design/slots、validate、build、Create、对象/数值回读及交付绑定均可使用。

| 保留职责  | 注册布局                 | 主要表达                         |
| --------- | ------------------------ | -------------------------------- |
| Cover     | poster / reading         | 超重标题、说明、作者与上下文     |
| Chapter   | declaration              | 橙底章节宣言与引导文字           |
| Statement | wide / rail              | 黑底橙色主张与资料字             |
| Split     | image-right / image-left | 完整说明、斜线列表、可编辑图壳   |
| Stats     | row / register           | 展示值、标签和来源语境           |
| FadeList  | stack                    | 可读的衰减词列与放大收束词       |
| List      | split / stacked          | 最多四项斜线条目                 |
| Quote     | reading / wide           | 引文、作者与来源                 |
| Compare   | equal / weighted         | 两列完整内容与橙色结果面         |
| BarChart  | column / horizontal      | 2–6 类原生单系列图表             |
| Flow      | horizontal / vertical    | 2–4 阶段、箭头链或编号登记       |
| Donut     | ring-left / ring-right   | 2–5 类原生环图和独立数值图例     |
| Pyramid   | levels                   | 2–5 个分类层级，不伪装成定量宽度 |
| Timeline  | vertical / horizontal    | 2–5 个完整日期、标题与说明       |
| Cycle     | loop                     | 四阶段闭环及完整方向             |
| End       | poster / wide            | 橙底行动提示、联系与上下文       |

共十六类职责、二十八个构图。`auto` 按实例容量和近期节奏确定性选择，显式布局同样必须容纳内容。
完整 deck 由封面开场、结束页收束；抽取片段使用 `meta.designScope: "excerpt"`。
容量不足时明确失败，不删字段、改数值或无限缩字。页型/操作数量只描述覆盖范围。

## 字段与资产迁移

- 保留十六个 `broadside*Slide` 名称及标题、正文、作者、上下文、列表等可见字段。
- 柱图移除 `bars[].display`，改用有限非负 `bars[].value`，并明确提供 `unit`、`source`、
  `seriesName`；`numberFormat` 只控制显示。零值不再得到虚假的固定最小柱高。
  `accent` 只能显式指定一个重点；全部未指定时保持中性，取消旧版的隐式末项强调。
- 环图拒绝旧百分数字符串和任意 `color`，使用数值、明确单位及单橙/灰色序列。
  不再把解析失败的数据回退为 1。零值和极小值保留，合计必须正且有限。
- 环图图例从同一数值源产生可编辑文本；直接编辑 PowerPoint 图表数据不会同步独立图例。
  重新从 content 生成可同步二者。极小值在共用尺度上可能小于一个像素。
  canonical 渲染器可能对部分数字格式显示完整原值，需检查可见结果；回读始终核对原值。
- `image.split` 继续是原生占位图壳，不接受外部资产；保留可选标签和说明。
  没有复制参考中的位图，也没有增加未经验证的图片摄入或原生表格能力。
- 独立 refurbishProfile 及 manual-fallback 路线保留；只更新字体/配色事实。
  创建验收不等于任意旧稿翻新保真、原生换肤或动画播放通过。

业务事实、观点、单位、来源和日期全部来自 content。完整 Field Studio 示例与公共图书馆主题
均标明合成；最小输入及包含全部可见字段的中性探针拒绝参考专有文案泄漏。

## 第一手参考与设计裁决

只读参考是 `beautiful-html-templates/templates/broadside` 的 HTML、design.md 和 template.json。
实际 DOM 为十六页，元数据的二十页不作为覆盖依据。先逐张审查全部参考和旧版 canonical，
再建立英文主构图与替代构图视觉基线，最后冻结公共合同。

保留黑/橙两种色域、海报级超重字、等宽资料字、斜线、细线、衰减词列、对比橙面和闭环。
小字提高到至少 10pt，衰减词改为可读实体色；文字和结构之间增加必要留白。
文档后半建议中文宋体/手写体，与前半统一无衬线及实际 DOM 冲突，采用统一无衬线。
Statement 保留实际 DOM 的页眉页脚；实际四项列表优先于文档的三项软偏好。
浏览器导航和入场动画不进入静态 DeckKit。

用户明确允许最近似的常用字体：以 **Arial Black / Arial / Menlo** 替代 Barlow / IBM Plex Mono，
CJK 使用 **Noto Sans SC**。中文标题显式 bold、正文常规，实际检查直立字形及混排换行。
不嵌入字体，其他机器仍需复核字体环境；未为字体一致性额外下载安装资源。

## 最终证据

唯一运行目录为 `.tmp/deckkit-broadside-v2-20261022/`，下文简称 RUN。
运行时为 `xdoc 0.13.0 (92a5aa13)`，原生宿主为 macOS Microsoft PowerPoint 16.114。

| 样例                                 | 页数 | RUN 内路径                           |
| ------------------------------------ | ---: | ------------------------------------ |
| Field Studio 完整英文示例            |   16 | `iterations/07/matrix/golden/`       |
| 同内容的全部替代构图                 |   12 | `iterations/07/matrix/alternatives/` |
| 重要组件最大条目数、长文本及数值边界 |   16 | `iterations/07/matrix/stress/`       |
| 公共图书馆中文、英文及混排主题       |   16 | `iterations/07/matrix/mixed/`        |

每份 `reviewed.pptx` 都经标准 Create finalize，`run/create-run-summary.json` 为
`delivered / deliveryReady=true`。这是这些文件的验收结果，不改变套件的 candidate 发布资格。
其 `run/visual-evidence/candidate/slide-N.png` 为所查的 canonical PNG；
`run/visual_review.json` 绑定候选和全部图像字节。
`current-candidate-binding-final.json` 证明当前源码生成的 patch 与完整 designPlan 和四份候选一致。

**机器检查：** 四份矩阵通过内容、合同、dry-run/apply、设计回读和 canonical 门禁。
原生数据覆盖 column、bar、doughnut；零值、极小数、高精度数值、上下界和非法输入反例有专项检查。
ZIP 完整性、全部 XML well-formedness、内部关系目标、图表关键子节点顺序、缓存与内嵌工作簿数值
同步分别检查，报告为 `structural-audit.json`；标准 `structure-check.json` 还核对字体和空占位残留。
槽位一致性 16/16；Broadside、Cartesian、Biennale 投影检查通过。
全量 Node 测试 544 项：506 pass、0 fail、38 项显式原生测试默认跳过；这些跳过项未计入原生成功。

共享 live benchmark 为 19 案例 / 141 页、全部通过。Broadside 三个已登记案例为 H0/M0/L0，
旧小字问题允许基线已替换为零问题基线；没有删除登记的 stress/mixed-language 案例。
`benchmark/02/` 是 candidate readiness 与 catalog-update 使用的同轮实证目录。
`readiness-candidate.json` 通过；delivery 审计保持失败，因为 candidate 不等于 production/default。
保留的 manual-fallback 翻新配置也不允许据 `--explicit` 自动取得该例外，没有放宽门禁。

**视觉检查：** 最终六十页 canonical 全部逐张看图，另查看登记基准中的七页密度/混排探针。
`final-visual-review-ledger.json` 保存六十页的 hash 与逐页观察；
`iterations/07/detail-review/manifest.json` 绑定放大的对比面、图例/单位、极小数、层级文字、
密集时间线、CJK 粗体及底部附注。contact sheet 只用于整体节奏，未替代逐页检查。
最终未关闭视觉阻塞问题为零。早期失败采集和探索轮次仍保留，不作为最终通过依据。

**原生宿主：** 四份候选均 clean-open，无 Repair。四份分别在真实 PowerPoint UI 中另存、
关闭、重开，页数和对象保留；保存文件为各样例目录的 `native-resaved-<name>.pptx`。
独立回读 250 / 182 / 261 / 250 个对象及每份两张图表，均通过，见 `native-readback-results.json`。
独立 `native-edit-proof.pptx` 在 UI 中修改标题、右移原生矩形、通过内嵌 Excel 将 B2 从 40 改为 42；
保存重开后 `native-edit-readback.json` 检查 250 个对象和两张图表通过，只允许三处声明的编辑。

机器回读不证明全部 OOXML/workbook 字节相等、所有有效继承样式或像素级宿主一致。
未验证所有平台、全部字体环境、动画播放和任意旧稿翻新；本次结果不外推到这些能力。

## 退役、替换与维护改进

- 移除原 `makeOps`、`makePageTypes` 和旧十六页绘制分支；原 kit 原位改为薄适配器。
  不保留永久 legacy 目录、静默回退或第二份生成器。
- 原位替换十六份 schema/预算、示例 content/build、catalog 质量登记、三份 baseline，
  以及 `assets/examples/broadside/` 中全部旧 PPTX、WebP、content、brief、summary。
  迁移时的展示 PPTX 与当轮已验收 golden SHA-256 相同（当前展示已由上述大小写修订替换）：
  `bbf6d4117517e480a6cd77654cef228e4f752e3b891680de9a76eeb85113f3b2`。
- 保留仍有效的示例入口、页型名、图壳元数据、已登记测试和独立翻新配置。
  全部 Broadside 发布资产已核对；旧内容字节不再随 skill 分发。
- 参考、历史证据、无关用户文件、`core-primitives.kit.mjs` 和 `docs/xdoc-schema.json` 未修改或删除。
  剩余四套旧创建实现及共享旧机制不在本次退役范围。

deckkit-maker 已修复参考 HTML 采集中的动画透明初态：支持 `--active-class`、推进有限动画到终态、
拒绝隐藏 `data-anim` 文字并隐藏页计数器；十项采集回归通过。另修正文档重复要求确认的步骤，
尊重已授权自主迭代；补充字体替代和 CJK 粗体/常规分离验证。问题、影响与修复记于 RUN 的
`skill-feedback.md`，未留下新的未关闭 skill 问题。

最新展示：[deck.pptx](../pptx-nova/assets/examples/broadside/deck.pptx)，
[完整预览](../pptx-nova/assets/examples/broadside/contact-sheet.webp)。
它们替代同路径旧 Broadside 样例；完整 canonical PNG 和机器/宿主报告保留在上述 RUN。
