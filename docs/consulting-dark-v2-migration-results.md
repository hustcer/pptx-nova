# Consulting Dark 2.0 迁移与验收

日期：2026-10-22。DeckKit：`consulting-dark`；版本：`2.0.0`；readiness：`candidate`。
十类职责、二十个布局进入 `design.json + intent.md + consulting-editorial/v1` 注册执行链。
旧固定绘制器和专属全局 tuple schemas 已退役；没有永久旧渲染分支。当前没有未关闭阻塞缺陷。

## 设计来源与裁决

已逐张查看旧分发示例全部十页及用户提供的局部参考图，并核对旧源码、schema 和 catalog。
旧十页示例有三页重复受众，只覆盖八类职责；新完整英文示例每类职责各一页，补齐原已注册但未展示的
profile 和 achievement。示例主题改为明确标注的合成 operating model，不保留旧产品评分与业务结论。

- 保留深蓝首尾、铜色重点、青色输出、浅色证据页及大小不一的首尾圆形装饰。
- 将圆角矩形外贴直线/色条替换为切角面板与完整色块，流程使用原生箭头和输出形状；细规则用于表格、履历和时间顺序。
- 首轮极简解释删除过多装饰，已被用户否定并撤回验收。最终丰富版经用户明确认可后冻结方向；
  后续只修复对比度、容量与负数标签间距。每个首尾布局保留七个不同大小的原生 oval，并有回归测试。
- 使用 upright Arial / Arial Unicode MS 的常规与粗体；辅助文字最低 10pt，正文字号和容量由合同约束，不嵌入字体。
- 单位、日期、来源、观点、数值和所有业务文字来自 content。颜色只表达层级和组件职责，不固化风险或金融政策。

## 公共合同与可复用能力

入口保留 `consulting-dark.kit.mjs::createDeck(content)`，适配器只加载合同、解析完整计划、执行组件及共享检查。
后续作者使用 content、discovery 和 `layoutId`，无需手写页面坐标。相同输入的选择、几何、计划与 patch 确定。

| 页型                | 注册布局              | 主要职责                             |
| ------------------- | --------------------- | ------------------------------------ |
| heroSlide           | split / stacked       | 开场观点、导语、项目信息、圆形装饰   |
| profileTableSlide   | ledger / bands        | 履历和支持指标                       |
| kpiRowSlide         | quadrants / ledger    | 编号成就和数值证据                   |
| previewProductSlide | strip / rail          | 产品主张、指标、能力                 |
| landscapeSlide      | columns / ledger      | 定位、替代方案、优点与限制           |
| multiCardSlide      | columns / ledger      | 受众或工作组                         |
| convertFlowSlide    | horizontal / vertical | 输入、引擎、输出、能力               |
| benchmarkSlide      | rail / stacked        | 原生表格、原生单系列条形图、独立解读 |
| timelineSlide       | horizontal / ledger   | 阶段、状态、描述                     |
| askSlide            | columns / rows        | 决策、具体请求、结束语、圆形装饰     |

旧数组 tuple、原始 hex、别名与业务 fallback 退出活动合同，改为命名对象；每页明确提供 `source`，图表明确提供 `unit`。
旧 `tableWidth/tableName/chartName` 坐标或对象旋钮退出内容输入，使用布局与组件计划。
未知字段、布局、customOps、缺来源、非有限数值、不匹配类别、非矩形表格、超项数及超文字容量均阻断。
字段映射详见 [intent.md](../pptx-nova/assets/deckkits/consulting-dark/intent.md)。

图表、表格、文字、圆、切角面板和箭头均为原生对象。图表保留负数、零和极小值，不生成伪造最小条长；
负数场景只扩大原生轴域留白，避免 outside-end 标签挤到类别名称。`General` 保留数值精度，极小值可能使用科学记数。
图表、表格和独立 callout 不自动同步；修改相关数据后应从 content 重建。该套件不承诺任意图表类型或任意数量系列。

## 最终复用与视觉覆盖

证据根目录：`.tmp/deckkit-consulting-dark-20261022/`。所有旧轮次、失败样本和参考只读保留。
下列 `reviewed.pptx` 均由标准 Create 对同一 hash 绑定候选 finalize 产生。

| 最终组     | 页数 | 有效目录             | 覆盖                                                  |
| ---------- | ---: | -------------------- | ----------------------------------------------------- |
| golden     |   10 | matrix/05/golden     | 完整英文合成示例、十类职责                            |
| variants   |   10 | matrix/05/variants   | 同一内容全部第二布局，信息完整且实际几何不同          |
| chinese    |   10 | matrix/05/chinese    | 异领域城市图书馆主题、中文常规/粗体、所有职责         |
| mixed      |    4 | matrix/05/mixed      | 同一异领域中英混排、首尾/产品/证据                    |
| stress     |   10 | matrix/06/stress     | 第一布局最大合理项数、数值边界                        |
| stress-alt |   10 | matrix/06/stress-alt | 第二布局最大合理项数与相同数据                        |
| sparse     |   10 | matrix/05/sparse     | 最少一项、原生 2×2 表格、原生零值图表、无业务文案泄漏 |

最终 **64 页全部实际逐张查看 canonical PNG**，候选/manifest/PNG SHA-256 见
`matrix/05/visual-review-ledger.json`。七份同源 contact sheet 另作节奏检查；五处放大检查覆盖负数/零/0.0001 标签、
密集表格底边与来源、中文输出形状自带文字、首尾圆与指标间距。无缺字、意外倾斜、压线或越界硬缺陷。
`matrix/06` 两组替代 `matrix/05` 的旧压力样例；后者负数标签过近，不能再作最终通过证据。
极简候选和更早的视觉记录也不能替代上述最终矩阵。

最大合理项数包括：四条履历、三个指标、四项成就、四个产品 KPI、三种替代方案、五组受众×四项、
四个流程输出、每侧三项能力、9×5 表格、六个图表类别、五个阶段与四项请求。
数组上限不保证所有长文本组合都适配每个布局；每次执行仍检查实例容量，不合适时选择合法变体、重组或拆页。

## 分别成立的验收证据

**机器检查。** 七组标准 Create 的 schema、实例容量、check-lock、dry-run、apply、合同检查、
原生图表/表格回读、vision、canonical final-layout 和交付绑定通过。七个 patch 与完整计划重新由最终源码生成，完全一致。
每组一张原生图表和一张原生表格，vision 高/中/低均为零；三份永久 benchmark 每份重复构建三次并通过。
候选 readiness 使用本轮 required-live benchmark，通过且未晋级 production/default。

机器报告仍有透明披露的非阻断信息：完整组 check-lock 有五条提醒（重复 breathing 元数据三条、lock 未列齐两种合法合同颜色），
混排组一条；实际跨页节奏和颜色已人工检查。部分 dry-run/apply 有一条低级排列估算提醒，最终 vision/canonical 没有对应缺陷。
semantic 辅助审计有四条提醒，原因是锁文件未另外绑定 chart/table 的结构化来源、论据和单位元数据；
页面已显示 content 的合成来源、图表单位和系列名，不把这些样例称为真实商业基准。提醒未通过改阈值或隐藏文字消除。

**原生宿主。** Microsoft PowerPoint 16.114 for macOS 打开最终七组候选均无 Repair。
英文和完整中文各一次另存、关闭、重开，并分别完整回读 237 个对象、一图一表，文字、几何、图表类别/系列/数值和全部表格单元格保留。
其余五组验证原生打开，没有逐组另存回读；不将其计入保存重开覆盖。
代表对象实际编辑后另存重开：普通标题、freeform 自带输出文字、单个表格单元格、嵌入 Excel 的 B2 从 86 改为 87。
独立回读确认 237 个对象几何不变，单元格独立修改成立，87 同时存在于图表模型、chart cache 与内嵌工作簿。
编辑探针是独立副本，不作为分发示例。初次表格 Command-A 选择了全部单元格，随后另做单格编辑；操作过程和证据见 `native-edit-check.json`。

**回归与分发。** 槽位一致性覆盖十类职责，无 ghost/dynamic 字段；设计投影检查、内容泄漏和反例测试通过。
最终全仓 574 项测试中 536 通过、38 跳过、0 失败；smoke 与 strict public audit（0 errors / 0 warnings）通过，lint/format 和 showcase 复现结果记入 `acceptance-summary.json`。
38 项需要额外运行时环境的测试跳过，不计通过。本次不改 `docs/xdoc-schema.json` 或 core-primitives。

## 替换、删除与保留

| 对象                                                | 处理                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| 旧 consulting-dark.kit.mjs 固定坐标绘制器           | 替换为 2.0 薄适配器，没有旧 fallback                                    |
| 十份旧全局页型 schema                               | 删除；所有活动套件均有命名空间 schema，consulting-dark 使用严格命名对象 |
| roadshow-content.json                               | 原路径替换为十页英文合成示例；有效 build 胶水保留                       |
| 三份旧 benchmark 内容/预期/人工结论及 baseline      | 原位替换为本轮证据，不继承旧 low 豁免                                   |
| assets/examples/consulting-dark 五份旧资产          | 官方工具替换为新 PPTX、预览、content、brief、summary                    |
| examples manifest / decks catalog / DeckKit catalog | 同步 2.0.0、candidate、页数、文件 hash 和使用限制                       |
| 有效翻新 profile、通用 primitives、其他套件         | 保留，不宣称任意已有 deck 翻新无损                                      |
| 参考、用户资料、历史 run                            | 保留；旧分发资产/schema 在当前 run 的 retired-assets 只读对照           |

删除清单与原 SHA-256 见 `removed-assets.json`。相同路径保留的新文件是当前有效入口，已无本套旧创建器专属的失效分发资产。
全部十套现在都有合同；共享旧槽位/预算/无合同降级机制的全仓退役仍需独立清理，见 [清理方案](legacy-deckkit-cleanup.md) §6.2。

## 最新有效文件与复现

- [正式示例 deck.pptx](../pptx-nova/assets/examples/consulting-dark/deck.pptx)
- [预览 contact-sheet.webp](../pptx-nova/assets/examples/consulting-dark/contact-sheet.webp)
- [示例内容](../pptx-nova/assets/examples/consulting-dark/content.json)与[机器摘要](../pptx-nova/assets/examples/consulting-dark/summary.json)
- 该正式 PPTX 与 `matrix/05/golden/reviewed.pptx` 字节相同，SHA-256：`1fddd331709a2c350bfa3a5395bacb74a26ffa4fee1c544b6cc9838406de3ba2`。
- 同内容变体、中文、混排、最小值：`matrix/05/{variants,chinese,mixed,sparse}/reviewed.pptx`。
- 最终压力与替代压力：`matrix/06/{stress,stress-alt}/reviewed.pptx`。
- 视觉证据：各组 `run/visual-evidence/manifest.json` 和 `candidate/slide-N.png`；总账为 `matrix/05/visual-review-ledger.json`。
- 机器证据：`benchmark/01/`、`readiness-final.json`、`matrix/05/final-binding.json`、`acceptance-summary.json`。
- 宿主证据：各组 `native-clean-open.json`、golden/chinese `native-reopen.json` 和 `run/native-readback.json`、`native-single-reopen.json`、`native-edit-check.json`。

```sh
node tools/generate-pptx-design-projections.mjs --check consulting-dark
node pptx-nova/scripts/pptx-nova-deckkit-slot-consistency.mjs --deckkit consulting-dark --json
node pptx-nova/scripts/pptx-nova-deckkit-benchmark.mjs --deckkit consulting-dark --all --repeat 3 --out <fresh-run>/benchmark
node pptx-nova/scripts/pptx-nova-deckkit-readiness.mjs --deckkit consulting-dark --target candidate --benchmark-mode required-live --out <fresh-run>/benchmark
node tools/pptx-nova-smoke-test.mjs
node tools/pptx-nova-audit-public.mjs --strict
node --test tools/tests/*.test.mjs
```

最终矩阵使用 `xdoc 0.13.0 (993a9628)`，冻结日期 2026-10-22。最后检查时本机二进制变为 `0.13.0 (993a9628-dirty)`，
已复制固定二进制并在 `benchmark/02` 重跑三组×三次；三份 PPTX、patch 和全部预览 PNG 与 `benchmark/01` 的 SHA-256 完全相同，
见 `runtime-final.json` 与 `runtime-equivalence.json`。未更新公共 schema 快照，也不据此声明公开发行版本。未验证 Windows、其他 Office 版本、跨宿主像素一致性、任意源稿翻新保真及字体缺失环境。
候选必须显式选择；自动 delivery/default 检查仍失败，这是本次目标范围。

## deckkit-maker 改进

已在 `legacy-deckkit-migration.md` 加入源码/schema 职责核对与用户局部审美反馈的保留清单，防止十页示例掩盖缺失职责、或将局部嫌弃误读为全局极简化。
已在 `visual-acceptance.md` 加入隐藏图例元数据不等于可见文字、负数 outside-end 标签与类别间距的边界检查。
这些规则配合真实矩阵与首尾圆回归，不以补文档替代验收。
