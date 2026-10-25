import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

test('published mandatory workflow scripts stay dependency-free Node.js modules', () => {
  const agents = read('AGENTS.md')

  assert.match(
    agents,
    /Every script required by a published user workflow must be a plain JavaScript ES module/,
  )
  assert.match(agents, /Node\.js 20 or later/)
  assert.match(
    agents,
    /must not require Nushell, Python, a package-manager install, or any third-party runtime dependency/,
  )
  assert.match(agents, /published `xdoc` binary is the only allowed external runtime dependency/)
})

test('bundled Nushell scripts are explicitly optional evidence integrations', () => {
  const scriptDir = join(repoRoot, 'pptx-nova/scripts/cli/office')
  const nushellScripts = readdirSync(scriptDir)
    .filter((name) => name.endsWith('.nu'))
    .sort()
  const scriptsReadme = read('pptx-nova/scripts/README.md')

  assert.deepEqual(nushellScripts, ['morph-playback.nu', 'powerpoint-snapshot.nu'])
  for (const name of nushellScripts) {
    assert.ok(scriptsReadme.includes(`- \`cli/office/${name}\` - optional`))
  }
})

test('missing optional PowerPoint evidence prerequisites do not block the baseline', () => {
  const skill = read('pptx-nova/SKILL.md')
  const workflow = read('pptx-nova/references/common-workflow.md')
  const animations = read('pptx-nova/references/animations.md')
  const evidence = read('pptx-nova/scripts/lib/review/powerpoint-native-render-evidence.mjs')

  assert.match(
    skill,
    /optional, capability-gated evidence integrations, never baseline dependencies/,
  )
  assert.match(workflow, /baseline route remains usable/)
  assert.match(animations, /缺少 Nushell 或其他可选前置不阻断基线 Morph 流程/)
  assert.match(evidence, /spawnSync\('nu', \['--version'\]/)
  assert.match(evidence, /spawnSync\('mutool', \['-v'\]/)
  assert.match(evidence, /optional-nushell-helper-unavailable/)
  assert.match(evidence, /native-render-helper-unavailable-unverified/)
})
