# 颜色、字体、主题、母版

PPTX 的视觉风格由四个层次决定：**theme（主题）→ master（母版）→ layout（版式）→ slide**。
s8fy 让这四层都能改，从最上到最下成本递增 — 优先在 theme 层改，影响最广、最便宜。

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
  "kind": "solid",
  "schemeClr": "accent1",
  "lumMod": 0.8,
  "lumOff": 0.2
}
```

`schemeClr` 取值：`lt1 / dk1 / lt2 / dk2 / accent1..6 / hlink / folHlink / bg1 / bg2 / tx1 / tx2`。
`lumMod` / `lumOff` 控制亮度调整（百分比，0-1）。

## Fill（填充）

`set-shape-fill` / `set-slide-background` / `set-master-bg` 都接受同一种 fill 对象：

### Solid

```json
{ "kind": "solid", "color": "1A73E8" }
```

### Gradient

```json
{
  "kind": "gradient",
  "angle": 45,
  "stops": [
    { "pos": 0, "color": "1A73E8" },
    { "pos": 0.5, "schemeClr": "accent2" },
    { "pos": 1, "color": "FFFFFF" }
  ]
}
```

`pos` 范围 `[0, 1]`；`angle` 度数（0 = 上→下）。stop 可以混用 `color` 与 `schemeClr`。

### Preset Gradient（24 个内置）

```json
{ "kind": "gradient", "preset": "topSpotlight1" }
```

预设清单跑 `s8fy schema | jq '.commands.pptx.catalogs.presetGradients'` 取。常用：
`topSpotlight1 / centerSpotlight / horizon / shadowDark / chrome`。

### Pattern

```json
{
  "kind": "pattern",
  "preset": "wdDnDiag",
  "fg": "1A73E8",
  "bg": "FFFFFF"
}
```

`preset` 是 OOXML pattern name（`pct5 / pct10 / dkHorizontal / wdDnDiag / cross / shingle` 等）。

### No fill

```json
{ "kind": "none" }
```

## Line（边框）

```json
{
  "op": "set-shape-line",
  "slide": 0,
  "shape": { "id": "..." },
  "line": "1pt",
  "color": "1A73E8",
  "dash": "dash"
}
```

`dash` 取值：`solid / dot / dash / lgDash / dashDot / lgDashDot / lgDashDotDot / sysDash / sysDot / sysDashDot / sysDashDotDot`。

清掉边框：

```json
{ "op": "set-shape-line", "slide": 0, "shape": {...}, "noLine": true }
```

## 字体

### 单个 run 字体

```json
{
  "op": "set-run",
  "slide": 0,
  "shape": { "id": "..." },
  "paragraph": 0,
  "run": 0,
  "font": {
    "name": "Inter",
    "size": "16pt",
    "bold": true,
    "italic": false,
    "underline": "single",
    "color": "1F1F1F",
    "highlight": "FFFF00",
    "strike": "single"
  }
}
```

字段说明：

| 字段              | 含义                                                              |
| ----------------- | ----------------------------------------------------------------- |
| `name`            | 字体族名（如 `Inter` / `Microsoft YaHei` / `Source Han Sans SC`） |
| `size`            | `"<n>pt"` 或裸数字（=半磅）                                       |
| `bold` / `italic` | 布尔                                                              |
| `underline`       | `none / single / double / wavy / heavy / ...`                     |
| `strike`          | `none / single / double`                                          |
| `color`           | 字体颜色（hex 或 schemeClr）                                      |
| `highlight`       | 高亮色                                                            |
| `fill`            | 用 fill 对象（gradient/pattern）填字符                            |

### Theme 字体（一改全改）

```json
{ "op": "set-theme-font", "kind": "majorFont", "typeface": "Inter" }
{ "op": "set-theme-font", "kind": "minorFont", "typeface": "Source Han Sans SC", "ea": "Source Han Sans SC" }
```

- `majorFont` = 主题大标题字体（默认绑定到 placeholder type=title）
- `minorFont` = 主题正文字体（默认绑定到所有 body / content）
- `ea` / `cs` / `latin` 分别指定东亚 / 复杂书写系统 / 拉丁字符的字体（让中文/英文分别用不同字体）

### CJK 字体注意

PowerPoint 在中英混排时会根据字符类型选择 `latin` 或 `ea` 字体。若你想中英都用一种字体：

```json
{
  "op": "set-theme-font",
  "kind": "minorFont",
  "typeface": "Inter",
  "ea": "Source Han Sans SC"
}
```

某些字体（如 `Inter`）只覆盖拉丁字符，中文会 fallback；显式设 `ea` 才能保证中文也用指定字体。

### 权重后缀字体名（`Inter Black` / `Barlow Light` / `Roboto Medium`...）

OOXML 允许在 `typeface` 里直接写带权重后缀的字体名（设计师常这么用）。s8fy 现在
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
  "shape": { "id": "title-1" },
  "paragraph": 0,
  "run": 0,
  "font": { "name": "Barlow Black", "size": "54pt" }
}
```

PDF 导出会自动拉 `Barlow` 的 `wght=900` 子集；浏览器 viewer 也会把 `Barlow Black`
当成 `Barlow` family + `font-weight: 900`。

> 旧版（< `8d10d8ec`）总是拉 Regular 权重,Bold/Light 等带后缀的字体在 PDF 里
> 会被静默回退到 400。如果用户报告"导出的 PDF 字重不对",先确认 s8fy 版本。

### PDF 导出的 bold / italic 现在正确解析

`pdfFontResolver` 会扫描所有 run / shape / table cell / math element,为每个 family
建一个 `Set<style>`(regular / bold / italic / boldItalic),然后**逐 style** 拉
Google Fonts 子集(`ital,wght@1,400` 等坐标),写入 PDF。

```json
{
  "op": "set-run",
  "slide": 0,
  "shape": { "id": "..." },
  "paragraph": 0,
  "run": 0,
  "font": { "name": "Inter", "bold": true, "italic": true }
}
```

上面这种 boldItalic 组合在旧版 PDF 里会回退到 regular(无粗体也无斜体)。现在
正确显示。**注意**: 浏览器 viewer 一直支持,这条修复只针对 PDF 导出路径。

如果用了**离线字体缓存**(`cache/<family>/<style>.ttf`),s8fy 会按 style 拼文件
名:`bold.ttf` / `italic.ttf` / `bold_italic.ttf`。缺哪种 style 哪种 style 回退
到 regular。

## Theme color（主题色一键改）

```json
{ "op": "set-theme-color", "scheme": "accent1", "value": "1A73E8" }
```

所有引用 `accent1` 的 shape / chart / placeholder 都会跟着变。**最便宜的改色方式**。

如果只想改某些 shape 不动 theme：

```json
{ "op": "set-shape-fill", "slide": 0, "shape": {...}, "fill": { "kind": "solid", "color": "1A73E8" } }
```

## Background（背景）

### Slide-level（单页）

```json
{
  "op": "set-slide-background",
  "slide": 0,
  "fill": { "kind": "solid", "color": "F5F7FA" },
  "followMaster": false
}
```

`followMaster: true` 表示用 master 背景（即使 slide 自己有 `<p:bg>` 也忽略）。

### Master-level（整个 deck）

```json
{
  "op": "set-master-bg",
  "fill": { "kind": "gradient", "preset": "topSpotlight1" }
}
```

可选 `master: <index>` 指定哪个 master（不指定 = 第一个）。

## Master placeholder style（整个 deck 的标题/正文默认）

```json
{
  "op": "set-master-placeholder-style",
  "type": "title",
  "font": { "name": "Inter", "size": "32pt", "bold": true },
  "color": "1F1F1F",
  "spacing": { "before": "6pt", "after": "12pt", "line": 1.15 },
  "alignment": "left"
}
```

`type` 取值与 placeholder 的 type 一致（`title` / `body` / `ctrTitle` / `subTitle` /
`obj` / `chart` / ...）。

## Shape effect（阴影、发光、反射、柔化）

```json
{
  "op": "set-shape-effect",
  "slide": 0,
  "shape": { "id": "..." },
  "effect": {
    "kind": "outerShadow",
    "blur": "6pt",
    "distance": "4pt",
    "direction": 45,
    "color": "00000040"
  }
}
```

`kind` 可选 `outerShadow / innerShadow / glow / reflection / softEdge`。每种 effect
有自己的参数：

| kind                      | 关键参数                                                      |
| ------------------------- | ------------------------------------------------------------- |
| outerShadow / innerShadow | `blur`, `distance`, `direction`, `color`, `alpha`             |
| glow                      | `radius`, `color`                                             |
| reflection                | `blur`, `distance`, `startAlpha`, `endAlpha`, `fadeDirection` |
| softEdge                  | `radius`                                                      |

颜色支持 8 位 hex 带 alpha：`"00000040"` = 黑色 25% 不透明。

## Effect 继承开关

shape 可以选择继承 master/layout effect：

```json
{ "op": "set-shape-effect", "slide": 0, "shape": {...}, "effect": { "inherit": true } }
```

`inherit: true` 让 shape 走 master/layout `<a:effectLst>` 继承链；不写或 `inherit: false`
就用 shape 自己的 effect。

## 一键品牌改装（推荐组合）

参见 `recipes.md` 的 `apply-corporate-rebrand`：

```json
{
  "op": "apply-corporate-rebrand",
  "colors": {
    "accent1": "1A73E8",
    "accent2": "34A853",
    "accent3": "FBBC04",
    "accent4": "EA4335",
    "dk1": "1F1F1F",
    "lt1": "FFFFFF"
  },
  "fonts": { "major": "Inter", "minor": "Inter", "heading": "Inter" },
  "background": "FFFFFF",
  "titleStyle": { "size": "32pt", "bold": true, "color": "1F1F1F" },
  "bodyStyle": { "size": "16pt", "color": "1F1F1F" }
}
```

这一条 recipe op 会展开成多个 `set-theme-color / set-theme-font / set-master-bg /
set-master-placeholder-style / set-presentation-default-text-style` 底层 op。

## 检查改对了

写完样式 patch 一定要：

1. `--dry-run --json` 看 `semanticChanges[]` 是不是覆盖了所有目标 slide
2. apply 后 `s8fy convert out.pptx --to png -o previews --overwrite` 转 PNG，肉眼确认
3. 重要场合用 `s8fy pptx check-brand` 校验品牌合规（见 `data-driven.md`）

## 不要做的事

- ❌ 不要在 `set-theme-color` 上加 `slide` 字段（主题色是 deck 级，不属于某页）
- ❌ 不要给同一个 shape 同时写 `set-shape-fill` 和 `set-shape-effect` 期望叠加 — 它们独立
- ❌ 不要假定 deck 的 master 名是固定的 — 用 `inspect` 查一下
- ❌ 不要用 `set-theme-font` 改单个 run 字体 — 那是 `set-run.font.name`
