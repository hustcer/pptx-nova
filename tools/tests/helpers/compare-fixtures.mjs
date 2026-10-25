import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runNodeStatus, skillPath, writeJson, fileIdentity } from './common.mjs'

export function writeCompareGateFixture(root, makeReport) {
  const runDir = join(root, 'run')
  const sourcePptx = join(root, 'source.pptx')
  const finalPptx = join(root, 'final.pptx')
  const compare = join(runDir, 'translation-compare.png')
  const reportPath = join(runDir, 'translation-compare.json')
  const gatePath = join(runDir, 'translation-compare-gate.json')

  mkdirSync(runDir, { recursive: true })
  writeFileSync(sourcePptx, 'source pptx')
  writeFileSync(finalPptx, 'final pptx')
  writeFileSync(compare, 'compare png')
  writeJson(reportPath, makeReport({ compare, runDir, sourcePptx, finalPptx }))

  return { runDir, sourcePptx, finalPptx, compare, reportPath, gatePath }
}

export function runCompareGateFixture(fixture) {
  const result = runNodeStatus(
    [
      skillPath('scripts/cli/review/compare-gate.mjs'),
      '--run-dir',
      fixture.runDir,
      '--final-pptx',
      fixture.finalPptx,
      '--final-pptx-source',
      fixture.finalPptx,
      '--kind',
      'translation',
      '--compare',
      fixture.compare,
      '--report',
      fixture.reportPath,
      '--output',
      fixture.gatePath,
      '--publish',
      '--overwrite',
      '--timestamp',
      '0101000000',
      '--json',
    ],
    2,
  )
  return JSON.parse(result.stdout)
}

export function contactDiffReport(options) {
  const { compare, sourcePptx, finalPptx } = options
  const scopeMode = Object.prototype.hasOwnProperty.call(options, 'scopeMode')
    ? options.scopeMode
    : 'all-slides'
  const outputPath = Object.prototype.hasOwnProperty.call(options, 'outputPath')
    ? options.outputPath
    : compare
  const summary = { pairCount: 1, dpi: 192 }
  const agentGate = { passed: true, status: 'pass', pairCount: 1 }
  if (scopeMode !== undefined) {
    summary.scopeMode = scopeMode
    agentGate.scopeMode = scopeMode
  }
  const report = {
    schemaVersion: 'pptx-contact-diff/v1',
    status: 'success',
    baseline: fileIdentity(sourcePptx),
    target: fileIdentity(finalPptx),
    baselinePath: sourcePptx,
    targetPath: finalPptx,
    summary,
    agentGate,
    render: { path: compare, width: 100, height: 56, dpi: 192 },
  }
  if (outputPath !== undefined) report.outputPath = outputPath
  return report
}
