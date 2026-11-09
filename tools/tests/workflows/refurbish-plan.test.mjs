import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runNode, skillPath, skillUrl, writeJson } from '../helpers/common.mjs'

test('refurbish plan requires semantic diff gate by default', async () => {
  const { buildRefurbishPlan } = await import(skillUrl('scripts/cli/refurbish/plan.mjs'))
  const plan = buildRefurbishPlan({
    deckkit: 'mckinsey-blue',
    source: 'source.pptx',
    output: 'candidate.pptx',
    catalog: skillPath('assets/deckkits/catalog.json'),
    explicit: true,
    json: true,
  })
  const semanticIndex = plan.requiredGates.indexOf('semantic-diff')

  assert.equal(plan.status, 'ready')
  assert.equal(plan.explicitSelection.required, false)
  assert.equal(
    plan.requiredReferences.some((reference) => reference.section === 'Selection'),
    false,
  )
  assert.notEqual(semanticIndex, -1)
  assert.ok(semanticIndex < plan.requiredGates.indexOf('fidelity-gate'))
  assert.ok(
    plan.commands.some(
      (command) =>
        command.name === 'semantic-diff' &&
        command.required === true &&
        command.command.includes('xdoc pptx diff'),
    ),
  )
})

test('explicit swiss-grid refurbishment retains its independent manual fallback route', async () => {
  const { buildRefurbishPlan } = await import(skillUrl('scripts/cli/refurbish/plan.mjs'))
  const plan = buildRefurbishPlan({
    deckkit: 'swiss-grid',
    source: 'source.pptx',
    output: 'candidate.pptx',
    catalog: skillPath('assets/deckkits/catalog.json'),
    explicit: true,
    json: true,
  })

  assert.equal(plan.status, 'manual-fallback')
  assert.equal(plan.explicitSelection.required, false)
  assert.equal(plan.route, 'fallback-patch')
  assert.equal(plan.nativeSkinning.supported, false)
  assert.equal(
    plan.commands.some((command) => command.name === 'refurbish-skin'),
    false,
  )
  assert.deepEqual(plan.requiredReferences, [
    {
      path: 'references/create/reference-create.md',
      section: '6. Refurbish Existing Deck',
      reason: 'The selected route requires the catalog-driven fallback contract.',
    },
  ])
})

test('explicit candidate fallback keeps refurbish plan route commands gates and references consistent', async () => {
  const { buildRefurbishPlan } = await import(skillUrl('scripts/cli/refurbish/plan.mjs'))
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-candidate-fallback-'))
  const catalogPath = join(root, 'catalog.json')
  const catalog = JSON.parse(readFileSync(skillPath('assets/deckkits/catalog.json'), 'utf8'))
  catalog.entries.find((entry) => entry.id === 'consulting-dark').readiness = 'candidate'
  writeJson(catalogPath, catalog)
  const plan = buildRefurbishPlan({
    deckkit: 'consulting-dark',
    source: 'source.pptx',
    output: 'candidate.pptx',
    catalog: catalogPath,
    route: 'fallback',
    explicit: true,
    json: true,
  })

  assert.equal(plan.route, 'fallback-patch')
  assert.equal(plan.routeSelection.requested, 'fallback')
  assert.equal(plan.routeSelection.selected, 'fallback-patch')
  assert.equal(plan.status, 'explicit-manual-fallback')
  assert.equal(plan.requiredGates.includes('fallback-patch-report'), true)
  assert.equal(plan.requiredGates.includes('refurbish-skin-report'), false)
  assert.equal(
    plan.commands.some((command) => command.name === 'native-refurbish-skin'),
    false,
  )
  assert.equal(
    plan.commands.some((command) => command.name === 'generate-fallback-patch'),
    true,
  )
  assert.deepEqual(plan.requiredReferences, [
    {
      path: 'references/create/reference-create.md',
      section: '6. Refurbish Existing Deck',
      reason: 'The selected route requires the catalog-driven fallback contract.',
    },
    {
      path: 'references/create/deckkit-mode.md',
      section: 'Selection',
      reason: 'The explicitly selected DeckKit uses a readiness exception.',
    },
  ])
})

test('refurbish fallback prunes only inspect-proven exact theme and solid-fill no-ops', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-refurbish-pruning-'))
  const source = join(root, 'source.pptx')
  const inspectPath = join(root, 'inspect.json')
  const patchPath = join(root, 'patch.json')
  // This fixture tests pruning against its frozen visual-grammar palette.
  const catalogPath = join(root, 'catalog.json')
  const catalog = JSON.parse(readFileSync(skillPath('assets/deckkits/catalog.json'), 'utf8'))
  const entry = { ...catalog.entries.find((item) => item.id === 'cartesian') }
  delete entry.designContract
  writeJson(catalogPath, { entries: [entry] })
  writeFileSync(source, 'fake pptx')
  writeJson(inspectPath, {
    schemaVersion: 'pptx-inspect/v1',
    presentation: {
      slideCount: 1,
      size: { width: '10in', height: '5.625in' },
      themes: [
        {
          partName: 'ppt/theme/theme1.xml',
          usedBySlides: [0],
          usedByMasters: ['ppt/slideMasters/slideMaster1.xml'],
          colors: Object.entries({
            dk1: '111111',
            lt1: 'F7F3E8',
            dk2: '111111',
            lt2: 'FFFFFF',
            accent1: 'D9B44A',
            accent2: '111111',
            accent3: 'EFE2B7',
            accent4: '6B7280',
            accent5: '111111',
            accent6: 'FFFFFF',
            hlink: '111111',
            folHlink: '6B7280',
          }).map(([scheme, value]) => ({ scheme, value })),
          majorFont: { latin: 'Playfair Display', ea: 'Microsoft YaHei' },
          minorFont: { latin: 'Inter', ea: 'Microsoft YaHei' },
        },
      ],
    },
    slides: [
      {
        index: 0,
        semantic: { elementStats: { total: 3, text: 1 } },
        shapes: [
          {
            id: 1,
            name: 'Existing Surface',
            shapeType: 'autoShape',
            fillType: 'solid',
            fillColor: 'FFFFFF',
            lineNoFill: true,
            hasText: false,
          },
          {
            id: 2,
            name: 'Changing Accent',
            shapeType: 'autoShape',
            fillType: 'solid',
            fillColor: 'D9B44A',
            lineNoFill: true,
            hasText: false,
          },
          {
            id: 3,
            name: 'Body Copy',
            shapeType: 'textBox',
            fillType: 'none',
            fillColor: null,
            hasText: true,
            textPreview: 'Keep editable text',
          },
        ],
      },
    ],
  })

  const result = runNode([
    skillPath('scripts/cli/refurbish/fallback-patch.mjs'),
    '--deckkit',
    'cartesian',
    '--catalog',
    catalogPath,
    '--source',
    source,
    '--inspect',
    inspectPath,
    '--output',
    join(root, 'candidate.pptx'),
    '--patch',
    patchPath,
    '--lock',
    join(root, 'deck_lock.json'),
    '--audit',
    join(root, 'content-audit.json'),
    '--map',
    join(root, 'reference-map.json'),
    '--json',
  ])
  const report = JSON.parse(result.stdout)
  const patch = JSON.parse(readFileSync(patchPath, 'utf8'))
  const audit = report.summary.operationAudit

  assert.equal(audit.plannedOps, 7)
  assert.equal(audit.emittedOps, 5)
  assert.equal(audit.knownNoOpOps, 2)
  assert.equal(audit.knownChangingOps, 1)
  assert.equal(audit.unknownEffectOps, 4)
  assert.equal(audit.effectiveOps, null)
  assert.equal(audit.styleFingerprint.themeMatchesTarget, true)
  assert.equal(audit.styleFingerprint.fontMatchesTarget, true)
  assert.equal(audit.pruningReasons['theme-and-fonts-exact-match'], 1)
  assert.equal(audit.pruningReasons['shape-solid-fill-exact-match'], 1)
  assert.equal(
    patch.ops.some((op) => op.op === 'set-theme'),
    false,
  )
  assert.deepEqual(
    patch.ops.filter((op) => op.op === 'set-shape').map((op) => op.fill?.color),
    ['EFE2B7'],
  )
})

test('skill routes standard refurbishment through one compact reference', () => {
  const skill = readFileSync(skillPath('SKILL.md'), 'utf8')
  const reference = readFileSync(skillPath('references/edit/refurbish-runner.md'), 'utf8')
  const routingRow = skill
    .split('\n')
    .find((line) => line.includes('Polish / refurbish an existing PPTX'))

  assert.match(routingRow, /references\/edit\/refurbish-runner\.md/)
  assert.doesNotMatch(routingRow, /common-workflow|reference-create|deckkit-mode/)
  assert.match(reference, /Do not add `--contact-diff` for ordinary full-deck review/)
  assert.match(reference, /refurbish-plan\.json\.requiredReferences/)
  assert.ok(reference.split('\n').length < 150)
})

test('skill stays within the progressive-disclosure byte budget', () => {
  const skill = readFileSync(skillPath('SKILL.md'), 'utf8')
  assert.ok(
    Buffer.byteLength(skill, 'utf8') < 55 * 1024,
    `SKILL.md is ${Buffer.byteLength(skill, 'utf8')} bytes`,
  )
  const commandEntry = skill
    .split('## Common Command Entry Points')[1]
    ?.split('## Completion Summary')[0]
  assert.doesNotMatch(commandEntry ?? '', /xdoc pptx (apply|refurbish-skin|i18n-scan)/)
})

test('skill routes standard translation finalization through one compact reference', () => {
  const skill = readFileSync(skillPath('SKILL.md'), 'utf8')
  const reference = readFileSync(skillPath('references/translation/translation-runner.md'), 'utf8')
  const routingRow = skill
    .split('\n')
    .find((line) => line.includes('Translate an existing `.pptx`'))

  assert.match(routingRow, /references\/translation\/translation-runner\.md/)
  assert.doesNotMatch(routingRow, /common-workflow|edit-mode|inspect-and-edit/)
  assert.match(reference, /stable translated candidate/i)
  assert.match(reference, /requiredReferences\[\]/)
  assert.match(reference, /must not trigger another full-deck render/)
  assert.ok(reference.split('\n').length < 150)
})

test('refurbish fallback plan overwrites current-run candidate commands', async () => {
  const { buildRefurbishPlan } = await import(skillUrl('scripts/cli/refurbish/plan.mjs'))
  const plan = buildRefurbishPlan({
    deckkit: 'broadside',
    source: 'source.pptx',
    output: 'candidate.pptx',
    catalog: skillPath('assets/deckkits/catalog.json'),
    explicit: false,
    json: true,
  })

  assert.ok(
    plan.commands.some(
      (command) =>
        command.name === 'apply' &&
        command.command.includes('candidate.pptx') &&
        command.command.includes('--overwrite'),
    ),
  )
  assert.deepEqual(plan.requiredReferences, [
    {
      path: 'references/create/reference-create.md',
      section: '6. Refurbish Existing Deck',
      reason: 'The selected route requires the catalog-driven fallback contract.',
    },
  ])
  assert.equal(plan.status, 'manual-fallback')
  assert.equal(plan.explicitSelection.required, false)
})
