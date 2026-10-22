# Swiss Grid 2.0 迁移与验收

日期：2026-10-22。DeckKit：`swiss-grid`；版本：`2.0.0`；readiness：`candidate`。
十五个公共页型全部迁入 `design.json + intent.md + swiss-typographic/v1` 注册执行链，
不再分发旧固定渲染器或无合同 fallback。candidate 需要显式选择，未恢复 production/default 资格。

## 设计来源与主要裁决

第一依据是用户提供的 `67-swiss-grid-systems.pptx`：十四页逐页解包、检查和实际看图；
旧套件的十五页也逐张对照。第十五类原生表格保留为旧套件的补充职责，不冒充原稿页面。

- 撤去封面和收束的灰色施工网格。白纸、非对称大字、红圆/点阵与明确留白建立秩序；
  可见网格只用于解释网格本身的四种示意及计量系统。
- 保留引文、时间线、八条原则、八位人物、人物特写、字体样张、四类网格、数值系统、
  宣言、应用分栏、阶段进程、六个品牌和收束的全部职责，补回旧产物遗漏的图标与列末注释。
- 原稿小字放大并重排。正文与密集说明使用 11pt 或以上，来源/页码等辅助文字最低 10pt；
  不沿用旧版 6.8pt 容许策略。字体样张实际呈现 heavy/bold/regular 差异。
- Helvetica、Arial Black 与 Arial Unicode MS 为明确的常用替代，中文保持正体；
  并非 Akzidenz-Grotesk / Univers 原字体的精确标本。
- 六个图标使用离线 Tabler SVG；Apple/Google/Spotify/Airbnb 使用相应轮廓，
  IBM/Lufthansa 使用 building/plane 语义替代，不分发原稿商标图片。SVG 是矢量图片，不是原生路径节点。
- 计量示意以同一数值模型推导几何和标签。旧示例 264 的不一致列宽改为 `16 × 16 = 256`，
  间距仍为 `2 × 16 = 32`。单位来自 content，未猜测或改写用户的业务数值。
- 评分表改为原生表格；`rows[][]` 保存字符串，`rowTones` 只表达中性/强调，
  不固化红黄绿阈值、状态解释或参考讲义的领域政策。示例评分明确标为合成验证数据。

[Poster House 的 The Swiss Grid](https://swissgrid.posterhouse.org/) 提供灵活网格的设计背景；
[MoMA 的 Helvetica 展览](https://www.moma.org/calendar/exhibitions/38) 提供字体中性与比例的背景。
隐藏施工网格、放大小字及具体构图均是结合第一手素材与用户要求作出的设计裁决。

## 合同与复用

公共入口仍为 `swiss-grid.kit.mjs::createDeck(content)`。标准 Create 工作流生成完整组件计划、
patch、独立对象/表格回读与 canonical 证据；后续 Agent 使用发现输出和 `layoutId`，无需手写页面坐标。
十五类职责共有二十四个显式布局，auto 按容量和节奏确定性选择。相同输入的计划和 patch 确定。

| 职责                           | 注册布局                                          |
| ------------------------------ | ------------------------------------------------- |
| cover / closing                | poster、upper / lower、upper                      |
| quote / statement              | bracket、wide / right、left                       |
| timeline / progress            | horizontal、vertical                              |
| profile / system / table       | left、reversed / annotated、reversed / full、rail |
| principles / people / brands   | matrix                                            |
| columns / typeface / gridTypes | columns / columns / quadrants                     |

未知字段/布局、无效图标、缺单位、非法控制值、超数量和文本溢出会给出字段诊断并失败。
不接受自定义坐标、静默删字段或无界缩字。全部正式 schemas、catalog 必填槽位、容量和发现预算
已与合同投影同步；显式布局均经测试比较实际几何与完整信息。
字段升级细节见 [intent.md](../pptx-nova/assets/deckkits/swiss-grid/intent.md)。

## 验收范围

最终有效证据位于本机忽略目录 `.tmp/deckkit-swiss-grid-v2-20261022/`；
`matrix/01`、`matrix/02` 和探索轮次均保留为历史，不能替代下表的 `matrix/03`。

| 最终样例 | 页数 | 覆盖                                                       |
| -------- | ---: | ---------------------------------------------------------- |
| golden   |   15 | 十五职责、原稿细节、中英混排与完整叙事                     |
| variants |    9 | 同内容的其余合法构图；与 golden 合计覆盖全部二十四布局     |
| english  |   15 | 明显不同的合成 Water Commons 主题，英文常规/粗体与最大密度 |
| chinese  |    8 | 纯中文正体/粗体、密集名录、数值标签及 11×6 表格            |
| sparse   |   10 | 列表、人物、事件、字体、图示、品牌与表格的最少一项输入     |

机器检查：五组标准 Create 的校验、dry-run、apply、设计检查、完整对象/表格回读、
vision、canonical final-layout 和最终交付绑定均通过。57 页候选的默认 xdoc preflight
（fonts、links、compat、assets、policy）均为 passed、零 issue，Microsoft 365 package-integrity 检查通过。
`final-source-binding.json` 重新调用最终源码，逐组比较 patch/plan 哈希，均一致。

视觉检查：57 张最终候选 canonical PNG 全部逐张查看；完整 golden contact sheet 另用于节奏检查。
同一批 PNG 的系统形状内文字、密集表格和底注另做放大检查；未发现遮挡、截断、压线、缺字、
文字意外倾斜或阻塞缺陷。`final-visual-review.json` 为逐组记录，每组 `run/visual_review.json`
绑定确切候选和 manifest；五组均已通过标准 finalize，输出 `reviewed.pptx`。

原生宿主检查：使用 `xdoc 0.13.0 (92a5aa13)` 和 PowerPoint for Mac 16.114。
五组共 57 页均实际打开、另存、关闭、重开，无 Repair、丢页或内容移除；1,138 个计划对象和
五张原生表格经独立回读。另在 golden 副本实际修改 `S0_Title`、`S8_SystemImage` 的形状内文字、
`S13_Table` 第 2 行第 1 列；保存重开后全部修改准确回读，其余计划对象/几何和表格内容保持。
证据为 `native-summary.json` 和各组 `native-*.json`；编辑副本不充当最终示例。

内容泄漏检查：跨主题 patch 的 364 处可见文本对十四个参考实体/短语零匹配；
独立 PPTX model 的可见文字也零匹配。字体元数据按实际字体保留，未冒充可见内容泄漏。
执行组件不含原稿实体、业务结论或复制媒体；图标从现有离线库按 content 控制值选取。

长期回归保留 golden、stress-density、mixed-language 三项，均由新字段重新生成并通过 live benchmark；
stress-density 扩展到十二页，测试八条目、七事件、三字重、四图示、六阶段、六图标和 11×6 原生表格。
两份子集的 live 机器证据与完整父样例的逐页/原生证据分别记录，不把子集机器通过当作额外逐页验收。
三份旧 6.8pt/低风险豁免 baseline 已替换为零 issue 的新记录。

最终全仓测试：560 项中 522 项通过、38 项条件跳过、零失败；Swiss 专项八项全部通过。
smoke、严格公开审计、合同投影、十套槽位一致性和 showcase 重生成一致性检查均通过。
公开审计为零 error / warning。最后的源码审查还修正了表格溢出诊断的旧 column key 引用，
错误现在准确指向 `rows[row][column]`，并有非法输入回归；该修正未改变任何已验收 patch/plan。

## 清理与保留

| 对象                                                                   | 处理                                                                         |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 旧 `swiss-grid.kit.mjs` 固定页型函数和专用坐标                         | 全部退役，原路径替换为薄适配器；无双执行器                                   |
| 旧 accent、dots 坐标、独立测量字符串、数组文本与业务状态 schema        | 删除旧字段，换为 focus、注册布局、数值模型和原生单元格；不保留自动猜测兼容层 |
| 旧 `swiss-grid-build.mjs`                                              | 替换为新校验入口和相对 URL 内容加载，不再依赖失效的 `skills/...` 路径        |
| 旧 stress/mixed fixtures、expectations 和三份 baseline                 | 原位替换为新合同输入和当前运行结果，不降低原有回归职责                       |
| `assets/examples/swiss-grid/` 的旧 deck、预览、content、summary、brief | 全部由新 golden 重生成，并更新 gallery/catalog 哈希与 candidate 状态         |
| 原稿、旧轮次证据、用户文件                                             | 只读保留；旧分发资产另在本次 run 的 `retired-assets/` 留取对照               |
| 独立翻新配置与共享 primitives                                          | 保留有效能力，未以新建证据宣称任意源稿无损翻新                               |

`deckkit-maker` 同步修正三处指导：重建阶段使用注册合同/组件，不再推荐旧 makePageTypes；
清点原稿/旧套件/新版职责的不同页数；清点矢量品牌并披露精确/语义替代与 SVG 编辑边界。
另补合法 control 探针指导；共享 slot 检查支持 const/数值范围和仅 control 可用的 `x-slotProbeValue`，
全部十套 DeckKit 的槽位一致性检查通过。

## 最新文件与验证命令

- 分发示例：[deck.pptx](../pptx-nova/assets/examples/swiss-grid/deck.pptx)
- 分发预览：[contact-sheet.webp](../pptx-nova/assets/examples/swiss-grid/contact-sheet.webp)
- 生成摘要：[summary.json](../pptx-nova/assets/examples/swiss-grid/summary.json)
- 本机最终样例：`.tmp/deckkit-swiss-grid-v2-20261022/matrix/03/<case>/reviewed.pptx`
- 最终 live benchmark：`.tmp/deckkit-swiss-grid-v2-20261022/benchmark-final-02/`
- candidate 验收：`.tmp/deckkit-swiss-grid-v2-20261022/readiness-final.json`

新分发 `deck.pptx` 与逐张验收的 golden 候选字节完全一致，SHA-256：
`c1aa0816b0488b677da544886e089cfdd65ddff8cf52519f93a1982574873af2`。
以上文件替代原 0.1 showcase 和历史探索产物；旧文件不应继续用于展示新版效果。

```sh
node --test tools/tests/*.test.mjs
node tools/pptx-nova-smoke-test.mjs
node tools/pptx-nova-audit-public.mjs --strict
node tools/generate-pptx-design-projections.mjs --check swiss-grid
node pptx-nova/scripts/pptx-nova-deckkit-slot-consistency.mjs --json
node pptx-nova/scripts/pptx-nova-deckkit-benchmark.mjs --deckkit swiss-grid --all --out <fresh-run>
node pptx-nova/scripts/pptx-nova-deckkit-readiness.mjs --deckkit swiss-grid --target candidate --benchmark-mode required-live --out <fresh-run>
node tools/update-pptx-nova-deckkit-examples.mjs --deckkit swiss-grid --check --tmp <fresh-showcase-run>
```

## 已知限制与未验证项

字体不打包、不嵌入；Windows、其他字体环境和其他 Office 版本未验证。Mac 原生检查不代表跨平台像素一致。
SVG 作为矢量图片编辑；系统示意或表格被手工修改后，不会自动同步其他独立对象，须从 content 重新生成。
套件不声明照片/截图输入、图表、原稿动画保留或通用内容自动排版能力。
本轮未重做独立翻新路线的源稿保真验收，未晋级 production/default；全仓测试中条件跳过的检查未计作已验证能力。
