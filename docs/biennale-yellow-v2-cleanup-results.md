# Biennale Yellow 2.0 清理与验收记录

日期：2026-10-22。范围：[旧 DeckKit 清理方案](legacy-deckkit-cleanup.md) 中的 Biennale 试点。
`biennale-yellow` 已收敛为 **2.0.0 / candidate**，仅分发新的合同执行路径。
其他七套独立旧生成器的全面迁移不属于本次目标；本文不宣称全仓 DeckKit 已全部迁移。

起点：`287ec20eeaa45f118f9550b1d025c547169c3224`，原版本 0.2.0 / production。
实施分支：`refactor/biennale-yellow-v2`；验收绑定本工作树、合同 hash 和候选 hash。
用户已暂存的方案文档保留；参考源、用户 deck、无关 run 和历史缺陷证据未删除。

## 唯一入口与退役清单

[kit 入口](../pptx-nova/assets/deckkits/biennale-yellow.kit.mjs) 保留 `createDeck(content)`、
`DESIGN`、`C`、`FONT_DISPLAY/BODY/MONO`，全部从新合同读取。新路径为：

```text
content → schema/语义检查 → biennale-editorial/v1 或 native evidence 解析
        → 全页 designPlan / 实例容量 → 注册组件 → patch
        → 标准 Create / 回读 / canonical PDF+PNG / PowerPoint
```

原 `makeOps`、`makePageTypes`、八个固定页型绘制函数、旧 footerBand、槽位分派、形状条形图及
文字拼装日程均已退役。原生光晕、黄色结构平面、字体/配色身份成为新合同组件的一部分。
没有 `legacy-v1`、第二个构建器、`--legacy`、静默字符串解析或退回旧渲染器的分支。

引用检查证明 `resolveDesignSlot` / `writeDesignText` 仅供原 Biennale 及其校验/投影使用；已移除。
四份设计合同的 `legacyLayouts`（其中三份原为空对象）、schema 字段/专用定义、旧实例校验和
旧投影循环均已移除，schema 拒绝重新添加。其他套件仍使用的通用 primitives、独立校验与翻新
profile 保留；`core-primitives.kit.mjs` 和 `docs/xdoc-schema.json` 未修改。
Discovery 升为 `pptx-nova-design-discovery/v2`，输出全部九个 `registeredSlideTypes` 及布局，
不再输出旧槽位列表。合同格式仍为受限的 `pptx-nova-design/v1`；旧槽位字段现在明确拒绝。

## 字段、职责与布局覆盖

| 页型      | 保留字段/职责                                                             | 注册构图及验收                                          |
| --------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| Cover     | dateRange、title、subline、四组 footerItems                               | poster / wide；长标题与资料区共同预算                   |
| Manifesto | quote、attribution                                                        | statement / reading；独立阅读停顿                       |
| Programme | kicker、word、description、headLabel、strands[].num/title/body            | split；按实例文字高度排布、编号居中、规则留白           |
| Chapter   | rail、number、title、lede                                                 | monument；大编号与正文分区                              |
| Data      | title、label、两组 stats[].value/suffix/label/description；年度量值与强调 | ledger；原生图表、单位、来源、格式、精确数值回读        |
| Quote     | kicker、quote、author、role                                               | margin；独立黄色分区，署名区预留                        |
| Calendar  | title、label、四个 columns、rows[].date/title/venue/length                | table；原生四列表格，保留每个单元格                     |
| Colophon  | kicker、title、四组 footerItems                                           | echo；逐组检查制作/致谢资料                             |
| Evidence  | title、label、source、seriesName、unit、kind、points、两组 stats          | chart-left / chart-wide / chart-top；进入同一个全页计划 |

没有资产槽位被删除。`stats.value/suffix` 继续作为纯展示文字，共享同一个组合容量。
`bars[].value` 改为有限数值，移除有歧义的 `pct`；新增非空 `unit` / `source`，可选
`numberFormat`。仓库 Aurora 示例明确采用原显示计数 76,400 / 112,800 / 141,200 / 164,900 /
182,300，单位为 visitors；原装饰比例丢弃。外部旧输入必须先裁决真实量值，再依照
[intent 中的迁移说明](../pptx-nova/assets/deckkits/biennale-yellow/intent.md) 转换；失败会给出字段诊断。

## 验证矩阵与五层证据

独立 run：[deckkit-biennale-yellow-cleanup-20261022-01](../.tmp/deckkit-biennale-yellow-cleanup-20261022-01/)。
旧基线重建并逐页检查 8 页主样例及 3 页证据构图。最终主样例保留原 8/8 页职责，另整合原生
证据页，形成 9 页 showcase；保留独立三构图 golden case。两个 golden 均未删除或伪改类型。

| 最终内容   | 页数 | 覆盖                                                                  | Create / 回读 / PNG / 原生宿主 |
| ---------- | ---: | --------------------------------------------------------------------- | ------------------------------ |
| golden     |    9 | 全九页型、四组署名、五节目项、八日程行                                | 通过                           |
| evidence   |    3 | 同一内容的三种证据构图                                                | 通过                           |
| variants   |    2 | 相同内容的 wide cover / reading manifesto                             | 通过                           |
| stress     |    9 | 长标题/引文、两位编号、六条数据、零/负/极小/极大/小数                 | 通过                           |
| mixed      |    9 | Civic Archive 新主题、CJK/Latin 常规/粗体/斜体、最小三节目项/四日程行 | 通过                           |
| boundaries |    3 | 最小两条数据、两条/最大十条证据数据、折线及负值                       | 通过                           |

35 页最终 canonical PNG 均实际逐页查看；未以 contact sheet 或机器零 findings 代替。
[逐页记录](../.tmp/deckkit-biennale-yellow-cleanup-20261022-01/visual-review-ledger.json) 绑定候选、
每页 PNG、合同 hash、冻结日期、检查结论和 manifest。前几轮的字号/高度预算、CJK 基线安全量、
节目单页码重叠和大词孤字问题均关闭；旧轮次保留为本轮修复证据，没有用于给新候选签字。
最后仅新增空白单位/来源拒绝检查；六份当前源码生成的 patch 均与已验收候选逐项一致，见
[当前候选绑定](../.tmp/deckkit-biennale-yellow-cleanup-20261022-01/candidate-current-binding.json)。

输入反例还覆盖未知字段/页型/布局、失效组件注册、越界合同、超容量、长单词、组合 value+suffix、
缺失/空白单位来源、非有限数字、旧 pct/字符串数值及多重点。确定性测试覆盖所有注册布局和
八页连续重复的 auto 选择；短 excerpt 不虚构封面。新主题泄漏审计检查了 104 个可见文本操作，
四个旧主题禁止词零匹配。

PowerPoint **16.114** 对六份最终候选分别执行打开 → 另存 native-resaved.pptx → 关闭 → 重开，
均无 Repair 提示。保存后 SHA 独立记录；对象/文字、几何、图表类别/系列名/数值和原生表格全部
单元格回读通过：[六份保存后回读汇总](../.tmp/deckkit-biennale-yellow-cleanup-20261022-01/iterations/08/matrix/native-results-final.json)。
独立 `native-edit-proof.pptx` 还在宿主中将图表改为 line，并将日程单元格改为
`街区记忆开放阅读 EDIT`；回读确认两项真实编辑，原候选和只另存的验收副本保持原状。

运行时：`xdoc 0.13.0 (92a5aa13)`；冻结 field date `2026-10-22`。能力探测、字体实际匹配、
macOS 环境和起始状态均保存在 run 中。所有必需工作流仍为 Node 20+ 内置模块与 xdoc。

## 检查结果与分发状态

- 全仓测试：510 项，472 通过，38 跳过，0 失败；跳过项未计为成功。
- smoke 与 public audit strict：通过；公开审计 0 error / 0 warning。
- 四份合同投影 `--check` 和全套件 slot consistency：通过。
- 11 套 DeckKit 的 22 个 live benchmark case：通过；其他套件原有 low 基线未改。
- 11 套 candidate 目标的 required-live readiness：通过；不扩大为其生产/默认资格证明。
- Biennale 两个 golden `--repeat 3`：校验零错误、fit 零警告、dry-run H0/M0、vision H0/M0/L0。
- Biennale baseline 由工具在人工审查后更新，无 low 豁免；35 页 canonical 和全部回读通过。
- curated showcase 由更新工具以独立 `--tmp` 和 `--no-clean` 生成；文件、页数、manifest、索引及 hash 对应 2.0。

新版本不继承旧 production 标签。当前 `candidate` 门禁通过，delivery/default 因尚未登记
production/default 而失败，这是公开发布资格的真实边界。升级 production/default 是独立的
确认步骤，不属于本次清理验收；发布包中已经只有 2.0 一条 Biennale 实现。

有意分发文件包括 kit/合同/intent、三个 Biennale 注册/解析/组件模块、九份页型 schema、
两个内容输入、build 胶水、catalog/discovery、两个 benchmark case/基线、测试及九页 showcase。
源码和元数据位置见 [DeckKit 目录](../pptx-nova/assets/deckkits/)、
[curated 展示目录](../pptx-nova/assets/examples/biennale-yellow/) 和
[回归测试](../tools/tests/pptx-nova-biennale-v2.test.mjs)。普通运行产物留在 `.tmp`，不随 skill 分发。

## 已知差异与技能反馈

暖纸、墨色、黄色结构、衬线大字、细资料字和原生光晕保留。节目单改为更宽的条目区和有界
64pt 主题大词；日程改用原生表格的正文体系；页脚留白扩大。CJK 从未实际匹配的 Microsoft
YaHei 改为已安装的 Arial Unicode MS；Latin 仍为 Times New Roman / Arial / Courier New。
没有图片或图标替代。某些科学计数格式在当前 renderer 中显示完整精确数值，已实际检查标签，
不能由源数值回读单独推断显示格式。其他字体环境仍需重新审图。

本次 deckkit-maker 改进意见和反馈：原 Biennale 胶水无参数路径向 loadContent 传 URL、导致运行
失败，已改为 fileURLToPath；showcase 工具对同一套件多个 golden 直接拒绝，已增加经校验的
`showcase: true` 主样例标记并补反例测试。技能要求的 canonical 检查成功发现普通 benchmark
未检出的文字高度问题；逐页人工检查又发现孤字，已修复，未降低门禁或缩小字段覆盖。
