# Phase 2 — 组件化抽象

目标：把验收通过的探索生成器冻结为正式 DeckKit，并走完注册、校验、benchmark、
readiness 全链路。规范以 xdoc 维护者仓库 `docs/skill-dev-guide.md`（本机 `../pptx/docs/`）§4（开发流程）、§3（content
契约与字符串分层）和 `pptx-nova/assets/deckkits/README.md`（冻结准入）为准，
本文件按复刻场景串起执行顺序。

## 目录

1. 拆分：什么进 kit，什么进 content
2. Schema 与槽位
3. catalog 注册
4. 验证与 build
5. 测试
6. benchmark 与 readiness
7. core-primitives 修改门槛
8. 收尾清单

## 1. 拆分：什么进 kit，什么进 content

合同路线先按 [design-source-migration.md](design-source-migration.md) 抽出
`<id>/design.json` 的事实、`intent.md` 的判断与已注册视觉族。`<id>.kit.mjs` 只保留稳定适配接口；
布局解析器按角色和逐实例容量编译组件计划，组件执行器消费该计划，不把旧页型函数换文件名后继续分发。
新视觉族通过 `design-family-registry.mjs` 注册合同断言、解析、风格检查和投影元数据，复用共享门禁。
新增/迁移优先走此路线；下列 kit/content 分离原则也适用于仍在维护的无合同套件。

把 `generate.mjs` 的业务内容与视觉执行分离：

- `pptx-nova/assets/deckkits/<id>.kit.mjs` —— 视觉语言（C/F 常量、chrome、
  几何 helper、页型函数）+ `export function createDeck(content)` 返回
  `{ patch, warnings }`。页型函数只消费 `slide.data`。
- `pptx-nova/assets/deckkits/examples/<id>-content.json` —— Phase 1 内联的
  **全部业务内容**原样搬入，结构 `{ meta: { deckkit: "<id>" }, slides: [{ type, data }] }`。
  这份"参考 deck 内容"就是天然的 golden example。例外：参考 deck 中的一次性图片、截图、
  照片、插画和背景位图不搬入 examples/assets；对应字段写成 `asset` 槽位、占位行为或
  known limit。

**逐字符串过 content leak 防线**（字符串分层表见 skill-dev-guide §3）：标题、观点、
指标、实体、年份、来源、callout 强调词一律进 content；kit 里只允许 shape 名、
颜色 token、字体名、可被 `data.labels` 覆盖的中性结构标签和自动页码。检查方法：
对 kit 源码 grep 参考 deck 的主题词，命中即泄漏。允许的 fallback 只能是
空/隐藏/中性结构默认，不能是参考 deck 的替代内容。

把参考 deck 的专有业务词写成 denylist，并把脚本输出作为审计产物保留：

```bash
mkdir -p .tmp/deckkit-<id>/audit
node deckkit-maker/scripts/content-leak-audit.mjs \
  --patch .tmp/deckkit-<id>/audit/non-reference-patch.json \
  --denylist .tmp/deckkit-<id>/audit/content-leak-denylist.txt \
  --json > .tmp/deckkit-<id>/audit/content-leak-audit.json
```

先创建 `content-leak-denylist.txt`，每行一个规则；它至少包含参考 deck 的产品名、组织名、
专有指标名、来源、年份+主题组合、专有 callout 强调短语。避免只写 `Strategy`、
`Execution`、`Growth` 这类通用业务词；优先写参考专有短语（如 `phrase:Acme 2026 expansion`
或 `regex:\\bAcme\\s+FY26\\b`）。脚本支持 `word:`、`phrase:`、`contains:`、`regex:` 前缀；
无前缀时，单词按 whole-token 匹配，短语按空白归一化匹配。审计用的 patch 必须来自一份
**非参考主题 content**，不能直接使用 golden example patch；golden content 本来就包含参考文案，
用它审计会把正常 content 输出误报成 kit 泄漏。脚本命中时不要简单删词，要回到 schema、
layoutContract 和页型函数，确认该字符串应由 `content.json`、`data.labels` 或 asset slot 驱动。

**审计覆盖边界**：当前脚本检查 `set-text-frame/add-text-box/add-paragraph/set-paragraph/add-run/set-run`
的直接 `text` 字段、支持的原生表格单元格与经典图表类别/系列名。`ok: true` 不证明所有可见文本已检查；
其他图表变体/操作、拆成多个 run 的短语、继承文本和图片里的字不在完整覆盖范围内。根据本次实际输出补对应回归断言，并对非参考
content 构建后的 PPTX 做 inspect/文本提取与人工 review；不能把 `textCount: 0` 当作无泄漏证据。

**图片资产防线**：对 kit 源码、examples、benchmark fixture 和新增 assets 搜索参考 deck
提取出的图片文件名、hash、media 路径和 alt/name。除非是授权明确、跨 deck 可复用且用户确认的
品牌资产，否则命中即泄漏。图片页型应只冻结图片使用结构：slot 名、裁切规则、边框、caption、
callout 和缺失图片时的隐藏/占位策略。

借鉴成熟 kit 的契约细节：必填槽位（如 swiss-grid 的 eyebrow）是设计意图时就声明为
必填并在 catalog `layoutContract.slotHints` 给填写提示；条目超限走 schema
`maxItems` + fit diagnostics 报错，**不要静默 slice**；validate 通过但渲染时静默
丢弃的字段是契约缺陷，要么渲染要么从 schema 删掉。

## 2. Schema 与槽位

- 新页型注册进 `schemas/content.schema.json` 的 enum；
  每个页型写 `schemas/<id>/<slideType>.schema.json`。
- 覆盖：必填字段、数组 min/maxItems、tuple 结构、enum、`data.labels` 覆盖入口、
  rich text 强调字段（如 `calloutHighlights`）。
- 每个可见文本槽位写 `x-slotBudget`（至少 `maxLines`、`fontPt`、`widthIn`）；
  数值直接来自 Phase 0 的 style-spec 字号表和页型几何。
- 条目数上限来自 slide-inventory 的条目区间，写进 catalog `density.soft/hard`。

字体替换遵循用户授权，可选择已安装且风格相近的常用字体，并记录参考字体、替代字体和
主要视觉差异。不能只检查字体家族名：Latin 的重字体文件与 CJK fallback 的字重是两件事；
需要粗体的 CJK 标题须显式指定 bold，正文保留常规字重。逐页 canonical 和可用的原生宿主
均检查实际常规/粗体、混排、换行与意外倾斜，不为缺失字体重复索取已获授权的确认。

参考的全小写、Title Case 等排版应注明是文案偏好还是身份必需，不把一次性示例写成绝对规则。
大小写转换不得破坏专名、缩写或用户输入；调整示例大小写后重新检查标题宽度与换行。

合同路线用 `tools/generate-pptx-design-projections.mjs <id>` 生成预算、容量、布局和节奏投影，
随后运行 `--check`。投影必须保留该页型的 `assetSlots` 等有效元数据及既有翻新映射；
无现有映射时不得凭空添加翻新能力。为这些保留行为写回归断言。

胶囊等组件按文字自然宽度伸缩时，公开槽位预算应投影合同分配的可用容量；不要把短哨兵
实际占用的窄框当成字段上限。成对胶囊可以用均分区域作发现提示，最终仍检查两个真实字符串
的共同宽度。固定预算只是提示，不能替代逐实例解析，也不能误导后续 Agent 只能填几个字。

生成与一致性检查：

```bash
node pptx-nova/scripts/pptx-nova-deckkit-slots.mjs --deckkit <id>
node pptx-nova/scripts/pptx-nova-deckkit-slot-consistency.mjs --deckkit <id> --json
```

槽位检查器生成的单页探针须明确使用 `meta.designScope: "excerpt"`，避免完整 deck 的首尾
约束误拦截探针；不得为让单页探针通过而放松真实完整 deck 的约束。数字与单位使用 `add-run`
时，还须执行应用后的文字回读，确认追加文本进入正确段落；仅在 patch JSON 中找到哨兵不够。

判松紧：schema 通过但 build 报错 = schema 太松；schema 拒绝但 build 能跑 = 太紧。

## 3. catalog 注册

在 `assets/deckkits/catalog.json` 的 `entries` 新增条目，字段对照 swiss-grid 条目：
`id / version(0.1.0) / path / primitiveDependency / readiness(experimental 起步) /
qualityProfile / defaultFor / bestFor / coverage / supportedSlideTypes /
visualGrammar / layoutContract / diversityGate / density / validatedWith / quality /
knownLimits / examples / refurbishProfile`（`refurbishProfile` 可用
`node pptx-nova/scripts/pptx-nova-deckkit-refurbish-profile-fill.mjs --deckkit <id> --write` 生成）。

- `visualGrammar` 从 style-spec.md 直接提炼（`schemaVersion: pptx-nova-visual-grammar/v1`，
  positioning / mood / layoutPrinciples / signatureElements / compositionRules / avoid 字符串数组，
  typography / colorSystem / slideRhythm 对象）——
  production/default 必需，缺失会被 readiness audit 阻塞。
- `qualityProfile`：记录 kit 的质量约束，不能降低 canonical Create 的可读性下限；参考小字号
  按入口 SKILL 的规则适配，并同步 `x-slotBudget`、几何和 notes。
- `knownLimits` 第一条写明来源：`"Based on <ref.pptx>; ..."`（broadside / cartesian 先例）。
- generator DeckKit、`refurbishProfile` 和 xdoc 原生 skinning 是独立能力。不要因为 generator
  benchmark 通过就声明 `nativeSkinning` 或源稿无损保留；有此需求按主 skill 的 probe 与对应合同验证。

## 4. 验证与 build

```bash
node pptx-nova/assets/deckkits/validate-content.mjs \
  pptx-nova/assets/deckkits/examples/<id>-content.json \
  --deckkit <id> --mode delivery --json
node pptx-nova/scripts/pptx-nova-build.mjs \
  --deckkit <id> pptx-nova/assets/deckkits/examples/<id>-content.json \
  -o .tmp/deckkit-<id>/kit-patch.json --quality-json .tmp/deckkit-<id>/kit-quality.json
```

用 kit 产出的 deck 与 Phase 1 重建 deck 再做一轮 PNG 对比：组件化不允许引入视觉
回归。若 `fidelity-scope.md` 是 `scoped`，只把 rebuild set 用作视觉回归基线；未重建页
仍必须通过 validation、slot budget、density 和 benchmark 覆盖，不能因为 Phase 1 未重建就从
schema 或 examples 中消失。需要直接调试 `createDeck` 时才临时 import `.kit.mjs`；交付路径一律走
`pptx-nova-build.mjs` 通用 driver。

## 5. 测试（强制）

在 `tools/tests/pptx-nova-scripts.test.mjs` 中为新 kit 补：

- **最小合法 content build 测试**：每个页型构造最小 delivery content，
  validation 通过则 `createDeck` 必须不崩。
- **content leak regression**：检查页型实际生成的所有可见文本载体（包括使用到的
  chart/table、paragraph/rich runs；不能只搜三种 op），断言不出现参考专有主题词、产品名、指标或年份组合；
  rich text 页型断言 `data.calloutHighlights` 等字段能驱动 emphasis run。
- **参数化测试**：每个页型至少一个非参考主题的输入被正确渲染。
- **asset slot 测试**：Phase 1 登记过的 logo/截图/图片槽位若进入 Phase 2，必须验证缺失时
  delivery validation 报错或渲染为明确的空/隐藏状态；不能回退到参考 deck 图片。
- **reference image leak regression**：断言 kit、examples、benchmark fixtures 和新增 assets
  不包含参考 deck 的一次性图片文件名/hash/media 路径；允许项必须在 catalog knownLimits 或
  asset policy 中说明用户确认依据。

```bash
node --test tools/tests/pptx-nova-scripts.test.mjs
```

## 6. benchmark 与 readiness

在 `pptx-nova/benchmarks/visual/` 落 golden case 并登记 `index.json`：

- `golden-*`：直接用 `<id>-content.json`（即参考 deck 内容）。
- 每个 case 需要 `index.json` 条目（`id`=`<id>.<case>`、`deckkit`、`kind`、`contentPath`、
  `buildPath`、`expectedPath`、`reviewPath`），以及 `cases/<id>/<case>/expected.json`
  （`pptx-nova-visual-case/v1`）和 `review.md`；`buildPath` 指向 `examples/<id>-build.mjs` build 胶水。

必须额外审查 `stress-density` 和 `mixed-language`，但默认不要把这两个 case 写入
`benchmarks/visual/index.json` 或提交到 git。把临时 content、patch、PPTX、PNG、
contact sheet 和审查结论放在 `.tmp/deckkit-<id>/benchmark/stress-density/` 与
`.tmp/deckkit-<id>/benchmark/mixed-language/`。密度、多语言和长文案韧性应优先由 schema
slot budget、validation tests 和有针对性的非视觉单测覆盖，避免把不需要的视觉 benchmark
长期固化进仓库。只有当某个非 golden case 是真实长期回归风险时，才登记进 visual index；
一旦登记，readiness/catalog-update 会要求它和 golden 一起通过。

如果 Phase 1 使用 `scoped`，再补一个 `coverage-*` case：覆盖未重建页对应的页型、资产形态
和密度边界，防止 scope 缩减掩盖组件化缺口。

```bash
XDOC_FIELD_DATE=<YYYY-MM-DD> node pptx-nova/scripts/pptx-nova-deckkit-benchmark.mjs --deckkit <id> --all --repeat 3 --out .tmp/deckkit-<id>/benchmark/01
node pptx-nova/scripts/pptx-nova-deckkit-readiness.mjs --deckkit <id> --target candidate --benchmark-mode required-live --out .tmp/deckkit-<id>/benchmark/01 --json
node pptx-nova/scripts/pptx-nova-deckkit-catalog-update.mjs --deckkit <id> --readiness candidate --out .tmp/deckkit-<id>/benchmark/01 --write
```

三条命令必须使用**同一个本轮新建的 `--out`**，不要读取默认共享目录里的旧 summary。
上例为 POSIX shell 环境变量写法；Nushell 使用 `with-env { XDOC_FIELD_DATE: '<YYYY-MM-DD>' } { ... }`。
`--repeat 3` 检查重复 validation/build，不代表三次独立渲染或人工审查。不要加 `--clean` 删除旧证据；
下一轮换 `benchmark/02`。正式更新 catalog 前查看 readiness JSON 与将写入的 benchmark 结论。
修复已有 kit 时保留既有 readiness，不因为复用示例而降为 candidate；只有新 kit 默认到 candidate。

从 summary 的实际路径取完整 golden PPTX，按 `rebuild-high-fidelity.md` 对它执行一次冻结日期的
canonical Create 并逐页 review 其 PNG；benchmark 的成功或历史 low baseline 都不能替代该门禁。
golden 及本次准备接受的构图变体、stress、mixed-language 每页都按
[visual-acceptance.md](visual-acceptance.md) 检查，保留逐页结果和关键局部证据。
reference 与 kit 产物若不完全相同，先用当前同一 runtime/日期重新渲染两者，再判定是否组件化回归。

vision low 出现 `new`/`changed` 时先人工 review PNG，确认是可接受噪声才
`--update-baseline`。本 skill 默认推进到 **candidate** 即停；`production` 需要
人工逐页 PNG review 后由用户确认，再带
`--manual-hard-defects 0 --readiness production --confirm-manual-png-review --write`。
promotion 的 catalog-update 同样传本轮 `--out`，不能重新读取共享默认目录。
用户可见 showcase（`assets/examples/<id>/`）用 `just deckkit-examples` 维护，
通常在 production 阶段才补。

## 7. core-primitives 修改门槛

默认不动。仅当同时满足：

1. 该逻辑换主题色/间距后仍正确（README 职责边界表）；
2. 至少两个 kit 需要，或属于明确的几何安全/op 生成通用能力；
3. 用户确认。

动了就必须跑全部现有 DeckKit 的 validation tests 和受影响 kit 的 benchmark。
做不到三条，就把 helper 留在 `<id>.kit.mjs` 内部。

## 8. 收尾清单

- [ ] kit / schemas / example content / catalog / benchmark cases / tests 全部落盘
- [ ] slots + slot-consistency 通过；validate-content delivery 模式通过
- [ ] kit 产出 deck 与 Phase 1 重建 deck PNG 对比无回归；若 scoped，未重建页有 coverage benchmark
- [ ] `content-leak-audit.mjs` 通过，审计 JSON 保留在 run 目录
- [ ] validation tests（含 content leak regression）通过
- [ ] golden benchmark 通过；stress-density 和 mixed-language 已在 `.tmp` 审查并记录；
      readiness audit 达到 candidate
- [ ] 完整 golden 的 canonical Create 通过且已逐页 review；benchmark/readiness/catalog 使用同轮证据目录和冻结日期
- [ ] 若改了默认行为/文档：按维护者仓库 skill-dev-guide §8.2 同步清单检查 pptx-nova 各文档
- [ ] `git diff --check`；按仓库规范提交（English Conventional Commit）
