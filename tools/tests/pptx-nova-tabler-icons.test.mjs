import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createOps } from '../../pptx-nova/assets/deckkits/core-primitives.kit.mjs'
import {
  getTablerIconAsset,
  getTablerIconPackInfo,
  getTablerIconSvg,
  listTablerIconNames,
  resolveTablerIconName,
  searchTablerIcons,
} from '../../pptx-nova/assets/deckkits/icon-assets.kit.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TOOL = join(ROOT, 'tools/generate-pptx-nova-tabler-icons.nu')
const ICON_CLI = join(ROOT, 'pptx-nova/scripts/pptx-nova-icons.mjs')
const PACK_PATH = join(ROOT, 'pptx-nova/assets/icons/tabler-icons.pack.br')
const LICENSE_PATH = join(ROOT, 'pptx-nova/assets/icons/icon-license')
const CATALOG_PATH = join(ROOT, 'pptx-nova/assets/icons/catalog.json')

const OUTLINE_SHELL =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
const outlineShell = (strokeWidth = '2') =>
  OUTLINE_SHELL.replace('stroke-width="2"', `stroke-width="${strokeWidth}"`)
const FILLED_SHELL =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">'

function readJsonCommand(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

test('Tabler icon pack metadata and license are present', () => {
  const info = getTablerIconPackInfo()
  assert.equal(info.schemaVersion, 'pptx-nova-tabler-icon-pack/v1')
  assert.equal(info.version, '3.45.0')
  assert.equal(info.counts.outline, 5112)
  assert.equal(info.counts.filled, 1054)
  assert.equal(info.iconCount, 6166)
  assert.match(getTablerIconSvg('presentation', { color: null }), /stroke-width="1"/)

  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'))
  const tablerEntry = catalog.entries.find((entry) => entry.id === 'tabler-full-pack')
  assert.equal(tablerEntry.pack, 'tabler-icons.pack.br')
  assert.equal(tablerEntry.licenseFile, 'icon-license')
  assert.equal(tablerEntry.iconCount, 6146)
  assert.deepEqual(tablerEntry.styles, { outline: 5093, filled: 1053 })

  const license = readFileSync(LICENSE_PATH, 'utf8')
  assert.match(license, /MIT License/)
  assert.match(license, /Copyright \(c\) 2020-2026 Paweł Kuna/)
  assert.match(license, /Permission is hereby granted, free of charge/)

  const packBytes = readFileSync(PACK_PATH)
  assert.ok(packBytes.length > 300_000)
  assert.ok(packBytes.length < 450_000)
})

test('Tabler icon helper searches, resolves aliases, recolors SVG, and emits add-image payloads', () => {
  assert.ok(listTablerIconNames().includes('presentation'))
  assert.equal(resolveTablerIconName('discount-2'), 'rosette-discount')

  const [first] = searchTablerIcons('presentation', { limit: 1 })
  assert.equal(first.name, 'presentation')
  assert.equal(first.style, 'outline')

  const svg = getTablerIconSvg('presentation', { color: 'C8583A', strokeWidth: 1.75 })
  assert.match(svg, /^<svg\b/)
  assert.match(svg, /stroke="#C8583A"/)
  assert.match(svg, /stroke-width="1.75"/)
  assert.match(svg, /<\/svg>$/)
  assert.doesNotMatch(svg, /currentColor/)

  const filled = getTablerIconSvg('star', { style: 'filled', color: 'F59E0B' })
  assert.match(filled, /fill="#F59E0B"/)

  const asset = getTablerIconAsset('presentation', { color: 'C8583A', strokeWidth: 1.75 })
  assert.equal(asset.mimeType, 'image/svg+xml')
  assert.equal(Buffer.from(asset.bytesBase64, 'base64').toString('utf8'), svg)

  const p = createOps()
  const op = p.icon(0, 'S0_StatusIcon', 'chart-line', 1, 2, 0.3, 0.3, { color: 'FFFFFF' })
  assert.equal(p.ops.length, 1)
  assert.equal(p.ops[0], op)
  assert.equal(op.op, 'add-image')
  assert.equal(op.name, 'S0_StatusIcon')
  assert.equal(op.x, '1in')
  assert.equal(op.y, '2in')
  assert.equal(op.w, '0.3in')
  assert.equal(op.h, '0.3in')
  assert.equal(op.mimeType, 'image/svg+xml')
  const opSvg = Buffer.from(op.bytesBase64, 'base64').toString('utf8')
  assert.match(opSvg, /#FFFFFF/)
  assert.match(opSvg, /stroke-width="1"/)
})

test('DeckKits do not override Tabler outline icon stroke width by default', () => {
  const deckkitPaths = [
    join(ROOT, 'pptx-nova/assets/deckkits/consulting-dark.kit.mjs'),
    join(ROOT, 'pptx-nova/assets/deckkits/mckinsey-blue.kit.mjs'),
    join(ROOT, 'pptx-nova/assets/deckkits/swiss-grid.kit.mjs'),
  ]

  for (const deckkitPath of deckkitPaths) {
    const source = readFileSync(deckkitPath, 'utf8')
    for (const match of source.matchAll(/strokeWidth\s*:\s*([0-9.]+)/g)) {
      assert.equal(match[1], '1', `${deckkitPath} uses non-default icon strokeWidth ${match[1]}`)
    }
  }
})

test('Tabler icon CLI supports agent search and batch get without rg', () => {
  const results = readJsonCommand('node', [
    ICON_CLI,
    'search',
    'presentation',
    '--style',
    'outline',
    '--limit',
    '3',
    '--json',
  ])
  assert.equal(results[0].name, 'presentation')

  const icons = readJsonCommand('node', [
    ICON_CLI,
    'get',
    'presentation',
    'chart-line',
    '--style',
    'outline',
    '--json',
  ])
  assert.deepEqual(
    icons.map((icon) => icon.name),
    ['presentation', 'chart-line'],
  )
  assert.match(icons[0].svg, /^<svg\b/)
  assert.match(icons[1].svg, /<\/svg>$/)
})

test('DeckKit core primitive emits add-run ops with the shared font floor', () => {
  const p = createOps()

  p.addRun(0, 'S0_Copy', 0, 'emphasis', { name: 'Arial', size: '7pt', color: 'E2231A' })

  assert.deepEqual(p.ops, [
    {
      op: 'add-run',
      slide: 0,
      shape: { name: 'S0_Copy' },
      paragraph: 0,
      text: 'emphasis',
      font: { name: 'Arial', size: '9pt', color: 'E2231A' },
    },
  ])
})

test('Tabler icon generator writes deterministic Brotli pack and license', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-nova-tabler-icons-'))
  const sourceRoot = join(dir, 'tabler-icons')
  const outlineDir = join(sourceRoot, 'icons', 'outline')
  const filledDir = join(sourceRoot, 'icons', 'filled')
  const outputPath = join(dir, 'out', 'tabler-icons.pack.br')
  const licenseOutputPath = join(dir, 'out', 'icon-license')
  mkdirSync(outlineDir, { recursive: true })
  mkdirSync(filledDir, { recursive: true })

  writeJson(join(sourceRoot, 'package.json'), { version: '0.0.0-test' })
  writeJson(join(sourceRoot, 'aliases.json'), {
    outline: { 'demo-alias': 'demo' },
    filled: {},
  })
  writeFileSync(
    join(sourceRoot, 'LICENSE'),
    'MIT License\n\nCopyright (c) 2020-2026 Paweł Kuna\n\nPermission is hereby granted, free of charge\n',
  )
  writeFileSync(
    join(outlineDir, 'demo.svg'),
    `<!--
tags: [demo, sample]
category: Test
version: "1.0"
unicode: "e000"
-->
${OUTLINE_SHELL}
  <path d="M1 2l3 4" />
</svg>
`,
  )
  writeFileSync(
    join(filledDir, 'star.svg'),
    `<!--
version: "2.0"
unicode: "f000"
-->
${FILLED_SHELL}
  <path d="M2 2l4 8" />
</svg>
`,
  )

  const generate = spawnSync(
    'nu',
    [
      TOOL,
      '--source-root',
      sourceRoot,
      '--output',
      outputPath,
      '--license-output',
      licenseOutputPath,
      '--stroke',
      '1.5',
    ],
    { cwd: ROOT, encoding: 'utf8' },
  )
  assert.equal(generate.status, 0, generate.stderr || generate.stdout)
  assert.equal(
    readFileSync(licenseOutputPath, 'utf8'),
    readFileSync(join(sourceRoot, 'LICENSE'), 'utf8'),
  )

  const info = readJsonCommand('node', [ICON_CLI, 'info', '--pack', outputPath, '--json'])
  assert.equal(info.version, '0.0.0-test')
  assert.equal(info.iconCount, 2)
  assert.deepEqual(info.counts, { outline: 1, filled: 1 })

  const found = readJsonCommand('node', [
    ICON_CLI,
    'search',
    'demo-alias',
    '--pack',
    outputPath,
    '--json',
  ])
  assert.equal(found[0].name, 'demo')

  const icons = readJsonCommand('node', [
    ICON_CLI,
    'get',
    'demo-alias',
    '--pack',
    outputPath,
    '--json',
  ])
  assert.equal(icons[0].name, 'demo')
  assert.equal(icons[0].svg, `${outlineShell('1.5')}<path d="M1 2l3 4"/></svg>`)

  const check = spawnSync(
    'nu',
    [
      TOOL,
      '--source-root',
      sourceRoot,
      '--output',
      outputPath,
      '--license-output',
      licenseOutputPath,
      '--stroke',
      '1.5',
      '--check',
    ],
    { cwd: ROOT, encoding: 'utf8' },
  )
  assert.equal(check.status, 0, check.stderr || check.stdout)
})
