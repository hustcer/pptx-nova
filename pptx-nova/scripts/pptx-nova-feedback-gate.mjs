#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-feedback-gate.mjs --run-dir <dir> [options]

Check whether Feedback Mode was requested and whether skill-feedback.md exists
before the final response.

Options:
  --run-dir <dir>          Required current pptx-nova run directory.
  --prompt <text>          Original user prompt or task text.
  --prompt-file <path>     File containing the original user prompt or task text.
  --require-feedback       Force feedback to be required even if no trigger is detected.
  --output <path>          Write gate JSON. Defaults to <run-dir>/feedback-gate.json.
  --write-template         Create a TODO skill-feedback.md template when required and missing.
  --overwrite              Replace an existing gate JSON or generated template.
  --strict                 Exit 2 when feedback is required but missing or still a template.
  --json                   Print the gate JSON to stdout.
  --help                   Show this help.
`

const TRIGGERS = [
  { id: 'need-feedback', pattern: /\bneed\s+feedback\b/i },
  { id: 'give-feedback', pattern: /\bgive\s+(?:me\s+)?feedback\b/i },
  { id: 'provide-feedback', pattern: /\bprovide\s+(?:me\s+)?feedback\b/i },
  { id: 'skill-feedback', pattern: /\bskill\s+feedback\b/i },
  { id: 'feedback-requested', pattern: /\bfeedback\s+(requested|required|needed)\b/i },
  { id: 'cn-gei-fankui', pattern: /给反馈/ },
  { id: 'cn-xuyao-fankui', pattern: /需要反馈/ },
  { id: 'cn-shiyong-fankui', pattern: /使用反馈/ },
  { id: 'cn-you-shenme-fankui', pattern: /有什么.{0,8}反馈/ },
]

const TEMPLATE_MARKER = '<!-- pptx-nova-feedback-template -->'

function valueAfter(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function parseArgs(argv) {
  const args = {
    runDir: '',
    prompts: [],
    promptFiles: [],
    requireFeedback: false,
    output: '',
    writeTemplate: false,
    overwrite: false,
    strict: false,
    json: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    } else if (arg === '--run-dir') {
      args.runDir = valueAfter(argv, i, arg)
      i += 1
    } else if (arg === '--prompt') {
      args.prompts.push(valueAfter(argv, i, arg))
      i += 1
    } else if (arg === '--prompt-file') {
      args.promptFiles.push(valueAfter(argv, i, arg))
      i += 1
    } else if (arg === '--require-feedback') {
      args.requireFeedback = true
    } else if (arg === '--output' || arg === '-o') {
      args.output = valueAfter(argv, i, arg)
      i += 1
    } else if (arg === '--write-template') {
      args.writeTemplate = true
    } else if (arg === '--overwrite') {
      args.overwrite = true
    } else if (arg === '--strict') {
      args.strict = true
    } else if (arg === '--json') {
      args.json = true
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    }
  }

  if (!args.runDir) throw new Error(`--run-dir is required\n\n${usage}`)
  return args
}

function readPromptText(args) {
  const parts = [...args.prompts]
  for (const file of args.promptFiles) {
    parts.push(readFileSync(file, 'utf8'))
  }
  return parts.join('\n\n')
}

function matchedTriggers(text) {
  return TRIGGERS.filter((trigger) => trigger.pattern.test(text)).map((trigger) => trigger.id)
}

function templateText() {
  return `${TEMPLATE_MARKER}
# pptx-nova SKILL 使用反馈

任务：TODO
时间：${new Date().toISOString()}

## 总体评价

TODO: 记录本次 pptx-nova 工作流的总体反馈。

## 具体反馈

### 1. TODO

- 现象：
- 影响：
- 建议：
- 状态分类：文档引导不足 / 工具缺口 / 已有能力未使用 / 历史 run 过期 / 流程门禁缺口

## 建议优先级

1. TODO
`
}

function inspectFeedback(path) {
  if (!existsSync(path)) {
    return {
      path,
      exists: false,
      byteLength: 0,
      lineCount: 0,
      template: false,
      state: 'missing',
    }
  }
  const content = readFileSync(path, 'utf8')
  const template = isTemplateDraft(content)
  return {
    path,
    exists: true,
    byteLength: statSync(path).size,
    lineCount: content.split(/\r?\n/).length,
    template,
    state: content.trim() && !template ? 'complete' : 'draft',
  }
}

function isTemplateDraft(content) {
  if (content.includes(TEMPLATE_MARKER)) return true
  const placeholderPatterns = [
    /^任务：\s*TODO\s*$/m,
    /^TODO:\s*记录本次 pptx-nova 工作流的总体反馈。\s*$/m,
    /^###\s+1\.\s+TODO\s*$/m,
    /^1\.\s+TODO\s*$/m,
  ]
  const placeholderHits = placeholderPatterns.filter((pattern) => pattern.test(content)).length
  return placeholderHits >= 2
}

function maybeWriteTemplate(args, feedbackPath, required, feedback) {
  if (!required || feedback.exists || !args.writeTemplate) return null
  if (existsSync(feedbackPath) && !args.overwrite) {
    throw new Error(`feedback template target already exists: ${feedbackPath}`)
  }
  mkdirSync(dirname(feedbackPath), { recursive: true })
  writeFileSync(feedbackPath, templateText())
  return feedbackPath
}

function buildReport(args) {
  const runDir = resolve(args.runDir)
  const promptText = readPromptText(args)
  const triggers = matchedTriggers(promptText)
  const required = args.requireFeedback || triggers.length > 0
  const source = args.requireFeedback
    ? 'explicit-flag'
    : triggers.length > 0
      ? 'prompt-trigger'
      : 'not-requested'
  const feedbackPath = resolve(runDir, 'skill-feedback.md')
  let feedback = inspectFeedback(feedbackPath)
  const createdTemplate = maybeWriteTemplate(args, feedbackPath, required, feedback)
  if (createdTemplate) feedback = inspectFeedback(feedbackPath)

  const missing = required && feedback.state !== 'complete'
  const status = missing ? 'fail' : required ? 'pass' : 'not-required'
  const message = missing
    ? `Feedback Mode was requested but ${feedback.state === 'draft' ? 'skill-feedback.md is still a TODO template' : 'skill-feedback.md is missing'}.`
    : required
      ? 'Feedback Mode was requested and skill-feedback.md is present.'
      : 'Feedback Mode was not requested by the supplied prompt.'

  return {
    schemaVersion: 'pptx-nova-feedback-gate/v1',
    observedAt: new Date().toISOString(),
    status,
    runDir,
    requirement: {
      required,
      source,
      matchedTriggers: triggers,
    },
    feedback,
    createdTemplate,
    strict: args.strict,
    agentSummary: {
      status,
      required,
      feedbackPath,
      message,
    },
  }
}

function writeReport(args, report) {
  const output = resolve(args.output || resolve(args.runDir, 'feedback-gate.json'))
  const text = `${JSON.stringify(report, null, 2)}\n`
  if (existsSync(output) && !args.overwrite) {
    throw new Error(
      `output already exists: ${output}; use --overwrite for a current-run gate artifact`,
    )
  }
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, text)

  if (args.json) {
    process.stdout.write(text)
  } else {
    process.stdout.write(`feedback gate: ${report.status}\n`)
    process.stdout.write(`${report.agentSummary.message}\n`)
    process.stdout.write(`report: ${output}\n`)
  }
}

try {
  const args = parseArgs(process.argv.slice(2))
  const report = buildReport(args)
  writeReport(args, report)
  if (args.strict && report.status === 'fail') process.exit(2)
} catch (error) {
  process.stderr.write(`[error] ${error.message}\n`)
  process.exit(1)
}
