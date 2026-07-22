import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// The SKILL's global guidance stores the capability probe as
// xdoc-capabilities.json inside a freshly created run directory before any
// runner is invoked. Every runner therefore accepts a missing directory, an
// empty directory, or a directory holding only that probe artifact — anything
// else is run reuse and must fail closed.
const PRE_PROBE_ALLOWED_ENTRIES = new Set(['xdoc-capabilities.json'])

export function isNewOrPreProbedRunDir(runDir) {
  if (!existsSync(runDir)) return true
  if (!statSync(runDir).isDirectory()) return false
  const unexpected = readdirSync(runDir).filter((name) => !PRE_PROBE_ALLOWED_ENTRIES.has(name))
  if (unexpected.length > 0) return false
  const capabilityPath = join(runDir, 'xdoc-capabilities.json')
  return !existsSync(capabilityPath) || statSync(capabilityPath).isFile()
}

export function assertNewOrPreProbedRunDir(runDir) {
  if (!existsSync(runDir)) return
  if (!statSync(runDir).isDirectory()) {
    throw new Error(`run directory path already exists and is not a directory: ${runDir}`)
  }
  const unexpectedEntries = readdirSync(runDir).filter(
    (name) => !PRE_PROBE_ALLOWED_ENTRIES.has(name),
  )
  if (unexpectedEntries.length > 0) {
    throw new Error(
      `run directory already exists and is not empty/pre-probed: ${runDir}; unexpected entries: ${unexpectedEntries.join(', ')}`,
    )
  }
  const capabilityPath = join(runDir, 'xdoc-capabilities.json')
  if (existsSync(capabilityPath) && !statSync(capabilityPath).isFile()) {
    throw new Error(`pre-probed capability artifact is not a file: ${capabilityPath}`)
  }
}
