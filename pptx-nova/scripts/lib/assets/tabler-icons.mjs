import { SKILL_ROOT } from '../runtime/skill-paths.mjs'

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { brotliDecompressSync } from 'node:zlib'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export const PACK_SCHEMA_VERSION = 'pptx-nova-tabler-icon-pack/v1'
export const SPLIT_PACK_SCHEMA_VERSION = 'pptx-nova-tabler-icon-pack/v2'
export const PACK_MANIFEST_SCHEMA_VERSION = 'pptx-nova-tabler-icon-pack-manifest/v2'
export const LEGACY_PACK_MANIFEST_SCHEMA_VERSION = 'pptx-nova-tabler-icon-pack-manifest/v1'
export const MAX_PACK_BYTES = 4 * 1024 * 1024
export const MAX_DECODED_PACK_BYTES = 16 * 1024 * 1024
export const DEFAULT_SOURCE_ROOT = process.env.TABLER_ICONS_ROOT ?? ''

export const DEFAULT_PACK_PATH = join(SKILL_ROOT, 'assets/icons/tabler-icons.catalog.tsv')
export const DEFAULT_LICENSE_PATH = join(SKILL_ROOT, 'assets/icons/icon-license')

const STYLES = ['outline', 'filled']
const SPLIT_PARTS = ['catalog', 'outline', 'filled']
const ICON_NAME_RE = /^[a-z0-9][a-z0-9-]*$/
const FIELD_SEP = '\t'
const DEFAULT_LIMIT = 20
const DEFAULT_OUTLINE_STROKE_WIDTH = '1'
const DEFAULT_PACK_BASENAME = 'tabler-icons'

export const TABLER_SHELLS = {
  outline: {
    prefix:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
    suffix: '</svg>',
  },
  filled: {
    prefix:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">',
    suffix: '</svg>',
  },
}

function formatPackStrokeWidth(value = DEFAULT_OUTLINE_STROKE_WIDTH) {
  const width = Number(value)
  if (!Number.isFinite(width) || width <= 0 || width > 8) {
    fail(`Tabler outline stroke width must be between 0 and 8, got: ${value}`)
  }
  return Number(width.toFixed(2)).toString()
}

function tablerShellsForPack({ outlineStrokeWidth = DEFAULT_OUTLINE_STROKE_WIDTH } = {}) {
  const strokeWidth = formatPackStrokeWidth(outlineStrokeWidth)
  return {
    outline: {
      ...TABLER_SHELLS.outline,
      prefix: TABLER_SHELLS.outline.prefix.replace(
        'stroke-width="2"',
        `stroke-width="${strokeWidth}"`,
      ),
    },
    filled: TABLER_SHELLS.filled,
  }
}

const packTextCache = new Map()
const parsedPackCache = new Map()
const packVerificationCache = new Map()
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

function fail(message) {
  throw new Error(message)
}

function splitPackPathsFromPrefix(prefix) {
  return {
    mode: 'split-tsv',
    prefix,
    cacheKey: `${prefix}.catalog.tsv`,
    catalog: `${prefix}.catalog.tsv`,
    outline: `${prefix}.outline.tsv`,
    filled: `${prefix}.filled.tsv`,
    manifest: `${prefix}.pack.manifest.json`,
  }
}

export function resolveTablerPackPaths(packPath = DEFAULT_PACK_PATH, { forWrite = false } = {}) {
  const path = resolve(packPath)

  if (path.endsWith('.br')) {
    if (forWrite) {
      fail('Plain-text split TSV packs are required; do not generate compressed .br outputs')
    }
    return {
      mode: 'brotli',
      cacheKey: path,
      pack: path,
      manifest: `${path.slice(0, -'.br'.length)}.manifest.json`,
    }
  }

  if (path.endsWith('.catalog.tsv')) {
    return splitPackPathsFromPrefix(path.slice(0, -'.catalog.tsv'.length))
  }

  if (path.endsWith('.pack.manifest.json')) {
    return splitPackPathsFromPrefix(path.slice(0, -'.pack.manifest.json'.length))
  }

  if (path.endsWith('.tsv')) {
    if (forWrite) {
      fail('Split icon pack output must be a directory, *.catalog.tsv, or *.pack.manifest.json')
    }
    return {
      mode: 'single-tsv',
      cacheKey: path,
      pack: path,
      manifest: `${path.slice(0, -'.tsv'.length)}.manifest.json`,
    }
  }

  if (existsSync(path) && statSync(path).isFile()) {
    if (forWrite) {
      fail(`Icon pack output path is an existing file with an unsupported extension: ${path}`)
    }
    return {
      mode: 'single-tsv',
      cacheKey: path,
      pack: path,
      manifest: `${path}.manifest.json`,
    }
  }

  return splitPackPathsFromPrefix(join(path, DEFAULT_PACK_BASENAME))
}

export function tablerPackManifestPath(packPath = DEFAULT_PACK_PATH) {
  return resolveTablerPackPaths(packPath).manifest
}

function normalizeSvg(text) {
  return String(text)
    .replace(/<!--.*?-->\s*/gs, '')
    .trim()
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .replace(/\s+\/>/g, '/>')
    .replace(/\s+>/g, '>')
}

function parseFrontMatter(text) {
  const match = String(text).match(/^<!--\s*([\s\S]*?)\s*-->/)
  const data = {
    tags: [],
    category: '-',
    version: '-',
    unicode: '-',
  }
  if (!match) return data

  for (const line of match[1]
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)) {
    const field = line.match(/^([\w-]+):\s*(.*)$/)
    if (!field) continue
    const [, key, rawValue] = field
    if (key === 'tags') {
      data.tags = [...rawValue.matchAll(/[a-z0-9][a-z0-9-]*/gi)].map((item) =>
        item[0].toLowerCase(),
      )
    } else if (key in data) {
      data[key] = rawValue.replace(/^"|"$/g, '')
    }
  }
  return data
}

function assertCleanField(value, label) {
  const text = String(value)
  if (text.includes('\t') || text.includes('\n') || text.includes('\r')) {
    fail(`Tabler icon pack field ${label} contains a tab or newline`)
  }
  return text
}

// A deliberately restricted SVG grammar, not a general XML sanitizer. Data is
// never evaluated, imported, or executed. Preserve passive geometry only.
function assertPassiveSvgBody(body, label) {
  const geometry = {
    path: ['d'],
    circle: ['cx', 'cy', 'r'],
    ellipse: ['cx', 'cy', 'rx', 'ry'],
    line: ['x1', 'y1', 'x2', 'y2'],
    polygon: ['points'],
    polyline: ['points'],
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  }
  let rest = body
  while (rest.trim()) {
    const tag = rest.match(/^\s*<([a-z]+)((?:\s+[a-z-]+="[^"<>]*")*)\s*\/>/)
    if (!tag || !Object.hasOwn(geometry, tag[1])) fail(`Unsafe SVG geometry in ${label}`)
    const seen = new Set()
    for (const [, name, value] of tag[2].matchAll(/\s+([a-z-]+)="([^"<>]*)"/g)) {
      if (seen.has(name)) fail(`Duplicate SVG attribute in ${label}`)
      seen.add(name)
      const valid = geometry[tag[1]].includes(name)
        ? (name === 'd' ? /^[MmZzLlHhVvCcSsQqTtAa0-9eE.,+\s-]+$/ : /^[0-9eE.,+\s-]+$/).test(value)
        : ['fill', 'stroke'].includes(name)
          ? /^(?:none|currentColor|#[0-9a-fA-F]{3,8})$/.test(value)
          : ['opacity', 'fill-opacity', 'stroke-opacity'].includes(name)
            ? /^(?:0(?:\.\d+)?|\.\d+|1(?:\.0+)?)$/.test(value)
            : ['fill-rule', 'clip-rule'].includes(name) && /^(?:nonzero|evenodd)$/.test(value)
      if (!valid) fail(`Unsafe SVG attribute ${name} in ${label}`)
    }
    rest = rest.slice(tag[0].length)
  }
}

function normalizeStyle(style = 'outline') {
  const value = String(style ?? 'outline').trim()
  if (!STYLES.includes(value)) {
    fail(`Tabler icon style must be outline or filled, got: ${style}`)
  }
  return value
}

export function normalizeTablerIconName(name) {
  const iconName = String(name ?? '').trim()
  if (!ICON_NAME_RE.test(iconName)) {
    fail(`Invalid Tabler icon name: ${name}`)
  }
  return iconName
}

function listSvgFiles(dir) {
  if (!existsSync(dir)) fail(`Tabler icon directory does not exist: ${dir}`)
  return readdirSync(dir)
    .filter((file) => file.endsWith('.svg'))
    .sort((a, b) => a.localeCompare(b))
}

function readJsonIfExists(path, fallback) {
  if (!existsSync(path)) return fallback
  return JSON.parse(readFileSync(path, 'utf8'))
}

function tablerVersion(sourceRoot) {
  return readJsonIfExists(join(sourceRoot, 'package.json'), {}).version ?? 'unknown'
}

function aliasesForIcon(aliases, style, name) {
  return Object.entries(aliases[style] ?? {})
    .filter(([, target]) => target === name)
    .map(([alias]) => alias)
    .sort((a, b) => a.localeCompare(b))
}

function readSourceRows(sourceRoot) {
  const aliases = readJsonIfExists(join(sourceRoot, 'aliases.json'), {})
  const rows = []

  for (const style of STYLES) {
    const iconDir = join(sourceRoot, 'icons', style)
    for (const file of listSvgFiles(iconDir)) {
      const name = file.replace(/\.svg$/, '')
      if (!ICON_NAME_RE.test(name)) fail(`Invalid Tabler icon file name: ${file}`)

      const iconPath = join(iconDir, file)
      const raw = readFileSync(iconPath, 'utf8')
      const svg = normalizeSvg(raw)
      const shell = TABLER_SHELLS[style]

      if (!svg.startsWith(shell.prefix) || !svg.endsWith(shell.suffix)) {
        fail(`Tabler icon ${style}/${name} does not match the fixed ${style} SVG shell`)
      }

      rows.push({
        style,
        name,
        body: svg.slice(shell.prefix.length, svg.length - shell.suffix.length),
        ...parseFrontMatter(raw),
        aliases: aliasesForIcon(aliases, style, name),
      })
    }
  }

  return rows.sort((a, b) => a.style.localeCompare(b.style) || a.name.localeCompare(b.name))
}

function formatShellLines(shells) {
  return STYLES.map((style) =>
    [
      '@shell',
      style,
      assertCleanField(shells[style].prefix, `${style}.prefix`),
      assertCleanField(shells[style].suffix, `${style}.suffix`),
    ].join(FIELD_SEP),
  )
}

function formatCatalogLines(rows) {
  return rows.map((row) =>
    [
      '@icon',
      assertCleanField(row.style, `${row.name}.style`),
      assertCleanField(row.name, `${row.name}.name`),
      assertCleanField(row.category || '-', `${row.name}.category`),
      assertCleanField(row.tags.join(','), `${row.name}.tags`),
      assertCleanField(row.aliases.join(','), `${row.name}.aliases`),
      assertCleanField(row.version || '-', `${row.name}.version`),
      assertCleanField(row.unicode || '-', `${row.name}.unicode`),
    ].join(FIELD_SEP),
  )
}

function formatSvgLines(rows) {
  return rows.map((row) =>
    [
      '@svg',
      assertCleanField(row.style, `${row.name}.style`),
      assertCleanField(row.name, `${row.name}.name`),
      assertCleanField(row.body, `${row.name}.body`),
    ].join(FIELD_SEP),
  )
}

function renderPackText({ rows, version, shells = TABLER_SHELLS }) {
  const header = [
    `# ${PACK_SCHEMA_VERSION}`,
    `# source=tabler-icons`,
    `# version=${assertCleanField(version, 'version')}`,
    ...formatShellLines(shells),
    '@@catalog',
  ].join('\n')

  const catalog = formatCatalogLines(rows).join('\n')
  const icons = formatSvgLines(rows).join('\n')
  return `${header}\n${catalog}\n@@icons\n${icons}\n`
}

function renderSplitPackTexts({ rows, version, shells = TABLER_SHELLS }) {
  const cleanVersion = assertCleanField(version, 'version')
  const catalog = [
    `# ${SPLIT_PACK_SCHEMA_VERSION}`,
    '# source=tabler-icons',
    `# version=${cleanVersion}`,
    '# part=catalog',
    ...formatShellLines(shells),
    '@@catalog',
    ...formatCatalogLines(rows),
  ].join('\n')

  const renderStylePart = (style) => {
    const styleRows = rows.filter((row) => row.style === style)
    return [
      `# ${SPLIT_PACK_SCHEMA_VERSION}`,
      '# source=tabler-icons',
      `# version=${cleanVersion}`,
      `# part=${style}`,
      '@@icons',
      ...formatSvgLines(styleRows),
    ].join('\n')
  }

  return {
    catalog: `${catalog}\n`,
    outline: `${renderStylePart('outline')}\n`,
    filled: `${renderStylePart('filled')}\n`,
  }
}

export function buildTablerIconPackText(sourceRoot = DEFAULT_SOURCE_ROOT, options = {}) {
  if (!sourceRoot)
    fail('Tabler source root is required. Pass --source-root or set TABLER_ICONS_ROOT.')
  const sourceRootPath = resolve(sourceRoot)
  const rows = readSourceRows(sourceRootPath)
  return renderPackText({
    rows,
    version: tablerVersion(sourceRootPath),
    shells: tablerShellsForPack(options),
  })
}

export function buildSplitTablerIconPackTexts(sourceRoot = DEFAULT_SOURCE_ROOT, options = {}) {
  if (!sourceRoot)
    fail('Tabler source root is required. Pass --source-root or set TABLER_ICONS_ROOT.')
  const sourceRootPath = resolve(sourceRoot)
  const rows = readSourceRows(sourceRootPath)
  return renderSplitPackTexts({
    rows,
    version: tablerVersion(sourceRootPath),
    shells: tablerShellsForPack(options),
  })
}

function syncText(path, text, check) {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null
  const changed = current !== text
  if (changed && !check) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }
  return { path, changed, bytes: Buffer.byteLength(text) }
}

function buildCanonicalPackTextFromParsed(pack) {
  const rows = pack.catalog.map((entry) => ({
    ...entry,
    body: pack.bodies.get(`${entry.style}/${entry.name}`),
  }))
  return renderPackText({
    rows,
    version: pack.version,
    shells: pack.shells,
  })
}

function createSplitTablerIconPackManifest(
  parts,
  canonicalText,
  pack,
  { paths, licenseFile, licenseText },
) {
  const sample =
    pack.catalog.find((e) => e.style === 'outline' && e.name === 'presentation') ?? pack.catalog[0]
  const files = Object.fromEntries(
    SPLIT_PARTS.map((part) => [
      part,
      {
        file: basename(paths[part]),
        byteLength: Buffer.byteLength(parts[part], 'utf8'),
        sha256: sha256(parts[part]),
      },
    ]),
  )
  return {
    schemaVersion: PACK_MANIFEST_SCHEMA_VERSION,
    purpose: 'Offline passive SVG icon data in plain-text UTF-8 TSV files; not executable code.',
    source: { repository: 'https://github.com/tabler/tabler-icons', version: pack.version },
    storage: {
      format: 'split-tsv',
      encoding: 'utf-8',
      compression: 'none',
      schemaVersion: SPLIT_PACK_SCHEMA_VERSION,
    },
    files,
    canonical: {
      schemaVersion: PACK_SCHEMA_VERSION,
      byteLength: Buffer.byteLength(canonicalText, 'utf8'),
      sha256: sha256(canonicalText),
      iconCount: pack.catalog.length,
      counts: pack.counts,
    },
    license: { spdx: 'MIT', file: licenseFile, sha256: sha256(licenseText) },
    sample: sample
      ? {
          style: sample.style,
          name: sample.name,
          svg:
            pack.shells[sample.style].prefix +
            pack.bodies.get(`${sample.style}/${sample.name}`) +
            pack.shells[sample.style].suffix,
        }
      : null,
  }
}

export function generateTablerIconPack({
  sourceRoot = DEFAULT_SOURCE_ROOT,
  output = DEFAULT_PACK_PATH,
  licenseOutput = DEFAULT_LICENSE_PATH,
  outlineStrokeWidth = DEFAULT_OUTLINE_STROKE_WIDTH,
  check = false,
} = {}) {
  if (!sourceRoot)
    fail('Tabler source root is required. Pass --source-root or set TABLER_ICONS_ROOT.')
  const sourceRootPath = resolve(sourceRoot)
  const paths = resolveTablerPackPaths(output, { forWrite: true })
  const licenseOutputPath = resolve(licenseOutput)
  const licensePath = join(sourceRootPath, 'LICENSE')

  if (!existsSync(sourceRootPath)) fail(`Tabler source root does not exist: ${sourceRootPath}`)
  if (!existsSync(licensePath)) fail(`Tabler LICENSE does not exist: ${licensePath}`)

  const parts = buildSplitTablerIconPackTexts(sourceRootPath, { outlineStrokeWidth })
  const info = parseSplitTablerIconPackTexts(parts)
  const canonicalText = buildCanonicalPackTextFromParsed(info)
  const licenseText = readFileSync(licensePath, 'utf8')
  const manifest = createSplitTablerIconPackManifest(parts, canonicalText, info, {
    paths,
    licenseFile: basename(licenseOutputPath),
    licenseText,
  })

  const catalogResult = syncText(paths.catalog, parts.catalog, check)
  const outlineResult = syncText(paths.outline, parts.outline, check)
  const filledResult = syncText(paths.filled, parts.filled, check)
  const licenseResult = syncText(licenseOutputPath, licenseText, check)
  const manifestResult = syncText(paths.manifest, JSON.stringify(manifest, null, 2) + '\n', check)
  const allResults = [catalogResult, outlineResult, filledResult, licenseResult, manifestResult]
  const stale = allResults.some((item) => item.changed)

  if (check && stale) {
    const stalePaths = allResults
      .filter((item) => item.changed)
      .map((item) => item.path)
      .join(', ')
    fail(`generated Tabler icon pack is stale: ${stalePaths}`)
  }

  return {
    schemaVersion: 'pptx-nova-tabler-icons-sync/v3',
    checked: check,
    sourceRoot: sourceRootPath,
    format: 'split-tsv',
    output: catalogResult,
    files: {
      catalog: catalogResult,
      outline: outlineResult,
      filled: filledResult,
    },
    license: licenseResult,
    manifest: manifestResult,
    sourceVersion: info.version,
    outlineStrokeWidth: formatPackStrokeWidth(outlineStrokeWidth),
    iconCount: info.catalog.length,
    counts: info.counts,
  }
}

function readBoundedUtf8File(path, label, maxBytes = MAX_DECODED_PACK_BYTES) {
  const stat = statSync(path)
  if (!stat.isFile() || stat.size > maxBytes)
    fail(`${label} exceeds the size limit or is not a file`)
  const bytes = readFileSync(path)
  if (bytes.length > maxBytes) fail(`${label} exceeds the size limit`)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  return { bytes, text }
}

function readLegacyBrotliPack(paths, required) {
  const stat = statSync(paths.pack)
  if (!stat.isFile() || stat.size > MAX_PACK_BYTES)
    fail('Tabler icon pack exceeds the compressed size limit or is not a file')
  const bytes = readFileSync(paths.pack)
  if (bytes.length > MAX_PACK_BYTES) fail('Tabler icon pack exceeds the compressed size limit')
  if (required && !existsSync(paths.manifest))
    fail('Bundled Tabler icon pack integrity manifest is missing')
  let manifest = null
  if (existsSync(paths.manifest)) {
    if (statSync(paths.manifest).size > 128 * 1024) fail('Tabler icon pack manifest is too large')
    manifest = JSON.parse(readFileSync(paths.manifest, 'utf8'))
    if (
      manifest.schemaVersion !== LEGACY_PACK_MANIFEST_SCHEMA_VERSION ||
      manifest.compression?.algorithm !== 'brotli' ||
      manifest.decoded?.encoding !== 'utf-8' ||
      manifest.pack?.byteLength !== bytes.length ||
      manifest.pack?.sha256 !== sha256(bytes)
    )
      fail('Tabler icon pack compressed integrity check failed')
  }
  const decoded = brotliDecompressSync(bytes, { maxOutputLength: MAX_DECODED_PACK_BYTES })
  const text = new TextDecoder('utf-8', { fatal: true }).decode(decoded)
  if (
    manifest &&
    (manifest.decoded?.byteLength !== decoded.length ||
      manifest.decoded?.sha256 !== sha256(decoded))
  )
    fail('Tabler icon pack decoded integrity check failed')
  const pack = parseTablerIconPackText(text)
  if (
    manifest &&
    (manifest.source?.version !== pack.version ||
      manifest.decoded?.schemaVersion !== pack.schemaVersion ||
      manifest.decoded?.iconCount !== pack.catalog.length ||
      STYLES.some((style) => manifest.decoded?.counts?.[style] !== pack.counts[style]))
  )
    fail('Tabler icon pack metadata integrity check failed')
  return {
    text,
    pack,
    verification: {
      status: 'pass',
      storage: 'brotli',
      manifestVerified: Boolean(manifest),
      compressedBytes: bytes.length,
      decodedBytes: decoded.length,
      sha256: sha256(bytes),
      decodedSha256: sha256(decoded),
      canonicalBytes: decoded.length,
      canonicalSha256: sha256(decoded),
    },
  }
}

function readSingleTsvPack(paths) {
  const { bytes, text } = readBoundedUtf8File(paths.pack, 'Tabler icon pack')
  const pack = parseTablerIconPackText(text)
  const digest = sha256(bytes)
  return {
    text,
    pack,
    verification: {
      status: 'pass',
      storage: 'single-tsv',
      manifestVerified: false,
      totalBytes: bytes.length,
      canonicalBytes: bytes.length,
      canonicalSha256: digest,
    },
  }
}

function readSplitTsvPack(paths, required) {
  if (required && !existsSync(paths.manifest))
    fail('Bundled Tabler icon pack integrity manifest is missing')

  let manifest = null
  if (existsSync(paths.manifest)) {
    if (statSync(paths.manifest).size > 128 * 1024) fail('Tabler icon pack manifest is too large')
    manifest = JSON.parse(readFileSync(paths.manifest, 'utf8'))
    if (
      manifest.schemaVersion !== PACK_MANIFEST_SCHEMA_VERSION ||
      manifest.storage?.format !== 'split-tsv' ||
      manifest.storage?.encoding !== 'utf-8' ||
      manifest.storage?.compression !== 'none' ||
      manifest.storage?.schemaVersion !== SPLIT_PACK_SCHEMA_VERSION
    )
      fail('Tabler icon pack manifest format integrity check failed')
  }

  let totalBytes = 0
  const partTexts = {}
  const fileMeta = {}
  for (const part of SPLIT_PARTS) {
    const partPath = paths[part]
    const expectedFile = basename(partPath)
    if (manifest) {
      const entry = manifest.files?.[part]
      if (
        !entry ||
        typeof entry.file !== 'string' ||
        entry.file !== expectedFile ||
        entry.file.includes('/') ||
        entry.file.includes('\\') ||
        entry.file.includes('..')
      )
        fail(`Tabler icon pack manifest file entry integrity check failed for ${part}`)
    }
    const { bytes, text } = readBoundedUtf8File(partPath, `Tabler icon ${part} part`)
    totalBytes += bytes.length
    if (totalBytes > MAX_DECODED_PACK_BYTES) fail('Tabler icon pack exceeds the decoded size limit')
    const digest = sha256(bytes)
    if (
      manifest &&
      (manifest.files[part].byteLength !== bytes.length || manifest.files[part].sha256 !== digest)
    )
      fail(`Tabler icon pack ${part} file integrity check failed`)
    partTexts[part] = text
    fileMeta[part] = { file: expectedFile, byteLength: bytes.length, sha256: digest }
  }

  const pack = parseSplitTablerIconPackTexts(partTexts)
  const canonicalText = buildCanonicalPackTextFromParsed(pack)
  const canonicalBytes = Buffer.byteLength(canonicalText, 'utf8')
  const canonicalSha256 = sha256(canonicalText)

  if (
    manifest &&
    (manifest.source?.version !== pack.version ||
      manifest.canonical?.schemaVersion !== PACK_SCHEMA_VERSION ||
      manifest.canonical?.byteLength !== canonicalBytes ||
      manifest.canonical?.sha256 !== canonicalSha256 ||
      manifest.canonical?.iconCount !== pack.catalog.length ||
      STYLES.some((style) => manifest.canonical?.counts?.[style] !== pack.counts[style]))
  )
    fail('Tabler icon pack metadata integrity check failed')

  if (
    required &&
    (manifest.license?.spdx !== 'MIT' ||
      manifest.license?.file !== 'icon-license' ||
      manifest.license?.sha256 !== sha256(readFileSync(DEFAULT_LICENSE_PATH)))
  )
    fail('Bundled Tabler icon license integrity check failed')

  return {
    text: canonicalText,
    pack,
    verification: {
      status: 'pass',
      storage: 'split-tsv',
      manifestVerified: Boolean(manifest),
      totalBytes,
      files: fileMeta,
      canonicalBytes,
      canonicalSha256,
    },
  }
}

export function readTablerIconPackText(packPath = DEFAULT_PACK_PATH) {
  const paths = resolveTablerPackPaths(packPath)
  const key = paths.cacheKey
  if (!packTextCache.has(key)) {
    const required = key === resolve(DEFAULT_PACK_PATH)
    const loaded =
      paths.mode === 'brotli'
        ? readLegacyBrotliPack(paths, required)
        : paths.mode === 'single-tsv'
          ? readSingleTsvPack(paths)
          : readSplitTsvPack(paths, required)
    packTextCache.set(key, loaded.text)
    parsedPackCache.set(key, loaded.pack)
    packVerificationCache.set(key, loaded.verification)
  }
  return packTextCache.get(key)
}

function splitCsvField(value) {
  if (!value || value === '-') return []
  return value.split(',').filter(Boolean)
}

function parseShellRecord(parts, shells) {
  const [, style, prefix, suffix] = parts
  if (parts.length !== 4 || !STYLES.includes(style) || Object.hasOwn(shells, style))
    fail('Invalid or duplicate Tabler icon shell')
  const stroke = prefix.match(/stroke-width="([0-9.]+)"/)?.[1]
  const expected =
    style === 'outline'
      ? tablerShellsForPack({ outlineStrokeWidth: stroke }).outline
      : TABLER_SHELLS.filled
  if (prefix !== expected.prefix || suffix !== expected.suffix) fail('Unsafe Tabler SVG shell')
  shells[style] = { prefix, suffix }
}

function parseCatalogRecord(parts, catalog, catalogKeys, aliases) {
  const [, style, name, category, tags, rowAliases, rowVersion, unicode] = parts
  if (
    parts.length !== 8 ||
    !STYLES.includes(style) ||
    !ICON_NAME_RE.test(name) ||
    catalogKeys.has(`${style}/${name}`)
  )
    fail('Invalid or duplicate Tabler icon catalog row')
  catalogKeys.add(`${style}/${name}`)
  const entry = {
    style,
    name,
    category,
    tags: splitCsvField(tags),
    aliases: splitCsvField(rowAliases),
    version: rowVersion,
    unicode,
  }
  catalog.push(entry)
  for (const alias of entry.aliases) {
    if (!ICON_NAME_RE.test(alias) || aliases.has(`${style}/${alias}`))
      fail('Invalid or duplicate Tabler icon alias')
    aliases.set(`${style}/${alias}`, entry.name)
  }
}

function parseSvgRecord(parts, catalogKeys, bodies, expectedStyle = null) {
  const [, style, name, body] = parts
  if (
    parts.length !== 4 ||
    (expectedStyle && style !== expectedStyle) ||
    !catalogKeys.has(`${style}/${name}`) ||
    bodies.has(`${style}/${name}`)
  )
    fail('Invalid or duplicate Tabler icon SVG row')
  assertPassiveSvgBody(body, `${style}/${name}`)
  bodies.set(`${style}/${name}`, body)
}

export function parseSplitTablerIconPackTexts({ catalog, outline, filled }) {
  const catalogText = String(catalog ?? '')
  if (!catalogText.startsWith(`# ${SPLIT_PACK_SCHEMA_VERSION}\n# source=tabler-icons\n# version=`))
    fail('Invalid Tabler icon catalog part header')

  const shells = {}
  const catalogEntries = []
  const catalogKeys = new Set()
  const aliases = new Map()
  let section = 'header'
  let version = 'unknown'
  let declaredPart = null

  for (const line of catalogText.split('\n')) {
    if (!line) continue
    if (line === '@@catalog') {
      if (section !== 'header') fail('Invalid Tabler icon catalog section order')
      section = 'catalog'
      continue
    }
    if (line.startsWith('# version=')) {
      version = line.slice('# version='.length)
      continue
    }
    if (line.startsWith('# part=')) {
      declaredPart = line.slice('# part='.length)
      continue
    }
    if (line.startsWith('#')) continue

    const parts = line.split(FIELD_SEP)
    if (section === 'header' && parts[0] === '@shell') {
      parseShellRecord(parts, shells)
      continue
    }
    if (section === 'catalog' && parts[0] === '@icon') {
      parseCatalogRecord(parts, catalogEntries, catalogKeys, aliases)
      continue
    }
    fail('Unknown Tabler icon catalog part record')
  }

  if (
    declaredPart !== 'catalog' ||
    section !== 'catalog' ||
    !catalogEntries.length ||
    STYLES.some((style) => !shells[style])
  )
    fail('Incomplete Tabler icon catalog part')

  const bodies = new Map()
  const styleTexts = { outline: String(outline ?? ''), filled: String(filled ?? '') }
  for (const style of STYLES) {
    const text = styleTexts[style]
    if (!text.startsWith(`# ${SPLIT_PACK_SCHEMA_VERSION}\n# source=tabler-icons\n# version=`))
      fail(`Invalid Tabler icon ${style} part header`)
    let partSection = 'header'
    let partVersion = null
    let partName = null
    for (const line of text.split('\n')) {
      if (!line) continue
      if (line === '@@icons') {
        if (partSection !== 'header') fail(`Invalid Tabler icon ${style} section order`)
        partSection = 'icons'
        continue
      }
      if (line.startsWith('# version=')) {
        partVersion = line.slice('# version='.length)
        continue
      }
      if (line.startsWith('# part=')) {
        partName = line.slice('# part='.length)
        continue
      }
      if (line.startsWith('#')) continue

      const parts = line.split(FIELD_SEP)
      if (partSection === 'icons' && parts[0] === '@svg') {
        parseSvgRecord(parts, catalogKeys, bodies, style)
        continue
      }
      fail(`Unknown Tabler icon ${style} part record`)
    }
    if (partName !== style || partVersion !== version || partSection !== 'icons')
      fail(`Incomplete or mismatched Tabler icon ${style} part`)
  }

  if (bodies.size !== catalogKeys.size) fail('Incomplete Tabler icon pack')

  const counts = Object.fromEntries(
    STYLES.map((style) => [style, catalogEntries.filter((entry) => entry.style === style).length]),
  )

  return {
    schemaVersion: SPLIT_PACK_SCHEMA_VERSION,
    version,
    shells,
    catalog: catalogEntries,
    bodies,
    aliases,
    counts,
  }
}

export function parseTablerIconPackText(text) {
  if (!String(text).startsWith(`# ${PACK_SCHEMA_VERSION}\n# source=tabler-icons\n# version=`))
    fail('Invalid Tabler icon pack header')
  const shells = {}
  const catalog = []
  const bodies = new Map()
  const aliases = new Map()
  let section = 'header'
  let version = 'unknown'
  const catalogKeys = new Set()

  for (const line of String(text).split('\n')) {
    if (!line) continue
    if (line === '@@catalog') {
      if (section !== 'header') fail('Invalid Tabler icon pack section order')
      section = 'catalog'
      continue
    }
    if (line === '@@icons') {
      if (section !== 'catalog') fail('Invalid Tabler icon pack section order')
      section = 'icons'
      continue
    }
    if (line.startsWith('# version=')) {
      version = line.slice('# version='.length)
      continue
    }
    if (line.startsWith('#')) continue

    const parts = line.split(FIELD_SEP)
    if (section === 'header' && parts[0] === '@shell') {
      parseShellRecord(parts, shells)
      continue
    }
    if (section === 'catalog' && parts[0] === '@icon') {
      parseCatalogRecord(parts, catalog, catalogKeys, aliases)
      continue
    }
    if (section === 'icons' && parts[0] === '@svg') {
      parseSvgRecord(parts, catalogKeys, bodies)
      continue
    }
    fail('Unknown Tabler icon pack record')
  }

  if (
    section !== 'icons' ||
    !catalog.length ||
    bodies.size !== catalogKeys.size ||
    STYLES.some((style) => !shells[style])
  )
    fail('Incomplete Tabler icon pack')

  const counts = Object.fromEntries(
    STYLES.map((style) => [style, catalog.filter((entry) => entry.style === style).length]),
  )

  return {
    schemaVersion: PACK_SCHEMA_VERSION,
    version,
    shells,
    catalog,
    bodies,
    aliases,
    counts,
  }
}

export function verifyTablerIconPack(options = {}) {
  const paths = resolveTablerPackPaths(options.packPath ?? DEFAULT_PACK_PATH)
  const info = getTablerIconPackInfo({ packPath: paths.cacheKey })
  return { ...info, ...packVerificationCache.get(paths.cacheKey), passiveSvgValidated: true }
}

export function loadTablerIconPack({ packPath = DEFAULT_PACK_PATH } = {}) {
  const paths = resolveTablerPackPaths(packPath)
  const key = paths.cacheKey
  if (!parsedPackCache.has(key)) readTablerIconPackText(key)
  return parsedPackCache.get(key)
}

export function getTablerIconPackInfo(options = {}) {
  const pack = loadTablerIconPack(options)
  return {
    schemaVersion: pack.schemaVersion,
    version: pack.version,
    iconCount: pack.catalog.length,
    counts: pack.counts,
  }
}

function catalogForStyle(pack, style) {
  const normalizedStyle = normalizeStyle(style)
  return pack.catalog.filter((entry) => entry.style === normalizedStyle)
}

export function listTablerIconNames({ style = 'outline', packPath } = {}) {
  const pack = loadTablerIconPack({ packPath })
  return catalogForStyle(pack, style)
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

export function loadTablerIcons({ style = 'outline', packPath } = {}) {
  const iconMap = {}
  for (const name of listTablerIconNames({ style, packPath })) {
    iconMap[name] = getTablerIconSvg(name, { style, color: null, packPath })
  }
  return iconMap
}

function findCatalogEntry(pack, name, style) {
  return pack.catalog.find((entry) => entry.style === style && entry.name === name) ?? null
}

export function resolveTablerIconEntry(nameOrAlias, { style = 'outline', packPath } = {}) {
  const iconName = normalizeTablerIconName(nameOrAlias)
  const iconStyle = normalizeStyle(style)
  const pack = loadTablerIconPack({ packPath })
  const direct = findCatalogEntry(pack, iconName, iconStyle)
  if (direct) return { ...direct, matched: 'name', input: iconName }

  const aliasTarget = pack.aliases.get(`${iconStyle}/${iconName}`)
  if (aliasTarget) {
    const entry = findCatalogEntry(pack, aliasTarget, iconStyle)
    if (entry) return { ...entry, matched: 'alias', input: iconName }
  }

  fail(`Tabler icon not found in ${iconStyle} pack: ${iconName}`)
}

export function resolveTablerIconName(nameOrAlias, options = {}) {
  return resolveTablerIconEntry(nameOrAlias, options).name
}

export function hasTablerIcon(name, options = {}) {
  try {
    resolveTablerIconEntry(name, options)
    return true
  } catch {
    return false
  }
}

function normalizeSvgColor(value) {
  const color = String(value ?? '').trim()
  if (/^#[0-9A-F]{6}$/i.test(color)) return color.toUpperCase()
  if (/^[0-9A-F]{6}$/i.test(color)) return `#${color.toUpperCase()}`
  fail(`Tabler icon color must be a 6-digit hex value, got: ${value}`)
}

function formatStrokeWidth(value) {
  const width = Number(value)
  if (!Number.isFinite(width) || width <= 0 || width > 8) {
    fail(`Tabler icon strokeWidth must be between 0 and 8, got: ${value}`)
  }
  return Number(width.toFixed(2)).toString()
}

export function getTablerIconSvg(name, options = {}) {
  const entry = resolveTablerIconEntry(name, options)
  const pack = loadTablerIconPack({ packPath: options.packPath })
  const shell = pack.shells[entry.style]
  const body = pack.bodies.get(`${entry.style}/${entry.name}`)
  if (!shell || body === undefined)
    fail(`Tabler icon body is missing: ${entry.style}/${entry.name}`)

  const color = options.color === null ? null : normalizeSvgColor(options.color ?? '111827')
  const strokeWidth =
    options.strokeWidth === undefined ? null : formatStrokeWidth(options.strokeWidth)

  let result = `${shell.prefix}${body}${shell.suffix}`
  if (color) result = result.replaceAll('currentColor', color)
  if (strokeWidth) result = result.replace(/stroke-width="[^"]+"/, `stroke-width="${strokeWidth}"`)
  return result
}

export function getTablerIconAsset(name, options = {}) {
  const svg = getTablerIconSvg(name, options)
  return {
    bytesBase64: Buffer.from(svg, 'utf8').toString('base64'),
    mimeType: 'image/svg+xml',
  }
}

function tokenize(value) {
  return String(value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function scoreIcon(entry, query, tokens) {
  const name = entry.name.toLowerCase()
  const aliases = entry.aliases.map((item) => item.toLowerCase())
  const tags = entry.tags.map((item) => item.toLowerCase())
  const category = String(entry.category ?? '').toLowerCase()
  let score = 0

  if (name === query) score += 1000
  if (aliases.includes(query)) score += 950
  if (name.startsWith(query)) score += 500
  if (name.includes(query)) score += 350

  for (const token of tokens) {
    if (name.split('-').includes(token)) score += 120
    else if (name.includes(token)) score += 80
    if (aliases.some((alias) => alias.includes(token))) score += 70
    if (tags.includes(token)) score += 60
    else if (tags.some((tag) => tag.includes(token))) score += 30
    if (category.includes(token)) score += 20
  }

  return score
}

export function searchTablerIcons(
  query,
  { style = 'outline', limit = DEFAULT_LIMIT, packPath } = {},
) {
  const normalizedQuery = String(query ?? '')
    .trim()
    .toLowerCase()
  if (!normalizedQuery) return []

  const pack = loadTablerIconPack({ packPath })
  const styles = style === 'any' ? STYLES : [normalizeStyle(style)]
  const tokens = tokenize(normalizedQuery)
  const results = []

  for (const entry of pack.catalog) {
    if (!styles.includes(entry.style)) continue
    const score = scoreIcon(entry, normalizedQuery, tokens)
    if (score <= 0) continue
    results.push({ ...entry, score })
  }

  return results
    .sort(
      (a, b) =>
        b.score - a.score ||
        STYLES.indexOf(a.style) - STYLES.indexOf(b.style) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, Number(limit) || DEFAULT_LIMIT)
}

export function loadTablerIconSet(names, options = {}) {
  if (!Array.isArray(names)) fail('loadTablerIconSet requires an array of icon names')
  return Object.fromEntries(
    names.map((name) => {
      const entry = resolveTablerIconEntry(name, options)
      return [entry.name, getTablerIconSvg(entry.name, { ...options, style: entry.style })]
    }),
  )
}

function parseCliArgs(argv) {
  const flags = {}
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }

    const key = arg.slice(2)
    if (['check', 'json', 'svg'].includes(key)) {
      flags[key] = true
      continue
    }
    const value = argv[index + 1]
    if (value === undefined) fail(`Missing value for --${key}`)
    flags[key] = value
    index += 1
  }
  return { flags, positional }
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function usage() {
  return `Usage:
  node <skill-root>/scripts/cli/assets/icons.mjs generate [--source-root <dir>] [--output <catalog.tsv|dir>] [--license-output <path>] [--stroke <width>] [--check]
  node <skill-root>/scripts/cli/assets/icons.mjs info [--pack <catalog.tsv|dir|pack.br>] [--json]
  node <skill-root>/scripts/cli/assets/icons.mjs verify [--pack <catalog.tsv|dir|pack.br>] [--json]
  node <skill-root>/scripts/cli/assets/icons.mjs unpack --output <new-file.tsv> [--pack <catalog.tsv|dir|pack.br>]
  node <skill-root>/scripts/cli/assets/icons.mjs search <query> [--style outline|filled|any] [--limit <n>] [--pack <catalog.tsv|dir|pack.br>] [--json]
  node <skill-root>/scripts/cli/assets/icons.mjs names [--style outline|filled] [--pack <catalog.tsv|dir|pack.br>] [--json]
  node <skill-root>/scripts/cli/assets/icons.mjs get <name...> [--style outline|filled] [--pack <catalog.tsv|dir|pack.br>] [--svg|--json]
`
}

function commandGenerate(flags) {
  const result = generateTablerIconPack({
    sourceRoot: flags['source-root'] ?? DEFAULT_SOURCE_ROOT,
    output: flags.output ?? DEFAULT_PACK_PATH,
    licenseOutput: flags['license-output'] ?? DEFAULT_LICENSE_PATH,
    outlineStrokeWidth: flags.stroke ?? DEFAULT_OUTLINE_STROKE_WIDTH,
    check: Boolean(flags.check),
  })
  printJson(result)
}

function commandInfo(flags) {
  const info = getTablerIconPackInfo({ packPath: flags.pack ?? DEFAULT_PACK_PATH })
  if (flags.json) printJson(info)
  else
    process.stdout.write(
      `${info.iconCount} icons (${info.counts.outline} outline, ${info.counts.filled} filled)\n`,
    )
}

function commandSearch(flags, positional) {
  const query = positional.join(' ')
  const results = searchTablerIcons(query, {
    style: flags.style ?? 'outline',
    limit: flags.limit ? Number(flags.limit) : DEFAULT_LIMIT,
    packPath: flags.pack ?? DEFAULT_PACK_PATH,
  })
  if (flags.json) {
    printJson(results)
    return
  }
  for (const item of results) {
    process.stdout.write(`${item.style}\t${item.name}\t${item.category}\t${item.tags.join(',')}\n`)
  }
}

function commandNames(flags) {
  const names = listTablerIconNames({
    style: flags.style ?? 'outline',
    packPath: flags.pack ?? DEFAULT_PACK_PATH,
  })
  if (flags.json) printJson(names)
  else process.stdout.write(`${names.join('\n')}\n`)
}

function commandGet(flags, positional) {
  if (positional.length === 0) fail('get requires at least one icon name')
  const rows = positional.map((name) => {
    const entry = resolveTablerIconEntry(name, {
      style: flags.style ?? 'outline',
      packPath: flags.pack ?? DEFAULT_PACK_PATH,
    })
    return {
      input: name,
      style: entry.style,
      name: entry.name,
      matched: entry.matched,
      svg: getTablerIconSvg(entry.name, {
        style: entry.style,
        color: null,
        packPath: flags.pack ?? DEFAULT_PACK_PATH,
      }),
    }
  })

  if (flags.json) {
    printJson(rows)
    return
  }
  if (flags.svg) {
    process.stdout.write(rows.map((row) => row.svg).join('\n'))
    process.stdout.write('\n')
    return
  }
  for (const row of rows) process.stdout.write(`${row.style}\t${row.name}\n`)
}

export function runCli(argv = []) {
  const [command, ...rest] = argv
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(usage())
    return
  }

  const { flags, positional } = parseCliArgs(rest)
  switch (command) {
    case 'generate':
      commandGenerate(flags)
      break
    case 'info':
      commandInfo(flags)
      break
    case 'verify':
      printJson(verifyTablerIconPack({ packPath: flags.pack ?? DEFAULT_PACK_PATH }))
      break
    case 'unpack': {
      if (!flags.output) fail('unpack requires --output pointing to a new review file')
      const text = readTablerIconPackText(flags.pack ?? DEFAULT_PACK_PATH)
      const output = resolve(flags.output)
      mkdirSync(dirname(output), { recursive: true })
      writeFileSync(output, text, { flag: 'wx' })
      printJson({
        status: 'pass',
        output,
        byteLength: Buffer.byteLength(text),
        sha256: sha256(text),
      })
      break
    }
    case 'search':
      commandSearch(flags, positional)
      break
    case 'names':
      commandNames(flags)
      break
    case 'get':
      commandGet(flags, positional)
      break
    default:
      fail(`Unknown command: ${command}\n${usage()}`)
  }
}
