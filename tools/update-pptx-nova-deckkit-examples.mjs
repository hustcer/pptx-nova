#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(__filename), '..')
const SKILL_ROOT = join(REPO_ROOT, 'pptx-nova')
const VISUAL_INDEX = join(SKILL_ROOT, 'benchmarks/visual/index.json')
const DECKKIT_CATALOG = join(SKILL_ROOT, 'assets/deckkits/catalog.json')
const EXAMPLES_ROOT = join(SKILL_ROOT, 'assets/examples/deckkits')
const DEFAULT_TMP = join(REPO_ROOT, '.tmp/pptx-nova-deckkit-examples')
const DEFAULT_WEBP_QUALITY = 82

const usage = `Usage:
  node tools/update-pptx-nova-deckkit-examples.mjs [options]

Options:
  --write                   Update pptx-nova/assets/examples/deckkits from golden DeckKit cases
  --check                   Regenerate and fail if committed examples differ
  --deckkit, -d <id>        Update/check one DeckKit id
  --tmp <dir>               Temporary output root. Defaults to .tmp/pptx-nova-deckkit-examples
  --webp-quality <n>        WebP quality for contact-sheet.webp. Defaults to 82
  --xdoc-bin <path>         xdoc binary path passed to benchmark CLI. Defaults to xdoc
  --cwebp-bin <path>        cwebp binary path. Defaults to cwebp when available
  --no-clean                Do not remove the temporary output root before running
  --json                    Print machine-readable result
  --help                    Show this help
`

export function parseArgs(argv) {
  const args = {
    mode: 'dry-run',
    deckkit: '',
    tmp: DEFAULT_TMP,
    webpQuality: DEFAULT_WEBP_QUALITY,
    xdocBin: '',
    cwebpBin: 'cwebp',
    clean: true,
    json: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    } else if (arg === '--write') {
      args.mode = 'write'
    } else if (arg === '--check') {
      args.mode = 'check'
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--no-clean') {
      args.clean = false
    } else if (arg === '--deckkit' || arg === '-d') {
      args.deckkit = valueAfter(argv, i, arg)
      i += 1
    } else if (arg === '--tmp') {
      args.tmp = resolve(valueAfter(argv, i, arg))
      i += 1
    } else if (arg === '--webp-quality') {
      args.webpQuality = Number.parseInt(valueAfter(argv, i, arg), 10)
      i += 1
    } else if (arg === '--xdoc-bin') {
      args.xdocBin = valueAfter(argv, i, arg)
      i += 1
    } else if (arg === '--cwebp-bin') {
      args.cwebpBin = valueAfter(argv, i, arg)
      i += 1
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    }
  }

  if (!['write', 'check', 'dry-run'].includes(args.mode)) {
    throw new Error(`Invalid mode: ${args.mode}`)
  }
  if (!Number.isInteger(args.webpQuality) || args.webpQuality < 1 || args.webpQuality > 100) {
    throw new Error('--webp-quality must be an integer between 1 and 100')
  }
  return args
}

export function mergeManifestEntries({ existingEntries = [], generatedEntries, deckkit }) {
  if (!deckkit) return generatedEntries

  const generatedByDeckkit = new Map(generatedEntries.map((entry) => [entry.deckkit, entry]))
  const merged = existingEntries.map((entry) => generatedByDeckkit.get(entry.deckkit) ?? entry)
  const existingDeckkits = new Set(existingEntries.map((entry) => entry.deckkit))
  for (const entry of generatedEntries) {
    if (!existingDeckkits.has(entry.deckkit)) merged.push(entry)
  }
  return merged
}

export function syncManifestEntriesWithCatalog({ entries, catalogEntries }) {
  const lookup =
    catalogEntries instanceof Map
      ? catalogEntries
      : new Map((catalogEntries ?? []).map((entry) => [entry.id, entry]))
  const order = new Map([...lookup.keys()].map((id, index) => [id, index]))

  return entries
    .map((entry) => {
      const catalogEntry = lookup.get(entry.deckkit)
      if (!catalogEntry) return entry
      return {
        ...entry,
        readiness: catalogEntry.readiness ?? entry.readiness ?? null,
        version: catalogEntry.version ?? entry.version ?? null,
        bestFor: catalogEntry.bestFor ?? [],
        defaultFor: catalogEntry.defaultFor ?? [],
      }
    })
    .sort(
      (a, b) =>
        (order.get(a.deckkit) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.deckkit) ?? Number.MAX_SAFE_INTEGER) || a.deckkit.localeCompare(b.deckkit),
    )
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function stableJson(value) {
  const input = `${JSON.stringify(value, null, 2)}\n`
  const result = spawnSync('oxfmt', ['--stdin-filepath=generated.json'], {
    cwd: REPO_ROOT,
    input,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(
      ['oxfmt JSON formatting failed', result.stderr, result.stdout].filter(Boolean).join('\n'),
    )
  }
  return result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function fileInfo(path) {
  const bytes = readFileSync(path)
  return {
    bytes: bytes.length,
    sha256: sha256(bytes),
  }
}

function repoRel(path) {
  return relative(REPO_ROOT, path).split('\\').join('/')
}

function visualPath(path) {
  return resolve(SKILL_ROOT, 'benchmarks/visual', path)
}

function runCommand(bin, args, label) {
  const result = spawnSync(bin, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(
      [`${label} failed: ${bin} ${args.join(' ')}`, result.stderr, result.stdout]
        .filter(Boolean)
        .join('\n'),
    )
  }
  return result
}

function commandExists(bin) {
  const result = spawnSync(bin, ['-version'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'ignore',
  })
  return result.status === 0
}

function convertContactSheetToWebp({ pngPath, webpPath, args }) {
  rmSync(webpPath, { force: true })
  if (commandExists(args.cwebpBin)) {
    runCommand(
      args.cwebpBin,
      ['-quiet', '-q', String(args.webpQuality), '-m', '6', pngPath, '-o', webpPath],
      'cwebp contact sheet',
    )
    return {
      tool: basename(args.cwebpBin),
      command: `${basename(args.cwebpBin)} -quiet -q ${args.webpQuality} -m 6 <png> -o <webp>`,
    }
  }

  if (commandExists('magick')) {
    runCommand(
      'magick',
      [pngPath, '-strip', '-quality', String(args.webpQuality), `webp:${webpPath}`],
      'magick contact sheet',
    )
    return {
      tool: 'magick',
      command: `magick <png> -strip -quality ${args.webpQuality} webp:<webp>`,
    }
  }

  throw new Error(
    'Cannot create contact-sheet.webp: install cwebp (preferred) or ImageMagick `magick`.',
  )
}

export function selectGoldenCases(index, deckkit) {
  const scoped = deckkit ? index.cases.filter((c) => c.deckkit === deckkit) : index.cases
  const groups = new Map()
  for (const item of scoped) {
    if (item.showcase !== undefined && typeof item.showcase !== 'boolean')
      throw new Error('showcase must be boolean: ' + item.id)
    if (item.showcase && item.kind !== 'golden')
      throw new Error('Showcase must select a golden case: ' + item.id)
    if (item.kind !== 'golden') continue
    if (!groups.has(item.deckkit)) groups.set(item.deckkit, [])
    groups.get(item.deckkit).push(item)
  }
  if (!groups.size)
    throw new Error(
      deckkit ? 'No golden case found for DeckKit "' + deckkit + '"' : 'No golden cases found',
    )
  return [...groups.entries()].map(([id, cases]) => {
    const marked = cases.filter((c) => c.showcase)
    if (marked.length > 1 || (cases.length > 1 && marked.length !== 1))
      throw new Error(
        'Multiple golden cases require exactly one showcase:true for DeckKit "' + id + '"',
      )
    return marked[0] ?? cases[0]
  })
}

function readCatalogEntries() {
  const catalog = readJson(DECKKIT_CATALOG)
  return new Map((catalog.entries ?? []).map((entry) => [entry.id, entry]))
}

function titleFromContent(content) {
  const firstSlide = Array.isArray(content.slides) ? content.slides[0] : null
  const title = firstSlide?.data?.title ?? firstSlide?.title ?? ''
  return String(title).replace(/\s+/g, ' ').trim()
}

function buildBrief({ benchCase, catalogEntry, content, summary }) {
  const title = titleFromContent(content)
  const bestFor = (catalogEntry?.bestFor ?? []).join(', ')
  const defaultFor = (catalogEntry?.defaultFor ?? []).join(', ')
  return [
    `# ${benchCase.deckkit}`,
    '',
    `DeckKit: \`${benchCase.deckkit}\``,
    `Showcase case: \`${benchCase.id}\``,
    `Readiness: \`${catalogEntry?.readiness ?? 'unknown'}\``,
    `Slides: ${summary.vision.slideCount}`,
    `Patch ops: ${summary.patch.ops}`,
    ...(title ? [`Title: ${title}`] : []),
    '',
    '## Best For',
    '',
    bestFor ? bestFor : 'See the DeckKit catalog for recommended scenarios.',
    '',
    '## Default For',
    '',
    defaultFor ? defaultFor : 'No default scenarios are declared in the DeckKit catalog.',
    '',
    '## Files',
    '',
    '- `deck.pptx`: native editable PPTX showcase output',
    '- `contact-sheet.webp`: compact full-deck visual preview',
    '- `content.json`: DeckKit content manifest used to generate the deck',
    '- `summary.json`: stable machine-readable generation and validation summary',
    '',
    'Regenerate with `just deckkit-examples`. Check reproducibility with `just deckkit-examples check`.',
  ].join('\n')
}

function summarizeExample({
  benchCase,
  benchmarkSummary,
  contentPath,
  buildPath,
  expectedPath,
  webp,
  content,
}) {
  return {
    schemaVersion: 'pptx-nova-example-summary/v1',
    deckkit: benchCase.deckkit,
    caseId: benchCase.id,
    kind: benchCase.kind,
    title: titleFromContent(content),
    source: {
      content: repoRel(contentPath),
      build: repoRel(buildPath),
      expected: repoRel(expectedPath),
      benchmarkIndex: repoRel(VISUAL_INDEX),
    },
    validation: {
      valid: benchmarkSummary.validation.valid,
      errors: benchmarkSummary.validation.errors.length,
      warnings: benchmarkSummary.validation.warnings.length,
      fitDiagnostics: benchmarkSummary.validation.fitDiagnostics.length,
      blockingFitDiagnostics: benchmarkSummary.validation.fitDiagnostics.filter(
        (item) => item.blocking === true || item.severity === 'error',
      ).length,
    },
    patch: benchmarkSummary.patch,
    dryRun: {
      status: benchmarkSummary.dryRun.status,
      warnings: benchmarkSummary.dryRun.warnings,
      changedParts: benchmarkSummary.dryRun.changedParts,
      opResults: benchmarkSummary.dryRun.opResults,
      visualRisks: benchmarkSummary.dryRun.visualRisks,
    },
    apply: {
      status: benchmarkSummary.apply.status,
      warnings: benchmarkSummary.apply.warnings,
      changedParts: benchmarkSummary.apply.changedParts,
      opResults: benchmarkSummary.apply.opResults,
      visualRisks: benchmarkSummary.apply.visualRisks,
    },
    vision: benchmarkSummary.vision,
    contactSheet: {
      format: 'webp',
      quality: webp.quality,
      encoder: webp.encoder,
      sourcePng: webp.sourcePng,
      webp: webp.webp,
    },
  }
}

function exampleManifestEntry({ benchCase, catalogEntry, summary, files }) {
  return {
    id: benchCase.deckkit,
    deckkit: benchCase.deckkit,
    caseId: benchCase.id,
    kind: benchCase.kind,
    readiness: catalogEntry?.readiness ?? null,
    version: catalogEntry?.version ?? null,
    title: summary.title,
    bestFor: catalogEntry?.bestFor ?? [],
    defaultFor: catalogEntry?.defaultFor ?? [],
    files,
    validation: summary.validation,
    patch: summary.patch,
    vision: summary.vision,
  }
}

function stageFile({ targetRoot, relativePath, bytes, mode, staged }) {
  const target = join(targetRoot, relativePath)
  const exists = existsSync(target)
  const previous = exists ? readFileSync(target) : null
  const same = exists && Buffer.compare(previous, bytes) === 0
  const record = {
    path: repoRel(target),
    status: same ? 'unchanged' : exists ? 'changed' : 'missing',
    bytes: bytes.length,
    sha256: sha256(bytes),
  }
  staged.push(record)

  if (same) return record
  if (mode === 'check') return record
  if (mode === 'write') {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, bytes)
    record.status = exists ? 'updated' : 'created'
  }
  return record
}

function runBenchmarkCase({ benchCase, args }) {
  const benchmarkScript = join(SKILL_ROOT, 'scripts/cli/deckkits/benchmark.mjs')
  const commandArgs = [
    benchmarkScript,
    '--case',
    benchCase.id,
    '--out',
    args.tmp,
    '--repeat',
    '1',
    '--clean',
  ]
  if (args.xdocBin) commandArgs.push('--xdoc-bin', args.xdocBin)
  runCommand('node', commandArgs, `DeckKit benchmark ${benchCase.id}`)
}

function caseSlug(benchCase) {
  return benchCase.id.includes('.') ? benchCase.id.split('.').slice(1).join('.') : benchCase.id
}

function makeReadme() {
  return [
    '# pptx-nova DeckKit Examples',
    '',
    'This directory contains committed, user-facing DeckKit showcase assets.',
    'Each subdirectory is named after a DeckKit id and includes a native editable',
    '`deck.pptx`, a compact `contact-sheet.webp`, the source `content.json`,',
    'a short `brief.md`, and a stable `summary.json`.',
    '',
    'Bundled examples are synthetic, generated showcase materials created for this',
    'skill and are intended to be redistributable with the repository.',
    '',
    'Update the showcase decks with:',
    '',
    '```bash',
    'just deckkit-examples',
    '```',
    '',
    'Update one DeckKit showcase by id:',
    '',
    '```bash',
    'just deckkit-examples -d broadside',
    '```',
    '',
    'Check that committed assets are in sync without writing files:',
    '',
    '```bash',
    'just deckkit-examples check',
    '```',
    '',
    'When DeckKit code, content, or xdoc output logic has not changed, repeating',
    '`just deckkit-examples` should not create git-visible changes. A repeated',
    'change in `deck.pptx`, `contact-sheet.webp`, `summary.json`, or',
    '`manifest.json` is treated as a reproducibility bug.',
    '',
  ].join('\n')
}

function updateDeckCatalog({ manifestEntries, mode, staged }) {
  const catalog = readJson(join(SKILL_ROOT, 'assets/decks/catalog.json'))
  const generatedIds = new Set(manifestEntries.map((entry) => `${entry.deckkit}-showcase`))
  const kept = (catalog.entries ?? []).filter((entry) => !generatedIds.has(entry.id))
  const showcaseEntries = manifestEntries.map((entry) => ({
    id: `${entry.deckkit}-showcase`,
    name: `${entry.deckkit} DeckKit Showcase`,
    type: 'deckkit-showcase',
    deckkit: entry.deckkit,
    caseId: entry.caseId,
    path: `../examples/deckkits/${entry.deckkit}/deck.pptx`,
    preview: `../examples/deckkits/${entry.deckkit}/contact-sheet.webp`,
    content: `../examples/deckkits/${entry.deckkit}/content.json`,
    summary: `../examples/deckkits/${entry.deckkit}/summary.json`,
    bestFor: entry.bestFor,
    status:
      entry.readiness === 'production' || entry.readiness === 'default' ? 'available' : 'preview',
  }))
  const next = {
    ...catalog,
    entries: [...kept, ...showcaseEntries.sort((a, b) => a.id.localeCompare(b.id))],
  }
  stageFile({
    targetRoot: REPO_ROOT,
    relativePath: 'pptx-nova/assets/decks/catalog.json',
    bytes: Buffer.from(stableJson(next)),
    mode,
    staged,
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const index = readJson(VISUAL_INDEX)
  const catalogEntries = readCatalogEntries()
  const cases = selectGoldenCases(index, args.deckkit)
  const staged = []
  const generatedManifestEntries = []

  if (args.clean && existsSync(args.tmp)) rmSync(args.tmp, { recursive: true, force: true })
  mkdirSync(args.tmp, { recursive: true })

  for (const benchCase of cases) {
    runBenchmarkCase({ benchCase, args })

    const slug = caseSlug(benchCase)
    const outDir = join(args.tmp, benchCase.deckkit, slug)
    const summaryPath = join(outDir, 'summary.json')
    const deckPath = join(outDir, 'deck.pptx')
    const contactPngPath = join(outDir, 'contact-sheet.png')
    const contactWebpPath = join(outDir, 'contact-sheet.webp')
    const benchmarkSummary = readJson(summaryPath)

    if (benchmarkSummary.gate?.passed !== true) {
      throw new Error(`Benchmark did not pass for ${benchCase.id}`)
    }
    if ((benchmarkSummary.vision.bySeverity.high ?? 0) !== 0) {
      throw new Error(`vision high issues remain for ${benchCase.id}`)
    }
    if ((benchmarkSummary.vision.bySeverity.medium ?? 0) !== 0) {
      throw new Error(`vision medium issues remain for ${benchCase.id}`)
    }
    if (!existsSync(deckPath)) throw new Error(`Benchmark did not write ${deckPath}`)
    if (!existsSync(contactPngPath)) throw new Error(`Benchmark did not write ${contactPngPath}`)

    const contentPath = visualPath(benchCase.contentPath)
    const buildPath = visualPath(benchCase.buildPath)
    const expectedPath = visualPath(benchCase.expectedPath)
    const contentBytes = readFileSync(contentPath)
    const content = JSON.parse(contentBytes.toString('utf8'))
    const webpEncoder = convertContactSheetToWebp({
      pngPath: contactPngPath,
      webpPath: contactWebpPath,
      args,
    })
    const sourcePngInfo = fileInfo(contactPngPath)
    const webpInfo = fileInfo(contactWebpPath)
    const summary = summarizeExample({
      benchCase,
      benchmarkSummary,
      contentPath,
      buildPath,
      expectedPath,
      content,
      webp: {
        quality: args.webpQuality,
        encoder: webpEncoder,
        sourcePng: sourcePngInfo,
        webp: webpInfo,
      },
    })
    const catalogEntry = catalogEntries.get(benchCase.deckkit)
    const brief = buildBrief({ benchCase, catalogEntry, content, summary })

    const dir = benchCase.deckkit
    const deckRecord = stageFile({
      targetRoot: EXAMPLES_ROOT,
      relativePath: `${dir}/deck.pptx`,
      bytes: readFileSync(deckPath),
      mode: args.mode,
      staged,
    })
    const contactRecord = stageFile({
      targetRoot: EXAMPLES_ROOT,
      relativePath: `${dir}/contact-sheet.webp`,
      bytes: readFileSync(contactWebpPath),
      mode: args.mode,
      staged,
    })
    const contentRecord = stageFile({
      targetRoot: EXAMPLES_ROOT,
      relativePath: `${dir}/content.json`,
      bytes: contentBytes,
      mode: args.mode,
      staged,
    })
    const briefRecord = stageFile({
      targetRoot: EXAMPLES_ROOT,
      relativePath: `${dir}/brief.md`,
      bytes: Buffer.from(`${brief}\n`),
      mode: args.mode,
      staged,
    })
    const summaryRecord = stageFile({
      targetRoot: EXAMPLES_ROOT,
      relativePath: `${dir}/summary.json`,
      bytes: Buffer.from(stableJson(summary)),
      mode: args.mode,
      staged,
    })

    generatedManifestEntries.push(
      exampleManifestEntry({
        benchCase,
        catalogEntry,
        summary,
        files: {
          deck: {
            path: `${dir}/deck.pptx`,
            bytes: deckRecord.bytes,
            sha256: deckRecord.sha256,
          },
          contactSheet: {
            path: `${dir}/contact-sheet.webp`,
            bytes: contactRecord.bytes,
            sha256: contactRecord.sha256,
            quality: args.webpQuality,
          },
          content: {
            path: `${dir}/content.json`,
            bytes: contentRecord.bytes,
            sha256: contentRecord.sha256,
          },
          brief: {
            path: `${dir}/brief.md`,
            bytes: briefRecord.bytes,
            sha256: briefRecord.sha256,
          },
          summary: {
            path: `${dir}/summary.json`,
            bytes: summaryRecord.bytes,
            sha256: summaryRecord.sha256,
          },
        },
      }),
    )
  }

  const existingManifest = existsSync(join(EXAMPLES_ROOT, 'manifest.json'))
    ? readJson(join(EXAMPLES_ROOT, 'manifest.json'))
    : null
  const manifestEntries = syncManifestEntriesWithCatalog({
    entries: mergeManifestEntries({
      existingEntries: existingManifest?.examples ?? [],
      generatedEntries: generatedManifestEntries,
      deckkit: args.deckkit,
    }),
    catalogEntries,
  })

  const manifest = {
    schemaVersion: 'pptx-nova-deckkit-examples/v1',
    description: 'Committed user-facing DeckKit showcase decks for pptx-nova.',
    updateCommand: 'just deckkit-examples',
    checkCommand: 'just deckkit-examples check',
    source: {
      visualIndex: repoRel(VISUAL_INDEX),
      deckkitCatalog: repoRel(DECKKIT_CATALOG),
    },
    contactSheet: {
      format: 'webp',
      quality: args.webpQuality,
      source: 'xdoc contact-sheet.png converted with cwebp or ImageMagick',
    },
    examples: manifestEntries,
  }

  stageFile({
    targetRoot: EXAMPLES_ROOT,
    relativePath: 'README.md',
    bytes: Buffer.from(makeReadme()),
    mode: args.mode,
    staged,
  })
  stageFile({
    targetRoot: EXAMPLES_ROOT,
    relativePath: 'manifest.json',
    bytes: Buffer.from(stableJson(manifest)),
    mode: args.mode,
    staged,
  })
  updateDeckCatalog({ manifestEntries, mode: args.mode, staged })

  const dirty = staged.filter((file) => file.status !== 'unchanged')
  const result = {
    mode: args.mode,
    tmp: repoRel(args.tmp),
    examples: manifestEntries.length,
    generatedExamples: generatedManifestEntries.length,
    files: staged,
    changed: dirty.length,
  }

  if (args.json) {
    process.stdout.write(stableJson(result))
  } else {
    for (const file of staged) {
      const prefix = file.status === 'unchanged' ? 'ok' : file.status
      process.stdout.write(`${prefix} ${file.path}\n`)
    }
  }

  if (args.mode === 'check' && dirty.length > 0) {
    throw new Error(
      `DeckKit examples are out of sync. Run \`just deckkit-examples\` to update ${dirty.length} file(s).`,
    )
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exit(1)
  })
}
