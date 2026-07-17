#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILL_ROOT = resolve(__dirname, '..')

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-probe.mjs [options]

Discover the runtime xdoc capability index without turning that index into an
allowlist. A missing disclosure is reported as "undisclosed", not "unsupported".

Options:
  --xdoc-bin <path>                 xdoc executable. Defaults to xdoc.
  --output <path>                   Write the capability snapshot to this path.
  --require-command <name>          Require a top-level or pptx.<subcommand> disclosure.
  --require-op <name>               Require a patch or recipe op disclosure.
  --require-enum <name>             Require an enum registry disclosure.
  --require-theme <id>              Require a theme pack disclosure.
  --require-style <id>              Require a style pack disclosure.
  --require-native-deckkit <id>     Require native xdoc skinning disclosure.
  --require-generator-deckkit <id>  Require bundled DeckKit generator disclosure.
  --strict                          Exit 2 when a required capability is undisclosed.
  --overwrite                       Replace an existing current-run output file.
  --json                            Print the complete JSON report to stdout.
  --help                            Show this help.

Requirement flags may be repeated or use comma-separated values.
`

function valueAfter(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function addValues(target, value) {
  for (const item of String(value).split(',')) {
    const normalized = item.trim()
    if (normalized) target.push(normalized)
  }
}

function parseArgs(argv) {
  const args = {
    xdocBin: 'xdoc',
    output: '',
    strict: false,
    overwrite: false,
    json: false,
    requirements: {
      commands: [],
      operations: [],
      enums: [],
      themes: [],
      styles: [],
      nativeDeckkits: [],
      generatorDeckkits: [],
    },
  }
  const requirementFlags = {
    '--require-command': 'commands',
    '--require-op': 'operations',
    '--require-enum': 'enums',
    '--require-theme': 'themes',
    '--require-style': 'styles',
    '--require-native-deckkit': 'nativeDeckkits',
    '--require-generator-deckkit': 'generatorDeckkits',
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--strict') {
      args.strict = true
    } else if (arg === '--overwrite') {
      args.overwrite = true
    } else if (arg === '--xdoc-bin') {
      args.xdocBin = valueAfter(argv, i, arg)
      i += 1
    } else if (arg === '--output' || arg === '-o') {
      args.output = valueAfter(argv, i, arg)
      i += 1
    } else if (requirementFlags[arg]) {
      addValues(args.requirements[requirementFlags[arg]], valueAfter(argv, i, arg))
      i += 1
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    }
  }

  for (const values of Object.values(args.requirements)) {
    values.splice(0, values.length, ...[...new Set(values)])
  }
  return args
}

function run(bin, args) {
  const result = spawnSync(bin, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error
      ? {
          code: result.error.code ?? 'spawn-error',
          message: result.error.message,
        }
      : null,
  }
}

function parseJson(text) {
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

function hasFlag(helpText, flag) {
  return new RegExp(`(^|\\s)${flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|,|$)`, 'm').test(
    helpText,
  )
}

function helpFlagIndex(bin) {
  const convertHelp = run(bin, ['convert', '--help'])
  const checkHelp = run(bin, ['check', '--help'])
  const pptxHelp = run(bin, ['pptx', '--help'])
  const fromHelp = (result, flag) => (result.ok ? hasFlag(result.stdout, flag) : null)

  return {
    convert: {
      helpAvailable: convertHelp.ok,
      jsonStdout: fromHelp(convertHelp, '--json') === true,
      reportFile: fromHelp(convertHelp, '--report') === true,
      outputFile:
        fromHelp(convertHelp, '--output') === true || fromHelp(convertHelp, '-o') === true,
      notes:
        'Top-level convert is a generic export fallback. Do not assume JSON stdout unless jsonStdout is true.',
    },
    check: {
      helpAvailable: checkHelp.ok,
      jsonStdout: fromHelp(checkHelp, '--json') === true,
      reportFile: fromHelp(checkHelp, '--report') === true,
      outputFile: fromHelp(checkHelp, '--output') === true || fromHelp(checkHelp, '-o') === true,
      notes:
        'For single-file preflight diagnostics, write the structured check result with -o/--output. --report is a batch summary when available.',
    },
    pptx: {
      helpAvailable: pptxHelp.ok,
      jsonStdout: fromHelp(pptxHelp, '--json') === true,
      previewManifest: pptxHelp.ok && pptxHelp.stdout.includes('preview'),
      notes:
        'PPTX subcommands such as preview/inspect/apply emit machine-readable stdout when --json is disclosed.',
    },
  }
}

function objectKeys(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : []
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value))].sort()
}

function namesFromCollection(value, fields = ['op', 'name', 'id']) {
  if (Array.isArray(value)) {
    return uniqueSorted(
      value.flatMap((item) => {
        if (typeof item === 'string') return [item]
        if (!item || typeof item !== 'object') return []
        for (const field of fields) {
          if (typeof item[field] === 'string') return [item[field]]
        }
        return []
      }),
    )
  }
  return objectKeys(value).sort()
}

function idsFromCatalog(value) {
  if (Array.isArray(value)) return namesFromCollection(value, ['id', 'name'])
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value.ids)) return uniqueSorted(value.ids)
  return namesFromCollection(value.entries ?? value.items ?? value, ['id', 'name'])
}

function aliasCount(value) {
  if (Array.isArray(value)) return value.length
  return objectKeys(value).length
}

function enumIndex(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value)
    .map(([name, definition]) => ({
      name,
      availability: definition?.availability ?? null,
      strict: definition?.strict ?? definition?.strictness?.strict ?? null,
      valueCount: Array.isArray(definition?.values) ? definition.values.length : null,
      aliasCount: aliasCount(definition?.aliases),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function nativeDeckkitIndex(value) {
  const entries = Array.isArray(value?.deckkits) ? value.deckkits : []
  return entries
    .filter((entry) => entry && typeof entry.id === 'string')
    .map((entry) => ({
      id: entry.id,
      readiness: entry.readiness ?? null,
      themePack: entry.themePack ?? null,
      stylePack: entry.stylePack ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function readLocalJson(path) {
  try {
    return parseJson(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function generatorDeckkitIndex() {
  const catalog = readLocalJson(join(SKILL_ROOT, 'assets', 'deckkits', 'catalog.json'))
  const entries = Array.isArray(catalog?.entries) ? catalog.entries : []
  return entries
    .filter((entry) => entry && typeof entry.id === 'string')
    .map((entry) => ({
      id: entry.id,
      readiness: entry.readiness ?? null,
      themePack: entry.themePack ?? entry.nativeSkinning?.themePack ?? null,
      stylePack: entry.stylePack ?? entry.nativeSkinning?.stylePack ?? null,
      path: entry.path ?? null,
      creation: 'deckkit-generator',
      nativeSkinning: entry.nativeSkinning?.supported === true,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function requirementResults(requirements, capabilities) {
  const indexes = {
    commands: new Set([
      ...capabilities.commands,
      ...capabilities.pptxSubcommands,
      ...capabilities.pptxSubcommands.map((name) => `pptx.${name}`),
    ]),
    operations: new Set([...capabilities.patchOperations, ...capabilities.recipeOperations]),
    enums: new Set(capabilities.enums.map((entry) => entry.name)),
    themes: new Set(capabilities.themePacks),
    styles: new Set(capabilities.stylePacks),
    nativeDeckkits: new Set(capabilities.nativeDeckkits.map((entry) => entry.id)),
    generatorDeckkits: new Set(capabilities.generatorDeckkits.map((entry) => entry.id)),
  }
  const results = []
  const disclosedMeaning = {
    commands: 'present in the runtime xdoc command index',
    operations: 'present in the runtime xdoc patch/recipe operation index',
    enums: 'present in the runtime xdoc enum registry',
    themes: 'present in the runtime xdoc theme catalog',
    styles: 'present in the runtime xdoc style catalog',
    nativeDeckkits: 'present in the runtime xdoc native skinning DeckKit catalog',
    generatorDeckkits: 'present in the bundled DeckKit generator catalog',
  }
  for (const [kind, values] of Object.entries(requirements)) {
    for (const value of values) {
      const disclosed = indexes[kind].has(value)
      results.push({
        kind,
        value,
        state: disclosed ? 'disclosed' : 'undisclosed',
        meaning: disclosed
          ? disclosedMeaning[kind] || 'present in the capability index'
          : 'not present in the capability index; this is not proof of unsupported behavior',
      })
    }
  }
  return results
}

function compactFailure(result) {
  return {
    exitCode: result.status,
    error: result.error,
    stderr: result.stderr.trim().slice(0, 1000) || null,
  }
}

function createReport(args) {
  const schemaRun = run(args.xdocBin, ['schema'])
  const schema = schemaRun.ok ? parseJson(schemaRun.stdout) : null
  let version = typeof schema?.version === 'string' ? schema.version : null
  let fallbackVersion = null
  let fallbackHelp = null

  if (!schema) {
    fallbackVersion = run(args.xdocBin, ['--version'])
    fallbackHelp = run(args.xdocBin, ['--help'])
    if (fallbackVersion.ok) version = fallbackVersion.stdout.trim() || null
  } else if (!version) {
    fallbackVersion = run(args.xdocBin, ['--version'])
    if (fallbackVersion.ok) version = fallbackVersion.stdout.trim() || null
  }

  const executableMissing =
    schemaRun.error?.code === 'ENOENT' ||
    fallbackVersion?.error?.code === 'ENOENT' ||
    fallbackHelp?.error?.code === 'ENOENT'
  const pptx = schema?.commands?.pptx ?? {}
  const patchSchema = pptx.patchSchema ?? {}
  const catalogs = pptx.catalogs ?? {}
  const schemaSlicingModes = namesFromCollection(pptx.schemaDisclosure?.modes, ['flag'])
  const fieldsAvailable = schemaSlicingModes.some((mode) => mode.startsWith('--fields'))
  const capabilities = {
    commands: objectKeys(schema?.commands).sort(),
    pptxSubcommands: objectKeys(pptx.subcommands).sort(),
    patchOperations: uniqueSorted([
      ...namesFromCollection(patchSchema.supportedOps),
      ...namesFromCollection(patchSchema.operations),
    ]),
    recipeOperations: namesFromCollection(pptx.recipeOps),
    enums: enumIndex(pptx.enumRegistry?.enums),
    themePacks: idsFromCatalog(catalogs.themes),
    stylePacks: idsFromCatalog(catalogs.styles),
    nativeDeckkits: nativeDeckkitIndex(catalogs.nativeDeckkits),
    nativeSkinningDeckkits: nativeDeckkitIndex(catalogs.nativeDeckkits),
    generatorDeckkits: generatorDeckkitIndex(),
    schemaSlicing: {
      available: Boolean(pptx.schemaDisclosure),
      modes: schemaSlicingModes,
      fieldsAvailable,
      recommended: pptx.schemaDisclosure?.agentHint ?? null,
    },
    commandFlags: helpFlagIndex(args.xdocBin),
  }
  const requirements = requirementResults(args.requirements, capabilities)
  const undisclosedRequired = requirements.filter((item) => item.state === 'undisclosed')
  const warnings = []
  if (!schema) {
    warnings.push({
      code: 'schema-unavailable',
      message:
        'xdoc schema was unavailable or not valid JSON; use command help and dry-run for further discovery instead of treating capabilities as unsupported.',
      detail: compactFailure(schemaRun),
    })
  }
  if (schema && schema.schemaVersion !== 'cli-agent/v1') {
    warnings.push({
      code: 'unknown-cli-schema-version',
      message: `Observed ${schema.schemaVersion ?? 'an unversioned schema'}; retain discovery data and review schema changes before high-risk writes.`,
    })
  }
  if (undisclosedRequired.length > 0) {
    warnings.push({
      code: 'required-capability-undisclosed',
      message:
        'One or more task requirements were not disclosed. Explore targeted help/schema or choose a documented fallback; do not classify them as unsupported from this snapshot alone.',
    })
  }

  return {
    report: {
      schemaVersion: 'pptx-nova-xdoc-capabilities/v1',
      observedAt: new Date().toISOString(),
      status: executableMissing ? 'dependency-missing' : schema ? 'ready' : 'degraded',
      xdoc: {
        executable: args.xdocBin,
        version,
        cliSchemaVersion: schema?.schemaVersion ?? null,
        capabilitySchemaVersion: schema?.capabilities?.schemaVersion ?? null,
        patchCapabilityVersion: patchSchema.capabilityVersion ?? null,
        schemaSha256: schema ? createHash('sha256').update(schemaRun.stdout).digest('hex') : null,
      },
      disclosure: {
        source: schema ? 'xdoc schema' : 'xdoc --help fallback',
        scope: schema ? 'runtime-schema-name-index' : 'unstructured-fallback',
        notAnAllowlist: true,
        missingMeans: 'undisclosed, not unsupported',
        targetedLookup: {
          operationIndex:
            'read xdoc-capabilities.json#capabilities.patchOperations; refresh with xdoc schema --index only when needed',
          operationSchema: fieldsAvailable
            ? 'xdoc schema --op <name> --fields <needed-fields> --minimal; omit --fields or use apply --dry-run for complete validation'
            : 'xdoc schema --op <name> --minimal',
          commandHelp: 'xdoc <command...> --help',
          selectorEvidence: 'inspect output -> op schema -> dry-run suggestions',
          deckkitGeneratorCatalog:
            'read xdoc-capabilities.json#capabilities.generatorDeckkits for DeckKit-first creation support',
          nativeSkinningCatalog:
            'read xdoc-capabilities.json#capabilities.nativeSkinningDeckkits for native refurbish/skin support',
        },
      },
      capabilities,
      requirements: {
        strict: args.strict,
        status: undisclosedRequired.length === 0 ? 'satisfied' : 'attention',
        results: requirements,
        undisclosedRequired: undisclosedRequired.map(({ kind, value }) => ({ kind, value })),
      },
      fallback: schema
        ? null
        : {
            versionAvailable: Boolean(fallbackVersion?.ok),
            helpAvailable: Boolean(fallbackHelp?.ok),
            helpIsStructuredJson: false,
          },
      warnings,
      error: executableMissing
        ? {
            kind: 'ENOENT',
            message: `xdoc executable was not found: ${args.xdocBin}`,
          }
        : null,
    },
    executableMissing,
    strictFailure: args.strict && undisclosedRequired.length > 0,
  }
}

function writeReport(args, report) {
  const text = `${JSON.stringify(report, null, 2)}\n`
  if (args.output) {
    const output = resolve(args.output)
    if (existsSync(output) && !args.overwrite) {
      throw new Error(
        `output already exists: ${output}; use --overwrite only for a current-run artifact`,
      )
    }
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, text)
  }
  if (args.json || !args.output) {
    process.stdout.write(text)
  } else {
    process.stdout.write(`xdoc capability status: ${report.status}\n`)
    process.stdout.write(`xdoc version: ${report.xdoc.version ?? 'unknown'}\n`)
    process.stdout.write(`snapshot: ${resolve(args.output)}\n`)
    process.stdout.write(`requirements: ${report.requirements.status}\n`)
  }
}

try {
  const args = parseArgs(process.argv.slice(2))
  const { report, executableMissing, strictFailure } = createReport(args)
  writeReport(args, report)
  if (executableMissing) process.exit(1)
  if (strictFailure) process.exit(2)
} catch (error) {
  process.stderr.write(`[error] ${error.message}\n`)
  process.exit(1)
}
