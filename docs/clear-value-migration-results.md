# Clear Value 迁移验收

clear-value 0.1.0 已完成设计迁移和复用验证，readiness 为 candidate，未设为默认套件。
它保留白底、黑色粗细线、衬线断言、青绿数据、灰色历史和陶土色结论的身份，采用原生图表、
表格和可编辑形状。参考图中的偏小文字与紧密间距经过可读性调整。

## 来源与裁决

输入为 Ebony Ledger 的 design.md 和用户提供的八页纵向合成图；没有搬运业务数据或位图。

| 来源                   | SHA-256                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| design.md              | `8d162c31122401419a011d1be21b0608aeae19df778ff443d7a2eeac9e13623c` |
| image-1.jpg，1920×8640 | `b17d302dccacbb72a2d0d677952a07e8f39ba1177b90343394db21c2778c186c` |

规范包含通用竖版金融规则和覆盖它的白底研究报告规则；图片实际是八张 16:9 页面。
采用覆盖规则和实际图片比例。八页均查看原尺寸裁图，封面、摘要、证据板、情景表、贡献图表、
配置矩阵、实施/风险、决策都有对应页面；额外四页检验折线、预测、环图/面积圆和论证。
样例内容明确标为合成，不把投资假设或领域政策写入皮肤。

## 冻结方案

- `clear-value/design.json + intent.md`：一个数值事实源，加设计判断和能力边界。
- `annual-research/v1`：8 个内容页型、14 个注册布局，容量合适时确定性选择构图。
- 证据页按 1–4 张图采用 rail/wide、paired、lead、quad；矩阵 full/compact、论证 column/split。
- 原生 bar/column/line/doughnut、堆叠贡献、虚线预测柱、2–7 加权列矩阵和按时长分宽的阶段。
- 面积圆由原始值推导，直径采用平方根；零值保留文字。可编辑形状需重新生成以同步数据。

共用既有字体/theme、规则执行、确定性布局、对象/数据回读、标准 Create 和 hash 绑定。
新增 annual 组件族表达白底研究语法，没有复制整个运行器，也没有修改 core-primitives。
旧三种合同风格保持自己的组件；新增语法没有强迫它们换成同一模板。

## 修改与复验

探索阶段保留 01–09 轮产物。前几轮实际探针发现并修复显式单位、环图必需字段、页脚安全边距、
经典折线标签能力和堆叠标签对比问题。第 09 轮建立可接受基线后再组件化。

公共版首次原生回读拦住 doughnut/ring 名称差异。核对真实投影后只归一化该别名，仍严格比较
类别、系列名和全部数值。堆叠图中逐系列 font 覆盖曾让内部值消失；最终采用浅色/描边加统一
深色标签，放大确认所有数值。没有调低视觉门禁或忽略错误。

另补组合图表头、图号、表名和真实加权单元格容量检查；多段单元格提前拒绝。
槽位探针允许明确的可选控制省略，禁止省略可见文本/必填控制；配置错误现在返回失败。
探针 token 按单页生成紧凑唯一值，避免测试数据本身撑爆小图号槽位。

## 验收证据

运行时为 xdoc 0.13.0 (ea2c8e58)，field date 冻结为 2026-10-22。
本次全部临时证据在 `.tmp/deckkit-clear-value-20261022/`，不进入发布包。

| 验证组             | 页数 | 最终位置                            | 结论                     |
| ------------------ | ---: | ----------------------------------- | ------------------------ |
| 英文完整样例       |   12 | `matrix/02/golden/reviewed.pptx`    | 机器通过，逐页通过       |
| 同内容不同构图     |    4 | `matrix/01/variants/reviewed.pptx`  | 真实几何不同，内容完整   |
| 密度/数值/时长边界 |    5 | `matrix/01/stress/reviewed.pptx`    | 逐页及密集局部通过       |
| 中文与英文数字混排 |   12 | `matrix/02/mixed/reviewed.pptx`     | 常规/粗体正体，逐页通过  |
| 无关生态主题       |    3 | `matrix/01/unrelated/reviewed.pptx` | 无金融文案泄漏，逐页通过 |

| 图表容量边界 | 3 | `matrix/03/chart-boundaries/reviewed.pptx` | 八分区环图、32 个柱值、零值面积圆通过 |

| 矩阵密度变体 | 2 | `matrix/04/matrix-variants/reviewed.pptx` | 同内容 full/compact 均通过 |

共 41 页，每页 PNG hash、PPTX hash、manifest 和检查结论保存在 `visual-review-ledger.json`。
七组均执行 validate → dry-run → apply → inspect/native JSON → semantic/vision → canonical
PDF/PNG → 实际逐页检查 → 标准 finalize；最终文件等于被审候选字节。所有 canonical required
checks 通过，findings 为零；vision 的 high/medium/low 均为零。

完整样例原生回读覆盖 237 个对象、7 张图、4 张表，全部系列与单元格一致。
未把 dry-run 的 7 个 low 估算风险写成零；最终布局另由实际 PDF/PNG 和 canonical 门禁检查。
连续 dense 的 deck-lock 提醒经 contact sheet 核查：图板、情景表、图表组合、矩阵和时间轴的
实际构图不同。该样例用于设计系统覆盖，后四页属于能力附录，不冒充真实投资报告。

golden benchmark 三次 validate/build 后通过，897 ops，12 张预览，vision 全零；baseline
由正式工具更新为空问题集。前一轮总构建中位约 101ms，接受轮约 100ms，均不含 PPTX 渲染。
14 个注册布局均有实际 canonical 页面覆盖。8 页型 slot-consistency 和全部现有套件槽位审计通过。无关主题泄漏审计检查 61 个文本对象、
7 个禁用词，匹配 0。targeted tests 覆盖 8 种最小无关输入、确定性、真实布局变化、非法输入、
颜色/字体规则、极小数、圆面积、预测、严格原生回读和探针防线。

此前 Biennale Yellow、Black Gold、Green Slate 的全部已登记 benchmark 通过。
全套测试 502 项：464 通过、38 项 opt-in executable contract tests 未启用、0 失败；目标套件的
19 项测试全部通过。smoke 通过，strict public audit 为 0 errors / 0 warnings（445 个文件）。
四套合同投影一致；deckkit-maker skill validator、格式/lint/typos 和 diff whitespace 检查通过。

## 明确边界

Georgia/Songti SC 和 Arial/Arial Unicode MS 替代未安装的参考字体；本机实际渲染检查过
Latin/CJK、常规/粗体，但没有嵌入字体，也没有证明其他平台或 PowerPoint 像素一致。
当前经典折线不支持选择性端点数值可见性，首末数值放在图头；未声称是贴附端点标签。
原生线性轴保留极小数，但不能保证其在共同比例下可见。表格回读证明文字，不证明全部 OOXML
样式。青绿像素面积、光学居中和审美仍需要实际视觉验收。此套件没有任意源 PPTX 翻新保证。

## deckkit-maker 改进意见和反馈

本次已把经典图表能力探针、doughnut/ring 投影别名、组合图头容量、互斥控制探针、堆叠数值
真实可见性写入 design-source-migration/visual-acceptance。相应脚本和回归测试已落地。
后续迁移继续采用设计约束提取、字体探针、真实数据回读和逐页 hash 绑定，不能只以机器零
findings 放行。未修改 core-primitives 或 xdoc schema 快照。
