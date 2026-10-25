import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { auditReferencesLayout } from '../../lib/references-layout.mjs'
import { repoRoot, skillRoot } from '../helpers/common.mjs'

function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'reference layout '))
  const root = join(temp, 'pptx-nova')
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const write = (file, source = '') => {
    const path = join(root, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, source)
  }
  write('SKILL.md', '[Reference index](references/README.md)')
  write('references/README.md', '[Common](common-workflow.md)\n[Create](create/run.md)')
  write('references/common-workflow.md')
  write('references/create/run.md', '[Charts](../content/charts.md#data)\n`../runtime/probe.md`')
  write('references/content/charts.md', '# Data')
  write('references/runtime/probe.md')
  return { root, write }
}

test('published references and repository callers resolve through the grouped reading routes', () => {
  assert.deepEqual(
    auditReferencesLayout(skillRoot, {
      sourceRoots: [
        join(repoRoot, 'README.md'),
        join(repoRoot, 'CONTRIBUTING.md'),
        join(repoRoot, 'deckkit-maker'),
        join(repoRoot, 'docs'),
      ],
    }),
    [],
  )
})

test('reference audit accepts relative cross-domain links', (t) => {
  const { root } = fixture(t)
  assert.deepEqual(auditReferencesLayout(root), [])
})

test('installed skill resolves its reading routes without the repository or caller cwd', async (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'installed references '))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const installed = join(temp, 'pptx-nova')
  cpSync(skillRoot, installed, { recursive: true })
  assert.deepEqual(auditReferencesLayout(installed), [])
  const { buildRefurbishPlan } = await import(
    pathToFileURL(join(installed, 'scripts/cli/refurbish/plan.mjs')).href
  )
  const plan = buildRefurbishPlan({
    deckkit: 'swiss-grid',
    source: join(temp, 'source.pptx'),
    output: join(temp, 'candidate.pptx'),
    catalog: join(installed, 'assets/deckkits/catalog.json'),
    explicit: true,
    json: true,
  })
  assert.ok(plan.requiredReferences.length > 0)
  for (const reference of plan.requiredReferences) {
    const guide = readFileSync(join(installed, reference.path), 'utf8')
    assert.ok(guide.includes(reference.section), reference.path)
  }
})

test('reference audit rejects flat files, unknown groups and nested ownership', (t) => {
  const { root, write } = fixture(t)
  write('references/legacy.md')
  write('references/misc/notes.md')
  write('references/create/nested/notes.md')
  const issues = auditReferencesLayout(root)
  for (const path of ['references/legacy.md', 'references/misc', 'references/create/nested'])
    assert.ok(
      issues.some((issue) => issue.path === path),
      path,
    )
})

test('reference audit catches stale runtime guidance, Markdown links and inline reading paths', (t) => {
  const { root, write } = fixture(t)
  write('scripts/cli/create/run.mjs', "const guide = { path: 'references/charts.md' }\n")
  write(
    'references/content/charts.md',
    '[Missing](../edit/missing.md)\nRead `probe.md`.\n[Assets](../../assets/missing.json)',
  )
  const issues = auditReferencesLayout(root)
  for (const target of [
    'references/charts.md',
    '../edit/missing.md',
    'probe.md',
    '../../assets/missing.json',
  ])
    assert.ok(
      issues.some((issue) => issue.message.endsWith(target)),
      target,
    )
})

test('reference audit checks external callers without confusing another skill references', (t) => {
  const { root, write } = fixture(t)
  const caller = join(root, '../other-skill/SKILL.md')
  write('../other-skill/SKILL.md', '`pptx-nova/references/missing.md`\n`references/own.md`')
  const issues = auditReferencesLayout(root, { sourceRoots: [caller] })
  assert.ok(issues.some((issue) => issue.message.endsWith('pptx-nova/references/missing.md')))
  assert.ok(!issues.some((issue) => issue.message.endsWith('references/own.md')))
})

test('reference audit rejects orphaned guidance and missing shared entries', (t) => {
  const { root, write } = fixture(t)
  write('references/edit/orphan.md')
  rmSync(join(root, 'references/common-workflow.md'))
  const issues = auditReferencesLayout(root)
  assert.ok(issues.some((issue) => issue.path === 'references/edit/orphan.md'))
  assert.ok(issues.some((issue) => issue.message === 'shared reference entry is missing'))
})
