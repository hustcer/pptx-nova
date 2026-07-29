import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const repoRoot = resolve('.')
const skillRoot = join(repoRoot, 'pptx-nova')

function readSkill(path) {
  return readFileSync(join(skillRoot, path), 'utf8')
}

test('visual-verify is routed as an evidence escalation instead of a default runner gate', () => {
  const skill = readSkill('SKILL.md')
  const common = readSkill('references/common-workflow.md')
  const editContract = readSkill('references/edit-contract.md')
  const exportAndCheck = readSkill('references/export-and-check.md')

  assert.match(skill, /explicit visual evidence/)
  assert.match(skill, /never merely because a PPTX exists/)
  assert.match(common, /Do not add `xdoc pptx visual-verify` to this shared pipeline by default/)
  assert.match(editContract, /Do not add `visual-verify` to `requiredEvidence` for ordinary edits/)

  assert.match(exportAndCheck, /## Unified Visual Evidence \(Escalation Only\)/)
  assert.match(exportAndCheck, /--require-command pptx\.visual-verify --strict --json/)
  assert.match(exportAndCheck, /process exit code of `0` means only that the evidence transaction/)
  assert.match(exportAndCheck, /then read `decision\.action`/)
  assert.match(exportAndCheck, /does not prove PowerPoint parity or\n\s+visual intent/)
  assert.match(exportAndCheck, /both reference and\n\s+candidate receive static-layout/)

  for (const path of [
    'scripts/pptx-nova-create-run.mjs',
    'scripts/pptx-nova-refurbish-run.mjs',
    'scripts/pptx-nova-translation-run.mjs',
  ]) {
    assert.doesNotMatch(
      readSkill(path),
      /visual-verify/,
      `${path} must not add another default render`,
    )
  }

  assert.ok(skill.split('\n').length <= 501, 'SKILL.md must stay within the 500-line guidance')
})
