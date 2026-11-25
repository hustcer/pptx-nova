import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brotliCompressSync } from 'node:zlib'
import test from 'node:test'
import {
  LEGACY_PACK_MANIFEST_SCHEMA_VERSION,
  MAX_DECODED_PACK_BYTES,
  MAX_PACK_BYTES,
  PACK_SCHEMA_VERSION,
  SPLIT_PACK_SCHEMA_VERSION,
  TABLER_SHELLS,
  parseSplitTablerIconPackTexts,
  parseTablerIconPackText,
  readTablerIconPackText,
  tablerPackManifestPath,
  verifyTablerIconPack,
} from '../../../pptx-nova/scripts/lib/assets/tabler-icons.mjs'
import { skillPath } from '../helpers/common.mjs'

function text(body = '<path d="M1 2l3 4"/>') {
  return (
    `# ${PACK_SCHEMA_VERSION}\n# source=tabler-icons\n# version=fixture\n` +
    Object.entries(TABLER_SHELLS)
      .map(([style, shell]) => `@shell\t${style}\t${shell.prefix}\t${shell.suffix}\n`)
      .join('') +
    '@@catalog\n@icon\toutline\tdemo\tTest\tdemo\talias\t1.0\te000\n@@icons\n' +
    `@svg\toutline\tdemo\t${body}\n`
  )
}

function splitTexts(outlineBody = '<path d="M1 2l3 4"/>', filledBody = '<path d="M2 2l4 8"/>') {
  return {
    catalog:
      `# ${SPLIT_PACK_SCHEMA_VERSION}\n# source=tabler-icons\n# version=fixture\n# part=catalog\n` +
      Object.entries(TABLER_SHELLS)
        .map(([style, shell]) => `@shell\t${style}\t${shell.prefix}\t${shell.suffix}\n`)
        .join('') +
      '@@catalog\n' +
      '@icon\tfilled\tstar\tTest\tstar\t\t2.0\tf000\n' +
      '@icon\toutline\tdemo\tTest\tdemo\talias\t1.0\te000\n',
    outline:
      `# ${SPLIT_PACK_SCHEMA_VERSION}\n# source=tabler-icons\n# version=fixture\n# part=outline\n` +
      `@@icons\n@svg\toutline\tdemo\t${outlineBody}\n`,
    filled:
      `# ${SPLIT_PACK_SCHEMA_VERSION}\n# source=tabler-icons\n# version=fixture\n# part=filled\n` +
      `@@icons\n@svg\tfilled\tstar\t${filledBody}\n`,
  }
}

function brotliFixture(t, bytes = brotliCompressSync(Buffer.from(text()))) {
  const dir = mkdtempSync(join(tmpdir(), 'nova-icon-safety-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const pack = join(dir, 'fixture.br')
  writeFileSync(pack, bytes)
  return { dir, pack }
}

function copyBundledSplitFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'nova-icon-split-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  for (const file of [
    'tabler-icons.catalog.tsv',
    'tabler-icons.outline.tsv',
    'tabler-icons.filled.tsv',
    'tabler-icons.pack.manifest.json',
  ]) {
    copyFileSync(skillPath(`assets/icons/${file}`), join(dir, file))
  }
  return {
    dir,
    pack: join(dir, 'tabler-icons.catalog.tsv'),
    outline: join(dir, 'tabler-icons.outline.tsv'),
    filled: join(dir, 'tabler-icons.filled.tsv'),
    manifest: join(dir, 'tabler-icons.pack.manifest.json'),
  }
}

test('bundled split plain-text pack has verified hashes and passive geometry for every icon', () => {
  const info = verifyTablerIconPack()
  assert.equal(info.status, 'pass')
  assert.equal(info.storage, 'split-tsv')
  assert.equal(info.manifestVerified, true)
  assert.equal(info.passiveSvgValidated, true)
  assert.equal(info.iconCount, 6166)
  const provenance = JSON.parse(
    readFileSync(skillPath('assets/icons/tabler-icons.pack.provenance.json'), 'utf8'),
  )
  assert.equal(provenance.canonicalSha256, info.canonicalSha256)
  for (const part of ['catalog', 'outline', 'filled']) {
    assert.equal(provenance.files[part].file, info.files[part].file)
    assert.equal(provenance.files[part].sha256, info.files[part].sha256)
  }
  const manifest = JSON.parse(
    readFileSync(skillPath('assets/icons/tabler-icons.pack.manifest.json'), 'utf8'),
  )
  assert.equal(manifest.storage.format, 'split-tsv')
  assert.equal(manifest.storage.compression, 'none')
  assert.equal(manifest.canonical.sha256, info.canonicalSha256)
  assert.equal(
    manifest.sample.svg,
    TABLER_SHELLS.outline.prefix.replace('stroke-width="2"', 'stroke-width="1"') +
      parseTablerIconPackText(readTablerIconPackText()).bodies.get('outline/presentation') +
      '</svg>',
  )
})

test('custom split TSV packs without a manifest remain readable and validate geometry', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'nova-icon-custom-split-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const parts = splitTexts('<circle cx="12" cy="12" r="2" opacity=".5"/>')
  const catalogPath = join(dir, 'custom.catalog.tsv')
  writeFileSync(catalogPath, parts.catalog)
  writeFileSync(join(dir, 'custom.outline.tsv'), parts.outline)
  writeFileSync(join(dir, 'custom.filled.tsv'), parts.filled)
  const verified = verifyTablerIconPack({ packPath: catalogPath })
  assert.equal(verified.status, 'pass')
  assert.equal(verified.storage, 'split-tsv')
  assert.equal(verified.manifestVerified, false)
  assert.equal(verified.iconCount, 2)
})

test('legacy custom Brotli packs remain readable without a manifest and preserve their text', (t) => {
  const original = text('<circle cx="12" cy="12" r="2" opacity=".5"/>')
  const f = brotliFixture(t, brotliCompressSync(Buffer.from(original)))
  assert.equal(readTablerIconPackText(f.pack), original)
  assert.equal(verifyTablerIconPack({ packPath: f.pack }).manifestVerified, false)
})

test('split pack verification rejects tampered plain-text part files', (t) => {
  for (const part of ['pack', 'outline', 'filled']) {
    const f = copyBundledSplitFixture(t)
    writeFileSync(f[part], `${readFileSync(f[part], 'utf8')}\n`)
    assert.throws(() => readTablerIconPackText(f.pack), /file integrity check failed/)
  }
})

test('split pack verification rejects tampered manifest metadata and path traversal entries', (t) => {
  const f1 = copyBundledSplitFixture(t)
  const manifest1 = JSON.parse(readFileSync(f1.manifest, 'utf8'))
  manifest1.canonical.sha256 = '0'.repeat(64)
  writeFileSync(f1.manifest, JSON.stringify(manifest1))
  assert.throws(() => readTablerIconPackText(f1.pack), /metadata integrity check failed/)

  const f2 = copyBundledSplitFixture(t)
  const manifest2 = JSON.parse(readFileSync(f2.manifest, 'utf8'))
  manifest2.canonical.iconCount = 1
  writeFileSync(f2.manifest, JSON.stringify(manifest2))
  assert.throws(() => readTablerIconPackText(f2.pack), /metadata integrity check failed/)

  const f3 = copyBundledSplitFixture(t)
  const manifest3 = JSON.parse(readFileSync(f3.manifest, 'utf8'))
  manifest3.files.outline.file = '../evil.tsv'
  writeFileSync(f3.manifest, JSON.stringify(manifest3))
  assert.throws(() => readTablerIconPackText(f3.pack), /file entry integrity check failed/)
})

test('legacy Brotli pack verification rejects tampered compressed bytes and false decoded hashes', (t) => {
  const original = text()
  const bytes = brotliCompressSync(Buffer.from(original))
  const sha = (buf) => createHash('sha256').update(buf).digest('hex')
  const validManifest = {
    schemaVersion: LEGACY_PACK_MANIFEST_SCHEMA_VERSION,
    source: { repository: 'https://github.com/tabler/tabler-icons', version: 'fixture' },
    compression: { algorithm: 'brotli', quality: 11 },
    pack: { file: 'fixture.br', byteLength: bytes.length, sha256: sha(bytes) },
    decoded: {
      encoding: 'utf-8',
      schemaVersion: PACK_SCHEMA_VERSION,
      byteLength: Buffer.byteLength(original),
      sha256: sha(original),
      iconCount: 1,
      counts: { outline: 1, filled: 0 },
    },
  }

  const tampered = brotliFixture(t, bytes)
  writeFileSync(tablerPackManifestPath(tampered.pack), JSON.stringify(validManifest))
  const modified = Buffer.from(bytes)
  modified[modified.length - 1] ^= 1
  writeFileSync(tampered.pack, modified)
  assert.throws(() => readTablerIconPackText(tampered.pack), /compressed integrity check failed/)

  for (const field of ['sha256', 'iconCount']) {
    const f = brotliFixture(t, bytes)
    const manifest = structuredClone(validManifest)
    manifest.decoded[field] = field === 'sha256' ? '0'.repeat(64) : 99
    writeFileSync(tablerPackManifestPath(f.pack), JSON.stringify(manifest))
    assert.throws(() => readTablerIconPackText(f.pack), /integrity check failed/)
  }
})

test('size limits and strict UTF-8 checks stop oversized, expanding, or binary-corrupt input', (t) => {
  const large = brotliFixture(t, Buffer.alloc(MAX_PACK_BYTES + 1))
  assert.throws(() => readTablerIconPackText(large.pack), /compressed size limit/)
  const expanded = brotliFixture(
    t,
    brotliCompressSync(Buffer.alloc(MAX_DECODED_PACK_BYTES + 1, 65), { params: { 1: 0 } }),
  )
  assert.throws(() => readTablerIconPackText(expanded.pack), { code: 'ERR_BUFFER_TOO_LARGE' })
  const badUtf8 = brotliFixture(t, brotliCompressSync(Buffer.from([255])))
  assert.throws(() => readTablerIconPackText(badUtf8.pack), {
    code: 'ERR_ENCODING_INVALID_ENCODED_DATA',
  })

  // Invalid UTF-8 in a plain-text split part also fails closed.
  const dir = mkdtempSync(join(tmpdir(), 'nova-icon-bad-utf8-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const parts = splitTexts()
  const catalogPath = join(dir, 'bad.catalog.tsv')
  writeFileSync(catalogPath, parts.catalog)
  writeFileSync(join(dir, 'bad.outline.tsv'), Buffer.from([255]))
  writeFileSync(join(dir, 'bad.filled.tsv'), parts.filled)
  assert.throws(() => readTablerIconPackText(catalogPath), {
    code: 'ERR_ENCODING_INVALID_ENCODED_DATA',
  })
})

test('icon bodies reject active SVG, entities, URLs and hidden executable payloads', () => {
  for (const body of [
    '<script>throw 1</script>',
    '<foreignObject/>',
    '<image href="https://example.invalid/a"/>',
    '<path d="M1 2" onload="alert(1)"/>',
    '<path d="M1 2" style="fill:red"/>',
    '<path d="M1 2" fill="url(https://example.invalid/a)"/>',
    '<path d="M1 2" fill="&#x72;ed"/>',
    '<path d="M1 2" d="M2 3"/>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///fixture">]>',
    '<!-- hidden -->',
    '<path d="M1 2"/>process.exit(1)',
  ]) {
    assert.throws(() => parseTablerIconPackText(text(body)), /SVG/)
    assert.throws(() => parseSplitTablerIconPackTexts(splitTexts(body)), /SVG/)
  }
})

test('split and single pack parsing reject unknown records, style smuggling, executable shells, and orphan/duplicate rows', () => {
  const valid = text()
  for (const invalid of [
    valid.replace(PACK_SCHEMA_VERSION, 'unrecognized/v1'),
    valid + 'eval("fixture")\n',
    valid + '@svg\toutline\tdemo\t<path d="M1 2"/>\n',
    valid.replace('@svg\toutline\tdemo', '@svg\toutline\torphan'),
    valid.replace('@@icons\n', '@icon\toutline\tdemo\tTest\t\t\t1\t-\n@@icons\n'),
    valid.replace('@@icons', '@@catalog'),
    valid.replace('<svg xmlns=', '<svg onload="alert(1)" xmlns='),
    valid.replace('@svg\toutline\tdemo\t<path d="M1 2l3 4"/>\n', ''),
  ])
    assert.throws(() => parseTablerIconPackText(invalid))

  const parts = splitTexts()
  // Cross-style smuggling: filled row placed inside outline file.
  assert.throws(() =>
    parseSplitTablerIconPackTexts({
      ...parts,
      outline: parts.outline + '@svg\tfilled\tstar\t<path d="M2 2l4 8"/>\n',
      filled: parts.filled.replace('@svg\tfilled\tstar\t<path d="M2 2l4 8"/>\n', ''),
    }),
  )
  // Mismatched version across split parts.
  assert.throws(() =>
    parseSplitTablerIconPackTexts({
      ...parts,
      filled: parts.filled.replace('# version=fixture', '# version=other'),
    }),
  )
  // Wrong part declaration.
  assert.throws(() =>
    parseSplitTablerIconPackTexts({
      ...parts,
      outline: parts.outline.replace('# part=outline', '# part=filled'),
    }),
  )
})

test('CLI unpack writes reviewable canonical text once and never overwrites the source or existing evidence', (t) => {
  const f = brotliFixture(t)
  const cli = skillPath('scripts/cli/assets/icons.mjs')
  const output = join(f.dir, 'decoded.tsv')
  const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
  const originalHash = hash(f.pack)
  const result = spawnSync(
    process.execPath,
    [cli, 'unpack', '--pack', f.pack, '--output', output],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(output, 'utf8'), text())
  for (const destination of [output, f.pack]) {
    const refused = spawnSync(
      process.execPath,
      [cli, 'unpack', '--pack', f.pack, '--output', destination],
      { encoding: 'utf8' },
    )
    assert.equal(refused.status, 1)
    assert.match(refused.stderr, /EEXIST/)
  }
  assert.equal(hash(f.pack), originalHash)
  assert.equal(existsSync(output), true)

  // Also works on the bundled split pack and emits the canonical digest.
  const bundledOut = join(f.dir, 'bundled-canonical.tsv')
  const bundledResult = spawnSync(process.execPath, [cli, 'unpack', '--output', bundledOut], {
    encoding: 'utf8',
  })
  assert.equal(bundledResult.status, 0, bundledResult.stderr)
  const parsed = JSON.parse(bundledResult.stdout)
  assert.equal(parsed.sha256, verifyTablerIconPack().canonicalSha256)
})
