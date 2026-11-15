import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateDeckkitContent } from '../../../pptx-nova/assets/deckkits/shared/validate-deckkit.mjs'
import { checkDesignPatch } from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { withoutSemanticIcons } from '../helpers/semantic-icons.mjs'

const cases = [
  ['consulting-dark', 'kpiRowSlide', 'items'],
  ['swiss-grid', 'swissPrinciplesSlide', 'items'],
  ['broadside', 'broadsideListSlide', 'items', 'itemIcons'],
  ['cartesian', 'cartesianCardsSlide', 'cards'],
  ['long-table', 'longTableIndexSlide', 'cards'],
  ['biennale-yellow', 'biennaleProgrammeSlide', 'strands'],
  ['black-gold', 'ledgerSummarySlide', 'judgments'],
  ['green-slate', 'slateSummarySlide', 'findings'],
  ['clear-value', 'valueSummarySlide', 'items'],
  ['clear-impact', 'impactReviewSlide', 'findings'],
  ['amber-ledger', 'amberProjectsSlide', 'projects'],
  ['midnight-pulse', 'pulseComparisonSlide', 'subjects'],
  ['sky-compass', 'skyCoverageSlide', 'notes'],
  ['violet-momentum', 'violetDiagnosisSlide', 'cases'],
  ['teal-journal', 'journalOutlookSlide', 'notes'],
  ['blue-research', 'researchFindingsSlide', 'items'],
  ['pink-script', 'pinkClosingSlide', 'actions'],
  ['editorial-forest', 'forestClosingSlide', 'items'],
  ['monochrome', 'monoListSlide', 'items', 'itemIcons'],
]

for (const [id, type, field, parallel] of cases) {
  test(`${id}: registered peer concepts accept semantic icons and preserve literal content`, async () => {
    const root = new URL(`../../../pptx-nova/assets/deckkits/${id}/`, import.meta.url)
    const fixture = JSON.parse(readFileSync(new URL('examples/content.json', root)))
    const slide = structuredClone(fixture.slides.find((s) => s.type === type))
    const content = { meta: { deckkit: id, designScope: 'excerpt' }, slides: [slide] }
    if (parallel) slide.data[parallel] = slide.data[field].map(() => 'book')
    else slide.data[field].forEach((v) => (v.icon = 'book'))
    assert.equal(validateDeckkitContent(content, { deckkit: id, mode: 'delivery' }).valid, true)
    const { createDeck, DESIGN } = await import(new URL(`${id}.kit.mjs`, root))
    // The Pink contact asset is separate from its concept markers.
    if (id === 'pink-script') delete slide.imageSlots
    const built = createDeck(content)
    assert.equal(built.designCheck.status, 'pass')
    const icons = built.patch.ops.filter(
      (op) => op.op === 'add-image' && /SemanticIcon_/.test(op.name),
    )
    assert.equal(icons.length, slide.data[field].length)
    for (const icon of icons) {
      assert.match(Buffer.from(icon.bytesBase64, 'base64').toString('utf8'), /stroke-width="1.2"/)
      assert.equal(icon.mimeType, 'image/svg+xml')
    }
    const bad = structuredClone(content)
    if (parallel) bad.slides[0].data[parallel][0] = 'unknown-semantic-icon'
    else bad.slides[0].data[field][0].icon = 'unknown-semantic-icon'
    assert.equal(validateDeckkitContent(bad, { deckkit: id, mode: 'delivery' }).valid, false)
    assert.throws(() => createDeck(bad), /icon/i)
    assert.ok(DESIGN.semanticIcons?.bindings.length)
  })
}

for (const [id] of cases) {
  test(`${id}: every icon binding fits all registered layouts and changes only its text owner`, async () => {
    const root = new URL(`../../../pptx-nova/assets/deckkits/${id}/`, import.meta.url)
    const fixture = JSON.parse(readFileSync(new URL('examples/content.json', root)))
    const { createDeck, DESIGN } = await import(new URL(`${id}.kit.mjs`, root))
    for (const binding of DESIGN.semanticIcons.bindings) {
      const source = fixture.slides.find((s) => s.type === binding.slideType)
      const family = Object.values(DESIGN).find((v) => v?.families?.[source.type]).families[
        source.type
      ]
      for (const layoutId of Object.keys(family.variants)) {
        const slide = { ...structuredClone(source), layoutId }
        if (id === 'consulting-dark' && layoutId === 'metrics')
          slide.data.items = slide.data.items
            .slice(0, 3)
            .map((v) => ({ ...v, title: 'Capacity', body: 'Measured evidence', badge: '10%' }))
        if (id === 'pink-script') delete slide.imageSlots
        const content = { meta: { deckkit: id, designScope: 'excerpt' }, slides: [slide] }
        const valid = validateDeckkitContent(content, { deckkit: id, mode: 'delivery' })
        assert.equal(
          valid.valid,
          true,
          `${id}/${source.type}/${layoutId}: ${JSON.stringify(valid.errors)}`,
        )
        const built = createDeck(content),
          legacy = createDeck(withoutSemanticIcons(id, content))
        const marker = new RegExp(
          `^S0_(?:${[binding.target, ...(binding.alternates ?? [])].map((s) => s.replace('{i}', '\\d+')).join('|')})$`,
        )
        const remainder = (patch) =>
          patch.ops.filter(
            (op) =>
              !/_SemanticIcon_/.test(op.name ?? '') &&
              !marker.test(op.name ?? op.shape?.name ?? ''),
          )
        assert.deepEqual(
          remainder(built.patch),
          remainder(legacy.patch),
          `${id}/${layoutId}: unrelated content changed`,
        )
        const bad = structuredClone(built.patch),
          image = bad.ops.find((op) => /_SemanticIcon_/.test(op.name ?? ''))
        assert.ok(image, `${id}/${source.type}/${layoutId}: no icon emitted`)
        image.bytesBase64 = Buffer.from('<svg/>').toString('base64')
        assert.equal(checkDesignPatch(DESIGN, bad).status, 'fail')
        const badGeometry = structuredClone(built.patch)
        badGeometry.ops.find((op) => /_SemanticIcon_/.test(op.name ?? '')).w = `${Number.NaN}in`
        assert.equal(checkDesignPatch(DESIGN, badGeometry).status, 'fail')
      }
    }
  })
}

test('every catalog DeckKit exposes at least one concrete semantic icon input', () => {
  const catalog = JSON.parse(
    readFileSync(new URL('../../../pptx-nova/assets/deckkits/catalog.json', import.meta.url)),
  )
  for (const kit of catalog.entries) {
    const slots = Object.values(kit.layoutContract.slideTypes).flatMap(
      (s) => s.semanticIconSlots ?? [],
    )
    assert.ok(slots.length, `${kit.id}: no discoverable semantic icon route`)
    assert.ok(slots.every((s) => s.defaultStrokeWidth === 1.2 && s.maxStrokeWidth === 1.5))
  }
})
