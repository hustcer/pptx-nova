# Phase 1 — 高保真重建

目标：用一个探索生成器把参考 deck **全部 slides** 重建出来，逐页与参考 PNG 对比，
直到没有 hard defect。这一阶段允许把参考 deck 的内容直接内联在生成器里（照搬文案
是合法且推荐的——内容保真也是保真的一部分）；Phase 2 再把内容抽到 content.json。

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
cp skills/pptx-nova/assets/examples/deck-generator-template.mjs .tmp-deckkit-<id>/generate.mjs
```

按 `style-spec.md` 改造：

- `C` 调色板逐项替换为参考 deck 的 hex；**整个文件不允许出现第二份相同 hex 字面量**。
- `F` 字号节奏替换为 style-spec 的字号表。
- chrome（品牌条/页脚/页码格式/装饰）按 style-spec 重写为独立函数（未来的 makeChrome）。
- 每个归并页型写一个 slide 函数，函数签名向 `(s, data)` 靠拢——data 先用内联对象，
  这样 Phase 2 抽 content 时只需把对象搬走。
- 复刻不是像素描摹：优先还原**网格关系**（列数、间距、对齐、比例），坐标从
  `grid()` / bbox 推导后与 XML 原值核对，偏差 ≤0.05in 视为一致。

可参考的成熟 kit 写法：`skills/pptx-nova/assets/deckkits/swiss-grid.kit.mjs`
（常量区 → makeChrome → 几何 helper → makePageTypes → createDeck 的分层）。

## 2. 资产处理

Phase 1 的目标是高保真，所以允许把参考 deck 中的内容性资产提取到 run 目录并临时复用。
这不等于允许把这些资产硬编码进最终 DeckKit。

- 图标/装饰符号：优先用 Tabler 替代；若替代会明显破坏高保真，在 `compare-notes.md` 记录差异。
- logo、内容截图、产品界面图：可从 `.tmp-slides/` 或 inspect 关系中提取到
  `.tmp-deckkit-<id>/assets/`，在 `generate.mjs` 中按路径引用。
- 照片、背景图、嵌入对象预览：只在重建需要时临时使用；记录来源、页码、用途和后续 Phase 2 决策。
- Phase 2 必须把这些资产转成 `asset` 槽位、examples 资产、known limit，或明确省略；不得把单个参考
  deck 的业务图片作为 kit 默认内容。

## 3. 重建循环

```bash
cd .tmp-deckkit-<id>
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
   页数一致、页序一致、配色节奏一致、chrome 一致。
2. 逐页 Read `ref-previews/slide-NN.png` 与 `previews/slide-NN.png`，
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
- 引用本地图片资产时，路径必须相对当前 `generate.mjs` 或使用绝对路径；移动到 Phase 2 时再改成
  content `assetSource` 或 examples 资产路径。

## 6. 阶段验收

- [ ] 参考 deck 每一页都有对应重建页（页数、页序一致）
- [ ] dry-run 无阻塞 visualRisks；vision-check high/medium = 0
- [ ] `compare-notes.md` 全部页 pass；可接受替代逐条披露
- [ ] 临时复用的图片/logo/截图均登记在 `findings.md`，并有 Phase 2 处理决策
- [ ] generate.mjs 内：hex 全走 `C.*`、字号全走 `F.*`、shape 名全走 `nm()`、
      每个页型函数只读自己的 data 对象（为 Phase 2 抽取做好准备）

向用户展示 contact-sheet 对比结果并确认后，进入 `componentize.md`。
