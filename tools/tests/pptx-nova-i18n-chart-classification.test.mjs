import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve('.')
const script = join(root, 'pptx-nova/scripts/pptx-nova-i18n-classify-chart-units.mjs')
const sha = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)

function fixture(decisions) {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-nova-chart-classify-'))
  const scanPath = join(dir, 'scan.json')
  const decisionsPath = join(dir, 'decisions.json')
  const output = join(dir, 'classified.json')
  const scan = {
    schemaVersion: 'pptx-i18n-scan/v1',
    i18nUnits: {
      units: [
        {
          unitId: 'mon',
          category: 'chartVisibleCache',
          action: 'review',
          sourceText: 'Mon',
          sourceHash: 'sha256:mon',
          requiresReview: true,
          notes: ['language-classification-uncertain'],
        },
        {
          unitId: 'api',
          category: 'chartVisibleCache',
          action: 'review',
          sourceText: 'API',
          sourceHash: 'sha256:api',
          requiresReview: true,
          notes: ['language-classification-uncertain'],
        },
      ],
    },
  }
  writeJson(scanPath, scan)
  const scanBytes = readFileSync(scanPath)
  writeJson(decisionsPath, {
    schemaVersion: 'pptx-nova-i18n-chart-decisions/v1',
    scanSha256: sha(scanBytes),
    decisions,
  })
  return { scanPath, decisionsPath, output }
}

test('chart classification converts review inventory into explicit translate and preserve units', () => {
  const item = fixture([
    {
      unitId: 'mon',
      sourceHash: 'sha256:mon',
      decision: 'translate',
      reason: 'weekday sequence in stock-chart categories',
    },
    { unitId: 'api', sourceHash: 'sha256:api', decision: 'preserve', reason: 'product acronym' },
  ])
  const result = spawnSync(
    process.execPath,
    [
      script,
      '--scan',
      item.scanPath,
      '--decisions',
      item.decisionsPath,
      '--output',
      item.output,
      '--json',
    ],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
  const classified = JSON.parse(readFileSync(item.output, 'utf8'))
  assert.equal(classified.i18nUnits.units[0].action, 'translate')
  assert.equal(classified.i18nUnits.units[0].requiresReview, false)
  assert.equal(classified.i18nUnits.units[1].action, 'preserve')
})

test('chart classification fails closed when any review unit is unclassified', () => {
  const item = fixture([
    { unitId: 'mon', sourceHash: 'sha256:mon', decision: 'translate', reason: 'weekday sequence' },
  ])
  const result = spawnSync(
    process.execPath,
    [
      script,
      '--scan',
      item.scanPath,
      '--decisions',
      item.decisionsPath,
      '--output',
      item.output,
      '--json',
    ],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /missing chart classification for api/)
})
