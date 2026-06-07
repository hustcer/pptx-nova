# DeckKits

经过验证矩阵通过后冻结的 DeckKit，用于 pptx-nova 的“DeckKit 模式”二次创作快路径。

## 目录结构

```
assets/deckkits/
├── core-primitives.kit.mjs     # 几何安全 + op 生成（所有 DeckKit 共用）
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
| `cardBox()`, `panelBox()`（结构骨架）                  | 组件内容布局（KPI 圆的位置、编号框的偏移） |
| content schema 校验引擎、fit diagnostics 框架          | 具体页型的 soft/hard limit 数值            |
| `assertWithinSlide` bounds check                       | stylePack/themePack 的选择和解析           |

**判断原则**：如果某段代码换了主题色/间距后仍然正确，它属于 primitives；如果它依赖具体的视觉决策，它属于 DeckKit。

## 使用方式

```js
// build.mjs（每个 deck 一份，~15 行）
import { loadContent, validateContent } from './assets/deckkits/core-primitives.kit.mjs'
import { createDeck } from './assets/deckkits/consulting-dark.kit.mjs'

const deckkitId = 'consulting-dark'
const content = await loadContent(process.argv[2] ?? 'content.json')
validateContent(content, { deckkit: deckkitId, throwOnError: true })
const { patch, warnings } = createDeck(content)
for (const w of warnings) console.error(`[warning] ${w.message}`)
process.stdout.write(JSON.stringify(patch))
```

## 版本规则（semver）

| 修改类型                                                      | 版本  |
| ------------------------------------------------------------- | ----- |
| 修复 DeckKit 逻辑 bug；放宽过严校验（不影响已验证样例）       | patch |
| 新增页型或可选字段；放宽验证（接受更多输入）                  | minor |
| 删除/重命名字段；收紧验证（拒绝原来合法的输入）；改变布局容量 | major |

## 冻结准入

1. `validate-content` 通过，只有可解释的非阻塞 warning
2. `node build.mjs > patch.json` 可重复生成稳定 patch
3. DeckKit benchmark 的 golden / stress / mixed-language cases 全部通过
4. `node tools/pptx-nova-deckkit-readiness.mjs --deckkit <id> --target candidate` 通过
5. `s8fy pptx apply --dry-run --json` 通过
6. `s8fy pptx vision-check out.pptx --json` 的 high/medium 为 0
7. PNG contact sheet 和逐页检查通过
8. catalog 记录版本、验证命令、示例路径和已知限制

当前 readiness audit 会明确报告 candidate / delivery / default 三个结论。
在 benchmark CLI 尚未接入 PNG/contact-sheet 真实 gate 前，不要把 DeckKit 自动提升为
`production` 或 `default`。

## 新增 DeckKit 流程

1. 从已验证的 gen.mjs 抽取视觉语言和页型 → `<name>.kit.mjs`
2. 把内容数据 → `examples/<name>-content.json`
3. 写 `examples/<name>-build.mjs` 胶水
4. 跑验证矩阵（文本长度 × 语言 × 密度 × 主题 × 页数 × 页型组合）
5. 在 `catalog.json` 注册
