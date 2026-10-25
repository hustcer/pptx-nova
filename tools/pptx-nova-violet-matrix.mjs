#!/usr/bin/env node
// Maintainer-only fixture and standard Create runner matrix; output is always isolated.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  violetGolden,
  violetDifferentDomain,
  violetStress,
} from './tests/fixtures/violet-momentum-fixtures.mjs'
import {
  DESIGN,
  createDeck,
} from '../pptx-nova/assets/deckkits/violet-momentum/violet-momentum.kit.mjs'
const root = fileURLToPath(new URL('../', import.meta.url)),
  args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log(
    'Usage: node tools/pptx-nova-violet-matrix.mjs --out <new-directory> [--cases golden,variants,stress,mixed,different-domain]',
  )
  process.exit(0)
}
let out,
  names = ['golden', 'variants', 'stress', 'mixed', 'different-domain']
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') out = resolve(args[++i])
  else if (args[i] === '--cases') names = args[++i].split(',')
  else throw Error('Unknown argument ' + args[i])
}
if (!out || existsSync(out)) throw Error('Use a new output directory; preserve prior evidence')
mkdirSync(out, { recursive: true })
const golden = violetGolden(),
  variants = {
    meta: { deckkit: 'violet-momentum', designScope: 'excerpt' },
    slides: golden.slides.flatMap((s) =>
      Object.keys(DESIGN.violet.families[s.type].variants).map((layoutId) => ({
        ...structuredClone(s),
        layoutId,
      })),
    ),
  }
const inputs = {
    golden,
    variants,
    stress: violetStress(),
    mixed: violetDifferentDomain('mixed'),
    'different-domain': violetDifferentDomain('en'),
  },
  results = []
for (const name of names) {
  const input = inputs[name]
  if (!input) throw Error('Unknown case ' + name)
  const dir = resolve(out, name)
  mkdirSync(dir)
  const write = (f, v) => writeFileSync(resolve(dir, f), JSON.stringify(v, null, 2) + '\n')
  write('content.json', input)
  const built = createDeck(input)
  write('resolved-plan.json', built.designPlan)
  write('deck_lock.json', {
    schemaVersion: 'pptx-nova-deck-lock/v1',
    mode: 'create',
    canvas: DESIGN.canvas,
    outline: { purpose: 'Verify reusable native operational editorial design with synthetic data' },
    slides: input.slides.map((s) => ({
      slideType: s.type,
      title: s.data.title,
      purpose: 'Verify content completeness and registered composition',
      rhythm: 'dense',
      chart: { kind: s.type === 'violetTrendSlide' ? 'column' : 'none', source: s.data.source },
    })),
  })
  const run = spawnSync(
    process.execPath,
    [
      resolve(root, 'pptx-nova/scripts/cli/create/run.mjs'),
      '--deckkit',
      'violet-momentum',
      '--content',
      resolve(dir, 'content.json'),
      '--lock',
      resolve(dir, 'deck_lock.json'),
      '--output',
      resolve(dir, 'reviewed.pptx'),
      '--run-dir',
      resolve(dir, 'run'),
      '--progress',
      'off',
      '--json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 30e6,
      env: { ...process.env, XDOC_FIELD_DATE: '2026-10-25' },
    },
  )
  writeFileSync(resolve(dir, 'stdout.json'), run.stdout ?? '')
  writeFileSync(resolve(dir, 'stderr.txt'), run.stderr ?? '')
  const result = {
    case: name,
    exitCode: run.status,
    slides: input.slides.length,
    reviewRequired: true,
    run: resolve(dir, 'run'),
  }
  results.push(result)
  console.log(JSON.stringify(result))
}
writeFileSync(
  resolve(out, 'matrix.json'),
  JSON.stringify({ schemaVersion: 'violet-matrix/v1', results, visuallyReviewed: false }, null, 2) +
    '\n',
)
if (results.some((r) => r.exitCode !== 0)) process.exitCode = 1
