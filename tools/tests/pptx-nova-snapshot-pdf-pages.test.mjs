import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { storedZip, contentTypes } from './helpers/pptx-package.mjs'
const writeProbeZip = (parts) => storedZip([...parts])
import { readPptxPackage } from '../../pptx-nova/scripts/lib/pptx-package.mjs'
const slideVisibility = (path) => readPptxPackage(path).slides()

const root = resolve(import.meta.dirname, '../..')
const tool = join(root, 'pptx-nova/scripts/pptx-nova-powerpoint-snapshot.nu')
const container = join(homedir(), 'Library/Containers/com.microsoft.Powerpoint/Data/tmp')
const hasOfficeTools = process.platform === 'darwin' && existsSync(container)

function deck(hidden = true, raw = false) {
  const ns = 'http://schemas.openxmlformats.org/presentationml/2006/main'
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const parts = new Map([
    [
      '[Content_Types].xml',
      contentTypes(
        [7, 2, 9, 3].map((n) => [
          `ppt/slides/slide${n}.xml`,
          'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
        ]),
      ),
    ],
    [
      'ppt/presentation.xml',
      `<p:presentation xmlns:p="${ns}" xmlns:r="${rel}"><p:sldIdLst>${[7, 2, 9, 3].map((n) => `<p:sldId id="${256 + n}" r:id="r${n}"/>`).join('')}</p:sldIdLst></p:presentation>`,
    ],
    [
      'ppt/_rels/presentation.xml.rels',
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[7, 2, 9, 3].map((n) => `<Relationship Id="r${n}" Type="${rel}/slide" Target="slides/slide${n}.xml"/>`).join('')}</Relationships>`,
    ],
  ])
  for (const n of [7, 2, 9, 3])
    parts.set(
      `ppt/slides/slide${n}.xml`,
      `<p:sld xmlns:p="${ns}"${n === 2 && hidden ? ' show="0"' : ''}><p:cSld/></p:sld>`,
    )
  return raw ? parts : writeProbeZip(parts)
}

// Independent tiny PDF pages with distinct solid colors; no product renderer.
function pdf(colors) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${colors.length} /Kids [${colors.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] >>`,
  ]
  for (const color of colors) {
    const stream = `${color} rg 0 0 12 12 re f\n`
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 12 12] /Resources << >> /Contents ${objects.length + 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    )
  }
  let text = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, i) => {
    offsets.push(text.length)
    text += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = text.length
  text += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return text
}

function fixture(t, colors, hidden = true) {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-pdf-pages-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(join(dir, 'deck.pptx'), deck(hidden))
  writeFileSync(join(dir, 'office.pdf'), pdf(colors))
  // Stub only the external Office boundary. The real snapshot tool, ZIP/XML
  // readers and MuPDF rasterization run unchanged, without opening PowerPoint.
  writeFileSync(
    join(bin, 'osascript'),
    `#!${process.execPath}\nconst fs = require('node:fs'); const script = fs.readFileSync(0, 'utf8'); if (script.includes('save target_presentation')) fs.copyFileSync(process.env.SNAPSHOT_FIXTURE_PDF, process.argv[4]); console.log('deck.pptx');\n`,
    { mode: 0o755 },
  )
  function capture(slides) {
    const out = join(dir, `result-${slides.join('-')}-%d.png`)
    const result = spawnSync(
      'nu',
      [
        '--no-config-file',
        '-c',
        `source ${JSON.stringify(tool)}; let input = ($env.SNAPSHOT_FIXTURE | from json); render-via-pdf $input.pptx $input.output {multi: true slides: $input.slides spec: ($input.slides | each {into string} | str join ',')} 72 0.0 | to json --raw`,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 30000,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          SNAPSHOT_FIXTURE_PDF: join(dir, 'office.pdf'),
          SNAPSHOT_FIXTURE: JSON.stringify({ pptx: join(dir, 'deck.pptx'), output: out, slides }),
        },
      },
    )
    assert.equal(result.status, 0, result.stderr)
    return { result: JSON.parse(result.stdout), out }
  }
  function page(n) {
    const output = join(dir, `expected-${n}.png`)
    const result = spawnSync(
      'mutool',
      ['draw', '-r', '72', '-o', output, join(dir, 'office.pdf'), String(n)],
      { encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stderr)
    return readFileSync(output)
  }
  return { capture, page }
}

test(
  'PDF batch snapshots retain logical slide identity after an omitted hidden slide',
  { skip: !hasOfficeTools },
  (t) => {
    const f = fixture(t, ['1 0 0', '0 0 1', '0 1 0'])
    const { result, out } = f.capture([1, 3])
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.deepEqual(readFileSync(out.replace('%d', '1')), f.page(1))
    assert.deepEqual(readFileSync(out.replace('%d', '3')), f.page(2))
    assert.deepEqual(
      result.pdf_pages.map(({ slide, pdf_page }) => [slide, pdf_page]),
      [
        [1, 1],
        [3, 2],
      ],
    )
  },
)

test(
  'PDF snapshots refuse a hidden slide omitted by the Office export',
  { skip: !hasOfficeTools },
  (t) => {
    const { result, out } = fixture(t, ['1 0 0', '0 0 1', '0 1 0']).capture([2])
    assert.equal(result.ok, false)
    assert.equal(existsSync(out.replace('%d', '2')), false)
  },
)

test(
  'PDF snapshots retain identity when Office includes hidden slides',
  { skip: !hasOfficeTools },
  (t) => {
    const f = fixture(t, ['1 0 0', '1 1 0', '0 0 1', '0 1 0'])
    const { result, out } = f.capture([2, 3])
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.deepEqual(readFileSync(out.replace('%d', '3')), f.page(3))
  },
)

test('PDF snapshots reject an unexplained exported page count', { skip: !hasOfficeTools }, (t) => {
  const { result, out } = fixture(t, ['1 0 0', '0 0 1'], false).capture([1])
  assert.equal(result.ok, false)
  assert.equal(existsSync(out.replace('%d', '1')), false)
})

test('slide visibility follows relationship order and namespace identity in both OOXML dialects', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-visibility-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  for (const strict of [false, true]) {
    const entries = deck(true, true)
    for (const [name, bytes] of entries) {
      let xml = bytes
        .toString()
        .replaceAll('<p:', '<pres:')
        .replaceAll('</p:', '</pres:')
        .replaceAll('xmlns:p=', 'xmlns:pres=')
        .replaceAll(' r:id=', ' rel:id=')
        .replaceAll('xmlns:r=', 'xmlns:rel=')
      if (strict)
        xml = xml
          .replaceAll(
            'http://schemas.openxmlformats.org/presentationml/2006/main',
            'http://purl.oclc.org/ooxml/presentationml/main',
          )
          .replaceAll(
            'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
            'http://purl.oclc.org/ooxml/officeDocument/relationships',
          )
      if (name === 'ppt/slides/slide2.xml')
        xml = xml.replace('show="0"', 'show="false" xmlns:foreign="urn:foreign" foreign:show="1"')
      if (name === 'ppt/slides/slide9.xml')
        xml = xml.replace('<pres:sld ', '<pres:sld xmlns:foreign="urn:foreign" foreign:show="0" ')
      entries.set(name, Buffer.from(xml))
    }
    const file = join(dir, `${strict}.pptx`)
    writeFileSync(file, writeProbeZip(entries))
    assert.deepEqual(slideVisibility(file), [
      { slide: 1, part: 'ppt/slides/slide7.xml', hidden: false },
      { slide: 2, part: 'ppt/slides/slide2.xml', hidden: true },
      { slide: 3, part: 'ppt/slides/slide9.xml', hidden: false },
      { slide: 4, part: 'ppt/slides/slide3.xml', hidden: false },
    ])
    entries.set(
      'ppt/slides/slide2.xml',
      entries.get('ppt/slides/slide2.xml').toString().replace('show="false"', 'show="unknown"'),
    )
    writeFileSync(file, writeProbeZip(entries))
    assert.throws(() => slideVisibility(file), /Invalid slide visibility/)
  }
})
