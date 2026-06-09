# Design Lock and Assets

本文件定义 `pptx-nova` 的轻量运行契约：`deck_lock.json`、按需生成的 `assets_manifest.json`、
split handoff 使用的 `resume_manifest.json` 和 `pptx-nova-check-lock.mjs`。它们只服务 s8fy 原生 PPTX / DeckKit / patch
工作流，不引入 SVG executor、逐页手写或 `spec_lock.md` 阶段。

## 1. 何时生成

创建型 deck 在 `outline.json` 之后、`content.json` / `patch.json` 之前生成：

```
prompt / 用户大纲
  -> outline.json
  -> deck_lock.json (+ assets_manifest.json when external/reused assets exist)
  -> resume_manifest.json (only when split handoff is chosen)
  -> DeckKit content.json 或 patch.json
  -> check-lock
  -> dry-run -> apply -> vision-check -> PNG
```

Express 模式自动推断并继续，不阻塞用户。Studio / 高风险模式先做一次短确认，
确认后把决策写入 `deck_lock.json`，后续不再凭记忆改风格。
当用户选择 split，或长 deck / 高风险 deck 需要换新会话继续时，在 `deck_lock.json` 和必要的
`assets_manifest.json` 完成后写 `resume_manifest.json` 并停止；恢复规则见
`references/resume-split-mode.md`。

修改已有 deck 时也可以生成 `deck_lock.json`，但只锁定本次允许修改的范围、品牌约束、
资源和输出路径；不要强行要求 slide count 与源 deck 完全一致。

## 2. Studio 确认包

Studio / 高风险场景只做一次 bundled confirmation，内容保持短：

1. 画布与输出比例
2. 页数与页序
3. 目标受众与使用场景
4. 风格目标与密度
5. 色彩 / 品牌来源
6. 字体策略
7. 公式策略（`mixed` / `text-only` / `rendered` / `native-omml`，无公式时写 `none`）
8. 图标 / 图表风格
9. 图片 / logo / 第三方素材策略

用户已经明确给出的项直接采用，不重复追问。缺项能合理推断时给推荐值；只有品牌口径、
页序、敏感数据、外部素材授权或输出路径存在真实风险时才阻塞。

## 3. `deck_lock.json` 最小结构

`deck_lock.json` 是 run 级 source of truth，负责锁定“本轮生成为什么样的 deck”。
它不保存完整正文，也不替代 `content.json`。

```json
{
  "schemaVersion": "pptx-nova-deck-lock/v1",
  "mode": "express",
  "objective": "Q2 business review for leadership",
  "outlinePath": "outline.json",
  "contentPath": "content.json",
  "patchPath": "patch.json",
  "assetsManifestPath": "assets_manifest.json",
  "output": {
    "finalPptx": "/abs/path/q2-review.pptx",
    "runDir": "/abs/path/.pptx-nova/q2-review-20260609-153000"
  },
  "canvas": {
    "format": "ppt169",
    "width": "13.333in",
    "height": "7.5in"
  },
  "deckkit": {
    "id": "consulting-dark",
    "readiness": "production"
  },
  "themePack": {
    "id": "corporate-blue"
  },
  "stylePack": {
    "id": "consulting"
  },
  "colors": {
    "background": "FFFFFF",
    "text": "1F1F1F",
    "primary": "1A73E8",
    "success": "34A853",
    "warning": "FBBC04",
    "risk": "EA4335"
  },
  "typography": {
    "title": "Inter, Source Han Sans SC, Microsoft YaHei, sans-serif",
    "body": "Inter, Source Han Sans SC, Microsoft YaHei, sans-serif",
    "code": "Consolas, Courier New, monospace",
    "formulaPolicy": "mixed",
    "formulaFallback": "rendered",
    "mathFont": "Cambria Math, Latin Modern Math, Noto Sans Math",
    "bodyPtMin": 10.5,
    "labelPtMin": 9
  },
  "icons": {
    "library": "tabler-outline",
    "style": "outline",
    "inventory": ["chart-line", "users", "target"]
  },
  "templateFusion": {
    "sources": [
      { "kind": "brand", "id": "acme-brand", "path": "assets/brands/acme/profile.json" },
      { "kind": "layout", "id": "executive-grid" }
    ],
    "identityFrom": "brand:acme-brand",
    "structureFrom": "layout:executive-grid",
    "deckFrom": null
  },
  "slides": [
    {
      "index": 0,
      "title": "Q2 performance review",
      "purpose": "Frame the quarter and decision needed",
      "slideType": "heroSlide",
      "rhythm": "anchor",
      "assets": ["company_logo"]
    },
    {
      "index": 1,
      "title": "Revenue and retention",
      "purpose": "Show core KPI trend",
      "slideType": "kpiRowSlide",
      "rhythm": "dense",
      "chart": { "kind": "column", "semanticSource": "content.slides[1].data" },
      "formulas": []
    }
  ],
  "assumptions": ["No user-provided brand guide; use corporate-blue consulting defaults."]
}
```

字段取舍原则：

- 必填：`schemaVersion`、`mode`、`slides[]`、`canvas`、输出路径或 run 目录。
- 创建型：写 `deckkit`、`themePack`、`stylePack`、`colors`、`typography`。
- 技术 / 学术 / 培训 deck：在 `typography.formulaPolicy` 写公式策略，并在相关 slide
  用 `formulas[]` 引用公式资产 id；详情见 `references/formulas.md`。
- 使用模板资产：写 `templateFusion`，并记录每个来源的 kind/id/path。
- 使用图片/logo/外部素材：才写 `assetsManifestPath`，并让 slide 通过 asset id 引用。
- 不确定项写进 `assumptions[]`，不要在后续 generator 里隐式改掉。

## 4. `assets_manifest.json`

`assets_manifest.json` 只在使用外部图片、logo、复用素材、数据截图或本轮生成资源时创建；
纯 DeckKit/native shape deck 不要创建空 manifest。它只管资源可用性、来源和 PPTX 使用方式。
所有临时资源放在 run 目录或其子目录，例如 `.pptx-nova/<run>/assets/`。
如果 manifest 里有 `kind: "formula"` 且状态还不是 `rendered` / `native` / `available`，
先运行 `node <skill-root>/scripts/pptx-nova-formula-render.mjs assets_manifest.json`
批量生成 SVG 并回写状态，再生成引用这些资源的 patch。

```json
{
  "schemaVersion": "pptx-nova-assets-manifest/v1",
  "assetRoot": "assets",
  "entries": [
    {
      "id": "company_logo",
      "kind": "logo",
      "status": "available",
      "path": "assets/company-logo.png",
      "source": {
        "kind": "user",
        "originalPath": "/abs/path/company-logo.png",
        "licenseNote": "Provided by user for this deck"
      },
      "pptxUse": {
        "role": "brand-mark",
        "crop": "contain",
        "noCrop": true
      }
    },
    {
      "id": "objective_loss",
      "kind": "formula",
      "status": "rendered",
      "path": "assets/formulas/objective_loss.svg",
      "source": {
        "kind": "formula",
        "latex": "L(\\theta)=\\sum_{i=1}^{n}(y_i-f_\\theta(x_i))^2",
        "display": "block"
      },
      "pptxUse": {
        "role": "formula-block",
        "crop": "contain",
        "noCrop": true
      }
    },
    {
      "id": "formula_native_example",
      "kind": "formula",
      "status": "native",
      "source": {
        "kind": "formula",
        "latex": "E=mc^2",
        "display": "inline"
      },
      "pptxUse": {
        "role": "formula-inline",
        "noCrop": true
      }
    },
    {
      "id": "hero_photo",
      "kind": "image",
      "status": "placeholder",
      "source": {
        "kind": "placeholder",
        "reason": "User has not supplied approved campaign photo"
      },
      "pptxUse": {
        "role": "hero-background",
        "crop": "cover"
      }
    }
  ]
}
```

`status` 语义：

| status        | 含义                             | 是否阻塞交付 |
| ------------- | -------------------------------- | ------------ |
| `available`   | 文件或内置资源已可用             | 否           |
| `built-in`    | 来自 skill 内置图标/模板         | 否           |
| `generated`   | 本轮生成并已落在 run 目录        | 否           |
| `rendered`    | 本轮由 LaTeX/公式 manifest 渲染  | 否           |
| `native`      | 本轮写入 PowerPoint 原生公式对象 | 否           |
| `placeholder` | 可用于草稿，正式交付需确认       | 通常阻塞     |
| `needs-user`  | 缺用户提供或授权确认             | 是           |
| `missing`     | manifest 中声明但文件不存在      | 是           |

公式资源使用 `kind: "formula"`，`source.kind: "formula"`，并保留原始 `latex` 与
`display`。公式必须 `pptxUse.noCrop: true`；若正式交付仍是 `placeholder` 或
`needs-user`，视为阻塞。更多策略见 `references/formulas.md`。

## 5. `resume_manifest.json`

`resume_manifest.json` 只在 split handoff 时创建。它不是设计锁，也不参与 PPTX 生成；它告诉新会话
当前 run 是否已经完成 Phase A、需要哪些文件、下一步从哪里继续。

最小要求：

- `schemaVersion: "pptx-nova-resume/v1"`。
- `phase: "ready-for-execution"`。
- `runDir` 与 `deck_lock.output.runDir` 一致。
- `finalPptx` 与 `deck_lock.output.finalPptx` 一致。
- `requiredFiles` 至少包含 `outline.json`、`deck_lock.json`、`resume_manifest.json`。
- 如果需要外部、复用、生成资源或公式，`requiredFiles` 必须列出 `assets_manifest.json`，且正式交付不得有
  `missing` / `needs-user` / 未授权或未确认的 `placeholder` 阻塞项。
- 如果 `outline.json` 不足以承载完整事实，必须列出 `source_brief.md` 或可读取的 source 文件。

Phase B 恢复时先读取 manifest 做 sanity check；通过后才生成 `content.json` / `patch.json`。
不要从旧会话记忆补写缺失的 `outline.json`、`deck_lock.json` 或资源清单。

完整 schema 和 handoff 模板见 `references/resume-split-mode.md`。

## 6. Lock Drift Check

在生成 `patch.json` 后、`s8fy pptx apply --dry-run` 前运行：

```bash
node <skill-root>/scripts/pptx-nova-check-lock.mjs \
  --lock deck_lock.json \
  --content content.json \
  --patch patch.json \
  --json
# 有 assets_manifest.json 时加：--assets assets_manifest.json
```

检查范围：

- `deck_lock.json` 和 `assets_manifest.json` schemaVersion。
- lock 的 slide count / slideType 与 `content.json` 是否一致。
- DeckKit、themePack 等关键选择是否漂移。
- `assets_manifest.json` 是否有 missing / needs-user / 重复 id / 不存在的文件。
- patch 是否为 `schemaVersion: 1`，是否使用 lock 外颜色、字体或绝对资源路径。
- patch 里任何 `assetSource.path` 是否登记在 `assets_manifest.json`；只要 patch 引用外部资源，
  `--assets` 就是必需项。

默认策略是“硬错误拦真实漂移，颜色/字体越界先 warning”。正式品牌合规或客户交付时，
加 `--strict-colors --strict-fonts` 把 lock 外颜色/字体也变成 error。

`check-lock` 不是 `dry-run` 的替代品：它只证明生成材料没有偏离设计锁；schema 语义、
selector、visualRisks 仍交给 `s8fy pptx apply --dry-run --json`。

## 7. 与 DeckKit / generator 的关系

- DeckKit-first：`deck_lock.json` 锁定 DeckKit 和主题；`content.json` 只放数据。
  如果 `content.json` 需要改 slide type，应先更新 lock。
- 手写 patch：`deck_lock.json` 锁定颜色、字体、资源、页型；patch 只实现这些决策。
- Reference Create：参考 deck 的可复用部分先进入 `templateFusion` 和
  `assets_manifest.json`（仅当允许复用或需要补齐资源时），不要把参考页旧文字、旧图片隐式带入新 deck。
- Edit：lock 可只覆盖本次允许改的范围；不要要求所有源 deck 颜色都被 lock 枚举。
