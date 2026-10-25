# Phase 1 — 高保真重建

目标：用一个探索生成器按 `fidelity-scope.md` 重建参考 deck 的高保真基线，逐页与参考
PNG 对比，直到约定范围内没有 hard defect。默认范围是 **全部 slides**；只有 Phase 0
已记录 `scoped` 且用户确认时，才按 rebuild set 重建代表页。这一阶段允许把参考 deck
的内容直接内联在生成器里（照搬文案是合法且推荐的——内容保真也是保真的一部分）；
Phase 2 再把内容抽到 content.json。

高保真不是像素描摹：目标是网格、比例、层级、配色、字号节奏、chrome 和内容结构无
hard defect；字体替代、Tabler 近似图标、明确披露的 unsupported 资产可以接受。

先读 `pptx-nova/references/create/deck-generator-workflow.md`（模板设计、txH 表、
装饰安全区、视觉验证盲点清单），本文件只补充复刻场景的差异点与已知坑。

## 目录

1. 生成器起步
2. 资产处理
3. 重建循环
4. 逐页对比
5. 已知坑
6. 阶段验收

## 1. 生成器起步

```bash
cp pptx-nova/assets/examples/generator/deck-generator-template.mjs .tmp/deckkit-<id>/generate.mjs
cp pptx-nova/assets/examples/generator/theme-packs.generated.mjs .tmp/deckkit-<id>/theme-packs.generated.mjs
```

模板静态 import 同目录的 `theme-packs.generated.mjs`，必须一起复制；在新 run 中执行，
不要覆盖旧探索生成器。模板中的历史 op 数量/overwrite 注释不构成当前门禁，以本文件循环为准。

按 `style-spec.md` 改造：

- `C` 调色板逐项替换为参考 deck 的 hex；**整个文件不允许出现第二份相同 hex 字面量**。
- `F` 字号节奏替换为 style-spec 的字号表。
- chrome（品牌条/页脚/页码格式/装饰）按 style-spec 重写为独立函数（未来的 makeChrome）。
- 每个归并页型写一个 slide 函数，函数签名向 `(s, data)` 靠拢——data 先用内联对象，
  这样 Phase 2 抽 content 时只需把对象搬走。即使 `fidelity-scope.md` 是 `scoped`，
  也要为全量 `slide-inventory.md` 中的每个页型设计槽位；不能只按重建页收窄 schema。
- 复刻不是像素描摹：优先还原**网格关系**（列数、间距、对齐、比例），坐标从
  `grid()` / bbox 推导后与 XML 原值核对，偏差 ≤0.05in 视为一致。

可参考 Swiss Grid 2.0 的 `swiss-grid/design.json`、`swiss-grid/layouts.mjs` 和
`swiss-grid/components.mjs`：合同定义区域与身份，解析器按实例编译完整组件计划，执行器消费计划。
`swiss-grid/swiss-grid.kit.mjs` 只保留公共薄接口；不要再复制已退役的 makePageTypes 固定绘制结构。

## 2. 资产处理

Phase 1 的高保真目标不包括复刻一次性图片素材。优先重建图片如何被使用：版式、裁切框、
边框、阴影、caption、callout、标注线、留白和与文本的关系。参考图片默认不复制、不内联、
不写进最终 DeckKit；只有调试需要定位尺寸时，才可在 run 目录短暂登记来源和尺寸。

- 图标/装饰符号：优先用 Tabler 替代；若替代会明显破坏高保真，在 `compare-notes.md` 记录差异。
- 图片主导页：默认不进 rebuild set；若贡献可复用页型，只重建外壳和 `asset` 槽位，用占位框、
  语义相关 Tabler icon、原生 shape、图表/表格或 SmartArt-like 组合替代。
- logo/品牌标识：默认建成 `asset` 槽位或 known limit；只有授权明确、跨 deck 可复用且用户确认时，
  才可作为例外进入 examples/assets。
- 内容截图/产品界面图：不从参考 deck 搬图；重建截图容器、标注和信息架构，真实截图由 content
  的 `assetSource` 提供。
- 照片、插画、背景位图、嵌入对象预览：默认 scope out 或用中性占位，不为单一 deck 下沉 primitive。
- HTML/CSS texture、SVG pattern、全页背景图：默认用可编辑 flat fill、线条、重复 shape 或
  hatch 近似，不直接作为整页 `add-image` 背景。确需使用时以当前 runtime 做最小实验，
  验证同一 PPTX 的 layer order、PNG 渲染和 PowerPoint
  打开效果，并在 `compare-notes.md` / catalog `knownLimits` 披露。
- 替代元素必须语义相关：例如流程图可用箭头/节点，指标看板可用表格/图表，人物照片 quote 可用
  avatar slot；禁止用无关图标或装饰形状填满画面。

## 3. 重建循环

每轮选择全新目录，以下命令在 run 根目录执行，`<YYYY-MM-DD>` 使用 Phase 0 冻结日期。
命令逐项执行并读报告；有阻塞先修，不盲目串行跑到底。op 数量只用于排查，不能作为质量或完整性阈值。

```bash
mkdir -p iterations
mkdir iterations/01
node generate.mjs > iterations/01/patch.json
xdoc pptx apply -p iterations/01/patch.json -o iterations/01/out.pptx --daemon --dry-run --json > iterations/01/dry-run.json
xdoc pptx apply -p iterations/01/patch.json -o iterations/01/out.pptx --daemon --json > iterations/01/apply.json
xdoc pptx inspect iterations/01/out.pptx --daemon --json > iterations/01/inspect.json
xdoc pptx vision-check iterations/01/out.pptx --json > iterations/01/vision.json
xdoc pptx visual-audit --candidate iterations/01/out.pptx --visual-mode create --field-date <YYYY-MM-DD> --output-dir iterations/01/canonical --json > iterations/01/visual-audit.json
```

检查 dry-run 的阻塞、apply/inspect 的页数与对象、vision 的 high/medium，以及 canonical manifest
的 required checks、findings、decision。Create 必须覆盖完整 candidate；PDF 最终布局是门禁的一部分。
PNG 人工逐页 review 使用 manifest 中实际路径，避免重复渲染另一批不一致的图。
需要 contact sheet 时可额外 preview，但须保留同一 PPTX hash 与 field date。
runtime 未披露 canonical 路线时按 `pptx-nova/references/create/create-runner.md` 兼容路径执行并披露证据缺口。

若宿主已按 `deckkit-maker/SKILL.md` 的 xdoc transport 边界验证 MCP 合同，可用
`pptx_apply` 替换 dry-run/apply 两次对应调用，并在输入中传绝对路径；`vision-check`、
`convert` 和其他未公开命令仍走 CLI。adapter 变化不改变 dry-run → apply → post-apply
inspect、视觉检查及人工逐页对比门禁。

下轮使用 `iterations/02/`，旧报告与图片保留。不要 `rm -rf previews`、重用旧 output-dir，
或用 `--overwrite` 清空之前的证据。每轮更新 `compare-notes.md` 中对应的 PPTX hash、日期和 manifest 路径。

## 4. 逐页对比

先读 [visual-acceptance.md](visual-acceptance.md)，补查圆形编号、底色标签、表格底边附注等
机器门禁曾漏检的实例，并按其中方法保留逐页记录和局部放大证据。

对比是本阶段的核心验收，不能用 contact-sheet 一眼带过：

1. 先查看参考 contact sheet 与本轮候选总览（若生成），扫全局：
   重建页与 `fidelity-scope.md` 一致、页序一致、配色节奏一致、chrome 一致。
2. 按 slide-inventory 与两份 manifest 的页序/路径映射，逐页 Read rebuild set 的参考与 candidate PNG，
   按下表记录到 `compare-notes.md`：

```markdown
| #   | 结论 | 差异                      | 处置                 |
| --- | ---- | ------------------------- | -------------------- |
| 1   | pass | 字体 X→Arial（已披露）    | 接受                 |
| 3   | fix  | 时间轴连接线未贴节点 bbox | 改 generate.mjs 重跑 |
```

差异分三类：

- **hard defect**（必须修）：缺元素、错位 >0.1in、撞字/截断/折行孤行、配色错、
  层级错、连接线脱靶、对齐破坏。
- **可接受替代**（披露即可）：字体替代、图标用 Tabler 近似替代、嵌入位图省略。
  `structurify.io` 另记为渲染环境限制，不能据此忽略 canonical finding 或声称无水印交付。
- **可读性适配**：依主 skill 的门禁增大过小正文/label、加深低对比颜色，优先调整文字框与
  内容预算，保留层级和视觉语气，在 notes 记录即可。改变内容含义、整体风格或缩小重建范围才需确认；
  不能以“忠实复刻”或 qualityProfile 例外绕过 canonical gate。

修复后整个循环重跑，直到所有页 pass。

如果 `fidelity-scope.md` 是 `scoped`，`compare-notes.md` 末尾必须附“未重建页影响”：
确认每个未重建页已映射到某个已覆盖页型，且不会引入新的槽位、资产形态或 signature
visual element。若发现新增形态，回到 Phase 0 扩大 rebuild set。

## 5. 已知坑（历史返工教训，先读再写）

- `pAlign` 类 helper 应使用 canonical `set-paragraph` 的 `format` 字段；
  不要再生成已移除的细粒度 paragraph-format op。
- shape 引用必须双向走 `nm(s, base)`；裸名 selector 命不中。
- enum 必须使用 canonical 值：`"bottom"` 不是 `"b"`，`"outside-end"` 不是 `"outEnd"`；
  `titleStyle.bold` 被拒 → 放进 `font: { bold: true }`。
- 居中短文本框宽度 ≥ 文本实际宽 + ~0.2in（默认 inset），否则静默折行；
  vision-check 抓不到这类折行，只能 PNG 人工抓。
- 单行高度用 `txH(sizePt)`（中文 1.5 系数），多行 `txH(sizePt, lines)`。
- dry-run 与 vision-check 的 overflow 阈值不同，dry-run 干净不代表 vision-check
  干净，两个都跑。
- 旧版 text layout 补偿在新 runtime 可能造成多余留白或折行；先看实际字体、body margin、
  autofit、CJK/RTL/rich text 输出，再改 `txH` 或 slot budget，不能只更新静态估算。
- freeform 使用显式 frame + 整数 `path`；group 几何须按最终 slide 坐标核对，不能比较局部坐标。
- 图标：`p.icon(s, nm(s,'Xxx'), '<tabler-name>', x, y, w, h, { color, strokeWidth })`；
  名字必须先用 `pptx-nova-icons.mjs search` 确认存在。
- 调试图片槽位时只记录尺寸、角色和来源；`generate.mjs` 默认用占位框或语义相关原生元素，
  不引用参考 deck 提取图。移动到 Phase 2 时改成 content `assetSource` 或明确空/隐藏策略。

## 6. 阶段验收

- [ ] `fidelity-scope.md` 为 full 时，参考 deck 每一页都有对应重建页（页数、页序一致）
- [ ] `fidelity-scope.md` 为 scoped 时，rebuild set 全部重建；未重建页影响已记录且无遗漏页型
- [ ] dry-run 无阻塞 visualRisks；apply 后 inspect 回读正确；vision-check high/medium = 0
- [ ] 完整 candidate 的 canonical Create 判定通过；使用本轮 manifest 的 PNG 逐页复核，日期与 hash 已记录
- [ ] `compare-notes.md` 范围内全部页 pass；可接受替代逐条披露
- [ ] 图片/logo/截图均登记在 `findings.md`，并有 scope-out、shell rebuild、asset slot、
      known limit 或用户确认例外的 Phase 2 决策
- [ ] generate.mjs 内：hex 全走 `C.*`、字号全走 `F.*`、shape 名全走 `nm()`、
      每个页型函数只读自己的 data 对象（为 Phase 2 抽取做好准备）

记录并向用户展示基线结论后进入 `componentize.md`。用户已授权自主迭代与验收时继续执行，
不重复索取阶段确认；只有未获授权的范围变化或核心设计冲突才需要澄清。
