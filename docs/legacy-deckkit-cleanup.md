# 旧 DeckKit 迁移与清理方案

日期：2026-10-22。状态：部分执行；下文原方案和库存保留历史范围，不能当作当前全部验收结论。

最新进展：Biennale 已完成 [2.0 清理](biennale-yellow-v2-cleanup-results.md)；
Cartesian 已完成 [2.0 迁移与验收](cartesian-v2-migration-results.md)，均为 candidate。
Broadside 已完成 [2.0 迁移与验收](broadside-v2-migration-results.md)，目标同为 candidate。
Long Table 已完成 [2.0 迁移与验收](long-table-v2-migration-results.md)，为 candidate。
当前为三套无合同旧创建实现、七套合同实现；尚未完成其他旧套件的全仓退役目标。

依据：[设计语言载体评估](design-language-contract-evaluation.md)、当前 catalog、合同执行链、
Biennale 源码、schemas、示例、benchmark 与 showcase 更新工具。

## 1. 目标与清理边界

最终状态是：**所有随 skill 分发的 DeckKit 都采用设计合同和已注册执行组件，工作树及发布包中不再保留旧生成器路径。**
保留 DeckKit 的风格身份和使用入口，不把“删除 `.kit.mjs` 文件”当作清理目标。

以 Biennale 为例，保留 `biennale-yellow` id 和 `biennale-yellow.kit.mjs` 的 `createDeck(content)`
接口，将入口收敛为合同加载、内容规范化、布局解析和组件执行的薄适配器。先迁完全部页面职责，
再删除旧页型绘制逻辑及其专用合同字段。不能因为已经有 `design.json` 就认为迁移完成。

本文所称的“旧方案”包括：

- 套件内绕过注册布局、容量解析及设计计划的固定页型生成器。
- 同一风格事实在生成器、schema、catalog 中分别维护，且缺少投影校验的实现。
- 为上述生成器保留的 `legacyLayouts`、专用槽位解析与无合同降级路径。
- 文档、示例和选择入口中仍指向已退役实现的活动引用。

以下内容不因迁移而自动成为删除对象：

- `.kit.mjs` 扩展名、现有 slide type 名称、薄输入适配和依然有效的公共接口。
- `core-primitives.kit.mjs` 的通用操作、几何保护、内容校验引擎，以及新的合同/组件模块。
- 适合用原生 shape 表达的装饰、版式和数据形状；需要区分实现方式及验证责任。
- 仍服务现有 PPTX 翻新的 theme pack、style pack、`nativeSkinning` 和 `refurbishProfile`。
- 用户文件、只读参考源、历史验证证据和缺陷复现文件。旧代码可从 Git 历史查阅，无需另建永久 `legacy/` 分发目录。

原方案制定时只新增本文。后续执行按套件限定修改与退役清单，遵守不删除他人内容的要求；
参考源、用户 deck 和无关运行产物均不属于代码清理范围。

## 2. 当前库存：先分清“旧”“混合”和“新”

下表是方案制定时的源码快照，不是当前库存、质量评分或本次重跑验证。

| DeckKit         | 版本 / catalog 状态 | 页型数 | 实现状态                       | 迁移要求                                   |
| --------------- | ------------------- | -----: | ------------------------------ | ------------------------------------------ |
| consulting-dark | 0.1.0 / production  |     10 | 未注册 designContract          | 完整迁移，重点检查默认选择与共享校验调用方 |
| mckinsey-blue   | 0.1.0 / production  |      8 | 未注册 designContract          | 完整迁移，保留原生换肤能力边界             |
| swiss-grid      | 0.1.0 / production  |     15 | 未注册 designContract          | 完整迁移，保留网格、字体展示及特殊页职责   |
| broadside       | 0.1.0 / production  |     16 | 未注册 designContract          | 完整迁移，逐项核对图形和数据表达           |
| cartesian       | 0.3.1 / production  |     10 | 未注册 designContract          | 完整迁移，核对图片槽位、图表和原生换肤     |
| long-table      | 0.1.0 / production  |      8 | 未注册 designContract          | 完整迁移，核对清单、日程和编辑式构图       |
| biennale-yellow | 0.2.0 / production  |      9 | 混合：旧 8 页型 + 新原生证据页 | 本方案试点，迁完旧 8 页型再删除旧执行路径  |
| black-gold      | 0.1.0 / candidate   |      6 | editorial-ledger/v1            | 无需迁回旧方案；参加共享机制退役回归       |
| green-slate     | 0.1.0 / candidate   |     10 | strategy-report/v1             | 无需迁回旧方案；参加共享机制退役回归       |
| clear-value     | 0.1.0 / candidate   |      8 | annual-research/v1             | 无需迁回旧方案；参加回归并核对 Repair 证据 |

即 **6 套完整旧实现 + 1 套混合实现 + 3 套合同实现**。当前新合同的四份 `design.json`
仍都有 `legacyLayouts` 字段，后三套为空对象，因为共享 schema 仍要求该字段。
删除 Biennale 的旧页面后，还需要一次共享机制清理，才能让这个字段真正退出系统。

旧套件的 `production` 是原实现的登记状态，不能直接继承给重写后的实现。
是否保留、恢复或调整发布资格，应依据新实现对应的证据和既有 promotion 规则单独判断。

## 3. Biennale 要迁移什么

### 3.1 当前路径与目标路径

当前 `biennale-yellow.kit.mjs` 的 `createDeck` 有两条分支：

1. `biennaleEvidenceSlide`：解析证据构图，再调用 `evidence-components.mjs`。
2. 其余 8 个页型：调用 `makePageTypes` 中的绘制函数，文字与部分几何读取 `legacyLayouts`，
   另有构图和装饰坐标留在套件代码中。

因此，直接删除整个 kit 会同时删除 8 类页面能力；只删 `legacyLayouts` 会破坏文字、页脚和预检。
目标是让 **9 个页型都进入可发现、可解析、可回读的合同执行链**：

```text
content.json
  → schema / 语义校验与必要的输入规范化
  → design.json + 已注册视觉族 / 布局解析
  → 完整 designPlan（覆盖每一页、选中布局和相关检查）
  → 执行组件 → patch → 标准 Create → 回读 / PNG / 原生宿主
```

为 Biennale 补齐适合大字、结构色块、光晕、节目单和章节页的视觉族。可暂称
`biennale-editorial/v1`，这是待实现名称，不是当前已注册能力。优先复用已有文字、图表、表格、
容量和回读能力；有真实共用需求时再抽取组件。不能强行套用 Black Gold 的期刊版式，
也不能仅把旧 `makePageTypes` 搬到一个名为 components 的新文件就宣布迁移完成。

组件内部可以有有界的几何计算；需要固定的是参数权威来源、约束、输入输出和验证责任，
不要求把每个偏移量都配置化，更不要求发明新 DSL。

### 3.2 逐页职责与迁移验收

| 现有页型               | 必须保留的表达与内容                                     | 新执行路径的要求                                                           |
| ---------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| biennaleCoverSlide     | 日期、主标题、副标题、四组署名资料、黄色结构块与特征光晕 | 标题与资料区共同预算；长标题可选择注册构图；装饰不侵入正文                 |
| biennaleManifestoSlide | 大引文、出处、安静的阅读停顿                             | 引文/出处分区；按内容长度选择有界变体；字号和行数有底线                    |
| biennaleProgrammeSlide | 左侧主题词/说明、右侧编号条目、条目标题和正文            | 按实际条目和文字高度排布；编号居中；分隔线与文字保留间距                   |
| biennaleChapterSlide   | 章节标识、编号、标题、导语                               | 编号与标题关系明确；标题背景/装饰覆盖实际文字边界；不靠固定字数掩盖溢出    |
| biennaleDataSlide      | 两组统计及说明、年度量值与强调                           | 建立数值、单位、尺度、格式和来源模型；图形与标签来自同一模型，优先原生图表 |
| biennaleQuoteSlide     | 引文、作者、身份说明、黄色分区                           | 保留独立于 manifesto 的构图职责；作者和身份不能被长引文挤掉                |
| biennaleCalendarSlide  | 四列表头、每行日期/标题/地点/时长                        | 优先原生表格；按列宽、行数和换行预算；保留全部单元格与底部留白             |
| biennaleColophonSlide  | 收束标题、四组制作/致谢资料、呼应封面                    | 资料区逐实例检查；不以隐藏文字换取装饰完整                                 |
| biennaleEvidenceSlide  | 已有原生系列、单位、来源、KPI 与三种证据构图             | 保留并回归；接入完整 deck 计划和跨页节奏，不能只测新增的 8 类页面          |

数据页需要先处理一个真实的输入歧义：旧 `bars[].pct` 控制形状尺寸，`bars[].value` 是独立的
显示字符串，现有 fixture 中两者并非严格相同尺度。迁移器不能猜测哪一个才是真实量值。
应为仓库示例明确数值来源和尺度，记录修正；对外部旧输入，只有在语义可确定时转换，否则给出
字段级诊断和迁移说明。不能静默解析字符串、改数据或保留两套互相矛盾的数值。

统计值中的字符串并非一律非法：纯展示标签可保留；参与图表、比例或计算的量必须有数值语义。
日程页中的 `date/title/venue/length` 及四个列名则必须完整保留，不能因表格组件不同丢列或截断行。

### 3.3 风格身份与允许的改善

保留暖纸底、墨色文字、黄色结构强调、大字与细资料字的层级、特征光晕和安静的跨页节奏。
ember 保持受限的装饰职责，不自动变成数据系列色。

迁移不要求新旧逐像素相同。允许修正小字、拥挤、低对比、标题与背景不匹配、编号偏心、
线条贴字等问题，逐项记录原因。视觉通过要求同时满足身份可辨认、信息完整、表达合理，
不能用“更像旧版”保留缺陷，也不能把同样内容全部改成通用卡片。

## 4. Biennale 的执行顺序与退出条件

### A. 冻结范围与旧版基线

1. 在独立分支和新的 `.tmp/deckkit-biennale-yellow-cleanup-<run>/` 开展实现。
   每轮写入新的 `iterations/NN/`，不覆盖旧 run。
2. 记录起始 Git commit、catalog/合同版本、`xdoc --version`、能力探测、字体及目标宿主环境。
   旧版和新版的对照尽量使用同一内容、runtime、字体和 field date。
3. 清点 9 个页型、全部可见字段、可选控制、资产槽位、公共导出和调用方。检查静态 import，
   也检查 catalog 动态路径、工具扫描、glob、文档命令及示例 manifest。
4. 重跑旧实现的基线并逐页看图；记录旧缺陷，不要求新版保留旧缺陷。旧通过摘要只作历史线索。

**退出条件**：有输入/能力清单、引用清单、旧缺陷清单和逐页基线；知道每个待删除符号由谁调用。

### B. 完成目标合同与内容迁移

1. 将 8 类页面的身份、区域关系、容量、可选构图和失败行为纳入目标合同与注册组件。
2. 为每个页型定义 resolve/render/validate/readback 责任，统一返回可供现有流水线消费的计划。
   新视觉族应接入 discovery 和 projection，不能继续给共享模块增加无边界的套件特判。
3. 建立旧输入字段到新语义模型的映射，特别处理数据页尺度、组合文字和日程单元格。
   保留现有 id 和仍有效的 slide type 名称，输入不兼容处明确版本与诊断。
4. 更新 schemas 和 catalog 投影；文字预算从合同或已解析组件数据生成，动态实例继续检查。
   `x-designSlot` 等注解是否保留取决于新语义，不能保留指向已删除槽位的注解。
5. 先迁仓库内示例、fixture 和所有调用方。纯实现替换不要求重命名输入；字段收紧或语义变化
   则需要版本说明，不能以“旧 JSON 仍能解析”证明语义兼容。

**退出条件**：9 个页型都有目标执行路径；所有旧字段有去向；歧义数据有裁决，缺失能力不能用空壳替代。

### C. 迭代验证，关闭缺陷

建立覆盖表，将“页型 × 注册布局 × 关键边界”对应到具体内容、候选 SHA 和逐页 review。
不机械穷举所有字段组合，但必须覆盖所有布局、所有可见字段及会影响几何/数据的边界：

- 合理最小/最大条目数、短/长文本、Latin/CJK 混排、常规/粗体、长单词和组合 value+suffix。
- 同内容的不同合法构图、`auto` 的确定性选择、连续重复页和短 deck 的节奏适用条件。
- 数据零值、极小值和适用时的负值；不支持的范围明确失败，不通过裁切或最小宽度伪造数据。
- 非法字段、未知布局、超容量、缺少单位/来源等反例；合法的可选字段组合及内容泄漏探针。
- 一份不同主题的新内容，检验输出是否仍然是 Biennale，而不是只能生成原来的 Aurora 样例。

每轮沿用评估文档的五层证据：输入 → patch → 对象/数值回读 → canonical PNG → 原生宿主。
机器报告不能代替人工逐页检查；contact sheet 用于节奏，逐页大图用于几何和细节。
尤其检查形状内编号的视觉中心、标题底板范围、线与字的距离、表格下方说明区和脚注留白。

原生宿主检查必须使用最终候选文件：打开无 Repair，另存、关闭、重开无 Repair，
再核对页数、文字、原生图表/表格、数据和代表性编辑。保存后的文件有新 SHA，需要独立记录；
不要求它与保存前字节相同。宿主不可用时记录“未验证”，不能宣布完成最终清理验收。

**退出条件**：覆盖表无缺页，逐页视觉通过，关键对象与数据完整，原生宿主通过，阻塞缺陷关闭。
修改后只重跑受影响范围及必要共享回归；不能用旧一轮的截图给新候选签字。

### D. 切换入口并删除 Biennale 的旧执行路径

验收通过后，在同一套件迁移变更中完成入口切换、相关调用方更新及旧实现退役：

1. `createDeck` 的所有页型都走目标解析/组件路径，移除原有 8 个页型函数及专用辅助逻辑。
2. `makeOps` 中仅服务旧槽位的包装、`footerBand` 对 `legacyLayouts` 的访问等按调用图清理。
   仍有用的光晕等原生绘制能力移入有合同约束的专用组件，不能一并误删。
3. Biennale 不再依赖 `resolveDesignSlot` / `writeDesignText`。共享函数若已无其他使用者可删除；
   仍被其他套件或工具使用时，登记消费者和删除条件，留到共享清理阶段处理。
4. 将旧槽位测试改为新计划、真实容量、语义完整性和失败行为测试。删除仅断言退役实现细节的测试，
   保留兼容、确定性、数据零值和视觉缺陷等行为回归，不能靠减少覆盖让测试通过。
5. 更新 README、发现输出、示例和 benchmark 预期，清除“旧版/新版任选”的活动操作说明。

**退出条件**：Biennale 的旧渲染分支为零；全部 9 类页面经新合同生成；发布入口只有一条实现。
此时如果其他套件尚未迁完，全仓清理仍未完成。

### E. 兼容策略：兼容输入，不长期保留双渲染器

优先直接让原输入走新执行器。确需过渡转换时，只保留显式、可测试的输入适配，
输出同一个新语义模型；转换失败应报错，不能偷偷退回旧绘制函数。

默认不分发 `legacy-v1` kit，不增加长期 `--legacy` 开关，不保留两套默认构建器。
每个临时输入适配都记录用途、消费者、目标内容版本和移除条件：仓库调用方已迁完，
约定兼容版本结束，且迁移说明已发布。需要跨版本兼容时可在明确的发布边界移除，
不能以“也许有人还在用”为由无限保留旧渲染器。

`C`、`FONT_*` 等现有导出若只是读取新合同的别名，可以继续保留，它们不构成旧方案。
确需删除公共导出时，先迁完仓库使用者，并记录外部使用者的版本迁移方式。

## 5. 文件级处理清单

以下是候选处理范围，删除必须以迁移后的实际引用检查和测试为依据。

| 文件/区域                                                                                 | 处理方式                                 | 删除或收尾条件                                    |
| ----------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| `assets/deckkits/biennale-yellow.kit.mjs`                                                 | 保留入口，替换旧分派与绘制逻辑           | 不删除整个文件；所有页型走新执行器                |
| `biennale-yellow/design.json`、`intent.md`                                                | 补齐目标视觉族与使用意图                 | 移走旧槽位事实；无两套权威数值                    |
| 待新增的 Biennale 视觉族模块                                                              | 注册布局、容量、组件和相关检查           | 有真实职责与验证，不照搬旧生成器                  |
| `schemas/biennale-yellow/*.schema.json`                                                   | 保留有效页型名称，更新语义和投影         | 无失效槽位引用；数据字段变更有迁移说明            |
| `examples/biennale-yellow-content.json`、`examples/biennale-yellow-evidence-content.json` | 更新数据模型并保留独立证据变体内容       | 全部进入新路径，内容仍留在输入侧                  |
| `examples/biennale-yellow-build.mjs`                                                      | 保留或收敛标准构建胶水                   | 不再直接绕过合同校验；胶水本身不是旧方案          |
| `benchmarks/visual/index.json` 与 Biennale cases                                          | 继续覆盖原 8 页与证据构图，补边界样例    | case、expected、review、baseline 与实际新候选一致 |
| `benchmarks/visual/baselines/biennale-yellow.*`                                           | 新候选人工 review 后按差异更新           | 不靠批量接受 baseline 掩盖缺陷                    |
| `assets/examples/biennale-yellow/` 及其索引                                               | 更新有意分发的 showcase 和摘要           | 通过工具生成，manifest/hash/页数对应新文件        |
| `tools/tests/pptx-nova-design-contract.test.mjs`                                          | 替换 `DESIGN.legacyLayouts` 等实现耦合   | 等价行为和反例覆盖保留，新增全页计划覆盖          |
| `tools/generate-pptx-design-projections.mjs`                                              | 增加目标视觉族投影，最终移除 legacy 循环 | 所有预算/布局投影有新来源且 `--check` 通过        |
| `assets/deckkits/validate-deckkit.mjs`                                                    | 移除旧实例槽位检查，改走对应新解析器     | 所有套件有合同后，不再对缺合同静默返回旧校验结果  |
| `assets/deckkits/design-contract.mjs`                                                     | 保留合同平台，删除无消费者的旧槽位职责   | 不误删仍在使用的 evidence、主题、规则和回读能力   |
| `assets/deckkits/schemas/design.schema.json`                                              | 分阶段取消并最终禁止 `legacyLayouts`     | 所有合同与消费者迁完后不再接受此字段              |
| `scripts/pptx-nova-deckkit-design.mjs`                                                    | discovery 输出完整注册页型/布局          | 停用 `legacySlideTypes`，处理发现合同的版本兼容   |
| catalog、选择器、slots/文档生成与 release 检查                                            | 统一指向新合同和有效运行入口             | 无缺合同的活动套件，无失效链接/投影               |

上表 `assets/`、`scripts/`、`benchmarks/` 路径均相对 `pptx-nova/`；`tools/` 为仓库根目录。
简写的 `biennale-yellow/`、`schemas/`、`examples/` 相对 `pptx-nova/assets/deckkits/`。

两个容易遗漏的收尾问题：

1. **不要按名字删除 benchmark。** `biennale-yellow.golden-html` 记录的是来源和既有 case id，
   不代表它必须继续调用旧渲染器。可保留 id 并更新实现；确需改名时同步 index、路径、预期、
   review、baseline、showcase 及文档，不能留下悬空引用。
2. **先修正 showcase 选择机制。** 当前 `golden-html` 和 `evidence-variants` 都是 golden，
   但 `tools/update-pptx-nova-deckkit-examples.mjs` 的 `selectGoldenCases` 对同套件多个 golden
   直接报错。执行迁移时应增加明确的 showcase case 选择，或等价的受校验主样例标记；
   不能删除证据变体、伪改 case 类型或随意取第一个来绕过冲突。此修正目前尚未实施。

## 6. 从 Biennale 推广到所有旧套件

### 6.1 分批迁移，每批能独立验收和回退

建议顺序如下；分组是实施顺序，不代表可以共享同一个视觉族。

| 批次 | 范围                     | 重点                                                     |
| ---- | ------------------------ | -------------------------------------------------------- |
| 1    | biennale-yellow          | 证明混合实现可完整退役，形成字段映射、清理清单和验收模板 |
| 2    | long-table               | 复用迁移流程；验证编辑式清单、日程与暖色编辑构图         |
| 3    | cartesian、mckinsey-blue | 核对数据图、图片与原生翻新路径，防止把换肤能力一起删除   |
| 4    | swiss-grid、broadside    | 验证更多页型与特殊图形；拒绝为统一接口牺牲风格特征       |
| 5    | consulting-dark          | 完成默认/咨询路径及其调用方切换；同时收拢全仓旧机制      |

每套都执行 A–E，不以 Biennale 的验收替代。每批完成后复查共享接口和已迁套件，
只有遇到第二个真实消费者才提取公共视觉能力；不为赶进度先复制六套生成器再慢慢整理。

每套迁移报告至少记录：起始版本、来源、字段和资产覆盖、布局覆盖、输入兼容决策、
机器/视觉/宿主证据、未关闭缺陷、退役符号、剩余共享消费者和当前发布资格。
该报告是清理依据；readiness 的单个绿色结果不能代替它。

### 6.2 最后一批完成后，移除共享的旧机制

1. 所有活动 catalog entry 都必须注册有效 `designContract`，所有 supportedSlideTypes 都有已注册
   解析与执行能力。允许新增视觉族，不允许缺合同套件继续走旧路径。
2. 先使共享消费者能在没有 `legacyLayouts` 时正常工作，再从 schema 的 required 中移除该字段。
   所有套件迁完后，从合同文件、schema properties、执行/校验/投影/发现代码中彻底移除并拒绝该字段；
   不把四个空对象当作完成。若这些改动改变对外合同，按兼容影响调整合同/发现版本和发布说明。
3. 删除已无消费者的 `resolveDesignSlot`、`writeDesignText` 及旧预算投影/实例检查，更新相关测试。
   类似名称不是删除依据，调用链和实际职责才是依据。
4. 移除“缺少 designContract 则沿用旧校验”的活动降级分支。未知套件、合同缺失、未知组件/布局
   必须给出明确失败，不能生成一个看似成功但没有设计约束的 deck。
5. 保留通用 `validateContent` 与几何操作；旧页型专属的 fit 分派按消费者迁出或删除。
   不因去掉一个旧入口而破坏 schema 校验、资产解析、内容泄漏检查和标准 Create。
6. 更新 DeckKit README、主 skill 路由、开发者 skill、discovery、选择规则及公共命令示例。
   “合同为 opt-in”的活动描述应改为新事实；历史评估保留时间和状态，不重写成从未存在旧方案。

对 `core-primitives` 的修改仍受其职责边界和冻结规则约束。优先在合同/视觉族层完成迁移，
不把风格分支塞入 core，也不借本次清理重写无关底层逻辑。xdoc transport 的正常 CLI 降级
与 DeckKit 旧渲染器退役是两件事，不在此清理范围内。

### 6.3 增加防回退检查

建议增加维护者侧静态审计及测试，接入 smoke/public audit 或发布检查；这是待实现项：

- 所有可分发套件都有合同、intent、有效入口及注册页型覆盖，动态 catalog 路径均可解析。
- 合同和生产代码不得重新出现 `legacyLayouts`、旧槽位 API 或无合同运行降级。
- 构建样例的计划覆盖全部页面，不能通过“只有新证据页有计划”绕过完整迁移。
- schema/catalog 投影、发现数据与执行计划一致；测试明确覆盖未知合同和失效组件的拒绝行为。
- 历史文档、负例 fixture 可保留旧字段名称，但要限定位置和用途；不能用全仓文字零匹配代替语义审计。

不强制适配器行数上限，也不禁止视觉组件中的正常条件判断。防线要阻止旧执行路径复活，
而不是追求看起来整齐的代码数量。

## 7. 验证命令与证据管理

以下命令均为现有入口；正式执行迁移前先跑 smoke/public audit，修改后再次跑。
示例路径中的 `RUN_ID`、`NN` 应替换为本次新建目录的运行标识和轮次，不直接覆盖已有产物。

```bash
node tools/pptx-nova-smoke-test.mjs
node tools/pptx-nova-audit-public.mjs --strict
node tools/generate-pptx-design-projections.mjs biennale-yellow --check
node --test tools/tests/pptx-nova-design-contract.test.mjs
node pptx-nova/scripts/pptx-nova-deckkit-benchmark.mjs --deckkit biennale-yellow --all --repeat 3 --out .tmp/deckkit-biennale-yellow-cleanup-RUN_ID/iterations/NN/benchmark
node pptx-nova/scripts/pptx-nova-deckkit-readiness.mjs --deckkit biennale-yellow --target candidate --benchmark-mode required-live --out .tmp/deckkit-biennale-yellow-cleanup-RUN_ID/iterations/NN/benchmark
```

`--repeat 3` 用于重复验证/构建及计时，不替代同内容多构图测试，也不证明 PPTX 字节完全一致。
投影需要更新时使用同一生成器的写入模式，再执行 `--check`；不能手工修摘要掩盖漂移。
上面的命令不构成 canonical Create 或原生宿主验收，后两者按标准流程另存证据。

每套通过后运行受影响的共享测试；修改共享合同、校验或发布机制时，再执行全仓测试、
全 DeckKit benchmark/readiness 回归。若涉及交付/默认资格，另外检查对应 `delivery` / `default`
目标，不能用 `candidate` 通过替代。readiness 必须读取本轮 live 证据，不能退回 catalog 摘要。

showcase 在修好主样例选择后，通过更新工具写入；使用本次独立 `--tmp` 目录并加 `--no-clean`，
避免其默认清理行为触及历史证据。只有有意分发的 curated 示例才可入库，普通生成的 PPTX、PNG、
contact sheet 和完整运行报告留在本轮 run 内。共享变更仍须保持发布 skill 自包含、Node 20+
内置模块基线，不依赖仓库根工具或本机路径；本次清理不更新 `docs/xdoc-schema.json`。

所有最终验收记录绑定 Git commit/工作树状态、合同 hash、内容 hash、runtime、候选 SHA、
逐页 PNG 和宿主结果。已知 Repair、内容丢失或视觉失败优先于旧的 pass 摘要。

尤其注意 [REPAIR-001](repair-issues.md)：当前修复不能自动修好历史 PPTX。
共享回归和 showcase 都必须由当前受支持 runtime 重新生成；不能把历史 Clear Value 的 41 页
机器/视觉通过直接当作新文件的原生兼容证据。环图等已知高风险组合需保留针对性回归。

## 8. 提交、回退与最终完成标准

### 提交粒度

先完成并验证一个套件，再提交该套件的合同/组件/入口、schemas/catalog 投影、fixture、
benchmark 与说明；相关依赖应能在该 commit 一起工作。共享前置能力若独立提交，应保持旧入口
在迁移期可用。所有套件迁完后，再用独立变更删除共享旧机制并启用防回退门禁。

正常开发过程中可用不同分支/commit 做新旧对照，不必给用户分发双运行器。最终切换时，
受影响的发布资格必须与证据一致；无法满足既有交付门槛时暂不切换到交付入口，也不能让默认
选择器静默选用未达标替代品。

### 回退方式

用 Git commit 或发布版本回退代码、合同、catalog、schema、示例和 baseline 的一致组合；
不只回退单个 kit 文件。回退后仍用受支持的 runtime 重建并验证目标 deck。
已知会触发 Repair 的旧二进制产物不得重新充当“安全回退文件”；历史失败样本只作复现证据。
用户 deck、参考源和无关 run 不受代码回退影响。

### 单套件完成标准

- [ ] 所有原有页面职责、可见字段和有效资产能力都有保留或明确的版本迁移决定。
- [ ] 目标合同覆盖全部页型/注册布局，整个 deck 有计划、实例容量和实际对象回读。
- [ ] 相同输入的构图选择与 patch 确定；跨内容仍能保持风格并产生合理变化。
- [ ] 逐页视觉与原生宿主验收通过；阻塞缺陷关闭，跳过项没有计入成功。
- [ ] 旧渲染函数、旧执行分支及本套件专属的失效依赖已删除，没有静默回退。
- [ ] schemas、catalog、discovery、文档、benchmark、curated 示例和发布资格一致。
- [ ] 临时输入兼容层有明确移除条件；没有永久保留第二套渲染器。

### 全仓最终完成标准

- [ ] 当前 10 套及届时新增的所有可分发 DeckKit 均采用合同执行路径。
- [ ] 六套旧实现与 Biennale 的旧 8 页型分支全部退役，所有页型完整覆盖。
- [ ] `legacyLayouts` 从所有合同、schema 和活动消费者中移除，旧 API 和无合同降级已删除。
- [ ] 共用图表/表格、资产、翻新、选择与交付流程没有因清理而失去有效能力。
- [ ] 公共审计、投影、测试、各套件 live benchmark/readiness 和所需宿主检查通过。
- [ ] 发布包内没有重复旧生成器、永久 legacy 目录或指向旧方案的活动操作入口。
- [ ] 防回退检查已启用，维护者报告能区分机器、视觉、原生宿主和发布状态。

达到这些条件，才可以宣告“旧方案已清理”。新增 JSON 文件、把入口变薄、代码变少，
或仅有新样例通过，都不能单独作为完成依据。
