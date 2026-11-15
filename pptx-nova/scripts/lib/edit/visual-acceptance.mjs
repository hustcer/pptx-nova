import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import {
  captureVisualBinding,
  evaluateVisualEvidence,
  fileSha256,
  verifyVisualReview,
} from '../review/canonical-visual-evidence.mjs'
import { verifyDiffEvidence } from '../review/diff-evidence.mjs'
import { readPptxPackage } from '../pptx/pptx-package.mjs'
import { verifyNativeArtworkAdditions } from './native-artwork-preservation.mjs'

const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const fail = (message) => {
  throw new Error(message)
}

/** Consume reviewed intentional pixels only after a freshly replayed Edit Contract.
 * This is a workflow disposition, never a mutation of the native oracle decision
 * or a claim of PowerPoint parity. The public finalizer owns machine replay.
 */
export function acceptScopedEditVisuals({ candidate, contract, manifest, review, gate }) {
  const raw = read(manifest),
    edit = read(contract)
  const nativeArtwork = edit.operationKind === 'native-artwork'
  const result = evaluateVisualEvidence(manifest, { candidate })
  if (['invalid', 'blocked'].includes(result.status))
    fail(result.errors.join('; ') || 'Native visual evidence is blocked')
  if (raw.policyId !== 'pptx-visual-oracle-default/v1')
    fail('Edit requires source/candidate regression evidence')
  if (
    !['same-renderer-regression', 'same-renderer-change-detected'].includes(raw.decision.assurance)
  )
    fail('Environment uncertainty cannot be accepted as intentional editing')
  if (
    edit.schemaVersion !== 'pptx-nova-edit-contract/v1' ||
    !(nativeArtwork
      ? edit.scope === 'structural'
      : ['single-object', 'single-slide', 'multi-slide', 'all-slides-style'].includes(
          edit.scope,
        )) ||
    /structur/i.test(edit.operationKind ?? '')
  )
    fail('This consumer requires a non-structural Edit Contract')
  for (const kind of [
    'dry-run',
    'semantic-diff',
    'png-preview',
    'vision-diff',
    'final-inspect',
    ...(nativeArtwork ? ['structure-check'] : []),
  ])
    if (!edit.requiredEvidence?.includes(kind))
      fail(`Scoped finalization requires ${kind} evidence`)
  if (
    gate.schemaVersion !== 'pptx-nova-edit-contract-gate/v1' ||
    gate.status !== 'pass' ||
    gate.agentGate?.passed !== true ||
    gate.agentGate?.nextAction !== 'publish' ||
    gate.blockers?.length ||
    gate.summary?.blockerCount !== 0 ||
    gate.summary?.outOfScopeReliableChangeCount !== 0 ||
    gate.summary?.targetCount !== gate.summary?.coveredTargetCount
  )
    fail('Fresh Edit Contract gate did not pass complete target coverage and locality')
  for (const name of ['source-freshness', 'target-coverage', 'semantic-diff-locality'])
    if (gate.checks?.filter((check) => check.name === name && check.status === 'pass').length !== 1)
      fail(`A fresh passing ${name} check is required`)
  if (
    !isDeepStrictEqual(gate.source, edit.source) ||
    fileSha256(edit.source.pptx) !== edit.source.sha256 ||
    fileSha256(candidate) !== gate.candidate?.sha256
  )
    fail('Edit source or candidate identity is stale')
  if (!gate.artifacts?.semanticDiff)
    fail('Complete source-bound semantic diff evidence is required')
  let diff = read(gate.artifacts.semanticDiff)
  if (diff.detail === 'full') {
    const expected = {
      algorithm: 'sha256',
      baseline: edit.source.sha256,
      target: fileSha256(candidate),
    }
    if (
      diff.schemaVersion !== 'pptx-diff/v1' ||
      diff.status !== 'success' ||
      !isDeepStrictEqual(diff.inputBinding, expected) ||
      !Array.isArray(diff.slides)
    )
      fail('Full semantic diff is incomplete or stale')
  } else diff = verifyDiffEvidence(diff, edit.source.pptx, candidate)
  if (
    !nativeArtwork &&
    ['slideAdded', 'slideRemoved', 'shapeAdded', 'shapeRemoved'].some(
      (key) => diff.summary?.[key] !== 0,
    )
  )
    fail('Scoped visual acceptance cannot authorize added or removed slides or objects')
  const binding = captureVisualBinding(manifest, candidate)
  const reference = raw.subjects.find((subject) => subject.id === 'reference')
  if (
    reference?.sha256 !== edit.source.sha256 ||
    reference.slideCount !== binding.slideCount ||
    reference.byteLength !== readFileSync(edit.source.pptx).length
  )
    fail('Canonical reference does not match the exact Edit Contract source')
  const slides = [
    ...new Set(
      (edit.targets ?? []).flatMap((target) =>
        target.kind === 'document-fonts' && target.slideCount === binding.slideCount
          ? Array.from({ length: binding.slideCount }, (_, i) => i + 1)
          : Number.isInteger(target.slide)
            ? [target.slide + 1]
            : [],
      ),
    ),
  ].sort((a, b) => a - b)
  if (!slides.length || !isDeepStrictEqual(slides, binding.reviewedSlides))
    fail('Canonical review must cover exactly the authorized Edit Contract slides')
  // Semantic diff does not compare every OOXML feature. Untouched OPC parts
  // must remain byte-identical after decompression, regardless of ZIP metadata.
  // Resolve presentation order through relationships, never slideN filenames.
  const before = readPptxPackage(edit.source.pptx),
    after = readPptxPackage(candidate)
  const sourceSlides = before.slides(),
    candidateSlides = after.slides()
  if (
    !isDeepStrictEqual(sourceSlides, candidateSlides) ||
    !isDeepStrictEqual(before.partNames(), after.partNames())
  )
    fail('Scoped Edit must preserve the OPC part inventory and slide registration')
  const allowedParts = new Set(
    sourceSlides.filter((s) => slides.includes(s.slide)).map((s) => s.part),
  )
  for (const part of before.partNames())
    if (!allowedParts.has(part) && !before.partBytes(part).equals(after.partBytes(part)))
      fail(`Unreviewed OPC part changed: ${part}`)
  const artworkPreservation = nativeArtwork
    ? verifyNativeArtworkAdditions({ before, after, edit, slides, diff })
    : null
  if (
    !isDeepStrictEqual(
      diff.slides.map((s) => s.slide),
      sourceSlides.map((s) => s.slide),
    )
  )
    fail('Full semantic diff must cover every registered slide')
  for (const slide of diff.slides.filter((s) => slides.includes(s.slide)))
    if (
      !Array.isArray(slide.unsupported) ||
      (!nativeArtwork && slide.unsupported.length) ||
      !Array.isArray(slide.shapeChanges) ||
      slide.shapeChanges.some((change) => change.reliability !== 'reliable')
    )
      fail(
        'Selected slides contain unsupported or uncertain semantic regions; separate preservation review is required',
      )
  const referenceImages = binding.artifacts.filter(
    (artifact) => artifact.subjectId === 'reference' && artifact.mimeType === 'image/png',
  )
  if (
    !isDeepStrictEqual(
      referenceImages.map((image) => image.slide).sort((a, b) => a - b),
      slides,
    ) ||
    !binding.artifacts.some(
      (artifact) => artifact.subjectId === 'reference' && artifact.mimeType === 'application/pdf',
    )
  )
    fail('Complete scoped source PNG/PDF evidence is required')
  for (const id of ['input-integrity', 'static-layout', 'pdf-final-layout', 'pdfium-raster']) {
    const check = raw.checks.find((check) => check.id === id)
    if (check?.required !== true || check.outcome !== 'pass') fail(`Edit cannot waive ${id}`)
  }
  if (
    raw.checks.some(
      (check) =>
        check.required && !['pixel-diff', 'policy'].includes(check.id) && check.outcome !== 'pass',
    )
  )
    fail('An unresolved required visual check remains')
  const pixels = raw.checks.find((check) => check.id === 'pixel-diff')
  if (pixels?.required !== true || !['pass', 'inconclusive'].includes(pixels.outcome))
    fail('Failed or missing pixel comparison cannot be accepted')
  if (
    !Array.isArray(raw.findings) ||
    raw.findings.some(
      (finding) =>
        !(
          finding.checkId === 'pixel-diff' &&
          finding.kind === 'raster-content-changed' &&
          finding.severity === 'review'
        ),
    )
  )
    fail('Edit cannot waive unresolved static, content or environment findings')
  const reviewed = verifyVisualReview(review, binding, { mode: 'edit', allowScoped: true })
  return {
    ...result,
    status: 'passed',
    machineChecksPassed: true,
    deliveryAuthorized: true,
    acceptance: {
      policyId: nativeArtwork
        ? 'pptx-nova-native-artwork-edit-acceptance/v1'
        : 'pptx-nova-scoped-edit-acceptance/v1',
      contractSha256: fileSha256(contract),
      reviewSha256: fileSha256(review),
      candidateSha256: binding.candidateSha256,
      manifestSha256: binding.manifestSha256,
      reviewer: reviewed.reviewer,
      slides,
      preservation: {
        policy: 'only-reviewed-slide-xml-may-change',
        reviewedParts: [...allowedParts],
        unchangedParts: before.partNames().length - allowedParts.size,
        ...(artworkPreservation ? { nativeArtwork: artworkPreservation } : {}),
      },
      assurance:
        'Scoped contract and actual visual review; independent PowerPoint parity is not established',
    },
  }
}
