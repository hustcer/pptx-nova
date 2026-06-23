#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { genericFallbackFor, isPlainObject } from './pptx-nova-refurbish-style.mjs'

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOG_PATH = join(SKILL_ROOT, 'assets/deckkits/catalog.json')
const DELIVERY_READINESS = new Set(['production', 'default'])
const COMMON_STYLE_OPS = [
  'set-theme-color',
  'set-theme-font',
  'set-slide-background',
  'set-text-style',
  'set-shape-fill',
  'set-shape-line',
]
const MANUAL_GATES = [
  'fallback-patch-report',
  'dry-run',
  'vision-diff',
  'refurbish-audit',
  'fidelity-gate',
  'png-contact-review',
]
const NATIVE_GATES = [
  'refurbish-skin-report',
  'dry-run',
  'vision-diff',
  'refurbish-audit',
  'fidelity-gate',
  'png-contact-review',
]

const PROFILE_OVERRIDES = {
  'consulting-dark': {
    palette: {
      background: '0E2638',
      text: 'F5F2EA',
      accent: 'C8583A',
      softAccent: '15334A',
      secondary: 'AEC0CE',
      surface: '13233A',
      rule: '20435E',
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter',
      label: 'Inter',
      cjk: 'PingFang SC',
    },
  },
  'mckinsey-blue': {
    palette: {
      background: 'FFFFFF',
      text: '0F172A',
      accent: '005587',
      softAccent: 'EFF6FF',
      secondary: '475569',
      surface: 'F8FAFC',
      rule: 'CBD5E1',
    },
    fonts: {
      heading: 'Arial',
      body: 'Arial',
      label: 'Arial',
      cjk: 'Arial',
    },
    chromePolicy: 'replace-or-restyle-existing',
  },
  broadside: {
    palette: {
      background: '111111',
      text: 'F0ECE5',
      accent: 'E85D26',
      softAccent: '331D14',
      secondary: 'B8B8AE',
      surface: '1A1A18',
      rule: '282826',
    },
    fonts: {
      heading: 'Barlow',
      body: 'Barlow',
      label: 'IBM Plex Mono',
      cjk: 'Noto Sans SC',
    },
  },
  coral: {
    palette: {
      background: 'F5F0E8',
      text: '1A1A1A',
      accent: 'E85D5D',
      softAccent: 'E8E0D4',
      secondary: '6B6B6B',
      surface: 'FFFFFF',
      rule: '1A1A1A',
    },
    fonts: {
      heading: 'Bebas Neue',
      body: 'Inter',
      label: 'Inter',
      cjk: 'Noto Sans SC',
    },
  },
  'long-table': {
    palette: {
      background: 'FAF1E2',
      text: 'B53D2A',
      accent: '8E2D1F',
      softAccent: 'F2E5CF',
      secondary: 'DEC0A5',
      surface: 'FAF1E2',
      rule: 'DEC0A5',
    },
    fonts: {
      heading: 'Bricolage Grotesque',
      body: 'Fraunces',
      label: 'Fraunces',
      cjk: 'Microsoft YaHei',
    },
  },
  'biennale-yellow': {
    palette: {
      background: 'E9E5DB',
      text: '1B2566',
      accent: 'F1EE2E',
      softAccent: 'F8F39B',
      secondary: 'E26B4A',
      surface: 'DCD6C4',
      rule: '1B2566',
    },
    fonts: {
      heading: 'Times New Roman',
      body: 'Arial',
      label: 'Courier New',
      cjk: 'Microsoft YaHei',
    },
  },
}

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-deckkit-refurbish-profile-fill.mjs [options]

Options:
  --catalog <path>     DeckKit catalog path. Defaults to <skill-root>/assets/deckkits/catalog.json
  --deckkit <id>       Limit to one DeckKit. May be repeated or comma-separated.
  --write              Persist generated refurbishProfile entries. Defaults to dry run.
  --overwrite          Replace existing refurbishProfile entries for selected DeckKits.
  --check              Fail when selected production/default DeckKits lack refurbishProfile.
  --json               Print machine-readable output.
  --help               Show this help

Examples:
  node <skill-root>/scripts/pptx-nova-deckkit-refurbish-profile-fill.mjs --json
  node <skill-root>/scripts/pptx-nova-deckkit-refurbish-profile-fill.mjs --write --json
  node <skill-root>/scripts/pptx-nova-deckkit-refurbish-profile-fill.mjs --deckkit coral --write --json
`

function parseArgs(argv) {
  const args = {
    catalog: CATALOG_PATH,
    deckkits: [],
    write: false,
    overwrite: false,
    check: false,
    json: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--write') {
      args.write = true
    } else if (arg === '--overwrite') {
      args.overwrite = true
    } else if (arg === '--check') {
      args.check = true
    } else if (arg === '--catalog') {
      args.catalog = resolve(valueAfter(argv, i, arg))
      i += 1
    } else if (arg === '--deckkit') {
      pushDeckkits(args, valueAfter(argv, i, arg))
      i += 1
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    }
  }
  if (args.check && args.write) throw new Error('--check cannot be combined with --write')
  return args
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function pushDeckkits(args, value) {
  for (const item of value.split(',')) {
    const id = item.trim()
    if (id) args.deckkits.push(id)
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function nativeSkinningFor(entry) {
  const native = entry?.nativeSkinning
  const supported = Boolean(native?.themePack && native?.stylePack && native?.chromeSource)
  return {
    supported,
    themePack: native?.themePack ?? '',
    stylePack: native?.stylePack ?? '',
    commands: supported ? ['refurbish-skin', 'chrome-apply', 'remap-theme'] : [],
  }
}

function fallbackFor(entry, nativeSkinning) {
  const generic = genericFallbackFor(entry)
  const override = PROFILE_OVERRIDES[entry.id] ?? {}
  const palette = { ...generic.palette, ...(override.palette ?? {}) }
  const fonts = { ...generic.fonts, ...(override.fonts ?? {}) }
  const chromePolicy =
    override.chromePolicy ??
    (nativeSkinning.supported ? 'replace-or-restyle-existing' : 'preserve-and-restyle-existing')
  return {
    schemaVersion: 'pptx-nova-refurbish-fallback/v1',
    source: `${entry.id}-refurbish-profile`,
    strategy: `inspect-driven-${entry.id}-editable-object-restyle`,
    patchScript: 'scripts/pptx-nova-refurbish-fallback-patch.mjs',
    palette,
    fonts,
    styleOps: override.styleOps ?? COMMON_STYLE_OPS,
    chromePolicy,
    contentPolicy: 'preserve-source-slides-and-editable-objects',
  }
}

function profileFor(entry) {
  const nativeSkinning = nativeSkinningFor(entry)
  return {
    schemaVersion: 'pptx-nova-refurbish-profile/v1',
    mode: nativeSkinning.supported ? 'native' : 'manual-fallback',
    nativeSkinning,
    fallback: fallbackFor(entry, nativeSkinning),
    requiredGates: nativeSkinning.supported ? NATIVE_GATES : MANUAL_GATES,
    notes: [
      `Generated by pptx-nova-deckkit-refurbish-profile-fill.mjs for ${entry.id}.`,
      nativeSkinning.supported
        ? 'Use native skinning first; keep the fallback profile for catalog-driven recovery without switching DeckKits.'
        : 'Use the DeckKit-specific fallback profile instead of generic visualGrammar derivation.',
      'Preserve source slides and editable objects; restyle theme colors, fonts, backgrounds, text, shapes, tables, charts, and existing page chrome.',
    ],
  }
}

function withRefurbishProfile(entry, profile) {
  const next = {}
  let inserted = false
  for (const [key, value] of Object.entries(entry)) {
    if (key === 'refurbishProfile') continue
    next[key] = value
    if (key === 'visualGrammar') {
      next.refurbishProfile = profile
      inserted = true
    }
  }
  if (!inserted) next.refurbishProfile = profile
  return next
}

function selectedEntry(entry, selected) {
  return selected.size === 0 || selected.has(entry.id)
}

function buildPlan(catalog, args) {
  const selected = new Set(args.deckkits)
  const unknown = [...selected].filter((id) => !catalog.entries.some((entry) => entry.id === id))
  if (unknown.length) throw new Error(`Unknown DeckKit id(s): ${unknown.join(', ')}`)

  const results = []
  const nextEntries = catalog.entries.map((entry) => {
    if (!selectedEntry(entry, selected)) {
      results.push({ deckkit: entry.id, action: 'skipped-filter' })
      return entry
    }
    if (!DELIVERY_READINESS.has(entry.readiness)) {
      results.push({
        deckkit: entry.id,
        readiness: entry.readiness ?? '',
        action: 'skipped-readiness',
      })
      return entry
    }
    if (isPlainObject(entry.refurbishProfile) && !args.overwrite) {
      results.push({
        deckkit: entry.id,
        readiness: entry.readiness,
        action: 'skipped-existing',
        fallbackSource: entry.refurbishProfile?.fallback?.source ?? null,
      })
      return entry
    }

    const profile = profileFor(entry)
    const action = isPlainObject(entry.refurbishProfile) ? 'updated' : 'generated'
    results.push({
      deckkit: entry.id,
      readiness: entry.readiness,
      action: args.write ? action : `would-${action}`,
      nativeSkinning: profile.nativeSkinning,
      fallbackSource: profile.fallback.source,
      fallbackStrategy: profile.fallback.strategy,
      palette: profile.fallback.palette,
      fonts: profile.fallback.fonts,
      requiredGates: profile.requiredGates,
    })
    return args.write ? withRefurbishProfile(entry, profile) : entry
  })

  return {
    catalog: { ...catalog, entries: nextEntries },
    results,
  }
}

function summarize(results, args) {
  const considered = results.filter((item) => item.action !== 'skipped-filter')
  const missingProfiles = considered.filter(
    (item) =>
      DELIVERY_READINESS.has(item.readiness) &&
      !['skipped-existing', 'generated', 'updated', 'would-generated', 'would-updated'].includes(
        item.action,
      ),
  )
  const generated = considered.filter((item) => ['generated', 'updated'].includes(item.action))
  const planned = considered.filter((item) =>
    ['would-generated', 'would-updated'].includes(item.action),
  )
  const existing = considered.filter((item) => item.action === 'skipped-existing')
  return {
    selected: args.deckkits.length ? args.deckkits : 'all',
    considered: considered.length,
    generated: generated.length,
    planned: planned.length,
    existing: existing.length,
    missingProfiles: missingProfiles.length,
  }
}

try {
  const args = parseArgs(process.argv.slice(2))
  const catalog = readJson(args.catalog)
  if (!Array.isArray(catalog.entries)) throw new Error('catalog.entries must be an array')

  if (args.check) {
    const selected = new Set(args.deckkits)
    const selectedEntries = catalog.entries.filter((entry) => selectedEntry(entry, selected))
    const unknown = [...selected].filter((id) => !catalog.entries.some((entry) => entry.id === id))
    if (unknown.length) throw new Error(`Unknown DeckKit id(s): ${unknown.join(', ')}`)
    const missing = selectedEntries
      .filter((entry) => DELIVERY_READINESS.has(entry.readiness))
      .filter((entry) => !isPlainObject(entry.refurbishProfile))
      .map((entry) => entry.id)
    const result = {
      schemaVersion: 'pptx-nova-deckkit-refurbish-profile-fill/v1',
      status: missing.length ? 'failed' : 'passed',
      written: false,
      catalog: args.catalog,
      missing,
      summary: {
        selected: args.deckkits.length ? args.deckkits : 'all',
        missingProfiles: missing.length,
      },
    }
    if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    else if (missing.length) process.stdout.write(`Missing profiles: ${missing.join(', ')}\n`)
    else process.stdout.write('All selected delivery DeckKits have refurbishProfile.\n')
    process.exit(missing.length ? 1 : 0)
  }

  const { catalog: nextCatalog, results } = buildPlan(catalog, args)
  if (args.write) writeJson(args.catalog, nextCatalog)
  const result = {
    schemaVersion: 'pptx-nova-deckkit-refurbish-profile-fill/v1',
    status: 'success',
    written: args.write,
    overwrite: args.overwrite,
    catalog: args.catalog,
    summary: summarize(results, args),
    results,
  }
  if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else {
    const summary = result.summary
    process.stdout.write(
      `${args.write ? 'Updated' : 'Planned'} refurbish profiles: ${summary.generated + summary.planned}\n`,
    )
  }
} catch (error) {
  process.stderr.write(`[error] ${error.message}\n`)
  process.exit(1)
}
