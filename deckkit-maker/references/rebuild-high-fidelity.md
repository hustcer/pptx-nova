# Phase 1 — 高保真重建

目标：用一个探索生成器按 `fidelity-scope.md` 重建参考 deck 的高保真基线，逐页与参考
PNG 对比，直到约定范围内没有 hard defect。默认范围是 **全部 slides**；只有 Phase 0
已记录 `scoped` 且用户确认时，才按 rebuild set 重建代表页。这一阶段允许把参考 deck
的内容直接内联在生成器里（照搬文案是合法且推荐的——内容保真也是保真的一部分）；
Phase 2 再把内容抽到 content.json。

高保真不是像素描摹：目标是网格、比例、层级、配色、字号节奏、chrome 和内容结构无
hard defect；字体替代、Tabler 近似图标、明确披露的 unsupported 资产可以接受。

先读 `skills/pptx-nova/references/deck-generator-workflow.md`（模板设计、txH 表、
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
cp skills/pptx-nova/assets/examples/deck-generator-template.mjs .tmp/deckkit-<id>/generate.mjs
```

按 `style-spec.md` 改造：

- `C` 调色板逐项替换为参考 deck 的 hex；**整个文件不允许出现第二份相同 hex 字面量**。
- `F` 字号节奏替换为 style-spec 的字号表。
- chrome（品牌条/页脚/页码格式/装饰）按 style-spec 重写为独立函数（未来的 makeChrome）。
- 每个归并页型写一个 slide 函数，函数签名向 `(s, data)` 靠拢——data 先用内联对象，
  这样 Phase 2 抽 content 时只需把对象搬走。即使 `fidelity-scope.md` 是 `scoped`，
  也要为全量 `slide-inventory.md` 中的每个页型设计槽位；不能只按重建页收窄 schema。
- 复刻不是像素描摹：优先还原**网格关系**（列数、间距、对齐、比例），坐标从
  `grid()` / bbox 推导后与 XML 原值核对，偏差 ≤0.05in 视为一致。

可参考的成熟 kit 写法：`skills/pptx-nova/assets/deckkits/swiss-grid.kit.mjs`
（常量区 → makeChrome → 几何 helper → makePageTypes → createDeck 的分层）。

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
  hatch 近似，不直接作为整页 `add-image` 背景。整页 SVG/bitmap 在 xdoc demo/render 中可能
  生成占位覆盖层并遮住内容；确需使用时先做最小实验，验证 layer order、PNG 渲染和 PowerPoint
  打开效果，并在 `compare-notes.md` / catalog `knownLimits` 披露。
- 替代元素必须语义相关：例如流程图可用箭头/节点，指标看板可用表格/图表，人物照片 quote 可用
  avatar slot；禁止用无关图标或装饰形状填满画面。

## 3. 重建循环

```bash
cd .tmp/deckkit-<id>
node generate.mjs > patch.json
jq '.ops | length' patch.json        # 客户演示级通常 ≥200 ops；明显偏低先怀疑装饰缺失
xdoc pptx apply -p patch.json -o out.pptx --daemon --dry-run --json | tee dry-run.json
xdoc pptx apply -p patch.json -o out.pptx --daemon --overwrite
xdoc pptx vision-check out.pptx --json | tee vision.json   # high/medium 必须为 0
rm -rf previews && xdoc convert out.pptx --to png -o previews --overwrite --contact-sheet
```

**每次重渲前 `rm -rf previews`**：convert 在目录已存在且参数变化时会写进
`previews/deck-img/` 子目录，复核时会看到陈旧图。

## 4. 逐页对比

对比是本阶段的核心验收，不能用 contact-sheet 一眼带过：

1. 先并排 Read 两张 contact-sheet（`ref-previews/` vs `previews/`），扫全局：
   重建页与 `fidelity-scope.md` 一致、页序一致、配色节奏一致、chrome 一致。
2. 逐页 Read rebuild set 中每一页的 `ref-previews/slide-NN.png` 与 `previews/slide-NN.png`，
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
- **可接受替代**（披露即可）：字体替代、图标用 Tabler 近似替代、嵌入位图省略、
  `XDOC DEMO` 水印。
- **有意改进**（需用户确认）：参考 deck 本身的可读性缺陷（如 <9pt 正文）。默认
  忠实复刻 + 在 notes 里标注；只有用户同意才偏离参考。

修复后整个循环重跑，直到所有页 pass。

如果 `fidelity-scope.md` 是 `scoped`，`compare-notes.md` 末尾必须附“未重建页影响”：
确认每个未重建页已映射到某个已覆盖页型，且不会引入新的槽位、资产形态或 signature
visual element。若发现新增形态，回到 Phase 0 扩大 rebuild set。

## 5. 已知坑（历史返工教训，先读再写）

- `pAlign` 类 helper 误用 `op: 'set-paragraph'` → 应为 `set-paragraph-format`；
  模板已修，但自己新写 helper 时别再踩。
- shape 引用必须双向走 `nm(s, base)`；裸名 selector 命不中。
- enum 必须全名：`"bottom"` 不是 `"b"`，`"outsideEnd"` 不是 `"outEnd"`；
  `titleStyle.bold` 被拒 → 放进 `font: { bold: true }`。
- 居中短文本框宽度 ≥ 文本实际宽 + ~0.2in（默认 inset），否则静默折行；
  vision-check 抓不到这类折行，只能 PNG 人工抓。
- 单行高度用 `txH(sizePt)`（中文 1.5 系数），多行 `txH(sizePt, lines)`。
- dry-run 与 vision-check 的 overflow 阈值不同，dry-run 干净不代表 vision-check
  干净，两个都跑。
- 二次 `apply` / `convert` 记得 `--overwrite`。
- 图标：`p.icon(s, nm(s,'Xxx'), '<tabler-name>', x, y, w, h, { color, strokeWidth })`；
  名字必须先用 `pptx-nova-icons.mjs search` 确认存在。
- 调试图片槽位时只记录尺寸、角色和来源；`generate.mjs` 默认用占位框或语义相关原生元素，
  不引用参考 deck 提取图。移动到 Phase 2 时改成 content `assetSource` 或明确空/隐藏策略。

## 6. 阶段验收

- [ ] `fidelity-scope.md` 为 full 时，参考 deck 每一页都有对应重建页（页数、页序一致）
- [ ] `fidelity-scope.md` 为 scoped 时，rebuild set 全部重建；未重建页影响已记录且无遗漏页型
- [ ] dry-run 无阻塞 visualRisks；vision-check high/medium = 0
- [ ] `compare-notes.md` 范围内全部页 pass；可接受替代逐条披露
- [ ] 图片/logo/截图均登记在 `findings.md`，并有 scope-out、shell rebuild、asset slot、
      known limit 或用户确认例外的 Phase 2 决策
- [ ] generate.mjs 内：hex 全走 `C.*`、字号全走 `F.*`、shape 名全走 `nm()`、
      每个页型函数只读自己的 data 对象（为 Phase 2 抽取做好准备）

向用户展示 contact-sheet 对比结果并确认后，进入 `componentize.md`。
