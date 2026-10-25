import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { repoRoot, skillPath } from '../helpers/common.mjs'

test('quarterly report patch uses the current chart legend enum', () => {
  const patch = JSON.parse(
    readFileSync(skillPath('assets/examples/create/quarterly-report.patch.json'), 'utf8'),
  )
  const chart = patch.ops.find((op) => op.op === 'add-chart' && op.name === 'Revenue')

  assert.ok(chart, 'quarterly report patch should include the revenue chart')
  assert.equal(chart.legend, 'bottom')
})

test('deck generator data-room chart omits the unsupported none legend value', () => {
  const result = spawnSync(
    process.execPath,
    [skillPath('assets/examples/generator/deck-generator-template.mjs'), '--layout', 'data-room'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const patch = JSON.parse(result.stdout)
  const chart = patch.ops.find((op) => op.op === 'add-chart' && op.name === 'DataDriverChart')

  assert.ok(chart, 'data-room layout should emit the loss-driver chart')
  assert.equal('legend' in chart, false)
})

test('deck generator layouts emit canonical aggregate patch payloads', () => {
  const expectedTableCells = {
    'executive-grid': 15,
    'narrative-split': 15,
    'data-room': 40,
  }
  for (const layout of ['executive-grid', 'narrative-split', 'data-room']) {
    const result = spawnSync(
      process.execPath,
      [skillPath('assets/examples/generator/deck-generator-template.mjs'), '--layout', layout],
      { cwd: repoRoot, encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const patch = JSON.parse(result.stdout)
    let tableCellCount = 0

    for (const op of patch.ops) {
      if (op.op === 'add-shape') {
        assert.equal('shape' in op, false, `${layout}: add-shape must use kind or preset`)
        assert.equal('kind' in op || 'preset' in op, true, `${layout}: add-shape type missing`)
      }
      if (op.op === 'set-chart') {
        for (const legacyField of ['axis', 'scope', 'showValue', 'position', 'fill']) {
          assert.equal(legacyField in op, false, `${layout}: legacy set-chart.${legacyField}`)
        }
        if ('series' in op) assert.equal(Array.isArray(op.series), true)
        if ('axes' in op) assert.equal(Array.isArray(op.axes), true)
        if ('dataLabels' in op) assert.equal(Array.isArray(op.dataLabels), true)
      }
      if (op.op === 'set-table') {
        for (const legacyField of [
          'row',
          'col',
          'height',
          'firstRow',
          'firstCol',
          'horzBanding',
          'startRow',
          'startCol',
          'endRow',
          'endCol',
        ]) {
          assert.equal(legacyField in op, false, `${layout}: legacy set-table.${legacyField}`)
        }
        tableCellCount += (op.cells ?? []).length
        for (const cell of op.cells ?? []) {
          assert.equal('col' in cell, false, `${layout}: legacy set-table.cells[].col`)
          assert.equal(
            Number.isInteger(cell.column),
            true,
            `${layout}: set-table.cells[].column must be an integer`,
          )
        }
      }
    }
    assert.equal(tableCellCount, expectedTableCells[layout])
  }
})

test('copyable reference examples avoid removed xdoc payload aliases', () => {
  const referencesDir = skillPath('references')
  const markdown = readdirSync(referencesDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => readFileSync(join(referencesDir, name), 'utf8'))
    .join('\n')

  for (const legacyTrigger of ['onClick', 'withPrevious', 'afterPrevious']) {
    assert.equal(
      markdown.includes(legacyTrigger),
      false,
      `legacy animation trigger: ${legacyTrigger}`,
    )
  }
  assert.equal(
    /"shape"\s*:\s*\{\s*"id"\s*:\s*"/.test(markdown),
    false,
    'shape selector ids must be numeric',
  )
  assert.equal(
    /"shape"\s*:\s*\{\s*"placeholder"\s*:\s*\{\s*"type"/.test(markdown),
    false,
    'direct shape placeholder selectors must use a string value',
  )
  assert.equal(
    /"fonts"\s*:\s*\{\s*"major"\s*:\s*"/.test(markdown),
    false,
    'theme font patches must use typeface objects',
  )
  assert.equal(
    /"effect"\s*:\s*\{\s*"kind"/.test(markdown),
    false,
    'shape effects must use shadow/glow/reflection/softEdge objects',
  )
  const tableReferences = [
    skillPath('references/content/tables.md'),
    skillPath('references/edit/patch-ops-cheatsheet.md'),
  ]
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')
  for (const legacyTableField of ['`cols`', '`col`', '{ col, width }']) {
    assert.equal(
      tableReferences.includes(legacyTableField),
      false,
      `legacy public table field: ${legacyTableField}`,
    )
  }
  assert.equal(/\brow,\s*col\b/.test(tableReferences), false, 'legacy public table field: row, col')
  assert.equal(
    markdown.includes('将 `type` 明确设为 `fade`'),
    false,
    'transition fallback must use set-slide-transition.kind',
  )
  assert.equal(
    /"source"\s*:\s*\{\s*"assetSource"/.test(markdown),
    false,
    'bind-data sources must use a direct path instead of an assetSource wrapper',
  )

  for (const legacyEffect of ['fadeOut', 'wipeOut', 'flyOut']) {
    assert.equal(markdown.includes(legacyEffect), false, `legacy animation effect: ${legacyEffect}`)
  }
  assert.equal(
    /["']kind["']\s*:\s*["'](?:solid|gradient|pattern|none)["']/.test(markdown),
    false,
    'fill payloads must use type instead of the removed kind discriminator',
  )
  assert.equal(
    /["']type["']\s*:\s*["']radialGradient["']/.test(markdown),
    false,
    'radial fills must use type=gradient with path=circle',
  )
  for (const legacyChartEnum of [
    'column3D',
    'bar3D',
    'line3D',
    'area3D',
    'pie3D',
    'surface3D',
    'bubble3D',
    'boxWhisker',
    'regionMap',
    'percentStacked',
    'linesNoMarkers',
    'smoothNoMarkers',
  ]) {
    assert.equal(markdown.includes(legacyChartEnum), false, `legacy chart enum: ${legacyChartEnum}`)
  }
})

test('tracked literal op values stay within the current xdoc patch and condition schemas', () => {
  const schema = JSON.parse(readFileSync(join(repoRoot, 'docs/xdoc-schema.json'), 'utf8'))
  const canonicalOps = new Set(schema.commands.pptx.patchSchema.supportedOps)
  // Both patch operations and control-flow comparisons use the literal key `op`.
  const definitions = schema.commands.pptx.patchSchema.jsonSchema.$defs
  const conditionOps = new Set()
  for (const condition of definitions.controlCondition.oneOf) {
    const operator = condition.properties.op
    // Selector-existence conditions have no comparison operator.
    if (!operator) continue
    assert.match(operator.$ref, /^#\/\$defs\/[^/]+$/)
    const values = definitions[operator.$ref.slice('#/$defs/'.length)]?.enum
    assert.ok(Array.isArray(values) && values.length > 0, `Missing operator enum: ${operator.$ref}`)
    for (const value of values) conditionOps.add(value)
  }
  assert.ok(conditionOps.size > 0, 'Control conditions must define comparison operators')
  const tracked = spawnSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.equal(tracked.status, 0, tracked.stderr || tracked.stdout)

  const invalid = []
  const literalOp = /(?:["']op["']|(?<![\w.])op)\s*:\s*(["'])([^"']+)\1/g
  for (const relativePath of tracked.stdout.split('\0').filter(Boolean)) {
    if (relativePath === 'docs/xdoc-schema.json') continue
    const source = readFileSync(join(repoRoot, relativePath), 'utf8')
    if (source.includes('\0')) continue
    for (const match of source.matchAll(literalOp)) {
      if (canonicalOps.has(match[2]) || conditionOps.has(match[2]) || match[2] === '...') continue
      invalid.push(`${relativePath}: ${match[2]}`)
    }
  }

  assert.deepEqual(invalid, [])
})
