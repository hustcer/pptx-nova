# Amber Ledger 0.1.0 迁移验收

2026-10-25，readiness **candidate**，须显式选择；不是 production/default 自动交付资格。
来源为 Warm Jade Annual Report 的 design.md 与八页合成参考图，全八页分析、基线重建后才冻结公共合同。
本次未修改 core-primitives，也未修改参考或其他任务的文件。

## 设计裁决

- 八个参考面板各为 1920×1080，采用 16:9，无比例冲突。
- 保留暖象牙纸底、炭黑观点、灰色历史、蜂蜜琥珀焦点、双圆封面、元数据登记栏、横线表格与
  无衬线数字／正体衬线解释。维持开放证据区，未改成统一卡片墙。
- 通用规范的摄影要求与具体双圆封面冲突，以实际画面及具体年度报告章节为准；不添加摄影能力。
  通用红绿状态与领域政策不固化，所有判断、实体、阈值、单位、来源和日期由 content 提供。
- 参考小字、低对比和拥挤区域作可读性调整，最小字号由合同约束；附注有独立留白。
  大圆收进画布、灰色层次加深；不追求逐像素一致。
- 最终字体为 Tahoma / Noto Sans SC / Georgia / Songti SC，不嵌入。Noto Sans SC 是已实测的
  字体选择；早期整页缩览疑似缺字，经同 PNG 裁切证实字形存在，字体/并发归因已撤回。

## 公共接口与复用

`design.json + intent.md + amber-ledger.kit.mjs` 调用注册的 `amber-ledger/v1` 执行组件。
八种职责、十六个构图均通过标准发现、content 校验、布局选择、build、对象/图表/表格回读和
Create 交付绑定。完整角色映射、容量规则与编辑边界见 [intent.md](intent.md)。

新增文件包括合同与意图、薄适配器、amber layouts/components/registry、八份页型 schema、
合成完整示例及 build 胶水、golden expected/review、专用测试；同步注册表、顶层 schema、
catalog、发现投影和工作流文档。普通用户无需手写页面坐标或调用本次维护者脚本。

常规柱图、点线和环图为原生单系列 chart；矩阵、基准表和决策表为原生 table。
差异桥、进度和极小数微量图为可编辑原生形状，微量点线为 freeform，不是栅格图。
独立图例、环内合计、解释和派生形状的同步边界已披露：修改 content 重新生成。

## 最新产物

以下路径相对于源码仓库根目录；临时证据保留在被忽略的同一 run，不随 skill 发布：

| 用途                     | 最新有效路径                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------ |
| 最终完整 PPTX            | `.tmp/deckkit-amber-ledger/final/amber-ledger.pptx`                                  |
| 最终 canonical PNG / PDF | `.tmp/deckkit-amber-ledger/create/01/visual-evidence/candidate/`                     |
| 可浏览预览               | `.tmp/deckkit-amber-ledger/create/01/visual-evidence/review.html`                    |
| 整体节奏预览             | `.tmp/deckkit-amber-ledger/final/contact-sheet.png`                                  |
| 机器与视觉绑定           | `.tmp/deckkit-amber-ledger/final/acceptance.json`                                    |
| 逐页审查记录             | `.tmp/deckkit-amber-ledger/visual-review-ledger.md`                                  |
| Phase 1 基线             | `.tmp/deckkit-amber-ledger/iterations/04/deck.pptx`                                  |
| 同内容替代构图           | `.tmp/deckkit-amber-ledger/verification/03/variants/deck.pptx`                       |
| 中文高密度／档案主题     | `.tmp/deckkit-amber-ledger/verification/02/stress-cjk/deck.pptx`                     |
| 混排／边界值             | `.tmp/deckkit-amber-ledger/verification/03/mixed-boundary/deck.pptx`                 |
| golden benchmark         | `.tmp/deckkit-amber-ledger/benchmark/02/amber-ledger/golden-operations/summary.json` |
| candidate readiness      | `.tmp/deckkit-amber-ledger/final/readiness.json`                                     |

最终 PPTX 的 SHA-256 为 `7541d30afdb2b87358869a9173502106957fcb5eb5f1e89fe4a96d6716535b01`，
与 `create/01/candidate.pptx`、`verification/02/golden/deck.pptx` 字节相同。
标准 Create finalize 直接发布已逐页审查的候选，没有重新渲染或替换图表。
`registered/`、`iterations/01–03`、`benchmark/01` 仅作旧诊断证据；`verification/03/variants`
和 `verification/03/mixed-boundary` 替代对应的 `verification/02` 样例。旧文件只读保留。

## 机器检查

runtime 为 `xdoc 0.15.0 (6fa897c7)`，field date 冻结为 2026-10-25。

- 四份最终样例的 content 校验、设计规则、源码/patch 一致性和原生对象/数值/逐格表格回读通过。
  完整示例回读 194 对象、3 charts、3 tables；替代构图为 217 / 3 / 2；中文压力为 197 / 3 / 3；
  混排边界为 240 / 1 / 2。原生数据回读不等于视觉或完整 workbook XML 相等。
- 八种职责的最小/最大数组 specimen、全部注册布局、确定性选择与同内容不同几何通过。
  各构图 fingerprint 不同、输入 data 相同，记录于 `final/geometry-coverage.json`。
- 专用测试含缺字段、未知字段/布局/customOps、超容量、全零/负构成、非数值、无效索引、
  差异桥不平衡/错误 baseline/多焦点、进度越界、表列不齐、规则反例及内容泄漏检查。
  补充 chart-family 属性回归，防止 schema 接受但生成非法 OOXML child。
- dry-run → apply → inspect → vision → canonical 完成。完整示例、变体、中文压力为零 canonical
  findings；混排为零 high/medium、两条 low 卡片对齐误报，实际是差异桥累计值编码，逐图复核后关闭。
  没有对齐数据柱高、删字段或放宽门禁。
- golden benchmark repeat 3 通过，apply warnings=0，vision high/medium/low=0，8 页输出齐全。
  candidate readiness required-live 通过。没有创建历史 low 豁免来掩盖本轮缺陷。
- 最终 `validate-content --mode delivery` 仅保留 candidate 等级的非阻塞提示；此为目标等级的预期限制。
  最终锁检查保留三条连续 dense 提示，已经 contact sheet 与逐页节奏复核。初次 Create 的
  experimental 状态、错误 `normal` density 及矩阵单位元数据告警保留在旧报告，分别由当前
  readiness、`final/check-lock.json` 和 `final/semantic-audit.json` 补充复验，不反写历史报告。

## 实际看图

Phase 1 基线 8/8 通过；组件化后准备接受的四份样例各 8/8，共 32 张最终 canonical PNG 均逐张
检查，逐页 hash 记录于 `final/coverage-acceptance.json`。contact sheet 只用于节奏检查。

| 页职责             | 完整示例 | 替代构图         | 中文高密度 | 混排边界               |
| ------------------ | -------- | ---------------- | ---------- | ---------------------- |
| 封面／登记栏       | pass     | pass             | pass       | pass                   |
| 判断／四指标／焦点 | pass     | pass             | pass       | pass                   |
| 历史／环图／指标   | pass     | pass             | pass       | pass                   |
| 趋势／区间／解释   | pass     | pass             | pass       | pass                   |
| 差异桥／基准表     | pass     | pass             | pass       | pass，人工判读两条 low |
| 项目／责任行动     | pass     | pass，分层修正后 | pass       | pass，分层修正后       |
| 重点列矩阵／附注   | pass     | pass             | pass       | pass                   |
| 决策／收束         | pass     | pass             | pass       | pass                   |

同一最终 PNG 的琥珀焦点、环内数字、图例、密集矩阵及底部附注另裁图放大，确认居中、字形、
底色留白和线间距。中文压力覆盖五项封面元数据、四历史柱、四构成、十二趋势点、三解释、
四个含负/零驱动、五列三行基准表、三个项目（含 0/0）、五列五数据行矩阵及三决策。
混排覆盖正负极小数、零构成、跨零差异桥和第二构图；业务主题换为公共档案，未出现交通实体
或参考政策。数组边界已验证，不宣称所有字段最长文本的任意组合都能装入。

## PowerPoint 原生宿主

本机 Microsoft PowerPoint 16.114.1，macOS；通过实际 UI 操作。

- 完整示例的字节副本打开无 Repair、8 页；标题原生编辑、基准列图 Excel 数值 38.5→40.5、
  矩阵表头编辑后保存、关闭、重开，无 Repair/内容移除/丢页。chart cache 回读为 40.5，
  全部 194 对象、3 charts、3 tables 与明确修改后的期望一致。
- 混排副本验证常规/粗体 CJK 与 Latin、微量折线原生 Shape Format（freeform 可编辑）及注释编辑。
  项目三列改动后，再以最新 verification/03 副本编辑混排标题、保存关闭重开，并实际查看第六页。
  最新回读 240 对象、1 chart、2 tables 通过，未见 Repair/移除/丢页。
- UI 输入的是一个段落，生成器原本会主动换行；首次按重新编译标题比较出现预期差异，随后按
  实际授权的 UI 文本 mutation 建立期望并回读通过。未修改回读规则或忽略丢字。
- 证据：`native/reopened-readback.json`、`native/chart-cache-after-edit.json`、
  `native/mixed-v03-edited-readback.json`。原生探针文件包含故意修改，不是最终示例。
  宿主画面在本次会话实际查看；没有声称保存了不存在的本地原生截图文件。

未验证 Windows/其他 Office 版本、全页像素一致性、完整嵌入 workbook/XML 相等、PowerPoint PDF
导出或放映播放、动画与已有 deck 保留。字体不嵌入；换机需要重新检查。

## deckkit-maker 改进与关闭缺陷

已在 `deckkit-maker/references/visual-acceptance.md` 落实同 PNG 裁切核对、chart-family 属性和
warning 判读、极小数数据几何与 shape 边界、数据柱高误报处理。专用测试锁定适用图表属性。
生成端已修复文本框过度缩高、指标重叠、页脚间距、非适用图表属性及三列项目阅读层级。
极小轴挤压通过同源微量图形解决并披露编辑边界；没有栅格化掩盖。
没有未关闭阻塞问题，候选范围外能力明确列为未验证。
