import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const script = fileURLToPath(
  new URL('../../../pptx-nova/scripts/cli/refurbish/fallback-patch.mjs', import.meta.url),
)
function fontsFor(names, deckkit = 'cartesian') {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-font-role-'))
  try {
    const inspect = join(dir, 'inspect.json')
    writeFileSync(
      inspect,
      JSON.stringify({
        presentation: {},
        slides: [
          {
            index: 0,
            shapes: names.map((name, i) => ({
              id: i + 1,
              name,
              hasText: true,
              textPreview: name.includes('PageNum') ? '7' : 'Source content',
              shapeType: 'textBox',
            })),
          },
        ],
      }),
    )
    const result = spawnSync(
      process.execPath,
      [
        script,
        '--deckkit',
        deckkit,
        '--inspect',
        inspect,
        '--patch',
        join(dir, 'patch.json'),
        '--lock',
        join(dir, 'lock.json'),
        '--audit',
        join(dir, 'audit.json'),
        '--map',
        join(dir, 'map.json'),
        '--json',
      ],
      { encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stderr)
    const patch = JSON.parse(readFileSync(join(dir, 'patch.json')))
    return names.map(
      (_, i) => patch.ops.find((o) => o.op === 'set-text-frame' && o.shape?.id === i + 1)?.font,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('refurbishment keeps subtitles in the body family while titles use display', () => {
  const [title, subtitle] = fontsFor(['S1_title', 'S1_subtitle'])
  assert.equal(title.name, 'Playfair Display')
  assert.equal(subtitle.name, 'Inter')
})
test('hero headlines receive the display family', () => {
  assert.equal(fontsFor(['S0_hero'])[0].name, 'Playfair Display')
})
test('page-number labels take label precedence over numeric metrics', () => {
  assert.equal(fontsFor(['S1_PageNum'])[0].name, 'Inter')
})

test('subtitle aliases retain the body family across case and separators', () => {
  const names = [
    'S1_Subheading',
    'S1_Subheadline',
    'S1_sub-heading',
    'S1_sub_headline',
    'S1_SUB TITLE',
    'S1_sub__heading',
    'S1_Subheading_Metric',
  ]
  fontsFor(names).forEach((font, i) => assert.equal(font.name, 'Inter', names[i]))
})

test('Cartesian display roles explicitly disable bold', () => {
  const names = ['S1_title', 'S0_hero', 'S1_headline', 'S1_heading', 'S1_Metric']
  fontsFor(names).forEach((font, i) => {
    assert.equal(font.name, 'Playfair Display', names[i])
    assert.equal(font.bold, false, `${names[i]} must reset inherited bold`)
  })
})

test('DeckKits with bold display typography retain bold headings and metrics', () => {
  const names = ['S1_title', 'S0_hero', 'S1_Metric']
  fontsFor(names, 'swiss-grid').forEach((font, i) => {
    assert.equal(font.name, 'Helvetica', names[i])
    assert.equal(font.bold, true, names[i])
  })
})

test('fallback patch applies the declared design font roles without a registered skin profile', () => {
  const fonts = fontsFor(['S1_title', 'S1_subtitle', 'S1_PageNum'], 'paper-scholar')
  for (const font of fonts) {
    assert.equal(font.name, 'Arial')
  }
})
