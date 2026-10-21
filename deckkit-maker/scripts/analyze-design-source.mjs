#!/usr/bin/env node
// Maintainer helper for prose + image inputs. Never interprets prose as code or mutates sources.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
const usage =
  'Usage: node analyze-design-source.mjs --id <kit-id> --design <design.md> --image <reference.png|jpg> [--image <more>] --out <new-directory> [--panels <n>] [--crop]'
function dimensions(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: 'png' }
  if (bytes[0] !== 255 || bytes[1] !== 216)
    throw new Error(
      'Only PNG and JPEG metadata are supported; preserve other inputs for manual review',
    )
  for (let i = 2; i < bytes.length;) {
    if (bytes[i++] !== 255) continue
    let marker = bytes[i++]
    while (marker === 255) marker = bytes[i++]
    if (marker === 217 || marker === 218) break
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue
    const length = bytes.readUInt16BE(i)
    if (length < 2 || i + length > bytes.length) throw new Error('Invalid JPEG segment')
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker))
      return { height: bytes.readUInt16BE(i + 3), width: bytes.readUInt16BE(i + 5), format: 'jpeg' }
    i += length
  }
  throw new Error('JPEG dimensions unavailable')
}
try {
  const args = { images: [], panels: 1, crop: false },
    argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--help') {
      console.log(usage)
      process.exit(0)
    }
    if (flag === '--crop') {
      args.crop = true
      continue
    }
    if (
      !['--id', '--design', '--image', '--out', '--panels'].includes(flag) ||
      !argv[i + 1] ||
      argv[i + 1].startsWith('--')
    )
      throw new Error(`Unknown/incomplete argument ${flag}`)
    const v = argv[++i]
    if (flag === '--image') args.images.push(resolve(v))
    else args[flag.slice(2)] = flag === '--panels' ? Number(v) : v
  }
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args.id ?? '') ||
    !args.design ||
    !args.out ||
    !args.images.length
  )
    throw new Error(usage)
  if (!Number.isInteger(args.panels) || args.panels < 1 || args.panels > 100)
    throw new Error('--panels must be an integer from 1 to 100')
  if (args.images.length > 1 && args.panels !== 1)
    throw new Error(
      '--panels applies to one vertical composite; use separate runs for mixed composites',
    )
  const out = resolve(args.out)
  if (existsSync(out)) throw new Error('Output directory must be new; preserve prior evidence')
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
  const prose = readFileSync(resolve(args.design))
  if (!prose.toString('utf8').trim()) throw new Error('Design document is empty')
  const images = args.images.map((path) => {
    const bytes = readFileSync(path),
      d = dimensions(bytes)
    return {
      path,
      sha256: sha(bytes),
      ...d,
      orientationVerified: false,
      panels: Array.from({ length: args.panels }, (_, i) => ({
        index: i + 1,
        proposedCrop: {
          x: 0,
          y: Math.round((i * d.height) / args.panels),
          width: d.width,
          height:
            Math.round(((i + 1) * d.height) / args.panels) -
            Math.round((i * d.height) / args.panels),
        },
        aspectRatio: d.width / (d.height / args.panels),
        boundsStatus:
          args.panels === 1 ? 'whole-image' : 'equal-split-proposal-requires-visual-review',
      })),
    }
  })
  mkdirSync(out, { recursive: true })
  const manifest = {
    schemaVersion: 'deckkit-design-source/v1',
    deckkit: args.id,
    design: { path: resolve(args.design), sha256: sha(prose) },
    images,
    cropping: { requested: args.crop, produced: false },
    interpretation: {
      status: 'not-performed',
      required: [
        'visual anchor inventory',
        'source conflicts and precedence',
        'visual vs domain policy',
        'capacity and implementation decisions',
      ],
    },
  }
  if (args.crop) {
    const probe = spawnSync('magick', ['-version'], { encoding: 'utf8' })
    if (probe.status === 0) {
      for (const [i, im] of images.entries())
        for (const p of im.panels) {
          const b = p.proposedCrop,
            output = join(out, `source-${i + 1}-panel-${p.index}.png`)
          const r = spawnSync(
            'magick',
            [im.path, '-crop', `${b.width}x${b.height}+${b.x}+${b.y}`, '+repage', output],
            { encoding: 'utf8' },
          )
          if (r.status !== 0) throw new Error(`Crop failed: ${r.stderr}`)
          p.preview = output
        }
      manifest.cropping.produced = true
    } else
      manifest.cropping.unavailable =
        'Optional ImageMagick is unavailable; inspect original references and proposed bounds manually'
  }
  writeFileSync(join(out, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify(manifest, null, 2))
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
}
