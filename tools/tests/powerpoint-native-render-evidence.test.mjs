import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  evaluateChartExNativeRender,
  inspectChartExPackage,
} from '../../pptx-nova/scripts/lib/powerpoint-native-render-evidence.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const FINALIZER = join(ROOT, 'pptx-nova/scripts/pptx-nova-finalize-evidence.mjs')

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function storedZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, value] of entries) {
    const nameBytes = Buffer.from(name)
    const data = Buffer.from(value)
    const local = Buffer.alloc(30 + nameBytes.length + data.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    nameBytes.copy(local, 30)
    data.copy(local, 30 + nameBytes.length)
    locals.push(local)

    const central = Buffer.alloc(46 + nameBytes.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(0, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    nameBytes.copy(central, 46)
    centrals.push(central)
    offset += local.length
  }
  const centralBytes = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBytes.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBytes, eocd])
}

function writeCandidate(runDir, { chartEx = true } = {}) {
  const entries = [['[Content_Types].xml', '<Types/>']]
  if (chartEx) {
    entries.push(['ppt/charts/chartEx1.xml', '<cx:chart/>'])
    entries.push([
      'ppt/slides/_rels/slide2.xml.rels',
      '<Relationships><Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2014/relationships/chartEx" Target="../charts/chartEx1.xml"/></Relationships>',
    ])
  }
  const path = join(runDir, 'candidate.pptx')
  writeFileSync(path, storedZip(entries))
  return path
}

function writePng(path, width = 320, height = 180) {
  const bytes = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  writeFileSync(path, bytes)
  return bytes
}

function writeArtifact(runDir, candidatePath, { hash = null, method = 'pdf-render' } = {}) {
  const imagePath = join(runDir, 'powerpoint-slide-2.png')
  const imageBytes = writePng(imagePath)
  const candidateBytes = readFileSync(candidatePath)
  const artifactPath = join(runDir, 'powerpoint-native-render.json')
  writeFileSync(
    artifactPath,
    `${JSON.stringify({
      schema_version: 'pptx-snapshot/v1',
      status: 'ok',
      method,
      pptx_path: candidatePath,
      pptx_sha256: hash ?? sha256(candidateBytes),
      slides: [2],
      outputs: [
        {
          slide: 2,
          output_path: imagePath,
          image: {
            pixel_width: 320,
            pixel_height: 180,
            byte_length: imageBytes.length,
            sha256: sha256(imageBytes),
          },
        },
      ],
    })}\n`,
  )
  return artifactPath
}

function writeFinalizerInputs(runDir, candidatePath) {
  const inspectPath = join(runDir, 'final-inspect.json')
  const visionPath = join(runDir, 'vision.json')
  writeFileSync(
    inspectPath,
    `${JSON.stringify({
      schemaVersion: 'pptx-inspect/v1',
      status: 'success',
      input: candidatePath,
      presentation: { slideCount: 2, size: { width: '13.333in', height: '7.5in' } },
      slides: [
        { index: 0, shapes: [] },
        {
          index: 1,
          shapes: [
            {
              id: '1',
              name: 'ChartEx',
              shapeType: 'chart',
              bbox: { xEmu: 100000, yEmu: 100000, wEmu: 3000000, hEmu: 2000000 },
            },
          ],
        },
      ],
    })}\n`,
  )
  writeFileSync(
    visionPath,
    `${JSON.stringify({
      schemaVersion: 'pptx-vision/v1',
      status: 'success',
      summary: { issueCount: 0, bySeverity: { high: 0, medium: 0, low: 0 } },
      issues: [],
      semanticSummary: {
        passed: true,
        issueCount: 0,
        sourceRuleCount: 82,
        normalizedRuleCount: 81,
      },
      semanticIssues: [],
    })}\n`,
  )
  return { inspectPath, visionPath }
}

test('ChartEx package inspection maps modern chart parts to one-based slides', () => {
  const runDir = mkdtempSync(join(tmpdir(), 'pptx-native-evidence-package-'))
  const candidatePath = writeCandidate(runDir)
  assert.deepEqual(inspectChartExPackage(candidatePath), {
    hasChartEx: true,
    chartExParts: ['ppt/charts/chartEx1.xml'],
    chartExSlides: [2],
    unmappedParts: [],
  })
})

test('ChartEx evidence fails closed when PowerPoint is available and render evidence is absent', () => {
  const runDir = mkdtempSync(join(tmpdir(), 'pptx-native-evidence-required-'))
  const candidatePath = writeCandidate(runDir)
  const result = evaluateChartExNativeRender({
    candidatePath,
    runDir,
    artifactPath: null,
    availability: { available: true, reason: 'available' },
  })
  assert.equal(result.status, 'failed')
  assert.equal(result.reason, 'native-render-required')
})

test('ChartEx evidence discloses unresolved risk when PowerPoint is unavailable', () => {
  const runDir = mkdtempSync(join(tmpdir(), 'pptx-native-evidence-unavailable-'))
  const candidatePath = writeCandidate(runDir)
  const result = evaluateChartExNativeRender({
    candidatePath,
    runDir,
    artifactPath: null,
    availability: { available: false, reason: 'unsupported-platform' },
  })
  assert.equal(result.status, 'warning')
  assert.equal(result.reason, 'powerpoint-unavailable-native-render-unverified')
})

test('ChartEx evidence accepts candidate-bound pdf-render outputs with verified PNG identities', () => {
  const runDir = mkdtempSync(join(tmpdir(), 'pptx-native-evidence-valid-'))
  const candidatePath = writeCandidate(runDir)
  const artifactPath = writeArtifact(runDir, candidatePath)
  const result = evaluateChartExNativeRender({
    candidatePath,
    runDir,
    artifactPath,
    availability: { available: false, reason: 'unsupported-platform' },
  })
  assert.equal(result.status, 'passed')
  assert.deepEqual(result.validation.report.coveredSlides, [2])
  assert.equal(result.validation.images[0].sha256.length, 64)
})

test('ChartEx evidence rejects stale same-path candidate hashes', () => {
  const runDir = mkdtempSync(join(tmpdir(), 'pptx-native-evidence-stale-'))
  const candidatePath = writeCandidate(runDir)
  const artifactPath = writeArtifact(runDir, candidatePath, { hash: '0'.repeat(64) })
  const result = evaluateChartExNativeRender({
    candidatePath,
    runDir,
    artifactPath,
    availability: { available: true, reason: 'available' },
  })
  assert.equal(result.status, 'failed')
  assert.ok(
    result.validation.errors.some(
      (item) => item.code === 'chartex-native-render-candidate-hash-mismatch',
    ),
  )
})

test('high-risk finalizer publishes the ChartEx PowerPoint-native gate in its agent summary', () => {
  const runDir = mkdtempSync(join(tmpdir(), 'pptx-native-evidence-finalizer-'))
  const candidatePath = writeCandidate(runDir)
  const artifactPath = writeArtifact(runDir, candidatePath)
  const { inspectPath, visionPath } = writeFinalizerInputs(runDir, candidatePath)
  const result = spawnSync(
    process.execPath,
    [
      FINALIZER,
      '--mode',
      'studio-create',
      '--run-dir',
      runDir,
      '--candidate',
      candidatePath,
      '--final-inspect',
      inspectPath,
      '--vision',
      visionPath,
      '--powerpoint-native-render',
      artifactPath,
      '--json',
    ],
    { cwd: ROOT, encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, 'pass')
  assert.equal(report.agentSummary.gates.powerpointNativeRender.gate, 'passed')
  assert.deepEqual(report.agentSummary.gates.powerpointNativeRender.chartExSlides, [2])
})
