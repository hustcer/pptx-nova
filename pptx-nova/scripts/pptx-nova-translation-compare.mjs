#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const SCHEMA_VERSION = 'pptx-nova-translation-compare/v1'

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-translation-compare.mjs --source <source.pptx> --candidate <translated.pptx> --run-dir <run-dir> [options]

Options:
  --source <path>           Read-only source PPTX before translation.
  --candidate <path>        Translated candidate/final PPTX.
  --run-dir <path>          Run directory used for preview evidence.
  --output <path>           Output PNG. Defaults to run-dir/translation-compare.png.
  --report <path>           Output JSON report. Defaults to run-dir/translation-compare.json.
  --slides <selector>       Optional 1-based slide selector, e.g. 1,3-5.
  --dpi <number>            PNG render DPI. Defaults to 192.
  --xdoc-bin <path>         xdoc executable. Defaults to xdoc.
  --magick-bin <path>       ImageMagick executable. Defaults to magick.
  --font <path>             Optional TrueType/OpenType font path for header labels.
  --source-label <text>     Left-column label. Defaults to "Before translation".
  --candidate-label <text>  Right-column label. Defaults to "After translation".
  --overwrite               Allow replacing existing output/report files.
  --json                    Print the report to stdout.
  --help                    Show this help.

The helper renders source and translated PPTX pages at high DPI, pairs every
slide left/right, stacks all pairs into one PNG, and writes a machine-readable
report for final delivery evidence.
`

const valueFlags = {
  '--source': 'source',
  '--candidate': 'candidate',
  '--run-dir': 'runDir',
  '--output': 'output',
  '--report': 'report',
  '--slides': 'slides',
  '--dpi': 'dpi',
  '--xdoc-bin': 'xdocBin',
  '--magick-bin': 'magickBin',
  '--font': 'font',
  '--source-label': 'sourceLabel',
  '--candidate-label': 'candidateLabel',
}

function parseArgs(argv) {
  const args = {
    source: '',
    candidate: '',
    runDir: '',
    output: '',
    report: '',
    slides: '',
    dpi: 192,
    xdocBin: 'xdoc',
    magickBin: 'magick',
    font: '',
    sourceLabel: 'Before translation',
    candidateLabel: 'After translation',
    overwrite: false,
    json: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    }
    if (arg === '--overwrite') {
      args.overwrite = true
      continue
    }
    if (arg === '--json') {
      args.json = true
      continue
    }
    const key = valueFlags[arg]
    if (!key) throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
    args[key] = key === 'dpi' ? Number(value) : value
    index += 1
  }

  if (!args.source) throw new Error(`--source is required.\n\n${usage}`)
  if (!args.candidate) throw new Error(`--candidate is required.\n\n${usage}`)
  if (!args.runDir) throw new Error(`--run-dir is required.\n\n${usage}`)
  if (!Number.isInteger(args.dpi) || args.dpi < 72) {
    throw new Error('--dpi must be an integer >= 72')
  }

  args.source = resolve(args.source)
  args.candidate = resolve(args.candidate)
  args.runDir = resolve(args.runDir)
  args.output = resolve(args.output || join(args.runDir, 'translation-compare.png'))
  args.report = resolve(args.report || join(args.runDir, 'translation-compare.json'))
  if (args.font) args.font = resolve(args.font)
  return args
}

function commandText(bin, args) {
  return [bin, ...args].map((value) => (/\s/.test(value) ? JSON.stringify(value) : value)).join(' ')
}

function run(bin, args, options = {}) {
  const result = spawnSync(bin, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  if (result.error) {
    throw new Error(`${commandText(bin, args)} failed to start: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(
      `${commandText(bin, args)} failed with exit ${result.status}\n${result.stderr || result.stdout}`,
    )
  }
  return result
}

function ensureInputFile(path, label) {
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const stat = statSync(path)
  if (!stat.isFile()) throw new Error(`${label} is not a file: ${path}`)
}

function ensureWritable(path, overwrite) {
  if (existsSync(path) && !overwrite) {
    throw new Error(`Refusing to overwrite existing file without --overwrite: ${path}`)
  }
  mkdirSync(dirname(path), { recursive: true })
}

function renderDeck(args, kind, input, outputDir) {
  mkdirSync(outputDir, { recursive: true })
  const report = join(outputDir, `${kind}-convert-report.json`)
  const convertArgs = [
    'convert',
    input,
    '--to',
    'png',
    '-o',
    outputDir,
    '--overwrite',
    '--dpi',
    String(args.dpi),
    '--prefix',
    kind,
    '--manifest',
    'true',
    '--report',
    report,
  ]
  if (args.slides) convertArgs.push('--slides', args.slides)
  run(args.xdocBin, convertArgs)
  return {
    report,
    pages: listPngs(outputDir, kind).map((path) => ({ path, ...identify(args.magickBin, path) })),
  }
}

function listPngs(dir, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const prefixPattern = new RegExp(`^${escaped}[-_]?\\d+.*\\.png$`, 'i')
  return readdirSync(dir)
    .filter((name) => prefixPattern.test(name))
    .sort((a, b) => naturalCompare(a, b))
    .map((name) => join(dir, name))
}

function naturalCompare(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

function identify(magickBin, path) {
  const result = run(magickBin, ['identify', '-format', '%w %h', path])
  const [width, height] = result.stdout.trim().split(/\s+/).map(Number)
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Could not identify PNG dimensions: ${path}`)
  }
  return { width, height }
}

function findHeaderFont(args) {
  const candidates = [
    args.font,
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/System/Library/Fonts/Supplemental/Helvetica.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/Library/Fonts/Arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/opentype/noto/NotoSans-Regular.ttf',
  ].filter(Boolean)
  return candidates.find((path) => existsSync(path)) || ''
}

function makeHeader(args, path, width, leftWidth, rightWidth, height) {
  const fontSize = Math.max(28, Math.round(height * 0.34))
  const padding = Math.max(24, Math.round(height * 0.2))
  const font = findHeaderFont(args)
  const command = [
    '-size',
    `${width}x${height}`,
    'xc:white',
  ]
  if (font) {
    command.push(
      '-font',
      font,
      '-fill',
      '#111111',
      '-pointsize',
      String(fontSize),
      '-gravity',
      'northwest',
      '-annotate',
      `+${padding}+${Math.round(height * 0.26)}`,
      args.sourceLabel,
      '-gravity',
      'northwest',
      '-annotate',
      `+${leftWidth + padding}+${Math.round(height * 0.26)}`,
      args.candidateLabel,
    )
  }
  command.push(
    '-fill',
    '#D0D5DD',
    '-draw',
    `rectangle ${leftWidth},0 ${leftWidth + 1},${height}`,
    '-density',
    String(args.dpi),
    '-units',
    'PixelsPerInch',
    path,
  )
  run(args.magickBin, command)
  return { path, width, height, leftWidth, rightWidth, labelRendered: Boolean(font), font: font || null }
}

function makeRows(args, sourcePages, candidatePages, rowsDir) {
  mkdirSync(rowsDir, { recursive: true })
  const gap = Math.max(24, Math.round(args.dpi * 0.12))
  const rows = []

  for (let index = 0; index < sourcePages.length; index += 1) {
    const source = sourcePages[index]
    const candidate = candidatePages[index]
    const rowHeight = Math.max(source.height, candidate.height)
    const sourceWidth = Math.round((source.width * rowHeight) / source.height)
    const candidateWidth = Math.round((candidate.width * rowHeight) / candidate.height)
    const rowPath = join(rowsDir, `row-${String(index + 1).padStart(3, '0')}.png`)
    const command = [
      '(',
      source.path,
      '-resize',
      `${sourceWidth}x${rowHeight}!`,
      ')',
      '(',
      '-size',
      `${gap}x${rowHeight}`,
      'xc:white',
      ')',
      '(',
      candidate.path,
      '-resize',
      `${candidateWidth}x${rowHeight}!`,
      ')',
      '+append',
      '-density',
      String(args.dpi),
      '-units',
      'PixelsPerInch',
      rowPath,
    ]
    run(args.magickBin, command)
    rows.push({
      path: rowPath,
      sourceWidth,
      candidateWidth,
      gap,
      ...identify(args.magickBin, rowPath),
    })
  }

  return rows
}

function appendRows(args, header, rows, output) {
  const gap = Math.max(24, Math.round(args.dpi * 0.12))
  const inputs = [header.path]
  for (const row of rows) {
    inputs.push('-size', `${header.width}x${gap}`, 'xc:white', row.path)
  }
  run(args.magickBin, [
    ...inputs,
    '-append',
    '-density',
    String(args.dpi),
    '-units',
    'PixelsPerInch',
    output,
  ])
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  ensureInputFile(args.source, 'source PPTX')
  ensureInputFile(args.candidate, 'candidate PPTX')
  ensureWritable(args.output, args.overwrite)
  ensureWritable(args.report, args.overwrite)
  mkdirSync(args.runDir, { recursive: true })

  const workDir = join(args.runDir, 'translation-compare')
  const sourceDir = join(workDir, 'source')
  const candidateDir = join(workDir, 'candidate')
  const rowsDir = join(workDir, 'rows')
  const headerPath = join(workDir, 'header.png')

  const sourceRender = renderDeck(args, 'source', args.source, sourceDir)
  const candidateRender = renderDeck(args, 'candidate', args.candidate, candidateDir)
  if (sourceRender.pages.length === 0) throw new Error('source render produced no PNG pages')
  if (candidateRender.pages.length === 0) throw new Error('candidate render produced no PNG pages')
  if (sourceRender.pages.length !== candidateRender.pages.length) {
    throw new Error(
      `source/candidate rendered page count mismatch: ${sourceRender.pages.length} vs ${candidateRender.pages.length}`,
    )
  }

  const rows = makeRows(args, sourceRender.pages, candidateRender.pages, rowsDir)
  const firstRow = rows[0]
  const headerHeight = Math.max(72, Math.round(firstRow.height * 0.055))
  const header = makeHeader(
    args,
    headerPath,
    firstRow.width,
    firstRow.sourceWidth + firstRow.gap,
    firstRow.candidateWidth,
    headerHeight,
  )
  appendRows(args, header, rows, args.output)
  const outputStat = statSync(args.output)
  const outputDimensions = identify(args.magickBin, args.output)

  const report = {
    schemaVersion: SCHEMA_VERSION,
    status: 'success',
    source: args.source,
    candidate: args.candidate,
    slideSelector: args.slides || null,
    dpi: args.dpi,
    sourceLabel: args.sourceLabel,
    candidateLabel: args.candidateLabel,
    headerLabelRendered: header.labelRendered,
    headerFont: header.font,
    output: args.output,
    byteLength: outputStat.size,
    width: outputDimensions.width,
    height: outputDimensions.height,
    pageCount: rows.length,
    previews: {
      sourceDir,
      candidateDir,
      sourceReport: sourceRender.report,
      candidateReport: candidateRender.report,
      rowsDir,
    },
    pages: rows.map((row, index) => ({
      slide: index + 1,
      source: sourceRender.pages[index],
      candidate: candidateRender.pages[index],
      row,
    })),
  }

  writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`)
  if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else {
    process.stdout.write(
      `translation compare image written: ${args.output} (${basename(args.source)} vs ${basename(args.candidate)}, ${rows.length} slides, ${args.dpi} dpi)\n`,
    )
  }
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
}
