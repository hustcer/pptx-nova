import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeJson } from './common.mjs'

export const exactSwissSubtitle = 'ADJACENT PRODUCTS ARE SPLIT ACROSS VIEW, CONVERT AND GENERATE'

export function writeFinalizeSemanticFixtures(root, semanticPassed) {
  const inspectPath = join(root, 'inspect.json')
  const visionPath = join(root, 'vision.json')
  const semanticIssues = semanticPassed
    ? []
    : [
        {
          code: 'duplicate-id',
          ruleId: 'sdk/unique/p:cNvPr/id/part',
          part: 'ppt/slides/slide1.xml',
          message: 'duplicate non-visual property id',
        },
      ]
  writeJson(inspectPath, {
    schemaVersion: 'pptx-inspect/v1',
    status: 'success',
    presentation: { slideCount: 1, size: { width: '13.333in', height: '7.5in' } },
    slides: [{ index: 0, shapes: [] }],
  })
  writeJson(visionPath, {
    schemaVersion: 'pptx-vision/v1',
    status: 'success',
    summary: { issueCount: 0, bySeverity: { high: 0, medium: 0, low: 0 } },
    issues: [],
    semanticSummary: {
      passed: semanticPassed,
      issueCount: semanticIssues.length,
      sourceRuleCount: 82,
      normalizedRuleCount: 81,
    },
    semanticIssues,
  })
  return { inspectPath, visionPath }
}

export function readRefurbishResult(result) {
  const output = JSON.parse(result.stdout)
  assert.equal(output.schemaVersion, 'pptx-nova-refurbish-result/v1')
  assert.equal(output.mode, 'refurbish')
  assert.equal('phases' in output, false)
  assert.ok(output.agentSummary)
  return output
}

export function readRefurbishSummary(result) {
  const output = readRefurbishResult(result)
  return JSON.parse(readFileSync(join(output.runDir, 'refurbish-run-summary.json'), 'utf8'))
}

export function readCreateResult(result) {
  const output = JSON.parse(result.stdout)
  assert.equal(output.schemaVersion, 'pptx-nova-create-result/v1')
  assert.equal(output.mode, 'create')
  assert.equal('phases' in output, false)
  assert.ok(output.agentSummary)
  return output
}

export function readCreateSummary(result) {
  const output = readCreateResult(result)
  return JSON.parse(readFileSync(join(output.runDir, 'create-run-summary.json'), 'utf8'))
}

export function swissColumnContent() {
  return {
    meta: { deckkit: 'swiss-grid' },
    slides: [
      {
        type: 'swissColumnSlide',
        data: {
          eyebrow: 'P · 05',
          title: 'Product split',
          subtitle: exactSwissSubtitle,
          items: [
            {
              title: 'View',
              subtitle: 'Preview surfaces',
              body: 'Inspect layouts\nReview changes',
              examples: 'Open PPTX\nRender slide\nCheck notes',
            },
          ],
        },
      },
    ],
  }
}

export function swissColumnLock({ finalPptx, runDir }) {
  return {
    schemaVersion: 'pptx-nova-deck-lock/v1',
    mode: 'express',
    objective: 'Script test',
    outlinePath: 'outline.json',
    contentPath: 'content.json',
    patchPath: 'patch.json',
    output: { finalPptx, runDir },
    canvas: {
      format: 'ppt169',
      width: '13.333in',
      height: '7.5in',
    },
    deckkit: { id: 'swiss-grid' },
    slides: [
      {
        type: 'swissColumnSlide',
        title: 'Product split',
        purpose: 'Show the split between View, Convert, and Generate',
        rhythm: 'dense',
      },
    ],
    assumptions: [],
  }
}
