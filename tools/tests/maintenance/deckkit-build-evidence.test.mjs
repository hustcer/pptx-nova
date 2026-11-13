import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildEvidence } from '../../../deckkit-maker/scripts/check-build-evidence.mjs'
const evidence = () => ({
  dryRun: { status: 'success', semanticIssues: [], visualRisks: [] },
  apply: { status: 'success', semanticIssues: [], visualRisks: [] },
  vision: {
    status: 'success',
    semanticSummary: { passed: true, issueCount: 0, sourceRuleCount: 82, normalizedRuleCount: 81 },
    semanticIssues: [],
    summary: { bySeverity: { high: 0, medium: 0, low: 1 } },
    issues: [{ severity: 'low' }],
  },
})
test('DeckKit pre-render guard accepts complete semantics and nonblocking low review inputs', () => {
  assert.equal(checkBuildEvidence(evidence()).passed, true)
})
test('DeckKit pre-render guard rejects missing, failed and contradictory machine evidence', () => {
  const mutations = [
    (e) => delete e.dryRun.semanticIssues,
    (e) => e.apply.semanticIssues.push({ code: 'broken' }),
    (e) => e.dryRun.visualRisks.push({ severity: 'medium' }),
    (e) => (e.apply.status = 'error'),
    (e) => delete e.vision.semanticSummary,
    (e) => (e.vision.semanticSummary.sourceRuleCount = 81),
    (e) => (e.vision.semanticSummary.issueCount = 1),
    (e) => e.vision.issues.push({ severity: 'high' }),
    (e) => (e.vision.summary.bySeverity.medium = 1),
    (e) => delete e.vision.issues,
  ]
  for (const mutate of mutations) {
    const e = evidence()
    mutate(e)
    assert.equal(checkBuildEvidence(e).passed, false)
  }
})
