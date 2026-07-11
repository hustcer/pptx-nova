# Edit Contract

Read this reference for Micro Edit, ordinary Edit, and Structural Edit workflows.
Translation and Refurbish already have specialized coverage/fidelity contracts;
do not duplicate those sidecars unless a separate local repair is performed.

`edit-contract.json` is the run-level source of truth for an existing-deck edit:
what may change, what must stay unchanged, which dry-run ops own each target,
and which evidence must pass before publication. It does not replace inspect,
patches, xdoc dry-run, semantic diff, visual review, or structural gates.

When the current deck has explicit future/carryover rules, first follow
`session-rules.md`. A passed `session-rules-resolution.json` is compiled into
this contract; session rules never form a parallel execution or delivery gate.

## Workflow

```text
inspect/select
  -> edit-contract-draft.json
  -> pptx-nova-edit-contract.mjs
  -> edit-contract.json
  -> patch + dry-run
  -> apply into run directory
  -> semantic diff + scoped evidence
  -> evidence-manifest.json
  -> pptx-nova-edit-contract-gate.mjs
  -> publish only when agentGate.passed=true
```

Create the contract after target resolution and before writing/applying the
patch. The generator hashes the current source PPTX. If the source later
changes, the gate returns `nextAction: "refresh-inspect"`; do not reuse old
inspect/select/selector evidence.

## Draft Shape

The agent authors a small draft. Slide indexes and `opIndexes` are 0-based.
`selector` should copy the inspect/select-proven patch selector shape.

```json
{
  "schemaVersion": "pptx-nova-edit-contract/v1",
  "request": "Rename the cover title without changing another object",
  "scope": "single-object",
  "operationKind": "text-edit",
  "source": {
    "inspectPath": "inspect.json",
    "selectPaths": ["select.json"]
  },
  "targets": [
    {
      "id": "cover-title",
      "slide": 0,
      "opIndexes": [0],
      "selector": { "shape": { "id": 5 } },
      "resolvedIdentity": { "slide": 0, "id": 5, "name": "Cover Title" },
      "expected": {
        "beforeText": "Old title",
        "afterText": "New title",
        "changeCategories": ["text"]
      }
    }
  ],
  "coverage": {
    "required": true,
    "expectedTargetCount": 1
  },
  "allowedChanges": ["text"],
  "preserve": ["slide-count", "non-target-shapes", "target-text-style"],
  "requiredEvidence": ["dry-run", "semantic-diff", "style-diff", "png-preview", "vision-diff"]
}
```

Generate the normalized contract:

```bash
node <skill-root>/scripts/pptx-nova-edit-contract.mjs \
  --draft <run-dir>/edit-contract-draft.json \
  --source source.pptx \
  --output <run-dir>/edit-contract.json \
  --json
```

When a session-rules resolver returned a passed overlay:

```bash
node <skill-root>/scripts/pptx-nova-edit-contract.mjs \
  --draft <run-dir>/edit-contract-draft.json \
  --source source.pptx \
  --session-rules-resolution <run-dir>/session-rules-resolution.json \
  --output <run-dir>/edit-contract.json \
  --json
```

The normalizer verifies the rules/operation/resolution hashes and source
revision, merges rule-owned targets and preserve requirements, and expands
required target coverage. Do not manually copy resolver targets into the draft.

The generator validates target IDs, target count, op indexes, evidence names,
stable selector identity, and source existence, then writes the absolute source path, SHA-256, and byte
length. Use `--overwrite` only for the current run after refreshing target
evidence.

Direct id/name selectors are normalized into `resolvedIdentity`. Query or
placeholder selectors must explicitly carry the inspect/select-proven resolved
id or name; a slide-only identity is rejected. Mark an unchanged target with
`expected.alreadyCompliant: true` only when its declared before/after values
match and dry-run still resolves the intended object.

Structural scope additionally declares expected slide delta, changed slides,
and allowed object types:

```json
{
  "expectedStructure": {
    "slideCountDelta": 1,
    "changedSlides": [3],
    "objectTypes": ["textBox", "picture"]
  }
}
```

Use `kind: "slide"` for a newly added/removed whole-slide target that has no
pre-existing shape identity. Slide targets are valid only for structural scope;
ordinary object targets still require a stable resolved id or name.

Rule-owned produced objects use `kind: "object"`, `produced: true`, and a stable
shape name declared by `session-operation.json`. Their
`expected.sessionRulePostconditions[]` are limited to machine-verifiable
`font-color` and `fill-color` values.

## Evidence Policy

Choose the smallest policy that can prove the requested edit:

| Edit kind                          | Required evidence                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Notes/core metadata only           | `dry-run`, `semantic-diff`                                                                              |
| Visible single-object text         | `dry-run`, `semantic-diff`, `style-diff`, `png-preview`, `vision-diff`                                  |
| Visible multi-target/batch text    | Same as visible text, covering every target slide                                                       |
| Single-object fill/line/font style | `dry-run`, `semantic-diff`, `png-preview`, `vision-diff`                                                |
| Geometry/image/layout              | Above plus `final-inspect`; add `structure-check` when package risk warrants it                         |
| Structural edit                    | `dry-run`, `semantic-diff`, `png-preview`, `vision-diff`, `final-inspect`, and normal structural audits |

For text-only edits that must preserve formatting, include
`preserve: ["target-text-style"]` and require `style-diff`:

```bash
xdoc pptx i18n-style-diff \
  --source source.pptx \
  --candidate <run-dir>/candidate.pptx \
  --json > <run-dir>/style-diff.json
```

The command name is translation-oriented, but its textless OOXML signature is
also the strongest available evidence that an ordinary text replacement kept
neighboring `a:rPr`, `a:pPr`, and `a:bodyPr` structure. A whole-frame
`set-text` can pass dry-run, semantic diff, and vision-check while destroying
small footer/run styling. When style fidelity matters, prefer inspect-proven
`set-run`/run-level edits or another text-node preserving path.

For visible edits, prefer a changed-scope differential visual gate:

```bash
xdoc pptx vision-diff \
  --source source.pptx \
  --candidate <run-dir>/candidate.pptx \
  --slides <1-based-target-slides> \
  --json > <run-dir>/vision-diff.json
```

`vision-diff` allows inherited source issues but blocks newly introduced or
worsened high/medium issues. A candidate-only `vision-check` remains useful for
diagnosis, but it cannot reliably distinguish a regression from pre-existing
noise in a dense legacy deck.

## Final Gate

After the candidate and evidence are stable:

```bash
node <skill-root>/scripts/pptx-nova-edit-evidence-manifest.mjs \
  --candidate <run-dir>/candidate.pptx \
  --evidence semantic-diff=<run-dir>/pptx-diff.json \
  --evidence style-diff=<run-dir>/style-diff.json \
  --evidence png-preview=<run-dir>/preview.json \
  --evidence vision-diff=<run-dir>/vision-diff.json \
  --output <run-dir>/evidence-manifest.json \
  --json
```

The manifest binds the current candidate SHA-256 to the exact SHA-256 of each
post-apply evidence file. Regenerate it whenever the candidate or evidence
changes.

```bash
node <skill-root>/scripts/pptx-nova-edit-contract-gate.mjs \
  --contract <run-dir>/edit-contract.json \
  --candidate <run-dir>/candidate.pptx \
  --dry-run <run-dir>/dry-run.json \
  --diff <run-dir>/pptx-diff.json \
  --style-diff <run-dir>/style-diff.json \
  --preview <run-dir>/preview.json \
  --vision-diff <run-dir>/vision-diff.json \
  --evidence-manifest <run-dir>/evidence-manifest.json \
  --output <run-dir>/edit-contract-gate.json \
  --overwrite --strict --json
```

Omit optional evidence flags only when that evidence is not listed in
`requiredEvidence`. Defaults are resolved beside the contract.

The gate checks:

- current source SHA-256 matches the contract;
- the candidate exists and every loaded report names the same source/candidate;
- the evidence manifest binds current candidate bytes and every post-apply
  report hash; mtime freshness is a supplemental stale-candidate signal;
- every required target owns successful dry-run `opResults[]`;
- every dry-run op index is owned by a contract target;
- dry-run `resolvedSelectors[]` and semantic targets match the contract;
- semantic diff source text still matches declared `beforeText` and the final
  candidate matches declared `afterText` when those guards are present;
- dry-run and reliable diff change categories stay inside `allowedChanges`;
- reliable shape changes stay inside resolved contract targets;
- slide count remains stable when `preserve` includes `slide-count`;
- style signatures pass when `style-diff` is required;
- preview and declared vision/vision-diff evidence cover every 1-based target slide;
- vision-diff introduces or worsens no high/medium issues on that scope;
- optional final inspect/structure reports are successful when required.
- structural slide delta, changed slides, and object types match
  `expectedStructure` when declared.
- bound session-rules artifacts are unchanged and still match the contract
  source revision/deck id;
- every applicable produced-object rule is present in final inspect and the
  candidate PPTX bytes contain its required font/fill value.

Derived slide `summaryChanges` are not treated as separate out-of-scope edits:
legitimate text changes can alter keywords and density summaries. Only reliable
shape changes and explicit slide add/remove counts are machine locality facts.
Uncertain/unsupported semantic-diff regions remain `attention` and must be
paired with scoped visual review; they are not proof of pass or failure.

## Stable Next Actions

Read `edit-contract-gate.json.agentGate` first:

| `nextAction`                            | Meaning                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `refresh-inspect`                       | Source hash changed or source is missing; rebuild target evidence and contract              |
| `regenerate-current-candidate-evidence` | A report belongs to another source/candidate; regenerate evidence from the stable candidate |
| `retry-dry-run-with-fix-patch`          | Dry-run itself did not succeed                                                              |
| `rebind-selectors`                      | Target op exists but did not resolve to the contract selector                               |
| `complete-missing-coverage`             | One or more required targets/expected values were not covered                               |
| `retry-with-style-preserving-text-edit` | Text changed non-text OOXML style structure                                                 |
| `repair-new-visual-regressions`         | Changed slides contain new/worsened high or medium visual issues                            |
| `review-out-of-scope-changes`           | Reliable changes escaped the contract or changed forbidden categories                       |
| `verify-changed-scope`                  | Required preview/vision evidence is missing or incomplete                                   |
| `run-structure-audit`                   | Required package structure evidence failed                                                  |
| `refresh-session-rules-resolution`      | Bound rules/operation/resolution changed; resolve and regenerate the contract               |
| `apply-session-rules`                   | Candidate bytes do not satisfy an applicable rule postcondition                             |
| `block-and-request-user-decision`       | A remaining blocker has no safe automatic repair                                            |
| `publish`                               | Machine contract passed; finish required PNG review before delivery                         |

`publish` does not waive manual PNG/contact-sheet review. It means the machine
contract, target coverage, locality, and declared evidence passed.

## Boundaries

- Do not create targets by guessing selectors. Contract selectors come from
  current inspect/select evidence.
- Do not list broad `allowedChanges` merely to make the gate pass.
- If a deliberate new target is discovered, update the draft and regenerate
  the contract before applying it.
- Contract targets describe allowed edits, not every derived summary signal.
- Translation uses i18n unit/source-hash coverage; Refurbish uses its
  plan/reference-map/fidelity/content audit. Do not weaken those specialized
  gates by replacing them with the generic contract.
- Keep `edit-contract.json`, `evidence-manifest.json`, and `edit-contract-gate.json` in the retained run
  evidence package.
