import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { posix } from 'node:path'
import { inflateRawSync } from 'node:zlib'

export const POWERPOINT_SNAPSHOT_SCHEMA_VERSION = 'pptx-snapshot/v1'

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const LOCAL_FILE_SIGNATURE = 0x04034b50
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function asPositiveInteger(value) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function safeRealpath(path) {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function pathInside(root, path) {
  const rel = relative(safeRealpath(root), safeRealpath(path))
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

function findEndOfCentralDirectory(bytes) {
  const minimum = Math.max(0, bytes.length - 65_557)
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  throw new Error('PPTX ZIP central directory was not found')
}

function readZipEntries(path) {
  const bytes = readFileSync(path)
  const eocd = findEndOfCentralDirectory(bytes)
  const entryCount = bytes.readUInt16LE(eocd + 10)
  let offset = bytes.readUInt32LE(eocd + 16)
  const entries = new Map()

  for (let index = 0; index < entryCount; index += 1) {
    if (bytes.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(`Invalid PPTX ZIP central directory entry at offset ${offset}`)
    }
    const flags = bytes.readUInt16LE(offset + 8)
    const compression = bytes.readUInt16LE(offset + 10)
    const compressedSize = bytes.readUInt32LE(offset + 20)
    const uncompressedSize = bytes.readUInt32LE(offset + 24)
    const nameLength = bytes.readUInt16LE(offset + 28)
    const extraLength = bytes.readUInt16LE(offset + 30)
    const commentLength = bytes.readUInt16LE(offset + 32)
    const localHeaderOffset = bytes.readUInt32LE(offset + 42)
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    entries.set(name, {
      bytes,
      name,
      flags,
      compression,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function readZipEntry(entry) {
  if ((entry.flags & 0x1) !== 0)
    throw new Error(`Encrypted ZIP entry is unsupported: ${entry.name}`)
  const bytes = entry.bytes
  const offset = entry.localHeaderOffset
  if (bytes.readUInt32LE(offset) !== LOCAL_FILE_SIGNATURE) {
    throw new Error(`Invalid PPTX ZIP local header for ${entry.name}`)
  }
  const nameLength = bytes.readUInt16LE(offset + 26)
  const extraLength = bytes.readUInt16LE(offset + 28)
  const start = offset + 30 + nameLength + extraLength
  const compressed = bytes.subarray(start, start + entry.compressedSize)
  let result
  if (entry.compression === 0) result = compressed
  else if (entry.compression === 8) result = inflateRawSync(compressed)
  else throw new Error(`Unsupported PPTX ZIP compression method ${entry.compression}`)
  if (result.length !== entry.uncompressedSize) {
    throw new Error(`PPTX ZIP entry size mismatch for ${entry.name}`)
  }
  return result
}

function xmlAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`))
  return match?.[1] ?? match?.[2] ?? null
}

function relationshipTarget(sourcePart, target) {
  const normalized = String(target).replaceAll('\\', '/')
  if (normalized.startsWith('/')) return normalized.slice(1)
  return posix.normalize(posix.join(posix.dirname(sourcePart), normalized))
}

export function inspectChartExPackage(candidatePath) {
  const entries = readZipEntries(candidatePath)
  const chartExParts = [...entries.keys()]
    .filter((name) => /^ppt\/charts\/chartEx[^/]*\.xml$/.test(name))
    .sort()
  if (chartExParts.length === 0) {
    return { hasChartEx: false, chartExParts: [], chartExSlides: [], unmappedParts: [] }
  }

  const chartExSet = new Set(chartExParts)
  const mapped = new Set()
  const mappedParts = new Set()
  for (const [name, entry] of entries) {
    const match = name.match(/^ppt\/slides\/_rels\/slide([0-9]+)\.xml\.rels$/)
    if (!match) continue
    const slide = Number(match[1])
    const sourcePart = `ppt/slides/slide${slide}.xml`
    const xml = readZipEntry(entry).toString('utf8')
    for (const tag of xml.matchAll(/<Relationship\b[^>]*>/g)) {
      const target = xmlAttribute(tag[0], 'Target')
      if (!target || xmlAttribute(tag[0], 'TargetMode') === 'External') continue
      const part = relationshipTarget(sourcePart, target)
      if (!chartExSet.has(part)) continue
      mapped.add(slide)
      mappedParts.add(part)
    }
  }

  return {
    hasChartEx: true,
    chartExParts,
    chartExSlides: [...mapped].sort((left, right) => left - right),
    unmappedParts: chartExParts.filter((part) => !mappedParts.has(part)),
  }
}

export function detectPowerPointAvailability() {
  if (process.platform !== 'darwin') {
    return {
      available: false,
      reason: 'unsupported-platform',
      platform: process.platform,
      powerpointAvailable: false,
      nushellAvailable: false,
      mutoolAvailable: false,
    }
  }
  const powerpoint = spawnSync('osascript', ['-e', 'id of application "Microsoft PowerPoint"'], {
    encoding: 'utf8',
  })
  const nushell = spawnSync('nu', ['--version'], { encoding: 'utf8' })
  const mutool = spawnSync('mutool', ['-v'], { encoding: 'utf8' })
  const powerpointAvailable = powerpoint.status === 0
  const nushellAvailable = nushell.status === 0
  const mutoolAvailable = mutool.status === 0
  const available = powerpointAvailable && nushellAvailable && mutoolAvailable
  const reason = !powerpointAvailable
    ? 'powerpoint-not-installed-or-not-scriptable'
    : !nushellAvailable
      ? 'optional-nushell-helper-unavailable'
      : !mutoolAvailable
        ? 'optional-mutool-helper-unavailable'
        : 'available'
  return {
    available,
    reason,
    platform: process.platform,
    powerpointAvailable,
    nushellAvailable,
    mutoolAvailable,
    error: available
      ? null
      : [
          [powerpointAvailable, powerpoint],
          [nushellAvailable, nushell],
          [mutoolAvailable, mutool],
        ]
          .filter(([probeAvailable]) => !probeAvailable)
          .map(([, result]) =>
            (result.stderr || result.stdout || result.error?.message || '').trim(),
          )
          .find(Boolean) || null,
  }
}

function pngIdentity(path) {
  const bytes = readFileSync(path)
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('output is not a readable PNG image')
  }
  return {
    pixelWidth: bytes.readUInt32BE(16),
    pixelHeight: bytes.readUInt32BE(20),
    byteLength: bytes.length,
    sha256: sha256(bytes),
  }
}

function reportSlides(report) {
  const outputSlides = Array.isArray(report?.outputs)
    ? report.outputs.map((item) => asPositiveInteger(item?.slide)).filter(Boolean)
    : []
  const topSlides = Array.isArray(report?.slides)
    ? report.slides.map(asPositiveInteger).filter(Boolean)
    : []
  const single = asPositiveInteger(report?.slide)
  return [...new Set([...outputSlides, ...topSlides, ...(single ? [single] : [])])].sort(
    (left, right) => left - right,
  )
}

function outputForSlide(report, slide) {
  if (Array.isArray(report?.outputs)) {
    return report.outputs.find((item) => asPositiveInteger(item?.slide) === slide) ?? null
  }
  if (asPositiveInteger(report?.slide) === slide && report?.output_path) {
    return { slide, output_path: report.output_path, image: report.image }
  }
  return null
}

function validateImageBinding(item, runDir, errors) {
  const outputPath = item?.output_path ? resolve(item.output_path) : ''
  if (!outputPath || !existsSync(outputPath)) {
    errors.push({
      code: 'chartex-native-render-image-missing',
      slide: item?.slide ?? null,
      outputPath,
    })
    return null
  }
  if (!pathInside(runDir, outputPath)) {
    errors.push({
      code: 'chartex-native-render-image-outside-run',
      slide: item?.slide ?? null,
      outputPath,
    })
    return null
  }
  let actual
  try {
    actual = pngIdentity(outputPath)
  } catch (error) {
    errors.push({
      code: 'chartex-native-render-image-invalid',
      slide: item?.slide ?? null,
      outputPath,
      message: error.message,
    })
    return null
  }
  const declared = {
    pixelWidth: asPositiveInteger(item?.image?.pixel_width),
    pixelHeight: asPositiveInteger(item?.image?.pixel_height),
    byteLength: asPositiveInteger(item?.image?.byte_length),
    sha256: String(item?.image?.sha256 ?? '').toLowerCase(),
  }
  if (
    declared.pixelWidth !== actual.pixelWidth ||
    declared.pixelHeight !== actual.pixelHeight ||
    declared.byteLength !== actual.byteLength ||
    declared.sha256 !== actual.sha256
  ) {
    errors.push({
      code: 'chartex-native-render-image-identity-mismatch',
      slide: item?.slide ?? null,
      outputPath,
      declared,
      actual,
    })
  }
  return { slide: item?.slide ?? null, outputPath, ...actual }
}

export function validatePowerPointNativeRender({
  candidatePath,
  runDir,
  artifactPath,
  packageInfo,
}) {
  const errors = []
  if (!artifactPath || !existsSync(artifactPath)) {
    return { valid: false, errors: [{ code: 'chartex-native-render-missing' }], images: [] }
  }
  if (!pathInside(runDir, artifactPath)) {
    errors.push({ code: 'chartex-native-render-report-outside-run', artifactPath })
  }
  let report
  try {
    report = JSON.parse(readFileSync(artifactPath, 'utf8'))
  } catch (error) {
    return {
      valid: false,
      errors: [{ code: 'chartex-native-render-report-invalid', message: error.message }],
      images: [],
    }
  }

  const candidateBytes = readFileSync(candidatePath)
  const candidateSha256 = sha256(candidateBytes)
  const declaredPath = report?.pptx_path ? resolve(report.pptx_path) : ''
  if (report?.schema_version !== POWERPOINT_SNAPSHOT_SCHEMA_VERSION) {
    errors.push({
      code: 'chartex-native-render-schema-invalid',
      expected: POWERPOINT_SNAPSHOT_SCHEMA_VERSION,
      actual: report?.schema_version ?? null,
    })
  }
  if (report?.status !== 'ok' || report?.method !== 'pdf-render') {
    errors.push({
      code: 'chartex-native-render-method-invalid',
      status: report?.status ?? null,
      method: report?.method ?? null,
    })
  }
  if (!declaredPath || safeRealpath(declaredPath) !== safeRealpath(candidatePath)) {
    errors.push({
      code: 'chartex-native-render-candidate-path-mismatch',
      expected: safeRealpath(candidatePath),
      actual: declaredPath || null,
    })
  }
  if (String(report?.pptx_sha256 ?? '').toLowerCase() !== candidateSha256) {
    errors.push({
      code: 'chartex-native-render-candidate-hash-mismatch',
      expected: candidateSha256,
      actual: report?.pptx_sha256 ?? null,
    })
  }

  const coveredSlides = reportSlides(report)
  const missingSlides = packageInfo.chartExSlides.filter((slide) => !coveredSlides.includes(slide))
  if (packageInfo.chartExSlides.length === 0 || packageInfo.unmappedParts.length > 0) {
    errors.push({
      code: 'chartex-native-render-slide-scope-unresolved',
      chartExSlides: packageInfo.chartExSlides,
      unmappedParts: packageInfo.unmappedParts,
    })
  } else if (missingSlides.length > 0) {
    errors.push({
      code: 'chartex-native-render-slide-coverage-missing',
      requiredSlides: packageInfo.chartExSlides,
      coveredSlides,
      missingSlides,
    })
  }

  const images = []
  for (const slide of packageInfo.chartExSlides) {
    const item = outputForSlide(report, slide)
    if (!item) {
      errors.push({ code: 'chartex-native-render-output-missing', slide })
      continue
    }
    const identity = validateImageBinding(item, runDir, errors)
    if (identity) images.push(identity)
  }

  return {
    valid: errors.length === 0,
    errors,
    images,
    report: {
      schemaVersion: report?.schema_version ?? null,
      status: report?.status ?? null,
      method: report?.method ?? null,
      presentationName: report?.presentation_name ?? basename(candidatePath),
      candidateSha256,
      coveredSlides,
    },
  }
}

export function evaluateChartExNativeRender({
  candidatePath,
  runDir,
  artifactPath,
  availability = detectPowerPointAvailability(),
}) {
  if (!candidatePath) {
    return {
      status: 'not-run',
      applicable: null,
      reason: 'candidate-undisclosed',
      availability,
    }
  }
  if (!existsSync(candidatePath) || !statSync(candidatePath).isFile()) {
    return {
      status: 'failed',
      applicable: null,
      reason: 'candidate-missing',
      candidatePath,
      availability,
    }
  }

  let packageInfo
  try {
    packageInfo = inspectChartExPackage(candidatePath)
  } catch (error) {
    return {
      status: 'failed',
      applicable: null,
      reason: 'candidate-inspection-failed',
      candidatePath,
      availability,
      error: error.message,
    }
  }
  if (!packageInfo.hasChartEx) {
    return {
      status: 'not-applicable',
      applicable: false,
      reason: 'no-chartex-parts',
      candidatePath,
      packageInfo,
      availability,
    }
  }

  if (artifactPath && existsSync(artifactPath)) {
    const validation = validatePowerPointNativeRender({
      candidatePath,
      runDir,
      artifactPath,
      packageInfo,
    })
    return {
      status: validation.valid ? 'passed' : 'failed',
      applicable: true,
      reason: validation.valid ? 'candidate-bound-native-render' : 'native-render-invalid',
      candidatePath,
      artifactPath,
      packageInfo,
      availability,
      validation,
    }
  }

  return {
    status: availability.available ? 'failed' : 'warning',
    applicable: true,
    reason: availability.available
      ? 'native-render-required'
      : 'native-render-helper-unavailable-unverified',
    candidatePath,
    artifactPath: artifactPath || null,
    packageInfo,
    availability,
  }
}
