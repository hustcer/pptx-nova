import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { canonicalJsonV1, canonicalSha256V1 } from '../../pptx-nova/scripts/lib/canonical-json.mjs'
import {
  annotateTopActionable,
  evaluateFindings,
} from '../../pptx-nova/scripts/lib/finding-analysis.mjs'
import {
  buildLayoutSnapshot,
  layoutSemanticProjectionV1,
  layoutSemanticSha256,
} from '../../pptx-nova/scripts/lib/layout-snapshot.mjs'
import { reviewFindingSha256 } from '../../pptx-nova/scripts/pptx-nova-review-policy.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fixturePath = join(
  repoRoot,
  'tools/fixtures/finding-analysis/refurbish-duplicate-name-empty-sldnum/scenario.json',
)
const schemaPath = join(repoRoot, 'pptx-nova/assets/schemas/finding-analysis.schema.json')
const SHA = {
  source: '1'.repeat(64),
  candidate: '2'.repeat(64),
  patch: '3'.repeat(64),
}

function artifactBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function artifactSha256(value) {
  return createHash('sha256').update(artifactBytes(value)).digest('hex')
}

function fixtureInspect() {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const filler = Array.from({ length: fixture.generator.fillerObjectCount }, (_, index) => ({
    id: 1000 + index,
    ...(index < fixture.generator.namelessFillerCount ? {} : { name: `Filler ${index}` }),
    shapeType: 'rect',
    bbox: { xEmu: 1000 + index, yEmu: 1000, wEmu: 100, hEmu: 100 },
  }))
  return {
    fixture,
    inspect: {
      schemaVersion: 'pptx-inspect/v1',
      presentation: {
        slideCount: 1,
        size: { wEmu: 9144000, hEmu: 5143500 },
      },
      slides: [
        {
          index: 0,
          partName: 'ppt/slides/slide1.xml',
          shapes: [...filler, ...fixture.focusedShapes],
        },
      ],
    },
  }
}

function simpleInspect(shapes) {
  return {
    schemaVersion: 'pptx-inspect/v1',
    presentation: { slideCount: 1, size: { wEmu: 9144000, hEmu: 5143500 } },
    slides: [{ index: 0, partName: 'ppt/slides/slide1.xml', shapes }],
  }
}

function emptyReviewEvaluation(sourceSha, candidateSha, layoutArtifactSha) {
  return {
    schemaVersion: 'pptx-nova-review-policy-evaluation/v1',
    status: 'pass',
    bindings: {
      expectedSourceSha256: null,
      source: { sha256: sourceSha },
      candidate: { sha256: candidateSha },
      policyDocument: null,
      evidence: { layoutSnapshot: { sha256: layoutArtifactSha } },
    },
    summary: {
      declaredReviewCount: 0,
      validReviewCount: 0,
      appliedReviewCount: 0,
      reviewedFindingCount: 0,
      remainingActionableCount: 0,
      informationalCount: 0,
      errorCount: 0,
    },
    applied: [],
    reviewedFindings: [],
    remainingActionable: [],
    informational: [],
    errors: [],
  }
}

function buildInput({
  sourceInspect,
  candidateInspect = sourceInspect,
  assurance = 'runner-observed',
  enforcement = 'shadow',
  automation = 'human-in-loop',
  dryRun = null,
  apply = null,
  reviewEvaluation = undefined,
  sourceSha = SHA.source,
  candidateSha = SHA.candidate,
} = {}) {
  const sourceReport = buildLayoutSnapshot(sourceInspect, {
    sourceLabel: '/run/source-inspect.json',
  })
  const candidateReport = buildLayoutSnapshot(candidateInspect, {
    sourceLabel: '/run/candidate-inspect.json',
  })
  const sourceArtifactSha = artifactSha256(sourceReport)
  const candidateArtifactSha = artifactSha256(candidateReport)
  const semanticDiff = {
    schemaVersion: 'pptx-diff/v1',
    status: 'success',
    agentGate: { semanticStatus: 'pass' },
    summary: { reliableChanges: 0, uncertainChanges: 0, unsupportedRegions: 0 },
    slides: [],
  }
  const input = {
    workflowProfile: {
      profileId: 'refurbish-shadow/v1-draft',
      kind: 'refurbish',
      mode: 'standard',
      mutationIntent: 'style',
      deliveryStage: 'final',
    },
    bindingContext: { assurance, schemaDeclaredInputs: [] },
    sourceLayout: {
      report: sourceReport,
      binding: {
        pptxSha256: sourceSha,
        layoutArtifactSha256: sourceArtifactSha,
        layoutSemanticSha256: layoutSemanticSha256(sourceReport),
      },
    },
    candidateLayout: {
      report: candidateReport,
      binding: {
        pptxSha256: candidateSha,
        layoutArtifactSha256: candidateArtifactSha,
        layoutSemanticSha256: layoutSemanticSha256(candidateReport),
      },
    },
    changedScope: {
      mode: 'full-deck',
      slideIndexes: [],
      objectIds: [],
      origin: 'workflow-profile',
      binding: {
        sourcePptxSha256: sourceSha,
        candidatePptxSha256: candidateSha,
        evidenceArtifactSha256: null,
      },
    },
    mutationEvidence: {
      dryRun: dryRun
        ? {
            report: dryRun,
            artifactSha256: artifactSha256(dryRun),
            binding: { sourcePptxSha256: sourceSha, patchSha256: SHA.patch },
          }
        : null,
      apply: apply
        ? {
            report: apply,
            artifactSha256: artifactSha256(apply),
            binding: {
              sourcePptxSha256: sourceSha,
              candidatePptxSha256: candidateSha,
              patchSha256: SHA.patch,
            },
          }
        : null,
      semanticDiff: {
        report: semanticDiff,
        artifactSha256: artifactSha256(semanticDiff),
        binding: { sourcePptxSha256: sourceSha, candidatePptxSha256: candidateSha },
      },
    },
    reviewEvaluation: null,
    executionPolicy: { automation, enforcement },
  }
  const evaluation =
    reviewEvaluation === undefined
      ? emptyReviewEvaluation(sourceSha, candidateSha, candidateArtifactSha)
      : reviewEvaluation
  input.reviewEvaluation = evaluation
    ? { report: evaluation, artifactSha256: artifactSha256(evaluation) }
    : null
  return input
}

function findingByCode(report, code) {
  return report.findings.find((finding) => finding.rawFinding.code === code)
}

function jsonTypeMatches(value, type) {
  if (type === 'null') return value === null
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  return typeof value === type
}

function resolveSchemaRef(rootSchema, ref) {
  assert.ok(ref.startsWith('#/'), `unsupported schema ref: ${ref}`)
  return ref
    .slice(2)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((node, segment) => node?.[segment], rootSchema)
}

function validateJsonSchema(value, schema, rootSchema = schema, path = '$') {
  const errors = []
  const visit = (currentValue, currentSchema, currentPath) => {
    if (currentSchema.$ref) {
      const resolved = resolveSchemaRef(rootSchema, currentSchema.$ref)
      assert.ok(resolved, `unresolved schema ref: ${currentSchema.$ref}`)
      visit(currentValue, resolved, currentPath)
      return
    }

    if (currentSchema.oneOf) {
      const matches = currentSchema.oneOf.filter(
        (variant) =>
          validateJsonSchema(currentValue, variant, rootSchema, currentPath).length === 0,
      ).length
      if (matches !== 1)
        errors.push(`${currentPath}: expected exactly one oneOf match, got ${matches}`)
    }

    if (
      Object.hasOwn(currentSchema, 'const') &&
      JSON.stringify(currentValue) !== JSON.stringify(currentSchema.const)
    ) {
      errors.push(`${currentPath}: does not match const`)
    }
    if (
      currentSchema.enum &&
      !currentSchema.enum.some((item) => JSON.stringify(item) === JSON.stringify(currentValue))
    ) {
      errors.push(`${currentPath}: is not in enum`)
    }

    if (currentSchema.type) {
      const allowedTypes = Array.isArray(currentSchema.type)
        ? currentSchema.type
        : [currentSchema.type]
      if (!allowedTypes.some((type) => jsonTypeMatches(currentValue, type))) {
        errors.push(`${currentPath}: expected type ${allowedTypes.join('|')}`)
        return
      }
    }

    if (currentValue !== null && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
      for (const required of currentSchema.required ?? []) {
        if (!Object.hasOwn(currentValue, required))
          errors.push(`${currentPath}: missing ${required}`)
      }
      for (const [key, childValue] of Object.entries(currentValue)) {
        if (currentSchema.properties?.[key]) {
          visit(childValue, currentSchema.properties[key], `${currentPath}.${key}`)
        } else if (currentSchema.additionalProperties === false) {
          errors.push(`${currentPath}: unexpected property ${key}`)
        }
      }
    }

    if (Array.isArray(currentValue)) {
      if (currentSchema.minItems !== undefined && currentValue.length < currentSchema.minItems) {
        errors.push(`${currentPath}: fewer than ${currentSchema.minItems} items`)
      }
      if (currentSchema.maxItems !== undefined && currentValue.length > currentSchema.maxItems) {
        errors.push(`${currentPath}: more than ${currentSchema.maxItems} items`)
      }
      if (currentSchema.uniqueItems) {
        const identities = currentValue.map((item) => JSON.stringify(item))
        if (new Set(identities).size !== identities.length)
          errors.push(`${currentPath}: duplicate items`)
      }
      if (currentSchema.items) {
        currentValue.forEach((item, index) =>
          visit(item, currentSchema.items, `${currentPath}[${index}]`),
        )
      }
    }

    if (typeof currentValue === 'string' && currentSchema.pattern) {
      if (!new RegExp(currentSchema.pattern, 'u').test(currentValue)) {
        errors.push(`${currentPath}: does not match pattern`)
      }
    }
    if (typeof currentValue === 'number' && currentSchema.minimum !== undefined) {
      if (currentValue < currentSchema.minimum) errors.push(`${currentPath}: below minimum`)
    }
  }
  visit(value, schema, path)
  return errors
}

test('canonicalJsonV1 is deterministic without normalizing exact Unicode strings', () => {
  assert.equal(canonicalJsonV1({ b: 1, a: 2 }), '{"a":2,"b":1}')
  assert.equal(canonicalJsonV1({ '😀': 1, '\uE000': 2 }), '{"":2,"😀":1}')
  const numericVector = { z: 1e21, n: 4.5, a: 1e-7 }
  assert.equal(canonicalJsonV1(numericVector), '{"a":1e-7,"n":4.5,"z":1e+21}')
  assert.equal(
    canonicalSha256V1(numericVector),
    '0fc26b9591159089f619381787d916d18e0ce717e5d867eb50f7692f5b3483a8',
  )
  assert.notEqual(canonicalJsonV1('é'), canonicalJsonV1('e\u0301'))
  assert.notEqual(canonicalSha256V1('é'), canonicalSha256V1('e\u0301'))
  assert.throws(() => canonicalJsonV1(-0), /rejects/)
  assert.throws(() => canonicalJsonV1(Number.NaN), /rejects/)
  assert.throws(() => canonicalJsonV1({ value: undefined }), /rejects/)
  const sparse = []
  sparse.length = 1
  assert.throws(() => canonicalJsonV1(sparse), /only accepts JSON values/)
})

test('v1-draft schema and identity golden vectors cover complete and failed reports', () => {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
  assert.equal(schema.$id, 'pptx-nova-finding-analysis/v1-draft')
  assert.equal(schema.oneOf.length, 2)

  const input = buildInput({ sourceInspect: simpleInspect([]), reviewEvaluation: null })
  const complete = evaluateFindings(input)
  assert.equal(complete.evaluation.status, 'complete')
  assert.equal(
    complete.analysisIdentity.sha256,
    '3c88e8af7b24899122fd2e39b4d6da759798515c02d3ad3be7bc921f87f206e3',
  )
  assert.equal(complete.summary.countsComplete, true)
  assert.deepEqual(complete.evaluation.errors, [])
  assert.deepEqual(validateJsonSchema(complete, schema), [])

  const invalid = cloneJson(input)
  invalid.mutationEvidence.semanticDiff = null
  const failed = evaluateFindings(invalid)
  assert.equal(failed.evaluation.status, 'failed')
  assert.equal(failed.analysisIdentity, null)
  assert.equal(failed.summary.countsComplete, false)
  assert.ok(failed.evaluation.errors.length > 0)
  assert.equal(failed.agentGate.effectiveStatus, 'not-applied')
  assert.deepEqual(validateJsonSchema(failed, schema), [])

  const malformed = evaluateFindings({})
  assert.equal(malformed.evaluation.status, 'failed')
  assert.equal(malformed.workflowProfile.kind, null)
  assert.deepEqual(validateJsonSchema(malformed, schema), [])
})

test('574/572/2 fixture yields two focused shadow findings without changing the old gate', () => {
  const { fixture, inspect } = fixtureInspect()
  const input = buildInput({ sourceInspect: inspect })
  const sourceSnapshot = input.sourceLayout.report
  const report = evaluateFindings(input)

  assert.equal(sourceSnapshot.summary.objectCount, fixture.expected.objectCount)
  assert.equal(
    sourceSnapshot.slides.flatMap((slide) => slide.objects).filter((object) => object.name).length,
    fixture.expected.namedObjectCount,
  )
  assert.equal(sourceSnapshot.summary.actionableRiskCount, fixture.expected.actionableFindingCount)
  assert.deepEqual(
    sourceSnapshot.risks.map((risk) => risk.code).sort(),
    [...fixture.expected.findingCodes].sort(),
  )
  assert.equal(report.evaluation.status, 'complete')
  assert.equal(report.findings.length, 2)
  assert.equal(report.agentGate.proposedStatus, 'warn')
  assert.equal(report.agentGate.effectiveStatus, 'not-applied')
  assert.equal(report.agentGate.nextAction, 'review-listed-findings')
  assert.equal(report.evaluation.diagnostics[0].code, 'finding-analysis-operation-evidence-missing')

  const duplicate = findingByCode(report, 'duplicate-object-name')
  assert.equal(
    duplicate.findingKey.sha256,
    canonicalSha256V1({
      schemaVersion: 'pptx-nova-finding-key/v1',
      detectorKind: 'layout',
      code: 'duplicate-object-name',
      stableTargetKey: {
        slidePart: 'ppt/slides/slide1.xml',
        duplicateName: 'Connector straightConnector1',
      },
    }),
  )
  assert.equal(duplicate.relatedObjects.length, 2)
  assert.deepEqual(
    duplicate.relatedObjects.map((object) => object.shapeId),
    [797, 900],
  )
  assert.equal(duplicate.impact.visual.severity, 'none')
  assert.equal(duplicate.decision.disposition, 'informational')
  assert.equal(duplicate.selectorUsage.status, 'unknown')

  const placeholder = findingByCode(report, 'empty-placeholder')
  assert.equal(placeholder.relatedObjects[0].placeholder.type, 'sldNum')
  assert.equal(placeholder.relatedObjects[0].placeholder.provenance, 'unknown')
  assert.equal(placeholder.decision.disposition, 'review')
  assert.equal(placeholder.decision.action, 'submit-hash-bound-review')
})

test('two-object raw review SHA stays compatible and three duplicates form one group', () => {
  const pair = simpleInspect([
    { id: 1, name: 'Same', shapeType: 'connector', bbox: { x: 1, y: 1, width: 2, height: 0 } },
    { id: 2, name: 'Same', shapeType: 'connector', bbox: { x: 2, y: 2, width: 2, height: 0 } },
  ])
  const pairSnapshot = buildLayoutSnapshot(pair)
  const pairRisk = pairSnapshot.risks.find((risk) => risk.code === 'duplicate-object-name')
  const oldContractRisk = {
    severity: 'warning',
    classification: 'actionable',
    code: 'duplicate-object-name',
    message: 'Slide has duplicate object names',
    slide: 0,
    name: 'Same',
    slidePart: 'ppt/slides/slide1.xml',
    slideIndex: 0,
    slideNumber: 1,
    previewFile: 'slide-001.png',
  }
  assert.equal(pairRisk.reviewIdentity.sha256, reviewFindingSha256(oldContractRisk))

  const triple = simpleInspect([
    ...pair.slides[0].shapes,
    { id: 3, name: 'Same', shapeType: 'connector', bbox: { x: 3, y: 3, width: 2, height: 0 } },
  ])
  assert.equal(
    buildLayoutSnapshot(triple).risks.filter((risk) => risk.code === 'duplicate-object-name')
      .length,
    1,
  )

  const idPair = simpleInspect([
    { id: 7, name: 'First', shapeType: 'rect', bbox: { x: 1, y: 1, width: 2, height: 2 } },
    { id: 7, name: 'Second', shapeType: 'rect', bbox: { x: 2, y: 2, width: 2, height: 2 } },
  ])
  const idPairRisk = buildLayoutSnapshot(idPair).risks.find(
    (risk) => risk.code === 'duplicate-object-id',
  )
  const oldIdContractRisk = {
    severity: 'warning',
    classification: 'actionable',
    code: 'duplicate-object-id',
    message: 'Slide has duplicate object ids',
    slide: 0,
    id: 7,
    slidePart: 'ppt/slides/slide1.xml',
    slideIndex: 0,
    slideNumber: 1,
    previewFile: 'slide-001.png',
  }
  assert.equal(idPairRisk.reviewIdentity.sha256, reviewFindingSha256(oldIdContractRisk))

  const idTriple = simpleInspect([
    ...idPair.slides[0].shapes,
    { id: 7, name: 'Third', shapeType: 'rect', bbox: { x: 3, y: 3, width: 2, height: 2 } },
  ])
  assert.equal(
    buildLayoutSnapshot(idTriple).risks.filter((risk) => risk.code === 'duplicate-object-id')
      .length,
    1,
  )
})

test('layout CLI and pure buildLayoutSnapshot produce equivalent reports', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-layout-library-'))
  const inspectPath = join(root, 'inspect.json')
  const outputPath = join(root, 'layout.json')
  const inspect = simpleInspect([
    {
      id: 10,
      name: 'Page Number',
      shapeType: 'placeholder',
      placeholder: { type: 'sldNum', idx: 12 },
      bbox: { x: 10, y: 10, width: 100, height: 50 },
    },
  ])
  writeFileSync(inspectPath, artifactBytes(inspect))
  const result = spawnSync(
    process.execPath,
    [
      join(repoRoot, 'pptx-nova/scripts/pptx-nova-layout-snapshot.mjs'),
      '--inspect',
      inspectPath,
      '--output',
      outputPath,
      '--json',
    ],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const cliReport = JSON.parse(result.stdout)
  const libraryReport = buildLayoutSnapshot(inspect, { sourceLabel: inspectPath })
  assert.deepEqual(cliReport, libraryReport)
  assert.deepEqual(JSON.parse(readFileSync(outputPath, 'utf8')), libraryReport)
})

test('detector and finding keys preserve exact name equality without NFC folding', () => {
  const inspect = simpleInspect([
    { id: 1, name: 'é', shapeType: 'rect', bbox: { x: 1, y: 1, width: 2, height: 2 } },
    { id: 2, name: 'e\u0301', shapeType: 'rect', bbox: { x: 2, y: 2, width: 2, height: 2 } },
  ])
  assert.equal(
    buildLayoutSnapshot(inspect).risks.some((risk) => risk.code === 'duplicate-object-name'),
    false,
  )
})

test('layout semantic projection excludes display fields but retains review identity', () => {
  const inspect = simpleInspect([
    { id: 1, name: 'Same', shapeType: 'rect', bbox: { x: 1, y: 1, width: 2, height: 2 } },
    { id: 2, name: 'Same', shapeType: 'rect', bbox: { x: 2, y: 2, width: 2, height: 2 } },
  ])
  const original = buildLayoutSnapshot(inspect, { sourceLabel: '/one/layout.json' })
  const displayOnly = cloneJson(original)
  displayOnly.source = '/different/layout.json'
  displayOnly.summary = { displayOnly: true }
  displayOnly.risks[0].message = 'different display message'
  displayOnly.risks[0].previewFile = 'different-preview.png'
  displayOnly.risks[0].slideNumber = 999
  assert.deepEqual(layoutSemanticProjectionV1(displayOnly), layoutSemanticProjectionV1(original))
  assert.equal(layoutSemanticSha256(displayOnly), layoutSemanticSha256(original))

  displayOnly.risks[0].reviewIdentity.sha256 = 'f'.repeat(64)
  assert.notEqual(layoutSemanticSha256(displayOnly), layoutSemanticSha256(original))
})

test('ambiguous name selector is block when planned and applied', () => {
  const inspect = simpleInspect([
    { id: 1, name: 'Same', shapeType: 'connector', bbox: { x: 1, y: 1, width: 2, height: 0 } },
    { id: 2, name: 'Same', shapeType: 'connector', bbox: { x: 2, y: 2, width: 2, height: 0 } },
  ])
  const opResults = [
    {
      opIndex: 0,
      op: 'set-shape',
      status: 'success',
      semanticChanges: [],
      resolvedSelectors: [
        {
          field: 'shape',
          input: { name: 'Same' },
          resolved: { kind: 'shape', slide: 0, id: 1, shapeType: 'connector', name: 'Same' },
        },
      ],
    },
  ]
  const dryRun = { schemaVersion: 'pptx-dry-run/v1', status: 'success', opResults }
  const planned = evaluateFindings(buildInput({ sourceInspect: inspect, dryRun }))
  assert.equal(findingByCode(planned, 'duplicate-object-name').selectorUsage.status, 'planned')
  assert.equal(findingByCode(planned, 'duplicate-object-name').decision.disposition, 'block')

  const apply = { schemaVersion: 'pptx-apply/v1', status: 'success', opResults }
  const applied = evaluateFindings(buildInput({ sourceInspect: inspect, dryRun, apply }))
  assert.equal(findingByCode(applied, 'duplicate-object-name').selectorUsage.status, 'applied')
  assert.equal(applied.agentGate.proposedStatus, 'fail')
})

test('semantic diff alone never fabricates selector usage', () => {
  const inspect = simpleInspect([
    { id: 1, name: 'Same', shapeType: 'connector', bbox: { x: 1, y: 1, width: 2, height: 0 } },
    { id: 2, name: 'Same', shapeType: 'connector', bbox: { x: 2, y: 2, width: 2, height: 0 } },
  ])
  const report = evaluateFindings(buildInput({ sourceInspect: inspect }))
  assert.equal(findingByCode(report, 'duplicate-object-name').selectorUsage.status, 'unknown')
})

test('operation evidence rejects malformed resolved selector locations without coercion', () => {
  const inspect = simpleInspect([])
  const selector = {
    field: 'shape',
    input: { name: 'Same' },
    resolved: { kind: 'shape', slide: 0, id: 1, shapeType: 'connector', name: 'Same' },
  }
  for (const mutate of [
    (value) => {
      value.resolved.slide = '0'
    },
    (value) => {
      delete value.resolved.slide
    },
    (value) => {
      value.resolved.id = '1'
    },
    (value) => {
      value.input = { shape: { name: 'Same' } }
    },
    (value) => {
      value.resolved.slideIndex = 0
    },
  ]) {
    const invalid = cloneJson(selector)
    mutate(invalid)
    const dryRun = {
      schemaVersion: 'pptx-dry-run/v1',
      status: 'success',
      opResults: [{ opIndex: 0, op: 'set-shape', status: 'success', resolvedSelectors: [invalid] }],
    }
    const report = evaluateFindings(buildInput({ sourceInspect: inspect, dryRun }))
    assert.equal(report.evaluation.status, 'failed')
    assert.ok(
      report.evaluation.errors.some(
        (error) => error.code === 'finding-analysis-mutation-evidence-invalid',
      ),
    )
    assert.equal(report.analysisIdentity, null)
  }
})

test('dry-run/apply patch mismatch fails with structured mutation evidence error', () => {
  const inspect = simpleInspect([])
  const dryRun = { schemaVersion: 'pptx-dry-run/v1', status: 'success', opResults: [] }
  const apply = { schemaVersion: 'pptx-apply/v1', status: 'success', opResults: [] }
  const input = buildInput({ sourceInspect: inspect, dryRun, apply })
  input.mutationEvidence.apply.binding.patchSha256 = '4'.repeat(64)
  const report = evaluateFindings(input)
  assert.equal(report.evaluation.status, 'failed')
  assert.equal(report.analysisIdentity, null)
  assert.equal(report.evaluation.errors[0].code, 'finding-analysis-mutation-evidence-invalid')
  assert.equal(report.agentGate.effectiveStatus, 'not-applied')
})

test('body content becoming empty is a non-reviewable block', () => {
  const sourceInspect = simpleInspect([
    {
      id: 10,
      name: 'Body',
      shapeType: 'placeholder',
      textPreview: 'Important content',
      fontFamily: 'Aptos',
      fontSizePt: 18,
      placeholder: { type: 'body', idx: 1 },
      bbox: { x: 10, y: 10, width: 100, height: 50 },
    },
  ])
  const candidateInspect = simpleInspect([
    {
      id: 10,
      name: 'Body',
      shapeType: 'placeholder',
      textPreview: '',
      placeholder: { type: 'body', idx: 1 },
      bbox: { x: 10, y: 10, width: 100, height: 50 },
    },
  ])
  const report = evaluateFindings(buildInput({ sourceInspect, candidateInspect }))
  const finding = findingByCode(report, 'empty-placeholder')
  assert.equal(finding.delta.status, 'worsened')
  assert.equal(finding.decision.disposition, 'block')
  assert.equal(finding.review.eligibility, 'non-reviewable')
})

test('known non-MVP layout codes pass through conservatively', () => {
  const sourceInspect = simpleInspect([])
  const candidateInspect = simpleInspect([
    { id: 5, name: 'Broken', shapeType: 'rect', bbox: { x: 1, y: 1, width: 0, height: 4 } },
  ])
  const report = evaluateFindings(buildInput({ sourceInspect, candidateInspect }))
  const finding = findingByCode(report, 'bbox-invalid')
  assert.equal(finding.decision.disposition, 'review')
  assert.equal(finding.decision.action, 'inspect-preview')
  assert.equal(report.agentGate.proposedStatus, 'warn')
})

test('multiple small font sizes on one object produce stable unique finding keys', () => {
  const inspect = simpleInspect([
    {
      id: 5,
      name: 'Tiny',
      shapeType: 'text',
      textPreview: 'Tiny text',
      fontFamily: 'Aptos',
      runs: [
        { fontFamily: 'Aptos', fontSizePt: 4 },
        { fontFamily: 'Aptos', fontSizePt: 5 },
      ],
      bbox: { x: 10, y: 10, width: 100, height: 50 },
    },
  ])
  const report = evaluateFindings(buildInput({ sourceInspect: inspect }))
  const findings = report.findings.filter(
    (finding) => finding.rawFinding.code === 'font-size-too-small',
  )
  assert.equal(findings.length, 2)
  assert.equal(new Set(findings.map((finding) => finding.findingKey.sha256)).size, 2)
  assert.deepEqual(
    findings.map((finding) => finding.rawFinding.sizePt).sort((a, b) => a - b),
    [4, 5],
  )
})

test('source-only findings are recorded as resolved and never govern the gate', () => {
  const sourceInspect = simpleInspect([
    {
      id: 10,
      name: 'Body',
      shapeType: 'placeholder',
      placeholder: { type: 'body', idx: 1 },
      bbox: { x: 10, y: 10, width: 100, height: 50 },
    },
  ])
  const candidateInspect = simpleInspect([
    {
      id: 10,
      name: 'Body',
      shapeType: 'placeholder',
      textPreview: 'Restored',
      fontFamily: 'Aptos',
      fontSizePt: 18,
      placeholder: { type: 'body', idx: 1 },
      bbox: { x: 10, y: 10, width: 100, height: 50 },
    },
  ])
  const report = evaluateFindings(buildInput({ sourceInspect, candidateInspect }))
  assert.equal(report.findings.length, 0)
  assert.equal(report.resolvedFindings.length, 1)
  assert.equal(report.resolvedFindings[0].delta.status, 'resolved')
  assert.equal(report.agentGate.proposedStatus, 'pass')
})

test('pending review warns with a human and fails unattended while shadow stays non-effective', () => {
  const inspect = simpleInspect([
    {
      id: 10,
      name: 'Page Number',
      shapeType: 'placeholder',
      placeholder: { type: 'sldNum', idx: 12 },
      bbox: { x: 10, y: 10, width: 100, height: 50 },
    },
  ])
  const human = evaluateFindings(buildInput({ sourceInspect: inspect }))
  const unattended = evaluateFindings(
    buildInput({ sourceInspect: inspect, automation: 'unattended' }),
  )
  assert.equal(human.agentGate.proposedStatus, 'warn')
  assert.equal(unattended.agentGate.proposedStatus, 'fail')
  assert.equal(unattended.agentGate.effectiveStatus, 'not-applied')
})

test('layout semantic binding mismatch fails closed even when artifact SHA is present', () => {
  const inspect = simpleInspect([])
  const input = buildInput({ sourceInspect: inspect })
  input.candidateLayout.binding.layoutSemanticSha256 = 'f'.repeat(64)
  const report = evaluateFindings(input)
  assert.equal(report.evaluation.status, 'failed')
  assert.equal(report.evaluation.errors[0].code, 'finding-analysis-binding-stale')
})

test('review evaluation rejects truncated pass envelopes instead of treating arrays as empty', () => {
  const inspect = simpleInspect([])
  for (const missingField of ['applied', 'errors']) {
    const input = buildInput({ sourceInspect: inspect })
    delete input.reviewEvaluation.report[missingField]
    const report = evaluateFindings(input)
    assert.equal(report.evaluation.status, 'failed')
    assert.ok(
      report.evaluation.errors.some(
        (item) => item.code === 'finding-analysis-review-evaluation-invalid',
      ),
    )
  }
})

test('valid unchanged review acceptance is applied without rewriting disposition', () => {
  const inspect = simpleInspect([
    {
      id: 10,
      name: 'Page Number',
      shapeType: 'placeholder',
      placeholder: { type: 'sldNum', idx: 12 },
      bbox: { x: 10, y: 10, width: 100, height: 50 },
    },
  ])
  const input = buildInput({ sourceInspect: inspect })
  const rawFinding = input.candidateLayout.report.risks[0]
  const fingerprint = rawFinding.reviewIdentity.sha256
  const evaluation = emptyReviewEvaluation(
    SHA.source,
    SHA.candidate,
    input.candidateLayout.binding.layoutArtifactSha256,
  )
  evaluation.applied = [
    {
      reviewId: 'intentional-sldnum',
      disposition: 'accepted',
      reason: 'intentional',
      findingIndex: 0,
      finding: rawFinding,
      matchMode: 'fingerprint',
      findingSha256: fingerprint,
    },
  ]
  evaluation.summary.appliedReviewCount = 1
  evaluation.summary.reviewedFindingCount = 1
  input.reviewEvaluation = { report: evaluation, artifactSha256: artifactSha256(evaluation) }

  const report = evaluateFindings(input)
  const finding = findingByCode(report, 'empty-placeholder')
  assert.equal(finding.review.status, 'accepted')
  assert.equal(finding.decision.disposition, 'review')
  assert.equal(report.summary.unresolvedFindingCount, 0)
  assert.equal(report.agentGate.proposedStatus, 'pass')
})

test('review acceptance of a non-reviewable regression fails atomically with repair details', () => {
  const sourceInspect = simpleInspect([
    {
      id: 10,
      name: 'Body',
      shapeType: 'placeholder',
      textPreview: 'Content',
      fontFamily: 'Aptos',
      fontSizePt: 18,
      placeholder: { type: 'body', idx: 1 },
      bbox: { x: 10, y: 10, width: 100, height: 50 },
    },
  ])
  const candidateInspect = simpleInspect([
    {
      id: 10,
      name: 'Body',
      shapeType: 'placeholder',
      placeholder: { type: 'body', idx: 1 },
      bbox: { x: 10, y: 10, width: 100, height: 50 },
    },
  ])
  const input = buildInput({ sourceInspect, candidateInspect })
  const rawFinding = input.candidateLayout.report.risks[0]
  const evaluation = emptyReviewEvaluation(
    SHA.source,
    SHA.candidate,
    input.candidateLayout.binding.layoutArtifactSha256,
  )
  evaluation.applied = [
    {
      reviewId: 'bad-acceptance',
      disposition: 'accepted',
      reason: 'should not apply',
      findingIndex: 0,
      finding: rawFinding,
      matchMode: 'fingerprint',
      findingSha256: rawFinding.reviewIdentity.sha256,
    },
  ]
  input.reviewEvaluation = { report: evaluation, artifactSha256: artifactSha256(evaluation) }
  const report = evaluateFindings(input)
  const error = report.evaluation.errors[0]

  assert.equal(report.evaluation.status, 'failed')
  assert.equal(error.code, 'finding-analysis-review-not-eligible')
  assert.equal(error.reviewId, 'bad-acceptance')
  assert.equal(error.findingCode, 'empty-placeholder')
  assert.equal(error.eligibility, 'non-reviewable')
  assert.match(error.findingKey, /^[0-9a-f]{64}$/)
  assert.equal(report.agentGate.nextAction, 'remove-ineligible-review-and-rerun')
})

test('introduced finding cannot inherit an old v1 acceptance', () => {
  const sourceInspect = simpleInspect([])
  const candidateInspect = simpleInspect([
    {
      id: 10,
      name: 'Page Number',
      shapeType: 'placeholder',
      placeholder: { type: 'sldNum', idx: 12 },
      bbox: { x: 10, y: 10, width: 100, height: 50 },
    },
  ])
  const input = buildInput({ sourceInspect, candidateInspect })
  const rawFinding = input.candidateLayout.report.risks[0]
  const evaluation = emptyReviewEvaluation(
    SHA.source,
    SHA.candidate,
    input.candidateLayout.binding.layoutArtifactSha256,
  )
  evaluation.applied = [
    {
      reviewId: 'old-review',
      disposition: 'accepted',
      reason: 'old context',
      findingIndex: 0,
      finding: rawFinding,
      matchMode: 'fingerprint',
      findingSha256: rawFinding.reviewIdentity.sha256,
    },
  ]
  input.reviewEvaluation = { report: evaluation, artifactSha256: artifactSha256(evaluation) }
  const report = evaluateFindings(input)
  const finding = findingByCode(report, 'empty-placeholder')

  assert.equal(report.evaluation.status, 'complete')
  assert.equal(finding.review.status, 'stale')
  assert.equal(report.evaluation.diagnostics.at(-1).code, 'finding-analysis-review-context-stale')
  assert.equal(report.agentGate.proposedStatus, 'warn')
})

test('finding and object order do not affect semantic identity', () => {
  const { inspect } = fixtureInspect()
  const firstInput = buildInput({ sourceInspect: inspect, reviewEvaluation: null })
  const first = evaluateFindings(firstInput)
  const secondInput = cloneJson(firstInput)
  secondInput.sourceLayout.report.risks.reverse()
  secondInput.candidateLayout.report.risks.reverse()
  secondInput.sourceLayout.report.slides[0].objects.reverse()
  secondInput.candidateLayout.report.slides[0].objects.reverse()
  secondInput.sourceLayout.binding.layoutArtifactSha256 = artifactSha256(
    secondInput.sourceLayout.report,
  )
  secondInput.candidateLayout.binding.layoutArtifactSha256 = artifactSha256(
    secondInput.candidateLayout.report,
  )
  const second = evaluateFindings(secondInput)

  assert.equal(second.evaluation.status, 'complete')
  assert.equal(first.analysisIdentity.sha256, second.analysisIdentity.sha256)
  assert.deepEqual(
    first.findings.map((finding) => finding.findingKey.sha256),
    second.findings.map((finding) => finding.findingKey.sha256),
  )
})

test('analysis identity excludes assurance and derived semantic-diff summaries', () => {
  const input = buildInput({ sourceInspect: simpleInspect([]), reviewEvaluation: null })
  const baseline = evaluateFindings(input)

  const advisory = cloneJson(input)
  advisory.bindingContext.assurance = 'advisory-replay'
  assert.equal(evaluateFindings(advisory).analysisIdentity.sha256, baseline.analysisIdentity.sha256)

  const derivedOnly = cloneJson(input)
  derivedOnly.mutationEvidence.semanticDiff.report.agentGate = { semanticStatus: 'different' }
  derivedOnly.mutationEvidence.semanticDiff.report.summary = { reliableChanges: 999 }
  derivedOnly.mutationEvidence.semanticDiff.report.changeRollup = { displayOnly: true }
  assert.equal(
    evaluateFindings(derivedOnly).analysisIdentity.sha256,
    baseline.analysisIdentity.sha256,
  )

  const semanticChange = cloneJson(input)
  semanticChange.mutationEvidence.semanticDiff.report.slides = [
    { slideIndex: 0, changes: [{ kind: 'text-change' }] },
  ]
  assert.notEqual(
    evaluateFindings(semanticChange).analysisIdentity.sha256,
    baseline.analysisIdentity.sha256,
  )
})

test('analysis never mutates layout, mutation, or review inputs', () => {
  const { inspect } = fixtureInspect()
  const input = buildInput({ sourceInspect: inspect })
  const before = JSON.stringify(input)
  evaluateFindings(input)
  assert.equal(JSON.stringify(input), before)
})

test('1,000 objects and findings stay on the pure linear analysis path', () => {
  const shapes = Array.from({ length: 1000 }, (_, index) => ({
    id: index + 1,
    name: `Tiny ${index}`,
    shapeType: 'text',
    textPreview: `Text ${index}`,
    fontFamily: 'Aptos',
    fontSizePt: 5,
    bbox: { x: 10 + index, y: 10, width: 100, height: 50 },
  }))
  const input = buildInput({ sourceInspect: simpleInspect(shapes), reviewEvaluation: null })
  const started = performance.now()
  const report = evaluateFindings(input)
  const elapsed = performance.now() - started
  assert.equal(report.evaluation.status, 'complete')
  assert.equal(report.findings.length, 1000)
  assert.ok(elapsed < 5000, `Finding Analysis took ${elapsed.toFixed(2)}ms`)
})

test('advisory replay stays non-effective in shadow and fails in required mode', () => {
  const inspect = simpleInspect([])
  const shadow = evaluateFindings(
    buildInput({ sourceInspect: inspect, assurance: 'advisory-replay' }),
  )
  assert.equal(shadow.evaluation.status, 'complete')
  assert.equal(shadow.agentGate.effectiveStatus, 'not-applied')
  assert.ok(
    shadow.evaluation.diagnostics.some((item) => item.code === 'finding-analysis-advisory-replay'),
  )

  const required = evaluateFindings(
    buildInput({
      sourceInspect: inspect,
      assurance: 'advisory-replay',
      enforcement: 'required',
    }),
  )
  assert.equal(required.evaluation.status, 'failed')
  assert.equal(required.agentGate.effectiveStatus, 'fail')
  assert.equal(required.evaluation.errors[0].code, 'finding-analysis-input-invalid')
})

test('standalone CLI writes full advisory evidence and keeps stdout compact', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-fa-cli-'))
  const sourcePptx = join(root, 'source.pptx')
  const candidatePptx = join(root, 'candidate.pptx')
  const sourceLayoutPath = join(root, 'layout-source.json')
  const candidateLayoutPath = join(root, 'layout-final.json')
  const semanticDiffPath = join(root, 'pptx-diff.json')
  const outputPath = join(root, 'finding-analysis.json')
  writeFileSync(sourcePptx, 'source bytes')
  writeFileSync(candidatePptx, 'candidate bytes')
  const inspect = simpleInspect([])
  const sourceLayout = buildLayoutSnapshot(inspect, { sourceLabel: '/one/source.json' })
  const candidateLayout = buildLayoutSnapshot(inspect, { sourceLabel: '/two/candidate.json' })
  const semanticDiff = {
    schemaVersion: 'pptx-diff/v1',
    status: 'success',
    agentGate: { semanticStatus: 'pass' },
    summary: { reliableChanges: 0, uncertainChanges: 0, unsupportedRegions: 0 },
    slides: [],
  }
  writeFileSync(sourceLayoutPath, artifactBytes(sourceLayout))
  writeFileSync(candidateLayoutPath, artifactBytes(candidateLayout))
  writeFileSync(semanticDiffPath, artifactBytes(semanticDiff))

  const cli = join(repoRoot, 'pptx-nova/scripts/pptx-nova-finding-analysis.mjs')
  const result = spawnSync(
    process.execPath,
    [
      cli,
      '--source-layout',
      sourceLayoutPath,
      '--candidate-layout',
      candidateLayoutPath,
      '--source-pptx',
      sourcePptx,
      '--candidate-pptx',
      candidatePptx,
      '--semantic-diff',
      semanticDiffPath,
      '--output',
      outputPath,
      '--json',
    ],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const compact = JSON.parse(result.stdout)
  const full = JSON.parse(readFileSync(outputPath, 'utf8'))
  assert.equal(compact.status, 'complete')
  assert.equal(full.bindings.assurance, 'advisory-replay')
  assert.equal(full.agentGate.effectiveStatus, 'not-applied')
  assert.ok(
    full.evaluation.diagnostics.some((item) => item.code === 'finding-analysis-advisory-replay'),
  )
  assert.ok(result.stdout.length < readFileSync(outputPath, 'utf8').length)

  const requiredOutput = join(root, 'finding-analysis-required.json')
  const required = spawnSync(
    process.execPath,
    [
      cli,
      '--source-layout',
      sourceLayoutPath,
      '--candidate-layout',
      candidateLayoutPath,
      '--source-pptx',
      sourcePptx,
      '--candidate-pptx',
      candidatePptx,
      '--semantic-diff',
      semanticDiffPath,
      '--output',
      requiredOutput,
      '--enforcement',
      'required',
      '--json',
    ],
    { encoding: 'utf8' },
  )
  assert.equal(required.status, 1)
  const requiredReport = JSON.parse(readFileSync(requiredOutput, 'utf8'))
  assert.equal(requiredReport.evaluation.status, 'failed')
  assert.equal(requiredReport.agentGate.effectiveStatus, 'fail')
})

test('topFindings aggregates same-code informational findings into one representative entry', () => {
  const shapes = [
    ...Array.from({ length: 4 }, (_, index) => ({
      id: 20 + index,
      name: `Caption ${index + 1}`,
      shapeType: 'text',
      textPreview: `Caption text ${index + 1}`,
      fontSizePt: 12,
      bbox: { x: 10 + index * 120, y: 10, width: 100, height: 30 },
    })),
    {
      id: 101,
      name: 'Slide Number Placeholder',
      shapeType: 'placeholder',
      textPreview: '',
      placeholder: { type: 'sldNum', idx: 12 },
      bbox: { x: 850, y: 480, width: 30, height: 20 },
    },
  ]
  const report = evaluateFindings(buildInput({ sourceInspect: simpleInspect(shapes) }))

  assert.equal(report.evaluation.status, 'complete')
  assert.equal(report.summary.findingCount, 5)
  const topFindings = report.summary.topFindings
  assert.equal(topFindings.length, 2)
  assert.equal(topFindings[0].code, 'empty-placeholder')
  assert.equal(topFindings[0].aggregated, undefined)
  const informational = topFindings[1]
  assert.equal(informational.code, 'font-family-missing')
  assert.equal(informational.disposition, 'informational')
  assert.equal(informational.aggregated, true)
  assert.equal(informational.aggregatedCount, 4)
  assert.deepEqual(informational.aggregatedSlideNumbers, [1])
})

test('annotateTopActionable marks inherited, introduced, and mixed code groups', () => {
  const findingReport = {
    findings: [
      { rawFinding: { code: 'bbox-off-canvas' }, delta: { status: 'unchanged' } },
      { rawFinding: { code: 'bbox-off-canvas' }, delta: { status: 'unchanged' } },
      { rawFinding: { code: 'font-size-too-small' }, delta: { status: 'introduced' } },
      { rawFinding: { code: 'duplicate-object-name' }, delta: { status: 'unchanged' } },
      { rawFinding: { code: 'duplicate-object-name' }, delta: { status: 'introduced' } },
    ],
  }
  const annotated = annotateTopActionable(
    [
      { code: 'bbox-off-canvas', classification: 'actionable', count: 2 },
      { code: 'font-size-too-small', classification: 'actionable', count: 1 },
      { code: 'duplicate-object-name', classification: 'actionable', count: 2 },
      { code: 'not-analyzed-code', classification: 'actionable', count: 1 },
    ],
    findingReport,
  )
  assert.deepEqual(annotated[0], {
    code: 'bbox-off-canvas',
    classification: 'actionable',
    count: 2,
    deltaStatus: 'unchanged',
    inherited: true,
    inheritedCount: 2,
    introducedCount: 0,
  })
  assert.equal(annotated[1].deltaStatus, 'introduced')
  assert.equal(annotated[1].inherited, false)
  assert.equal(annotated[2].deltaStatus, 'mixed')
  assert.equal(annotated[2].inherited, false)
  assert.deepEqual(annotated[3], {
    code: 'not-analyzed-code',
    classification: 'actionable',
    count: 1,
  })
  assert.deepEqual(annotateTopActionable([], findingReport), [])
  const untouched = [{ code: 'bbox-off-canvas', classification: 'actionable', count: 2 }]
  assert.equal(annotateTopActionable(untouched, { findings: [] }), untouched)
})

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}
