import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createOps } from '../../../pptx-nova/assets/deckkits/shared/core-primitives.kit.mjs'
import {
  getTablerIconAsset,
  getTablerIconPackInfo,
  getTablerIconSvg,
  listTablerIconNames,
  resolveTablerIconName,
  searchTablerIcons,
} from '../../../pptx-nova/assets/deckkits/shared/icon-assets.kit.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const TOOL = join(ROOT, 'tools/generate-pptx-nova-tabler-icons.nu')
const ICON_CLI = join(ROOT, 'pptx-nova/scripts/cli/assets/icons.mjs')
const ICONS_DIR = join(ROOT, 'pptx-nova/assets/icons')
const CATALOG_TSV_PATH = join(ICONS_DIR, 'tabler-icons.catalog.tsv')
const OUTLINE_TSV_PATH = join(ICONS_DIR, 'tabler-icons.outline.tsv')
const FILLED_TSV_PATH = join(ICONS_DIR, 'tabler-icons.filled.tsv')
const LEGACY_BR_PATH = join(ICONS_DIR, 'tabler-icons.pack.br')
const LICENSE_PATH = join(ICONS_DIR, 'icon-license')
const CATALOG_PATH = join(ICONS_DIR, 'catalog.json')

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

test('Tabler icon pack metadata, plain-text TSV parts, and license are present', () => {
  const info = getTablerIconPackInfo()
  assert.equal(info.schemaVersion, 'pptx-nova-tabler-icon-pack/v2')
  assert.equal(info.version, '3.45.0')
  assert.equal(info.counts.outline, 5112)
  assert.equal(info.counts.filled, 1054)
  assert.equal(info.iconCount, 6166)
  assert.match(getTablerIconSvg('presentation', { color: null }), /stroke-width="1"/)

  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'))
  const tablerEntry = catalog.entries.find((entry) => entry.id === 'tabler-full-pack')
  assert.equal(tablerEntry.pack, 'tabler-icons.catalog.tsv')
  assert.deepEqual(tablerEntry.files, {
    catalog: 'tabler-icons.catalog.tsv',
    outline: 'tabler-icons.outline.tsv',
    filled: 'tabler-icons.filled.tsv',
  })
  assert.equal(tablerEntry.licenseFile, 'icon-license')
  assert.equal(tablerEntry.sourceVersion, info.version)
  assert.equal(tablerEntry.iconCount, info.iconCount)
  assert.deepEqual(tablerEntry.styles, info.counts)
  assert.equal(tablerEntry.integrityManifest, 'tabler-icons.pack.manifest.json')

  const license = readFileSync(LICENSE_PATH, 'utf8')
  assert.match(license, /MIT License/)
  assert.match(license, /Copyright \(c\) 2020-2026 Paweł Kuna/)
  assert.match(license, /Permission is hereby granted, free of charge/)

  assert.equal(existsSync(LEGACY_BR_PATH), false)
  assert.ok(readFileSync(CATALOG_TSV_PATH, 'utf8').includes('# part=catalog\n'))
  assert.ok(readFileSync(OUTLINE_TSV_PATH, 'utf8').includes('# part=outline\n'))
  assert.ok(readFileSync(FILLED_TSV_PATH, 'utf8').includes('# part=filled\n'))
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
  assert.match(opSvg, /stroke-width="1.2"/)
  assert.throws(
    () => p.icon(0, 'TooHeavy', 'chart-line', 1, 2, 0.3, 0.3, { strokeWidth: 1.6 }),
    /1.5/,
  )
})

test('DeckKit component overrides cannot exceed the global semantic icon stroke ceiling', () => {
  const deckkitPaths = [
    join(ROOT, 'pptx-nova/assets/deckkits/shared/icon-assets.kit.mjs'),
    join(ROOT, 'pptx-nova/assets/deckkits/mckinsey-blue/components.mjs'),
    join(ROOT, 'pptx-nova/assets/deckkits/paper-scholar/components.mjs'),
    join(ROOT, 'pptx-nova/assets/deckkits/swiss-grid/components.mjs'),
  ]

  for (const deckkitPath of deckkitPaths) {
    const source = readFileSync(deckkitPath, 'utf8')
    for (const match of source.matchAll(/strokeWidth\s*:\s*([0-9.]+)/g)) {
      assert.ok(
        Number(match[1]) > 0 && Number(match[1]) <= 1.5,
        `${deckkitPath} exceeds semantic icon stroke ceiling`,
      )
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

test('Tabler icon generator writes deterministic split plain-text TSVs, manifest, and license', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-nova-tabler-icons-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const sourceRoot = join(dir, 'tabler-icons')
  const outlineDir = join(sourceRoot, 'icons', 'outline')
  const filledDir = join(sourceRoot, 'icons', 'filled')
  const outDir = join(dir, 'out')
  const outputPath = join(outDir, 'tabler-icons.catalog.tsv')
  const licenseOutputPath = join(outDir, 'icon-license')
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
  assert.equal(existsSync(join(outDir, 'tabler-icons.catalog.tsv')), true)
  assert.equal(existsSync(join(outDir, 'tabler-icons.outline.tsv')), true)
  assert.equal(existsSync(join(outDir, 'tabler-icons.filled.tsv')), true)
  assert.equal(existsSync(join(outDir, 'tabler-icons.pack.manifest.json')), true)
  assert.equal(existsSync(join(outDir, 'tabler-icons.pack.br')), false)

  // Both entry path and directory path work for querying.
  for (const packArg of [outputPath, outDir, join(outDir, 'tabler-icons.pack.manifest.json')]) {
    const info = readJsonCommand('node', [ICON_CLI, 'info', '--pack', packArg, '--json'])
    assert.equal(info.schemaVersion, 'pptx-nova-tabler-icon-pack/v2')
    assert.equal(info.version, '0.0.0-test')
    assert.equal(info.iconCount, 2)
    assert.deepEqual(info.counts, { outline: 1, filled: 1 })
  }

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

  const filledIcons = readJsonCommand('node', [
    ICON_CLI,
    'get',
    'star',
    '--style',
    'filled',
    '--pack',
    outDir,
    '--json',
  ])
  assert.equal(filledIcons[0].svg, `${FILLED_SHELL}<path d="M2 2l4 8"/></svg>`)

  const check = spawnSync(
    'nu',
    [
      TOOL,
      '--source-root',
      sourceRoot,
      '--output',
      outDir,
      '--license-output',
      licenseOutputPath,
      '--stroke',
      '1.5',
      '--check',
    ],
    { cwd: ROOT, encoding: 'utf8' },
  )
  assert.equal(check.status, 0, check.stderr || check.stdout)

  const manifestPath = join(outDir, 'tabler-icons.pack.manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.storage.format, 'split-tsv')
  assert.equal(manifest.storage.compression, 'none')
  assert.equal(manifest.canonical.iconCount, 2)

  // Stale detection catches tampered part files as well as stale manifest.
  const outlinePath = join(outDir, 'tabler-icons.outline.tsv')
  const originalOutline = readFileSync(outlinePath, 'utf8')
  writeFileSync(outlinePath, `${originalOutline}# drift\n`)
  const stalePart = spawnSync(
    'node',
    [
      ICON_CLI,
      'generate',
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
  assert.equal(stalePart.status, 1)
  assert.match(stalePart.stderr, /tabler-icons\.outline\.tsv/)
  writeFileSync(outlinePath, originalOutline)

  writeFileSync(manifestPath, '{}\n')
  const staleManifest = spawnSync(
    'node',
    [
      ICON_CLI,
      'generate',
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
  assert.equal(staleManifest.status, 1)
  assert.match(staleManifest.stderr, /manifest\.json/)
})
