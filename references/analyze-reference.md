# Phase 0 — 分析参考 deck

目标：把参考 `.pptx` 的风格、主题、模板和内容变成三份结构化文档
（`style-spec.md` + `slide-inventory.md` + `fidelity-scope.md`），作为 Phase 1 重建和
Phase 2 抽象的唯一依据。
不要凭印象重建；每个视觉决策都应能在本阶段产物中找到出处。

## 目录

1. 解包参考文件
2. 生成结构化 inspect 输出
3. 生成参考 PNG 基准
4. `style-spec.md` 模板
5. `slide-inventory.md` 模板
6. `fidelity-scope.md` 模板
7. 完成判据

## 1. 解包参考文件

务必先看帮助再使用：

```bash
nu tools/unpack-pptx.nu -h
```

常用方式（解压到 `.tmp-slides/`，**不支持 -o 参数**）：

```bash
nu tools/unpack-pptx.nu <ref.pptx> -i          # 结构概览：页数、layouts、masters
nu tools/unpack-pptx.nu <ref.pptx> -l          # 列出所有 slides 与关键文件
nu tools/unpack-pptx.nu <ref.pptx> -s 3        # 第 3 页 slide XML 路径
nu tools/unpack-pptx.nu <ref.pptx> -f "某文案"  # 全文搜索定位文案所在 XML
```

关键 XML 位置（`.tmp-slides/` 下）：

| 文件                                | 提取内容                                      |
| ----------------------------------- | --------------------------------------------- |
| `ppt/theme/theme1.xml`              | 主题色（clrScheme）、主题字体（fontScheme）   |
| `ppt/slideMasters/slideMaster1.xml` | 母版 chrome、占位符默认样式、背景             |
| `ppt/slideLayouts/*.xml`            | 版式骨架（与 slide-inventory 的页型归并对照） |
| `ppt/slides/slideN.xml`             | 每页 shape 几何、文本、字号、颜色             |
| `ppt/presentation.xml`              | 幕布尺寸（`sldSz`，EMU）                      |
| `docProps/app.xml`                  | 页数、标题列表速览                            |

单位换算：**EMU ÷ 914400 = inch**；字号 `sz="2800"` = 28pt（百分之一磅 ÷ 100）。
标准 16:9 幕布为 12192000 × 6858000 EMU = 13.333 × 7.5 in；如果参考 deck 不是
16:9，先与用户确认目标尺寸再继续。

## 2. 生成结构化 inspect 输出

解包 XML 是事实源，`xdoc inspect` 是辅助索引。两者都保留：XML 用于核对色、字、坐标，
inspect 用于快速定位 shape、文本、图片、关系和页型分布。

```bash
xdoc pptx inspect <ref.pptx> --daemon --json > .tmp-deckkit-<id>/ref-inspect.json
```

使用方式：

- 先从 `ref-inspect.json` 获取 slide count、shape count、文本清单、图片/媒体关系和可能的
  unsupported 对象。
- 再回到 `.tmp-slides/` 的 XML 查证具体 `a:xfrm`、`a:solidFill`、`a:rPr sz`、
  placeholder、layout/master 继承来源。
- 如果 inspect 与 XML/PNG 不一致，以 XML + PNG 为准，并在 `findings.md` 记录差异。

## 3. 生成参考 PNG 基准

```bash
xdoc convert <ref.pptx> --to png -o .tmp-deckkit-<id>/ref-previews --overwrite --contact-sheet
```

先 Read `ref-previews/contact-sheet.png` 总览全 deck 的配色节奏、页型分布、chrome
一致性；再逐页 Read PNG。**每看完 1–2 页立刻把观察写进 `style-spec.md` /
`slide-inventory.md`**（多模态信息不落盘就会丢失）。转换产物若带 `XDOC DEMO`
水印，是渲染期叠加，分析与后续对比时一律忽略。

## 4. style-spec.md 模板

逐项从 XML + PNG 提取，**hex/字号/坐标必须来自 XML，不要从 PNG 目测**：

```markdown
# <id> Style Spec（来源：<ref.pptx>）

## 调色板（theme1.xml clrScheme + slide 实际用色统计）

| 角色    | hex    | 出处          | 用途      |
| ------- | ------ | ------------- | --------- |
| primary | 1A2B3C | theme accent1 | 标题/强调 |

（其余角色行：背景、正文主/次/弱、卡片底、强调、正负语义色、线条/网格色）

## 字体（fontScheme + 实际 run 统计）

- Latin major/minor: ... East Asian: ...
- 实际渲染字体若本机不可用，记录替代方案（如 → Arial / 思源黑体）并报告给用户

## 字号节奏（按角色归并，来自各 slide run 的 sz）

| 角色         | pt  | 出现页 |
| ------------ | --- | ------ |
| cover 主标题 | 44  | 1      |
| 页内 H1      | 28  | 2-14   |

（其余角色行：subtitle/eyebrow/body/label/footer/数字大字）

## 版心与 chrome

- 幕布尺寸、左右边距、标题区 y/h、页脚结构（页码格式如 "03 / 15"）、
  顶部品牌条/侧边 accent/装饰元素的几何与颜色
- 跨页固定出现的元素清单（= 未来 kit 的 makeChrome）

## 网格与组件

- 重复出现的卡片/pill/编号圆/连接线/分隔线样式（圆角、描边、内边距）
- 多列布局的列数/列宽/间距（推导 grid 参数）

## 图标与图片

- 参考 deck 用到的图标语义清单 → 每个给出 Tabler 候选
  （用 node skills/pptx-nova/scripts/pptx-nova-icons.mjs search <概念> --json 查）
- 内容性图片/logo：记录位置、角色、是否图片主导页、可复用外壳（裁切/边框/callout/caption）；
  kit 中处理为 asset 槽位、语义相关原生替代或省略，需向用户披露。

## 资产分类

| 资产类型               | Phase 1 高保真重建             | Phase 2 DeckKit 抽象                                           |
| ---------------------- | ------------------------------ | -------------------------------------------------------------- |
| 图标/装饰符号          | 用 Tabler 最接近图标替代       | 固定为 kit 图标选择，图标名来自现有 pack                       |
| logo/品牌标识          | 默认不复用原图；只重建摆放外壳 | 变成 `asset` 槽位或 catalog known limit；授权+用户确认才可纳入 |
| 内容截图/产品界面图    | 默认 scoped out；必要时占位框  | 变成显式 `assetSource`/slot，或在 knownLimits 披露             |
| 照片/插画/背景位图     | 默认 scoped out；不搬原图      | 默认不进 kit/examples/assets；只保留图片使用结构               |
| 嵌入对象/视频/SmartArt | 记录位置和预览，不搬预览图     | 默认 unsupported/known limit，不为单一 deck 下沉 primitive     |
```

## 5. slide-inventory.md 模板

逐页登记，并做**页型归并**——这是 Phase 2 schema 设计的雏形：

```markdown
# <id> Slide Inventory（共 N 页）

| #   | 拟定页型              | 结构概述                     | 业务内容摘要 | 特殊元素   | 图片策略       |
| --- | --------------------- | ---------------------------- | ------------ | ---------- | -------------- |
| 1   | <prefix>CoverSlide    | eyebrow+大标题+副题+tag+页脚 | "..."        | 右下装饰格 | none           |
| 2   | <prefix>QuoteSlide    | 大引文+作者+出处             | "..."        | —          | none           |
| 3   | <prefix>TimelineSlide | 横向 5 步时间轴              | "..."        | 连接线     | none           |
| 4   | <prefix>ImageCallout  | 图片框+3 个 callout          | "..."        | 标注线     | slot/scope-out |

...

## 页型归并结论

- 共 N 页 → M 种页型；每种页型列出：覆盖页码、可变槽位（标题/条目数/...）、
  固定结构（哪些属于 kit，哪些属于 content）
- 条目数区间（如 timeline 3–5 步）→ 未来 density soft/hard 与 maxItems 依据
- 图片主导页清单：哪些只贡献图片使用结构，哪些需要从 Phase 1 rebuild set 排除，
  哪些可以用语义相关 shape/icon/chart/table 原生替代
```

页型命名用新 DeckKit 的短前缀（如 `swiss` → `swissCoverSlide`），与现有三套
DeckKit 的页型名不冲突。归并原则：结构相同、仅内容不同的页合并为一个页型；
结构差异大到需要不同槽位集合的，拆成不同页型。**默认保留所有 slides**——
宁可多一个页型，也不要丢页或把两页硬塞进一个不合身的页型。若 deck 很大或有大量
重复/一次性页面，不要在这里暗自删页；转到 `fidelity-scope.md` 明确选择 full/scoped。

## 6. fidelity-scope.md 模板

高保真范围默认是 `full`：Phase 1 重建全部 slides。只有在参考 deck 页数很多、重复页占比高、
明显包含大量一次性/低复用页面，或存在图片主导页时，才考虑 `scoped`。图片主导页默认
scoped out；若要纳入 rebuild set，必须说明它贡献了新的可复用页型/外壳，而不是为了复刻图片。
非图片原因的 `scoped` 必须先向用户确认；图片主导页按本规则默认排除，但要向用户披露。

```markdown
# <id> Fidelity Scope

Mode: full | scoped
Reason: <为什么全量，或为什么需要 scoped>

## Coverage Requirements

- Page types covered: <M>/<M>
- Signature visual elements covered: ...
- Chart/table/asset forms covered: ...
- Chrome/theme coverage: ...
- Image-dominant pages: <scoped out / shell rebuilt / user-confirmed exception>

## Rebuild Set

| ref slide | rebuild? | page type | reason                                       |
| --------- | -------- | --------- | -------------------------------------------- |
| 1         | yes      | <type>    | cover + chrome baseline                      |
| 2         | yes      | <type>    | representative                               |
| 3         | no       | <type>    | same structure as 2; content-only variation  |
| 4         | no       | <type>    | image-dominant; shell captured as asset slot |

## Phase 2 Impact

- Known limits / coverage notes to add to catalog: ...
- Benchmark cases needed because of scoped coverage: ...
- Asset slots / placeholder behavior needed for image-driven layouts: ...
```

`scoped` 的最低要求：

- 覆盖每种页型至少一页；同一页型如有不同密度、不同资产形态或不同语言方向，分别覆盖。
- 覆盖所有跨页 chrome、signature visual element、图表/表格/图片/截图/图标形态。
- 图片主导页默认不进 rebuild set；如该页型可复用，只重建外壳和 asset slot，不复制原图。
- 未重建页必须逐页记录归属页型和省略原因，后续写入 coverage/knownLimits 或 benchmark。
- Phase 1 对比只按 rebuild set 验收，但 Phase 2 的 schema、slot budget、density 仍要参考
  全量 `slide-inventory.md`，不能只看重建页。

## 7. 完成判据

- [ ] `style-spec.md` 的色/字/几何均有 XML 出处
- [ ] `slide-inventory.md` 覆盖参考 deck 全部页，无遗漏
- [ ] `fidelity-scope.md` 已写明 full/scoped；若 scoped，已获得用户确认并列出 rebuild set
- [ ] `ref-inspect.json` 已生成，并与 XML/PNG 的关键结论交叉核对
- [ ] 页型归并完成，每种页型的可变槽位与固定结构已区分
- [ ] 图标映射表完成（含查不到合适 Tabler 替代的项，单独列出待用户决策）
- [ ] 资产分类完成：图片主导页、Phase 1 scope-out/shell rebuild、Phase 2 asset slot、
      known limit 或省略的决策已记录
- [ ] 字体不可用、非 16:9、嵌入媒体等风险已记录

完成后进入 `rebuild-high-fidelity.md`。
