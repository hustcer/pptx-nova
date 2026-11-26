#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'

const reportVersions = {
  verify: 'xdoc-cli-license-verification/v1',
  install: 'xdoc-cli-auth-install/v1',
  status: 'xdoc-cli-auth-status/v1',
  'reset-clock': 'xdoc-cli-auth-reset-clock/v1',
  uninstall: 'xdoc-cli-auth-uninstall/v1',
}

const oneOf =
  (...values) =>
  (value) =>
    values.includes(value)
const nullable = (check) => (value) => value === null || check(value)
const digest = (value) =>
  typeof value === 'string' && value.length === 64 && /^[a-f0-9]{64}$/.test(value)
const timestamp = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
function absolutePath(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) return false
  return ![...value].some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
}
const integer = (value) => Number.isSafeInteger(value) && value >= 0
const bool = (value) => typeof value === 'boolean'

const reasons = new Set([
  'ok',
  'config_path_invalid',
  'clock_anomaly',
  'credential_revoked',
  'device_pop_failed',
  'authorization_contract_invalid',
  'auth_config_invalid',
  'auth_storage_unavailable',
  'auth_install_failed',
  'auth_install_outcome_uncertain',
  'auth_uninstall_failed',
  'auth_uninstall_outcome_uncertain',
  'auth_clock_reset_failed',
  'auth_clock_reset_outcome_uncertain',
  'auth_clock_reset_unsupported',
  'cli_clock_input_invalid',
  'cli_clock_tolerance_unsupported',
  ...[
    'clock_invalid',
    'envelope_invalid',
    'expired',
    'file_read_failed',
    'json_invalid',
    'key_not_found',
    'kind_unsupported',
    'payload_invalid',
    'schema_unsupported',
    'signature_invalid',
    'too_large',
  ].map((code) => `cli_license_${code}`),
  'revocation_receipt_binding_mismatch',
  'revocation_receipt_envelope_invalid',
  'revocation_receipt_json_invalid',
  'revocation_receipt_key_not_found',
  'revocation_receipt_payload_invalid',
  'revocation_receipt_schema_unsupported',
  'revocation_receipt_signature_invalid',
  'revocation_receipt_target_unsupported',
  'revocation_receipt_too_large',
])
const reason = nullable((value) => reasons.has(value))

const licenseFacts = {
  issuedAt: timestamp,
  expiresAt: timestamp,
  deviceBound: bool,
  licenseKind: oneOf('offline-license', 'org-ci-license'),
  capabilities: {
    allowCI: bool,
    allowSharedServer: bool,
    allowServiceUse: bool,
    repairTrialProvenance: bool,
    maxConcurrency: nullable(integer),
    maxBatchSize: nullable(integer),
  },
}

const entitlement = {
  enabled: bool,
  watermark: bool,
  maxTotalInputBytes: nullable(integer),
  maxSlides: nullable(integer),
  trial: bool,
}

const reportFields = {
  status: oneOf('success', 'error'),
  outcome: oneOf(
    'passed',
    'failed',
    'installed',
    'uncertain',
    'removed',
    'not-installed',
    'reset',
    'already-missing',
  ),
  reason,
  verifiedAtUnixMs: integer,
  evaluatedAtUnixMs: nullable(integer),
  error: { code: reason },
  health: oneOf('healthy', 'unhealthy', 'not-installed'),
  installedSha256: digest,
  attemptedSha256: nullable(digest),
  publication: oneOf('not-published', 'uncertain'),
  source: {
    kind: oneOf('config-path', 'platform-default', 'none'),
    sha256: nullable(digest),
  },
  trustedFacts: {
    ...licenseFacts,
    entitlements: {
      create: entitlement,
      modify: entitlement,
      convert: entitlement,
      refurbish: entitlement,
      translate: entitlement,
    },
  },
  authenticatedFacts: licenseFacts,
  verification: {
    state: oneOf('verified', 'invalid', 'not-installed'),
    reason,
    authenticatedFacts: licenseFacts,
  },
  admission: { state: oneOf('admitted', 'rejected', 'not-applicable'), reason },
  taskAuthorization: oneOf('not-evaluated'),
  clock: {
    state: oneOf('ready', 'unavailable'),
    reason,
    anchorTrust: oneOf(
      'development-ephemeral',
      'unauthenticated-file',
      'authenticated',
      'unavailable',
    ),
    systemNowUnixMs: nullable(integer),
    lastSeenUnixMs: nullable(integer),
    rollbackToleranceMs: integer,
  },
}

function project(raw, fields) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const output = {}
  for (const [key, rule] of Object.entries(fields)) {
    if (!Object.hasOwn(raw, key)) continue
    const value = raw[key]
    if (typeof rule === 'function') {
      if (rule(value)) output[key] = value
    } else {
      const selected = project(value, rule)
      if (selected) output[key] = selected
    }
  }
  return Object.keys(output).length ? output : undefined
}

function pathFingerprints(raw, fields) {
  const output = {}
  for (const field of fields) {
    const value = raw[field]
    if (value === null) output[`${field}Sha256`] = null
    else if (absolutePath(value)) {
      output[`${field}Sha256`] = createHash('sha256').update(value).digest('hex')
    }
  }
  return output
}

function readReport(stdout, version) {
  // Parse errors can include slices of stdout. Keep the unfiltered report private.
  try {
    const raw = JSON.parse(stdout)
    if (raw?.schemaVersion !== version || !reportFields.status(raw.status)) return null
    const report = {
      schemaVersion: version,
      ...project(raw, reportFields),
      ...pathFingerprints(raw, ['path', 'configDirectory', 'installedPath', 'targetPath']),
    }
    if (report.source) Object.assign(report.source, pathFingerprints(raw.source, ['path']))
    return report
  } catch {
    return null
  }
}

function runXdoc(args, stdout = 'pipe') {
  return spawnSync(process.env.XDOC_BIN || 'xdoc', args, {
    encoding: 'utf8',
    stdio: ['ignore', stdout, 'ignore'],
    windowsHide: true,
  })
}

function finish(action, result, report, diagnostic) {
  const exitCode = result.status
  const output = { action, exitCode, report }
  if (result.error || result.signal) output.diagnostic = 'process_failed'
  else if (diagnostic) output.diagnostic = diagnostic
  else if (!report) output.diagnostic = 'no_structured_report'
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
  if (exitCode === 0 && output.diagnostic) return 1
  return exitCode ?? 1
}

const authorizationReason = oneOf(
  'capability_unsatisfied',
  'fallback_declined',
  'no_executable_mode',
  'restricted_by_policy',
  'restriction_policy_invalid',
  'strict_mode_unsatisfied',
)
const conversionErrorKind = oneOf(
  'authorization_denied',
  'input_error',
  'input_read_failed',
  'parse_failed',
  'output_exists',
  'output_failed',
  'pdf_generation_failed',
  'dependency_missing',
)

const conversionItem = {
  status: oneOf('succeeded', 'failed', 'skipped'),
  error: {
    kind: (value) => reasons.has(value) || authorizationReason(value) || conversionErrorKind(value),
    stage: oneOf('authorization', 'input', 'parse', 'output', 'render', 'pdf', 'batch'),
    details: {
      reason: (value) => reasons.has(value) || authorizationReason(value),
    },
  },
}

function conversionReport(reportPath, output) {
  try {
    const raw = JSON.parse(readFileSync(reportPath, 'utf8'))
    if (raw?.schemaVersion !== 'batch/v1' || !Array.isArray(raw.items) || raw.items.length !== 1) {
      return null
    }
    const item = project(raw.items[0], conversionItem)
    if (!item?.status) return null
    const written = statSync(output, { throwIfNoEntry: false })
    return {
      schemaVersion: 'batch/v1',
      ...item,
      outputWritten: !!written?.isFile() && written.size > 0,
    }
  } catch {
    return null
  }
}

function isSinglePptx(input) {
  if (!absolutePath(input) || !/\.pptx$/i.test(input) || /[*?]/.test(input)) return false
  try {
    return statSync(input, { throwIfNoEntry: false })?.isFile() === true
  } catch {
    return false
  }
}

function checkConversion([strict, input, output, license, ...extra]) {
  if (
    !['--require-unwatermarked', '--require-entitlement'].includes(strict) ||
    !isSinglePptx(input) ||
    !absolutePath(output) ||
    (license !== undefined && !absolutePath(license)) ||
    extra.length ||
    existsSync(output)
  ) {
    process.stderr.write(
      'Usage: auth-report.mjs check-convert --require-unwatermarked|--require-entitlement <absolute-input> <new-absolute-output> [absolute-license-path]\n',
    )
    return 2
  }
  let runDir
  let result = { status: null, error: true }
  let report = null
  let diagnostic
  try {
    runDir = mkdtempSync(join(tmpdir(), 'pptx-nova-auth-'))
    const reportPath = join(runDir, 'batch.json')
    const args = ['convert', '--to', 'pdf', '--output', output, strict, '--report', reportPath]
    if (license) args.push('--license', license)
    args.push('--', input)
    result = runXdoc(args, 'ignore')
    if (!result.error) report = conversionReport(reportPath, output)
  } catch {
    diagnostic = 'process_failed'
  } finally {
    if (runDir) {
      try {
        rmSync(runDir, { recursive: true, force: true })
      } catch {
        diagnostic = 'temporary_report_cleanup_failed'
      }
    }
  }
  if (
    !diagnostic &&
    result.status === 0 &&
    report &&
    (report.status !== 'succeeded' || !report.outputWritten)
  ) {
    diagnostic = 'conversion_unverified'
  }
  return finish('check-convert', result, report, diagnostic)
}

function main([action, file, ...extra]) {
  if (action === 'check-convert') return checkConversion([file, ...extra])
  const validAction = Object.hasOwn(reportVersions, action)
  const takesFile = action === 'verify' || action === 'install'
  const validInput = takesFile ? absolutePath(file) : file === undefined
  if (!validAction || !validInput || extra.length) {
    process.stderr.write(
      'Usage: auth-report.mjs verify|install <absolute-license-path> | status|reset-clock|uninstall\n',
    )
    return 2
  }

  const args = ['auth', action]
  if (action === 'verify') args.push('--license')
  if (takesFile) args.push(file)
  const result = runXdoc(args)
  const report = result.error ? null : readReport(result.stdout, reportVersions[action])
  return finish(action, result, report)
}

process.exitCode = main(process.argv.slice(2))
