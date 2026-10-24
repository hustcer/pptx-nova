# DeckKits

经过验证矩阵通过后冻结的 DeckKit，用于 pptx-nova 的“DeckKit 模式”二次创作快路径。

已有十套 DeckKit 登记为 `production`，另有 Clear Impact 与 Warm Clay `candidate`。自动选型按用途、语言、
内容密度、页型覆盖范围和匹配度选择。状态以 `catalog.json` 为准。

## 目录结构

```
assets/deckkits/
├── core-primitives.kit.mjs     # 几何安全 + op 生成（所有 DeckKit 共用）
├── design-contract.mjs         # 已注册设计合同、规则与对象/数值回读检查
├── evidence-components.mjs     # 由合同驱动的原生数据证据组件
├── editorial-components.mjs    # 期刊式证据、原生矩阵与判断/行动组件
├── editorial-layouts.mjs       # 内容容量与确定性构图选择
├── strategy-components.mjs     # 深色策略报告、原生图表/矩阵与阶段路线图
├── strategy-layouts.mjs        # 策略报告容量与确定性构图选择
├── annual-components.mjs       # 白底研究报告、原生多图/矩阵与面积比较
├── annual-layouts.mjs          # 逐实例容量检查与确定性构图选择
├── biennale-components.mjs    # 编辑式文字/结构平面、光晕、原生图表与日程表格
├── biennale-layouts.mjs       # 九类页面的完整计划、实例容量和构图选择
├── design-family-registry.mjs # 新视觉族的断言、解析、检查与投影注册
├── cartesian-components.mjs  # 暖石编辑语言的组件计划执行、原生图表与图片
├── cartesian-layouts.mjs     # 十五个页型、二十八个布局、实例容量和节奏选择
├── cartesian/                # Cartesian 2.0 合同与设计意图（production）
├── broadside-components.mjs   # 黑橙海报语言的文字、形状与原生图表执行
├── broadside-layouts.mjs      # 十六类职责、二十八个布局与实例容量
├── broadside-registry.mjs     # Broadside 视觉族检查与发现投影
├── broadside/                # Broadside 2.0 合同与设计意图（production）
├── long-table-components.mjs  # 奶油纸底单墨编辑语言、形状持有文字与原生日程表格
├── long-table-layouts.mjs     # 八类职责、十五个布局、完整组件计划与实例容量
├── long-table-registry.mjs    # Long Table 视觉族断言、检查与发现投影
├── long-table/               # Long Table 2.0 合同与设计意图（production）
├── swiss-components.mjs       # 非对称文字、原生网格示意、Tabler 图标与原生表格
├── swiss-layouts.mjs          # 十五类职责、二十四个布局、数值模型与实例容量
├── swiss-registry.mjs         # Swiss 视觉族断言、身份检查与发现投影
├── swiss-grid/                # Swiss Grid 2.0 合同与设计意图（production）
├── mck-components.mjs         # 白底咨询语言、原生条图、表格与 SVG 图标执行
├── mck-layouts.mjs            # 八类职责、十六个有界构图与逐实例容量
├── mck-registry.mjs           # McKinsey 视觉族断言、检查与发现投影
├── mckinsey-blue/             # McKinsey Blue 2.0 合同与设计意图（production）
├── impact-components.mjs      # 开放证据报告的原生图表、表格、指标和流程
├── impact-layouts.mjs         # 十二类职责、二十四个构图与逐实例容量
├── impact-registry.mjs        # Clear Impact 视觉族断言、检查与发现投影
├── clay-components.mjs        # 暖陶土原生文本、编号、角落圆环、柱图与表格
├── clay-layouts.mjs           # 八类职责、十五个布局与逐实例容量
├── clay-registry.mjs          # 暖陶土视觉族断言、检查与发现投影
├── warm-clay/                 # Warm Clay 0.1.0 合同、意图和迁移验收（candidate）
├── clear-impact/              # Clear Impact 0.1.0 合同、意图和迁移验收（candidate）
├── biennale-yellow/            # design.json 唯一事实源 + intent.md 设计说明
├── black-gold/                 # 第二种合同设计语言（production，以 catalog 为准）
├── green-slate/                # 深色策略报告合同与设计意图（状态以 catalog 为准）
├── clear-value/                # 白底衬线研究报告合同与设计意图（状态以 catalog 为准）
├── icon-assets.kit.mjs         # 固定 Tabler SVG bundle → add-image helper
├── consulting-dark.kit.mjs     # 2.0 咨询风格合同薄适配器
├── <deckkit-id>.kit.mjs        # 各套件公共入口；合同套件为薄适配器
├── catalog.json                # DeckKit 注册表、版本、density 限制、验证记录
├── schemas/                    # content 和各页型 JSON Schema（渐进覆盖）
├── validate-content.mjs        # schema + fit 预检入口
├── examples/                   # 示例 content + build 胶水
└── README.md                   # 本文件
```

Biennale Yellow 2.0 保留九个页型名称，全部经注册合同执行；数据页改用数值、单位、来源，
不再分发旧固定页型渲染器。字段迁移与构图说明见 [intent.md](biennale-yellow/intent.md)。

Cartesian 2.0 保留十个编辑式页型，另提供五个原生展示页型，共二十八个注册布局，
全部经注册组件计划执行。编辑式图表必须提供单位、来源；展示页须提供来源，并在说明中标明适用的单位。
图片槽位和原生段落动画 target 保留。旧页型生成器及旧版 showcase 已替换，
不提供双执行路径。见 [设计与迁移说明](cartesian/intent.md)。

Broadside 2.0 保留十六类职责，提供二十八个注册构图；黑橙色域、超重标题、斜线列表、
衰减文字与闭环结构经合同执行。柱图、横条图和环图保留原生数据对象，要求数值、单位、
来源和系列名；独立环图图例需从 content 重新生成以同步手工数据编辑。
字体采用相近的常用替代，图壳仍为占位形状。见 [设计与迁移说明](broadside/intent.md)。
普通英文标题默认 sentence case；封面、章节和短宣言可有意采用全小写。专名、缩写与用户指定
写法保留，渲染器不自动转换大小写；换行也不重新大写。

Long Table 2.0 保留八个页型入口，十五个注册布局支持封面、信札、索引、特写、节目单、引文、
日程与收束。奶油纸底、锈红单墨、重标题、衬线正文、徽章与胶囊由合同约束；原生日程表格逐格回读。
Arial Black / Georgia 和正体 Arial Unicode MS 为明确替代字体，不随套件打包。
手工调整表格行高或列宽不会同步独立状态轮廓，须从 content 重新生成；不提供图表或图片输入。
见 [设计与迁移说明](long-table/intent.md)。

Swiss Grid 2.0 保留十五个页型入口，以二十四个注册布局表达非对称排版、开放名录、字体样张、
网格示意、时间线与原生表格。封面/收束不显示灰色施工网格；原稿图标、字重差异和列末注释已补齐。
计量示意的几何与标注来自同一数值模型，手工编辑后须重新生成才能同步；Tabler SVG 是矢量图片。
Helvetica / Arial Black / Arial Unicode MS 是不嵌入的替代字体。见 [设计与迁移说明](swiss-grid/intent.md)。

McKinsey Blue 2.0 保留八个页型入口，十六个注册布局覆盖观点标题、直接数值、面积优先矩阵、
渐进蓝色支柱、五项排序与四阶段路线。补回原稿图标、责任/成本明细和治理栏；图表与表格为原生对象，
cohort 宽度和圆面积来自数值。Arial / Arial Unicode MS 不嵌入；SVG 图标的路径节点不承诺原生编辑。
手工改图表、派生形状或旁注不会自动同步，须从 content 重新生成。较长内容应改用合法变体、重组或拆页。
见 [设计与迁移说明](mckinsey-blue/intent.md)。

Clear Impact 提供十二类开放式证据报告职责及二十四个注册构图，支持白底深绿层级、指标带、
原生柱图、稀疏表格、处理链、数值派生达成条和差异桥。中文、英文与混排使用正体无衬线字体。
它须显式选择；派生形状与旁注编辑后须从 content 重新生成。详见 [设计与边界](clear-impact/intent.md)。

Warm Clay 提供八类暖陶土报告职责与十五个有界构图，使用奶油底、墨棕衬线标题、
陶土证据、粉色编号和角落圆环。柱图与表格为原生对象；中文、英文及混排有实际渲染覆盖。
封面竖幅仅为原生占位外壳，不接受图片输入；字体不嵌入，须显式选择。
详见 [设计意图与编辑边界](warm-clay/intent.md) 及 [迁移验收](warm-clay/migration-report.md)。

## core-primitives 职责边界

| 属于 core-primitives（几何安全 + op 生成）             | 不属于 core-primitives（视觉语言）         |
| ------------------------------------------------------ | ------------------------------------------ |
| `nm()`, `assertWithinSlide()`, `grid()`                | 调色板 `C`、具体颜色选择                   |
| `shape()`, `fill()`, `noLine()`, `thinLine()`          | 间距节奏（marginX, gridGap 的具体数值）    |
| `textbox()`, `setText()`, `runFont()`, `tx()`, `box()` | chrome 结构（topBar, footer 的高度/位置）  |
| `withFontFloor()`, `parseFontPt()`, `fontSizeValue()`  | 页型函数（heroSlide, kpiRowSlide 等）      |
| `contrastRatio()`, `readableTextOn()`, `isDarkColor()` | 组件外观（卡片圆角、accent bar 高度）      |
| `icon()`, `addTablerIconPicture()`                     | 具体图标语义选择（哪个 icon 表示某概念）   |
| `cardBox()`, `panelBox()`（结构骨架）                  | 组件内容布局（KPI 圆的位置、编号框的偏移） |
| content schema 校验引擎、fit diagnostics 框架          | 具体页型的 soft/hard limit 数值            |
| `assertWithinSlide` bounds check                       | stylePack/themePack 的选择和解析           |

**判断原则**：如果某段代码换了主题色/间距后仍然正确，它属于 primitives；如果它依赖具体的视觉决策，它属于 DeckKit。

## 校验合同

`validate-content.mjs`、DeckKit build 胶水和 benchmark CLI 调用
`validate-deckkit.mjs` 的 `validateDeckkitContent(content, { deckkit, mode })`。
它先运行 core 的 `validateContent`；只有 catalog 注册了 `designContract` 的套件才增加
合同与语义检查、逐实例的文字容量估计。未迁移套件保持原有行为。直接调用 core 校验
不包含这些额外检查。

`validateContent` 返回：

- `errors`：阻塞性 schema、catalog 或 fit 问题。
- `warnings`：非阻塞 density / fit / catalog 风险。
- `fitDiagnostics`：结构化容量诊断，包含 `slideIndex`、`slideType`、`severity`、`code`、
  `path`、`value`、`limit`、`blocking` 和 `suggestedActions`。
- `normalizedContent`：当前与输入一致，保留给后续规范化。

当前页型级 fit diagnostics 已覆盖 `heroSlide`、`kpiRowSlide`、`multiCardSlide`、
`benchmarkSlide`、`timelineSlide` 和 `askSlide`，并包含长 Latin token 风险检查。

`catalog.json` 可声明两类交付 gate：

- `layoutContract`：按 DeckKit / 页型声明必填数据槽位、任一满足槽位组、允许的
  `layoutId`、`customOps` 策略和 `assetSlots`。draft 默认给 warning，delivery 可通过
  `deliverySeverity` 升级为 error。
- `diversityGate`：按页型分组检查长 deck 的版式多样性、必需叙事组和连续重复组上限，
  避免整套 deck 退化成同一种卡片页。触发时的 `fitDiagnostics` 会同时给出
  `usedGroups`、`missingGroups`、`groupMembers` 和 `slideGroups`，因此 Agent 可以直接
  选择替代页型，不必另查 catalog。
- `visualGrammar`：声明 DeckKit 的视觉语言合同，包含定位、气质、布局原则、
  signature elements、字体/色彩节奏、composition rules 和 avoid 清单。它让 Agent 在
  选择 DeckKit 后知道"这套页面应该长什么样"，并在 readiness audit 中阻止缺少风格合同的
  production/default DeckKit 进入交付。

这些 gate 属于 DeckKit 元数据，不属于单个 deck 的临时 patch。设计合同规则放在合同模块，
不要把特定风格下沉到 core。通用入口共享校验；构建和标准 create runner 还会保存设计计划、
检查应用后的对象和原生数值。详见 `../../references/design-contracts.md`。

合同路线现覆盖全部十套风格：Consulting Dark、Biennale、Cartesian、Broadside、Long Table、Swiss Grid、McKinsey Blue、Black Gold、Green Slate 与 Clear Value。Consulting Dark 2.0 保留深蓝首尾与大小不同的圆形装饰，
用切角面板替换圆角卡片贴色条，提供十类职责、二十个注册布局及英文完整示例；支持中文和混排，
原生条形图保留负数、零与极小值，表格逐格回读。字段迁移和编辑同步边界见 `consulting-dark/intent.md`。
Black Gold 增加原生表格逐格回读、单焦点与
期刊图表/表格规则；Green Slate 增加深色策略报告构图、带底色标签、形状内编号、按时长分配的
阶段路线图和独立说明区。Clear Value 增加白底衬线研究报告、多图证据板、可变列矩阵、原生环图、
预测柱虚线边界和面积成比例的可编辑圆。candidate 状态不等于 production/default 交付资格。开发者从设计规范和
参考图迁入新风格时，使用仓库内 deckkit-maker 的 design-source 路线，保持运行时自包含。

`layoutContract.slideTypes.<slideType>.assetSlots` 是页型的图片槽位合同。它是一个以语义
slot id 为键的对象，每项至少说明 `kind`、`acceptsAsset` 和
`placeholderBehavior`，还可以给出 `labelSlot` / `captionSlot` 与 `note`。槽位参考会把
这些信息输出为单独的 Asset slots 表；当 `acceptsAsset` 为 `false` 时，该页型只会渲染
占位框，`content.json` 的 `imageSlots` 不能注入真实图片，校验器会在 delivery 模式阻止
这种误用。`acceptsAsset: true` 的页型通过 `assets_manifest.json` 解析 asset id；build
生成短的 `assetSource.path`，runner 再把 manifest 所在目录作为 `--asset-root` 传给 xdoc。
没有绑定时是否保留占位框由该页型自己的 `placeholderBehavior` 决定。

`visualGrammar` 不是运行时代码，也不替代页型函数、schema、layout contract 或 diversity gate。
它只约束 DeckKit 使用方式和内容创作方向：选中 DeckKit 后，把 `positioning` 用作风格判断，
用 `signatureElements` 和 `compositionRules` 指导页面构成，用 `avoid` 拦截不匹配的视觉选择。
不要因为有 visual grammar 就在 content 里塞 `customOps` 或临时坐标。

## 使用方式

```bash
node <skill-root>/scripts/pptx-nova-deckkit-slots.mjs \
  --deckkit consulting-dark \
  > deckkit-slots.md

node <skill-root>/assets/deckkits/validate-content.mjs \
  content.json \
  --deckkit consulting-dark \
  --mode delivery

node <skill-root>/scripts/pptx-nova-build.mjs \
  --deckkit consulting-dark \
  content.json \
  -o patch.json \
  --quality-json quality.json
```

不要为普通交付手写每次一份的 `build.mjs`。只有在开发或调试 DeckKit 本身时，才临时导入
`.kit.mjs` 调用 `createDeck(content)`。

## 图标使用

DeckKit 需要 Tabler 图标时，使用 `createOps()` 返回的 `icon()` 或直接使用
`icon-assets.kit.mjs`。它只读取 `../icons/tabler-icons.pack.br`，并把 SVG
内联为 `add-image` 的 `bytesBase64 + mimeType`，不依赖网络、临时 SVG 文件或 Tabler
源码目录：

```js
const p = createOps()
p.addSlide(0, '0B1020')
p.icon(0, 'S0_StatusIcon', 'chart-line', 0.72, 0.72, 0.28, 0.28, {
  color: 'C8583A',
})
```

查找图标时使用 agent 入口，避免把全量 SVG 读入上下文：

```bash
node <skill-root>/scripts/pptx-nova-icons.mjs search "analytics dashboard" --style outline --limit 12 --json
node <skill-root>/scripts/pptx-nova-icons.mjs get chart-line users presentation --style outline --json
```

图标包覆盖 Tabler `outline` 和 `filled` 全量图标。刷新 pack 与 license 时运行
`node <skill-root>/scripts/pptx-nova-icons.mjs generate --source-root <tabler-icons-checkout>` 和
`node <skill-root>/scripts/pptx-nova-icons.mjs generate --source-root <tabler-icons-checkout> --check`（也可改用 `TABLER_ICONS_ROOT` 环境变量指定 checkout）。

## 版本规则（semver）

| 修改类型                                                      | 版本  |
| ------------------------------------------------------------- | ----- |
| 修复 DeckKit 逻辑 bug；放宽过严校验（不影响已验证样例）       | patch |
| 新增页型或可选字段；放宽验证（接受更多输入）                  | minor |
| 删除/重命名字段；收紧验证（拒绝原来合法的输入）；改变布局容量 | major |

## 冻结准入

1. `validate-content` 通过，只有可解释的非阻塞 warning
2. `pptx-nova-build.mjs` 可重复生成稳定 patch 和 `quality.json`
3. DeckKit benchmark 的 repo-indexed cases 全部通过；新 kit 至少要有 golden case，stress /
   mixed-language 可在 `.tmp` 做审查而不入库
4. `node <skill-root>/scripts/pptx-nova-deckkit-readiness.mjs --deckkit <id> --target candidate --benchmark-mode required-live` 通过
5. `xdoc pptx apply --dry-run --json` 通过
6. `xdoc pptx vision-check out.pptx --json` 的 high/medium 为 0
7. PNG contact sheet 和逐页检查通过
8. catalog 记录版本、visual grammar、验证命令、示例路径和已知限制

当前 readiness audit 会明确报告 candidate / delivery / default 三个结论。
benchmark CLI 已接入逐页 PNG 与 contact-sheet 机器 gate；新增 DeckKit 只有在人工视觉复核、
catalog 质量字段和已知限制满足晋级要求后，才能提升为 `production` 或 `default`。

## Catalog 质量元数据回写

benchmark 通过后，用 catalog update 工具把机器可证明的结果写回
`assets/deckkits/catalog.json`：

```bash
node <skill-root>/scripts/pptx-nova-deckkit-catalog-update.mjs \
  --deckkit consulting-dark \
  --write
```

该命令只更新 `quality.lastBenchmark`、`quality.vision` 和
`quality.benchmark`，默认不改变 `readiness`，也不会把人工 PNG review
结果假定为通过。人工复核完成后，再显式写入 hard defect 数：

```bash
node <skill-root>/scripts/pptx-nova-deckkit-catalog-update.mjs \
  --deckkit consulting-dark \
  --manual-hard-defects 0 \
  --write
```

只有逐页 PNG 和 contact sheet 人工检查完成、`manualHardDefects=0`、benchmark
和 vision gate 均通过后，才可以带 `--readiness production` 或
`--readiness default`，且必须同时带 `--confirm-manual-png-review`。否则工具会拒绝
promotion。

## 新增 DeckKit 流程

1. 从已验证的 gen.mjs 抽取视觉语言和页型 → `<name>.kit.mjs`
2. 把内容数据 → `examples/<name>-content.json`
3. 写 `schemas/<name>/<slideType>.schema.json` 和 slot budget
4. 跑验证矩阵（文本长度 × 语言 × 密度 × 主题 × 页数 × 页型组合）
5. 在 `catalog.json` 注册
