import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { readPptxPackage } from '../../../pptx-nova/scripts/lib/pptx/pptx-package.mjs'
import { storedZip, contentTypes } from '../helpers/pptx-package.mjs'

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const C = 'http://schemas.microsoft.com/office/2014/relationships/chartEx'
const MIME = 'application/vnd.openxmlformats-officedocument.presentationml.'
const rels = (entries) =>
  '<r:Relationships xmlns:r="http://schemas.openxmlformats.org/package/2006/relationships">' +
  entries
    .map(([type, target], i) => `<r:Relationship Id="r${i}" Type="${type}" Target="${target}"/>`)
    .join('') +
  '</r:Relationships>'

function fixture(t, mutate = () => {}) {
  const parts = new Map([
    [
      '[Content_Types].xml',
      contentTypes([
        ['assets/page', MIME + 'slide+xml'],
        ['brand/layout', MIME + 'slideLayout+xml'],
        ['brand/master', MIME + 'slideMaster+xml'],
        ['brand/sibling', MIME + 'slideLayout+xml'],
        ['data/visible', 'application/vnd.ms-office.chartex+xml'],
        ['data/unused', 'application/vnd.ms-office.chartex+xml'],
      ]),
    ],
    [
      'ppt/presentation.xml',
      `<p:presentation xmlns:p="${P}" xmlns:rel="${R}"><p:sldIdLst><p:sldId id="256" rel:id="r0"/></p:sldIdLst></p:presentation>`,
    ],
    ['ppt/_rels/presentation.xml.rels', rels([[R + '/slide', '../assets/page']])],
    ['assets/page', `<p:sld xmlns:p="${P}"/>`],
    ['assets/_rels/page.rels', rels([[R + '/slideLayout', '../brand/layout']])],
    ['brand/layout', '<layout/>'],
    ['brand/_rels/layout.rels', rels([[R + '/slideMaster', 'master']])],
    ['brand/master', '<master/>'],
    [
      'brand/_rels/master.rels',
      rels([
        [C, '../data/visible'],
        [R + '/slideLayout', 'sibling'],
      ]),
    ],
    ['brand/sibling', '<layout/>'],
    ['brand/_rels/sibling.rels', rels([[C, '../data/unused']])],
    ['data/visible', '<chart/>'],
    ['data/unused', '<chart/>'],
  ])
  mutate(parts)
  const dir = mkdtempSync(join(tmpdir(), 'nova-opc-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, 'input.pptx')
  writeFileSync(path, storedZip([...parts]))
  return path
}

test('inherited ChartEx maps through layout/master but never through sibling layout registries', (t) => {
  const pkg = readPptxPackage(fixture(t))
  assert.deepEqual(pkg.sharedParts, ['brand/layout', 'brand/master', 'brand/sibling'])
  assert.deepEqual(pkg.chartExScope(), {
    hasChartEx: true,
    chartExParts: ['data/unused', 'data/visible'],
    chartExSlides: [1],
    unmappedParts: ['data/unused'],
  })
})

test('content type defaults classify nonstandard extensions and path lookalikes do not', (t) => {
  const pkg = readPptxPackage(
    fixture(t, (parts) => {
      parts.set(
        '[Content_Types].xml',
        parts
          .get('[Content_Types].xml')
          .replace(
            '</Types>',
            `<Default Extension="layout" ContentType="${MIME}slideLayout+xml"/></Types>`,
          ),
      )
      parts.set('assets/default.layout', '<layout/>')
      parts.set('ppt/slideLayouts/decoy.xml', '<unrelated/>')
    }),
  )
  assert(pkg.sharedParts.includes('assets/default.layout'))
  assert(!pkg.sharedParts.includes('ppt/slideLayouts/decoy.xml'))
})

test('missing, external and wrong-type inherited chart targets fail closed', (t) => {
  for (const mutation of [
    (parts) => parts.delete('data/visible'),
    (parts) =>
      parts.set(
        'brand/_rels/master.rels',
        parts
          .get('brand/_rels/master.rels')
          .replace('Target="../data/visible"', 'Target="../data/visible" TargetMode="External"'),
      ),
    (parts) =>
      parts.set(
        '[Content_Types].xml',
        parts
          .get('[Content_Types].xml')
          .replace(
            'PartName="/data/visible" ContentType="application/vnd.ms-office.chartex+xml"',
            `PartName="/data/visible" ContentType="${MIME}slide+xml"`,
          ),
      ),
  ])
    assert.throws(
      () => readPptxPackage(fixture(t, mutation)).chartExScope(),
      /Missing|wrong-type|internal/,
    )
})

test('malformed registries and namespace collisions cannot invent slide identity', (t) => {
  for (const mutation of [
    (parts) =>
      parts.set(
        'ppt/presentation.xml',
        parts
          .get('ppt/presentation.xml')
          .replace('rel:id="r0"', 'xmlns:fake="urn:fake" fake:id="r0"'),
      ),
    (parts) =>
      parts.set('ppt/_rels/presentation.xml.rels', rels([[R + '/slide', '../../../escape']])),
    (parts) =>
      parts.set(
        'ppt/presentation.xml',
        parts
          .get('ppt/presentation.xml')
          .replace('</p:sldIdLst>', '<p:sldId id="257" rel:id="r0"/></p:sldIdLst>'),
      ),
    (parts) =>
      parts.set('ppt/presentation.xml', '<!DOCTYPE x SYSTEM "https://invalid.example"><x/>'),
  ])
    assert.throws(() => readPptxPackage(fixture(t, mutation)).slides())
})
