import assert from 'node:assert/strict'
import test from 'node:test'
import { validateDesignReview } from '../../../pptx-nova/scripts/lib/review/design-quality.mjs'
import { designReviewFixture } from '../helpers/design-review-fixtures.mjs'
const binding = { candidateSha256: 'a'.repeat(64), manifestSha256: 'b'.repeat(64), slideCount: 5 }

test('design review rejects bare passes, stale hashes, unreviewed slides and unresolved criticism', () => {
  assert.ok(validateDesignReview(null, binding).length)
  const valid = designReviewFixture(binding)
  assert.deepEqual(validateDesignReview(valid, binding), [])
  for (const change of [
    (r) => {
      r.criteria[0].observation = ''
    },
    (r) => {
      r.criteria[0].slides = [6]
    },
    (r) => {
      r.criteria[0].verdict = 'fail'
    },
    (r) => {
      r.criteria.push(r.criteria[0])
    },
    (r) => {
      r.candidateSha256 = 'c'.repeat(64)
    },
    (r) => {
      delete r.manifestSha256
    },
    (r) => {
      delete r.weakestSlide
    },
    (r) => {
      r.unresolvedIssues = ['Cover still feels like a placeholder']
    },
  ]) {
    const r = structuredClone(valid)
    change(r)
    assert.ok(validateDesignReview(r, binding).length)
  }
})

test('expressive decks require a meaningful signature; reading decks can be restrained', () => {
  const r = designReviewFixture(binding)
  r.mode = 'persuade'
  assert.ok(validateDesignReview(r, binding).some((e) => e.includes('signature')))
  r.signatureMoment = {
    slide: 2,
    description: 'The same document expands into three editable outputs',
  }
  assert.deepEqual(validateDesignReview(r, binding), [])
  r.mode = 'read'
  delete r.signatureMoment
  assert.deepEqual(validateDesignReview(r, binding), [])
})
