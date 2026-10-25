import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const repoRoot = resolve('.')
const skillRoot = join(repoRoot, 'pptx-nova')

function readSkill(path) {
  return readFileSync(join(skillRoot, path), 'utf8')
}

test('visual-audit is routed as the canonical final Agent decision', () => {
  const skill = readSkill('SKILL.md')
  const common = readSkill('references/common-workflow.md')
  const exportAndCheck = readSkill('references/review/export-and-check.md')

  assert.match(
    skill,
    /Preview is for inspection, while the canonical\s+visual-evidence decision remains the delivery authority/,
  )
  assert.match(common, /Run `xdoc pptx visual-audit` once on the stable final candidate/)

  assert.match(exportAndCheck, /## Unified Visual Evidence \(Canonical Agent Gate\)/)
  assert.match(exportAndCheck, /--require-command pptx\.visual-audit --strict --json/)
  assert.match(exportAndCheck, /process exit code of `0` means only that the evidence transaction/)
  assert.match(exportAndCheck, /then read `decision\.action`/)
  assert.match(exportAndCheck, /does not prove PowerPoint parity or\n\s+visual intent/)
  assert.match(exportAndCheck, /both reference and\n\s+candidate receive static-layout/)
  assert.match(
    readSkill('scripts/cli/runtime/init-run.mjs'),
    /cliPath\('review\/visual-evidence-gate\.mjs'\)/,
  )

  assert.ok(skill.split('\n').length <= 501, 'SKILL.md must stay within the 500-line guidance')
})
