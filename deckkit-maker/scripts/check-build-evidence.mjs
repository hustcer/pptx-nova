#!/usr/bin/env node
// Developer-only pre-render guard. Canonical identity binding and PNG review remain mandatory.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { semanticValidationEvidence } from '../../pptx-nova/scripts/lib/review/semantic-evidence.mjs'

export function checkBuildEvidence({ dryRun, apply, vision }) {
  const errors = []
  for (const [name, report] of Object.entries({ dryRun, apply })) {
    if (report?.status !== 'success') errors.push(`${name}: successful report required`)
    if (!Array.isArray(report?.semanticIssues) || report.semanticIssues.length)
      errors.push(`${name}: explicit empty semanticIssues required`)
    if (!Array.isArray(report?.visualRisks)) errors.push(`${name}: visualRisks required`)
    else if (report.visualRisks.some((v) => ['high', 'medium'].includes(v.severity)))
      errors.push(`${name}: unresolved high/medium visual risk`)
  }
  const semantic = semanticValidationEvidence(vision)
  if (!semantic.valid || !semantic.passed)
    errors.push('vision: complete successful semantic evidence required')
  const counts = vision?.summary?.bySeverity
  if (vision?.status !== 'success' || !counts || !Array.isArray(vision.issues))
    errors.push('vision: successful full visual report required')
  else {
    for (const level of ['high', 'medium']) {
      const actual = vision.issues.filter((v) => v.severity === level).length
      if (counts[level] !== 0 || actual !== 0)
        errors.push(`vision: unresolved or inconsistent ${level} findings`)
    }
  }
  return {
    schemaVersion: 'deckkit-build-evidence/v1',
    passed: errors.length === 0,
    errors,
    scope: 'Pre-render reports only; does not bind candidate bytes or certify pixels/native host.',
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--dir')
      throw Error('Usage: node check-build-evidence.mjs --dir <current-iteration>')
    const dir = resolve(process.argv[3])
    const read = (name) => JSON.parse(readFileSync(resolve(dir, name), 'utf8'))
    const result = checkBuildEvidence({
      dryRun: read('dry-run.json'),
      apply: read('apply.json'),
      vision: read('vision.json'),
    })
    console.log(JSON.stringify(result, null, 2))
    if (!result.passed) process.exitCode = 1
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  }
}
