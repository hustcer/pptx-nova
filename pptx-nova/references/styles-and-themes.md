# 颜色、字体、主题、母版

PPTX 的视觉风格由四个层次决定：**theme（主题）→ master（母版）→ layout（版式）→ slide**。
xdoc 让这四层都能改，从最上到最下成本递增 — 优先在 theme 层改，影响最广、最便宜。

## 颜色

### 直接颜色

所有 `color` 字段都接受 6 位十六进制，可选 `#` 前缀：

```
"color": "1A73E8"      // 推荐
"color": "#1A73E8"     // 也行
"color": "1a73e8"      // 大小写不敏感
```

### 主题色引用

任何 fill 里都可以引用主题色（不写死 RGB，跟着主题走）：

```json
"fill": {
  "type": "solid",
  "schemeClr": "accent1",
  "lumMod": 0.8,
  "lumOff": 0.2
}
```

`schemeClr` 取值：`lt1 / dk1 / lt2 / dk2 / accent1..6 / hlink / folHlink / bg1 / bg2 / tx1 / tx2`。
`lumMod` / `lumOff` 控制亮度调整（百分比，0-1）。

## Fill（填充）

`set-shape` / `set-slide-background` 的 `fill` 与 `set-master` 的 `background` 都接受同一种 fill 对象：

### Solid

```json
{ "type": "solid", "color": "1A73E8" }
```

### Gradient

```json
{
  "type": "gradient",
  "angle": 45,
  "stops": [
    { "pos": 0, "color": "1A73E8" },
    { "pos": 0.5, "schemeClr": "accent2" },
    { "pos": 1, "color": "FFFFFF" }
  ]
}
```

`pos` 范围 `[0, 1]`；`angle` 度数（0 = 上→下）。stop 可以混用 `color` 与 `schemeClr`。

### Radial gradient

需要径向光晕或 spotlight 时，优先用原生 radial gradient fill，而不是嵌入 SVG 或整页位图。
当前 patch 层用普通 gradient fill 加 `path: "circle"` 表达径向渐变，会写入 DrawingML path gradient，仍保持可编辑：

```json
{
  "type": "gradient",
  "path": "circle",
  "fillToRect": { "l": 0.5, "t": 0.5, "r": 0.5, "b": 0.5 },
  "stops": [
    { "pos": 0, "color": "F1EE2E" },
    { "pos": 0.72, "color": { "rgb": "F8F39B", "alpha": 0.42 } },
    { "pos": 1, "color": { "rgb": "F0DA7C", "alpha": 0 } }
  ]
}
```

`fillToRect` 控制焦点/扩散区域；不确定当前 xdoc 版本的字段时先跑
`xdoc schema --op set-shape --minimal`。

### Preset Gradient（24 个内置）

```json
{ "type": "gradient", "preset": "daybreak" }
```

预设清单跑 `xdoc schema | jq '.commands.pptx.catalogs.presetGradients'` 取。常用：
`early-sunset / daybreak / horizon / ocean / chrome / silver / sapphire`。

### Pattern

```json
{
  "type": "pattern",
  "pattern": "wdDnDiag",
  "foregroundColor": "1A73E8",
  "backgroundColor": "FFFFFF"
}
```

`preset` 是 OOXML pattern name（`pct5 / pct10 / dkHorizontal / wdDnDiag / cross / shingle` 等）。

### No fill

```json
{ "type": "none" }
```

## Line（边框）

```json
{
  "op": "set-shape",
  "slide": 0,
  "shape": { "id": 2 },
  "line": {
    "width": "1pt",
    "color": "1A73E8",
    "dash": "dash"
  }
}
```

`dash` 取值：`solid / dot / dash / lgDash / dashDot / lgDashDot / lgDashDotDot / sysDash / sysDot / sysDashDot / sysDashDotDot`。

清掉边框：

```json
{ "op": "set-shape", "slide": 0, "shape": {...}, "line": { "noLine": true } }
```

## 字体

### 单个 run 字体

```json
{
  "op": "set-run",
  "slide": 0,
  "shape": { "id": 2 },
  "paragraph": 0,
  "run": 0,
  "font": {
    "name": "Inter",
    "size": "16pt",
    "bold": true,
    "italic": false,
    "underline": "single",
    "color": "1F1F1F"
  }
}
```

字段说明：

| 字段              | 含义                                                              |
| ----------------- | ----------------------------------------------------------------- |
| `name`            | 字体族名（如 `Inter` / `Microsoft YaHei` / `Source Han Sans SC`） |
| `size`            | 优先使用 `"<n>pt"`；裸数字按通用 length 规则解释                  |
| `bold` / `italic` | 布尔                                                              |
| `underline`       | `none / single / double / wavy / heavy / ...`                     |
| `color`           | 字体颜色（6 位 hex）                                              |
| `fill`            | 用 fill 对象（gradient/pattern）填字符                            |

### Theme 字体（一改全改）

```json
{
  "op": "set-theme",
  "fonts": {
    "major": { "typeface": "Inter" },
    "minor": { "typeface": "Source Han Sans SC", "eastAsian": "Source Han Sans SC" }
  }
}
```

- `fonts.major` = 主题大标题字体（默认绑定到 placeholder type=title）
- `fonts.minor` = 主题正文字体（默认绑定到所有 body / content）
- `typeface` 指定拉丁字符字体，`eastAsian` / `complexScript` 分别指定东亚 / 复杂书写系统字符的字体（让中文/英文分别用不同字体）

### CJK 字体注意

PowerPoint 在中英混排时会根据字符类型选择拉丁（`typeface`）或东亚（`eastAsian`）字体。若你想中英都用一种字体：

```json
{
  "op": "set-theme",
  "fonts": {
    "minor": { "typeface": "Inter", "eastAsian": "Source Han Sans SC" }
  }
}
```

某些字体（如 `Inter`）只覆盖拉丁字符，中文会 fallback；显式设 `eastAsian` 才能保证中文也用指定字体。

### 字体栈质量策略

字体策略要同时服务设计气质和交付稳定性。不要只写一个看起来高级但用户机器上可能没有的字体名；
`deck_lock.typography` 中的标题、正文、代码等栈应包含可用 fallback，正式交付时再用
`check-lock --strict-fonts` 防止 patch 引入锁外字体。

实用规则：

- 每个主要字体栈至少包含一个常见 PowerPoint 可用字体。CJK 常用 `Microsoft YaHei` /
  `SimHei` / `SimSun` / `KaiTi`；Latin 常用 `Arial` / `Calibri` / `Segoe UI` /
  `Georgia` / `Times New Roman`；代码用 `Consolas` / `Courier New`。
- 标题和正文可以形成“同族不同权重”或“明确对比”（serif × sans、display × neutral）。
  避免标题用 `Microsoft YaHei`、正文用 `PingFang SC` 这类相似但不相同的组合；它们更适合
  出现在同一个 fallback 栈中，而不是分任两个视觉角色。
- 品牌字体、Google Fonts 或本机未必安装的字体可以放在栈首，但必须写 fallback；如果客户要求
  严格品牌字体，最终摘要要说明字体安装/嵌入风险。
- 不要把字体选择藏在零散 `set-run` 里。优先用 `set-theme`、master placeholder style 或
  DeckKit token 统一角色字体；单个 run 只处理局部强调。

### 权重后缀字体名（`Inter Black` / `Barlow Light` / `Roboto Medium`...）

OOXML 允许在 `typeface` 里直接写带权重后缀的字体名（设计师常这么用）。xdoc 现在
会识别这种命名，把它拆成 **base family + weight**，并在 PDF 导出时拉对应的 Google
Fonts 权重子集:

| 后缀                 | weight |
| -------------------- | ------ |
| `Thin`               | 100    |
| `ExtraLight`         | 200    |
| `Light`              | 300    |
| (无后缀) / `Regular` | 400    |
| `Medium`             | 500    |
| `SemiBold`           | 600    |
| `Bold`               | 700    |
| `ExtraBold`          | 800    |
| `Black`              | 900    |

```json
{
  "op": "set-run",
  "slide": 0,
  "shape": { "id": 2 },
  "paragraph": 0,
  "run": 0,
  "font": { "name": "Barlow Black", "size": "54pt" }
}
```

PDF 导出会自动拉 `Barlow` 的 `wght=900` 子集；浏览器 viewer 也会把 `Barlow Black`
当成 `Barlow` family + `font-weight: 900`。

> 旧版（< `8d10d8ec`）总是拉 Regular 权重,Bold/Light 等带后缀的字体在 PDF 里
> 会被静默回退到 400。如果用户报告"导出的 PDF 字重不对",先确认 xdoc 版本。

### PDF 导出的 bold / italic 现在正确解析

`pdfFontResolver` 会扫描所有 run / shape / table cell / math element,为每个 family
建一个 `Set<style>`(regular / bold / italic / boldItalic),然后**逐 style** 拉
Google Fonts 子集(`ital,wght@1,400` 等坐标),写入 PDF。

```json
{
  "op": "set-run",
  "slide": 0,
  "shape": { "id": 2 },
  "paragraph": 0,
  "run": 0,
  "font": { "name": "Inter", "bold": true, "italic": true }
}
```

上面这种 boldItalic 组合在旧版 PDF 里会回退到 regular(无粗体也无斜体)。现在
正确显示。**注意**: 浏览器 viewer 一直支持,这条修复只针对 PDF 导出路径。

如果用了**离线字体缓存**(`cache/<family>/<style>.ttf`),xdoc 会按 style 拼文件
名:`bold.ttf` / `italic.ttf` / `bold_italic.ttf`。缺哪种 style 哪种 style 回退
到 regular。

## Theme color（主题色一键改）

```json
{ "op": "set-theme", "colors": { "accent1": "1A73E8" } }
```

所有引用 `accent1` 的 shape / chart / placeholder 都会跟着变。**最便宜的改色方式**。

如果只想改某些 shape 不动 theme：

```json
{ "op": "set-shape", "slide": 0, "shape": {...}, "fill": { "type": "solid", "color": "1A73E8" } }
```

## 整 deck 换肤：remap-theme

已有 deck 翻新优先用 `remap-theme` 做批量换肤，再用单对象 patch 补漏。它会编译为
`remap-theme` patch op，当前可覆盖 text、普通 shape、table 和 chart 的基础颜色/字体 remap。
翻新时必须显式传全 scope，避免 table/chart 保留旧样式：

```bash
xdoc pptx remap-theme clean.pptx \
  --to corporate-blue \
  --scope text,shapes,tables,charts \
  --output remapped.pptx \
  --dry-run \
  --json
```

查看 dry-run 的 `opResults[].analysis`：`changed` 是已换肤对象，`preserved` 可能是语义色、
亮度变换或截图真实像素，`skipped` / `unsupported` 需要判断是合理保留还是旧风格残留。不要为了
统一视觉覆盖 chart 数据、table 数据、category label、notes 或截图真实像素；需要保留的语义色要写入
`content-audit.json` 或 `deck_lock.assumptions[]`。

## Background（背景）

### Slide-level（单页）

```json
{
  "op": "set-slide-background",
  "slide": 0,
  "fill": { "type": "solid", "color": "F5F7FA" },
  "followMaster": false
}
```

`followMaster: true` 表示用 master 背景（即使 slide 自己有 `<p:bg>` 也忽略）。

### Master-level（整个 deck）

```json
{
  "op": "set-master",
  "background": { "type": "gradient", "preset": "daybreak" }
}
```

可选 `master: <index>` 指定哪个 master（不指定 = 第一个）。

## Master placeholder style（整个 deck 的标题/正文默认）

```json
{
  "op": "set-master",
  "placeholders": [
    {
      "type": "title",
      "font": { "name": "Inter", "size": "32pt", "bold": true },
      "color": "1F1F1F",
      "spacing": 1.15,
      "alignment": "left"
    }
  ]
}
```

`type` 取值与 placeholder 的 type 一致（`title` / `body` / `ctrTitle` / `subTitle` /
`object` / `chart` / ...）。

## Shape effect（阴影、发光、反射、柔化）

```json
{
  "op": "set-shape",
  "slide": 0,
  "shape": { "id": 2 },
  "effect": {
    "shadow": {
      "blur": "6pt",
      "distance": "4pt",
      "angle": 45,
      "color": "000000",
      "alpha": 0.25
    }
  }
}
```

在 `effect` 中使用 `shadow` / `glow` / `reflection` / `softEdge` 子对象。
每种 effect 有自己的参数：

| effect     | 关键参数                                               |
| ---------- | ------------------------------------------------------ |
| shadow     | `blur`, `distance`, `angle`, `color`, `alpha`, `inner` |
| glow       | `radius`, `color`, `alpha`                             |
| reflection | `blur`, `distance`, `alpha`, `size`                    |
| softEdge   | `radius`                                               |

颜色使用 6 位 hex；透明度单独用 `alpha` 的 0-1 数值。

## Effect 继承开关

shape 可以选择继承 master/layout effect：

```json
{ "op": "set-shape", "slide": 0, "shape": {...}, "effect": { "inherit": true } }
```

`inherit: true` 让 shape 走 master/layout `<a:effectLst>` 继承链；不写或 `inherit: false`
就用 shape 自己的 effect。

## 一键品牌改装（推荐组合）

主题色与字体使用 canonical `set-theme`；需要按 theme pack 重映射现有对象时使用
`remap-theme`：

```json
{
  "op": "set-theme",
  "colors": {
    "accent1": "1A73E8",
    "accent2": "34A853",
    "accent3": "FBBC04",
    "accent4": "EA4335",
    "dk1": "1F1F1F",
    "lt1": "FFFFFF"
  },
  "fonts": {
    "major": { "typeface": "Inter" },
    "minor": { "typeface": "Inter" }
  }
}
```

背景、母版 placeholder 与 presentation 默认文本样式继续使用当前 schema 披露的
`set-master` / `set-slide-background` / 文本样式 op；不要再生成已删除的 rebrand alias。

## 检查改对了

写完样式 patch 一定要：

1. `--dry-run --json` 看 `semanticChanges[]` 是不是覆盖了所有目标 slide
2. apply 后 `xdoc convert out.pptx --to png -o previews --overwrite` 转 PNG，肉眼确认
3. 重要场合用 `xdoc pptx check-brand` 校验品牌合规（见 `data-driven.md`）

## 不要做的事

- ❌ 不要在 `set-theme` 的 `colors` 上加 `slide` 字段（主题色是 deck 级，不属于某页）
- ❌ 不要拆成多个 op 改同一个 shape 的 fill/line/effect — 一个 `set-shape` 里可同时设置且原子生效
- ❌ 不要假定 deck 的 master 名是固定的 — 用 `inspect` 查一下
- ❌ 不要用 `set-theme` 的 `fonts` 改单个 run 字体 — 那是 `set-run.font.name`
