import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

test('published script policy requires dependency-free Node.js modules', () => {
  const agents = read('AGENTS.md')

  assert.match(
    agents,
    /All scripts shipped anywhere inside `pptx-nova\/` must be plain JavaScript ES modules/,
  )
  assert.match(agents, /Node\.js 20 or later/)
  assert.match(agents, /do not add Python or Nushell as another user dependency/)
  assert.match(agents, /do not invoke Python or Nushell from `\.mjs` as a workaround/)
  assert.match(agents, /without package installation or third-party runtime dependencies/)
  assert.match(agents, /published `xdoc` binary is the only allowed external runtime dependency/)
})

test('legacy Nushell evidence integrations remain optional pending migration', () => {
  const scriptDir = join(repoRoot, 'pptx-nova/scripts/cli/office')
  const nushellScripts = readdirSync(scriptDir)
    .filter((name) => name.endsWith('.nu'))
    .sort()
  const scriptsReadme = read('pptx-nova/scripts/README.md')

  assert.match(scriptsReadme, /legacy code awaiting migration/)
  assert.deepEqual(nushellScripts, ['morph-playback.nu', 'powerpoint-snapshot.nu'])
  for (const name of nushellScripts) {
    assert.ok(scriptsReadme.includes(`- \`cli/office/${name}\` - optional`))
  }
})

test('missing optional PowerPoint evidence prerequisites do not block the baseline', () => {
  const skill = read('pptx-nova/SKILL.md')
  const workflow = read('pptx-nova/references/common-workflow.md')
  const animations = read('pptx-nova/references/content/animations.md')
  const evidence = read('pptx-nova/scripts/lib/review/powerpoint-native-render-evidence.mjs')

  assert.match(
    skill,
    /optional, capability-gated evidence integrations, never baseline dependencies/,
  )
  assert.match(workflow, /baseline route remains usable/)
  assert.match(animations, /缺少 macOS、PowerPoint 或自动化权限不阻断基线 Morph 流程/)
  assert.match(animations, /node <skill-root>\/scripts\/cli\/office\/morph-playback\.mjs/)
  assert.match(evidence, /spawnSync\('nu', \['--version'\]/)
  assert.match(evidence, /spawnSync\('xdoc', \['pdf', 'render', '--help'\]/)
  assert.match(evidence, /optional-nushell-helper-unavailable/)
  assert.match(evidence, /native-render-helper-unavailable-unverified/)
})
