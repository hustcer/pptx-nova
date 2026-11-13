import { createHash } from 'node:crypto'

const digest = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value
const fail = (message) => {
  throw new Error(message)
}
const nonblank = (value) => typeof value === 'string' && value.trim().length > 0

/** Native occupancy is mandatory even for a deck with no mixed text. Never
 * infer empty coverage from an old textless pass or from a missing field.
 */
export function readTextStyleMapping(report) {
  const mapping = report?.textStyleMapping
  if (
    report?.schemaVersion !== 'pptx-i18n-style-diff/v1' ||
    report.status !== 'pass' ||
    report.agentGate?.passed !== true ||
    report.blockers?.length ||
    report.styleBlockers?.length ||
    mapping?.schemaVersion !== 'pptx-i18n-text-style-mapping/v1' ||
    !Array.isArray(mapping.mappings) ||
    mapping.reviewRequiredCount !== mapping.mappings.length
  )
    fail(
      'translation requires current native textStyleMapping evidence; a textless style pass is insufficient',
    )
  const ids = new Set()
  for (const item of mapping.mappings) {
    if (
      !/^sha256:[a-f0-9]{64}$/.test(item?.mappingId ?? '') ||
      ids.has(item.mappingId) ||
      !nonblank(item.part) ||
      !Number.isSafeInteger(item.paragraphIndex) ||
      item.paragraphIndex < 0 ||
      !Array.isArray(item.referencedBySlides) ||
      item.referencedBySlides.some((slide) => !Number.isSafeInteger(slide) || slide < 1) ||
      typeof item.sourceText !== 'string' ||
      typeof item.candidateText !== 'string' ||
      !Array.isArray(item.groups) ||
      item.groups.length < 2
    )
      fail('invalid or duplicated native text/style paragraph identity')
    ids.add(item.mappingId)
    const groups = new Set(),
      runs = new Set()
    for (const group of item.groups) {
      if (
        !nonblank(group?.sourceRunGroupId) ||
        groups.has(group.sourceRunGroupId) ||
        typeof group.styleXml !== 'string' ||
        typeof group.sourceText !== 'string' ||
        typeof group.candidateText !== 'string' ||
        (nonblank(group.sourceText) && !nonblank(group.candidateText)) ||
        !Array.isArray(group.runIndexes) ||
        !group.runIndexes.length ||
        group.runIndexes.some((run) => !Number.isSafeInteger(run) || run < 0 || runs.has(run))
      )
        fail('native text/style evidence contains an emptied, invalid or duplicated style group')
      groups.add(group.sourceRunGroupId)
      for (const run of group.runIndexes) runs.add(run)
    }
  }
  return mapping
}

const groupFacts = (item) =>
  item.groups.map((group) => ({
    sourceRunGroupId: group.sourceRunGroupId,
    sourceText: group.sourceText,
    candidateText: group.candidateText,
    styleSha256: digest(group.styleXml),
  }))

/** Scaffold verdicts remain pending. Only explicit empty native coverage can
 * produce an automatic empty review; paragraph judgments belong to the Agent.
 */
export function createTextStyleReview(report, { sourceSha256, candidateSha256 }) {
  const mapping = readTextStyleMapping(report)
  return {
    schemaVersion: 'pptx-nova-translation-style-review/v1',
    sourceSha256,
    candidateSha256,
    styleMappingSha256: digest(mapping),
    entries: mapping.mappings.map((item) => ({
      mappingId: item.mappingId,
      groups: groupFacts(item),
      verdict: 'pending',
      reason: '',
    })),
  }
}

export function verifyTextStyleReview(review, report, identity) {
  const expected = createTextStyleReview(report, identity)
  for (const key of ['schemaVersion', 'sourceSha256', 'candidateSha256', 'styleMappingSha256'])
    if (review?.[key] !== expected[key])
      fail(`translation phrase/style review is missing or stale: ${key}`)
  if (!Array.isArray(review.entries) || review.entries.length !== expected.entries.length)
    fail('translation phrase/style review must cover every native mixed-style paragraph')
  for (let i = 0; i < expected.entries.length; i++) {
    const entry = review.entries[i],
      wanted = expected.entries[i]
    if (entry?.mappingId !== wanted.mappingId || digest(entry.groups) !== digest(wanted.groups))
      fail('translation phrase/style review changed or omitted the bound source/target group facts')
    if (
      entry.verdict !== 'pass' ||
      !nonblank(entry.reason) ||
      entry.reason.trim().length < 12 ||
      /^(pending|todo|tbd|pass|looks? good|ok|待填写|待审阅)[.!。\s]*$/i.test(entry.reason.trim())
    )
      fail('translation requires a paragraph-specific phrase/style judgment, not global pass flags')
    if (
      !wanted.groups.some(
        (group) =>
          nonblank(group.sourceText) &&
          nonblank(group.candidateText) &&
          entry.reason.includes(group.sourceText.trim()) &&
          entry.reason.includes(group.candidateText.trim()),
      )
    )
      fail(
        'translation phrase/style judgment must cite the actual source and translated phrase it assessed',
      )
  }
  return review
}
