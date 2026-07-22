#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { inflateRawSync } from 'node:zlib'

const SCHEMA_VERSION = 'pptx-nova-edit-contract-gate/v1'
const CONTRACT_SCHEMA_VERSION = 'pptx-nova-edit-contract/v1'

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-edit-contract-gate.mjs --contract <path> [options]

Verify source freshness, dry-run target coverage, reliable semantic diff locality,
and required scoped evidence for an existing-deck edit.

Options:
  --contract <path>        Required normalized edit-contract.json.
  --candidate <pptx>       Required stable run-directory candidate PPTX.
  --dry-run <path>         Defaults to dry-run.json beside the contract.
  --diff <path>            Defaults to pptx-diff.json beside the contract.
  --style-diff <path>      Defaults to style-diff.json beside the contract.
  --preview <path>         Defaults to preview.json beside the contract.
  --vision <path>          Defaults to vision.json beside the contract.
  --vision-diff <path>     Defaults to vision-diff.json beside the contract.
  --evidence-manifest <path> Defaults to evidence-manifest.json beside the contract.
  --final-inspect <path>   Optional/default final-inspect.json.
  --structure-check <path> Optional/default structure-check.json.
  --output <path>          Defaults to edit-contract-gate.json.
  --overwrite              Replace an existing gate report.
  --strict                 Exit 2 when blockers remain.
  --json                   Print the gate report to stdout.
  --help                   Show this help.
`

function valueAfter(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function parseArgs(argv) {
  const args = {
    contract: '',
    candidate: '',
    dryRun: '',
    diff: '',
    styleDiff: '',
    preview: '',
    vision: '',
    visionDiff: '',
    evidenceManifest: '',
    finalInspect: '',
    structureCheck: '',
    output: '',
    overwrite: false,
    strict: false,
    json: false,
  }
  const valueFlags = {
    '--contract': 'contract',
    '--candidate': 'candidate',
    '--dry-run': 'dryRun',
    '--diff': 'diff',
    '--style-diff': 'styleDiff',
    '--preview': 'preview',
    '--vision': 'vision',
    '--vision-diff': 'visionDiff',
    '--evidence-manifest': 'evidenceManifest',
    '--final-inspect': 'finalInspect',
    '--structure-check': 'structureCheck',
    '--output': 'output',
    '-o': 'output',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    } else if (arg === '--overwrite') {
      args.overwrite = true
    } else if (arg === '--strict') {
      args.strict = true
    } else if (arg === '--json') {
      args.json = true
    } else if (valueFlags[arg]) {
      args[valueFlags[arg]] = valueAfter(argv, index, arg)
      index += 1
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    }
  }
  if (!args.contract) throw new Error(`--contract is required\n\n${usage}`)
  if (!args.candidate) throw new Error(`--candidate is required\n\n${usage}`)
  args.contract = resolve(args.contract)
  args.candidate = resolve(args.candidate)
  if (!existsSync(args.contract)) throw new Error(`contract does not exist: ${args.contract}`)
  if (!existsSync(args.candidate)) throw new Error(`candidate does not exist: ${args.candidate}`)
  const runDir = dirname(args.contract)
  args.dryRun = resolve(args.dryRun || join(runDir, 'dry-run.json'))
  args.diff = resolve(args.diff || join(runDir, 'pptx-diff.json'))
  args.styleDiff = resolve(args.styleDiff || join(runDir, 'style-diff.json'))
  args.preview = resolve(args.preview || join(runDir, 'preview.json'))
  args.vision = resolve(args.vision || join(runDir, 'vision.json'))
  args.visionDiff = resolve(args.visionDiff || join(runDir, 'vision-diff.json'))
  args.evidenceManifest = resolve(args.evidenceManifest || join(runDir, 'evidence-manifest.json'))
  args.finalInspect = resolve(args.finalInspect || join(runDir, 'final-inspect.json'))
  args.structureCheck = resolve(args.structureCheck || join(runDir, 'structure-check.json'))
  args.output = resolve(args.output || join(runDir, 'edit-contract-gate.json'))
  if (existsSync(args.output) && !args.overwrite) {
    throw new Error(`output already exists: ${args.output}; use --overwrite for the current run`)
  }
  return args
}

function readJson(path, label, { required = true } = {}) {
  if (!existsSync(path)) {
    if (required) throw new Error(`${label} does not exist: ${path}`)
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} is not valid JSON: ${message}`)
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset
  }
  throw new Error('PPTX ZIP end of central directory was not found')
}

function readZipEntries(path) {
  const buffer = readFileSync(path)
  const eocd = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(eocd + 10)
  const centralOffset = buffer.readUInt32LE(eocd + 16)
  const entries = []
  let cursor = centralOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`Invalid ZIP central directory entry at ${cursor}`)
    }
    const method = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const uncompressedSize = buffer.readUInt32LE(cursor + 24)
    const fileNameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + fileNameLength)
    cursor += 46 + fileNameLength + extraLength + commentLength
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid ZIP local file header for ${name}`)
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
    let data
    if (method === 0) data = compressed
    else if (method === 8) data = inflateRawSync(compressed)
    else continue
    if (uncompressedSize !== 0 && data.length !== uncompressedSize) {
      throw new Error(`ZIP entry size mismatch for ${name}`)
    }
    entries.push({ name, data })
  }
  return entries
}

function normalizeHex(value) {
  const hex = String(value ?? '')
    .replace(/^#/, '')
    .trim()
    .toUpperCase()
  return /^[0-9A-F]{6}$/.test(hex) ? hex : null
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function slideXmlEntries(candidate) {
  const entries = readZipEntries(candidate)
  const byName = new Map(entries.map((entry) => [entry.name, entry]))
  const presentation = byName.get('ppt/presentation.xml')?.data.toString('utf8') ?? ''
  const relationships = byName.get('ppt/_rels/presentation.xml.rels')?.data.toString('utf8') ?? ''
  const relationshipTargets = new Map()
  for (const match of relationships.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = match[0]
    const id = tag.match(/\bId="([^"]+)"/)?.[1]
    const target = tag.match(/\bTarget="([^"]+)"/)?.[1]
    if (!id || !target) continue
    const name = target.startsWith('/')
      ? target.slice(1)
      : posix.normalize(posix.join('ppt', target))
    relationshipTargets.set(id, name)
  }
  const ordered = []
  for (const match of presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"[^>]*\/?\s*>/g)) {
    const name = relationshipTargets.get(match[1])
    const entry = name ? byName.get(name) : null
    if (entry) ordered.push({ index: ordered.length, name, xml: entry.data.toString('utf8') })
  }
  if (ordered.length > 0) return ordered
  return entries
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.name))
    .map((entry) => ({
      index: Number(entry.name.match(/slide(\d+)\.xml$/)?.[1] ?? 0) - 1,
      name: entry.name,
      xml: entry.data.toString('utf8'),
    }))
    .sort((left, right) => left.index - right.index)
}

function findShapeXml(slides, slideIndex, shapeName) {
  const namePattern = new RegExp(`\\bname="${escapeRegExp(shapeName)}"`)
  const slide = slides.find((item) => item.index === slideIndex)
  if (!slide) return null
  const blocks = slide.xml.match(/<p:sp(?:\s[^>]*)?>[\s\S]*?<\/p:sp>/g) ?? []
  const block = blocks.find((item) => namePattern.test(item))
  return block ? { part: slide.name, xml: block } : null
}

function shapeFontColors(shapeXml) {
  const colors = []
  for (const match of shapeXml.matchAll(/<a:rPr\b[^>]*>([\s\S]*?)<\/a:rPr>/g)) {
    const color = match[1].match(/<a:srgbClr\b[^>]*\bval="([0-9A-Fa-f]{6})"/i)?.[1]
    colors.push(normalizeHex(color))
  }
  return colors
}

function shapeFillColor(shapeXml) {
  const shapeProperties = shapeXml.match(/<p:spPr\b[^>]*>([\s\S]*?)<\/p:spPr>/)?.[1] ?? ''
  return normalizeHex(
    shapeProperties.match(
      /<a:solidFill\b[^>]*>[\s\S]*?<a:srgbClr\b[^>]*\bval="([0-9A-Fa-f]{6})"/i,
    )?.[1],
  )
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sessionOverlayMatchesContract(contract, resolution) {
  const overlay = resolution.contractOverlay ?? {}
  for (const expected of overlay.targets ?? []) {
    const actual = contract.targets.find((target) => target.id === expected.id)
    if (!actual) return false
    if (
      actual.produced !== expected.produced ||
      actual.slide !== expected.slide ||
      !sameJson(actual.opIndexes, expected.opIndexes) ||
      !sameJson(actual.sessionRuleIds ?? [], expected.sessionRuleIds ?? []) ||
      actual.resolvedIdentity?.name !== expected.resolvedIdentity?.name ||
      !sameJson(
        actual.expected?.sessionRulePostconditions ?? [],
        expected.expected?.sessionRulePostconditions ?? [],
      )
    ) {
      return false
    }
  }
  for (const value of overlay.preserve ?? []) if (!contract.preserve.includes(value)) return false
  for (const value of overlay.allowedChanges ?? []) {
    if (!contract.allowedChanges.includes(value)) return false
  }
  for (const value of overlay.requiredEvidence ?? []) {
    if (!contract.requiredEvidence.includes(value)) return false
  }
  return true
}

function checkSessionRulesBinding(contract, report) {
  if (!contract.sessionRules) return null
  const binding = contract.sessionRules
  const paths = [
    ['rules', binding.rulesPath, binding.rulesSha256],
    ['resolution', binding.resolutionPath, binding.resolutionSha256],
    ['operation', binding.operationPath, binding.operationSha256],
  ]
  let stale = false
  for (const [kind, path, expectedSha256] of paths) {
    if (!path || !existsSync(path) || sha256(path) !== expectedSha256) {
      stale = true
      addIssue(
        report,
        'blockers',
        'session-rules-binding-stale',
        `${kind} session rules artifact is missing or changed after contract generation`,
        { kind, path: path ?? null },
      )
    }
  }
  if (stale) return null
  const rules = readJson(binding.rulesPath, 'session rules')
  const resolution = readJson(binding.resolutionPath, 'session rules resolution')
  if (
    rules.schemaVersion !== 'pptx-nova-session-rules/v1' ||
    resolution.schemaVersion !== 'pptx-nova-session-rules-resolution/v1' ||
    resolution.status !== 'pass' ||
    resolution.agentGate?.passed !== true ||
    rules.deckIdentity?.deckId !== binding.deckId ||
    rules.deckIdentity?.currentRevisionSha256 !== contract.source?.sha256 ||
    resolution.source?.sha256 !== contract.source?.sha256 ||
    JSON.stringify(resolution.applicableRules.map((item) => item.id)) !==
      JSON.stringify(binding.applicableRuleIds) ||
    !sessionOverlayMatchesContract(contract, resolution)
  ) {
    addIssue(
      report,
      'blockers',
      'session-rules-binding-stale',
      'session rules binding no longer matches the contract source or applicable rule set',
    )
    return null
  }
  addCheck(report, 'session-rules-binding', 'pass', {
    deckId: binding.deckId,
    applicableRuleCount: binding.applicableRuleIds.length,
  })
  return resolution
}

function checkSessionRulePostconditions(contract, args, resolution, finalInspect, report) {
  if (!contract.sessionRules || !resolution) return
  const results = (resolution.notApplicableRules ?? []).map((item) => ({
    id: item.id,
    status: 'not-applicable',
    reason: item.reason,
    ...(item.source ? { source: item.source } : {}),
    targets: [],
    postconditions: [],
  }))
  if ((resolution.applicableRules ?? []).every((item) => item.kind === 'preserve-invariant')) {
    for (const applicable of resolution.applicableRules ?? []) {
      results.push({
        id: applicable.id,
        kind: applicable.kind,
        status: 'satisfied',
        targets: [],
        postconditions: [],
      })
    }
    report.sessionRuleResults = results
    addCheck(report, 'session-rule-postconditions', 'pass', {
      satisfied: results.filter((item) => item.status === 'satisfied').length,
      notApplicable: results.filter((item) => item.status === 'not-applicable').length,
      total: results.length,
    })
    return
  }
  let slides
  try {
    slides = slideXmlEntries(args.candidate)
  } catch (error) {
    addIssue(
      report,
      'blockers',
      'session-rule-candidate-inspection-failed',
      `candidate PPTX could not be inspected for session rule postconditions: ${error instanceof Error ? error.message : String(error)}`,
    )
    return
  }
  for (const applicable of resolution.applicableRules) {
    const ruleTargets = contract.targets.filter((target) =>
      (target.sessionRuleIds ?? []).includes(applicable.id),
    )
    if (applicable.kind === 'preserve-invariant') {
      results.push({ id: applicable.id, kind: applicable.kind, status: 'satisfied', targets: [] })
      continue
    }
    const targetResults = []
    let rulePassed = ruleTargets.length > 0
    for (const target of ruleTargets) {
      const inspected = findInspectedShape(finalInspect, target)
      const shape = inspected
        ? findShapeXml(slides, target.slide, target.resolvedIdentity?.name)
        : null
      const postconditions = []
      for (const condition of target.expected?.sessionRulePostconditions ?? []) {
        let actual = null
        if (shape && condition.kind === 'font-color') {
          const colors = shapeFontColors(shape.xml)
          actual = colors.length === 1 ? colors[0] : colors
          const passed = colors.length > 0 && colors.every((color) => color === condition.value)
          postconditions.push({ ...condition, expected: condition.value, actual, passed })
          rulePassed &&= passed
        } else if (shape && condition.kind === 'fill-color') {
          actual = shapeFillColor(shape.xml)
          const passed = actual === condition.value
          postconditions.push({ ...condition, expected: condition.value, actual, passed })
          rulePassed &&= passed
        } else {
          postconditions.push({
            ...condition,
            expected: condition.value,
            actual: null,
            passed: false,
          })
          rulePassed = false
        }
      }
      if (!inspected || !shape || postconditions.length === 0) rulePassed = false
      targetResults.push({
        targetId: target.id,
        slide: target.slide,
        shapeName: target.resolvedIdentity?.name ?? null,
        inspected: Boolean(inspected),
        candidatePart: shape?.part ?? null,
        postconditions,
      })
    }
    const result = {
      id: applicable.id,
      kind: applicable.kind,
      status: rulePassed ? 'satisfied' : 'blocked',
      targets: targetResults,
      postconditions: targetResults.flatMap((item) => item.postconditions),
    }
    results.push(result)
    if (!rulePassed) {
      addIssue(
        report,
        'blockers',
        'session-rule-postcondition-failed',
        `candidate does not satisfy applicable session rule ${applicable.id}`,
        { ruleId: applicable.id, targets: targetResults },
      )
    }
  }
  report.sessionRuleResults = results
  addCheck(
    report,
    'session-rule-postconditions',
    results.every((item) => item.status !== 'blocked') ? 'pass' : 'fail',
    {
      satisfied: results.filter((item) => item.status === 'satisfied').length,
      notApplicable: results.filter((item) => item.status === 'not-applicable').length,
      total: results.length,
    },
  )
}

function checkEvidenceManifest(args, loaded, report) {
  const manifest = readJson(args.evidenceManifest, 'evidence manifest', { required: false })
  if (!manifest) {
    addIssue(
      report,
      'blockers',
      'required-evidence-missing',
      'required evidence manifest is missing',
      { kind: 'evidence-manifest', path: args.evidenceManifest },
    )
    return
  }
  const candidateHash = sha256(args.candidate)
  if (manifest.schemaVersion !== 'pptx-nova-edit-evidence-manifest/v1') {
    addIssue(report, 'blockers', 'evidence-manifest-invalid', 'evidence manifest schema is invalid')
    return
  }
  if (
    reportedPath(manifest.candidate, dirname(args.evidenceManifest)) !== args.candidate ||
    manifest.candidate?.sha256 !== candidateHash
  ) {
    addIssue(
      report,
      'blockers',
      'evidence-manifest-candidate-mismatch',
      'evidence manifest does not bind the current candidate bytes',
    )
  }
  const entries = new Map((manifest.evidence ?? []).map((item) => [item.kind, item]))
  for (const kind of Object.keys(loaded).filter((item) => item !== 'dry-run')) {
    const path = evidencePath(args, kind)
    const entry = entries.get(kind)
    if (
      !entry ||
      reportedPath(entry, dirname(args.evidenceManifest)) !== path ||
      entry.sha256 !== sha256(path)
    ) {
      addIssue(
        report,
        'blockers',
        'evidence-manifest-artifact-mismatch',
        `${kind} evidence is not bound to the manifest`,
        { kind },
      )
    }
  }
}

function addIssue(report, list, code, message, details = {}) {
  report[list].push({ code, message, ...details })
}

function addCheck(report, name, status, details = {}) {
  report.checks.push({ name, status, ...details })
}

function selectorIdentity(target) {
  const shape = target?.selector?.shape ?? target?.selector ?? {}
  const resolved = target?.resolvedIdentity ?? {}
  return {
    slide: target?.slide,
    id: resolved?.id ?? shape?.id ?? null,
    name: resolved?.name ?? shape?.name ?? null,
  }
}

function hasStableIdentity(target) {
  const identity = selectorIdentity(target)
  return target?.kind === 'slide' || identity.id !== null || Boolean(identity.name)
}

function sameIdentity(actual, expected) {
  if (!actual || !expected) return false
  if (Number.isInteger(expected.slide) && actual.slide !== expected.slide) return false
  if (expected.id !== null && expected.id !== undefined && actual.id !== expected.id) return false
  if (expected.name && actual.name !== expected.name) return false
  return expected.id !== null || Boolean(expected.name) || Number.isInteger(expected.slide)
}

function resultIdentities(result) {
  const identities = []
  for (const item of result?.resolvedSelectors ?? []) {
    if (item?.resolved) identities.push(item.resolved)
  }
  for (const item of result?.semanticChanges ?? []) {
    if (item?.target) identities.push(item.target)
  }
  return identities
}

function targetCoverage(contract, dryRun, report) {
  const opResults = new Map(
    (Array.isArray(dryRun?.opResults) ? dryRun.opResults : [])
      .filter((item) => Number.isInteger(item?.opIndex))
      .map((item) => [item.opIndex, item]),
  )
  const coveredIdentities = []
  const coverage = []

  for (const target of contract.targets) {
    const expectedIdentity = selectorIdentity(target)
    const slideTarget = target.kind === 'slide'
    const results = target.opIndexes.map((opIndex) => opResults.get(opIndex)).filter(Boolean)
    const missingOps = target.opIndexes.filter((opIndex) => !opResults.has(opIndex))
    const failedOps = results
      .filter((item) => item.status !== 'success')
      .map((item) => item.opIndex)
    const identities = results.flatMap(resultIdentities)
    const matchingIdentities = slideTarget
      ? identities.filter((item) => item?.slide === target.slide)
      : identities.filter((item) => sameIdentity(item, expectedIdentity))
    const semanticChanges = results.flatMap((item) => item.semanticChanges ?? [])
    const expectedAfter = target.expected?.afterText
    const alreadyCompliant = target.expected?.alreadyCompliant === true
    const afterObserved =
      expectedAfter === undefined ||
      semanticChanges.some(
        (item) => item?.after === expectedAfter && sameIdentity(item?.target, expectedIdentity),
      ) ||
      (alreadyCompliant && semanticChanges.length === 0)
    const categories = [
      ...new Set(semanticChanges.map((item) => String(item?.category ?? '')).filter(Boolean)),
    ]
    const unexpectedCategories = categories.filter(
      (category) =>
        !contract.allowedChanges.includes(category) ||
        !(target.expected?.changeCategories ?? []).includes(category),
    )
    const covered =
      missingOps.length === 0 &&
      failedOps.length === 0 &&
      (slideTarget || matchingIdentities.length > 0) &&
      afterObserved &&
      unexpectedCategories.length === 0

    if (matchingIdentities.length > 0) {
      for (const identity of matchingIdentities) {
        if (!coveredIdentities.some((item) => sameIdentity(item, identity))) {
          coveredIdentities.push(identity)
        }
      }
    }
    coverage.push({
      id: target.id,
      slide: target.slide,
      opIndexes: target.opIndexes,
      covered,
      missingOps,
      failedOps,
      selectorMatchCount: matchingIdentities.length,
      expectedAfterObserved: afterObserved,
      alreadyCompliant,
      changeCategories: categories,
      unexpectedCategories,
      resolvedIdentities: matchingIdentities,
    })
  }

  const coveredCount = coverage.filter((item) => item.covered).length
  if (
    contract.coverage?.required !== false &&
    coveredCount !== contract.coverage.expectedTargetCount
  ) {
    addIssue(
      report,
      'blockers',
      'target-coverage-incomplete',
      `dry-run covered ${coveredCount} of ${contract.coverage.expectedTargetCount} required target(s)`,
      { coverage },
    )
  }
  if (
    coverage.some(
      (item) =>
        contract.targets.find((target) => target.id === item.id)?.kind !== 'slide' &&
        item.selectorMatchCount === 0 &&
        item.missingOps.length === 0,
    )
  ) {
    addIssue(
      report,
      'blockers',
      'selector-resolution-missing',
      'one or more target ops did not resolve to the contract selector',
    )
  }
  if (coverage.some((item) => !item.expectedAfterObserved)) {
    addIssue(
      report,
      'blockers',
      'expected-after-not-observed',
      'dry-run did not report the expected post-edit value for one or more targets',
    )
  }
  if (coverage.some((item) => item.unexpectedCategories.length > 0)) {
    addIssue(
      report,
      'blockers',
      'dry-run-change-category-outside-contract',
      'dry-run reported a change category not allowed by the contract',
    )
  }
  return { coverage, coveredCount, coveredIdentities }
}

function reliableShapeChanges(diff) {
  const changes = []
  for (const slide of diff?.slides ?? []) {
    for (const shape of slide?.shapeChanges ?? []) {
      if (shape?.reliability !== 'reliable' || shape?.conclusion === 'unchanged') continue
      changes.push({ slide: slide.index, shape })
    }
  }
  return changes
}

function diffIdentity(item) {
  const shape = item.shape?.candidate ?? item.shape?.source ?? {}
  return { slide: item.slide, id: shape.id ?? null, name: shape.name ?? null }
}

function diffCategories(item) {
  const nested = (item.shape?.changes ?? [])
    .filter((change) => change?.reliability === 'reliable')
    .map((change) => String(change?.category ?? ''))
    .filter(Boolean)
  if (nested.length > 0) return [...new Set(nested)]
  return [...new Set((item.shape?.categories ?? [item.shape?.category]).filter(Boolean))]
}

function checkDiff(contract, diff, coverageResult, report) {
  const coveredIdentities = coverageResult.coveredIdentities
  const outOfScope = []
  const disallowed = []
  const changes = reliableShapeChanges(diff)
  for (const item of changes) {
    const identity = diffIdentity(item)
    const categories = diffCategories(item)
    const structuralSlideMatch =
      contract.scope === 'structural' &&
      contract.expectedStructure?.changedSlides?.includes(item.slide)
    const targetMatch =
      structuralSlideMatch || coveredIdentities.some((target) => sameIdentity(identity, target))
    if (!targetMatch) outOfScope.push({ identity, categories })
    const outsideCategories = categories.filter(
      (category) => !contract.allowedChanges.includes(category),
    )
    if (outsideCategories.length > 0) disallowed.push({ identity, categories: outsideCategories })
  }
  if (
    contract.preserve.includes('slide-count') &&
    (diff?.summary?.sourceSlideCount !== diff?.summary?.candidateSlideCount ||
      Number(diff?.summary?.slideAdded ?? 0) !== 0 ||
      Number(diff?.summary?.slideRemoved ?? 0) !== 0)
  ) {
    addIssue(
      report,
      'blockers',
      'slide-count-changed',
      'semantic diff reports a slide-count change',
    )
  }
  if (outOfScope.length > 0) {
    addIssue(
      report,
      'blockers',
      'reliable-change-outside-contract',
      `${outOfScope.length} reliable shape change(s) fall outside the resolved contract targets`,
      { changes: outOfScope },
    )
  }
  if (disallowed.length > 0) {
    addIssue(
      report,
      'blockers',
      'reliable-change-category-outside-contract',
      `${disallowed.length} reliable shape change(s) use categories not allowed by the contract`,
      { changes: disallowed },
    )
  }
  for (const target of contract.targets) {
    const targetCoverageItem = coverageResult.coverage.find((item) => item.id === target.id)
    const expectedIdentities =
      targetCoverageItem?.resolvedIdentities?.length > 0
        ? targetCoverageItem.resolvedIdentities
        : [selectorIdentity(target)]
    const change = changes.find((item) =>
      expectedIdentities.some((identity) => sameIdentity(diffIdentity(item), identity)),
    )
    if (target.expected?.alreadyCompliant === true && !change) continue
    const before = change?.shape?.source?.textPreview ?? change?.shape?.changes?.[0]?.before
    const after = change?.shape?.candidate?.textPreview ?? change?.shape?.changes?.[0]?.after
    if (target.expected?.beforeText !== undefined && before !== target.expected.beforeText) {
      addIssue(
        report,
        'blockers',
        'expected-before-not-observed',
        `semantic diff source text does not match contract target ${target.id}`,
        { targetId: target.id, expected: target.expected.beforeText, actual: before ?? null },
      )
    }
    if (target.expected?.afterText !== undefined && after !== target.expected.afterText) {
      addIssue(
        report,
        'blockers',
        'expected-final-change-not-observed',
        `semantic diff candidate text does not match contract target ${target.id}`,
        { targetId: target.id, expected: target.expected.afterText, actual: after ?? null },
      )
    }
  }
  const uncertain = Number(diff?.summary?.uncertainChanges ?? 0)
  const unsupported = Number(diff?.summary?.unsupportedRegions ?? 0)
  if (uncertain > 0 || unsupported > 0) {
    addIssue(
      report,
      'attention',
      'semantic-diff-review-signals',
      'semantic diff contains uncertain or unsupported regions; scoped visual evidence remains required',
      { uncertainChanges: uncertain, unsupportedRegions: unsupported },
    )
  }
  return { reliableChanges: changes, outOfScope, disallowed }
}

function checkDeclaredOps(contract, dryRun, report) {
  const declared = new Set(contract.targets.flatMap((target) => target.opIndexes ?? []))
  const extra = (dryRun?.opResults ?? [])
    .map((item) => item?.opIndex)
    .filter((opIndex) => Number.isInteger(opIndex) && !declared.has(opIndex))
  if (extra.length > 0) {
    addIssue(
      report,
      'blockers',
      'dry-run-op-outside-contract',
      'dry-run contains patch operations that are not owned by any contract target',
      { opIndexes: [...new Set(extra)] },
    )
  }
}

function changedSlides(diff) {
  return [
    ...new Set(
      (diff?.slides ?? [])
        .filter((slide) => slide?.conclusion !== 'unchanged')
        .map((slide) => slide.index),
    ),
  ].sort((a, b) => a - b)
}

function checkExpectedStructure(contract, diff, report) {
  const expected = contract.expectedStructure
  if (!expected) return
  const actualDelta =
    Number(diff?.summary?.candidateSlideCount ?? 0) - Number(diff?.summary?.sourceSlideCount ?? 0)
  const actualSlides = changedSlides(diff)
  const expectedSlides = [...expected.changedSlides].sort((a, b) => a - b)
  if (actualDelta !== expected.slideCountDelta) {
    addIssue(
      report,
      'blockers',
      'structural-slide-delta-mismatch',
      'semantic diff slide-count delta does not match the structural contract',
      { expected: expected.slideCountDelta, actual: actualDelta },
    )
  }
  if (JSON.stringify(actualSlides) !== JSON.stringify(expectedSlides)) {
    addIssue(
      report,
      'blockers',
      'structural-changed-slides-mismatch',
      'semantic diff changed slides do not match the structural contract',
      { expected: expectedSlides, actual: actualSlides },
    )
  }
  if (expected.objectTypes.length > 0) {
    const actualTypes = new Set(
      reliableShapeChanges(diff)
        .flatMap((item) => [item.shape?.source?.shapeType, item.shape?.candidate?.shapeType])
        .filter(Boolean),
    )
    const unexpected = [...actualTypes].filter((type) => !expected.objectTypes.includes(type))
    if (unexpected.length > 0) {
      addIssue(
        report,
        'blockers',
        'structural-object-type-outside-contract',
        'semantic diff contains object types outside the structural contract',
        { objectTypes: unexpected },
      )
    }
  }
}

function findInspectedShape(inspect, target) {
  const slide = (inspect?.slides ?? []).find((item) => item?.index === target.slide)
  const identity = selectorIdentity(target)
  return (slide?.shapes ?? []).find(
    (shape) =>
      (identity.id !== null && shape?.id === identity.id) ||
      (identity.name && shape?.name === identity.name),
  )
}

function checkAlreadyCompliant(contract, finalInspect, report) {
  for (const target of contract.targets.filter(
    (item) => item.expected?.alreadyCompliant === true,
  )) {
    const shape = findInspectedShape(finalInspect, target)
    const actual = shape?.textPreview ?? shape?.text
    if (!shape || actual !== target.expected.afterText) {
      addIssue(
        report,
        'blockers',
        'already-compliant-value-not-observed',
        `final inspect does not prove the declared already-compliant value for ${target.id}`,
        { targetId: target.id, expected: target.expected.afterText, actual: actual ?? null },
      )
    }
  }
}

function targetSlides1Based(contract) {
  return [...new Set(contract.targets.map((target) => target.slide + 1))].sort((a, b) => a - b)
}

function containsAll(actual, expected) {
  const values = new Set((actual ?? []).map(Number))
  return expected.every((item) => values.has(item))
}

function reportedPath(value, workspace) {
  const raw = typeof value === 'string' ? value : value?.path
  if (!raw) return ''
  return resolve(workspace || '.', raw)
}

function evidenceBindings(kind, evidence) {
  if (kind === 'dry-run') return { source: evidence?.input, candidate: evidence?.wouldWrite }
  if (kind === 'semantic-diff' || kind === 'style-diff' || kind === 'vision-diff') {
    return { source: evidence?.source, candidate: evidence?.candidate }
  }
  if (kind === 'png-preview') return { candidate: evidence?.input }
  if (kind === 'vision-check' || kind === 'final-inspect') return { candidate: evidence?.input }
  return {}
}

function evidencePath(args, kind) {
  return {
    'dry-run': args.dryRun,
    'semantic-diff': args.diff,
    'style-diff': args.styleDiff,
    'png-preview': args.preview,
    'vision-check': args.vision,
    'vision-diff': args.visionDiff,
    'final-inspect': args.finalInspect,
    'structure-check': args.structureCheck,
  }[kind]
}

function checkEvidenceBindings(contract, args, loaded, report) {
  const workspace = contract.workspace || dirname(args.contract)
  const source = resolve(contract.source.pptx)
  const candidate = args.candidate
  for (const [kind, evidence] of Object.entries(loaded)) {
    const bindings = evidenceBindings(kind, evidence)
    if (bindings.source) {
      const actual = reportedPath(bindings.source, workspace)
      if (actual !== source) {
        addIssue(
          report,
          'blockers',
          'evidence-source-mismatch',
          `${kind} evidence was generated from a different source PPTX`,
          { kind, expected: source, actual },
        )
      }
    }
    if (bindings.candidate) {
      const actual = reportedPath(bindings.candidate, workspace)
      if (actual !== candidate) {
        addIssue(
          report,
          'blockers',
          'evidence-candidate-mismatch',
          `${kind} evidence was generated for a different candidate PPTX`,
          { kind, expected: candidate, actual },
        )
      }
    }
    const artifactPath = evidencePath(args, kind)
    if (
      kind !== 'dry-run' &&
      artifactPath &&
      statSync(artifactPath).mtimeMs < statSync(candidate).mtimeMs
    ) {
      addIssue(
        report,
        'blockers',
        'evidence-candidate-stale',
        `${kind} evidence is older than the current candidate bytes`,
        { kind },
      )
    }
  }
}

function checkEvidence(contract, args, report) {
  const expectedSlides = targetSlides1Based(contract)
  const loaded = {}
  for (const kind of contract.requiredEvidence) {
    const path = evidencePath(args, kind)
    if (!path || !existsSync(path)) {
      addIssue(
        report,
        'blockers',
        'required-evidence-missing',
        `required ${kind} evidence is missing`,
        {
          kind,
          path: path ?? null,
        },
      )
      continue
    }
    loaded[kind] = readJson(path, `${kind} evidence`)
  }

  const dryRun = loaded['dry-run']
  if (dryRun && (dryRun.schemaVersion !== 'pptx-dry-run/v1' || dryRun.status !== 'success')) {
    addIssue(report, 'blockers', 'dry-run-not-successful', 'dry-run evidence is not successful')
  } else if (dryRun && !Array.isArray(dryRun.semanticIssues)) {
    addIssue(
      report,
      'blockers',
      'dry-run-semantic-evidence-missing',
      'dry-run semanticIssues evidence is missing or malformed',
    )
  } else if (dryRun && dryRun.semanticIssues.length > 0) {
    addIssue(
      report,
      'blockers',
      'dry-run-semantic-regression',
      'dry-run introduced semantic regressions',
      { semanticIssueCount: dryRun.semanticIssues.length },
    )
  }
  const diff = loaded['semantic-diff']
  if (diff && (diff.schemaVersion !== 'pptx-diff/v1' || diff.status !== 'success')) {
    addIssue(
      report,
      'blockers',
      'semantic-diff-not-successful',
      'semantic diff evidence is not successful',
    )
  }
  const styleDiff = loaded['style-diff']
  if (styleDiff) {
    const stylePassed =
      styleDiff.schemaVersion === 'pptx-i18n-style-diff/v1' &&
      styleDiff.status === 'pass' &&
      styleDiff.agentGate?.passed === true &&
      Number(styleDiff.agentGate?.styleBlockerCount ?? styleDiff.styleBlockers?.length ?? 0) === 0
    if (!stylePassed) {
      addIssue(
        report,
        'blockers',
        'target-text-style-changed',
        'text edit changed the target OOXML style signature; use a run/text-node preserving edit path',
        {
          styleBlockerCount: Number(
            styleDiff.agentGate?.styleBlockerCount ?? styleDiff.styleBlockers?.length ?? 0,
          ),
        },
      )
    }
  }
  const preview = loaded['png-preview']
  if (preview) {
    const selected =
      preview.slidesSelected ?? preview.pages?.map((page) => page.slide ?? page.index)
    const pagesHealthy = (preview.pages ?? []).every(
      (page) =>
        (page.file?.status ?? page.status) === 'ok' && Number(page.file?.byteLength ?? 1) > 0,
    )
    if (preview.schemaVersion !== 'pptx-preview/v1' || preview.status !== 'success') {
      addIssue(
        report,
        'blockers',
        'preview-not-successful',
        'PNG preview evidence is not successful',
      )
    } else if (!containsAll(selected, expectedSlides) || !pagesHealthy) {
      addIssue(
        report,
        'blockers',
        'preview-scope-incomplete',
        'PNG preview does not cover every contract target slide with a healthy page artifact',
        { expectedSlides, selectedSlides: selected ?? [] },
      )
    }
  }
  const vision = loaded['vision-check']
  if (vision) {
    const selected = vision.scope?.slides
    if (vision.schemaVersion !== 'pptx-vision/v1' || vision.status !== 'success') {
      addIssue(
        report,
        'blockers',
        'vision-not-successful',
        'vision-check evidence is not successful',
      )
    } else if (!containsAll(selected, expectedSlides)) {
      addIssue(
        report,
        'blockers',
        'vision-scope-incomplete',
        'vision-check does not cover every contract target slide',
        { expectedSlides, selectedSlides: selected ?? [] },
      )
    }
  }
  const visionDiff = loaded['vision-diff']
  if (visionDiff) {
    const selected = visionDiff.scope?.slides
    const newHigh = Number(
      visionDiff.agentGate?.newHighIssues ?? visionDiff.summary?.byClass?.new?.high ?? 0,
    )
    const newMedium = Number(
      visionDiff.agentGate?.newMediumIssues ?? visionDiff.summary?.byClass?.new?.medium ?? 0,
    )
    const worsenedHigh = Number(
      visionDiff.agentGate?.worsenedHighIssues ?? visionDiff.summary?.byClass?.worsened?.high ?? 0,
    )
    const worsenedMedium = Number(
      visionDiff.agentGate?.worsenedMediumIssues ??
        visionDiff.summary?.byClass?.worsened?.medium ??
        0,
    )
    if (visionDiff.schemaVersion !== 'pptx-vision-diff/v1' || visionDiff.status !== 'success') {
      addIssue(
        report,
        'blockers',
        'vision-diff-not-successful',
        'vision-diff evidence is not successful',
      )
    } else if (!containsAll(selected, expectedSlides)) {
      addIssue(
        report,
        'blockers',
        'vision-diff-scope-incomplete',
        'vision-diff does not cover every contract target slide',
        { expectedSlides, selectedSlides: selected ?? [] },
      )
    } else if (
      visionDiff.agentGate?.passed !== true ||
      newHigh > 0 ||
      newMedium > 0 ||
      worsenedHigh > 0 ||
      worsenedMedium > 0
    ) {
      addIssue(
        report,
        'blockers',
        'vision-diff-new-regression',
        'candidate introduces or worsens high/medium visual issues on the changed scope',
        { newHigh, newMedium, worsenedHigh, worsenedMedium },
      )
    }
  }
  const finalInspect = loaded['final-inspect']
  if (finalInspect && finalInspect.status !== 'success') {
    addIssue(
      report,
      'blockers',
      'final-inspect-not-successful',
      'final inspect evidence is not successful',
    )
  }
  if (finalInspect?.status === 'success') checkAlreadyCompliant(contract, finalInspect, report)
  const structure = loaded['structure-check']
  if (structure && structure.status !== 'pass') {
    addIssue(
      report,
      'blockers',
      'structure-check-not-passing',
      'structure check evidence did not pass',
    )
  }
  return loaded
}

function nextAction(report) {
  const codes = new Set(report.blockers.map((item) => item.code))
  if (codes.has('source-hash-stale') || codes.has('source-missing')) return 'refresh-inspect'
  if (codes.has('session-rules-binding-stale')) return 'refresh-session-rules-resolution'
  if (
    codes.has('session-rule-postcondition-failed') ||
    codes.has('session-rule-candidate-inspection-failed')
  ) {
    return 'apply-session-rules'
  }
  if (codes.has('expected-before-not-observed')) return 'refresh-inspect'
  if (codes.has('already-compliant-value-not-observed')) return 'complete-missing-coverage'
  if (codes.has('evidence-source-mismatch') || codes.has('evidence-candidate-mismatch')) {
    return 'regenerate-current-candidate-evidence'
  }
  if (
    codes.has('evidence-manifest-candidate-mismatch') ||
    codes.has('evidence-manifest-artifact-mismatch') ||
    codes.has('evidence-manifest-invalid')
  ) {
    return 'regenerate-current-candidate-evidence'
  }
  if (codes.has('evidence-candidate-stale')) return 'regenerate-current-candidate-evidence'
  if (codes.has('dry-run-not-successful')) return 'retry-dry-run-with-fix-patch'
  if (codes.has('target-text-style-changed')) return 'retry-with-style-preserving-text-edit'
  if (codes.has('vision-diff-new-regression')) return 'repair-new-visual-regressions'
  if (codes.has('selector-resolution-missing')) return 'rebind-selectors'
  if (
    codes.has('target-coverage-incomplete') ||
    codes.has('expected-after-not-observed') ||
    codes.has('expected-final-change-not-observed')
  ) {
    return 'complete-missing-coverage'
  }
  if (
    codes.has('reliable-change-outside-contract') ||
    codes.has('reliable-change-category-outside-contract') ||
    codes.has('slide-count-changed') ||
    codes.has('dry-run-op-outside-contract') ||
    codes.has('structural-slide-delta-mismatch') ||
    codes.has('structural-changed-slides-mismatch') ||
    codes.has('structural-object-type-outside-contract')
  ) {
    return 'review-out-of-scope-changes'
  }
  if (
    codes.has('required-evidence-missing') ||
    codes.has('preview-scope-incomplete') ||
    codes.has('vision-scope-incomplete') ||
    codes.has('vision-diff-scope-incomplete') ||
    codes.has('preview-not-successful') ||
    codes.has('vision-not-successful') ||
    codes.has('vision-diff-not-successful')
  ) {
    return 'verify-changed-scope'
  }
  if (codes.has('structure-check-not-passing')) return 'run-structure-audit'
  if (report.blockers.length > 0) return 'block-and-request-user-decision'
  return 'publish'
}

function buildReport(args) {
  const contract = readJson(args.contract, 'contract')
  if (contract.schemaVersion !== CONTRACT_SCHEMA_VERSION) {
    throw new Error(`contract schemaVersion must be ${CONTRACT_SCHEMA_VERSION}`)
  }
  if (!Array.isArray(contract.targets) || contract.targets.length === 0) {
    throw new Error('contract must contain targets[]')
  }
  if (contract.targets.some((target) => !hasStableIdentity(target))) {
    throw new Error('every object target must contain a stable resolvedIdentity id/name')
  }
  if (
    contract.targets.some((target) => target.kind === 'slide') &&
    contract.scope !== 'structural'
  ) {
    throw new Error('slide targets are only valid for structural scope')
  }
  if (!Array.isArray(contract.allowedChanges) || !Array.isArray(contract.preserve)) {
    throw new Error('contract allowedChanges/preserve arrays are required')
  }
  const report = {
    schemaVersion: SCHEMA_VERSION,
    observedAt: new Date().toISOString(),
    status: 'pass',
    contract: args.contract,
    candidate: {
      pptx: args.candidate,
      sha256: sha256(args.candidate),
      byteLength: readFileSync(args.candidate).length,
    },
    source: contract.source ?? null,
    artifacts: {
      dryRun: args.dryRun,
      semanticDiff: args.diff,
      styleDiff: args.styleDiff,
      preview: args.preview,
      vision: args.vision,
      visionDiff: args.visionDiff,
      evidenceManifest: args.evidenceManifest,
      finalInspect: args.finalInspect,
      structureCheck: args.structureCheck,
    },
    checks: [],
    targetCoverage: [],
    reliableChanges: [],
    blockers: [],
    attention: [],
    sessionRuleResults: [],
    summary: {
      targetCount: contract.targets.length,
      expectedTargetCount: contract.coverage?.expectedTargetCount ?? contract.targets.length,
      coveredTargetCount: 0,
      reliableShapeChangeCount: 0,
      outOfScopeReliableChangeCount: 0,
      blockerCount: 0,
      attentionCount: 0,
    },
  }

  const sourcePath = contract.source?.pptx ? resolve(contract.source.pptx) : ''
  const sessionResolution = checkSessionRulesBinding(contract, report)
  if (!sourcePath || !existsSync(sourcePath)) {
    addIssue(report, 'blockers', 'source-missing', 'contract source PPTX is missing', {
      path: sourcePath || null,
    })
    addCheck(report, 'source-freshness', 'fail')
  } else {
    const currentHash = sha256(sourcePath)
    const fresh = currentHash === contract.source?.sha256
    addCheck(report, 'source-freshness', fresh ? 'pass' : 'fail', {
      expectedSha256: contract.source?.sha256 ?? null,
      actualSha256: currentHash,
    })
    if (!fresh) {
      addIssue(
        report,
        'blockers',
        'source-hash-stale',
        'source PPTX changed after the edit contract was created; refresh inspect/select and rebuild the contract',
      )
    }
  }

  const evidence = checkEvidence(contract, args, report)
  checkEvidenceManifest(args, evidence, report)
  checkEvidenceBindings(contract, args, evidence, report)
  checkSessionRulePostconditions(
    contract,
    args,
    sessionResolution,
    evidence['final-inspect'],
    report,
  )
  const dryRun = evidence['dry-run']
  let coverageResult = { coverage: [], coveredCount: 0, coveredIdentities: [] }
  if (dryRun?.schemaVersion === 'pptx-dry-run/v1' && dryRun.status === 'success') {
    checkDeclaredOps(contract, dryRun, report)
    coverageResult = targetCoverage(contract, dryRun, report)
    report.targetCoverage = coverageResult.coverage
    addCheck(
      report,
      'target-coverage',
      coverageResult.coveredCount === report.summary.expectedTargetCount ? 'pass' : 'fail',
      { covered: coverageResult.coveredCount, expected: report.summary.expectedTargetCount },
    )
  }

  const diff = evidence['semantic-diff']
  if (diff?.schemaVersion === 'pptx-diff/v1' && diff.status === 'success') {
    checkExpectedStructure(contract, diff, report)
    const diffResult = checkDiff(contract, diff, coverageResult, report)
    report.reliableChanges = diffResult.reliableChanges
    report.summary.reliableShapeChangeCount = diffResult.reliableChanges.length
    report.summary.outOfScopeReliableChangeCount = diffResult.outOfScope.length
    addCheck(
      report,
      'semantic-diff-locality',
      diffResult.outOfScope.length === 0 ? 'pass' : 'fail',
      {
        reliableShapeChanges: diffResult.reliableChanges.length,
        outOfScope: diffResult.outOfScope.length,
      },
    )
  }

  report.summary.coveredTargetCount = coverageResult.coveredCount
  report.summary.blockerCount = report.blockers.length
  report.summary.attentionCount = report.attention.length
  report.status = report.blockers.length === 0 ? 'pass' : 'fail'
  report.agentGate = {
    schemaVersion: 'pptx-nova-agent-gate/v1',
    passed: report.status === 'pass',
    canContinue: report.status === 'pass',
    nextAction: nextAction(report),
    scope: targetSlides1Based(contract).join(','),
    blockerCount: report.blockers.length,
    attentionCount: report.attention.length,
    message:
      report.status === 'pass'
        ? `Edit contract passed for ${coverageResult.coveredCount} target(s); required evidence covers the changed scope.`
        : `Edit contract failed with ${report.blockers.length} blocker(s); next action: ${nextAction(report)}.`,
  }
  return report
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const report = buildReport(args)
  writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`)
  if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else {
    process.stdout.write(`Edit contract gate: ${report.status}\n`)
    process.stdout.write(`${report.agentGate.message}\n`)
  }
  if (args.strict && report.status !== 'pass') process.exit(2)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
