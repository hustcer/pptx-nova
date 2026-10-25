#!/usr/bin/env node
// Maintainer coverage harness; all rendering goes through the standard public Create runner.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  skyGolden,
  skyVariants,
  skyStressBusiness,
  skyGeometryCoverage,
} from './tests/fixtures/sky-compass-fixtures.mjs'
import { DESIGN } from '../pptx-nova/assets/deckkits/sky-compass/sky-compass.kit.mjs'
const out = path.resolve(process.argv[2] ?? '.tmp/deckkit-sky-compass/verification'),
  selected = (process.argv[3] ?? 'golden,variants,stress-business').split(',')
const cases = { golden: skyGolden, variants: skyVariants, 'stress-business': skyStressBusiness }
if (selected.some((k) => !cases[k])) throw Error('Unknown case')
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(
  path.join(out, 'geometry-coverage.json'),
  JSON.stringify(skyGeometryCoverage(), null, 2) + '\n',
)
for (const name of selected) {
  const content = cases[name](),
    dir = path.join(out, name)
  fs.mkdirSync(dir)
  const write = (name, x) =>
    fs.writeFileSync(path.join(dir, name), JSON.stringify(x, null, 2) + '\n')
  const slides = content.slides.map((s, index) => ({
    index,
    slideType: s.type,
    title: s.data.title,
    claimTitle: s.data.title,
    purpose: 'Verify reusable design language using synthetic data',
    proofObject: {
      kind: s.data.points
        ? 'numeric-evidence'
        : s.data.headers || s.data.rows
          ? 'comparison-table'
          : 'workflow',
      proves: s.data.verdict,
    },
    source: s.data.source,
    rhythm: DESIGN.sky.families[s.type].role,
    layoutIntent: s.layoutId ?? 'auto',
    visualDensity: s.data.rows ? 'high' : 'medium',
    ...(s.data.headers || s.data.rows
      ? {
          table: {
            source: s.data.source,
            role: 'Auditable register',
            unit: s.data.unit ?? 'content-defined',
            period: s.data.period,
          },
        }
      : {}),
  }))
  write('content.json', content)
  write('outline.json', { purpose: 'Synthetic design-language verification', slides })
  write('deck_lock.json', {
    schemaVersion: 'pptx-nova-deck-lock/v1',
    mode: 'create',
    canvas: DESIGN.canvas,
    colors: DESIGN.colors,
    typography: DESIGN.fonts,
    deckkit: { id: 'sky-compass' },
    deckProfile: { primary: 'general-business' },
    outline: { purpose: 'Synthetic verification' },
    assumptions: ['Every value and claim is synthetic validation content.'],
    slides,
  })
  const r = spawnSync(
    process.execPath,
    [
      'pptx-nova/scripts/pptx-nova-create-run.mjs',
      '--deckkit',
      'sky-compass',
      '--content',
      path.join(dir, 'content.json'),
      '--lock',
      path.join(dir, 'deck_lock.json'),
      '--output',
      path.join(dir, 'reviewed.pptx'),
      '--run-dir',
      path.join(dir, 'run'),
      '--progress',
      'off',
      '--json',
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
  fs.writeFileSync(path.join(dir, 'result.json'), r.stdout)
  fs.writeFileSync(path.join(dir, 'stderr.log'), r.stderr)
  const result = JSON.parse(r.stdout)
  console.log(JSON.stringify({ name, status: result.status, error: result.error ?? null }))
  if (r.status !== 0) process.exitCode = 1
}
