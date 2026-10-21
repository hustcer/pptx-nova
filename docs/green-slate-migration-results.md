# Green Slate 迁移与验收

Green Slate 0.1.0 采用 `design.json + intent.md + strategy-report/v1`，注册为 candidate。
它复用了设计合同、内容校验、构图计划、原生对象回读和标准 Create 门禁；没有改动
`core-primitives.kit.mjs`，也没有复制另一套完整 CLI 流程。

## 输入与设计裁决

输入为 `moss-green-transformation.md` 与八页纵向参考图。设计文档 SHA-256 为
`53a83e7e800fbae335a5898af0e884f088a277e945e75886a0ffebb68cd7ccdc`，图片为
`e5e6d8815a23349fb8274cb4b83ab4337d619156cbbfd2e8399880cd190c76f7`。
来源清单、八张拆页和初始分析保存在本次忽略的 run 目录中。

保留炭灰底、深绿结构区、薄荷绿数据强调、斜切封面区域、紧凑标题标签和细线矩阵。
主动改善来源小字的对比度、堆叠条内部数字的可读性、标题分行、表格底部说明区与路线图间距。
未搬入参考稿的组织、年份、业务判断或图片。示例的数字和决策均明确标为合成情景。

Latin 使用 Arial，CJK 使用本机实际渲染验证过的 Arial Unicode MS；未分发字体。
系统字体查询曾显示正体，但另一字体的实际 CJK 粗体仍倾斜，因此采用了原生常规/粗体探针。
跨机器字体替代和 PowerPoint 独立渲染一致性仍须在目标环境复核。

## 实现与复用边界

十个页型覆盖封面、摘要、区间、矩阵、路线图、价值、流程、章节、说明与结尾。
区间支持 rail/wide，流程支持 vertical/horizontal；相同内容可得到不同构图。
矩阵 full/compact 改变密度，阶段宽度由实际 duration 推导。选择受容量和最近构图约束，
相同输入与合同得到相同计划。容量不足时要求拆分、改写或换构图，不随机挪动坐标。

图表、表格、形状和文字保持原生可编辑。主样例含三张原生图表、两张原生表格，无整页图片。
区间以“下界 + 增量”堆叠，并直接显示原始低/高值；共享线性坐标不能让所有极小值在像素上
分别可见。路线图为可编辑形状，不是自动同步的项目管理模型。当前是创建适配器，未验证任意
现有 PPTX 的换肤保真。内容容量是保守估算，不能取代实际渲染。

## 用户发现的漏检与修复

早期 iteration 05 虽机器通过，仍有圆内数字偏心、摘要标签超出底色和路线图附注贴线。
这些问题由用户指出，原先视觉通过结论已撤回，没有把该轮作为最终基线。

- 圆形自身持有编号，显式双向居中、统一内边距；合同检查拒绝偏心设置和独立叠放标签。
- 标签自身持有文字，背景与文字共享几何，估宽覆盖粗体大写和 CJK；真实 PNG 再验证。
- 先预留 gateHeight/gateGap，再推导轨道行高与线段终点；三阶段、四阶段都复验。
- 应用后回读增加形状内文字及显式垂直锚点检查；负例覆盖上述不变量。
- 可选像素诊断在旧稿检出八处问题；最终五组样例共 66 个受支持的容器检查通过。
  该工具依赖可选 ImageMagick，只服务维护者，不能代替视觉审查。

经验已收录进 `deckkit-maker/references/visual-acceptance.md`，并从 skill 入口、重建、
设计源迁移和组件化流程引用。要求每页记录真实候选、PNG hash、问题与复验轮次；
机器零告警不能替代逐页验收，用户指出漏检后须复查全部同类组件。

## 最终验证证据

运行时 `xdoc 0.13.0 (ea2c8e58)`，冻结日期 `2026-10-22`。证据根目录为
`.tmp/deckkit-green-slate-20261021/`，只在本地保留，不提交生成的 PPTX、PNG 或完整机器报告。

| 样例                                       | 页数 | 最终目录              | 逐页视觉复核 |
| ------------------------------------------ | ---: | --------------------- | ------------ |
| 主样例，覆盖八页参考角色与文档签名         |   12 | `matrix/03/golden`    | 12/12        |
| 同内容不同构图                             |    4 | `matrix/03/variants`  | 4/4          |
| 六行六列、六区间、八观察点、五步骤、四阶段 |    5 | `matrix/03/stress`    | 5/5          |
| 中英文、常规/粗体与长文本                  |   12 | `matrix/04/mixed`     | 12/12        |
| 无关的生态观察主题                         |    3 | `matrix/03/unrelated` | 3/3          |

36 页均查看实际 canonical PNG；关键部位另存 `review-crops-final/`。
`visual-review-ledger-final.json` 记录具体文件/hash、每页结果和说明，五组均通过标准
`--finalize --visual-review`，各目录的 `reviewed.pptx` 为对应交付候选。
每组 canonical 必需检查通过、findings 为零、设计回读通过。无关主题的参考业务词泄漏检查通过；
十个页型也分别以无关 sentinel 内容测试，避免只能改造原样例。

正式 golden benchmark `benchmark/02` 连续构建三次通过：931 ops，内容 error/warning、
fit diagnostics、dry-run high/medium 和 vision high/medium/low 均为零，12 张预览完整。
基线由官方 `--update-baseline` 生成，没有手工写入豁免。首轮 benchmark 的 12 张 PNG 与
已逐页检查的 canonical PNG 字节 hash 全部一致。

全量 Node 测试 483 项：445 通过、38 跳过、0 失败；Green Slate 的十项测试全部通过。
smoke、strict public audit、十页型 slot-consistency、设计 discovery/projection 检查通过。
Black Gold golden、Biennale golden 与 evidence-variants 的三项 benchmark 回归通过。
candidate readiness 使用同轮 live benchmark 通过；未提升至 production/default。

## 复现入口

```bash
node tools/pptx-nova-green-slate-matrix.mjs --out .tmp/green-slate-new-run
node --test tools/tests/pptx-nova-green-slate.test.mjs
node pptx-nova/scripts/pptx-nova-deckkit-slot-consistency.mjs --deckkit green-slate
node pptx-nova/scripts/pptx-nova-deckkit-benchmark.mjs --deckkit green-slate --all --repeat 3 --out .tmp/green-slate-new-benchmark
node pptx-nova/scripts/pptx-nova-deckkit-readiness.mjs --deckkit green-slate --out .tmp/green-slate-new-benchmark --target candidate --require-live-benchmark
```

矩阵脚本只接受新目录，先停在 `needs-visual-review`；下一位使用者必须真实逐页验收，
不能直接沿用本次的通过记录。
