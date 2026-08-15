# DeckKits

经过验证矩阵通过后冻结的 DeckKit，用于 pptx-nova 的“DeckKit 模式”二次创作快路径。

## 目录结构

```
assets/deckkits/
├── core-primitives.kit.mjs     # 几何安全 + op 生成（所有 DeckKit 共用）
├── icon-assets.kit.mjs         # 固定 Tabler SVG bundle → add-image helper
├── consulting-dark.kit.mjs     # 深墨蓝咨询风格 + 页型函数
├── catalog.json                # DeckKit 注册表、版本、density 限制、验证记录
├── schemas/                    # content 和各页型 JSON Schema（渐进覆盖）
├── validate-content.mjs        # schema + fit 预检入口
├── examples/                   # 示例 content + build 胶水
└── README.md                   # 本文件
```

## core-primitives 职责边界

| 属于 core-primitives（几何安全 + op 生成）             | 不属于 core-primitives（视觉语言）         |
| ------------------------------------------------------ | ------------------------------------------ |
| `nm()`, `assertWithinSlide()`, `grid()`                | 调色板 `C`、具体颜色选择                   |
| `shape()`, `fill()`, `noLine()`, `thinLine()`          | 间距节奏（marginX, gridGap 的具体数值）    |
| `textbox()`, `setText()`, `runFont()`, `tx()`, `box()` | chrome 结构（topBar, footer 的高度/位置）  |
| `withFontFloor()`, `parseFontPt()`, `fontSizeValue()`  | 页型函数（heroSlide, kpiRowSlide 等）      |
| `contrastRatio()`, `readableTextOn()`, `isDarkColor()` | 组件外观（卡片圆角、accent bar 高度）      |
| `icon()`, `addTablerIconPicture()`                     | 具体图标语义选择（哪个 icon 表示某概念）   |
| `cardBox()`, `panelBox()`（结构骨架）                  | 组件内容布局（KPI 圆的位置、编号框的偏移） |
| content schema 校验引擎、fit diagnostics 框架          | 具体页型的 soft/hard limit 数值            |
| `assertWithinSlide` bounds check                       | stylePack/themePack 的选择和解析           |

**判断原则**：如果某段代码换了主题色/间距后仍然正确，它属于 primitives；如果它依赖具体的视觉决策，它属于 DeckKit。

## 校验合同

`validate-content.mjs`、DeckKit build 胶水和 benchmark CLI 都必须调用
`core-primitives.kit.mjs` 导出的同一个 `validateContent(content, { deckkit, mode })`。

`validateContent` 返回：

- `errors`：阻塞性 schema、catalog 或 fit 问题。
- `warnings`：非阻塞 density / fit / catalog 风险。
- `fitDiagnostics`：结构化容量诊断，包含 `slideIndex`、`slideType`、`severity`、`code`、
  `path`、`value`、`limit`、`blocking` 和 `suggestedActions`。
- `normalizedContent`：当前与输入一致，保留给后续规范化。

当前页型级 fit diagnostics 已覆盖 `heroSlide`、`kpiRowSlide`、`multiCardSlide`、
`benchmarkSlide`、`timelineSlide` 和 `askSlide`，并包含长 Latin token 风险检查。

`catalog.json` 可声明两类交付 gate：

- `layoutContract`：按 DeckKit / 页型声明必填数据槽位、任一满足槽位组、允许的
  `layoutId`、`customOps` 策略和 `assetSlots`。draft 默认给 warning，delivery 可通过
  `deliverySeverity` 升级为 error。
- `diversityGate`：按页型分组检查长 deck 的版式多样性、必需叙事组和连续重复组上限，
  避免整套 deck 退化成同一种卡片页。触发时的 `fitDiagnostics` 会同时给出
  `usedGroups`、`missingGroups`、`groupMembers` 和 `slideGroups`，因此 Agent 可以直接
  选择替代页型，不必另查 catalog。
- `visualGrammar`：声明 DeckKit 的视觉语言合同，包含定位、气质、布局原则、
  signature elements、字体/色彩节奏、composition rules 和 avoid 清单。它让 Agent 在
  选择 DeckKit 后知道"这套页面应该长什么样"，并在 readiness audit 中阻止缺少风格合同的
  production/default DeckKit 进入交付。

这些 gate 属于 DeckKit 元数据，不属于单个 deck 的临时 patch。新增或调整规则时优先修改
`catalog.json` 和 `core-primitives.kit.mjs`，让 `validate-content.mjs`、build 胶水和 benchmark
共享同一套判断。

`layoutContract.slideTypes.<slideType>.assetSlots` 是页型的图片槽位合同。它是一个以语义
slot id 为键的对象，每项至少说明 `kind`、`acceptsAsset` 和
`placeholderBehavior`，还可以给出 `labelSlot` / `captionSlot` 与 `note`。槽位参考会把
这些信息输出为单独的 Asset slots 表；当 `acceptsAsset` 为 `false` 时，该页型只会渲染
占位框，`content.json` 的 `imageSlots` 不能注入真实图片，校验器会在 delivery 模式阻止
这种误用。`acceptsAsset: true` 的页型通过 `assets_manifest.json` 解析 asset id；build
生成短的 `assetSource.path`，runner 再把 manifest 所在目录作为 `--asset-root` 传给 xdoc。
没有绑定时是否保留占位框由该页型自己的 `placeholderBehavior` 决定。

`visualGrammar` 不是运行时代码，也不替代页型函数、schema、layout contract 或 diversity gate。
它只约束 DeckKit 使用方式和内容创作方向：选中 DeckKit 后，把 `positioning` 用作风格判断，
用 `signatureElements` 和 `compositionRules` 指导页面构成，用 `avoid` 拦截不匹配的视觉选择。
不要因为有 visual grammar 就在 content 里塞 `customOps` 或临时坐标。

## 使用方式

```bash
node <skill-root>/scripts/pptx-nova-deckkit-slots.mjs \
  --deckkit consulting-dark \
  > deckkit-slots.md

node <skill-root>/assets/deckkits/validate-content.mjs \
  content.json \
  --deckkit consulting-dark \
  --mode delivery

node <skill-root>/scripts/pptx-nova-build.mjs \
  --deckkit consulting-dark \
  content.json \
  -o patch.json \
  --quality-json quality.json
```

不要为普通交付手写每次一份的 `build.mjs`。只有在开发或调试 DeckKit 本身时，才临时导入
`.kit.mjs` 调用 `createDeck(content)`。

## 图标使用

DeckKit 需要 Tabler 图标时，使用 `createOps()` 返回的 `icon()` 或直接使用
`icon-assets.kit.mjs`。它只读取 `../icons/tabler-icons.pack.br`，并把 SVG
内联为 `add-image` 的 `bytesBase64 + mimeType`，不依赖网络、临时 SVG 文件或 Tabler
源码目录：

```js
const p = createOps()
p.addSlide(0, '0B1020')
p.icon(0, 'S0_StatusIcon', 'chart-line', 0.72, 0.72, 0.28, 0.28, {
  color: 'C8583A',
})
```

查找图标时使用 agent 入口，避免把全量 SVG 读入上下文：

```bash
node <skill-root>/scripts/pptx-nova-icons.mjs search "analytics dashboard" --style outline --limit 12 --json
node <skill-root>/scripts/pptx-nova-icons.mjs get chart-line users presentation --style outline --json
```

图标包覆盖 Tabler `outline` 和 `filled` 全量图标。刷新 pack 与 license 时运行
`node <skill-root>/scripts/pptx-nova-icons.mjs generate` 和
`node <skill-root>/scripts/pptx-nova-icons.mjs generate --check`。

## 版本规则（semver）

| 修改类型                                                      | 版本  |
| ------------------------------------------------------------- | ----- |
| 修复 DeckKit 逻辑 bug；放宽过严校验（不影响已验证样例）       | patch |
| 新增页型或可选字段；放宽验证（接受更多输入）                  | minor |
| 删除/重命名字段；收紧验证（拒绝原来合法的输入）；改变布局容量 | major |

## 冻结准入

1. `validate-content` 通过，只有可解释的非阻塞 warning
2. `pptx-nova-build.mjs` 可重复生成稳定 patch 和 `quality.json`
3. DeckKit benchmark 的 repo-indexed cases 全部通过；新 kit 至少要有 golden case，stress /
   mixed-language 可在 `.tmp` 做审查而不入库
4. `node <skill-root>/scripts/pptx-nova-deckkit-readiness.mjs --deckkit <id> --target candidate --benchmark-mode required-live` 通过
5. `xdoc pptx apply --dry-run --json` 通过
6. `xdoc pptx vision-check out.pptx --json` 的 high/medium 为 0
7. PNG contact sheet 和逐页检查通过
8. catalog 记录版本、visual grammar、验证命令、示例路径和已知限制

当前 readiness audit 会明确报告 candidate / delivery / default 三个结论。
benchmark CLI 已接入逐页 PNG 与 contact-sheet 机器 gate；人工视觉复核、
catalog 质量字段和已知限制仍需补齐后，才能把 DeckKit 提升为 `production`
或 `default`。

## Catalog 质量元数据回写

benchmark 通过后，用 catalog update 工具把机器可证明的结果写回
`assets/deckkits/catalog.json`：

```bash
node <skill-root>/scripts/pptx-nova-deckkit-catalog-update.mjs \
  --deckkit consulting-dark \
  --write
```

该命令只更新 `quality.lastBenchmark`、`quality.vision` 和
`quality.benchmark`，默认不改变 `readiness`，也不会把人工 PNG review
结果假定为通过。人工复核完成后，再显式写入 hard defect 数：

```bash
node <skill-root>/scripts/pptx-nova-deckkit-catalog-update.mjs \
  --deckkit consulting-dark \
  --manual-hard-defects 0 \
  --write
```

只有逐页 PNG 和 contact sheet 人工检查完成、`manualHardDefects=0`、benchmark
和 vision gate 均通过后，才可以带 `--readiness production` 或
`--readiness default`，且必须同时带 `--confirm-manual-png-review`。否则工具会拒绝
promotion。

## 新增 DeckKit 流程

1. 从已验证的 gen.mjs 抽取视觉语言和页型 → `<name>.kit.mjs`
2. 把内容数据 → `examples/<name>-content.json`
3. 写 `schemas/<name>/<slideType>.schema.json` 和 slot budget
4. 跑验证矩阵（文本长度 × 语言 × 密度 × 主题 × 页数 × 页型组合）
5. 在 `catalog.json` 注册
