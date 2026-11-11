import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createDeck } from '../../../pptx-nova/assets/deckkits/swiss-grid/swiss-grid.kit.mjs'
import { checkDesignReadback } from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { readPptxPackage } from '../../../pptx-nova/scripts/lib/pptx/pptx-package.mjs'

test(
  'Swiss LF, CRLF and CR newlines create native paragraphs with complete text and blank-line style',
  { skip: !process.env.XDOC_TEST_BIN && 'Set XDOC_TEST_BIN to run executable contract tests' },
  (t) => {
    const binary = resolve(process.env.XDOC_TEST_BIN)
    const evidence = process.env.XDOC_TEST_EVIDENCE_DIR
    if (evidence) mkdirSync(evidence, { recursive: true })
    const root = mkdtempSync(join(evidence ? resolve(evidence) : tmpdir(), 'swiss-newlines-'))
    if (!evidence) t.after(() => rmSync(root, { recursive: true, force: true }))
    const sample = JSON.parse(
      readFileSync(
        new URL(
          '../../../pptx-nova/assets/deckkits/swiss-grid/examples/content.json',
          import.meta.url,
        ),
      ),
    ).slides[1]
    const bodies = [
      'First\n\nLast',
      'First\r\n\r\nLast',
      'First\r\rLast',
      '\nFirst',
      'First\n',
      'First\n\n\nLast',
      'First\n \nLast',
    ]
    const content = {
      meta: { deckkit: 'swiss-grid', designScope: 'excerpt' },
      slides: bodies.map((body) => ({
        ...structuredClone(sample),
        data: { ...sample.data, body },
      })),
    }
    const built = createDeck(content)
    const patch = join(root, 'patch.json'),
      output = join(root, 'candidate.pptx')
    writeFileSync(patch, JSON.stringify(built.patch, null, 2))
    function run(name, args) {
      const result = spawnSync(binary, args, {
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 16 * 1024 * 1024,
      })
      writeFileSync(join(root, `${name}.json`), result.stdout || '{}')
      writeFileSync(join(root, `${name}.stderr.txt`), result.stderr || '')
      const report = JSON.parse(result.stdout || '{}')
      assert.equal(
        result.status,
        0,
        `${name}: ${result.error?.message || result.stderr || report.error?.message || report.status}`,
      )
      return report
    }
    for (const dry of [true, false]) {
      const report = run(dry ? 'dry-run' : 'apply', [
        'pptx',
        'apply',
        '--patch',
        patch,
        '--output',
        output,
        ...(dry ? ['--dry-run'] : []),
        '--json',
      ])
      assert.deepEqual(report.semanticIssues, [])
    }
    const inspect = run('inspect', ['pptx', 'inspect', output, '--json'])
    assert.equal(checkDesignReadback(built.designPlan, built.patch, inspect).status, 'pass')
    const packageReader = readPptxPackage(output)
    const design = JSON.parse(
      readFileSync(
        new URL('../../../pptx-nova/assets/deckkits/swiss-grid/design.json', import.meta.url),
      ),
    )
    const walk = (node) => [node, ...node.children.flatMap(walk)]
    const attr = (node, name) => node?.attrs.find((a) => a.local === name)?.value
    for (const [i, body] of bodies.entries()) {
      const facts = inspect.slides[i].shapes
        .find((s) => s.name === `S${i}_Body`)
        .fontFacts.filter((f) => f.scope === 'textRun')
      const paragraphs = new Map()
      for (const fact of facts) {
        assert.ok(!fact.text.includes('\r'))
        paragraphs.set(fact.paragraph, (paragraphs.get(fact.paragraph) ?? '') + fact.text)
      }
      assert.equal([...paragraphs.values()].join('\n'), body.replace(/\r\n?/g, '\n'))
      const tree = packageReader.partTree(packageReader.slides()[i].part)
      const shape = walk(tree).find(
        (node) =>
          node.local === 'sp' &&
          walk(node).some((n) => n.local === 'cNvPr' && attr(n, 'name') === `S${i}_Body`),
      )
      const xmlParagraphs = walk(shape).filter((node) => node.local === 'p')
      assert.equal(xmlParagraphs.length, body.replace(/\r\n?/g, '\n').split('\n').length)
      for (const paragraph of xmlParagraphs) {
        const runProperties = walk(paragraph).filter((node) => node.local === 'rPr')
        assert.ok(
          runProperties.length > 0,
          'Every paragraph, including blank lines, has a styled run',
        )
        for (const properties of runProperties) {
          assert.equal(attr(properties, 'sz'), String(design.swiss.styles.body.sizePt * 100))
          assert.equal(
            attr(
              properties.children.find((node) => node.local === 'latin'),
              'typeface',
            ),
            design.fonts.body.latin,
          )
          assert.equal(
            attr(
              properties.children.find((node) => node.local === 'ea'),
              'typeface',
            ),
            design.fonts.body.eastAsian,
          )
        }
      }
    }
  },
)
