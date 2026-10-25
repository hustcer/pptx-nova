import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  selectGoldenCases,
  mergeManifestEntries,
  parseArgs as parseDeckkitExampleArgs,
  syncManifestEntriesWithCatalog,
} from '../../update-pptx-nova-deckkit-examples.mjs'

test('DeckKit examples updater accepts -d as a DeckKit filter alias', () => {
  const args = parseDeckkitExampleArgs(['--write', '-d', 'broadside'])

  assert.equal(args.mode, 'write')
  assert.equal(args.deckkit, 'broadside')
})

test('DeckKit examples updater preserves other manifest entries for one DeckKit update', () => {
  const existingEntries = [
    { id: 'consulting-dark', deckkit: 'consulting-dark', caseId: 'consulting-dark.golden' },
    { id: 'broadside', deckkit: 'broadside', caseId: 'broadside.old' },
    { id: 'swiss-grid', deckkit: 'swiss-grid', caseId: 'swiss-grid.golden' },
  ]
  const generatedEntries = [{ id: 'broadside', deckkit: 'broadside', caseId: 'broadside.new' }]

  const merged = mergeManifestEntries({
    existingEntries,
    generatedEntries,
    deckkit: 'broadside',
  })

  assert.deepEqual(
    merged.map((entry) => [entry.deckkit, entry.caseId]),
    [
      ['consulting-dark', 'consulting-dark.golden'],
      ['broadside', 'broadside.new'],
      ['swiss-grid', 'swiss-grid.golden'],
    ],
  )
})

test('DeckKit examples updater syncs preserved entries to current catalog readiness', () => {
  const entries = [
    { id: 'broadside', deckkit: 'broadside', caseId: 'broadside.old', readiness: 'candidate' },
    { id: 'cartesian', deckkit: 'cartesian', caseId: 'cartesian.old', readiness: 'experimental' },
    { id: 'unknown', deckkit: 'unknown', caseId: 'unknown.old', readiness: 'candidate' },
  ]
  const catalogEntries = new Map([
    [
      'broadside',
      {
        id: 'broadside',
        readiness: 'production',
        version: '0.1.0',
        bestFor: ['brand manifesto'],
        defaultFor: [],
      },
    ],
    [
      'cartesian',
      {
        id: 'cartesian',
        readiness: 'production',
        version: '0.1.0',
        bestFor: ['minimal strategy narrative'],
        defaultFor: ['quiet board readout'],
      },
    ],
  ])

  const synced = syncManifestEntriesWithCatalog({ entries, catalogEntries })

  assert.deepEqual(
    synced.map((entry) => [entry.deckkit, entry.readiness, entry.bestFor ?? []]),
    [
      ['broadside', 'production', ['brand manifesto']],
      ['cartesian', 'production', ['minimal strategy narrative']],
      ['unknown', 'candidate', []],
    ],
  )
  assert.equal(synced[1].defaultFor[0], 'quiet board readout')
})

test('multiple golden cases require an explicit showcase without removing regression cases', () => {
  const a = { id: 'kit.full', deckkit: 'kit', kind: 'golden' },
    b = { id: 'kit.variants', deckkit: 'kit', kind: 'golden' }
  assert.throws(() => selectGoldenCases({ cases: [a, b] }, 'kit'), /exactly one showcase/)
  assert.deepEqual(
    selectGoldenCases({ cases: [{ ...a, showcase: true }, b] }, 'kit').map((c) => c.id),
    ['kit.full'],
  )
  assert.throws(
    () =>
      selectGoldenCases(
        {
          cases: [
            { ...a, showcase: true },
            { ...b, showcase: true },
          ],
        },
        'kit',
      ),
    /exactly one showcase/,
  )
  assert.throws(
    () => selectGoldenCases({ cases: [{ ...a, kind: 'stress', showcase: true }] }, 'kit'),
    /must select a golden/,
  )
  assert.throws(
    () => selectGoldenCases({ cases: [{ ...a, showcase: 'yes' }] }, 'kit'),
    /must be boolean/,
  )
  assert.deepEqual(selectGoldenCases({ cases: [a] }, 'kit'), [a])
})
