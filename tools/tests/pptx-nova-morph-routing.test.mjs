import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const repoRoot = resolve('.')
const skillRoot = join(repoRoot, 'pptx-nova')

function readSkill(path) {
  return readFileSync(join(skillRoot, path), 'utf8')
}

test('Morph authoring publishes the explicit pairing and PowerPoint evidence contract', () => {
  const skill = readSkill('SKILL.md')
  const animations = readSkill('references/animations.md')
  const scripts = readSkill('scripts/README.md')
  const playback = readSkill('scripts/pptx-nova-morph-playback.nu')

  assert.match(skill, /For Morph, use exact `!!` object names, run `morph-check`/)
  assert.match(
    skill,
    /A static PNG\/PDF preview\s+or the viewer's fallback transition does not prove Morph interpolation/,
  )

  assert.match(animations, /xdoc schema --op set-slide-transition --minimal/)
  assert.match(animations, /完全相同、区分大小写的 `!!` 前缀名称/)
  assert.match(animations, /`by-object`、`by-word`、`by-char`/)
  assert.match(animations, /morph-check-before\.json/)
  assert.match(animations, /xdoc pptx apply -i input\.pptx/)
  assert.match(animations, /morph-check-after\.json/)
  assert.match(animations, /pptx-nova-morph-playback\.nu/)
  assert.match(animations, /slide2-powerpoint\.diff/)
  assert.match(animations, /"clear": true/)
  assert.match(animations, /Windows fixture 补证，否则该维度保持 `inconclusive`/)
  assert.match(animations, /viewer\/parser 只消费 OOXML `mc:Fallback` 的 fade 语义/)

  assert.match(scripts, /PowerPoint-native Morph semantic/)
  assert.match(playback, /pptx-morph-playback\/v1/)
  assert.match(playback, /entry effect morph by object/)
  assert.match(playback, /Expected Morph duration is required/)
  assert.match(playback, /must not overwrite the input PPTX/)
  assert.match(playback, /status: 'skipped'/)
  assert.match(playback, /does not capture or score the visual interpolation frames/)
  assert.doesNotMatch(playback, /repository-root|\/tools\//)
})
