import { DESIGN_CRITERIA } from '../../../pptx-nova/scripts/lib/review/design-quality.mjs'

// Synthetic observations exercise report validation; these fixtures never certify real slide taste.
export function designReviewFixture(binding) {
  return {
    schemaVersion: 'pptx-nova-design-review/v1',
    candidateSha256: binding.candidateSha256,
    manifestSha256: binding.manifestSha256,
    mode: 'read',
    direction: {
      audience: 'Test readers',
      idea: 'Read the comparison before its explanation',
      visualAnchor: 'Synthetic test fixture',
      intentionalRestraint: 'No decorative icons',
    },
    criteria: DESIGN_CRITERIA.map((id) => ({
      id,
      verdict: 'pass',
      slides: [1],
      observation: `Synthetic ${id} observation for fixture slide 1`,
    })),
    weakestSlide: {
      slide: 1,
      observation: 'Only one synthetic fixture slide; not a real taste judgment',
    },
    unresolvedIssues: [],
  }
}
