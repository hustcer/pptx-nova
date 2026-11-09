import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { skillPath, skillUrl } from '../helpers/common.mjs'

const { buildRefurbishPlan } = await import(skillUrl('scripts/cli/refurbish/plan.mjs'))
const { fontFamilyFrom } = await import(skillUrl('scripts/lib/refurbish/style.mjs'))
const { themeFor } = await import(skillUrl('scripts/lib/refurbish/style.mjs'))

test('fallback theme resolves every declared scheme slot and independent font role', () => {
  const design = JSON.parse(readFileSync(skillPath('assets/deckkits/swiss-grid/design.json')))
  const entry = { designContract: 'swiss-grid/design.json' }
  const fallback = { palette: {}, fonts: {} }
  const theme = themeFor(entry, fallback, skillPath('assets/deckkits/catalog.json'))
  for (const [slot, role] of Object.entries(design.theme.colors)) {
    assert.equal(theme.colors[slot], design.colors[role], slot)
  }
  assert.equal(theme.fonts.major.typeface, design.fonts.display.latin)
  assert.equal(theme.fonts.minor.eastAsian, design.fonts.body.eastAsian)
})

test('sans serif descriptions never select the serif fallback', () => {
  assert.equal(fontFamilyFrom('Upright sans serif, 14pt body', 'Arial'), 'Arial')
  assert.equal(fontFamilyFrom('upright serif', 'Arial'), 'Times New Roman')
})

test('fallback planning uses registered design colors and font roles instead of prose guesses', () => {
  const design = JSON.parse(readFileSync(skillPath('assets/deckkits/paper-scholar/design.json')))
  const plan = buildRefurbishPlan({
    deckkit: 'paper-scholar',
    source: 'source.pptx',
    output: 'candidate.pptx',
    catalog: skillPath('assets/deckkits/catalog.json'),
  })
  const fallback = plan.refurbishProfile.fallback
  assert.equal(fallback.palette.background, design.colors.paper)
  assert.equal(fallback.palette.text, design.colors.ink)
  assert.equal(fallback.palette.accent, design.colors.accent)
  assert.equal(fallback.palette.rule, design.colors.rule)
  assert.equal(fallback.fonts.body, design.fonts.body.latin)
  assert.equal(fallback.fonts.cjk, design.fonts.display.eastAsian)
  assert.deepEqual(fallback.derivationWarnings, [])
})

test('custom catalog resolves design facts relative to itself and keeps explicit fallback overrides', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-design-facts-'))
  mkdirSync(join(root, 'kit'))
  writeFileSync(
    join(root, 'kit/design.json'),
    JSON.stringify({
      colors: { paper: 'F9F8F7', ink: '123456', highlight: 'AB4567', line: '456789' },
      fonts: {
        display: { latin: 'Custom Display', eastAsian: 'Custom CJK' },
        body: { latin: 'Custom Sans', eastAsian: 'Custom Body CJK' },
      },
      theme: { colors: { accent1: 'highlight' }, fonts: { major: 'display', minor: 'body' } },
      refurbish: {
        palette: { background: 'paper', text: 'ink', accent: 'highlight', line: 'line' },
        fonts: { display: 'display', body: 'body', cjk: 'display' },
      },
    }),
  )
  const entry = {
    id: 'test-kit',
    readiness: 'default',
    designContract: 'kit/design.json',
    refurbishProfile: { fallback: { palette: { accent: '654321' } } },
  }
  const catalog = join(root, 'catalog.json')
  writeFileSync(catalog, JSON.stringify({ entries: [entry] }))
  const fallback = buildRefurbishPlan({
    deckkit: entry.id,
    source: 'a.pptx',
    output: 'b.pptx',
    catalog,
  }).refurbishProfile.fallback
  assert.equal(fallback.palette.background, 'F9F8F7')
  assert.equal(fallback.palette.accent, '654321')
  assert.equal(fallback.palette.rule, '456789')
  assert.equal(fallback.fonts.heading, 'Custom Display')
  assert.equal(fallback.fonts.body, 'Custom Sans')
  assert.equal(fallback.fonts.cjk, 'Custom CJK')
  const theme = themeFor(entry, fallback, catalog)
  assert.equal(theme.colors.accent1, 'AB4567')
  assert.equal(theme.fonts.major.eastAsian, 'Custom CJK')
  assert.equal(theme.fonts.minor.eastAsian, 'Custom Body CJK')
})
