---
name: deckkit-maker
description: >
  从参考 .pptx 文件或 HTML 演示模板为 pptx-nova SKILL 创建新的 DeckKit（开发者侧
  skill，操作 skills/pptx-nova/ 源码）。当用户提供一个参考 .pptx 文件、template.html
  或 HTML 模板目录和新 DeckKit 的名字，要求"创建 DeckKit / 新增 DeckKit / 把这个 pptx
  做成 DeckKit / 把这个 HTML template 转成 DeckKit / 复刻这个 deck 的风格做成套件 /
  模仿这个 deck 新建 DeckKit" 时触发。两阶段工作流：
  第一阶段对参考 deck 做高保真基线重建（默认覆盖所有 slides；大型或高度重复 deck
  先确认代表页型范围，风格、主题、内容可照搬），第二阶段组件化抽象为 id.kit.mjs +
  schema + catalog + benchmark 并走 readiness
  流程。不要把本 skill 用于普通交付型 deck 生成——那是 pptx-nova 的 DeckKit 模式。
---

# deckkit-maker

从一个参考 `.pptx` 文件或 HTML 演示模板出发，为 pptx-nova 创建新的 DeckKit。目标是让以后的 Agent
能用 `content.json → DeckKit → patch → xdoc` 稳定高效地产出同主题、同质量的 PPTX。

本 skill 是 **开发者侧** skill：它修改 `skills/pptx-nova/` 源码，可以使用仓库根
`tools/`、`Justfile` 等 developer-only 工具链；但写进 pptx-nova 的任何用户路径
（kit、schema、scripts、references）必须保持 skill 自包含，不得依赖 skill 目录外文件。
本 skill 自带的 `scripts/` 只服务 DeckKit 创建流程，不会随 pptx-nova 发布。

## 输入

用户会提供：

1. **参考 `.pptx` 文件路径，或 HTML template 文件/目录** —— 风格、主题、模板、内容的唯一事实来源。参考文件只读。
2. **新 DeckKit 的名字** —— kebab-case id（如 `swiss-grid`、`consulting-dark`）。

如果两者缺一，先向用户索取，不要自己猜测或挑选文件。若参考源是 HTML 目录，优先确认其中
的入口文件（通常是 `template.html`）和元数据文件（如 `template.json` / `design.md`）。

## 修复或扩展已有 DeckKit

当用户要求“修一下现有 DeckKit / 重新走一遍 broadside / 对照参考源修几页”时，按
**existing DeckKit repair** 处理，而不是新建 DeckKit：

- `catalog.json` 已注册该 id、`<id>.kit.mjs`、schema、examples 和 benchmark case 已存在是
  预期状态，不要按“目标文件已存在”判定为阻塞；只需确认这些文件确实属于本次要修的 DeckKit。
- run 目录仍优先使用 `.tmp/deckkit-<id>/`，继续追加 `progress.md` / `findings.md`，并把新的
  benchmark、PNG、审计 patch、实验 deck 放进其下的 `benchmark/`、`audit/`、`previews/`
  等子目录。不要因为目录已存在就散落到 `.tmp/` 其他位置。
- 若 `.tmp/deckkit-<id>/` 中已有不相关或需要保留的旧分析产物，创建同目录下带语义名的子目录
  （如 `audit/freeform-visibility/`）或在 `progress.md` 记录覆盖原因；只有无法安全区分时再询问用户。
- 修复流程应以参考源和现有 benchmark 为事实来源：先复现/查看当前 PNG，再改 kit/test，最后跑
  validation、目标 benchmark、必要时全量 benchmark 和 showcase 更新。不要重新执行新建 DeckKit
  的 catalog/schema 初始化步骤。

## 新建 DeckKit preflight（必做）

新建 DeckKit 时，在读取参考 deck 或创建 run 目录前，先完成这些检查并把结果写进
`.tmp/deckkit-<id>/progress.md`；若 run 目录已存在，改用带时间戳的目录或先询问用户，
不要覆盖旧分析产物。

```bash
git status --short
node -e "const id=process.argv[1]; if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) process.exit(1)" <id>
test -f <ref.pptx-or-template.html>   # HTML 目录输入时检查入口 template.html
test ! -e .tmp/deckkit-<id>
node -e "const c=require('./skills/pptx-nova/assets/deckkits/catalog.json'); const id=process.argv[1]; if ((c.entries||[]).some(e=>e.id===id)) process.exit(1)" <id>
test ! -e skills/pptx-nova/assets/deckkits/<id>.kit.mjs
test ! -e skills/pptx-nova/assets/deckkits/schemas/<id>
test ! -e skills/pptx-nova/assets/deckkits/examples/<id>-content.json
test ! -e skills/pptx-nova/benchmarks/visual/cases/<id>
test ! -e skills/pptx-nova/assets/examples/<id>
```

如果任一目标文件或目录已存在，先确认是继续扩展、接管未完成工作，还是换新 id。不要删除或覆盖
不是本次任务创建的内容。参考 `.pptx` / HTML 模板必须只读；除 Phase 2 正式产物写入
`skills/pptx-nova/` 外，任何导出、解包、截图、patch、PPTX、PNG、benchmark、审计和草稿文件
都必须写入当前 run 目录，不得散落到仓库根目录、`.tmp/` 其他子目录或临时的一次性目录。

## 前置阅读（必读，按序）

1. `skills/pptx-nova/SKILL.md` —— pptx-nova 路由与红线
2. `docs/skill-dev-guide.md` —— §3 术语（DeckKit / content 契约 / content leak 防线 /
   字符串分层规则 / 新增 DeckKit 准入标准）、§4 开发流程、§5 benchmark 与 readiness
3. `skills/pptx-nova/assets/deckkits/README.md` —— core-primitives 职责边界、冻结准入
4. `skills/pptx-nova/references/deck-generator-workflow.md` —— 探索生成器方法与避坑

已有先例：`swiss-grid` DeckKit 即从 `demos/67-swiss-grid-systems.pptx` 复刻而来
（见 catalog `knownLimits`），本 skill 把这条路径固化为标准流程。

## 两阶段总览

```text
参考 .pptx / HTML template + 新 DeckKit 名字
  │
  ├─ Phase 0  分析参考 deck/template   → references/analyze-reference.md
  │    pptx: unpack → 参考 PNG 基准
  │    html: browser screenshots → DOM/CSS/token extraction
  │    → style-spec.md + slide-inventory.md + fidelity-scope.md
  │
  ├─ Phase 1  高保真重建（第一交付物）  → references/rebuild-high-fidelity.md
  │    探索生成器 generate.mjs → 按 fidelity-scope 重建 → 逐页与参考 PNG 对比
  │    门禁：dry-run 无阻塞 + vision-check high/medium=0 + 范围内逐页人工对比通过
  │
  └─ Phase 2  组件化抽象（第二交付物）  → references/componentize.md
       抽 <id>.kit.mjs + schemas + content.json + catalog 注册
       → slots/slot-consistency → benchmark(golden/stress/mixed-language)
       → validation tests + content leak regression → readiness audit
```

**先完成并验收 Phase 1，再开始 Phase 2。** 高保真重建是组件化的证据基础：没有约定
范围内逐页对比通过的重建产物，就没有资格冻结 kit。这里的高保真指无 hard defect 的
视觉/结构基线，不要求像素级一致；最终 kit 只保留可复用视觉系统，不保留业务内容。
两阶段的产物都保留在 run 目录中。

### HTML 模板输入补充流程

HTML 模板不是 PPTX，不能走 `xdoc inspect` / `xdoc convert <ref.pptx>` 作为事实源。遇到
`template.html`、网页 URL、本地 HTML 模板目录或 `beautiful-html-templates` 类素材时：

1. 读取 `template.json`、`design.md`、入口 HTML 的 CSS token、slide section 和脚本。记录
   HTML 元数据与实际 DOM 的不一致（如 `slide_count` 与 `.slide` 数量不同）。
2. 使用 agent-browser 或等效浏览器工具，以 16:9 viewport（建议 1440×810）逐页截图到
   `ref-previews/`，并生成 contact sheet。截图前冻结动画，隐藏网页导航控件、圆点、浏览器
   slide counter、hover-only UI 等 PPTX 不应复刻的交互元素。截图流程必须可复现：
   记录 `agent-browser set viewport 1440 810`、注入的 capture CSS、slide 切换方式，以及
   绝对 screenshot path；不要只留下手工点击后的散图。优先使用
   `node .claude/skills/deckkit-maker/scripts/capture-html-slides.mjs --url <template.html-or-url> --out .tmp/deckkit-<id>/ref-previews`
   生成逐页 PNG 与 `capture-manifest.json`；非 `.slide` 模板通过 `--selector` 调整，只有
   slide 原本是 `display:none` 且无法靠 `.active` 恢复时才传 `--active-display`，避免破坏
   源 HTML 的 grid/flex 布局。
3. `style-spec.md` 必须同时引用 CSS token 与浏览器截图；字号从 CSS `vw/vh/rem/px`
   映射为 PPTX pt，间距从 viewport 比例映射到 13.333×7.5in。
4. `slide-inventory.md` 以真实 DOM slide 顺序为准，不以元数据声明为准；把 CSS class
   映射为 DeckKit page type。文案抽取建议用 `xdoc html2md <template.html>` 做交叉校验；
   对隐藏 slide、off-screen slide 或当前未激活的 slide，用 DOM `textContent` 抽取，不要只用
   `innerText`，否则会漏掉 `display:none` 页面。
5. HTML 的 motion、keyboard handlers、pagination dots、scroll transforms、hover states
   只记录为"不迁移"决策；DeckKit 只冻结静态演示视觉系统、可编辑 shape/text、asset slot
   和可复用 chart/diagram 结构。
6. 图片/截图区域默认转为 asset slot 或占位框；不把 HTML 模板中的一次性位图、远程图、CSS
   背景图直接写入 kit。
7. Phase 1 对比时用浏览器截图作为参考 PNG；Phase 2 benchmark 仍必须用 xdoc 生成 PPTX
   PNG 并走 `dry-run → apply → vision-check → contact-sheet review`。

### HTML 到 PPTX 视觉语义避坑

HTML/CSS 的视觉语义不能逐字搬到 PPTX patch，尤其是透明色和自定义图形：

- **CSS alpha 颜色要折算并过门禁**：PowerPoint 文本 font color 通常是实体色，不能直接表达
  `rgba(...)` 的网页透明感。把 CSS token 折算到目标背景色上后，还要跑 `vision-check`；
  若可读正文、label、页眉页脚触发低对比 high/medium，就区分“可读 muted token”和“装饰 muted token”。
  大号背景编号、装饰 slash、非关键信息可以更淡；正文和小号 chrome 必须满足交付门禁。
- **不要为了贴近参考而接受不可读色**：参考 HTML 里的 `rgba(17,17,17,.45/.55/.60)` 在橙底上
  可能只有 2-3:1 对比度。DeckKit 要服务后续交付，优先级是参考视觉语气 + PPT 可读性 +
  `vision high/medium = 0`，而不是像素级复制网页透明度。
- **小号透明/白色文本允许可读性适配**：HTML 中的小号透明黑、透明白或低 alpha chrome
  在 PPTX 门禁中可能触发低对比。正文、小号 label、页眉页脚、来源和按钮文字可以加深为
  同色系高对比实体色；在 `compare-notes.md` 标记为可读性适配即可。
- **freeform 必须验证真实尺寸**：用 `add-freeform` 复刻 donut、conic-gradient、斜切块、
  不规则图形或 SVG-like 分段时，不要只传英寸绝对 `points`。xdoc freeform 使用局部坐标，
  通常需要显式 `originX` / `originY` 和 `xScale` / `yScale`；否则 PPTX 可打开但形状可能只有
  几个 EMU，PNG 中几乎不可见。修这类图形时，至少用一个最小实验或解包 XML 检查
  `<a:ext cx="..." cy="...">` 是实际英寸量级，再看 PNG。

### 门禁与 benchmark 判读

- **vision 字段不同于 dry-run**：`vision.json` 的定位字段是 `issues[].slideIndex` 和
  `issues[].shapeName`，不是 dry-run 的 `target.name`。汇总 high/medium 时用：

  ```bash
  VISION_JSON=.tmp/deckkit-ID/vision.json
  node -e 'const fs=require("fs"); const r=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const xs=(r.issues||[]).filter(i=>["high","medium"].includes(i.severity)); console.log(xs.map(i=>`${i.severity}\tslide ${(i.slideIndex??-1)+1}\t${i.shapeName||i.shapeId}\t${i.kind||""}\t${i.message||""}`).join("\n")||"vision high/medium: 0"); process.exit(xs.length?1:0)' "$VISION_JSON"
  ```

- **candidate readiness warning 是预期状态**：新 kit 推到 `candidate` 时，
  `validate-content --mode delivery` 可能仍提示 readiness 相关 warning。只要没有 schema、
  slot 或 content-contract error，并且 benchmark/readiness audit 通过，不要把这类 warning
  当作交付阻塞。
- **stress/mixed fixture 测槽位韧性，不测无意义超长文案**：benchmark 文案应当比 golden 更密、
  覆盖多语言和边界长度，但仍在 schema max length、slot budget 和真实交付可读性内。若稳定
  溢出来自 fixture 过长，先修 fixture；真实合理内容仍失败时再改 kit 几何或容量策略。

### 高保真范围决策

默认做全量重建：参考 deck 每一页都有对应重建页。若参考 deck 页数很多、重复页占比高，
或包含大量一次性/低复用页面，Phase 0 必须在 `fidelity-scope.md` 中先做范围决策：

- `full`：默认模式，全量重建全部 slides。
- `scoped`：只在用户确认后使用；必须覆盖每种页型、每个 signature visual element、
  每类图表/表格/资产形态和所有可复用 chrome；未重建页逐页记录归属页型、省略原因与
  Phase 2 影响。

`scoped` 只能降低一次性页面的重建成本，不能跳过风格证据、页型证据、资产决策或
benchmark 覆盖；最终 catalog 必须把未覆盖内容写入 `knownLimits` 或 coverage 说明。

### 图片资产原则

DeckKit 复刻视觉语法，不复刻一次性素材。图片主导页（照片、截图、插画、产品界面图、
背景位图占主要表达价值）默认不进入 Phase 1 高保真 rebuild set；只登记其页型、图片角色、
裁切/边框/callout/caption 等可复用外壳。若该页贡献了新的可复用页型，重建外壳和
`asset` 槽位，用占位框、语义相关的原生 shape、Tabler icon、图表/表格或 SmartArt-like
组合替代，不搬参考图片。

替代元素必须和原页表达含义相关；禁止为填充画面而塞入无关图标、装饰或抽象形状。参考 deck
提取出的图片不得写入 `.kit.mjs`，默认也不得进入 DeckKit examples/assets；只有授权明确、
跨 deck 可复用且用户确认的品牌资产才可例外纳入。

## 不可跳过的红线

- **core-primitives 只读为默认**。`core-primitives.kit.mjs` 不承担任何 DeckKit 专属
  风格。只有当一段逻辑"换了主题色/间距后仍然正确"且至少有跨 kit 复用证据时，才考虑
  下沉；下沉前必须与用户确认，并跑全部现有 DeckKit 的 validation tests。
- **参考 pptx / HTML 只读**。所有解包、DOM/CSS 抽取和分析副本都放进
  `.tmp/deckkit-<id>/ref-unpack/` 或同一 run 目录下的对应子目录。
- **content leak 防线**（详见 `docs/skill-dev-guide.md` §3 字符串分层规则）：
  `.kit.mjs` 只冻结视觉语言、几何、chrome、结构标签；参考 deck 的业务文案
  （标题、观点、指标、实体、年份、来源、callout 强调词）最终只能进入
  `content.json` / examples / benchmark fixture。Phase 1 的探索生成器里可以暂时
  内联内容，Phase 2 抽取时必须全部移出。反例教训：swiss-grid 早期把
  `'Aa'`、`'所有距离的最小公因子'` 等示例内容硬编码进页型，导致三个版型跨主题不可复用。
- **坐标必须推导**：所有 op 坐标走 primitives（`nm()`/`grid()`/`txH()`）或显式
  bounds 计算，不凭目测摆放。幕布 13.333in × 7.5in。
- **图标只用 pptx-nova 现有 Tabler pack**：用
  `node skills/pptx-nova/scripts/pptx-nova-icons.mjs search <query> --json` 查询、
  `createOps().icon()` 内联。参考 deck 中的图标/装饰图找最接近的 Tabler 替代；
  不联网取图，不把参考 deck 的位图直接打进 kit。替代图标/shape 必须语义相关。
- **视觉门禁**：每次 build 走
  `dry-run → apply → vision-check(high/medium=0) → 按 fidelity-scope 做 PNG/contact-sheet 人工逐页`。
  dry-run 与 vision-check 的溢出估算阈值不同，两个都要跑。
- **常规 shape 也必须高保真**：不要只复刻版式语义而放松基础元素。人工 PNG 对比时逐页检查
  文本字号、字色、大小写、对齐、行高、圆形/方块尺寸、圆内文字颜色与居中、斜线/纹理方向、
  裁切边界和是否越界。除非为了通过可读性门禁并在 compare notes 中说明，PPTX 字号不应小于
  参考源；圆形、badge、编号、标题这类高识别元素必须优先按参考截图尺寸还原。
- **字号下限**：正文 ≥10.5pt；label/badge/chart/table ≥9pt；页脚/来源 8.5–9pt。
  若参考 deck 本身使用更小的风格字号（如 Swiss 标签），在 catalog
  `qualityProfile` 中声明并说明理由，不要静默违反。
- **readiness 不跳级**：新 kit 从 `experimental` 起步，benchmark 通过后
  `candidate`；`production` 必须 benchmark + 人工 PNG review +
  `--confirm-manual-png-review`。本 skill 默认推进到 `candidate`，
  promotion 到 `production` 需用户确认。

## 长任务管理

本任务通常跨 50+ 工具调用，必须有可恢复的状态文件。若 planning-with-files SKILL
可用，开工即使用它；否则在 run 目录手动创建并持续维护：

- `task_plan.md`：Phase 0/1/2 分阶段 checklist，阶段完成时更新状态。
- `findings.md`：风格提取、XML 证据、字体/资产风险、用户确认事项。
- `progress.md`：已执行命令、产物路径、失败与修复、下一步。

每看完 1–2 页参考 PNG、每轮重建对比、每次 benchmark/readiness 后都要落盘。需要深入读取
参考 pptx 内部 XML 之外的内容（如嵌入对象）时，可借助 pptx SKILL。

## Run 目录约定

```text
.tmp/deckkit-<id>/
├── ref-previews/          # 参考 deck PNG 基准（contact-sheet + 逐页）
├── ref-unpack/            # 参考 PPTX 解包、HTML DOM/CSS 抽取等只读分析副本
├── ref-inspect.json       # xdoc inspect / DOM inspect 结构化输出
├── style-spec.md          # Phase 0 风格提取结论
├── slide-inventory.md     # Phase 0 逐页清单与页型归并
├── fidelity-scope.md      # Phase 0 高保真范围决策（full/scoped）
├── task_plan.md / findings.md / progress.md
├── generate.mjs           # Phase 1 探索生成器
├── patch.json / out.pptx / dry-run.json / vision.json
├── previews/              # 重建 deck PNG（每次重渲前 rm -rf）
├── benchmark/             # 本次候选 kit 的 benchmark 输出、summary、contact sheets
├── compare-notes.md       # Phase 1 逐页对比记录
└── audit/                 # Phase 2 content leak / text extraction / slot audit 产物
```

`.tmp/deckkit-*` 均不提交。Phase 2 的正式产物写入
`skills/pptx-nova/`（kit、schema、catalog、examples、benchmark、tests）。

不要再创建 `.tmp-deckkit-<id>`、`.tmp-slides/`、`.tmp-pptx-*`、散落的根目录 JSON，或按脚本名
临时拼出来的目录。若外部工具默认输出到别处，显式传 `--out` / `-o` / 输出路径，把结果收束到
`.tmp/deckkit-<id>/` 下；需要保留的错误日志、CLI stdout JSON、截图和对比图也放在这里。旧任务
留下的 legacy 目录可以只读参考，但新任务和新产物一律使用 `.tmp/deckkit-<id>/`。

## 完成摘要

任务结束时最终回复必须列出：

- 新 DeckKit id、版本、readiness 结论与 catalog 路径
- Phase 1 重建 deck 路径与逐页对比结论（保留页数 / 参考页数）
- Phase 2 落盘文件清单（kit / schemas / content / catalog / benchmark / tests）
- 验证结果：validate-content、dry-run、vision-check、slot-consistency、
  content leak audit、benchmark summary、readiness audit
- 与参考 deck 的已知差异（字体替代、图标替代、未还原元素）逐条披露
- 是否动了 core-primitives；若动了，列出改动与全量 DeckKit 回归结果

## Reference 索引

| 文件                                    | 用途                                                |
| --------------------------------------- | --------------------------------------------------- |
| `references/analyze-reference.md`       | Phase 0：解包、PNG 基准、风格提取、页型归并         |
| `references/html-template-reference.md` | Phase 0 补充：HTML 模板截图、DOM/CSS 分析、交互过滤 |
| `references/rebuild-high-fidelity.md`   | Phase 1：探索生成器、逐页重建与对比循环、避坑清单   |
| `references/componentize.md`            | Phase 2：抽 kit/schema/catalog/benchmark/readiness  |
