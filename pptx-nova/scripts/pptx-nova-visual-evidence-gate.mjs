#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-visual-evidence-gate.mjs --manifest <path> [options]

Options:
  --manifest <path>  Canonical pptx-visual-evidence/v1 manifest.
  --output <path>    Optional persisted gate report.
  --json             Print the gate report as JSON.
  --help             Show this help.

Exit status:
  0  manifest.decision.action is proceed
  2  invalid command arguments
  3  invalid or inconsistent evidence manifest
  4  manifest.decision.action is stop
  5  manifest.decision.action requires human confirmation
`

const actions = new Set(['proceed', 'stop', 'require-human-confirmation'])
const outcomes = new Set(['pass', 'fail', 'skipped', 'inconclusive'])
const checkRegistry = [
  'input-integrity',
  'static-layout',
  'pdf-final-layout',
  'pdfium-raster',
  'pixel-diff',
  'ocr-overflow',
  'font-resolution',
  'region-attribution',
  'independent-reference',
  'policy',
]
const assurancesByAction = {
  proceed: new Set(['same-renderer-regression']),
  stop: new Set(['content-blocked']),
  'require-human-confirmation': new Set([
    'candidate-only',
    'environment-dependent',
    'same-renderer-change-detected',
  ]),
}
const policyOutcomeByAction = {
  proceed: 'pass',
  stop: 'fail',
  'require-human-confirmation': 'inconclusive',
}

function parseArgs(argv) {
  const args = { manifest: '', output: '', json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--manifest' || arg === '--output') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      args[arg.slice(2)] = value
      index += 1
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }
  if (!args.manifest) throw new Error('--manifest is required')
  return args
}

function readManifest(path) {
  const resolved = resolve(path)
  if (!existsSync(resolved)) throw new Error(`visual evidence manifest does not exist: ${resolved}`)
  try {
    return { path: resolved, value: JSON.parse(readFileSync(resolved, 'utf8')) }
  } catch (error) {
    throw new Error(`visual evidence manifest is not valid JSON: ${error.message}`)
  }
}

function validateManifest(manifest) {
  const errors = []
  if (manifest?.schemaVersion !== 'pptx-visual-evidence/v1') {
    errors.push('schemaVersion must be pptx-visual-evidence/v1')
  }
  if (manifest?.status !== 'success') errors.push('status must be success')
  if (!Array.isArray(manifest?.checks) || manifest.checks.length === 0) {
    errors.push('checks must be a non-empty array')
  }
  const checks = new Map()
  for (const check of Array.isArray(manifest?.checks) ? manifest.checks : []) {
    if (!check || typeof check.id !== 'string' || !check.id) {
      errors.push('every check must have a non-empty id')
      continue
    }
    if (checks.has(check.id)) errors.push(`duplicate check id: ${check.id}`)
    checks.set(check.id, check)
    if (!outcomes.has(check.outcome)) {
      errors.push(`check ${check.id} has invalid outcome: ${String(check.outcome)}`)
    }
    if (check.required === true && check.outcome === 'skipped') {
      errors.push(`required check ${check.id} cannot be skipped`)
    }
  }
  const actualRegistry = Array.isArray(manifest?.checks)
    ? manifest.checks.map((check) => check?.id ?? null)
    : []
  if (JSON.stringify(actualRegistry) !== JSON.stringify(checkRegistry)) {
    errors.push(
      `check registry must exactly match pptx-visual-evidence/v1: ${checkRegistry.join(', ')}`,
    )
  }

  const action = manifest?.decision?.action
  const assurance = manifest?.decision?.assurance
  if (!actions.has(action)) errors.push(`decision.action is invalid: ${String(action)}`)
  if (!assurancesByAction[action]?.has(assurance)) {
    errors.push(
      `decision assurance ${String(assurance)} is inconsistent with action ${String(action)}`,
    )
  }
  const policy = checks.get('policy')
  if (policy && policy.outcome !== policyOutcomeByAction[action]) {
    errors.push(
      `policy outcome ${String(policy.outcome)} is inconsistent with action ${String(action)}`,
    )
  }
  const requiredEvidenceChecks = [...checks.values()].filter(
    (check) => check.required === true && check.id !== 'policy',
  )
  if (action === 'stop' && !requiredEvidenceChecks.some((check) => check.outcome === 'fail')) {
    errors.push('stop requires at least one failed required evidence check')
  }
  if (action === 'proceed' && requiredEvidenceChecks.some((check) => check.outcome !== 'pass')) {
    errors.push('proceed requires every required check to pass')
  }
  return errors
}

function gateReport(manifestPath, manifest, errors) {
  const action = manifest?.decision?.action ?? null
  const status =
    errors.length > 0
      ? 'invalid'
      : action === 'proceed'
        ? 'passed'
        : action === 'stop'
          ? 'blocked'
          : 'review-required'
  return {
    schemaVersion: 'pptx-nova-visual-evidence-gate/v1',
    status,
    deliveryAuthorized: status === 'passed',
    manifest: manifestPath,
    decision: manifest?.decision ?? null,
    errors,
  }
}

function writeReport(args, report) {
  const text = `${JSON.stringify(report, null, 2)}\n`
  if (args.output) writeFileSync(resolve(args.output), text)
  if (args.json) process.stdout.write(text)
  else {
    process.stdout.write(`Visual evidence gate: ${report.status}\n`)
    process.stdout.write(`Action: ${report.decision?.action ?? 'invalid'}\n`)
  }
}

try {
  const args = parseArgs(process.argv.slice(2))
  const { path, value: manifest } = readManifest(args.manifest)
  const errors = validateManifest(manifest)
  const report = gateReport(path, manifest, errors)
  writeReport(args, report)
  if (errors.length > 0) process.exit(3)
  if (manifest.decision.action === 'stop') process.exit(4)
  if (manifest.decision.action === 'require-human-confirmation') process.exit(5)
} catch (error) {
  console.error(`[error] ${error.message}`)
  process.exit(2)
}
