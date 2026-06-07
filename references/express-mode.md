# Express Mode —— 简单 prompt 一键出客户演示级 deck

> 用户给一句话 / 几句话的 prompt 时的**默认创建路径**：自动走完
> outline → 选风格 → JS 生成器 → dry-run → vision-check 闭环 → PNG 复核，
> 最小确认、零手算坐标。
>
> **express ≠ 草稿**：它默认也按客户演示级（200-300 ops）产出，只是把
> SKILL §6 的完整工作流自动串起来、不逐项追问。要草稿请明说「简单/速记版」。

## 目录

1. [何时用 Express（vs Studio / Edit）](#1-何时用-expressvs-studio--edit)
2. [Express 黄金路径（自动化 9 步）](#2-express-黄金路径自动化-9-步)
3. [prompt → outline → 生成器](#3-prompt--outline--生成器)
4. [风格选择（themePack / stylePack）](#4-风格选择themepack--stylepack)
5. [质量门与丰富度](#5-质量门与丰富度)
6. [vision-check 自动闭环](#6-vision-check-自动闭环)
7. [最小确认策略](#7-最小确认策略)
8. [升级信号：何时转 Studio / Edit](#8-升级信号何时转-studio--edit)

---

## 1. 何时用 Express（vs Studio / Edit）

| 信号                                                   | 走哪个模式  | 去向                                               |
| ------------------------------------------------------ | ----------- | -------------------------------------------------- |
| 简单 prompt、要快、没给细节（"做一份 Q2 业务回顾"）    | **Express** | 本文档                                             |
| 要像素级控制 / 自定义形状 / 复杂 chart 样式 / 投资人级 | **Studio**  | SKILL §1 + §9 + `deck-generator-workflow.md`       |
| 指定品牌 profile / 要做品牌合规检查                    | **Studio**  | SKILL §4 + `recipes.md`（apply-corporate-rebrand） |
| 改已有 `.pptx`（增删改某页/某对象/换数据）             | **Edit**    | SKILL §2 + `inspect-and-edit.md`                   |

Express 和 Studio 共用同一套生成器与 op，区别只在 **ceremony**：express 自动选默认、
最小确认、自动闭环；studio 让你逐项控制。中途发现需要精控，随时按 §8 升级，不用重来。

### DeckKit 快路径（同套件二次创作）

如果目标场景已有冻结的 DeckKit（检查 `assets/deckkits/catalog.json`），Express 可走
更短的 **DeckKit 模式** 路径：不写 generator，只写 content manifest。

```
prompt → outline → content.json（~200 行纯数据）
  → validate-content.mjs 校验
  → createDeck(content) 生成 patch
  → dry-run → vision-check → PNG
```

判断条件：`catalog.json` 中存在匹配的 `id` 且其 `supportedSlideTypes` 覆盖
outline 所需的全部页型。不满足时回退到标准 generator 路径。

详见 `deck-generator-workflow.md`「二次创作快路径」和 SKILL.md §1.4。

---

## 2. Express 黄金路径（自动化 9 步）

```bash
# 0. 从 prompt 提炼 deckBrief（主题/受众/页数/语气/数据/风格）→ 见 §3、§7
# 1. 复制生成器模板起步
cp skills/pptx-nova/assets/examples/deck-generator-template.mjs generate.mjs
#    按 §3 改三处：theme/style 参数 / slide 函数内容 / TOTAL 页数

# 2. 生成 patch（生成器输出 { schemaVersion:1, ops } envelope）
node generate.mjs --theme corporate-blue --style consulting > patch.json

# 3. 丰富度自检（客户演示级目标 ≥200 ops，见 §5）
jq '.ops | length' patch.json

# 4. dry-run 预演（多步默认 --daemon；--explain 拿字段约束）
s8fy pptx apply -p patch.json -o out.pptx --daemon --dry-run --json | save dry.json
#    读 semanticChanges[] / visualRisks[] / resolvedSelectors[]

# 5. 自动修复：合并 autoRetry==true 的 fixPatch 重跑 dry-run（见 troubleshooting.md）
#    ambiguous selector / fuzzy enum / RGB 规整 等机器有信心的修复直接合

# 6. 真 apply（去掉 --dry-run，留 sidecar out.pptx.s8fy.json）
s8fy pptx apply -p patch.json -o out.pptx --daemon --overwrite

# 7. 几何自检闭环（render-free，见 §6）
s8fy pptx vision-check out.pptx --json | save vision.json
#    合并 autoRetry 的 fixPatch → 人工处理剩余 medium/high → 再 vision-check 到 medium/high 清零

# 8. 转 PNG 像素复核（对比度/装饰挡标题等几何看不到的，见 §5 与 SKILL §9.6）
s8fy convert out.pptx --to png -o previews/ --overwrite
#    逐页检查字符重叠、换行压字、截断、页脚/来源撞正文

# 9. 产出物：out.pptx + patch.json + dry.json + vision.json + previews/
```

三道闸门职责不重叠：**dry-run（语义）→ vision-check（几何，可自动闭环）→ PNG（像素）**。
创建型 deck 的 `vision-check` high/medium 都必须为 0；任何一道不过都回去改对应
slide 函数重跑，不要跳步、不要在没过闸门时声称完成。

---

## 3. prompt → outline → 生成器

### 3.1 outline 中间表示

把 prompt 先拆成一份结构化 outline（参考 `assets/examples/qbr-outline.json`），用页型 `kind`
描述每页。该示例用到的 5 种 `kind`：

| `kind`    | 用途         | 关键字段                            |
| --------- | ------------ | ----------------------------------- |
| `title`   | 封面 / 扉页  | `title` / `subtitle`                |
| `section` | 章节分割     | `title` / `subtitle` / `eyebrow`    |
| `kpi`     | KPI 卡片网格 | `items[].{label,value,delta}`       |
| `two-col` | 左右对照     | `left/right.{heading,text,bullets}` |
| `compare` | 比较表格     | `headers[]` / `rows[][]`            |

outline 顶层还带 `out`（输出路径）和 `themePack` / `stylePack`（如 `corporate-blue` /
`consulting`）。主题色、字体、底色、字号节奏先从 themePack/stylePack 派生；用户给了
`rebrand.{colors,fonts,background}` 时再覆盖并走 `apply-corporate-rebrand`。`kind` 是页型意图、不强制枚举——
每页写一个 slide 函数即可；模板已含 8 个同型示例可改：`slideCover` / `slideAgenda` / `slideKPI` /
`slideChart` / `slideTable` / `slidePillars`（多列支柱）/ `slideWorkflow` / `slideHero`（全色收尾），
挑最接近的页型改内容。

### 3.2 套生成器模板（只改三处）

复制 `assets/examples/deck-generator-template.mjs` 后，按 outline 改这三处即可，**不要重写 helper**：

1. **theme/style 选择** —— 默认 `--theme corporate-blue --style consulting`；可换成
   `consulting-grey` / `startup-vibrant` / `academic-formal` / `gov-blue` /
   `tech-dark` / `health-soft` / `minimal-mono`，style 可换 `minimal` / `product`，或用
   `--theme-pack ./theme.json --style-pack ./style.json` 加载外部 pack。
2. **各 slide 函数内容** —— 填 outline 里的标题、KPI 数据、表格行、bullet。
3. **`TOTAL` + main 里的 slide 调用序列** —— 改成实际页数与页序。

helper（`nm()` 双向命名 / `grid()` 网格 / `txH()` 字号→盒高 / `pageChrome()` / `pageHeader()`）
的签名与避坑细节见 `deck-generator-workflow.md`，express 直接用、不展开。

---

## 4. 风格选择（themePack / stylePack）

当前 express 的"选风格"= 选一个 themePack + 一个 stylePack：

- 用户**明确指定**色/品牌 → 遵守，优先映射到已有 themePack；没有命中就临时写外部
  themePack JSON，并在生成后用 `apply-corporate-rebrand` / `swap-theme` 保持 deck 主题一致。
- 用户**没指定** → 按内容领域推断一个安全牌，并在产出说明里记录理由（避免自嗨）。
  默认安全牌是 `corporate-blue` + `consulting`，字体 `Inter` + `Source Han Sans SC`。
- 可用 catalog：`s8fy pptx list-themes --json`，或查看
  `assets/themes/catalog.json` / `references/theme-packs.md`。

生成后换风格不用改 `C` 重跑：直接执行
`s8fy pptx swap-theme out.pptx --to consulting-grey -o out-grey.pptx` 或
`s8fy pptx swap-style out.pptx --to minimal -o out-minimal.pptx`。

---

## 5. 质量门与丰富度

express 默认按**客户演示级**产出，不交 recipe-only 草稿。硬指标（详见 SKILL §9 与
`rich-deck-patterns.md` 的 op 量级表）：

- **op 量级**：7 页左右 deck **≥200 ops**；`jq '.ops|length'` < 100 说明只堆了 recipe、视觉太空，
  回去给每页加视觉元素（顶部品牌条 / accent 竖条 / eyebrow / KPI 顶部色条 / delta pill /
  callout / hero 收尾）。
- **每页有视觉锚点**：页眉/页脚/章节标记/导航 或 全屏 hero 之一。
- **chart 页必须有结论 callout**：右 1/3 放 2-3 个数字卡，别让用户自己解读图。
- **长文本压缩**成结论 / 表格 / callout / notes，不堆满正文。
- **字号有阅读底线**：核心正文 ≥ `10.5pt`；label / badge / chart / table ≥ `9pt`；
  页脚 / 来源可到 `8.5-9pt` 但不承载关键信息。内容塞不下时删字或换布局，不靠缩小字号。
- **构图有几何纪律**：对比页中轴、VS 圆、流程中心框、连接线和箭头端点必须从 shape bbox
  推导；同排文字与形状垂直居中，左右对称布局要数学居中。

每页该长什么样、可粘贴的 patch 骨架见 `rich-deck-patterns.md` §1-§8；7 页推荐结构见 SKILL §9.5。

---

## 6. vision-check 自动闭环

apply 后跑 `s8fy pptx vision-check out.pptx --json`（render-free 几何自检，6 类问题，详见 SKILL §10）。
闭环规则：

- **自动套**：只把 `fix.autoRetry == true` 的两类（`shape-out-of-bounds` 越界回夹、
  `text-edge-margin` 贴边推回）合成一个 patch envelope 重 apply，再 vision-check 确认清零。
  合并脚本（nu）见 SKILL §10.2；bash 等价：

  ```bash
  jq '{schemaVersion:1, ops:[.issues[] | select(.fix.autoRetry==true) | .fix.fixPatch[]]}' \
     vision.json > fix.json
  s8fy pptx apply -p fix.json -i out.pptx -o out.pptx --overwrite
  s8fy pptx vision-check out.pptx --json | jq '.summary'
  ```

- **人工确认**：`autoRetry==false` 的三类（overlap / overflow / alignment，confidence 0.45-0.5）
  不是可忽略项；它们是需要人工处理的候选修复。放大盒子或挪形状可能引入**新**碰撞，
  看 `reason` 后改 generator / layout / 文案 / textbox 尺寸，再重 apply。
  `font-too-small` 无 fix（放大字号会反触发 overflow），但创建型 deck 不能把它当装饰性
  warning：删字、放大容器或换版式后重跑。

- **交付门槛**：创建型 deck 必须让 `summary.bySeverity.high == 0` 且
  `summary.bySeverity.medium == 0`。`text-overflow-estimate`、`geometry-overlap`、
  `text-edge-margin` 这类 medium 常常对应真实字符重叠、换行压字或页脚撞正文，不能
  因为不是 high 就放行。

vision-check 只看几何；**字符实际重叠 / 字体换行压字 / 小字号可读性 / 对比度 /
箭头是否歪、连接线是否接上 / 中轴标识是否真居中 / 装饰是否真盖住文字 / 配色协调仍靠
§2 第 8 步的 PNG 复核**（SKILL §9.6 清单），不可省。

---

## 7. 最小确认策略

express 的核心是**不像 ppt-master 那样逐项确认**（它要 8 次 BLOCKING 确认）。原则：

- **能合理推断的全部用默认**，并在最终回复里**说明做了哪些假设**（受众、页数、风格、配色）。
- **只在缺少以下任一关键信息且无法合理推断时**，才**一次性**问清（用一个 AskUserQuestion 合并问，
  不要来回追问）：
  - **主题/内容**：完全不知道要讲什么（连领域都推不出来）。
  - **页数**：内容体量差异巨大、推断区间太宽（如可能 5 页也可能 20 页）。
  - **关键数据**：deck 以数据为主（财报/实验），但用户没给数也没给数据文件。
- 风格、配色、字体、版式密度**一律不问**，按内容领域选安全牌并记录理由；用户不满意时
  用 `swap-theme` / `swap-style` 秒级换一版。

---

## 8. 升级信号：何时转 Studio / Edit

express 跑到一半发现下列任一信号，就升级（生成器与 op 共用，无需重来）：

| 信号                                       | 升级到     | 去向                                    |
| ------------------------------------------ | ---------- | --------------------------------------- |
| 要像素级定位 / 自由布局 / 演示动效拟态     | **Studio** | SKILL §1.2 + `patch-ops-cheatsheet.md`  |
| 要自定义 chart 样式 / 二轴 combo / chartEx | **Studio** | `charts.md`                             |
| 要套已有品牌 profile / 做品牌合规          | **Studio** | SKILL §4 + `recipes.md`                 |
| 要把一份 JSON/CSV 批量套进模板             | 数据驱动   | SKILL §3 + `data-driven.md`             |
| 用户改口"在这份已有 deck 上改/加"          | **Edit**   | SKILL §2 + `inspect-and-edit.md`        |
| op 数已超 ~100、手维护吃力                 | 仍 Express | 继续用生成器（这正是它的用途，见 §3.2） |

> Express 不是能力天花板，是**默认省事路径**。它产出的就是原生可编辑 PPTX + sidecar，
> 任何时候都能用 Edit 模式继续 inspect / patch / 回滚。
