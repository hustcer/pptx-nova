# Feedback Mode

Use Feedback Mode when the user explicitly asks for skill feedback, such as
`need feedback`, `给反馈`, `需要反馈`, `有什么使用反馈`, or asks to audit a previous
pptx-nova run for workflow friction.

Feedback Mode is an add-on to the user's main task. Complete the requested PPTX
generation, edit, export, or investigation first, then add skill feedback from
the perspective of a pptx-nova workflow reviewer.

## What To Capture

- Record actual skill usage problems, such as unclear reference routing,
  excessive command chains, unstable DeckKit selection, hard-to-act-on
  dry-run/vision output, weak repair suggestions, slot/budget doc mismatch, or
  missing examples.
- For each issue, propose the best fix for `pptx-nova`: documentation, script,
  DeckKit schema, benchmark, catalog, xdoc capability, or final response
  convention.
- Separate these classes clearly: existing capability not used by the agent,
  current tool gap, documentation guidance gap, stale historical run evidence,
  or expected manual review boundary.
- Keep the feedback focused on workflow friction, cognitive load, validation
  closure, and maintainability. Do not turn it into generic praise or a design
  review of the user's slide content.

## Current-Capability Check

When feedback audits an old run, compares behavior after an upgrade, or says a
capability is missing, verify the current state before concluding:

1. Re-probe the current `xdoc` runtime when relevant.
2. Check current references and command/schema/help evidence.
3. Treat old run artifacts as historical observations, not current capability
   facts.
4. If the issue only existed because an agent skipped an existing documented
   path, say that directly.

## Output Location

- If there are 1-3 short feedback points, include them directly in the current
  conversation under `SKILL 使用反馈`.
- If there are more than 3 feedback points, or the feedback needs evidence,
  categories, priorities, or longer explanations, write it to
  `<run-dir>/skill-feedback.md` and mention that path in the final response.
- When the task already has a run directory, use that current run directory. If
  the user only asks for standalone feedback and no run exists, create a small
  feedback run directory under `.pptx-nova/<slug>-<timestamp>/` and place
  `skill-feedback.md` there.
- Do not save feedback outside the run directory unless the user explicitly asks
  for another location.

## Suggested Report Shape

For file-based feedback, use this compact structure:

```markdown
# pptx-nova SKILL 使用反馈

任务：...
时间：...

## 总体评价

...

## 具体反馈

### 1. ...

- 现象：
- 影响：
- 建议：
- 状态分类：文档引导不足 / 工具缺口 / 已有能力未使用 / 历史 run 过期

## 建议优先级

1. ...
```
