#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const SCHEMA_VERSION = 'pptx-nova-edit-contract/v1'
const SCOPES = new Set([
  'single-object',
  'single-slide',
  'multi-slide',
  'all-slides-style',
  'structural',
])
const EVIDENCE_KINDS = new Set([
  'dry-run',
  'semantic-diff',
  'style-diff',
  'png-preview',
  'vision-check',
  'vision-diff',
  'final-inspect',
  'structure-check',
])

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-edit-contract.mjs --draft <path> --source <pptx> [options]

Normalize an agent-authored edit contract draft and bind it to the current source PPTX bytes.

Options:
  --draft <path>     Required JSON draft with request, scope, targets, and evidence policy.
  --source <pptx>    Required source PPTX used for inspect/select and later apply.
  --output <path>    Output contract. Defaults to edit-contract.json beside the draft.
  --overwrite        Replace an existing output.
  --json             Print the normalized contract to stdout.
  --help             Show this help.
`

function valueAfter(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function parseArgs(argv) {
  const args = { draft: '', source: '', output: '', overwrite: false, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    } else if (arg === '--draft') {
      args.draft = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--source') {
      args.source = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--output' || arg === '-o') {
      args.output = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--overwrite') {
      args.overwrite = true
    } else if (arg === '--json') {
      args.json = true
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    }
  }
  if (!args.draft) throw new Error(`--draft is required\n\n${usage}`)
  if (!args.source) throw new Error(`--source is required\n\n${usage}`)
  args.draft = resolve(args.draft)
  args.source = resolve(args.source)
  args.output = resolve(args.output || resolve(dirname(args.draft), 'edit-contract.json'))
  if (!existsSync(args.draft)) throw new Error(`draft does not exist: ${args.draft}`)
  if (!existsSync(args.source)) throw new Error(`source PPTX does not exist: ${args.source}`)
  if (existsSync(args.output) && !args.overwrite) {
    throw new Error(`output already exists: ${args.output}; use --overwrite for the current run`)
  }
  return args
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} is not valid JSON: ${message}`)
  }
}

function uniqueStrings(value, label, { required = false, allowed = null } = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  const result = []
  for (const item of value) {
    const text = String(item ?? '').trim()
    if (!text) throw new Error(`${label} must not contain empty values`)
    if (allowed && !allowed.has(text))
      throw new Error(`${label} contains unsupported value: ${text}`)
    if (!result.includes(text)) result.push(text)
  }
  if (required && result.length === 0) throw new Error(`${label} must not be empty`)
  return result
}

function integerList(value, label) {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error(`${label} must be a non-empty array`)
  const result = []
  for (const item of value) {
    if (!Number.isInteger(item) || item < 0)
      throw new Error(`${label} must contain non-negative integers`)
    if (!result.includes(item)) result.push(item)
  }
  return result
}

function stableIdentity(target, index) {
  if (target.kind === 'slide') {
    return { slide: target.slide, id: null, name: null }
  }
  const selector = target?.selector?.shape ?? target?.selector ?? {}
  const resolved = target?.resolvedIdentity ?? {}
  const identity = {
    slide: target.slide,
    id: resolved.id ?? selector.id ?? null,
    name: resolved.name ?? selector.name ?? null,
  }
  if (identity.id === null && !identity.name) {
    throw new Error(
      `targets[${index}] must declare a stable selector id/name or resolvedIdentity from current inspect/select evidence`,
    )
  }
  return identity
}

function normalizeTargets(value) {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error('targets must be a non-empty array')
  const ids = new Set()
  return value.map((target, index) => {
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      throw new Error(`targets[${index}] must be an object`)
    }
    const id = String(target.id ?? '').trim()
    if (!id) throw new Error(`targets[${index}].id is required`)
    if (ids.has(id)) throw new Error(`duplicate target id: ${id}`)
    ids.add(id)
    if (!Number.isInteger(target.slide) || target.slide < 0) {
      throw new Error(`targets[${index}].slide must be a non-negative 0-based index`)
    }
    const kind = target.kind === 'slide' ? 'slide' : 'object'
    if (
      kind === 'object' &&
      (!target.selector || typeof target.selector !== 'object' || Array.isArray(target.selector))
    ) {
      throw new Error(`targets[${index}].selector must be an object`)
    }
    if (!target.expected || typeof target.expected !== 'object' || Array.isArray(target.expected)) {
      throw new Error(`targets[${index}].expected must be an object`)
    }
    if (
      target.expected.alreadyCompliant === true &&
      target.expected.beforeText !== undefined &&
      target.expected.afterText !== undefined &&
      target.expected.beforeText !== target.expected.afterText
    ) {
      throw new Error(
        `targets[${index}].expected alreadyCompliant requires matching beforeText/afterText`,
      )
    }
    const resolvedIdentity = stableIdentity(target, index)
    return {
      ...target,
      id,
      kind,
      opIndexes: integerList(target.opIndexes, `targets[${index}].opIndexes`),
      resolvedIdentity,
      expected: {
        ...target.expected,
        changeCategories: uniqueStrings(
          target.expected.changeCategories,
          `targets[${index}].expected.changeCategories`,
          { required: true },
        ),
      },
    }
  })
}

function normalizeExpectedStructure(value, scope) {
  if (value === undefined) {
    if (scope === 'structural')
      throw new Error('expectedStructure is required for structural scope')
    return undefined
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('expectedStructure must be an object')
  }
  const slideCountDelta = value.slideCountDelta ?? 0
  if (!Number.isInteger(slideCountDelta)) {
    throw new Error('expectedStructure.slideCountDelta must be an integer')
  }
  return {
    ...value,
    slideCountDelta,
    changedSlides: integerList(value.changedSlides, 'expectedStructure.changedSlides'),
    objectTypes: uniqueStrings(value.objectTypes ?? [], 'expectedStructure.objectTypes'),
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function normalizeContract(draft, args) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw new Error('draft must contain a JSON object')
  }
  if (draft.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`draft schemaVersion must be ${SCHEMA_VERSION}`)
  }
  const request = String(draft.request ?? '').trim()
  if (!request) throw new Error('request is required')
  const scope = String(draft.scope ?? '').trim()
  if (!SCOPES.has(scope)) throw new Error(`scope must be one of: ${[...SCOPES].join(', ')}`)
  const operationKind = String(draft.operationKind ?? '').trim()
  if (!operationKind) throw new Error('operationKind is required')
  const targets = normalizeTargets(draft.targets)
  if (targets.some((target) => target.kind === 'slide') && scope !== 'structural') {
    throw new Error('slide targets are only valid for structural scope')
  }
  const expectedTargetCount = draft.coverage?.expectedTargetCount ?? targets.length
  if (!Number.isInteger(expectedTargetCount) || expectedTargetCount < 1) {
    throw new Error('coverage.expectedTargetCount must be a positive integer')
  }
  if (expectedTargetCount !== targets.length) {
    throw new Error(
      `coverage.expectedTargetCount ${expectedTargetCount} does not match targets.length ${targets.length}`,
    )
  }
  const sourceStat = statSync(args.source)
  if (!sourceStat.isFile() || sourceStat.size === 0)
    throw new Error(`source PPTX is empty: ${args.source}`)
  const sourceDraft = draft.source && typeof draft.source === 'object' ? draft.source : {}
  const requiredEvidence = uniqueStrings(draft.requiredEvidence, 'requiredEvidence', {
    required: true,
    allowed: EVIDENCE_KINDS,
  })
  if (targets.some((target) => target.expected?.alreadyCompliant === true)) {
    if (!requiredEvidence.includes('final-inspect')) requiredEvidence.push('final-inspect')
  }
  return {
    ...draft,
    schemaVersion: SCHEMA_VERSION,
    observedAt: new Date().toISOString(),
    request,
    scope,
    operationKind,
    workspace: resolve('.'),
    source: {
      ...sourceDraft,
      pptx: args.source,
      sha256: sha256(args.source),
      byteLength: sourceStat.size,
    },
    targets,
    coverage: {
      ...draft.coverage,
      required: draft.coverage?.required !== false,
      expectedTargetCount,
    },
    allowedChanges: uniqueStrings(draft.allowedChanges, 'allowedChanges', { required: true }),
    preserve: uniqueStrings(draft.preserve ?? [], 'preserve'),
    requiredEvidence,
    ...(draft.expectedStructure !== undefined || scope === 'structural'
      ? { expectedStructure: normalizeExpectedStructure(draft.expectedStructure, scope) }
      : {}),
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const contract = normalizeContract(readJson(args.draft, 'draft'), args)
  writeFileSync(args.output, `${JSON.stringify(contract, null, 2)}\n`)
  if (args.json) process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`)
  else process.stdout.write(`Edit contract: ${args.output}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
