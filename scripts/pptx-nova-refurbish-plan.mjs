#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOG_PATH = join(SKILL_ROOT, 'assets/deckkits/catalog.json')

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-refurbish-plan.mjs --deckkit <id> [options]

Options:
  --deckkit <id>       Target DeckKit id
  --source <path>      Source PPTX path used in suggested commands
  --output <path>      Candidate PPTX path used in suggested commands
  --catalog <path>     DeckKit catalog path. Defaults to <skill-root>/assets/deckkits/catalog.json
  --explicit           User explicitly named this DeckKit
  --json               Print machine-readable plan
  --help               Show this help
`

function parseArgs(argv) {
  const args = {
    deckkit: '',
    source: 'source.pptx',
    output: 'candidate.pptx',
    catalog: CATALOG_PATH,
    explicit: false,
    json: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--explicit') {
      args.explicit = true
    } else if (arg === '--deckkit') {
      args.deckkit = valueAfter(argv, i, arg)
      i += 1
    } else if (arg === '--source') {
      args.source = valueAfter(argv, i, arg)
      i += 1
    } else if (arg === '--output') {
      args.output = valueAfter(argv, i, arg)
      i += 1
    } else if (arg === '--catalog') {
      args.catalog = resolve(valueAfter(argv, i, arg))
      i += 1
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    }
  }

  if (!args.deckkit) throw new Error(`--deckkit is required.\n\n${usage}`)
  return args
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringArray(value) {
  return (Array.isArray(value) ? value : []).filter(
    (item) => typeof item === 'string' && item.trim(),
  )
}

function hexFrom(value) {
  if (typeof value !== 'string') return ''
  const match = value.match(/#?([0-9A-Fa-f]{6})\b/)
  return match ? match[1].toUpperCase() : ''
}

function firstHex(values, fallback) {
  for (const value of Array.isArray(values) ? values : []) {
    const hex = hexFrom(value)
    if (hex) return hex
  }
  return fallback
}

function shell(value) {
  return JSON.stringify(value)
}

function nativeSkinningFor(entry) {
  const native = entry?.nativeSkinning
  if (!isPlainObject(native)) {
    return {
      supported: false,
      themePack: '',
      stylePack: '',
      chromeSource: '',
      commands: [],
    }
  }
  const supported = Boolean(native.themePack && native.stylePack && native.chromeSource)
  return {
    supported,
    themePack: native.themePack ?? '',
    stylePack: native.stylePack ?? '',
    chromeSource: native.chromeSource ?? '',
    commands: supported ? ['refurbish-skin', 'chrome-apply', 'remap-theme'] : [],
  }
}

function profileFor(entry, nativeSkinning) {
  const profile = entry?.refurbishProfile
  if (!isPlainObject(profile)) {
    const fallback = nativeSkinning.supported ? null : genericFallbackFor(entry)
    return {
      present: false,
      mode: nativeSkinning.supported ? 'native' : 'manual-fallback',
      nativeSkinning,
      fallback,
      requiredGates: defaultGates(nativeSkinning.supported),
      notes: fallback
        ? [
            'No DeckKit-specific refurbishProfile was found; use the generic inspect-driven fallback.',
          ]
        : [],
    }
  }
  const profileNative = isPlainObject(profile.nativeSkinning)
    ? {
        supported: profile.nativeSkinning.supported === true,
        themePack: profile.nativeSkinning.themePack ?? nativeSkinning.themePack,
        stylePack: profile.nativeSkinning.stylePack ?? nativeSkinning.stylePack,
        commands: stringArray(profile.nativeSkinning.commands),
      }
    : nativeSkinning
  const fallback = isPlainObject(profile.fallback)
    ? { ...genericFallbackFor(entry), ...profile.fallback, source: 'catalog' }
    : profileNative.supported
      ? null
      : genericFallbackFor(entry)
  return {
    present: true,
    mode: profile.mode ?? (nativeSkinning.supported ? 'native' : 'manual-fallback'),
    nativeSkinning: profileNative,
    fallback,
    requiredGates: stringArray(profile.requiredGates).length
      ? stringArray(profile.requiredGates)
      : defaultGates(nativeSkinning.supported),
    notes: stringArray(profile.notes),
  }
}

function genericFallbackFor(entry) {
  const colors = entry?.visualGrammar?.colorSystem ?? {}
  const typography = entry?.visualGrammar?.typography ?? {}
  return {
    schemaVersion: 'pptx-nova-refurbish-fallback/v1',
    source: 'generic-visual-grammar',
    strategy: 'inspect-driven-editable-object-restyle',
    patchScript: 'scripts/pptx-nova-refurbish-fallback-patch.mjs',
    palette: {
      background: firstHex(colors.background, 'F7F3E8'),
      text: firstHex(colors.primary, '1F1F1F'),
      accent: firstHex(colors.accent, 'D9B44A'),
      softAccent: firstHex(colors.accent?.slice?.(1), 'EFE2B7'),
      secondary: firstHex(colors.secondary, '6B7280'),
      surface: firstHex(colors.background?.slice?.(1), 'FFFFFF'),
      rule: firstHex(colors.primary, '1F1F1F'),
    },
    fonts: {
      heading: fontFamilyFrom(typography.display, 'Aptos Display'),
      body: fontFamilyFrom(typography.body, 'Aptos'),
      label: fontFamilyFrom(typography.label ?? typography.mono ?? typography.chrome, 'Aptos'),
      cjk: fontFamilyFrom(typography.cjk, 'Microsoft YaHei'),
    },
    styleOps: [
      'set-theme-color',
      'set-theme-font',
      'set-slide-background',
      'set-text-style',
      'set-shape-fill',
      'set-shape-line',
    ],
    chromePolicy: 'preserve-and-restyle-existing',
    contentPolicy: 'preserve-source-slides-and-editable-objects',
  }
}

function fontFamilyFrom(value, fallback) {
  if (typeof value !== 'string') return fallback
  const beforeFor = value.split(/\s+for\s+/i)[0]?.trim()
  if (!beforeFor) return fallback
  const quoted = beforeFor.match(/["“”']([^"“”']+)["“”']/)
  if (quoted?.[1]) return quoted[1].trim()
  const lower = beforeFor.toLowerCase()
  const markers = [
    ' weight ',
    ' regular',
    ' bold',
    ' sans',
    ' serif',
    ' condensed',
    ' uppercase',
    ' all-caps',
    ' display',
  ]
  let cut = beforeFor.length
  for (const marker of markers) {
    const index = lower.indexOf(marker)
    if (index > 0) cut = Math.min(cut, index)
  }
  return beforeFor.slice(0, cut).replace(/,$/, '').trim() || fallback
}

function defaultGates(nativeSupported) {
  const gates = ['dry-run', 'vision-diff', 'refurbish-audit', 'png-contact-review']
  return nativeSupported ? ['refurbish-skin-report', ...gates] : ['fallback-patch-report', ...gates]
}

function buildCommands(args, entry, nativeSkinning, profile) {
  if (nativeSkinning.supported) {
    return [
      {
        name: 'native-refurbish-skin',
        required: true,
        command: `xdoc pptx refurbish-skin --source ${shell(args.source)} --deckkit ${shell(entry.id)} --output ${shell(args.output)} --json`,
      },
      {
        name: 'manual-contact-diff',
        required: false,
        command: `xdoc pptx contact-diff --source ${shell(args.source)} --candidate ${shell(args.output)} --output contact-diff.png --json`,
      },
    ]
  }

  const fallback = profile.fallback ?? {}
  const styleOps = stringArray(fallback.styleOps)
  return [
    {
      name: 'detect-existing-chrome',
      required: true,
      command: `xdoc pptx chrome-detect ${shell(args.source)} --json`,
    },
    {
      name: 'generate-fallback-patch',
      required: true,
      command:
        `node ${shell(join(SKILL_ROOT, 'scripts/pptx-nova-refurbish-fallback-patch.mjs'))} --deckkit ${shell(entry.id)} --source ${shell(args.source)} --inspect reference-inspect.json --output ${shell(args.output)} --patch patch.json --lock deck_lock.json --audit content-audit.json --map reference-map.json --json` +
        (styleOps.length ? `; generated patch uses ${styleOps.join(', ')}` : ''),
    },
    {
      name: 'dry-run',
      required: true,
      command: `xdoc pptx apply -p patch.json -i ${shell(args.source)} -o ${shell(args.output)} --dry-run --json`,
    },
    {
      name: 'apply',
      required: true,
      command: `xdoc pptx apply -p patch.json -i ${shell(args.source)} -o ${shell(args.output)} --json`,
    },
    {
      name: 'vision-diff',
      required: true,
      command: `xdoc pptx vision-diff --source ${shell(args.source)} --candidate ${shell(args.output)} --json`,
    },
  ]
}

function buildPlan(args) {
  const catalog = readJson(args.catalog)
  const entry = catalog.entries.find((candidate) => candidate.id === args.deckkit)
  const blockers = []
  if (!entry) {
    blockers.push(`DeckKit "${args.deckkit}" is missing from catalog`)
    return planResult(args, null, blockers)
  }

  const nativeSkinning = nativeSkinningFor(entry)
  const profile = profileFor(entry, nativeSkinning)
  const readiness = entry.readiness ?? ''
  const explicitOnly = ['experimental', 'candidate'].includes(readiness)
  if (explicitOnly && !args.explicit) {
    blockers.push(
      `DeckKit "${entry.id}" readiness is "${readiness}"; pass --explicit only when the user named it`,
    )
  }
  const usesGenericFallback =
    !nativeSkinning.supported && profile.fallback?.source === 'generic-visual-grammar'

  const status = blockers.length
    ? 'blocked'
    : explicitOnly && args.explicit && usesGenericFallback
      ? 'explicit-manual-fallback'
      : explicitOnly && args.explicit
        ? 'explicit-only'
        : usesGenericFallback
          ? 'manual-fallback'
          : 'ready'
  const route = nativeSkinning.supported ? 'native-skin-first' : 'fallback-patch'
  return {
    ...planResult(args, entry, blockers),
    status,
    route,
    explicitSelection: {
      requested: args.explicit,
      required: explicitOnly,
      mode: explicitOnly ? profile.mode : 'standard',
    },
    readiness,
    nativeSkinning,
    refurbishProfile: profile,
    chromePolicy:
      profile.fallback?.chromePolicy ??
      (nativeSkinning.supported ? 'replace-or-restyle-existing' : 'detect-and-restyle-existing'),
    requiredGates: profile.requiredGates,
    commands: buildCommands(args, entry, nativeSkinning, profile),
  }
}

function planResult(args, entry, blockers) {
  return {
    schemaVersion: 'pptx-nova-refurbish-plan/v1',
    deckkit: args.deckkit,
    source: args.source,
    output: args.output,
    paths: {
      catalog: relative(SKILL_ROOT, args.catalog),
    },
    catalog: {
      found: Boolean(entry),
      id: entry?.id ?? '',
      path: entry?.path ?? '',
    },
    blockers,
    status: blockers.length ? 'blocked' : 'ready',
  }
}

function printHuman(result) {
  process.stdout.write(`PPTX refurbish plan: ${result.deckkit}\n`)
  process.stdout.write(`- status: ${result.status}\n`)
  if (result.route) process.stdout.write(`- route: ${result.route}\n`)
  if (result.nativeSkinning) {
    process.stdout.write(
      `- native skinning: ${result.nativeSkinning.supported ? 'yes' : 'no'}${result.nativeSkinning.themePack ? ` theme=${result.nativeSkinning.themePack} style=${result.nativeSkinning.stylePack}` : ''}\n`,
    )
  }
  if (result.requiredGates?.length) {
    process.stdout.write(`- required gates: ${result.requiredGates.join(', ')}\n`)
  }
  for (const blocker of result.blockers) process.stdout.write(`- blocker: ${blocker}\n`)
  if (result.commands?.length) {
    process.stdout.write('- commands:\n')
    for (const command of result.commands) {
      process.stdout.write(`  - ${command.name}: ${command.command}\n`)
    }
  }
}

try {
  const args = parseArgs(process.argv.slice(2))
  const result = buildPlan(args)
  if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else printHuman(result)
  if (result.status === 'blocked') process.exit(1)
} catch (error) {
  process.stderr.write(`[error] ${error.message}\n`)
  process.exit(1)
}
