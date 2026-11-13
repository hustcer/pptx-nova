import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { canonicalEvidencePath } from '../review/evidence-paths.mjs'
import {
  captureVisualBinding,
  evaluateVisualEvidence,
  fileSha256,
  verifyVisualReview,
} from '../review/canonical-visual-evidence.mjs'
import { verifyRenderContext } from '../review/render-context.mjs'
import { verifyMultiColumnEvidence } from '../review/multi-column-evidence.mjs'
import { verifyDiffEvidence } from '../review/diff-evidence.mjs'
import { readTextStyleMapping, verifyTextStyleReview } from './text-style-review.mjs'

export function visionEvidenceIdentity(report) {
  const withoutPath = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const { path: _path, ...identity } = value
    return identity
  }
  const canonical = {
    ...report,
    source: withoutPath(report?.source),
    candidate: withoutPath(report?.candidate),
  }
  // Current reports repeat these same input paths in their suggested audit
  // command. Normalize only matching input operands, never flags or findings.
  const inputPath = (value) => (typeof value === 'string' ? value : value?.path)
  if (Array.isArray(report?.visualEvidence?.command)) {
    const command = report.visualEvidence.command
    canonical.visualEvidence = {
      ...report.visualEvidence,
      command: command.map((value, index) => {
        const flag = command[index - 1]
        if (flag === '--candidate' && value === inputPath(report.candidate))
          return '<bound-candidate>'
        if (flag === '--reference' && value === inputPath(report.source)) return '<bound-source>'
        return value
      }),
    }
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

const SCHEMA = 'pptx-nova-translation-evidence/v1'
const REQUIRED_FILES = [
  'source',
  'candidate',
  'units',
  'translations',
  'styleDiff',
  'candidateScan',
  'visionDiff',
  'renderContext',
]
const COMPLETION_GATES = [
  'translation-preview',
  'pptx-semantic-diff',
  'translation-compare-artifact',
  'translation-compare-delivery',
]
const COMPLETION_FILES = ['previewReport', 'semanticDiff', 'compareReport', 'compareGate', 'output']
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const fail = (message) => {
  throw new Error(message)
}

function snapshotFiles(paths) {
  return Object.fromEntries(
    Object.entries(paths).map(([key, operand]) => {
      const path = realpathSync(operand)
      return [key, { path, operand, sha256: fileSha256(path) }]
    }),
  )
}

function completionPaths(paths) {
  const preview = readJson(paths.previewReport)
  const semantic = readJson(paths.semanticDiff)
  const gate = readJson(paths.compareGate)
  const pagePath = (page) => resolve(dirname(paths.previewReport), (page.file ?? page).path)
  const images = [
    ...preview.pages.map(pagePath),
    pagePath(preview.contactSheet),
    ...(gate.parts.length ? gate.parts.map((p) => p.path) : [gate.compare.path]),
    ...gate.agentSummary.siblingPaths,
  ]
  return {
    ...paths,
    semanticDiffFull: semantic.fullEvidence.path,
    ...Object.fromEntries(images.map((path, i) => [`image-${i + 1}`, path])),
  }
}

/** Seal completion only after every machine stage and bundle publication passed.
 * Preserve the original input/report hashes rather than refreshing stale evidence.
 */
export function recordTranslationCompletion(artifacts, gates) {
  for (const name of COMPLETION_GATES) {
    const matches = gates.filter((gate) => gate.name === name)
    if (matches.length !== 1 || matches[0].passed !== true)
      fail(`translation completion requires passing ${name}`)
  }
  const record = readJson(artifacts.translationEvidence)
  return {
    ...record,
    completion: {
      schemaVersion: 'pptx-nova-translation-completion/v1',
      gates: [...COMPLETION_GATES],
      files: snapshotFiles(
        completionPaths(Object.fromEntries(COMPLETION_FILES.map((key) => [key, artifacts[key]]))),
      ),
    },
  }
}

function verifyTranslationCompletion(record, slideCount) {
  const completion = record.completion
  if (!completion) return false
  if (
    completion.schemaVersion !== 'pptx-nova-translation-completion/v1' ||
    !isDeepStrictEqual(completion.gates, COMPLETION_GATES)
  )
    fail('invalid translation machine completion contract')
  const files = completion.files ?? {}
  const paths = Object.fromEntries(COMPLETION_FILES.map((key) => [key, files[key]?.operand]))
  if (!isDeepStrictEqual(files, snapshotFiles(completionPaths(paths))))
    fail('missing or stale translation machine completion evidence')
  const preview = readJson(paths.previewReport)
  const semantic = readJson(paths.semanticDiff)
  const compare = readJson(paths.compareReport)
  const gate = readJson(paths.compareGate)
  if (
    preview.schemaVersion !== 'pptx-preview/v1' ||
    preview.status !== 'success' ||
    preview.pages.length !== slideCount ||
    semantic.status !== 'success' ||
    compare.status !== 'success' ||
    compare.agentGate?.passed !== true ||
    gate.schemaVersion !== 'pptx-nova-compare-gate/v1' ||
    gate.kind !== 'translation' ||
    gate.status !== 'pass' ||
    gate.blockers?.length ||
    gate.finalBinding?.status !== 'bound' ||
    gate.finalBinding.comparedCandidate?.sha256 !== record.files.candidate.sha256 ||
    gate.finalBinding.publishedFinal?.sha256 !== record.files.candidate.sha256 ||
    files.output.sha256 !== record.files.candidate.sha256 ||
    realpathSync(gate.finalBinding.publishedFinal.path) !== files.output.path
  )
    fail('translation machine workflow or publication did not pass')
  verifyDiffEvidence(semantic, record.files.source.path, record.files.candidate.path)
  return true
}

/** Freeze the inputs and reports after the translation checks pass.
 * Hashes bind later acceptance to these exact files, not a previous run's pass.
 */
export function recordTranslationEvidence(artifacts) {
  const paths = { ...artifacts }
  if (paths.multiColumnReviewGate && existsSync(paths.multiColumnReviewGate)) {
    const gate = readJson(paths.multiColumnReviewGate)
    for (const [key, field] of [
      ['multiColumnReview', 'review'],
      ['multiColumnVisionDiff', 'visionDiff'],
      ['multiColumnCandidate', 'candidate'],
    ])
      paths[key] = canonicalEvidencePath(gate[field], { artifactPath: paths.multiColumnReviewGate })
  }
  const keys = [
    ...REQUIRED_FILES,
    ...['multiColumnReview', 'multiColumnVisionDiff', 'multiColumnCandidate'].filter(
      (key) => paths[key],
    ),
  ]
  return {
    schemaVersion: SCHEMA,
    // Keep command operands alongside physical paths (e.g. macOS /var aliases).
    files: snapshotFiles(Object.fromEntries(keys.map((key) => [key, paths[key]]))),
  }
}

function verifyTranslationEvidence(path, manifest, candidate) {
  const record = readJson(path)
  if (record.schemaVersion !== SCHEMA) fail('unknown translation evidence contract')
  const files = record.files ?? {}
  for (const key of new Set([...REQUIRED_FILES, ...Object.keys(files)])) {
    const file = files[key]
    if (
      !file?.path ||
      !file.sha256 ||
      fileSha256(file.path) !== file.sha256 ||
      (file.operand && fileSha256(file.operand) !== file.sha256)
    )
      fail(`missing or stale translation evidence: ${key}`)
  }
  if (fileSha256(candidate) !== files.candidate.sha256)
    fail('translation evidence belongs to different candidate bytes')
  const reference = manifest.subjects?.find((s) => s.id === 'reference')
  if (
    !reference ||
    reference.sha256 !== files.source.sha256 ||
    reference.byteLength !== readFileSync(files.source.path).length
  )
    fail('translation reference does not match the bound source')
  const context = readJson(files.renderContext.path)
  verifyRenderContext(manifest, context)
  if (
    readJson(files.units.path).schemaVersion !== 'pptx-i18n-scan/v1' ||
    readJson(files.translations.path).schemaVersion !== 'pptx-i18n-translations/v1'
  )
    fail('translation inputs must retain their native scan and translations contracts')

  const style = readJson(files.styleDiff.path),
    scan = readJson(files.candidateScan.path)
  readTextStyleMapping(style)
  for (const [name, report, schemas] of [
    ['style', style, ['pptx-i18n-style-diff/v1']],
    ['consistency', scan, ['pptx-i18n-candidate-result/v1', 'pptx-i18n-scan/v1']],
  ]) {
    if (
      !schemas.includes(report.schemaVersion) ||
      report.status !== 'pass' ||
      report.agentGate?.passed !== true ||
      Number(report.agentGate.blockerCount ?? 0) !== 0 ||
      report.blockers?.length ||
      report.styleBlockers?.length
    )
      fail(`translation ${name} check did not pass`)
  }
  const vision = readJson(files.visionDiff.path)
  if (
    vision.schemaVersion !== 'pptx-vision-diff/v1' ||
    vision.status !== 'success' ||
    vision.agentGate?.scopeMode !== 'full-deck'
  )
    fail('translation requires full-deck vision evidence')
  let multi = null
  if (files.multiColumnReview) {
    if (
      files.multiColumnCandidate?.sha256 !== files.candidate.sha256 ||
      !files.multiColumnVisionDiff ||
      visionEvidenceIdentity(readJson(files.multiColumnVisionDiff.path)) !==
        visionEvidenceIdentity(vision)
    )
      fail('multi-column review belongs to different candidate or vision findings')
    multi = verifyMultiColumnEvidence({
      candidate: files.multiColumnCandidate.operand ?? files.multiColumnCandidate.path,
      visionDiff: files.multiColumnVisionDiff.operand ?? files.multiColumnVisionDiff.path,
      review: files.multiColumnReview.operand ?? files.multiColumnReview.path,
    })
  }
  const reviewedColumns = multi?.status === 'pass' && multi.agentGate?.passed === true
  const blocking = [
    ...(vision.newIssues ?? []),
    ...(vision.worsenedIssues ?? []).map((i) => i.candidateIssue),
  ].filter((i) => ['high', 'medium'].includes(i?.severity))
  if (
    !(vision.agentGate.passed === true || reviewedColumns) ||
    blocking.some((i) => i.kind !== 'multi-column-text-layout-review' || !reviewedColumns)
  )
    fail('translation has unresolved vision blockers')
  return { files, reviewedColumns, record }
}

/** Translation acceptance is a workflow decision, not a rewrite of xdoc's
 * regression verdict. Only expected pixel differences and reviewed low static
 * estimates are eligible; content stops and font/environment gaps stay closed.
 */
export function evaluateTranslationVisualEvidence(
  manifestPath,
  { candidate = '', review = '', translationEvidence = '', stage = 'delivery' } = {},
) {
  let report
  try {
    report = evaluateVisualEvidence(manifestPath, { candidate })
    report.requiresUserApproval = report.status === 'review-required'
    if (report.status === 'invalid' || report.status === 'blocked') return report
    const manifest = readJson(manifestPath)
    if (manifest.policyId !== 'pptx-visual-oracle-default/v1')
      fail('translation requires the default regression manifest with its source reference')
    if (
      manifest.decision.action !== 'proceed' &&
      manifest.decision.assurance !== 'same-renderer-change-detected'
    )
      return report

    const binding = captureVisualBinding(manifestPath, candidate)
    if (
      binding.reviewedSlides.length !== binding.slideCount ||
      binding.reviewedSlides.some((slide, i) => slide !== i + 1)
    )
      fail('translation acceptance requires complete candidate slide coverage')
    const reference = manifest.subjects.find((s) => s.id === 'reference')
    const referencePages = binding.artifacts
      .filter((a) => a.subjectId === 'reference' && a.mimeType === 'image/png')
      .map((a) => a.slide)
      .sort((a, b) => a - b)
    if (
      reference?.slideCount !== binding.slideCount ||
      JSON.stringify(referencePages) !== JSON.stringify(binding.reviewedSlides) ||
      !binding.artifacts.some(
        (a) => a.subjectId === 'reference' && a.mimeType === 'application/pdf',
      )
    )
      fail(
        'translation requires complete source reference PNG/PDF coverage with unchanged slide count',
      )
    const { reviewedColumns, record } = verifyTranslationEvidence(
      translationEvidence,
      manifest,
      candidate,
    )
    for (const id of ['input-integrity', 'pdf-final-layout', 'pdfium-raster']) {
      const check = manifest.checks.find((c) => c.id === id)
      if (check?.required !== true || check.outcome !== 'pass')
        fail(`translation cannot waive ${id}`)
    }
    if (!Array.isArray(manifest.findings))
      fail('translation requires the complete canonical findings list')
    // xdoc retains the original severity of static estimates after final
    // rendering disproves them. Only that static disposition is resolved;
    // content stops and findings from other checks remain authoritative.
    const activeFindings = manifest.findings.filter(
      (f) =>
        !(f.checkId === 'static-layout' && f.disposition === 'contradicted-by-rendered-layout'),
    )
    if (
      activeFindings.some(
        (f) =>
          !(
            (f.checkId === 'pixel-diff' &&
              f.kind === 'raster-content-changed' &&
              f.severity === 'review') ||
            (f.checkId === 'static-layout' && f.severity === 'low') ||
            (f.kind === 'multi-column-text-layout-review' && reviewedColumns)
          ),
      )
    )
      fail('translation cannot waive non-text or unresolved visual findings')
    for (const check of manifest.checks.filter(
      (c) => c.required && !['pixel-diff', 'policy'].includes(c.id),
    )) {
      if (check.outcome === 'pass') continue
      if (check.id !== 'static-layout' || !manifest.findings.some((f) => f.checkId === check.id))
        fail(`translation has an unexplained failed check: ${check.id}`)
    }
    if (!['visual', 'delivery'].includes(stage))
      fail(`unknown translation acceptance stage: ${stage}`)
    const completed =
      stage === 'delivery' && verifyTranslationCompletion(record, binding.slideCount)
    report.machineChecksPassed = completed
    report.requiresUserApproval = false
    report.deliveryAuthorized = false
    report.status = 'needs-visual-review'
    report.acceptance = {
      policyId: 'pptx-nova-translation-acceptance/v1',
      translationEvidenceSha256: fileSha256(translationEvidence),
      candidateSha256: binding.candidateSha256,
      status: 'needs-visual-review',
    }
    if (!review) return report
    const reviewed = verifyVisualReview(review, binding, { mode: 'translation' })
    if (
      reviewed.checks.filter((c) => c.name === 'textStyleAlignment' && c.status === 'pass')
        .length !== 1
    )
      fail('translation requires explicit textStyleAlignment review')
    verifyTextStyleReview(reviewed.textStyleReview, readJson(record.files.styleDiff.path), {
      sourceSha256: record.files.source.sha256,
      candidateSha256: record.files.candidate.sha256,
    })
    report.visualReviewPassed = true
    report.status = 'needs-machine-completion'
    report.acceptance.status = 'visual-accepted'
    report.acceptance.reviewer = reviewed.reviewer
    report.acceptance.reviewSha256 = fileSha256(review)
    if (!completed) return report
    report.status = 'passed'
    report.deliveryAuthorized = true
    report.acceptance.status = 'accepted'
    return report
  } catch (error) {
    return {
      ...report,
      schemaVersion: 'pptx-nova-visual-evidence-gate/v1',
      status: 'invalid',
      machineChecksPassed: false,
      deliveryAuthorized: false,
      requiresUserApproval: false,
      errors: [...(report?.errors ?? []), error.message],
    }
  }
}
