# pptx-nova 设计语言载体评估

评估日期：2026-10-21。范围：设计语言的表达、执行、扩展与验证；不修改现有生成流程。

## 结论

如果今天必须二选一，继续以 DeckKit 为交付基础。它已经连接内容校验、确定性生成和质量门禁，纯 `design.md` 无法直接替代它。

但面向“同一风格稳定、布局灵活、表达多样”的目标，建议演进为 **JSON 设计合同 + Markdown 设计意图 + 可执行组件与布局配方**。继续沿用 DeckKit 作为分发与兼容单位，让 `.kit.mjs` 逐步成为合同的执行适配器，而不是让每种风格都重复实现一套大生成器。

关键变化是：**锁定设计身份，开放受约束的构图；把可验证的规则从模型记忆中移到执行链中。** 单纯把 Markdown 转成 JSON，或者把 JS 常量抽成配置，都不足以达到这个目标。

以下架构和示例均为建议，尚未实现；自定义合同不能直接传给当前 xdoc。

## 1. 比较对象应是两套机制

`biennale-yellow.kit.mjs` 本身是生成器。它的完整合同还分布在：

- [catalog.json](../pptx-nova/assets/deckkits/catalog.json)：`visualGrammar`、`layoutContract`、`diversityGate`、密度、字体底线、翻新配置、readiness 等。
- [页型 schemas](../pptx-nova/assets/deckkits/schemas/biennale-yellow/)：字段、条目数量、槽位文字预算。
- [core-primitives.kit.mjs](../pptx-nova/assets/deckkits/core-primitives.kit.mjs)：几何边界、内容校验、版式分组多样性和部分质量检查。
- [DeckKit 工作流](../pptx-nova/references/deckkit-mode.md)：内容合同、生成、dry-run、应用、预览和人工视觉复核。

Black Gold Ledger 的 [design.md](../../refs/open-kimi-ppt-skill/skills/open-kimi-ppt/reference/design_system/finance/black-gold-ledger/design.md) 则是面向模型/设计者的语义规范，包含金融领域基线与黑金视觉系统，不能只看成一张配色表。

| 维度         | 当前 Biennale DeckKit 机制                       | Black Gold Ledger design.md                            |
| ------------ | ------------------------------------------------ | ------------------------------------------------------ |
| 设计意图     | catalog 有概述，具体实现主要隐含在代码中         | 明确说明气质、注意力、阅读路径、页面职责               |
| 一致性       | 固定字体、色值、坐标与组件，执行稳定             | 规则丰富，但依赖模型逐条记住、解释和落实               |
| 布局自由     | 8 个预制页型内稳定；新表达通常需要扩展代码与合同 | 可以组合新的页面，布局自由度较高，但缺少执行边界       |
| 数据表达     | 此 kit 的条形图和表格外观由形状/文本组成         | 定义了组合图、折线、排名、点图、表内进度等语言         |
| 密度适应     | 字段与数量限制明确；槽位主要固定                 | 提供信息块/图表标注/深浅页密度原则，但数量口径需机器化 |
| 可验证性     | 已有内容、几何、分组、质量与视觉工作流           | 未见该文件把规则绑定到机器验证器                       |
| 维护风险     | 代码、schema、catalog 重复表达事实，可能漂移     | 文内规则之间需要优先级，且易混合内容政策与视觉规范     |
| 最适合的角色 | 已验证的执行后端与版式基线                       | 设计意图、构图语法和规则素材来源                       |

这不是 JS 与 Markdown 谁更先进的问题，而是“设计规范”与“规范的执行程序”承担不同职责。

## 2. 从现有实现得到的直接证据

### 2.1 稳定性来自程序，而不是扩展名

对 bundled Biennale 内容直接调用 `createDeck()`：8 页、671 条操作；两次相同输入得到相同 patch SHA-256。操作种类为 slide、shape、text，未出现 `set-theme`、`add-chart` 或 `add-table`。

这证明此样例的 **patch 生成确定性**，不证明 PPTX 字节一致，也不证明跨字体、平台或渲染器的像素一致。[本次实验记录](../.pptx-nova/style-contract-evaluation-20261021/generator-observations.json)

生成器按 `slide.type` 分派固定函数，见 [biennale-yellow.kit.mjs](../pptx-nova/assets/deckkits/biennale-yellow.kit.mjs) 第 526–543 行。只在直接调用生成器时增加 `layoutIntent` / `macroLayout`，patch 不变；当前内容校验还会拒绝这两个额外 slide 字段。因此，不能把写入布局意图当成已经获得了新布局能力。要扩展这种能力，必须同时修改合同与执行层。

### 2.2 已有合同也会漂移

- 数据页标题：schema 的 `x-slotBudget` 是 **36pt / 3.4in**；生成器实际是 **34pt / 5.6in**。
- 统计值：schema 分别为 value/suffix 预算 **72pt / 1.3in、0.5in**；生成器合并两者，以 **62pt / 2.8in** 绘制。
- catalog 的翻新配置将 `secondarySeries` 指向 `palette.secondary`，其值是 ember；同一 chartRemap 的 prose 又要求 ember 只用于光晕，不能用于图表系列。

来源：[数据页 schema](../pptx-nova/assets/deckkits/schemas/biennale-yellow/biennaleDataSlide.schema.json) 第 10、25–29 行；[生成器](../pptx-nova/assets/deckkits/biennale-yellow.kit.mjs) 第 359–379 行；[catalog](../pptx-nova/assets/deckkits/catalog.json) 第 3418–3425、3463–3473 行。

这些事实说明：需要统一事实来源，并从实际解析后的组件几何生成槽位预算，而非继续手工同步几份描述。这里记录的是局部不一致，不代表整个 DeckKit 不可交付。本次 readiness 检查按既有 catalog 证据判定 delivery PASS；没有重新运行视觉 benchmark。

### 2.3 形状可编辑与原生数据对象可编辑需要区分

数据页第 408–418 行以 `pct` 控制矩形宽度，并单独显示字符串 `value`，二者没有在此处建立数值一致性关系。比例还会被限制到 0.04–1，零值也会出现最小宽度。

形状绘制适合部分高度定制的数据图形，但不能因此宣称它具有原生图表的数据系列、坐标轴或工作簿语义。新合同应该明确 `native-chart`、`native-table`、`data-backed-shapes` 等实现方式及各自验证责任；当使用数据形状时，从一个数值模型计算图形与标签，并保存来源、单位和尺度。

## 3. xdoc 的特点决定了合同该怎样落地

本次读取本机 `xdoc --version`：`0.13.0 (ea2c8e58)`；能力探测、定向命令合同与 operation schema 保存于 [本次证据目录](../.pptx-nova/style-contract-evaluation-20261021/)。判断以当前 schema 披露为准，不把旧 snapshot 或命令存在本身当作全部能力证明。

| 设计合同内容       | 已披露的 xdoc 表达能力                                            | pptx-nova 仍需承担的工作                            |
| ------------------ | ----------------------------------------------------------------- | --------------------------------------------------- |
| 色彩、字体身份     | `set-theme`，主题颜色/major/minor 字体；品牌工具                  | 语义色到主题槽位的映射、文字/图表的具体角色样式     |
| 公共页面结构       | master、layout、placeholder 和默认文字样式操作                    | 选择合适的继承方式、特殊页例外、具体构图            |
| 原生数据图表       | `add-chart` / `set-chart`，系列、数据标签、轴、图例等 schema 字段 | 内容选择、适配具体 chart kind、数据完整性和视觉检查 |
| 原生表格           | `add-table` / `set-table`，行列、单元格、边框等                   | 表格语义、内容预算、分页和特定表格组件              |
| 特征形状与效果     | `set-shape` 的填充、线、效果；原生形状                            | 风格允许哪些效果，以及参数范围和使用条件            |
| 有界文字适配       | `fit-text` 的 min/maxFontSize、strategy；text frame               | 字号下限、先改布局还是拆页、无法适配时的决策        |
| 重复组件/组合      | `define-macro` / `use-macro`，recipe 编译为普通 patch             | 宏/配方选择、风格绑定、布局与实例参数计算           |
| 文档和基础视觉检查 | dry-run、inspect、品牌检查、vision-check、预览等                  | 风格专属规则、跨页节奏、审美与内容适切性复核        |

不能把这些能力理解为 xdoc 自带任意设计语言解释器或通用布局求解器。当前可见合同并没有提供“读取这份 style JSON，就自动理解所有设计规则”的接口。新格式需要由 pptx-nova 解释和编译，输出已有的 `pptx-patch/v1`。

也不要把 `swap-style` 等同于重排页面：现有 [theme-packs.md](../pptx-nova/references/theme-packs.md) 第 33–44 行明确，其安全作用面是母版/默认文字样式，任意现有形状几何、阴影、图表布局不会因此自动改变。换肤与重新构图应共享设计合同，但采用不同操作策略。

原生能力也需要按子集选择，例如当前 capability truth 对 chartEx 样式的声明比 classic chart 更窄；不能给所有图表套同一套 `set-chart` 字段。原生图表应优先用于需要数据语义和后续编辑的对象；确需形状实现时，显式记录其语义和验证限制。

## 4. 推荐的职责划分

### 4.1 JSON：可执行的设计合同

建议新增每种风格的 `design.json`，使用一个小而明确的、带版本的 schema。它定义：

1. **语义 tokens**：背景、主文字、次文字、结构线、强调、历史/当前/预测、风险；标题、正文、数字、图注等文字角色；单位明确的间距和尺寸。
2. **身份不变量**：允许的字体和色系、装饰语言、页面公共结构、禁止效果、关键对齐关系。
3. **组件合同**：KPI、标题组、资料栏、来源页脚、排名图、表格等组件的输入、角色、容量与可选变体。
4. **构图语法**：哪些内容适合哪些布局族，区域关系、宽度比例选项、可插入组件、可扩展行数和密度模式。
5. **跨页节奏**：哪些位置允许深色页，哪些页面承担停顿，如何限制连续相同构图；短 deck 的适用条件。
6. **验证规则**：规则 ID、作用域、强度、检查器和依据；无法自动验证的项目明确要求视觉复核。

只把色号、字号抽成 tokens 不够：真正塑造黑金风格的是“白色证据页、深色判断页、一个注意力焦点、横向细线表、数据直接标注”等相互关联的规则。

规则强度应区分：

| 类型     | 示例                                              | 执行方式                         |
| -------- | ------------------------------------------------- | -------------------------------- |
| 必须满足 | 不使用阴影；字体白名单；不丢单位和来源            | 可确定验证时失败阻断             |
| 条件规则 | 深色页只承载 summary/decision；预测线使用指定编码 | 依据页/数据角色执行              |
| 优化偏好 | 接近 1/4 的深色页；长 deck 构图充分变化           | 选择候选布局时优化，保留偏离原因 |
| 视觉判断 | 编辑感、留白张力、强调是否恰当                    | 对最终 PNG/contact sheet 复核    |

“金色面积 <3%”要定义计量口径：按语义分组还是按 shape、是否计入文字、透明度及遮挡如何处理。初期可执行“一个强调组”的结构规则，把面积检查标为估计；不要拿 bbox 面积当真实像素面积，更不能把一个金色组中的多个 shape 误算成多个焦点。

### 4.2 Markdown：保留设计意图与使用判断

建议保留小篇幅 `intent.md`：写气质、构图理由、适用/不适用内容、图像选择、好坏范例和难以机器化的视觉判断。供模型规划与视觉复核使用。

数值、白名单、容量等以 JSON 为唯一来源。面向阅读的数值速查页由 JSON 生成；不要在 Markdown 再维护一套权威数值。

Black Gold 文档中有些规则属于 finance 领域/叙事政策，例如估值必须有敏感性表、回报采用情景范围、结尾必须落到投资决策。这些应拆到独立领域 policy，不能让选择“黑金皮肤”自动改变用户的非金融内容。用户内容与数据语义不能为了风格被删改；发生真实冲突时，报告不兼容并调整布局/明确风格例外。

### 4.3 MJS：共享执行器与少量专用实现

JSON 表达参数、规则与关系，MJS 负责字体测量结果消费、几何求值、组件组合和 patch 编译。普通样式不应重复实现 textbox、边框、页脚、图表标签。

共享的是内容语义与底层能力，不必强制所有风格使用同一套视觉组件。Biennale 的大字、黄色结构块、光晕与黑金的资料栏、单焦点、灰阶证据图应有各自的组合规则；如果只让同一套卡片换颜色，会丢掉设计语言。也不能承诺所有内容都能无条件切换到任意皮肤，必须先检查证据类型与组件覆盖是否兼容。

复杂专用组件仍可保留 MJS。先使用有限的已注册组件与布局操作，不急于发明一门带任意表达式、继承、循环的配置语言。xdoc 宏/recipe 可以复用其中适配的操作，但不必把所有 JS 强行迁移成宏。

概念目录如下，不要求一次建立所有目录：

```text
assets/deckkits/<id>/
  design.json          # 机器合同：tokens、角色、规则、组件/布局注册
  intent.md            # 人/模型阅读的意图与视觉判断
  recipes/             # 受约束的布局配方；非直接 xdoc recipe 的须另行编译
  components.mjs       # 可选，真正独有的组件
  examples/            # 基线、允许的变化、反例

assets/deckkits/<id>.kit.mjs  # 保留 createDeck 接口的兼容适配器
```

catalog 的风格数值、槽位 budgets、readiness 摘要等尽量从合同与解析后的组件数据生成。不要因增加 `design.json`，反而多出第五份需要手动同步的事实源。

## 5. 用构图语法实现稳定的多样性

“固定全部坐标”和“让模型每页自由发挥”之间，可以使用有限、可计算的构图语法：

- **身份固定**：字体层级、颜色职责、对齐、页脚、细线和特征元素保持一致。
- **结构可选**：同一趋势内容可使用全宽主图、主图+KPI 侧栏、主图+底部解释带、小多图等布局族。
- **内容驱动**：根据数据点、标签长度、表格行数、解释数量及讲述目的，筛选能够容纳内容的布局。
- **变体有界**：仅允许注册的列比例、密度、强调位置和组件组合，禁止随意改变字号/颜色来制造差异。
- **选择可复现**：固定版本与环境下，用确定性排序选取候选；需要多个版本时显式提供 variation/seed，并记录最终选择，而不是每次随机。

建议使用逐级选择：先排除内容/数据语义不兼容和硬约束失败的布局，再比较文字适配、阅读层级和跨页重复，最后用稳定次序打破平局。初期不必实现通用约束求解器。

当前 diversity gate 主要统计 slide type 所属分组、最少独特分组及连续同组数量，见 [core-primitives](../pptx-nova/assets/deckkits/core-primitives.kit.mjs) 第 1386–1482 行。它可以阻止部分模板重复，却不能证明最终视觉构图有变化。

建议扩展为：记录实际布局族、区域关系、证据对象类型、密度与主视觉位置；基于这些解析结果检查连续重复，结合 contact sheet 验证。不能只给相同坐标的页面换一个 `variant` 名字，也不应为了凑多样性插入不合适的图表或呼吸页。

### 合同的概念片段

下面是拟议的 pptx-nova 自有格式片段；省略了完整 tokens、组件和规则定义。不是 xdoc 当前输入，也不是已经可执行的 schema。

```json
{
  "schemaVersion": "pptx-nova-design/v1",
  "id": "black-gold-ledger",
  "version": "0.1.0",
  "intent": "金融期刊式秩序；证据页克制，判断页凝练",
  "colors": {
    "paper": "FFFFFF",
    "ink": "0A0A0A",
    "dark": "151515",
    "focus": "D6A000",
    "historical": "D6D6D6",
    "risk": "A86038"
  },
  "pageModes": {
    "evidence": { "background": "paper", "titleColor": "ink" },
    "judgment": { "background": "dark", "allowedRoles": ["summary", "decision"] }
  },
  "layoutFamilies": {
    "trend": {
      "proofKinds": ["time-series"],
      "variants": ["full-width", "with-kpi-rail", "with-explanation-band"],
      "components": ["assertion-header", "trend-chart", "source-footer"],
      "overflowOrder": ["choose-larger-region", "choose-other-variant", "split-slide"]
    }
  },
  "rules": [
    {
      "id": "focus-one-group",
      "scope": "slide",
      "strength": "must",
      "check": "semantic-accent-group-count",
      "max": 1
    },
    {
      "id": "no-shadow",
      "scope": "deck",
      "strength": "must",
      "check": "forbidden-effect",
      "effect": "shadow"
    }
  ]
}
```

上例的 `check` 名称必须由新增的验证器实际实现；未知检查器不能被忽略后报告“合规”。JSON Schema 只能检查这种数据结构，不能自动证明其视觉规则成立。

## 6. JSON、YAML、Markdown、JS 的取舍

| 形式          | 建议用途                   | 主要取舍                                                                       |
| ------------- | -------------------------- | ------------------------------------------------------------------------------ |
| JSON + schema | 正式机器合同、运行输入     | Node 内置解析；易校验、合并和计算 hash；说明性文字可用 description 字段        |
| YAML          | 可选作者输入格式           | 可读、可注释，但 Node 没有内置 YAML 解析；完整支持会引入解析依赖或额外构建步骤 |
| Markdown      | 意图、范例、软规则、评审   | 模型易理解；不能单独提供稳定执行与机器校验                                     |
| JS/MJS        | 组件、布局求值与 xdoc 适配 | 能力充分；作为全部风格事实来源时不利于检查和复用                               |
| 自创文本 DSL  | 暂不建议                   | 新增语法、解析、错误处理与工具成本；当前收益不及先定义清晰的数据模型           |

按仓库发布要求，必需路径应为 Node 20+ 内置模块与 xdoc；因此 JSON 最适合作为正式合同。若维护者确实喜欢 YAML，可将其作为可选构建输入并预编译、校验为 JSON；发布用户只消费 JSON，不依赖 YAML 工具。

tokens 层可以参考 [DTCG 2025.10 Format](https://www.designtokens.org/TR/2025.10/format/) 的类型、分组和别名思路。该规范用于设计 tokens 交换，并不覆盖 PPTX 的布局、图表语义与跨页节奏；它是 Community Group Report，不应称为 W3C 标准。本建议不要求立即实现完整 DTCG 兼容。

## 7. 执行与验证闭环

```text
brief + content + 可选领域 policy
                   ↓
design.json + intent.md → 内容/证据规划
                   ↓
选择布局族、组件与受约束变体
                   ↓
resolved design + layout plan + 计算得到的 slot budgets
                   ↓
现有 createDeck 适配器 / 共享编译器
                   ↓
pptx-patch/v1 → dry-run → apply → inspect / 检查 / 预览
                   ↓
机器规则验证 + PNG / contact sheet 视觉复核
```

把规则按能证明的层级分配，而非用一个总分替代所有证据：

1. **输入层**：schema、组件输入、数值/单位、内容完整性、兼容条件。
2. **解析/patch 层**：已求值的字体/颜色、组件几何、禁用效果、语义强调组、数据到标记映射。
3. **实际 PPTX 层**：应用后读回对象、主题、图表/表格语义；检查不应只信任生成器的自我声明。
4. **渲染层**：真实文字适配、密度、留白、对比、风格辨识度与跨页节奏。

`check-brand` 可以覆盖其已实现的品牌检查范围，不能替代风格专属检查。dry-run 成功也不等于视觉成功。master/theme 继承、透明度、字体替换及特殊图表要按当前运行时能力验证；静态预览不能证明 PowerPoint 播放或其他宿主的全部保真性。

每次 run 建议记录：设计合同与组件版本/hash、xdoc build/schema digest、字体环境、内容 hash、最终布局计划、变体选择、patch 和最终文件 hash、渲染上下文及规则报告。风格稳定应定义为这些条件下的规则和视觉稳定，而不只是文件 hash 相同。

文字过多时遵循有界适配：选择更合适的空间/变体、拆页；确需精简必须满足内容授权。不得无限缩小字号、静默删信息或把原生数据对象栅格化来通过 fit gate。正文、图注、来源的字号下限应分角色，并由实际用途决定，不能只照搬参考图的缩放尺寸。

## 8. 最小落地顺序与验收

### 第一阶段：减少重复事实，不改变现有视觉输出

- 给 Biennale 提取 tokens 与身份规则，保持已有 8 页型和 `createDeck(content)` 接口。
- 先解决代码/schema/catalog 的冲突，明确每个数值的唯一来源。
- 生成槽位预算和阅读摘要；保留旧输入兼容适配，不同时重写内容格式。
- 比较同一基线的解析样式与视觉证据；不要求无关的生成文件字节完全一致。

### 第二阶段：验证同风格的灵活表达

- 为一个证据类型增加少量有实际差异的布局族/变体，打通 schema、执行器和验证。
- 用相同内容测试多个合法布局，确认不是改名或随机坐标偏移。
- 用不同内容长度、CJK/Latin、稀疏/密集数据、长标签、零/负值/缺失值进行压力验证。

### 第三阶段：迁入 Black Gold，检验抽象是否成立

- 将金融领域 policy 与视觉合同分开。
- 先覆盖趋势、排名和表格三类核心证据，再增加更多页型。
- 优先使用原生图表/表格；专用数据形状必须有单一数值来源与独立验证。
- 验证跨页深浅节奏、单焦点、数据直接标注，以及短 deck 的合理例外。

建议增加反例测试：故意引入第二强调组、禁用效果、超量行数、错误颜色、来源缺失、重复构图，确认对应规则真能发现问题。未实现或无法证明的规则应报告未验证，不能以“配置存在”作为通过。

最终验收应分别回答：**风格身份是否稳定、数据语义是否完整、内容是否适配、多样性是否真实、视觉是否达到交付标准**。现有 golden 基线保留用于回归，新内容与合法变体用于检查泛化能力；不能只让唯一参考样例通过。

## 9. 本次核对范围

- 读取了两份比较对象以及 DeckKit catalog、schema、核心校验和构建路径。
- 查看了 Biennale 已有 contact sheet；它能展示现有的视觉身份与 8 页型，不是本次新生成证据。
- 运行本机 xdoc 版本/能力探测，以及 theme、chart、table、text、macro 等定向 schema 查询。
- 执行了生成器确定性/元数据探针与内容校验探针；没有创建新的交付 PPTX。
- 执行 Biennale readiness，使用持久化 catalog 证据；没有重新跑 benchmark 或宣称新架构已通过视觉验证。
- 未修改现有运行时、DeckKit、catalog 或 `docs/xdoc-schema.json`。
