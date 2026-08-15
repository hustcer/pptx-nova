import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

test('pptx-nova routes MCP from the exact capability contract', () => {
  const skill = read('pptx-nova/SKILL.md')
  const scriptsReadme = read('pptx-nova/scripts/README.md')
  const workflow = read('pptx-nova/references/common-workflow.md')
  const sessions = read('pptx-nova/references/daemon-sessions.md')

  for (const text of [skill, scriptsReadme, workflow, sessions]) {
    assert.match(text, /(?:capabilities\.agentTransports\.)?mcp\.contract/)
  }
  assert.match(skill, /command presence alone is insufficient/)
  for (const tool of ['xdoc_schema', 'pptx_inspect', 'pptx_apply']) {
    assert.ok(sessions.includes('| `' + tool + '`'))
  }
  assert.match(workflow, /keep one-shot CLI for commands\s+that MCP does not expose/)
  assert.match(sessions, /contract\.tools\[\]/)
  assert.match(sessions, /contract\.resultEncoding/)
  assert.match(sessions, /2025-03-26/)
  assert.doesNotMatch(sessions, /`structuredContent\.value`/)
})

test('deckkit-maker treats MCP as an optional adapter', () => {
  const skill = read('deckkit-maker/SKILL.md')
  const analyze = read('deckkit-maker/references/analyze-reference.md')
  const rebuild = read('deckkit-maker/references/rebuild-high-fidelity.md')

  assert.match(skill, /其余 xdoc 命令继续走 CLI/)
  assert.match(skill, /MCP 未安装、未公开或合同不兼容时回退 CLI/)
  assert.match(skill, /所有文件路径传绝对路径/)
  assert.match(analyze, /`pptx_inspect` 替换这一条 inspect 调用/)
  assert.match(rebuild, /`pptx_apply` 替换 dry-run\/apply 两次对应调用/)
  assert.match(rebuild, /`vision-check`、\s*`convert` 和其他未公开命令仍走 CLI/)
})

test('public xdoc documentation matches the published MCP contract', () => {
  const introduction = read('docs/xdoc-introducution.md')
  const integration = read('docs/xdoc-integration.md')

  for (const text of [introduction, integration]) {
    assert.match(text, /`xdoc-mcp-contract\/v1`/)
    assert.match(text, /`xdoc-mcp-tool-result\/v1`/)
    assert.match(text, /`xdoc-daemon-status\/v2`/)
    assert.doesNotMatch(text, /`xdoc-daemon-status\/v1`/)
  }
  assert.match(introduction, /\| `mcp`\s+\| Serve the published tools-only MCP transport/)
  assert.match(integration, /commands\.mcp\.protocolContract/)
  assert.match(integration, /command presence alone is not a\s+protocol contract/)
  assert.doesNotMatch(introduction, /does not yet ship a bundled MCP/)
  assert.doesNotMatch(introduction, /bundled MCP server or IDE installer is not part/)
})
