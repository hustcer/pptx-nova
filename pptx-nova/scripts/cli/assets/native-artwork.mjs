#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs'
import {
  createNativeArtworkPatch,
  NATIVE_ARTWORK_KINDS,
} from '../../../assets/deckkits/shared/native-artwork.mjs'
import { writeJsonOutput } from '../../lib/runtime/output-files.mjs'
import { resolveFilesystemPath } from '../../lib/runtime/filesystem-paths.mjs'

const usage = `Usage: node <skill-root>/scripts/cli/assets/native-artwork.mjs --spec <file.json> --output <patch.json> [--overwrite]

Generate editable native xdoc operations for any DeckKit or manual authoring plan.
Spec: { slide, frame: [x,y,width,height] in inches, kind, palette, prefix? }
Kinds: ${NATIVE_ARTWORK_KINDS.join(', ')}
Palette: { surface, ink, accent, secondary } as six-digit RGB colors.
The patch adds artwork only: it does not add slides, remove holders, apply changes or authorize delivery.
Use a unique prefix per region and compose through the owning DeckKit/patch contract.
`
try {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    process.stdout.write(usage)
    process.exit(0)
  }
  let spec,
    output,
    overwrite = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--overwrite') {
      overwrite = true
      continue
    }
    if (!['--spec', '--output'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--'))
      throw Error(usage)
    if (args[i] === '--spec') spec = resolveFilesystemPath(args[++i])
    else output = resolveFilesystemPath(args[++i])
  }
  if (!spec || !output || spec === output)
    throw Error('Distinct --spec and --output paths are required')
  if (existsSync(output)) {
    const inputFile = statSync(spec, { bigint: true }),
      outputFile = statSync(output, { bigint: true })
    if (inputFile.dev === outputFile.dev && inputFile.ino === outputFile.ino)
      throw Error('Output must not alias the input spec')
  }
  const patch = createNativeArtworkPatch(JSON.parse(readFileSync(spec, 'utf8')))
  writeJsonOutput(output, patch, { overwrite })
  process.stdout.write(`Native artwork patch: ${output} (${patch.ops.length} operations)\n`)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
