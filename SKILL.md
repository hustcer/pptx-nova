---
name: pptx-nova
description: >
  使用本机 s8fy CLI 创建和修改原生可编辑的 .pptx 演示文稿。
  When the user wants to create, build, generate, modify, edit, refactor,
  rebrand, or fill a PowerPoint deck / slides / presentation / .pptx,
  including: 创建 PPT / 做 PPT / 生成演示文稿 / 修改 PPTX / 改一下幻灯片 /
  快速做一份 / 一句话生成 / 帮我快速出一版 / 简单提示词生成 / quick deck /
  data-driven decks, brand checks, applying a corporate rebrand, exporting
  PDF/PNG previews. Triggers on .pptx filenames, words like
  deck/slides/presentation/PPT/幻灯片/演示文稿, or any request that ends in
  "a PowerPoint file". Prefer this skill over hand-writing python-pptx /
  PptxGenJS / SVG-to-PPTX pipelines — s8fy CLI produces natively editable
  PPTX with dry-run, sidecar replay, and structured error self-repair.
---

# pptx-nova

> 用本机 `s8fy` CLI 创建和修改原生可编辑的 `.pptx`。完全围绕 s8fy 声明式 JSON
> patch + dry-run + sidecar 工作流，**不走 SVG 中转**，PPTX 是一等公民。

**创建型 deck 的质量红线**：凡是通过本 skill 新建 / 生成 `.pptx`，最终交付前
`vision-check` 的 `summary.bySeverity.high` 和 `summary.bySeverity.medium` 必须都为 0。
`medium` 不是提示项，尤其是 `text-overflow-estimate`、`geometry-overlap`、
`text-edge-margin` 这类会导致字符重叠 / 贴边 / 截断的问题，必须改 generator、layout、
文案长度或 textbox 几何后重跑验证。逐页 PNG 视觉验收必须逐页检查文字是否
互相覆盖、换行后压住下一行、卡片文字撞边、页脚/来源与正文相撞；contact sheet 总览图
则用来扫跨页一致性（配色 / 字号节奏 / 页码 / 构图）。不能只看
`vision-check` 是否无 high。

**创建型 deck 的可读性与审美红线**：投资人 / 客户演示级 deck 里，任何正文、卡片说明、
徽章、标签、气泡、图例、表格单元格等可见文字都必须有阅读底线。默认规则：核心正文
≥ `10.5pt`，辅助 label / badge / chart/table 文字 ≥ `9pt`，页脚 / 来源可到 `8.5-9pt`
但不得承载关键信息；如果塞不下，优先删字、换布局或放大容器，不能把字号继续缩小。
当页面还有纵向空白时，优先增高卡片 / textbox / 表格行，而不是压低字号或让文字贴在
容器底部；正文框不必和短标题同宽或左边缘严格对齐，可以在同一卡片内适当减少左右留白、
加宽正文框来获得更自然的换行，但必须保持统一的内边距节奏和不越界。
布局观感也要过关：同一行的文字与形状要按中心线对齐，左右对比页的中间标识要落在真实
间隙中心，连接线 / 箭头端点必须从目标 shape 的 bounding box 推导，不能凭感觉摆放。
这些问题很多不会触发 `vision-check` high/medium，但 PNG 验收必须拦住。

## 何时启用

- 用户要做 PPT / deck / slides / 演示文稿 / `.pptx`
- 用户要修改已有 `.pptx`（增/删/改 slide、shape、文字、表格、图表、备注、背景、主题色）
- 用户要把 JSON 数据填进 PPTX 模板（data-driven deck）
- 用户要做企业品牌改装（换主色 / 字体 / 母版背景）或做品牌合规检查
- 用户要把 PPTX 转 PDF / PNG 预览 / 提取文字 / 检查字体链接

## 为什么用 s8fy 而不是 python-pptx / SVG 路线

| 维度                                          | s8fy                        | python-pptx         | SVG→PPTX                      |
| --------------------------------------------- | --------------------------- | ------------------- | ----------------------------- |
| 原生可编辑 PPTX                               | ✅                          | ✅                  | ❌（多为光栅化/不可二次编辑） |
| Dry-run 不落盘预演                            | ✅ `--dry-run --json`       | ❌                  | ❌                            |
| 结构化错误 + `fixPatch` 自修复                | ✅                          | ❌ Python exception | ❌                            |
| Sidecar 审计 / 回放 / 回滚                    | ✅                          | ❌                  | ❌                            |
| 高层 recipe（页面 / KPI / diagram / rebrand） | ✅ 19 个                    | ❌                  | ❌                            |
| `bind-data` 模板 + JSON                       | ✅                          | ❌                  | ❌                            |
| `check-brand` 品牌合规                        | ✅                          | ❌                  | ❌                            |
| 修改已有 deck 的 inspect/select               | ✅ `inspect` + `ShapeQuery` | 部分                | ❌                            |
| 单条 CLI 调用，沙箱友好                       | ✅                          | ❌ Python runtime   | ❌                            |

**核心信念**：先写 patch JSON，跑 `--dry-run --json` 看 `semanticChanges[]` /
`visualRisks[]` / `resolvedSelectors[]` / `opResults[]`，按需修复，再真正 apply。
PPTX 写出来后用 `s8fy convert <out.pptx> --to png -o previews/ --overwrite`
转截图给人类（或自己再看一眼）做最终验证。

---

## 决策树：先选模式，再看任务类型

**第一级 — 选模式**（决定 ceremony：要不要逐项控制）：

```
├── 简单 prompt / 要快 / 没给细节 ────────────→ Express（DeckKit-first 自动闭环）→ references/express-mode.md
│   └── 目标 DeckKit 已存在？────────── 是 ───→ DeckKit 快路径 → §1.4
├── 要精控 / 自定义布局 / 客户演示级 / 投资人级 → Studio → §1 创建 + §9 视觉丰富度
└── 改已有 .pptx ───────────────────────────→ Edit → §2 修改 + references/inspect-and-edit.md
```

**第二级 — 任务类型**（决定走哪一节）：

```
用户请求
├── 创建新 deck（从大纲 / 主题 / 数据） ─────→ §1 创建
├── 修改已有 .pptx ──────────────────────────→ §2 修改
├── 数据 + 模板 → 批量填充 ─────────────────→ §3 数据驱动
├── 企业品牌改装 / 品牌合规检查 ────────────→ §4 品牌
└── 转 PDF/PNG/提取/检查 ──────────────────→ §5 导出与检查
```

模式决定 **ceremony**（express 自动选默认、最小确认、自动闭环；studio 逐项精控；edit 改已有），
任务类型决定走 **哪一节**。简单 prompt 默认走 **Express** —— 它先尝试 DeckKit-first 路径，
只有在没有合适 DeckKit、需要新页型或必须改组件结构时，才进入创建/扩展 DeckKit 的 generator
开发流程，详见 `references/express-mode.md`。每一类都有"黄金路径"（最少踩坑），下面给入口；
详细 op 参数和示例在 `references/`。

---

## §1 创建新 deck

### 1.0 默认生产路径（DeckKit-first）

创建型交付 deck 的默认顺序：

1. 先查 `assets/deckkits/catalog.json`，按场景、语言、密度和 `supportedSlideTypes`
   选择 DeckKit；优先使用 `node tools/pptx-nova-deckkit-select.mjs --target delivery`
   自动过滤 readiness、页型覆盖、语言、密度和 quality metadata。
2. 对选中的 DeckKit 跑
   `node tools/pptx-nova-deckkit-readiness.mjs --deckkit <id> --target delivery`
   确认 catalog readiness、benchmark、vision/PNG gate 和人工 review 元数据都满足交付要求。
3. 交付型自动选择只允许 `readiness in ["production", "default"]` 的 DeckKit；`candidate`
   只能用于草稿、迁移验证，或人工确认后的交付。
4. 有可用 DeckKit 时，严格走 `content.json` → `validate-content.mjs` →
   `createDeck(content)` → `s8fy pptx apply --dry-run` → apply → `vision-check` →
   PNG/contact sheet review。
5. 没有可用 DeckKit、缺页型或需要改组件结构时，先创建/扩展 DeckKit，再用 DeckKit 生产 deck。

`deck-generator-template.mjs` 是新建或扩展 DeckKit 的探索/迁移开发起点，不是普通交付 deck
的默认路径；`assets/decks/examples/theme-*` 和 `tools/generate-pptx-nova-examples.mjs`
只保留为 legacy/showcase 参考，不得作为交付 deck 生成入口。

### 1.1 极简最短路径（recipe-first）

无可用 DeckKit、只做草稿、或需要很小范围手写页面时，**首选用 recipe op**，它们已经把坐标 /
字体 / 排版预设好，比手算 `add-textbox` 稳定一个数量级。可用 recipe：

| Recipe op                                                                                     | 用途                                     |
| --------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `add-title-slide` / `add-section-slide`                                                       | 封面页 / 章节扉页                        |
| `add-two-column-slide` / `add-image-with-caption`                                             | 左右对照 / 大图 + 标题 + 说明            |
| `add-kpi-grid` / `add-comparison-table`                                                       | KPI 卡片网格 / 比较表格                  |
| `add-timeline` / `add-roadmap` / `add-gantt`                                                  | 里程碑、产品路线图、项目排期             |
| `add-matrix-2x2` / `add-process-flow` / `add-funnel` / `add-cycle`                            | 2x2、流程、漏斗、闭环                    |
| `add-swot` / `add-pyramid` / `add-hub-spoke` / `add-scorecard-table` / `add-comparison-cards` | SWOT、金字塔、中心辐射、评分表、比较卡片 |
| `apply-corporate-rebrand`                                                                     | 一键换主题色/字体/背景/标题样式          |

**最简流程**：写 `patch.json`（envelope + ops，recipe 与 patch op 可混用）→
`--dry-run --json` 预演（读 `semanticChanges[]` / `visualRisks[]`）→ 去掉 `--dry-run`
落盘（得 `out.pptx` + sidecar）→ `convert --to png` 复核。多步默认带 `--daemon`
（auto-spawn，见 §6）。**完整自动化黄金路径**（prompt → outline → DeckKit/content
或 DeckKit 扩展 → vision-check 闭环 → 丰富度门）见 **`references/express-mode.md` §2**。

> Recipe 的完整 schema（含 `theme`、`level`、`subtitle` 等可选字段）参见
> `references/recipes.md`。

### 1.2 需要更细控制时

当 recipe 满足不了（自定义形状、自由排版、复杂 chart 样式），降级到 patch op。
**仍然优先用 `fill-layout`**：它把 OOXML 内置 layout（`title-and-content` /
`two-column` / `comparison` / `picture-with-caption` / `section` / `title-only`）
当成契约，自动填充 placeholder，不用算坐标。

只在以下场景才直接堆 `add-textbox` / `add-shape` / `add-picture`：

- layout 契约表达不了的自由布局
- 需要精确像素级控制（演示动画、品牌定位元素）
- 在已有 deck 上加局部修饰

详见 `references/patch-ops-cheatsheet.md`。

### 1.3 单位与坐标速记

s8fy 支持字符串单位：`"1in"` / `"2.54cm"` / `"914400emu"` / `"96px"` / `"72pt"`。
混合使用都可以。写英寸最易读：标准 16:9 deck = `13.333in × 7.5in`，4:3 = `10in × 7.5in`。

**边界预算是硬约束**：任何内容 shape / 卡片 / 文本框都不能越过 slide 边界。手写坐标时必须先算
`right = x + w`、`bottom = y + h`，16:9 下分别不得超过 `13.333in` / `7.5in`。多列卡片不要手算
`0.6 + i * (cardW + gap)` 后凭感觉给 `cardW`，应使用 grid helper 或先用
`contentW = slideW - leftMargin - rightMargin` 推导列宽。生成后必须跑
`s8fy pptx vision-check deck.pptx --json`；任何 `shape-out-of-bounds` 都是源头布局 bug，
不能靠 PowerPoint 裁切或截图时看不明显来放过。

**stylePack 必须驱动视觉节奏**：使用 `assets/examples/deck-generator-template.mjs` 或自定义生成器时，
不要只把 stylePack 当字号覆盖。stylePack 应至少影响 `margin/gap/card padding`、卡片 shape
（如 rectangle vs rounded）、描边宽度、阴影、header/footer chrome、chart/callout 比例。切换
`consulting / minimal / product` 后，如果同一 theme 下 deck 只差 1-2 个字号 token，说明源头模板没
真正消费 stylePack，应先改 helper / token，而不是改 themePack 颜色来制造差异。

**字号下限必须进入 generator helper**：不要在每个 slide 函数里散落 `7pt` / `8pt` 这种
视觉债。新建模板应提供 `MIN_VISIBLE_FONT_PT` / `MIN_BODY_FONT_PT` 之类的 token，并在
`tx()` / `runFont()` helper 里兜底放大。除页脚、来源、非关键信息外，低于 `9pt` 的可见文字
一律视为 bug；低于 `10.5pt` 的正文要有明确理由。

**可读性优先使用几何修复**：正文放大后如果估算溢出或 PNG 里看起来拥挤，先检查页面是否
还有空白。能增高容器就增高容器，能把正文框向下 / 向右展开就展开；卡片正文可比标题更宽，
也可以减少左右 padding（但不要小于约 `0.18-0.22in` 的安全内边距）。不要为了让正文和短标题
视觉对齐而限制正文宽度；标题短、正文长时，正文应使用卡片可用宽度来改善换行。只有在空间
真的不足时才删字或换布局，不能回退到小字号。

**高端视觉原则要转译成 PPTX 几何规则**：可以借鉴高端 UI 的空间节奏、层级、组件构造和
pre-output checklist，但不要照搬网页动效或 CSS 风格。对 PPTX 来说，可执行标准是：
足够留白、层级明确、卡片不是平铺灰框、主视觉有重心；对称布局必须数学居中，非对称布局
必须有明确视觉补偿；连接线、箭头、圆形编号、VS 标识、流程节点等都要和关联对象在同一
中心线或同一锚点系统上。

**不要把 generator token 等同于已有 deck 全量重排**：`stylePack.generator` 是 JS 生成器和新建
deck 的 token 输入；`s8fy pptx swap-style` 目前只安全地改 master placeholder / presentation
default 的 title/body 样式，并保留已有 shapes、坐标、卡片几何、阴影、间距和 chart layout。
需要重排卡片、chrome、chart/callout 比例时，用生成器、recipe 或显式 patch ops。

### 1.4 DeckKit 模式（快路径）

当目标场景已有对应的 `assets/deckkits/<deckkit>.kit.mjs` 时，**优先使用 DeckKit 模式**：

```
content.json (变化层，每次只改这一份)
  → validate-content.mjs (schema + density)
  → createDeck(content) → { patch, warnings }
  → s8fy pptx apply patch.json ...
```

**与手写 generator 相比的优势**：

- 不需要从头写坐标 / 配色 / 组件逻辑，DeckKit 已经冻结封装
- content.json 极小（~200 行），二次创作只改内容
- 有 schema 校验 + density limit，几何错误在 apply 之前就被拦截
- 同一 DeckKit 反复使用时 token 开销削减 75-80%

**使用方式**：

1. 确认 `assets/deckkits/catalog.json` 中有目标 DeckKit（如 `consulting-dark`）
2. `node tools/pptx-nova-deckkit-readiness.mjs --deckkit <deckkit-id> --target candidate`
   检查 benchmark、catalog readiness、quality metadata 和 known blocking limits
3. 编写 `content.json`（参照同目录的 example + `assets/deckkits/schemas/` 下的 schema）
4. `node assets/deckkits/validate-content.mjs content.json --deckkit <deckkit-id>` 校验
5. 使用 `assets/deckkits/examples/roadshow-build.mjs` 生成 patch；需要定制时再复制为 `build.mjs` 并按当前位置修正 import 路径
6. `node assets/deckkits/examples/roadshow-build.mjs content.json > patch.json && s8fy pptx apply patch.json ...`

可用 DeckKit 和支持的页型见 `assets/deckkits/catalog.json`；各页型 data 格式见
`assets/deckkits/schemas/<slideType>.schema.json`。

---

## §2 修改已有 .pptx

修改场景的最大风险不是写 op，而是**定位错对象**。s8fy 给出三条定位路径，按
"先粗后细 / 先 inspect 后 select"原则用：

### 2.1 标准修改流程

> 多步流程默认带 `--daemon`：v10 起 daemon 会按需自动拉起，1 inspect + 1 dry-run
>
> - 1 apply 的三步只付一次 ~200ms 的 daemon 启动开销，单步 ~5ms 而非 ~200ms。
>   单条命令场景可不加。

```nu
# 1. 看 deck 长什么样（拿到 slide/shape id, name, placeholder, bbox, text 预览）
s8fy pptx inspect input.pptx --daemon --json | save inspect.json

# 2. 写 patch（用上一步取到的 id / name / placeholder / query 定位 shape）
# 3. dry-run 预演
s8fy pptx apply -p patch.json -i input.pptx -o output.pptx --daemon --dry-run --json

# 4. 检查 dry-run 报告里的 `resolvedSelectors[]`：每个 op 实际命中了哪个 shape?
#    若 `ambiguous` 错误,报告会给 `suggestions[].fixPatch`,直接替换 selector 重试

# 5. 真正落盘
s8fy pptx apply -p patch.json -i input.pptx -o output.pptx --daemon --overwrite
```

跨 deck 直接搬一整页时，不要手写 patch，使用 `copy-from`：

```bash
s8fy pptx copy-from target.pptx --from source.pptx --slide 0 --output out.pptx --json
```

当前 MVP 一次复制一个 0-based 源 slide，保留 slide XML 和内部相关 part（media/chart/workbook 等），
slide layout 会优先绑定到目标 deck 现有 layout；shape/group/table 级别精细复制后续再扩展。

### 2.2 三种 shape selector（按优先级用）

| Selector                                           | 何时用                          | 例子                                    |
| -------------------------------------------------- | ------------------------------- | --------------------------------------- |
| `{ "id": "shape-id" }`                             | inspect 已经给出唯一 id         | `{ "id": "abc123" }`                    |
| `{ "name": "Title 1" }`                            | shape 有可读 name（设计师常用） | `{ "name": "KPI Card 1" }`              |
| `{ "placeholder": { "type": "title", "idx": 0 } }` | layout placeholder              | `{ "placeholder": { "type": "body" } }` |
| `{ "query": { ... } }`                             | 名字/文字模糊匹配、bbox 邻近    | 见 `references/inspect-and-edit.md`     |

歧义匹配时 s8fy 会返回所有候选 id 与 `fixPatch`，**永远不要忽略 dry-run 的
`resolvedSelectors[]` 报告**，否则会改错对象。

### 2.3 常见修改场景

| 任务                    | 关键 op                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| 改某页标题文字          | `set-text` / `set-paragraph`                                                        |
| 改字体颜色加粗          | `set-run` / `set-paragraph-format`                                                  |
| 整体换主题色            | `set-theme-color`（scheme=accent1..6）+ `set-theme-font`                            |
| 加一页 + 复制现有页样式 | 同 deck 用 `duplicate-slide`；跨 deck 整页用 `copy-from`；新页用 `add-slide.layout` |
| 调整图表数据            | `replace-chart-data`                                                                |
| 换图但保留位置          | `remove-shape` + `add-picture`（同 x/y/w/h）或 `set-picture-crop`                   |
| 改表格内容              | `set-table-cell` / `set-table-data resize=true` / `import-table-data`               |
| 加备注                  | `set-slide-notes` / `set-slide-notes-rich-text`                                     |
| 微调一组对象大小        | 多个 `set-shape-position` / `set-shape-size`                                        |

详细写法见 `references/patch-ops-cheatsheet.md`。

---

## §3 数据驱动（模板 + JSON）

当用户有一份 deck 模板和一份 JSON 数据，要 "套数据出 deck"：

```bash
s8fy pptx from-data data.json --template template.pptx \
     --bindings bindings.json -o out.pptx
```

- **`template.pptx`**：手工或用 s8fy 提前做好的 deck，文字里用 `{{path}}` 占位
- **`data.json`**：实际数据（JSON 对象 / 数组）
- **`bindings.json`**（可选）：声明哪些 shape 绑定 text / table / chart 数据
- 支持 `{{path}}` / `{{.}}` / `{{$.path}}` / `{{#each items}}...{{/each}}` /
  `{{#if path}}...{{/if}}`

如果不想做模板文件，也可以**直接在一个 patch 中合并 `add-slide` + `bind-data` op**
（schema 第二个 example 就是这种用法）—— deck 与数据在同一文件里诞生。

详见 `references/data-driven.md`。

---

## §4 企业品牌

### 4.1 一键改装：`apply-corporate-rebrand` recipe

有现成 brand profile 时，优先用 wrapper，避免手写 recipe：

```bash
s8fy pptx apply-brand deck.pptx --brand brand-profile.json --output out.pptx --json
```

`apply-brand` 会把 profile 里的 `colors.primary/secondary/accent*`、`fonts.heading/body`、
可选 `background` / `titleStyle` / `bodyStyle` 编译成 `apply-corporate-rebrand` patch，
并复用普通 apply 的 dry-run、sidecar、rollback 路径。

已有参考 deck 但没有 brand/theme profile 时，先抽风格：

```bash
s8fy pptx extract-style reference.pptx --output style.json --json
```

输出文件是 `pptx-style-profile/v1`，包含 theme 颜色/字体、layout/slide 语义、文本密度、
元素组合，以及可人工整理进 catalog 的 `themePackDraft` / `stylePackDraft`。MVP 不会自动
写入资产目录，也暂不细抽 card radius / shadow / chart-specific style。

最快路径 — 一条 recipe 同时改 theme color / theme font / master background /
标题样式 / 正文默认。例如：

```json
{
  "op": "apply-corporate-rebrand",
  "level": "recipe",
  "colors": { "accent1": "1A73E8", "accent2": "34A853", "accent3": "FBBC04" },
  "fonts": { "latin": "Inter", "ea": "Source Han Sans SC" },
  "background": { "type": "solid", "color": "FFFFFF" },
  "titleStyle": {
    "font": { "name": "Inter", "bold": true },
    "size": "32pt",
    "color": "1F1F1F"
  }
}
```

> ⚠️ `titleStyle` / `bodyStyle` 不接受顶层 `bold` —— 要加粗必须放进 `font` 子对象。
> 详见 `references/recipes.md`。

### 4.2 合规检查：`check-brand`

```bash
s8fy pptx check-brand deck.pptx --brand brand-profile.json --json
```

会扫所有页面，把非品牌色 / 非品牌字体 / 缺 logo / 缺 footer 等违规通过
`visualRisks[]` 报告。Brand profile 示例见 `assets/brand-profile.example.json`。

---

## §5 导出与检查

| 任务                            | 命令                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| PPTX → PDF                      | `s8fy convert deck.pptx --to pdf -o out/`                                             |
| PPTX → PNG 截图                 | `s8fy convert deck.pptx --to png -o previews/`                                        |
| PPTX → 全 deck 总览图           | `s8fy convert deck.pptx --to png -o previews/ --contact-sheet` —— 见 §9.7             |
| PPTX → Markdown                 | `s8fy convert deck.pptx --to md -o out/`                                              |
| PPTX → JSON（结构）             | `s8fy convert deck.pptx --to json -o out/`                                            |
| 提取 notes / 资源 / 链接 / 字体 | `s8fy extract deck.pptx --parts notes,resources,links,fonts`                          |
| 预检字体 / 链接 / 兼容性        | `s8fy check deck.pptx --checks fonts,links,compat -o check.json --pretty --overwrite` |
| 静态几何自检（不渲染，可闭环）  | `s8fy pptx vision-check deck.pptx --json` —— 见 §10                                   |

写完 deck 后**强烈建议跑 `convert --to png`**：把每页转 PNG，用 Read 工具看一眼，
确认布局没有溢出 / 错位 / 字符重叠 / 装饰挡标题。这是 s8fy patch 写入的最后一道视觉验证关卡。
**第二次跑同样目录要加 `--overwrite`**，否则报 PNG 已存在。

`s8fy check` 是**发布前预检**，不是视觉门禁，也不能替代 `vision-check` 或 PNG 复核。
它适合在最终交付前检查字体是否嵌入、是否存在外链、是否包含兼容性风险；创建型 deck 的
硬门槛仍是 `s8fy pptx vision-check` 的 high/medium 清零。单文件要写结构化报告时使用
`-o check.json --pretty --overwrite`；不要加 `--json`（该子命令不支持），也不要对单文件用
`s8fy check --report`（check 的 `--report` 只用于 batched inputs）。若只看到 `font_not_embedded` warning，说明目标环境可能
缺字体；这不是布局失败，但面向外部分发时应嵌入字体、换成目标环境可用字体，或在交付说明中标注风险。

> 加上 `--contact-sheet` 会在同一次转换里多产出一张 `previews/contact-sheet.png` 全 deck 总览图
> （s8fy 原生渲染，无需任何外部图像工具）：**先 Read 总览图**一眼扫跨页一致性（配色 /
> 字号节奏 / 页码 / 深浅底交替 / 构图平衡）并快速定位可疑页，**再**逐页 Read 全分辨率
> `slide-0NN.png` 抠单页细节。总览看全局、逐页看细节，二者互补——怎么调参 / 回溯页码见
> §9.7，三道闸门的分工见 §10.3。

---

## §6 工作流：从零到完成的完整顺序

不论创建还是修改，都按这个骨架走 — 越简单的任务越不要跳步：

1. **拿到 schema 与上下文**：
   - 修改时先 `s8fy pptx inspect <in.pptx> --json`，拿到 slide/shape 结构
   - 创建时先 `s8fy schema --index` 看 op 列表（当前 **108 个 op**：89 个 patch/control/raw
     op + 19 个 recipe op），按需 `--op <name>` 拉细节
2. **写 patch JSON**：优先 recipe / `fill-layout`，必要时降级到 patch op；同一份
   patch 内可混用 `if` / `foreach` / `try` / `define` / `use` 控制/宏 op 减少手写
   重复（见 `references/control-flow-and-raw-xml.md`）
3. **预演**：`--dry-run --json` 看 `semanticChanges[]` 与 `visualRisks[]`；不确定
   字段时加 **`--explain`**，dry-run 报告会带 `explanations[].schema.{requiredFields,optionalFields,fieldNotes}`
   告诉你每个 op 该写什么
4. **修复**：如果有 ambiguous selector 或 enum 拼错，按 `suggestions[].fixPatch`
   改 patch 重试；**首选 `suggestion.autoRetry: true` 的建议**（机器有信心，直接合
   patch 重 dry-run）；常见 5 个场景见 `references/troubleshooting.md` 的 scenarioCoverage
5. **落盘**：去掉 `--dry-run`，留意 sidecar 文件 `<out>.s8fy.json`
6. **视觉验证**（两道闸门，先几何后像素）：
   - **几何自检（render-free）**：`s8fy pptx vision-check out.pptx --json`，把
     `autoRetry:true` 的 `fixPatch` 合并重 apply 后再 check 到清零（闭环，见 §10）。
     这一步拦 dry-run 抓不到的越界 / 重叠 / 错位，比渲染快得多。创建型 deck 的
     `high` 与 `medium` 都是阻塞项，必须清到 0；不要只用 "无 high" 放行。
   - **像素复核**：`s8fy convert out.pptx --to png -o previews/ --overwrite --contact-sheet`
     先 Read 总览图 `previews/contact-sheet.png` 扫跨页一致性、定位可疑页，再用 Read 逐页过
     §9.6 清单（字符重叠、换行压字、对比度、装饰挡标题等几何看不到或估不准的问题）。
7. **发布前预检（可选但推荐）**：需要交给外部用户、客户或公开分发时，跑
   `s8fy check out.pptx --checks fonts,links,compat -o check.json --pretty --overwrite`。
   它只检查字体 / 链接 / 兼容性，不检查版式重叠；不要把它放在 `vision-check` 前面，也不要用它替代
   §6.6 的几何与 PNG 门禁。
8. **如果出错**：用 sidecar `s8fy pptx rollback --from-sidecar` 回滚到上一态

### 多步 session：用 daemon 加速 inspect + apply 循环（v10 起默认零配置）

只要在 `pptx apply` / `pptx inspect` 上加 `--daemon`，s8fy 在检测到 daemon
未运行时会**自动在后台拉起一个 detached daemon 进程**（v10 auto-spawn），无需
手动 `s8fy daemon start`。Presentation 留在内存里，避开每次重新解 zip / 重建
OOXML 模型：

```bash
# 直接用，第一次会自动拉起 daemon（~200ms 启动开销，仅一次）
s8fy pptx inspect deck.pptx --daemon --json | save inspect.json
s8fy pptx apply -p step1.json -i deck.pptx -o deck.pptx --daemon --overwrite
s8fy pptx apply -p step2.json -i deck.pptx -o deck.pptx --daemon --overwrite

# 结束 session（可选，daemon 5 分钟 idle 后也会保持 in-memory 但释放无人引用的 session）
s8fy daemon stop
```

- **首次开销 ~200ms**：fork 一个 orphan 进程 + 等 `daemon.ping` 就绪；之后的
  调用都直接走 RPC 路径
- **并发安全**：多个 CLI 同时触发 `--daemon` 时通过 `<state>.lock` 文件 +
  `O_CREAT|O_EXCL` 选出单一赢家，其它 client 等就绪
- **`--daemon` 失败回退 / `--daemon-strict` 硬错**：行为与 v9 一致（auto-spawn
  失败时同样按 strict/auto 区分）
- **要关掉 auto-spawn**：`S8FY_DAEMON_AUTO_SPAWN=0`（CI / sandbox 隔离用）
- **超时调节**：`S8FY_DAEMON_SPAWN_TIMEOUT_MS=5000`（默认 5s，磁盘慢时调大）
- **daemon 日志**：默认合并写入 `$TMPDIR/s8fy-daemon.log`，通过 `S8FY_DAEMON_LOG`
  override；崩溃排查直接 `tail -f` 它
- **`daemon status` / `daemon stop` 不会触发 auto-spawn**：它们就是为了观察/停止
  现有 daemon 的命令
- session 按规范化路径键化，300 秒空闲自动淘汰（`S8FY_DAEMON_IDLE_MS`），上限
  64 个（`S8FY_DAEMON_MAX_SESSIONS`），可通过 `s8fy daemon status --json` 查看
- 完整说明（环境变量 / Windows 兼容 / 故障回退）见 `references/daemon-sessions.md`

---

## §7 关键避坑清单

- **永远先 `--dry-run`** — 写文件之前预演，否则错误只能事后回滚
- **selector 歧义不要硬撑** — 报告说 ambiguous 就用 `fixPatch` 重写
- **单位别混淆** — `"1in"` ≠ `1`（裸数字是 EMU，1 EMU ≈ 1/914400 in）
- **patch envelope 必须有 `schemaVersion: 1`** — 否则结构性拒绝
- **图片用 `assetSource.path`** — 用 `--asset-root <dir>` 限定，避免任意路径
- **chart 数据结构区分 kind** — `column/bar/line/area/pie/doughnut/radar` 用
  `{ categories, series: [{name, values}] }`；`scatter/bubble` 用 `{ series: [{name, points: [{x, y, size?}]}] }`；
  `stock` 用 `{ categories, high, low, close, open? }`
- **改 layout 前看影响面** — `inspect` 报告会列 `affectedSlides[]`，避免误删 placeholder
- **SmartArt / VBA macro / 动画** — s8fy 当前只能 preserve，不能创建/编辑；
  inspect 会标 `hasTransition` / `hasTiming` / `hasSmartArt`，遇到时告诉用户而不是硬干。
  **chartEx**（waterfall / funnel / boxAndWhisker / sunburst / treemap / histogram /
  pareto / regionMap）现在可创建，走同样的 `add-chart kind: "..."`，写入
  `ppt/charts/chartExN.xml`；详见 `references/charts.md`
- **combo 二轴现已支持** — `data.series[i].secondaryAxis: true` 把该系列挂到次坐标
  轴；同一个 combo 既可以 "≥2 种 plot kind"，也可以 "单 plot kind + secondary axis"，
  二者满足其一即可通过校验
- **不要假装做了** — 如果 dry-run 报错且无法修复，把报告完整反馈给用户而不是吞掉
- **空 deck 只有 `blank` layout** — `s8fy pptx new` 出来的 deck 不带 `title /
titleOnly / objText / twoObj` 等 OOXML layout，直接 `add-slide layout: { type:
"title" }` 会失败。两条路：① 用 `layout: "blank"` + `add-textbox`/`add-shape`
  手堆；② 先 `add-slide-layout` + `add-slide-layout-placeholder` 自建 layout。修
  改用户已有 deck 时这条不适用 — 先 `inspect` 看真实 layout 列表
- **`set-paragraph` vs `set-paragraph-format` 别用错** — `set-paragraph` 的
  schema 要 `text` 字段(用来替换段落文字),**不接受 `alignment`**;真正用来设
  对齐 / 缩进 / 行距的是 `set-paragraph-format`。早期 `deck-generator-template.mjs`
  把 `pAlign` helper 写成 `set-paragraph + alignment` → 任何新 deck 第一发
  dry-run 必败。已在模板修复,但**自己 hand-roll 时别再踩**
- **enum 用全名，不要用 shorthand** — `legend: "bottom"`（非 `"b"`）、`position:
"outsideEnd"`（非 `"outEnd"`）、`majorTick: "outside"`（非 `"out"`）、marker
  用 `symbol`（非 `kind`）。详见 `references/charts.md` 顶部修订说明
- **`set-chart-data-labels` 的 `scope` 是对象不是字符串** — `{ "series": 0 }` /
  `{ "series": 0, "point": 2 }`；省略 = plot 0（覆盖全部）
- **recipe 的 `titleStyle` / `bodyStyle` 不接受顶层 `bold`** — 加粗要放进 `font:
{ name, bold: true }` 子对象；schema `additionalProperties: false` 严格拒绝
- **`OutputExists` 时加 `--overwrite`** — 第二次 apply 同一个 `-o` 路径会被拒
  绝，CI/重跑场景显式加 `--overwrite`；如果是误覆盖，先 `s8fy pptx rollback
--from-sidecar` 回到上一态
- **chart 数据 0 值看起来像业务断崖** — 时间序列若 Q3/Q4 用 `0` 占位，渲染出来
  视觉上等于"业务塌方"。要么填预测值并在类目轴标 `"Q3 (预测)"`，要么只画已有
  数据并把未来季度放进独立 callout
- **recipe 单用产出看起来"很平淡"** — `add-title-slide` + `add-kpi-grid` +
  `add-comparison-table` 拼起来够"对"但不够"美观"。客户演示级别的 deck 通常需要
  200-300 个 ops（top bar / accent vertical bar / eyebrow / colored card top
  bars / delta pills / highlight callouts / hero closing），见 §9 与
  `references/rich-deck-patterns.md`
- **超过 100 ops 时手写 JSON 不可维护** — 先选可用 DeckKit；没有可用 DeckKit、
  需要新页型或要改组件结构时，再用 JS 生成器抽取/扩展 DeckKit（共享 helpers +
  全局调色板 `C` + `nm(slide, base)` 命名 helper + slide 函数循环）。可直接复制
  `assets/examples/deck-generator-template.mjs` 作为开发起点，详见
  `references/deck-generator-workflow.md`
- **shape 命名必须双向走 `nm()` helper** — `nm(s, "KpiBg")` 生成真名
  `"S2_KpiBg"`，但若引用 `fill(s, { name: "KpiBg" })` 用裸名就命不中。所有
  shape name **进出都走同一个 helper**，否则 resolvedSelectors 报 not-found
- **装饰元素放右下不放右上** — 主标题 textbox 通常吃 11in 宽（x≈0.95 →
  x≈11.95），右上 (10+, 2-4) 区域必然被覆盖；装饰应落在右下 (10+, 5.4-6.8)
  或角落 logo 区。dry-run **不报告几何重叠**，但 `vision-check`（§10）的
  `geometry-overlap` 能静态抓到，最终再靠 PNG 确认是否真盖住文字
- **textbox 高度给字号的 1.4-1.5 倍** — 54pt 给 1.5in，44pt 给 1.4in，32pt 给
  1.0in；单行最小给字号本身（54pt → 1.0in），中文环境推荐用上限。否则触发
  `text-overflow-possible` low severity（不阻塞但累积难读，偶尔确实截断）
- **可见字号不能靠缩小来解拥挤** — 投资人 / 客户演示级 deck 的正文 ≥ `10.5pt`，
  label / badge / chart / table ≥ `9pt`，页脚 / 来源 ≥ `8.5pt`。圆形编号、risk 标签、
  小徽章如果小到需要凑近看，就是设计失败；删字、换布局、扩大容器，不要降到 `7pt`。
- **对称构图必须数学对称** — VS 圆、对比页中轴、流程中心框、矩阵列头等要用 bbox
  推导：`gapCenter = (left.x + left.w + right.x) / 2`，`marker.x = gapCenter - marker.w / 2`。
  非对称设计也要有明确重心和补偿，不要把“看起来没对齐”留给用户猜。
- **连接线 / 箭头必须真实连接** — 优先用 `add-connector` 或按 shape bbox 计算端点。
  水平线应落在目标对象中心 y，端点应接到对象边缘，或保留一致的明确间隙。不要用未旋转
  `triangle` 假装水平箭头头；要么用原生 connector/arrow shape，要么取消箭头头。
- **`s8fy convert` 命令格式** — 不是 `s8fy <pptx> -t png -o <dir>`，正确写法
  `s8fy convert <pptx> --to png -o <dir> --overwrite`；同样地 PDF/MD/JSON
  也走 `s8fy convert <pptx> --to {pdf,md,json}`
- **dry-run 通过 ≠ 视觉通过** — 语义校验抓不到几何重叠（装饰挡标题）、对比度
  不足（浅灰底浅灰字）、卡片视觉错位、页码跳号、深底页忘改文字颜色等。其中**几何
  类**（越界 / 重叠 / 错位 / 文字越界 / 过小字号）现在可用 `vision-check`（§10）
  render-free 静态抓取并自动闭环；创建型 deck 里 `medium/high` 都必须处理到 0。
  **像素类**（字符实际重叠、字体换行导致压字、对比度、装饰是否真盖住文字）仍要靠
  **PNG 逐页 Read** 这道不可替代的闸门，见 §9.6 视觉验证清单
- **`raw-ooxml-patch` 默认禁用，需 `--allow-raw-xml`** — 这是逃生口，绕过
  schema-v1 的所有结构性校验，可以直接改 `ppt/slides/slideN.xml` 等任意 XML 部件。
  只在标准 patch op 表达不了（极少数 OOXML 边角语义）时使用；写完务必加跑
  `s8fy check deck.pptx --checks compat`。详见 `references/control-flow-and-raw-xml.md`
- **控制流 op (`if` / `foreach` / `try`) 与宏 op (`define` / `use`) 在 expand 阶段
  展开** — `condition.kind` 支持 `slide-count` / `count` / `selector-match` /
  `property-compare`，操作符要用 `==/!=/>/>=/<=/contains/...` 全名；`foreach` 的
  `as` 变量在 `do[]` 里用 `{{$var.path}}` 引用，缺省变量名 `item`；`try` 的
  `recoverable` 是字符串数组，列出可容忍的错误 `kind`，否则 catch 不接住。
  **`define` 注册命名 op 块**，`use` 用 `with` 传 `{{args.<field>}}` 占位符
  展开；宏不能重复定义、递归深度上限 16、放进 `try.ops` 失败时会被回滚
  （catch 内 `use` 会报 `undefined macro`）。
  详见 `references/control-flow-and-raw-xml.md`
- **daemon 默认自动拉起（v10+）** — `--daemon` 在 daemon 未运行时会自动 fork 一个
  detached daemon（首次 ~200ms 开销），无需手动 `s8fy daemon start`；要关掉
  auto-spawn 设 `S8FY_DAEMON_AUTO_SPAWN=0`，要硬要求 daemon 用 `--daemon-strict`
  （auto-spawn 失败时直接报错，不 fallback）；state / lock / 日志路径分别在
  `S8FY_DAEMON_STATE` / `<state>.lock` / `S8FY_DAEMON_LOG`
- **PDF 导出现在能正确渲染粗体/斜体** — `pdfFontResolver` 会扫描所有 run 收集真正
  用到的 font style（regular / bold / italic / boldItalic），并为每种 style 拉对应
  Google Fonts 子集；若指定 `'Barlow Black'` 这类权重后缀字体名，会被拆成基础
  family + weight 走 `':wght@N'` URL（旧版总是拉 regular）
- **`spcPct` 行距按 PowerPoint single-line 1.2 倍换算** — 100000(单倍) → CSS
  `line-height: 1.2`、150000 → 1.8、200000 → 2.4；解析器双侧（JS / WASM）已经
  统一乘 1.2，**自己写 patch 时仍然填 OOXML 语义值**（100000 = 单倍），不要预
  乘 1.2
- **优先用 `suggestion.autoRetry: true` 的修复建议** — 错误报告里每条
  `suggestions[i]` 都带 `autoRetry: bool`，标 `true` 的（ambiguous selector
  候选 / fuzzy enum / fuzzy field / fuzzy layout / RGB 颜色规整 / layout 字段
  补全）是机器有信心的修复，confidence ≥ 0.68，直接合 patch 重 dry-run；标
  `false` 的（兜底 noop、模糊上下文）需要人工看一眼。顶层 `error.autoRetry`
  是聚合（"有没有任何一条 suggestion 是 autoRetry"），不要忽略它
- **拼错 enum 写"近似值"是安全的** — fuzzy 修复现在是 alias-aware：
  `accent-1` / `text1` / `hyperlink` 会自动得到 `accent1` / `tx1` / `hlink`；
  `aptos-body` / `times` / `noto-cjk-sc` → `Aptos` / `Times New Roman` /
  `Noto Sans CJK SC`；`title` / `section` / `two-column` → 标准 layout 名；
  形状的所有 alias 也认（`rectangel` → `rectangle`）。**第一次不确定标准名时
  先按直觉写，看 dry-run 给的修复建议** —— 比 grep schema 快
- **dry-run 加 `--explain` 可拿到每个 op 的字段约束摘要** — `pptx apply
--dry-run --explain --json` 会让报告多出 `explanations[]`，每项给 `summary`
  (一句话作用)、`schema.{requiredFields,optionalFields,fieldNotes}`、
  `expandedOps`(if/foreach/try/use/recipe 展开后的底层 op 名)。比 `s8fy
schema --op <name>` 更轻量,**只覆盖当前 patch 真用到的 op**;Agent 不读源码
  也能照着 fieldNotes 填字段。`--explain` 仅在 `apply --dry-run` 上有效,
  inspect / 真 apply 加这个标志会被拒绝
- **错误码扩到 24 类** — 新增 `OutputExists`(`-o` 已存在,加 `--overwrite`)、
  `InvalidSidecar`(sidecar 不是 `pptx-apply-sidecar/v1`)、`DaemonUnavailable`
  (`--daemon-strict` 在 daemon 不在 / auto-spawn 失败时报)、`InvalidRequest`
  / `ProtocolError` / `UnknownMethod`(daemon RPC 三种)。Agent 看到这几个
  code 时直接走对应 fix,不要再回过头读 docs
- **PDF 导出对希腊字母 / 数学符号 / 文本默认符号自动用 latin-unicode fallback**
  font — `convertToPdf` 现在新增 `latinUnicodeFallbackFamilies` 槽位
  (默认 `['Noto Sans Symbols 2','Noto Sans Symbols','Noto Serif']`),专门
  接非 CJK / 非 emoji 的 Unicode 字符(希腊/数学/text-default 符号如 ✕),
  不再被 CJK fallback 错误接走。同时 emoji 检测改成"默认 emoji presentation
  - VS16 显式标记"两类:`↩️ ⚠️ ☁️` 这类带 U+FE0F 的会正确走 emoji 槽位;
    纯文本符号(如 ✕ U+2715,无 VS16)走 latin-unicode 槽位。`U+FE0E` (VS14)、
    `U+FE0F` (VS16)、`U+200D` (ZWJ) 三类格式控制码全链路忽略,不会再被当成
    可见 glyph 渲染。写 patch 时**正常用这些字符即可**,无需额外指定字体 —
    PDF 导出端会按 cmap 覆盖度自动选 family;但若指定 `'Source Han Sans'` 这类
    CJK 字体名,希腊字母仍会优先用 latin-unicode fallback,因为 cmap 检查会
    剔除真覆盖不到的字体

---

## §8 深入阅读（references/）

| 文件                                     | 何时读                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `references/express-mode.md`             | 简单 prompt → 完整 deck 的 express 自动化黄金路径与最小确认                 |
| `references/patch-ops-cheatsheet.md`     | 写任何 patch 之前都该扫一眼，按场景找 op                                    |
| `references/recipes.md`                  | 用 recipe op 创建 deck 之前，看完整 schema 与示例                           |
| `references/rich-deck-patterns.md`       | 要做"客户演示级"丰富 deck 时的视觉元素清单与起手势                          |
| `references/deck-generator-workflow.md`  | 创建/扩展 DeckKit 时的 JS 生成器模板、helpers、命名规范                     |
| `references/theme-packs.md`              | themePack / stylePack catalog、`list-themes`、`swap-theme`、`extract-style` |
| `references/template-library.md`         | brand/layout/deck/chart/icon 资产目录、catalog 和选择规则                   |
| `references/inspect-and-edit.md`         | 修改已有 deck 时，看 selector / inspect 输出怎么用                          |
| `references/schema-discovery.md`         | 想搞清楚 108 个 op 的全貌、按需拉 schema                                    |
| `references/styles-and-themes.md`        | 编辑颜色 / 渐变 / 字体 / 主题 / 母版                                        |
| `references/charts.md`                   | 创建 / 编辑图表，以及 native diagram/table preset                           |
| `references/tables.md`                   | 表格创建 / 编辑 / CSV 导入 / 公式                                           |
| `references/data-driven.md`              | `from-data` + `bind-data` 完整用法                                          |
| `references/control-flow-and-raw-xml.md` | `if` / `foreach` / `try` 控制流 + `raw-ooxml-patch` 逃生口                  |
| `references/daemon-sessions.md`          | 多步 Agent 工作流用 `s8fy daemon` 复用内存中的 Presentation                 |
| `references/troubleshooting.md`          | 遇到错误时按 `errorCatalog` 自修复                                          |

`assets/examples/` 下有可直接复用的 patch / recipe / brand profile 范例。

`assets/deckkits/` 下是冻结的 DeckKit（DeckKit 模式的核心资产）：

- `catalog.json` — 已注册 DeckKit 索引（density limit、支持页型）
- `core-primitives.kit.mjs` — 几何安全层 + op 工厂（所有 DeckKit 共用）
- `<deckkit>.kit.mjs` — 主题级视觉语言 + 页型函数
- `schemas/` — content manifest 校验 schema
- `examples/` — 可直接运行的 content + build 示例

---

## §9 视觉丰富度配方（"为什么我的 deck 看起来很平"）

当用户反馈"不够美观、不够丰富"时，问题几乎总是同一个：**只用了 recipe**。recipe
给的是"对"，不是"好看"。一份合格的客户演示级 7 页 deck 通常需要 **200-300 个
ops**，而不是 10 个。下面是基线清单 — 详细模板在 `references/rich-deck-patterns.md`。

### 9.1 每页必备的视觉元素（基线）

| 元素                          | 实现 op                            | 作用               |
| ----------------------------- | ---------------------------------- | ------------------ |
| 顶部品牌色横条（4-8px 高）    | `add-shape rectangle` + `set-fill` | 视觉锚点，统一节奏 |
| 左侧 accent 竖条（标题左侧）  | `add-shape rectangle`              | 标题视觉重量       |
| Eyebrow 小标（`01 · 章节名`） | `add-textbox` 11pt 灰色            | 信息层级、章节定位 |
| 页脚 + 页码                   | `add-textbox` 9pt 灰色             | 专业感、阅读追踪   |
| Watermark / brand mark        | `add-textbox` 半透明               | 内部资料标识       |

### 9.2 内容页常用模式

- **KPI 网格不要用 `add-kpi-grid` recipe** — 它布局僵硬（3+1 不是 4-across）。手
  堆 4 个 `add-shape rounded-rectangle`，每张卡顶部各加 4-8px 品牌色 / 强调色
  小横条，下面放 44pt 大数字 + 12pt delta pill（绿色 `▲ +X%` / 红色 `▼ -X%`）+
  描述性脚注
- **对比表格不要只用 `add-comparison-table` recipe** — 顶部加结论 banner（一句话
  总结，蓝底白字），表格下加分隔线 + 来源标注
- **章节扉页用全色 hero** — 整页 accent1 填充（`set-slide-background`），白字大
  标题 + eyebrow，底部 3 个透明白色卡片放 takeaway
- **chart 页右侧留 callout 区** — chart 占左 2/3，右 1/3 放 3 个圆角卡片，每个一
  个数字 + 描述（如 "H1 同比 +21.9%"、"Q2 单季新高 $42M"），让人不用看图也知道
  结论

### 9.3 推荐调色板（Google Material 风格安全牌）

| 用途         | 色值                                           |
| ------------ | ---------------------------------------------- |
| 主色 accent1 | `1A73E8`（Google Blue）/ `0B57D0`（深蓝 hero） |
| accent2 成功 | `34A853`（绿）                                 |
| accent3 警示 | `FBBC04`（黄）                                 |
| accent4 风险 | `EA4335`（红）                                 |
| 文字主       | `1F1F1F`                                       |
| 文字次       | `5F6368`                                       |
| 文字弱       | `9AA0A6`                                       |
| 卡片背景     | `F8F9FA`                                       |
| 分隔线       | `E8EAED`                                       |

字体优先 `Inter`（西文）+ `Source Han Sans SC`（中文 EA fallback）。

### 9.4 op 量级参考（按"丰富度"分档）

| 档位                   | op 量级 | 适用                          |
| ---------------------- | ------- | ----------------------------- |
| 草稿 / 内部速记        | 10-30   | recipe-only，3-5 页           |
| 内部汇报               | 50-100  | recipe + 少量 textbox / shape |
| **客户演示级（默认）** | 200-300 | 7 页左右 / 视觉元素全配齐     |
| 投资人 / 大客户        | 400+    | + 自定义 chart 样式、动效拟态 |

如果用户没明说，**默认按"客户演示级"做** — 别拿 12 ops 的 recipe-only deck 交付。

**丰富度自检命令**（生成完 patch.json 后强制跑一次）：

```bash
jq '.ops | length' patch.json
# < 100  → recipe-only,视觉太空,必须手堆装饰元素
# 100-200 → 内部汇报级
# 200-400 → 客户演示级(默认目标)
# 400+ → 媒体公开级 / 投资人级
```

低于目标档位就回去给每页加视觉元素（top bar / accent vertical / eyebrow /
KPI 顶部色条 / delta pill / callout / hero closing），见 §9.1-9.2。**不要
在 ops 数不够时就声称完成**。

> **耗时基准**:
>
> - 从零抽取 DeckKit 样本(10 页客户演示级 deck, 1105 ops 实测): 总耗时 ~20 min，分布
>   ≈ 大纲提炼 15% / JS 生成器编写 **45%(最耗时)** / dry-run gate 15% / PNG
>   验证 25%。
> - 模板熟练样本(8 页橙色 roadmap deck, 893 ops 实测): 总耗时 ~6.6 min，分布
>   ≈ 大纲提炼 15-20% / JS 生成器编写 **45-50%(仍最耗时)** / dry-run gate
>   10-15% / apply + PNG + 结构验证 20-25%。这类样本复用了本 skill 的生成器模式、
>   `grid()` / `txH()` 和避坑规则，因此绝对时间显著下降，但耗时占比基本不变。
>
> 模板里的 `grid()` 和 `txH()` helper 是为压缩"JS 生成器编写"这一段做的 ——
> 4-across / 3-across / 2×2 网格都走 `grid()`, textbox 高度都走
> `txH(sizePt, lines)`,坐标手算从最大返工源变成 0。

> **超过 ~100 ops 且没有可用 DeckKit 时，先创建/扩展 DeckKit**：手写 800 行
> JSON envelope 不可维护，换主题色要 grep 全文 replace，改字号节奏要逐页修。
> 用 JS 生成器把"数据 + 模板"显式拆开，再冻结为 DeckKit；之后交付 deck 只写
> content manifest。可直接复制 `assets/examples/deck-generator-template.mjs`
> 作为开发起点，详见 `references/deck-generator-workflow.md`。

### 9.5 7 页 deck 推荐结构

```
01 封面    → title-slide 风格，顶部品牌条 + accent 竖条 + eyebrow + 大标题 + 副标题 + tagline + footer
02 议程    → 5 个编号卡片（01-05），最后一个高亮当前讨论主题
03 KPI     → 顶部品牌条 + eyebrow + 标题 + 4-across KPI 卡片（顶部色条 + 大数字 + delta pill + 注脚）
04 主数据  → chart 占左 2/3，右 1/3 放 3 个 highlight callout 卡片
05 对比    → 7×3 表格 + 顶部结论 banner + 底部来源注脚
06 行动    → 3 列支柱（顶部不同色条 + 大类名 + 中文标题 + bullet 正文）
07 收尾    → 全 accent1 hero 背景 + eyebrow + 54pt 大标题 + 3 个透明白色 takeaway 卡片
```

完整骨架 patch.json 见 `references/rich-deck-patterns.md`。

### 9.6 视觉验证清单

`s8fy convert out.pptx --to png -o previews/ --overwrite --contact-sheet` 转出逐页 PNG + 总览图后，
**先 Read 总览图 `previews/contact-sheet.png`**：一屏看完整本 deck，扫**跨页/全局**一致性
（全 deck 配色协调、下方第 8 条页码连续、第 9 条节奏统一、深浅底交替、构图平衡）并定位可疑页——
这些逐页单看最容易漏、总览图一眼可见。再**逐页 Read** `slide-0NN.png` 检查：

1. **没有字符重叠 / 换行压字 / 文字溢出 / 截断**（标题被遮、卡片字超出边框、
   多行文本行距不够、页脚/来源与正文撞在一起）
2. **没有小到吃力的字体**（核心正文 ≥ `10.5pt`；label / badge / chart / table ≥ `9pt`；
   页脚 / 来源 ≥ `8.5pt`，且不承载关键信息）
3. **文字容器给足空间**（卡片 / textbox / 表格行可增高时必须增高；正文不必跟短标题同宽，
   可以减少左右 padding 或扩展正文框来避免硬换行、断词和贴底）
4. **装饰元素不挡内容**（封面页装饰必须落右下，不能盖主标题；4 张 KPI 卡顶部
   色条不能挡 label）
5. **卡片 / 中轴 / 标识对齐**（4 张卡 x 坐标等距、宽度一致；居中检查
   `startX = (13.333 - total) / 2`；VS 圆、中心框、编号圆、同排文字与图形必须按 bbox
   中心线推导，而不是凭感觉）
6. **连接线 / 箭头完整**（水平线不歪，端点接到目标 shape 边缘或保留一致间隙；箭头头方向正确）
7. **颜色对比度足够**（白底文字 ≥ `1F1F1F`，蓝底文字 = `FFFFFF`；深底页所有
   textbox 文字颜色已改为白色，没有遗漏的黑字）
8. **页码连续**（`01 / 08` … `08 / 08` 没跳号；deep-color hero 页页码颜色已改）
9. **节奏统一**（每页顶部品牌条都在；每页 eyebrow 字号一致）
10. **chart 有数据标签 / 图例 / 轴标**（不要光秃秃的柱子）

任何一条不过都回去改 patch 重 apply（记得 `--overwrite`）；用 JS 生成器时改对应
slide 函数即可。不同 theme/style/font 会改变实际换行和字高，验证矩阵时要至少抽查每个
layout 变体的前两页和所有高密度页，不能只看默认 theme。

### 9.7 contact sheet 总览图：用 1 张图代替盲目逐页 Read

`--contact-sheet` 在 `--to png` 时同一次转换里多产出一张 `contact-sheet.png`，把整本
deck 缩略图拼成网格（s8fy 原生 PDFium 渲染，零外部依赖，不需要 ImageMagick）。它对
agent 的核心价值是**省 Read**——

> §9.6 的"先总览后逐页"之所以成立：先 Read 1 张总览图就能定位可疑页，**只对可疑页**再
> Read 全分辨率 `slide-0NN.png`，而不必把整本 N 页 PNG 一张张读进上下文。§9.4 耗时基准里
> "PNG 验证 ~25%"主要压在逐页 Read，总览图正是来压缩它的；deck 越长，省得越多。

**默认够用，页多 / 看不清时再调参**（默认 2 列 / `640x360` 缩略图 / `16px` gap / 白底）：

| 场景                                 | 调参                                  |
| ------------------------------------ | ------------------------------------- |
| 页多（>10-12），2 列缩略图太小看不清 | `--contact-cols 3`（或 4）            |
| 要在总览上直接看清小字 / 标签        | 调大 `--contact-thumb 960x540`        |
| 想看清深浅底交替、卡片是否贴边出血   | 非白底 `--contact-background EEEEEE`  |
| 超大 deck 报 `too large`             | 按提示降 `--contact-thumb` 或分批转换 |

**从总览图回到原始页码**：manifest 的 `outputs.contactSheet.cells[]` 给每格
`{ cell（0-based 格号）, page（PDF 页）, slide（原始 PPTX 页码）}` 映射。在总览上看到
"第 N 格不对"时，查 `cells` 拿到 `slide`，直接 Read 对应的 `slide-0NN.png`：

```bash
jq '.outputs.contactSheet.cells[2].slide' manifest.json   # 总览第 3 格 → 原 deck 页号
```

选页时（`--slide 1,3,5`）尤其有用——总览只含选中页，`slide` 字段帮你把缩略图对回原 deck。

**何时不必用**：≤3-4 页小 deck 逐页 Read 就够，总览意义不大。contact sheet 是**多页
deck 跨页扫视 + 省 Read**的提速器，不替代逐页细节复核（§9.6 清单）、vision-check（§10）
或 PowerPoint 保真度对比（仍属 `tools/visual-compare.nu`）。

---

## §10 静态视觉自检闭环（vision-check，render-free）

§6 的 dry-run 抓**语义**，§9.6 的 PNG 抓**像素**，中间一直缺一道"几何闸门"——
全 skill 反复提醒「dry-run **不报告几何重叠**」「装饰挡标题靠 PNG 才发现」，可 PNG
又得先渲染、慢且重。`s8fy pptx vision-check` 正好补这一段：**不渲染、不落 PNG**，
直接在 OOXML 几何上扫一遍，把"形状越界 / 文字贴边 / 文字越界 / 形状重叠 / 卡片
错位 / 字号过小"这六类几何缺陷连同**可机改的 fixPatch** 一起报出来。它快、零依赖，
可以每次 apply 后都跑。

### 10.1 命令与报告

```nu
s8fy pptx vision-check out.pptx --json | save vision.json
```

- 只读：接受位置参数或 `--input`（二选一），**不写文件** —— `--output` /
  `--patch` / `--dry-run` / `--overwrite` 等全部会被拒。
- `--json` 把 `pptx-vision/v1` 报告写 **stdout**；省略 `--json` 时人类摘要写
  **stderr**（与 `inspect` 同约定），`--quiet` 静默。
- `summary` 带 `bySeverity { high, medium, low }` 与 `autoFixable`（可自动套的修复
  条数）；`issues[]` 每条带 `kind` / `severity` / `slideIndex` / `shapeId` /
  `shapeName` / `message` / `metrics` / `fix?`。
- 每条 `fix`（若有）形如 dry-run 的修复建议：
  `{ fixPatch, reason, confidence, autoRetry }`。`fixPatch` 是可直接合并的 op
  数组（`set-shape-position` / `set-shape-size`，EMU 以数字字符串给出，`apply`
  照单全收）。

六类 `kind`（severity / confidence / 是否 autoRetry / fix 动作）：

| kind                     | severity | confidence | autoRetry | fix 动作                  |
| ------------------------ | -------- | ---------- | --------- | ------------------------- |
| `shape-out-of-bounds`    | high     | 0.9        | ✅ 是     | 夹回安全边距内（move）    |
| `text-edge-margin`       | medium   | 0.8        | ✅ 是     | 推到安全边距（move）      |
| `text-overflow-estimate` | medium   | 0.5        | ❌ 候选   | 加高盒子（resize）        |
| `geometry-overlap`       | low/med  | 0.5        | ❌ 候选   | 最小平移分开（move）      |
| `arrangement-imbalance`  | low      | 0.45       | ❌ 候选   | 对齐到行顶（move）        |
| `font-too-small`         | low      | —          | 无 fix    | 放大字号会反触发 overflow |

### 10.2 闭环：自动套 autoRetry，medium/high 清零后才交付

**只有 `shape-out-of-bounds` 与 `text-edge-margin` 是 `autoRetry: true`**——越界
回夹、贴边回安全边距，可逆、无歧义，可以闭眼自动套。把它们的 `fixPatch` 全部拼成
一个 patch envelope，re-apply，再 vision-check 确认对应 issue 清零：

```nu
# 1. 把所有 autoRetry==true 的 fixPatch 合进一个 patch
jq '{schemaVersion:1, ops:[.issues[] | select(.fix.autoRetry==true) | .fix.fixPatch[]]}' vision.json | save fix.json

# 2. 应用
s8fy pptx apply -p fix.json -i out.pptx -o out.pptx --overwrite

# 3. 重跑确认这些 issue 清零（闭环成立）
s8fy pptx vision-check out.pptx --json | jq '.summary'
```

创建型 deck 交付前必须满足：

```bash
jq -e '(.summary.bySeverity.high // 0) == 0 and (.summary.bySeverity.medium // 0) == 0' vision.json
```

`autoRetry: false` 的三类（overlap / overflow / alignment，confidence 0.45-0.5）
不是可忽略项，而是**候选修复需要人工处理**：放大盒子或挪开形状可能引入**新**碰撞，
所以要看 `reason` 后改 generator / layout / 文案 / textbox 尺寸，再重 apply 和
vision-check。`font-too-small` 不带 fix（放大字号会反过来触发 overflow），自己权衡字号与盒子。

### 10.3 边界：vision-check ≠ PNG 复核，二者叠加用

vision-check 只看**几何**，看不到这些——所以 §9.6 的 PNG 逐页复核仍不可替代：

- **对比度**：浅灰底浅灰字、深底页忘改白字（几何上完全正常）
- **字号是否累眼**：`font-too-small` 可能只是 low，甚至自定义生成器可能没触发；PNG 上
  仍要检查圆形编号、badge、risk 标签、chart/table label 是否可读。
- **真实字体换行 / 字符重叠**：vision-check 是几何估算，字体、主题、平台渲染差异可能让
  title 或卡片文案实际换行后压住下一行，必须看 PNG
- **装饰是否真盖住文字**：它只报"两形状重叠"，色块到底有没有遮住标题文字要看渲染
- **箭头 / 连接线 / 中轴是否看着对**：未旋转 triangle 箭头、断开的连接线、偏离真实中心的
  VS 圆等属于视觉完整性问题，vision-check 未必能判断意图。
- **配色协调 / 页码跳号 / 节奏 / 构图平衡**：纯视觉判断

推荐顺序（越靠前越便宜，能拦就别留到后面）：

```
dry-run（语义，--dry-run --json）
  → vision-check（几何，可自动闭环，render-free）
  → PNG（像素，§9.6）：先 contact sheet 总览扫跨页 → 再逐页 Read 抠单页细节
```

dry-run 通过只是"语义对"，vision-check 清零是"几何稳"，PNG 过清单才是"看着对"。
三道闸门职责不重叠，**别用任何一道顶替另一道**；PNG 这道内部也分工：
**contact sheet 总览看跨页全局（配色 / 页码 / 节奏 / 构图），逐页 PNG 看单页细节（重叠 / 压字 / 对比度）**。

---

**最后的判断准则**：

- **先选模式**：简单 prompt → Express（`references/express-mode.md`，自动闭环、最小确认）；
  要精控 / 客户演示级 → Studio（§1 + §9）；改已有 deck → Edit（§2）。三者共用同一套 op。
- 草稿 / 速记：能用 recipe 就别用 patch。
- **客户演示级 deck（默认）：先选可用 DeckKit；没有可用 DeckKit 时，先创建/扩展
  DeckKit，再用 DeckKit 生产交付 deck**，详见 §1.0 / §1.4。
- **超过 ~100 ops 且无可用 DeckKit 时**，复制 `assets/examples/deck-generator-template.mjs`
  只是新建/扩展 DeckKit 的开发起点，不是普通交付 deck 的默认路径。
- 改已有 deck：能用 layout selector 就别算坐标，能用 placeholder 就别 add-textbox。
- 永远把 dry-run 当成必经环节，把 sidecar 当成时光机。第二次 apply 同路径要加
  `--overwrite`；第二次 `convert` 同 PNG 目录也要加 `--overwrite`。
- 生成后按 **dry-run（语义）→ vision-check（几何，§10 可自动闭环）→ PNG（像素，
  §9.6 逐页 Read）** 三道闸门收尾。创建型 deck 的 `vision-check` high/medium
  必须为 0；几何缺陷（越界 / 重叠 / 错位）交给 `s8fy pptx vision-check`，
  字符重叠 / 小字号 / 对比度 / 连接线断开 / 中轴偏移 / 装饰挡标题这类像素与审美问题仍必须 PNG 逐页确认 ——
  三道职责不重叠，别相互顶替。
