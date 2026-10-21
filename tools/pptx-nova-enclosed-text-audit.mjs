#!/usr/bin/env node
// Maintainer-only rendered diagnostic. ImageMagick is optional; never a user runtime dependency.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const argv = process.argv.slice(2)
if (argv.includes('--help')) {
  console.log(
    'Usage: node tools/pptx-nova-enclosed-text-audit.mjs --patch <patch.json> --previews <canonical/candidate> --out <new-report.json>',
  )
  process.exit(0)
}
const args = {}
for (let i = 0; i < argv.length; i += 2) {
  if (!['--patch', '--previews', '--out'].includes(argv[i]) || !argv[i + 1])
    throw Error('Expected --patch, --previews and --out')
  args[argv[i].slice(2)] = resolve(argv[i + 1])
}
if (!args.patch || !args.previews || !args.out) throw Error('All three paths are required')
if (existsSync(args.out)) throw Error('Output exists; preserve prior evidence')
const patch = JSON.parse(readFileSync(args.patch, 'utf8'))
const run = (...options) => {
  const r = spawnSync('magick', options, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 })
  if (r.error || r.status !== 0) throw Error(r.error?.message ?? r.stderr)
  return r.stdout.trim()
}
try {
  run('-version')
} catch (error) {
  writeFileSync(
    args.out,
    JSON.stringify({ status: 'unavailable', reason: error.message, passed: false }, null, 2) + '\n',
  )
  process.exitCode = 2
  console.log('Rendered enclosed-text audit unavailable: ImageMagick is required')
  process.exit(2)
}
const frame = (o) => [o.x, o.y, o.w, o.h].map(parseFloat)
const withinOverlap = (a, b) => {
  const w = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]))
  const h = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]))
  return (w * h) / (b[2] * b[3])
}
const textOps = patch.ops.filter(
  (o) => o.op === 'set-text-frame' && typeof o.text === 'string' && o.text.trim(),
)
const textBoxes = patch.ops.filter((o) => o.op === 'add-text-box')
const checks = []
for (const owner of patch.ops.filter(
  (o) => o.op === 'add-shape' && ['oval', 'rectangle'].includes(o.kind),
)) {
  const f = frame(owner)
  if (f[3] > 1.1 || f[2] > 6) continue
  const owned = textOps.filter((o) => o.slide === owner.slide && o.shape?.name === owner.name)
  const adjacent = owned.length
    ? []
    : textBoxes.filter((o) => o.slide === owner.slide && withinOverlap(f, frame(o)) >= 0.35)
  const targets = owned.length
    ? owned
    : adjacent.flatMap((o) =>
        textOps.filter((t) => t.slide === o.slide && t.shape?.name === o.name),
      )
  if (!targets.length) continue
  const file = resolve(args.previews, `slide-${owner.slide + 1}.png`)
  const [width, height] = run('identify', '-format', '%w,%h', file).split(',').map(Number)
  const sx = width / 13.3333333333,
    sy = height / 7.5
  for (const target of targets) {
    const font =
      target.font ??
      patch.ops.find(
        (o) =>
          o.op === 'set-run' && o.slide === target.slide && o.shape?.name === target.shape?.name,
      )?.font
    if (!/^[A-F0-9]{6}$/i.test(font?.color ?? ''))
      throw Error(`Explicit text color required: ${target.shape?.name}`)
    const pad = 8,
      x = Math.max(0, Math.floor(f[0] * sx) - pad),
      y = Math.max(0, Math.floor(f[1] * sy) - pad)
    const w = Math.min(width - x, Math.ceil((f[0] + f[2]) * sx) + pad - x)
    const h = Math.min(height - y, Math.ceil((f[1] + f[3]) * sy) + pad - y)
    const raw = run(
      file,
      '-crop',
      `${w}x${h}+${x}+${y}`,
      '+repage',
      '-alpha',
      'off',
      '-fuzz',
      '8%',
      '-fill',
      'black',
      '+opaque',
      `#${font.color}`,
      '-fill',
      'white',
      '-opaque',
      `#${font.color}`,
      '-trim',
      '-format',
      '%w,%h,%X,%Y',
      'info:',
    )
    const [inkWidth, inkHeight, inkOffsetX, inkOffsetY] = raw.split(',').map(Number)
    const ink = [x + inkOffsetX, y + inkOffsetY, inkWidth, inkHeight],
      bounds = [f[0] * sx, f[1] * sy, f[2] * sx, f[3] * sy]
    const dx = (ink[0] + inkWidth / 2 - bounds[0] - bounds[2] / 2) / bounds[2]
    const dy = (ink[1] + inkHeight / 2 - bounds[1] - bounds[3] / 2) / bounds[3]
    const contained =
      inkWidth > 1 &&
      inkHeight > 1 &&
      ink[0] >= bounds[0] - 2 &&
      ink[1] >= bounds[1] - 2 &&
      ink[0] + inkWidth <= bounds[0] + bounds[2] + 2 &&
      ink[1] + inkHeight <= bounds[1] + bounds[3] + 2
    const centered = owner.kind !== 'oval' || (Math.abs(dx) <= 0.06 && Math.abs(dy) <= 0.06)
    checks.push({
      slide: owner.slide + 1,
      owner: owner.name,
      text: target.text,
      contained,
      centered,
      normalizedCenterOffset: { x: dx, y: dy },
      inkBoundsPx: ink,
      ownerBoundsPx: bounds,
      passed: contained && centered,
    })
  }
}
const report = {
  schemaVersion: 'pptx-nova-enclosed-text-audit/v1',
  passed: checks.length > 0 && checks.every((c) => c.passed),
  checks,
  coverage:
    'Rendered solid-color glyph bounds inside small native circles/rectangles, including independent overlapping text boxes; circle center tolerance 6%. Not a complete visual review, glyph recognition, general containment or optical-centering proof.',
}
writeFileSync(args.out, JSON.stringify(report, null, 2) + '\n')
console.log(
  JSON.stringify({
    passed: report.passed,
    checked: checks.length,
    failures: checks
      .filter((c) => !c.passed)
      .map((c) => ({
        slide: c.slide,
        owner: c.owner,
        contained: c.contained,
        centered: c.centered,
      })),
  }),
)
process.exitCode = report.passed ? 0 : 1
