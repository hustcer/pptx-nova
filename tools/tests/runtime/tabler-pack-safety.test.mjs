import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brotliCompressSync } from 'node:zlib'
import test from 'node:test'
import {
  MAX_DECODED_PACK_BYTES,
  MAX_PACK_BYTES,
  PACK_SCHEMA_VERSION,
  TABLER_SHELLS,
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

function fixture(t, bytes = brotliCompressSync(Buffer.from(text()))) {
  const dir = mkdtempSync(join(tmpdir(), 'nova-icon-safety-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const pack = join(dir, 'fixture.br')
  writeFileSync(pack, bytes)
  return { dir, pack }
}

test('bundled pack has verified hashes and passive geometry for every icon', () => {
  const info = verifyTablerIconPack()
  assert.equal(info.status, 'pass')
  assert.equal(info.manifestVerified, true)
  assert.equal(info.passiveSvgValidated, true)
  assert.equal(info.iconCount, 6166)
  const provenance = JSON.parse(
    readFileSync(skillPath('assets/icons/tabler-icons.pack.provenance.json'), 'utf8'),
  )
  assert.equal(provenance.packSha256, info.sha256)
  const manifest = JSON.parse(
    readFileSync(skillPath('assets/icons/tabler-icons.pack.manifest.json'), 'utf8'),
  )
  assert.equal(manifest.decoded.sha256, info.decodedSha256)
  assert.equal(
    manifest.sample.svg,
    TABLER_SHELLS.outline.prefix.replace('stroke-width="2"', 'stroke-width="1"') +
      parseTablerIconPackText(readTablerIconPackText()).bodies.get('outline/presentation') +
      '</svg>',
  )
})

test('legacy custom packs remain readable without a manifest and preserve their text', (t) => {
  const original = text('<circle cx="12" cy="12" r="2" opacity=".5"/>')
  const f = fixture(t, brotliCompressSync(Buffer.from(original)))
  assert.equal(readTablerIconPackText(f.pack), original)
  assert.equal(verifyTablerIconPack({ packPath: f.pack }).manifestVerified, false)
})

test('pack verification rejects tampered compressed bytes before decoding', (t) => {
  const bytes = readFileSync(skillPath('assets/icons/tabler-icons.pack.br'))
  const f = fixture(t, bytes)
  const manifest = readFileSync(skillPath('assets/icons/tabler-icons.pack.manifest.json'))
  writeFileSync(tablerPackManifestPath(f.pack), manifest)
  const modified = Buffer.from(bytes)
  modified[modified.length - 1] ^= 1
  writeFileSync(f.pack, modified)
  assert.throws(() => readTablerIconPackText(f.pack), /compressed integrity check failed/)
})

test('pack verification rejects false decoded hashes and metadata', (t) => {
  const bytes = readFileSync(skillPath('assets/icons/tabler-icons.pack.br'))
  const original = JSON.parse(
    readFileSync(skillPath('assets/icons/tabler-icons.pack.manifest.json'), 'utf8'),
  )
  for (const field of ['sha256', 'iconCount']) {
    const f = fixture(t, bytes)
    const manifest = structuredClone(original)
    manifest.decoded[field] = field === 'sha256' ? '0'.repeat(64) : 1
    writeFileSync(tablerPackManifestPath(f.pack), JSON.stringify(manifest))
    assert.throws(() => readTablerIconPackText(f.pack), /integrity check failed/)
  }
})

test('compressed and decoded size limits stop oversized or expanding input', (t) => {
  const large = fixture(t, Buffer.alloc(MAX_PACK_BYTES + 1))
  assert.throws(() => readTablerIconPackText(large.pack), /compressed size limit/)
  const expanded = fixture(
    t,
    brotliCompressSync(Buffer.alloc(MAX_DECODED_PACK_BYTES + 1, 65), { params: { 1: 0 } }),
  )
  assert.throws(() => readTablerIconPackText(expanded.pack), { code: 'ERR_BUFFER_TOO_LARGE' })
  const badUtf8 = fixture(t, brotliCompressSync(Buffer.from([255])))
  assert.throws(() => readTablerIconPackText(badUtf8.pack), {
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
  ])
    assert.throws(() => parseTablerIconPackText(text(body)), /SVG/)
})

test('pack parsing rejects unknown records, executable shells, orphan and duplicate rows', () => {
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
})

test('CLI unpack writes reviewable text once and never overwrites the source or existing evidence', (t) => {
  const f = fixture(t)
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
})
