import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  buildTranslationConstraints,
  extractProtectedTokens,
  highRiskShortWord,
  normalizeTranslationGlossary,
  validateTranslationConstraints,
} from '../../pptx-nova/scripts/lib/translation-constraints.mjs'

function memory(entries) {
  return {
    schemaVersion: 'pptx-nova-translation-memory/v1',
    source: { sha256: 'sha256:source' },
    units: { sha256: 'sha256:units' },
    sourceLang: 'multi',
    targetLang: 'de',
    entries: entries.map((entry, index) => ({
      memoryId: `sha256:${createHash('sha256').update(entry).digest('hex')}`,
      sourceText: entry,
      targetText: null,
      contexts: [{ unitId: `u${index + 1}` }],
    })),
  }
}

function translations(records) {
  return {
    schemaVersion: 'pptx-i18n-translations/v1',
    sourceLang: 'multi',
    targetLang: 'de',
    translations: records.map((record, index) => ({
      unitId: `u${index + 1}`,
      sourceText: record.sourceText,
      targetText: record.targetText,
    })),
  }
}

test('technical token extraction protects syntax while short ambiguous labels stay review-only', () => {
  const source =
    'Keep OOXML, CSS, API, `delay`, duration/holeSize, --allow-text-attrs, deck.json, a:t, pptx-i18n-scan/v1, and https://example.com/a.'
  const tokens = new Map(extractProtectedTokens(source).map((entry) => [entry.token, entry]))
  for (const token of [
    'OOXML',
    'CSS',
    'API',
    'delay',
    'duration/holeSize',
    'holeSize',
    '--allow-text-attrs',
    'deck.json',
    'a:t',
    'pptx-i18n-scan/v1',
    'https://example.com/a',
  ]) {
    assert.equal(tokens.has(token), true, `missing protected token ${token}`)
  }
  assert.equal(
    extractProtectedTokens('No radius (rect)').some((entry) => entry.token === 'radius'),
    false,
  )
  assert.equal(
    extractProtectedTokens('and/or').some((entry) => entry.token === 'and/or'),
    false,
  )
  assert.equal(highRiskShortWord('bug')?.reason, 'short-standalone-source-text')
  assert.equal(highRiskShortWord('Mar')?.reason, 'short-standalone-source-text')
  assert.equal(highRiskShortWord('OOXML'), null)
  assert.equal(highRiskShortWord('ordinary'), null)
})

test('project glossary validation is normalized and target-language bound', () => {
  const glossary = normalizeTranslationGlossary(
    {
      schemaVersion: 'pptx-nova-translation-glossary/v1',
      targetLang: 'de',
      entries: [
        { id: 'bug', source: 'bug', target: 'Fehler' },
        {
          id: 'duration',
          source: 'duration',
          target: 'Dauer',
          match: 'substring',
          caseSensitive: false,
        },
      ],
    },
    { targetLang: 'de' },
  )
  assert.equal(glossary.entries.length, 2)
  assert.equal(glossary.entries[0].match, 'term')
  assert.throws(
    () => normalizeTranslationGlossary({ ...glossary, targetLang: 'fr' }, { targetLang: 'de' }),
    /does not match target language/,
  )
})

test('protected token and glossary violations fail closed while short words remain warnings', () => {
  const sourceMemory = memory(['Use OOXML with `holeSize` in deck.json', 'bug', 'Mar'])
  const glossary = {
    schemaVersion: 'pptx-nova-translation-glossary/v1',
    targetLang: 'de',
    entries: [{ id: 'bug-term', source: 'bug', target: 'Fehler' }],
  }
  const constraints = buildTranslationConstraints(sourceMemory, { glossary })
  assert.equal(constraints.summary.highRiskShortWordCount, 2)
  assert.deepEqual(
    constraints.highRiskShortWords.map((entry) => entry.sourceText),
    ['bug', 'Mar'],
  )

  const blocked = validateTranslationConstraints(
    translations([
      {
        sourceText: 'Use OOXML with `holeSize` in deck.json',
        targetText: 'OOXML mit Lochgröße in deck.json verwenden',
      },
      { sourceText: 'bug', targetText: 'Insekt' },
      { sourceText: 'Mar', targetText: 'Beschädigen' },
    ]),
    constraints,
  )
  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.agentGate.passed, false)
  assert.equal(
    blocked.violations.some(
      (violation) =>
        violation.kind === 'protected-token-mismatch' &&
        violation.missing.some((item) => item.token === 'holeSize'),
    ),
    true,
  )
  assert.equal(
    blocked.violations.some(
      (violation) =>
        violation.kind === 'glossary-mismatch' && violation.expectedTargetTerm === 'Fehler',
    ),
    true,
  )
  assert.equal(
    blocked.warnings.filter((warning) => warning.kind === 'high-risk-short-word').length,
    2,
  )

  const passed = validateTranslationConstraints(
    translations([
      {
        sourceText: 'Use OOXML with `holeSize` in deck.json',
        targetText: 'OOXML mit `holeSize` in deck.json verwenden',
      },
      { sourceText: 'bug', targetText: 'Fehler' },
      { sourceText: 'Mar', targetText: 'Mär' },
    ]),
    constraints,
  )
  assert.equal(passed.status, 'pass')
  assert.equal(passed.agentGate.passed, true)
  assert.equal(
    passed.warnings.filter((warning) => warning.kind === 'high-risk-short-word').length,
    2,
  )
})
