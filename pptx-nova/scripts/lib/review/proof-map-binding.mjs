import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

export function validProofMapBinding(binding) {
  return binding?.required === true
    ? /^[a-f0-9]{64}$/.test(binding.sha256 ?? '')
    : binding?.required === false && binding.sha256 === null
}

// Legacy runs keep their original requirement in the runner summary.
export function readProofMapSnapshot(runDir) {
  const path = join(runDir, 'refurbish-run-summary.json')
  if (!existsSync(path)) return null
  const summary = JSON.parse(readFileSync(path, 'utf8'))
  if (summary?.schemaVersion !== 'pptx-nova-refurbish-run/v1')
    throw new Error('Proof map requirement could not be read from the run summary')
  const snapshots = (Array.isArray(summary.phases) ? summary.phases : []).filter(
    (phase) => phase?.name === 'proof-map-snapshot',
  )
  if (!summary.handoff?.['--proof-map'] && !snapshots.length)
    return { required: false, sha256: null }
  const binding = {
    required: true,
    sha256:
      snapshots.length === 1 && snapshots[0].status === 'passed'
        ? snapshots[0].details?.sha256
        : null,
  }
  if (!validProofMapBinding(binding))
    throw new Error('Proof map snapshot SHA-256 is missing or invalid')
  return binding
}

// Capture before rendering, including cache hits. Store this in the compare
// report itself so losing both the map and summary cannot erase the requirement.
export function captureProofMapBinding(runDir, previous) {
  if (previous !== undefined && !validProofMapBinding(previous))
    throw new Error('Previous compare proof map binding is invalid')
  const snapshot = readProofMapSnapshot(runDir)
  if (previous?.required && snapshot && (!snapshot.required || snapshot.sha256 !== previous.sha256))
    throw new Error('Previous compare proof map binding conflicts with the run snapshot')
  const requirement = previous?.required ? previous : snapshot
  const path = join(runDir, 'proof-objects.json')
  if (!existsSync(path)) {
    if (requirement?.required) throw new Error('Required proof map archive is missing')
    return { required: false, sha256: null }
  }
  if (!statSync(path).isFile()) throw new Error('Proof map archive is not a file')
  const sha256 = hash(path)
  if (requirement?.required && requirement.sha256 !== sha256)
    throw new Error('Proof map archive does not match its snapshot SHA-256')
  return { required: true, sha256 }
}
