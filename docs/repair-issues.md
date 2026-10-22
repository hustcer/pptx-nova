# PowerPoint Repair 问题登记

## REPAIR-001：Clear Value iteration 09 打开需修复，修复后第 11 页内容被清空

- 登记日期：2026-10-22。
- 状态：已在 Microsoft PowerPoint 实机复现并定位根因；生成端已加入圆环图显式标签位置校验，完整验证结果见后续记录。
- 严重程度：高。修复会造成整页内容丢失，不能把修复后的文件视为合格交付。

### 样本与环境

以下路径均相对于仓库根目录：

| 项目              | 内容                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| 原始样本          | `.tmp/deckkit-clear-value-20261022/iterations/09/candidate.pptx`                                   |
| 文件大小          | 56,238 bytes                                                                                       |
| SHA-256           | `9dc9e31a521f01c419678e69e88fc85a06ff26fb0c64bc2cce26b06941b2ff52`                                 |
| 页数              | 12                                                                                                 |
| PowerPoint        | macOS 版 16.114                                                                                    |
| 系统              | macOS 27.0.1，build 26A434                                                                         |
| 修复前检查用 xdoc | `0.13.0 (ea2c8e58)`；原始 sidecar 仅含构建标识，未含完整版本和修订号，无法独立确认原始生成版本     |
| 原始生成证据      | 同目录 `patch.json`、`apply.json`、`dry-run.json`、`candidate.pptx.xdoc.json`、`visual-audit.json` |
| 修复副本          | 同目录 `repair-investigation-repaired.pptx`，由 PowerPoint Repair 后另存得到                       |
| 单变量诊断副本    | 同目录 `repair-probe-label-center.pptx`                                                            |

原始文件未覆盖。诊断 PPTX 保存在本地临时目录，不作为仓库中的二进制附件提交；后续排查前应保留该目录。工作区同时存在 Clear Value 开发中的其他修改，本次仅登记问题，不对那些修改作正确性判断。

### 实机复现步骤

1. 在上述版本的 Microsoft PowerPoint 中打开原始 `candidate.pptx`。
2. 出现内容损坏提示，核心文本为 `PowerPoint found a problem with content in candidate.pptx.`，提供 Cancel / Repair。
3. 点击 Repair，随后提示 PowerPoint 无法读取部分内容并将其移除。
4. 点击 OK，通过“另存为”保存到 `repair-investigation-repaired.pptx`，不要覆盖原始样本。
5. 对比原始包与修复包的 `ppt/slides/slide11.xml`：原始页有 22 个内容对象，修复页仅保留空的 `p:spTree` 组骨架。幻灯片总数仍为 12。

预期：无需修复即可打开，所有页面与可编辑图表保留。实际：打开立即要求修复，修复后第 11 页内容全部丢失。

### 第 11 页的定位证据

- 页面标题：`Composition and scale answer two different questions`。
- 页脚：`11 / 12`。patch 使用零基索引 `slide: 10`，对象名前缀为 `S10_`；不要把此前缀误读为第 10 页。
- 原始页含左侧原生圆环图及右侧两个普通圆形：`Earlier · 100`、`Current · 36`。
- 图表对象：`S10_Chart0`，`p:cNvPr id="11"`。
- 关系链：`ppt/slides/slide11.xml` 中图表引用 `rId2` → `ppt/slides/_rels/slide11.xml.rels` → `../charts/chart7.xml`。
- 图表为 `c:doughnutChart`，类别 `Core / New / Other`，系列 `Composition`，数值 `60 / 25 / 15`；`holeSize=62`、`firstSliceAng=270`。
- 原始标签设置为显示类别和值，`c:dLblPos val="outEnd"`；系列还有逐数据点填充和描边。
- 修复包删除了 `chart7.xml`，其余 6 个图表文件仍存在。
- 对所有 12 页按 `p:cNvPr/@name` 比较：仅第 11 页出现对象名称缺失；其他 11 页的名称集合保持一致。此检查不等同于其他页 XML 完全相同，也不证明其他页视觉完全无变化。

第 11 页被移除的对象（不包括空组根）：

```text
S10_TopRule, S10_FooterRule, S10_Footer, S10_Page,
S10_Title, S10_Basis, S10_Fig0Number, S10_Fig0Title,
S10_Fig0Basis, S10_Chart0, S10_Fig0Series,
S10_Fig1Number, S10_Fig1Title, S10_Fig1Basis,
S10_Circle1_0, S10_Circle1Label0, S10_Circle1_1,
S10_Circle1Label1, S10_Note0Heading, S10_Note0Body,
S10_VerdictRule, S10_Verdict
```

### 已做检查与诊断边界

1. 使用 pptx 技能的 Office 校验器进行只读检查：

   ```sh
   uv run --with lxml --with defusedxml \
     /Users/hustcer/.agents/skills/pptx/scripts/office/validate.py \
     .tmp/deckkit-clear-value-20261022/iterations/09/candidate.pptx
   ```

   退出码为 0，输出 `All validations PASSED!`。该命令依赖本机安装的技能，不是本仓库必备运行时。这个通过结果不能证明 PowerPoint 兼容性，实机 Repair 是已确认的反例。

2. 建立单变量副本 `repair-probe-label-center.pptx`：逐 ZIP entry 复制原始文件，只对 `ppt/charts/chart7.xml` 做字节替换：

   ```xml
   <!-- 原始 -->
   <c:dLblPos val="outEnd"/>
   <!-- 诊断副本 -->
   <c:dLblPos val="ctr"/>
   ```

   实机打开诊断副本仍然立即出现 Repair 提示，随后取消打开。因此不能把问题简单归因于 `outEnd`，也不能把改为居中标签视为修复。未对该副本执行 Repair 或另存。

3. 初次登记时仅确认第 11 页在修复过程中被清空，以及关联圆环图部件被移除。当时尚未通过对照实验定位触发字段；后续已完成下列根因验证。

### 2026-10-22 后续：根因已定位

根因是圆环图写入了显式的 `c:dLblPos`。应省略该元素，让 Office 使用默认居中位置；写入 `val="ctr"` 并不等价于省略。这与微软的 [MS-OI29500 §2.1.1456 实现说明](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/e2b1697c-7adc-463d-9081-3daef72f656f) 和本次 PowerPoint 实测一致。通用 XSD 允许这个元素，因此初次 XML 校验未报错。

本轮新增的原生打开实验（PowerPoint 16.114）：

| 实验                                               | 结果                                | 结论                                    |
| -------------------------------------------------- | ----------------------------------- | --------------------------------------- |
| 原始 12 页文件                                     | 仍复现内容移除提示                  | 原始缺陷仍存在                          |
| 仅从第 11 页移除圆环图 graphicFrame                | 无 Repair                           | 锁定圆环图相关路径                      |
| 将原图的 add-chart / set-chart 提取为单页样本      | 出现 Repair                         | 与其他页面和右侧圆形无关                |
| 单页仅保留 add-chart，使用默认圆环图               | 无 Repair                           | 基础图表及工作簿生成正常                |
| 单页保留样式和 plot 配置，仅去掉 dataLabels patch  | 无 Repair                           | 缩小到标签配置                          |
| 原文件仅删除 chart7 中 `<c:dLblPos val="outEnd"/>` | 无 Repair；第 11 页内容及数值均显示 | 显式标签位置是该原始样本的触发字段      |
| 初次实验：将 outEnd 替换为 ctr                     | 仍出现 Repair                       | 修复必须省略位置，不能替换成显式 center |

实验副本和本轮命令日志位于本机相邻产品仓库的 `.tmp/repair-001-20261022/`。`omit-position.pptx` 是仅删除该元素的原文件对照副本；`minimal.pptx` 是仍可触发 Repair 的单页图表样本。原始文件和先前证据均保留。

生成端已在 plot / series / point 三个标签作用域统一拒绝圆环图的显式位置，并给出省略 `position` 的错误提示；不静默改写请求。已有导入文件中的位置仍可显式清除。调用方生成圆环图时应保留可用的标签可见性、字体和数字格式设置，并省略 `dataLabels[].position`。此修复不会自动重写历史 PPTX，也没有修改本仓库的主题生成代码。

回归测试覆盖普通/分离式圆环图、全部位置枚举、三个作用域、失败原子性、dry-run、默认位置下的标签和数据保留，以及清除导入位置时对其他部件的保留。修复前 4 项新测试中 3 项失败；修复后与原有面积图位置测试合计 10 项通过。

### 修复版 CLI 与完整样本验证

- 原始单页非法 patch 在修复版 CLI 的 apply 和 dry-run 下均退出 3，并提示 `doughnutChart data labels do not support explicit positions; omit position to use the default placement`；未写出目标 PPTX。
- 完整 12 页 patch 仅省略第 11 页圆环图标签的 `position`，重建得到产品仓库 `.tmp/repair-001-20261022/rebuilt-safe.pptx`。
- 对重建文件逐部件比较：56 个 ZIP entry 全部保留；唯一变化是 `ppt/charts/chart7.xml` 删除 `<c:dLblPos val="outEnd"/>`，其他字节不变。第 11 页 XML 和全部嵌入工作簿与原文件一致。
- 重建文件在 PowerPoint 16.114 无 Repair 打开，第 11 页文字、圆环图和两个圆形完整显示；圆环图出现原生 Chart Design 功能区，嵌入工作簿可在 Excel 中打开，显示 `Composition` 系列及 `Core=60 / New=25 / Other=15`。
- 选择图表数据后 PowerPoint 主窗口出现无响应，Excel 已显示数据；没有强制退出应用，也没有覆盖原始文件。保存后重开这一项尚未验证，不能据此声称 Office 全交互路径均通过。
- 修复前后本机优化后二进制均为 20,890,824 bytes。此处为本地调查证据，不代表已发布的新版本。
- 完整模块测试在 Wasm / Wasm GC / JavaScript / native 四个后端各通过 1,653 项，共 6,612 项；类型检查、格式化、接口生成检查通过，公开 API 签名无变化。契约归一化和生成文档一致性检查通过。
- 产品仓库修复提交：`9d85f941f`（`fix(pptx-gen): reject explicit doughnut label positions`）。
- 提交时完整 G0 门禁仍在运行，停留在 CLI 契约检查相关原生测试程序的编译阶段，不能视为已通过；本轮已完成的检查与原生保存后重开限制分别见上文。

### 初次登记的排查入口与验收条件（历史）

以下保留初次登记时的排查计划；圆环图和标签位置的对照实验已完成，结果见上文。

- 优先从固定的 `iterations/09/patch.json` 提取 `slide: 10` 的 `add-chart` / `set-chart` 操作，不要依赖持续变化的当前主题源码重建原始样本。
- 对照生成逻辑位于 `pptx-nova/assets/deckkits/annual-components.mjs`，圆环图分支包括数据点样式、标签位置、holeSize 和 firstSliceAngle。临时生成入口为 `.tmp/deckkit-clear-value-20261022/generate.mjs`，它会读取同目录当前的 design/content/components；这些文件可能继续变化。
- 先制作只移除 `S10_Chart0` graphicFrame 的诊断副本，测试页级 Repair 是否消失；再按最小圆环图 → 数据 → 数据点样式 → 标签 → plot 配置逐项恢复，记录每次 PowerPoint 原生打开结果。
- 同时检查 chart7、嵌入工作簿及其 relationships/content types，并与 PowerPoint 原生新建圆环图的结构对照。不要仅凭 XML 能解析或第三方能渲染就判定已修复。
- 修复应落到生成端；验收必须包括 PowerPoint 原生打开无 Repair、第 11 页所有对象保留、圆环图仍可编辑且数值正确，以及保存后重新打开仍无 Repair。补充能阻止此类输出的兼容性回归检查。
