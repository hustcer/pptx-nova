# 控制流、宏与 Raw OOXML —— `if` / `foreach` / `try` / `define` / `use` / `raw-ooxml-patch`

> 这五个控制/宏 op + 一个 raw OOXML 逃生口都是 patch envelope 内的"元 op"：
> 在 dry-run 的 **expand 阶段** 展开成具体 patch op 序列后再进入正常校验。
> 它们让单份 patch.json 能表达"按状态分支"、"对一组数据循环"、"局部 try-catch"、
> "命名宏复用"，以及在极少数边角场景下走 OOXML 直改逃生口。

## §1 控制流 / 宏 op 总览

| op        | 必填                | 可选                               | 何时用                                           |
| --------- | ------------------- | ---------------------------------- | ------------------------------------------------ |
| `if`      | `condition`, `then` | `else`, `thenOps`, `elseOps`       | 按 deck 当前状态（页数、是否含某 shape）决定分支 |
| `foreach` | `items`, `do`       | `as`(默认 `"item"`), `ops`         | 对 JSON 数组循环展开（KPI 卡 / 表格行 / 时间线） |
| `try`     | `ops`               | `catch`, `catchOps`, `recoverable` | 想"尝试一个高风险 op，失败时退回 safe path"      |
| `define`  | `name`, `ops`       | （无）                             | 注册一个命名宏 — 把可复用的 op 块抽出来          |
| `use`     | `name`              | `with`                             | 展开一个命名宏，用 `with` 传 `{{args.*}}` 参数   |

**展开顺序**：递归优先 — 嵌套的 `foreach` 里嵌 `if`、`if` 的 `then` 里嵌 recipe
op、`use` 展开后又含 `foreach` 都会一路 expand 到底层 patch op 再统一执行。
展开结果会反映在 `dry-run` 报告的 `opResults[]` 里（含 `expandedOps[]` /
`controlExpansion` 元数据），方便你审计。带 `--explain` 还会在
`explanations[<i>].expandedOps` 里给出"该元 op 展开成哪些底层 op"。

> 字段同义：`then` / `thenOps`、`else` / `elseOps`、`do` / `ops`、`catch` /
> `catchOps` — schema 二者都接受，挑一个写就行。

## §2 `if` —— 按状态分支

```json
{
  "op": "if",
  "condition": {
    "kind": "slide-count",
    "op": "==",
    "value": 0
  },
  "then": [{ "op": "add-slide" }, { "op": "add-title-slide", "title": "新建 deck" }],
  "else": [
    {
      "op": "set-text",
      "slide": 0,
      "shape": { "placeholder": { "type": "title" } },
      "text": "已存在的 deck"
    }
  ]
}
```

`condition.kind` 取值：

| kind               | 含义                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| `slide-count`      | 已展开的 op 累计触发的 slide 数（注：是 expand 时刻的快照，不是输入 deck） |
| `count`            | 已展开的 op 总数（用来做 "前 N 步之后再做某事"）                           |
| `selector-match`   | 配合 `shape` 字段，判断某 selector 是否能命中（输入 deck 状态）            |
| `property-compare` | 配合 `slide` + `shape` + `property`，比对该属性的当前值                    |

`condition.op` 全集（**用全名**，schema strict）：
`== != > >= < <=` / `eq ne gt gte lt lte` / `equals notEquals` /
`contains notContains` / `startsWith endsWith`

**典型用法**：

- "如果输入 deck 没标题占位符,就先 add-placeholder"
- "已有 ≥ 10 页,就跳过封面页直接进内容"
- "shape 名包含 'Logo' 才走 set-picture-crop"

## §3 `foreach` —— 数据驱动的循环展开

```json
{
  "op": "foreach",
  "items": [
    { "name": "KPI-Revenue", "label": "营收", "value": "¥42M", "delta": "+21.9%" },
    { "name": "KPI-Margin", "label": "毛利率", "value": "38%", "delta": "+3pp" },
    { "name": "KPI-NewUsers", "label": "新增用户", "value": "1.2K", "delta": "+18%" },
    { "name": "KPI-Churn", "label": "流失率", "value": "2.1%", "delta": "-0.4pp" }
  ],
  "as": "kpi",
  "do": [
    {
      "op": "add-textbox",
      "slide": 0,
      "name": "{{$kpi.name}}",
      "x": "0.5in",
      "y": "3in",
      "w": "2.8in",
      "h": "1.4in",
      "text": "{{$kpi.label}}\n{{$kpi.value}}\n{{$kpi.delta}}"
    }
  ]
}
```

关键点：

- `items` 必须是 JSON 数组；每个元素被赋给 `as` 变量（默认 `"item"`）
- 在 `do[]` 内部用 **`{{$<as>.path}}`** 引用当前元素（注意是 `$kpi` 而非 `kpi`）；
  支持任意深度的 `.` 路径
- 不支持索引变量（无 `{{$index}}`）。要带序号请在 `items` 数组里预先填好
- 同一个 `foreach` 内可以嵌 `if` / 另一个 `foreach`,变量作用域逐层叠加

**典型用法**：

- 用单个 foreach 生成 4-across KPI 卡(代替手写 4 份重复的 add-shape/add-textbox)
- 时间线节点 / 议程编号卡 / 章节扉页批量化
- 把 CSV / JSON 数据源转成 deck 内容,**不必落地一个 template.pptx**(对比 `from-data`)

> ⚠️ `foreach` 仍然不能脱离 patch op 自身的字段约束 — `add-textbox` 必须有
> `slide` / `x` / `y` / `w` / `h`,变量替换只是文本插值。复杂坐标计算应该用
> JS 生成器(`assets/examples/deck-generator-template.mjs`)在生成 items 时
> 算好,再交给 foreach 展开。

## §4 `try` —— 容错执行

```json
{
  "op": "try",
  "ops": [
    {
      "op": "set-text",
      "slide": 0,
      "shape": { "query": { "nameRegex": ".*-callout$" } },
      "text": "替换文字"
    }
  ],
  "recoverable": ["missing-shape", "ambiguous-selector"],
  "catch": [
    {
      "op": "add-textbox",
      "slide": 0,
      "x": "0.5in",
      "y": "6in",
      "w": "12in",
      "h": "0.4in",
      "name": "fallback-callout",
      "text": "替换文字"
    }
  ]
}
```

- `recoverable` 列出可被 catch 接住的错误 `kind`（参考 `references/troubleshooting.md`
  的 errorCatalog），其它错误仍然冒出
- 不给 `recoverable` 时所有错误都会被 catch（强烈不建议 — 容易掩盖 bug）

**典型用法**：

- 给同一份 patch 在"修改已有 deck"和"从零创建"两种场景共用：先 try set-text，
  catch 内 add-textbox
- 渐进迁移老版 deck 的 placeholder 名字（先按新名 set，catch 内按旧名 set）

> ⚠️ **try 块内的 `define` 在失败时会被丢弃**：try 主分支失败、走 catch 分支
> 时，try 内部 `define` 的宏会被清理（避免半成品宏污染后续 op）。如果你需要
> "尝试 + 失败回退" 同时定义一个宏，把 `define` 放到 try 外面或 catch 外面。

## §5 `define` / `use` —— 命名宏 / 参数化 op 块

`define` / `use` 让你把"反复写"的一组 ops 抽出来命名复用，参数通过
`with` 注入、模板里用 `{{args.<field>}}` 引用，dry-run 报告里 `use` 的
`expandedOps[]` 会列出展开成的底层 op。

```json
{
  "schemaVersion": 1,
  "ops": [
    {
      "op": "define",
      "name": "metricBox",
      "ops": [
        {
          "op": "add-textbox",
          "slide": "{{args.slide}}",
          "x": "{{args.x}}",
          "y": "{{args.y}}",
          "w": "2in",
          "h": "0.6in",
          "name": "{{args.name}}",
          "text": "{{args.label}}\n{{args.value}}"
        }
      ]
    },

    { "op": "add-slide" },

    {
      "op": "use",
      "name": "metricBox",
      "with": {
        "slide": 0,
        "x": "0.5in",
        "y": "3.2in",
        "name": "kpi-revenue",
        "label": "营收",
        "value": "¥42M"
      }
    },
    {
      "op": "use",
      "name": "metricBox",
      "with": {
        "slide": 0,
        "x": "3.5in",
        "y": "3.2in",
        "name": "kpi-margin",
        "label": "毛利率",
        "value": "38%"
      }
    }
  ]
}
```

### 5.1 字段约束

| op       | 字段   | 类型             | 说明                                                        |
| -------- | ------ | ---------------- | ----------------------------------------------------------- |
| `define` | `name` | 非空字符串       | 宏名；同一份 patch 内**不能重复定义**（重定义直接报错）     |
| `define` | `ops`  | array            | 任意 patch op；可以嵌 `if` / `foreach` / `try` / 甚至 `use` |
| `use`    | `name` | 非空字符串       | 要引用的宏；**必须先 `define`** 后才能 `use`                |
| `use`    | `with` | object（可省略） | 暴露给宏体内的 `{{args.*}}` 占位符；省略 = 空对象           |

`{{args.field}}` 在 `use` 展开时做**字符串插值**（与 `foreach` 的 `{{$item.x}}`
同机制），支持任意层级 `.path` 路径（如 `{{args.theme.accent1}}`）；插值后的
op 才进入 schema 校验，所以**坐标/枚举字段**最终仍然必须是合法值。

### 5.2 嵌套与递归

- `use` 之间可以串调用：宏 A 内部可以 `{ "op": "use", "name": "B" }`
- **递归深度上限 16 层**：超过会报 `macro expansion exceeded depth limit 16`，
  自递归 / 互相递归两种死循环都会被这个限制兜住
- 宏注册表是 **全局共享** 的：从第一次 `define` 开始一直存活到 patch 结束；
  顺序上 `define` 必须排在它的 `use` 前面

### 5.3 何时用宏 vs. `foreach` vs. JS 生成器

| 你想做                          | 选什么                                 |
| ------------------------------- | -------------------------------------- |
| 4 张相同形状 KPI 卡（数据不同） | `foreach` —— 一份 items + 一份 do      |
| 同一页里 2-3 处样式一致的小组件 | `define` + 2-3 次 `use`（更可读）      |
| 多页都要用的"标准 callout 卡片" | `define` 一次，每页 `use`              |
| 100+ ops、跨页/复杂坐标计算     | JS 生成器（`define` 解决不了坐标计算） |

**宏的边界**：

- `{{args.*}}` 只做字符串插值，**不做算术**（要算坐标用 JS 生成器在外面算好）
- 宏体内引用的 selector / id 仍然要遵守 `nm()` 命名规范，否则 resolvedSelectors
  会报 not-found（见 `deck-generator-workflow.md` 的命名 helper 规范）
- 宏 **不会被持久化**到生成的 PPTX 里 — 它纯粹是 patch JSON 的"复用快捷方式"

### 5.4 常见错误

| 错误                                      | 原因                                    | 修复                                       |
| ----------------------------------------- | --------------------------------------- | ------------------------------------------ |
| `use references undefined macro 'foo'`    | `use` 在 `define` 之前出现，或宏名拼错  | 把 `define` 移到 `use` 前面 / 校对名字     |
| `define macro 'foo' already exists`       | 同一份 patch 里 `define` 了两次同名宏   | 用唯一名字，或拆成不同 patch               |
| `macro expansion exceeded depth limit 16` | 宏自递归或互相递归                      | 拆开递归边界，或在宏体内用 `if` 加终止条件 |
| `try recovered from ...`（warnings 里）   | try 内 `define` 被 catch 接住，宏被丢弃 | 把 `define` 移出 try 块                    |

## §6 `raw-ooxml-patch` —— 逃生口（默认禁用）

```bash
xdoc pptx apply -p patch.json -o out.pptx --allow-raw-xml --dry-run --json
```

```json
{
  "op": "raw-ooxml-patch",
  "target": "ppt/slides/slide1.xml",
  "xpath": "//a:hlinkClick/@tooltip",
  "operation": "set",
  "value": "Open the product demo"
}
```

字段：

| 字段        | 说明                                                                                |
| ----------- | ----------------------------------------------------------------------------------- |
| `target`    | OPC 部件路径（`.xml` / `.rels` 结尾，禁止 `..` 路径穿越）                           |
| `xpath`     | 受限 XPath；支持 `/`、`//`、元素名路径和最终 `/@attribute`，不支持 predicate/filter |
| `operation` | `set`(替换文本) / `add`(追加子元素) / `remove`(删除节点) / `replace`(整节点换)      |
| `value`     | 文本或 raw XML 片段；`remove` 操作可省略                                            |

**安全约束**：

- 必须显式加 `--allow-raw-xml` 旗标
- `target` 只接受 OPC 包内部部件路径,会拒绝任意路径穿越
- 写完会同时 emit `semanticChange` 和 `visualRisk`(severity=`medium`,kind=`raw-ooxml`)
- 不参与 schema-v1 的字段校验,**写错了 dry-run 只能告诉你 XPath 没命中,无法告
  诉你 OOXML 结构错** — 最后必须跑 `xdoc check deck.pptx --checks compat` 兜底

**XPath 能力边界**：

| 写法                             | 支持 | 说明                                           |
| -------------------------------- | ---- | ---------------------------------------------- |
| `/p:sld/p:cSld/p:spTree`         | ✅   | 绝对元素路径；命名空间前缀会按 local-name 匹配 |
| `//a:t`                          | ✅   | 递归选择所有同名元素                           |
| `//a:hlinkClick/@tooltip`        | ✅   | 最后一段可以是 attribute，用于批量设/删属性    |
| `//a:hlinkClick[@tooltip=x]`     | ❌   | 不支持 predicate 或按属性值筛选                |
| `//p:sp[1]`                      | ❌   | 不支持索引筛选                                 |
| `//*[@id]` / `//a:*`             | ❌   | 不支持 wildcard                                |
| `contains(...)` / `text()`       | ❌   | 不支持函数                                     |
| <code>//a:t &#124; //p:ph</code> | ❌   | 不支持 union                                   |

如果需要"按属性值定位某个节点后再改"，不要在 raw XPath 中反复试 predicate；
优先使用已有 patch op、先用 inspect 定位稳定 selector，或拆成更具体的常规编辑能力。
raw 逃生口只适合你已经确认目标路径足够窄、批量命中也可接受的场景。

**何时用**:

- 标准 patch op 表达不了的 OOXML 边角场景(e.g. 直接调字符级 `<a:rPr lang="zh-CN">`,
  改 `<p:transition>` 子节点的高级属性等)
- 给已有 deck 做"批量正则替换" — 比常规 `set-text` 更直接但风险更高
- **不要用来做** recipe / patch op 已经覆盖的事(字体颜色、对齐、placeholder 等);
  那等于自废 schema 校验、走老路。

## §7 与 `bind-data` / `from-data` 的关系

| 路线         | 模板需要存在?        | 数据源                | 适合场景                                    |
| ------------ | -------------------- | --------------------- | ------------------------------------------- |
| `from-data`  | ✅ `.pptx` 文件      | JSON / 命令行         | 同一份品牌模板 + 多份数据反复出 deck        |
| `bind-data`  | ❌ 在同一 patch 创建 | 内联 / 外部 JSON      | 一次性 deck,数据与样板同源                  |
| `foreach` op | ❌                   | patch 内 `items` 字段 | 单页内重复结构(KPI 卡 / 议程项 / 行)        |
| `if` op      | ❌                   | 输入 deck 状态        | 同一份 patch 在"新建"和"修改"两种入口下复用 |

**配方**:中大型 deck 推荐 JS 生成器 + `foreach` 混用 — 生成器算 items 数组 +
统一坐标,foreach 展开重复结构,patch 体积小、可维护性高。

## §8 调试技巧

- dry-run 报告的 `opResults[]` 里,展开过的元 op 会带 `controlExpansion`
  metadata,记录子 op 数量;有歧义时这里也会带 `suggestions[]`
- `recoverable` 写错 kind 名 → try 块照样冒错;先 `xdoc schema --op try` 查可用
  enum,再对照 `references/troubleshooting.md` 的错误名
- `foreach` 模板里 `{{$item.x}}` 漏写 `$` 不会报错 — schema 把它当成普通字面量
  字符串。看 dry-run `semanticChanges[]` 里的 text 字段确认是否被替换
- `use` 模板里 `{{args.x}}` **不带 `$`**(与 `foreach` 的 `{{$item}}` 区分),
  漏写或拼错同样不会报错 — 看 `semanticChanges[]` / `--explain` 的 `expandedOps`
  确认占位符是否被替换
- 排查宏展开:`xdoc pptx apply -p patch.json -i in.pptx --dry-run --explain --json`
  会在 `explanations[<i>].expandedOps` 列出每个 `use` 展开成哪些底层 op

## §9 不要做的事

- 不要用 `raw-ooxml-patch` 修改 `[Content_Types].xml` 或 `.rels` 关系图谱以外
  的元数据 — 几乎一定会破坏 OPC 包结构
- 不要在 `if.condition.kind: count` 里依赖具体数字 — `count` 是 expand 阶段的
  累加器,与你想检验的 deck 状态(slide 数 / shape 数)是两码事
- 不要把 `foreach` 当 SQL —— 不支持 `where` / `sort` / `groupBy`。需要时在
  JS 生成器里预处理 `items` 数组
- 不要把所有错误都丢进 `try.catch[]` —— 没有 `recoverable` 列表时,真正的字段
  错误也会被 catch 掉,debug 极痛苦
- 不要把 `define` 放进 `try.ops` 期望失败时还能 `use` —— catch 分支会清掉 try
  里注册的宏,后续 `use` 直接报 `undefined macro`
- 不要在 `{{args.*}}` 里塞表达式(`{{args.x + 1in}}` 不工作);坐标算式放到 JS
  生成器里算好,再用计算结果调 `use`
