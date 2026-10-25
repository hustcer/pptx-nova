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
} from '../../../pptx-nova/scripts/lib/review/powerpoint-native-render-evidence.mjs'

import { storedZip, contentTypes } from '../helpers/pptx-package.mjs'

const ROOT = resolve(import.meta.dirname, '../../..')
const FINALIZER = join(ROOT, 'pptx-nova/scripts/cli/review/finalize-evidence.mjs')

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function writeCandidate(runDir, { chartEx = true, hidden = false } = {}) {
  const entries = [
    [
      '[Content_Types].xml',
      contentTypes([
        [
          'ppt/slides/slide1.xml',
          'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
        ],
        [
          'ppt/slides/slide2.xml',
          'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
        ],
        ...(chartEx ? [['ppt/charts/chartEx1.xml', 'application/vnd.ms-office.chartex+xml']] : []),
      ]),
    ],
    [
      'ppt/presentation.xml',
      '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="a"/><p:sldId id="257" r:id="b"/></p:sldIdLst></p:presentation>',
    ],
    [
      'ppt/_rels/presentation.xml.rels',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="a" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="b" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>',
    ],
    [
      'ppt/slides/slide1.xml',
      '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"' +
        (hidden ? ' show="0"' : '') +
        '/>',
    ],
    [
      'ppt/slides/slide2.xml',
      '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>',
    ],
  ]
  if (chartEx) {
    entries.push(['ppt/charts/chartEx1.xml', '<cx:chart/>'])
    entries.push([
      'ppt/slides/_rels/slide2.xml.rels',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2014/relationships/chartEx" Target="../charts/chartEx1.xml"/></Relationships>',
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

test('ChartEx scope follows OPC types and presentation order rather than filenames', () => {
  const runDir = mkdtempSync(join(tmpdir(), 'pptx-native-evidence-relocated-'))
  const candidatePath = join(runDir, 'relocated.pptx')
  writeFileSync(
    candidatePath,
    storedZip([
      [
        '[Content_Types].xml',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/assets/plot.data" ContentType="application/vnd.ms-office.chartex+xml"/><Override PartName="/pages/last.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/pages/first.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>',
      ],
      [
        'ppt/presentation.xml',
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="last"/><p:sldId id="257" r:id="first"/></p:sldIdLst></p:presentation>',
      ],
      [
        'ppt/_rels/presentation.xml.rels',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="first" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../pages/first.xml"/><Relationship Id="last" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../pages/last.xml"/></Relationships>',
      ],
      [
        'pages/first.xml',
        '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>',
      ],
      [
        'pages/last.xml',
        '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>',
      ],
      [
        'pages/_rels/first.xml.rels',
        '<r:Relationships xmlns:r="http://schemas.openxmlformats.org/package/2006/relationships"><r:Relationship Id="chart" Type="http://schemas.microsoft.com/office/2014/relationships/chartEx" Target="../assets/plot.data"/></r:Relationships>',
      ],
      [
        'assets/plot.data',
        '<cx:chartSpace xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex"/>',
      ],
      ['ppt/charts/chartEx-decoy.xml', '<unrelated/>'],
    ]),
  )
  assert.deepEqual(inspectChartExPackage(candidatePath), {
    hasChartEx: true,
    chartExParts: ['assets/plot.data'],
    chartExSlides: [2],
    unmappedParts: [],
  })
})

test('ChartEx evidence fails closed when the optional native-render route is available and evidence is absent', () => {
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

test('ChartEx evidence discloses unresolved risk when the optional native-render route is unavailable', () => {
  const runDir = mkdtempSync(join(tmpdir(), 'pptx-native-evidence-unavailable-'))
  const candidatePath = writeCandidate(runDir)
  const result = evaluateChartExNativeRender({
    candidatePath,
    runDir,
    artifactPath: null,
    availability: { available: false, reason: 'unsupported-platform' },
  })
  assert.equal(result.status, 'warning')
  assert.equal(result.reason, 'native-render-helper-unavailable-unverified')
})

test('ChartEx evidence does not require the optional Nushell helper when it is unavailable', () => {
  const runDir = mkdtempSync(join(tmpdir(), 'pptx-native-evidence-no-nu-'))
  const candidatePath = writeCandidate(runDir)
  const result = evaluateChartExNativeRender({
    candidatePath,
    runDir,
    artifactPath: null,
    availability: {
      available: false,
      reason: 'optional-nushell-helper-unavailable',
      powerpointAvailable: true,
      nushellAvailable: false,
      mutoolAvailable: true,
    },
  })
  assert.equal(result.status, 'warning')
  assert.equal(result.reason, 'native-render-helper-unavailable-unverified')
  assert.equal(result.availability.powerpointAvailable, true)
  assert.equal(result.availability.nushellAvailable, false)
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

test('ChartEx evidence requires correct physical PDF mapping when hidden slides precede it', () => {
  const runDir = mkdtempSync(join(tmpdir(), 'pptx-native-evidence-hidden-'))
  const candidatePath = writeCandidate(runDir, { hidden: true })
  const artifactPath = writeArtifact(runDir, candidatePath)
  const evaluate = () =>
    evaluateChartExNativeRender({
      candidatePath,
      runDir,
      artifactPath,
      availability: { available: true },
    })
  assert.equal(evaluate().status, 'failed')
  const report = JSON.parse(readFileSync(artifactPath, 'utf8'))
  report.pdf_page_count = 1
  report.pdf_pages = [{ slide: 2, part: 'ppt/slides/slide2.xml', hidden: false, pdf_page: 1 }]
  writeFileSync(artifactPath, JSON.stringify(report))
  assert.equal(evaluate().status, 'passed')
  report.pdf_pages[0].pdf_page = 2
  writeFileSync(artifactPath, JSON.stringify(report))
  assert.equal(evaluate().status, 'failed')
})
