import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { skillUrl, writeJson, fileIdentity } from '../helpers/common.mjs'

test('shared visual evidence rejects empty manifests and stale declared hashes', async () => {
  const { materializeCompareAliases, VisualEvidenceError } = await import(
    skillUrl('scripts/lib/review/visual-evidence.mjs')
  )
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-visual-evidence-'))
  assert.throws(
    () =>
      materializeCompareAliases({
        compareReport: { schemaVersion: 'pptx-nova-compare-manifest/v1', parts: [] },
        compareReportPath: join(root, 'compare.json'),
        compareOutputPath: join(root, 'compare.png'),
        aliasOutputPath: join(root, 'alias.png'),
        aliasReportPath: join(root, 'alias.json'),
      }),
    VisualEvidenceError,
  )

  const part = join(root, 'compare-01.png')
  const partReport = join(root, 'compare-01.json')
  const source = join(root, 'source.pptx')
  const candidate = join(root, 'candidate.pptx')
  writeFileSync(source, 'source')
  writeFileSync(candidate, 'candidate')
  writeFileSync(part, 'actual bytes')
  writeJson(partReport, {
    status: 'success',
    baseline: fileIdentity(source),
    target: fileIdentity(candidate),
    outputPath: part,
    render: { path: part },
    scope: { slides: [1] },
  })
  assert.throws(
    () =>
      materializeCompareAliases({
        compareReport: {
          schemaVersion: 'pptx-nova-compare-manifest/v1',
          status: 'success',
          source: fileIdentity(source),
          candidate: fileIdentity(candidate),
          slideCount: 1,
          coverage: { expectedSlides: [1], coveredSlides: [1] },
          parts: [
            {
              partNumber: 1,
              path: part,
              reportPath: partReport,
              slides: [1],
              pairCount: 1,
              byteLength: 12,
              sha256: 'stale',
            },
          ],
        },
        compareReportPath: join(root, 'compare.json'),
        compareOutputPath: join(root, 'compare.png'),
        aliasOutputPath: join(root, 'alias.png'),
        aliasReportPath: join(root, 'alias.json'),
      }),
    (error) => error instanceof VisualEvidenceError && /SHA-256/.test(error.message),
  )

  const single = join(root, 'single.png')
  const singleAlias = join(root, 'single-alias.png')
  const singleAliasReport = join(root, 'single-alias.json')
  writeFileSync(single, 'single compare')
  const singleResult = materializeCompareAliases({
    compareReport: {
      schemaVersion: 'pptx-contact-diff/v1',
      status: 'success',
      baseline: fileIdentity(source),
      target: fileIdentity(candidate),
      outputPath: single,
      render: { path: single },
    },
    compareReportPath: join(root, 'single.json'),
    compareOutputPath: single,
    aliasOutputPath: singleAlias,
    aliasReportPath: singleAliasReport,
    sourceKind: 'refurbish',
  })
  assert.equal(singleResult.report.reuse.sourceKind, 'refurbish')
})
