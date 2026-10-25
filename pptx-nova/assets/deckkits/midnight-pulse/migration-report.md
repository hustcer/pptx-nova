# Midnight Pulse 0.1.0 迁移验收

2026-10-25，readiness **candidate**，须显式选择。来源为 Blue Flame Brand 的设计规范与八页参考图，
保留八种页面职责，提供十六个实际构图。未修改参考文件、core-primitives 或其他任务的内容。

## 设计身份与裁决

- 八个参考面板均为 1920×1080，采用 16:9。保留近黑蓝底、青蓝数据、冰蓝数字、琥珀偏差、
  混合字重标题、正体衬线诊断表、开放式比较与细线结构，不改成统一卡片墙。
- **背景装饰是风格身份的必需项**。按参考逐页恢复深海军蓝／深青的交叠椭圆、裁边与渐变，
  八种职责的图层数分别为 **2、3、2、2、2、2、1、2**。位置、尺寸、转角、颜色、透明度与渐变
  写入合同；背景先绘制，证据对象后绘制。用原生 freeform 表达，路径裁切在画布内，不是背景位图。
- 初版把背景过度简化，用户指出后撤回该版的完整风格接受结论；补回全部同类背景并加失败前／
  修复后回归。`iterations/03` 及以前只保留诊断价值，不能作为完整风格通过证据。
- 参考的小字、低对比及拥挤处作可读性调整；合同最小字号 10.5pt，正文、附注、页脚有独立空间。
  数值旁的单位以约一半字号保留。部分构图可横／纵重排，不要求逐像素一致。
- 背景渐变与正文平面表达分开：只有注册的 Atmosphere 对象可使用渐变，其余组件禁用。
  状态绿色／珊瑚红仅用于项目状态；目标、方向、单位、阈值、结论和日期始终由 content 提供。
- 字体为 Arial / Noto Sans SC，表格为 Georgia / Songti SC，均不嵌入。保持正体，粗体显式设置。
- 不复制参考照片。完整样例使用独立 ImageGen 生成的无品牌虚构夜间车辆场景，并在画面内标明
  AI-generated；所有业务数值及判断标明合成示范。套件本身只注册内容图片槽位。

## 公共接口与能力

`design.json + intent.md + midnight-pulse.kit.mjs` 通过注册的 `midnight-pulse/v1` 执行组件工作，
使用标准 content 校验、布局发现、确定性选择、build、Create 和交付绑定。调用者无需手写坐标。
页型／构图与容量详见 [intent.md](intent.md) 及投影 schema。

八种职责：封面、判断仪表、诊断表、趋势事件、双环归因、同口径比较、项目状态、路线决策。
每种有两个几何不同且保留全部信息的合法构图。趋势柱图、三只仪表环图和诊断表为原生 chart/table；
进度、刻度、事件编号、汇聚射线、路线节点、决策轮廓及背景为可编辑原生形状。

容量覆盖：三项指标、3–8 行诊断表、8–10 趋势点与 1–2 事件、4–6 个带符号归因因素、2–3 个
比较对象且每项 3–4 个指标、1–3 项项目、三阶段和两项决策。最大数组并不保证任意最长文本组合
均能容纳；容量不足会明确失败，须选择合法变体、重组或拆页。

新增正式产物包括薄 kit、合同／意图、pulse atmosphere/layouts/components/registry、八份页型 schema、
合成完整示例及 build 胶水、golden expected/review、专用 fixtures/tests；同步 family registry、
顶层 schema、catalog、README 与主脚本测试入口。未复制完整生成器，未新增运行依赖。

## 最新有效产物

下列路径相对源码仓库根目录；run 证据被忽略，不随 skill 发布。

| 用途                           | 最新有效路径                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------- |
| 完整示例 PPTX                  | `.tmp/deckkit-midnight-pulse/final/midnight-pulse.pptx`                      |
| 同字节候选                     | `.tmp/deckkit-midnight-pulse/create/08/candidate.pptx`                       |
| canonical PNG / PDF            | `.tmp/deckkit-midnight-pulse/create/08/visual-evidence/candidate/`           |
| 逐页浏览                       | `.tmp/deckkit-midnight-pulse/create/08/visual-evidence/review.html`          |
| 整体预览                       | `.tmp/deckkit-midnight-pulse/final/contact-sheet.png`                        |
| 综合验收                       | `.tmp/deckkit-midnight-pulse/final/acceptance.json`                          |
| 逐页记录与 hash                | `.tmp/deckkit-midnight-pulse/visual-review-ledger.md` 与 `.json`             |
| 不同构图／高密度／异主题／混排 | `.tmp/deckkit-midnight-pulse/verification/08/`                               |
| golden 与性能                  | `.tmp/deckkit-midnight-pulse/benchmark/03/midnight-pulse/golden-operations/` |
| candidate readiness            | `.tmp/deckkit-midnight-pulse/final/readiness.json`                           |
| 原生打开／编辑／保存重开       | `.tmp/deckkit-midnight-pulse/native/`                                        |

最终 PPTX SHA-256 为 `f00f1a70219caf14231b39773f06f9b64d7b8605f21e48440645ad4d7264cf39`，
2,285,040 bytes。标准 Create finalize 发布的正是已逐页审查的候选字节，没有重新渲染。
`create/08`、`verification/08` 与 `benchmark/03` 替代旧 Create 01–03、验证 01–07 和 benchmark 01–02；
旧轮次与参考均只读保留。早期 Phase 1 的修正轨迹保留在 `iterations/01–04`，最终基线以完整样例为准。

## 机器验证

runtime：`xdoc 0.15.0 (6fa897c7)`；field date：2026-10-25。

- 全部十六个布局、各职责最小合法输入、最大合理密度、确定性与同内容不同几何通过。
  八对布局的 fingerprints 均不同，记录于 `verification/08/geometry-coverage.json`。
- 四份复用样例及完整 Create 样例均完成 dry-run → apply → inspect → 数值／逐格回读 → vision →
  canonical。完整示例回读 **249 对象、4 charts、1 table**；替代构图 232/4/1，压力 261/4/1，
  异主题英文和混排各 248/4/1。全部 high/medium=0，canonical decision=proceed。
- 共享与专用测试 **133/133 通过**，零跳过。反例包括缺字段、未知字段／布局／customOps、容量、
  目标为零、无定义逆向比率、非数值、越界进度／索引、归因不平衡、多焦点、颜色／字体／渐变规则、
  背景图层缺失与文字回读丢失。真实丢字仍被阻断。
- slot-consistency 通过，覆盖八种职责的可见字段。异业务主题改为公共图书馆；内容泄漏审计扫描
  236 段可见内容、8 项参考专有词，0 匹配；标题、表格与图表文字均进入检查。
- 六份接受的生成 PPTX 及原生编辑副本的 ZIP 完整性、XML well-formedness（含内嵌 XLSX）通过。
  六份生成样例的全部 chart 数值 cache 与工作表数值逐项相等；这不是完整 ISO schema 认证。
- 最终结构检查：四字体、十五颜色齐全，空 placeholder=0，errors=0，warnings=0。
  图表、表格与图片身份及 crop 回读另有明确检查。
- golden benchmark repeat 3 通过，8 页输出齐全，vision high/medium/low=0，生成总时长 p50=181.69ms
  （不含 native apply/渲染）。candidate required-live readiness 通过；未提升为 production/default。
- 初次 Create 记录的 experimental 提示未反写；最终 content 校验保留 candidate 的预期非阻塞提示。
  其他机器与视觉结论以最新记录为准，没有放宽门禁或建立 low 豁免。

## 实际看图

最终源码对应的完整样例、替代构图、压力、图书馆英文、图书馆混排、golden 各 **8/8**，共 **48 张**
canonical PNG 已逐张查看，PPTX／manifest／PNG hashes 写入 ledger。contact sheet 只检查整体节奏。

| 页职责     | 完整示例 | 替代构图 | 压力 | 异主题英文 | 中文混排 | golden |
| ---------- | -------- | -------- | ---- | ---------- | -------- | ------ |
| 封面／单位 | pass     | pass     | pass | pass       | pass     | pass   |
| 三只达成环 | pass     | pass     | pass | pass       | pass     | pass   |
| 衬线诊断表 | pass     | pass     | pass | pass       | pass     | pass   |
| 趋势／事件 | pass     | pass     | pass | pass       | pass     | pass   |
| 归因／双环 | pass     | pass     | pass | pass       | pass     | pass   |
| 比较       | pass     | pass     | pass | pass       | pass     | pass   |
| 项目状态   | pass     | pass     | pass | pass       | pass     | pass   |
| 路线／决策 | pass     | pass     | pass | pass       | pass     | pass   |

同 PNG 放大复核三只环的文字／底注、两只编号圈、双环总值、密集表格及最末行／底注、两项决策。
中文表格放大确认实际字形与正体粗体；初次缩览把首项名称与目标误读为相连，同 PNG 放大证明
分列正常，已撤回该归因。压力包含 -12、0、0.00001、六个正负／零因素和 0/100/50% 进度。
极小值保留共同线性轴及直接标签，不伪造最小柱高。

## PowerPoint 原生结果与边界

本机 macOS，Microsoft PowerPoint **16.114.1**。最终候选的 clean-open 通过，无 Repair 信号。
通过统一 `pptx-snapshot.nu` 导出原生 PDF 和八页 PNG，全部逐页查看，未见内容移除、丢页或形状损坏。
混排另检查第 1/3/5 页原生导出，覆盖真实 CJK/Latin、无衬线／衬线、常规／粗体，字形完整正立。

独立字节副本中实际通过 UI 修改标题 38→37pt、背景对象名称及宽度 14.55→14.50cm、表格实际值
326→327，并保存、关闭、重开、回读及重渲染。八页和逐页全部对象清单保留，背景仍为 gradient freeform。
原生探针不是最终交付文件。

**宿主数据同步限制已实测**：Edit Data in Excel 可打开内嵌工作表，B2 的 41→42 修改成功保存；
但图表 cache 与原生重渲染仍为 41。因此不宣称宿主图表数值自动同步通过；数值变更应修改 content
并重建。独立环内文字、刻度、阶段线、事件、归因、进度及表格规则也不自动联动。
初始生成时工作表与 cache 同源且数值一致，以上限制针对宿主后续手工修改。

未验证 Windows／其他 Office 版本、任意输入的字体匹配、完整 OOXML schema 一致性、跨宿主逐像素
相等、动画／播放及已有 deck 保留；没有这些能力的承诺。实际照片绑定已验证 widePhoto + cover；
photoRail 外壳及 shared contain 的合同／几何不等于已做所有资产组合的宿主验收。

## deckkit-maker 改进与已关闭缺陷

- 真实 skill 源码根与 symlink 定位加入 preflight，避免从维护者仓库误初始化第二份套件。
- 设计迁移指南要求盘点身份性背景及每页图层，用户指出风格遗漏后撤回旧通过并复查全部同类组件。
- 补充 `x-slotProbeSequence` 的事件索引／分组等耦合字段探针用法，避免错误用业务文案代替控制量。
- 共享 readback 修复先 `set-paragraph` 替换、再 `add-run` 的文字状态推导，回归先失败后通过；
  严格文字完整性检查继续保留，没有忽略真实丢字。
- 生成端关闭：文字框高度不足、页眉页脚贴边、指标重叠、环起点／内部文字、六因素密度、左侧汇聚
  射线端点、首类别事件偏移及单位字号问题。恢复背景后重新生成最新证据，未复用旧版风格接受记录。

候选范围内没有未关闭阻塞问题；宿主缓存同步、跨平台及其他未验证项按上述边界披露。
