import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runNode, runNodeStatus, skillPath } from '../helpers/common.mjs'

test('feedback gate recognizes give feedback and provide feedback prompts', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-feedback-trigger-'))
  const runDir = join(root, 'run')
  const promptPath = join(runDir, 'prompt.txt')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(promptPath, 'Give feedback, and please provide feedback on the workflow.')
  writeFileSync(
    join(runDir, 'skill-feedback.md'),
    '# pptx-nova SKILL 使用反馈\n\n具体反馈已完成。\n',
  )

  const result = runNode([
    skillPath('scripts/cli/review/feedback-gate.mjs'),
    '--run-dir',
    runDir,
    '--prompt-file',
    promptPath,
    '--strict',
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'pass')
  assert.equal(report.requirement.required, true)
  assert.equal(report.requirement.source, 'prompt-trigger')
  assert.deepEqual(report.requirement.matchedTriggers, ['give-feedback', 'provide-feedback'])
})

test('feedback gate validates create process scorecard and prints it in text mode', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-feedback-create-scorecard-'))
  const runDir = join(root, 'run')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(
    join(runDir, 'skill-feedback.md'),
    `# pptx-nova SKILL 使用反馈

## 总体评价

创建流程完成，以下评分来自当前 run 的验证证据。

## 执行过程评分

| 维度 | 分数 | 评价 |
| --- | ---: | --- |
| 需求与内容准确性（20%） | 8 / 10 | 大纲和最终内容一致，假设已披露。 |
| 最终文件可靠性（18%） | 9 / 10 | 最终文件可打开并绑定到候选文件。 |
| 验证闭环（17%） | 8 / 10 | 核心 gate 完整，低风险检查已复核。 |
| 视觉设计质量（15%） | 7 / 10 | 层级清楚，但部分页面节奏仍可加强。 |
| DeckKit 与 op 使用正确性（12%） | 9 / 10 | DeckKit slot 和 op 均按合同执行。 |
| 异常恢复与状态管理（10%） | 8 / 10 | 候选状态清晰，失败后可安全续跑。 |
| 流程效率（8%） | 7 / 10 | 有一次重复预览，其他步骤较精简。 |

加权综合评分：8.1 / 10
`,
  )

  const result = runNode([
    skillPath('scripts/cli/review/feedback-gate.mjs'),
    '--run-dir',
    runDir,
    '--prompt',
    'Create a new presentation and give feedback on the workflow.',
    '--workflow',
    'create',
    '--strict',
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'pass')
  assert.equal(report.workflow.id, 'create')
  assert.equal(report.processScorecard.status, 'pass')
  assert.equal(report.processScorecard.rows.length, 7)
  assert.equal(report.processScorecard.reportedWeightedScore, 8.1)
  assert.equal(report.processScorecard.computedWeightedScore, 8.1)

  const textResult = runNode([
    skillPath('scripts/cli/review/feedback-gate.mjs'),
    '--run-dir',
    runDir,
    '--prompt',
    'Create a new presentation and give feedback on the workflow.',
    '--workflow',
    'create',
    '--strict',
    '--overwrite',
  ])
  assert.match(textResult.stdout, /\| 需求与内容准确性（20%） \| 8 \/ 10 \|/)
  assert.match(textResult.stdout, /加权综合评分：8\.1 \/ 10/)
})

test('feedback gate rejects refurbish feedback without the required scorecard', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-feedback-refurbish-scorecard-'))
  const runDir = join(root, 'run')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(
    join(runDir, 'skill-feedback.md'),
    '# pptx-nova SKILL 使用反馈\n\n## 总体评价\n\n翻新流程反馈已完成。\n',
  )

  const result = runNodeStatus(
    [
      skillPath('scripts/cli/review/feedback-gate.mjs'),
      '--run-dir',
      runDir,
      '--prompt',
      'Refurbish this deck and give feedback.',
      '--workflow',
      'refurbish',
      '--strict',
      '--json',
    ],
    2,
  )
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'fail')
  assert.equal(report.processScorecard.required, true)
  assert.equal(report.processScorecard.passed, false)
  assert.match(report.processScorecard.errors.join('\n'), /missing section/)
  assert.match(report.agentSummary.message, /seven-dimension process scorecard/)
})

test('feedback gate accepts the exact refurbish dimensions and weights', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-feedback-refurbish-valid-'))
  const runDir = join(root, 'run')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(
    join(runDir, 'skill-feedback.md'),
    `# pptx-nova SKILL 使用反馈

## 执行过程评分

| 维度 | 分数 | 评价 |
| --- | ---: | --- |
| 内容保真（20%） | 8 / 10 | 页数、文本和对象语义均已对账。 |
| 最终文件可靠性（18%） | 8 / 10 | 最终文件通过打开检查并完成哈希绑定。 |
| 验证闭环（17%） | 8 / 10 | 保真、视觉和发布 gate 均已闭环。 |
| 视觉翻新质量（15%） | 8 / 10 | 目标 DeckKit 风格在全 deck 中清晰可见。 |
| op 使用正确性（12%） | 8 / 10 | selector 和 op 结果均有 dry-run 与 inspect 证据。 |
| 异常恢复与状态管理（10%） | 8 / 10 | 当前候选和历史证据边界清晰。 |
| 流程效率（8%） | 8 / 10 | 没有不必要的候选分叉或重复全量渲染。 |

加权综合评分：8.0 / 10
`,
  )

  const result = runNode([
    skillPath('scripts/cli/review/feedback-gate.mjs'),
    '--run-dir',
    runDir,
    '--prompt',
    'Refurbish the existing deck and give feedback.',
    '--workflow',
    'refurbish',
    '--strict',
    '--json',
  ])
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'pass')
  assert.deepEqual(
    report.processScorecard.rows.map((row) => row.dimension),
    [
      '内容保真',
      '最终文件可靠性',
      '验证闭环',
      '视觉翻新质量',
      'op 使用正确性',
      '异常恢复与状态管理',
      '流程效率',
    ],
  )
  assert.equal(report.processScorecard.computedWeightedScore, 8)
})

test('feedback gate rejects translation scorecard with an incorrect weighted score', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-feedback-translation-scorecard-'))
  const runDir = join(root, 'run')
  mkdirSync(runDir, { recursive: true })
  writeFileSync(
    join(runDir, 'skill-feedback.md'),
    `# pptx-nova SKILL 使用反馈

## 执行过程评分

| 维度 | 分数 | 评价 |
| --- | ---: | --- |
| 翻译完整性与准确性（20%） | 8 / 10 | 所有可见文本均已分类处理。 |
| 布局与格式保真（18%） | 8 / 10 | 布局和富文本样式保持稳定。 |
| 最终文件可靠性（17%） | 8 / 10 | 文件结构有效且可编辑。 |
| 验证闭环（15%） | 8 / 10 | 翻译和视觉 gate 均已执行。 |
| 文本替换与布局修复 op 正确性（12%） | 8 / 10 | 替换目标和修复范围准确。 |
| 异常恢复与状态管理（10%） | 8 / 10 | unit id 和候选状态稳定。 |
| 流程效率（8%） | 8 / 10 | 扫描和渲染结果得到复用。 |

加权综合评分：9.0 / 10
`,
  )

  const result = runNodeStatus(
    [
      skillPath('scripts/cli/review/feedback-gate.mjs'),
      '--run-dir',
      runDir,
      '--prompt',
      'Translate this presentation and provide feedback.',
      '--workflow',
      'translation',
      '--strict',
      '--json',
    ],
    2,
  )
  const report = JSON.parse(result.stdout)

  assert.equal(report.status, 'fail')
  assert.equal(report.processScorecard.computedWeightedScore, 8)
  assert.match(report.processScorecard.errors.join('\n'), /weighted overall score mismatch/)
})
