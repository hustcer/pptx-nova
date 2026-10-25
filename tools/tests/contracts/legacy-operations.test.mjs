import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { repoRoot } from '../helpers/common.mjs'

test('tracked repository sources do not retain removed legacy xdoc op names', () => {
  const removedOps = [
    'add-picture',
    'add-slide-layout',
    'add-slide-layout-placeholder',
    'add-textbox',
    'clear-run-hyperlink',
    'clear-slide-notes',
    'fill-layout',
    'import-table-data',
    'raw-ooxml-patch',
    'replace-structured-paragraph-text',
    'set-cell-formula',
    'set-chart-axis-scale',
    'set-chart-axis-style',
    'set-chart-axis-ticks',
    'set-chart-data-labels',
    'set-chart-gridline-style',
    'set-chart-legend-style',
    'set-chart-marker-style',
    'set-chart-plot-style',
    'set-chart-point-style',
    'set-chart-series-style',
    'set-chart-style',
    'set-chart-title-style',
    'set-core-prop',
    'set-master-bg',
    'set-master-placeholder-style',
    'set-paragraph-bullet',
    'set-paragraph-format',
    'set-picture-crop',
    'set-presentation-default-text-style',
    'set-run-hyperlink',
    'set-shape-click-action',
    'set-shape-effect',
    'set-shape-flip',
    'set-shape-line',
    'set-shape-name',
    'set-shape-outline',
    'set-shape-position',
    'set-shape-rotation',
    'set-shape-size',
    'set-shape-text-style',
    'set-shape-z-order',
    'set-slide-layout-type',
    'set-slide-notes-rich-text',
    'set-table-cell',
    'set-table-cell-style',
    'set-table-column-width',
    'set-table-range-borders',
    'set-table-row-height',
    'set-table-style',
    'set-text',
    'set-text-frame-auto-size',
    'set-text-frame-vertical-text',
    'set-text-style',
    'set-theme-color',
    'set-theme-font',
  ]
  const tracked = spawnSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.equal(tracked.status, 0, tracked.stderr || tracked.stdout)

  const residuals = []
  for (const relativePath of tracked.stdout.split('\0').filter(Boolean)) {
    if (
      relativePath === 'docs/xdoc-schema.json' ||
      relativePath === 'tools/tests/contracts/legacy-operations.test.mjs'
    ) {
      continue
    }
    const source = readFileSync(join(repoRoot, relativePath), 'utf8')
    if (source.includes('\0')) continue
    for (const op of removedOps) {
      const escaped = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`(?<![A-Za-z0-9-])${escaped}(?![A-Za-z0-9-])`).test(source)) {
        residuals.push(`${relativePath}: ${op}`)
      }
    }
  }

  assert.deepEqual(residuals, [])
})
