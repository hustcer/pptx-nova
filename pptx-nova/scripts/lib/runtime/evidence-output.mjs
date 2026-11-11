import {
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { resolveFilesystemPath } from './filesystem-paths.mjs'

function fileStat(path) {
  try {
    return statSync(path, { bigint: true })
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

const sameFile = (a, b) => a && b && a.dev === b.dev && a.ino === b.ino

function outputPath(value) {
  const path = resolveFilesystemPath(value)
  mkdirSync(dirname(path), { recursive: true })
  try {
    lstatSync(path)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return join(realpathSync.native(dirname(path)), basename(path))
  }
  // Resolve existing symlinks physically; dangling links fail rather than being
  // treated as absent destinations. Use this same path for checks and writes.
  return realpathSync.native(path)
}

/** Protect the source and publish complete evidence files on the same filesystem. */
export function prepareEvidenceOutputs(source, destinations, overwrite = false) {
  const input = realpathSync.native(resolveFilesystemPath(source))
  const sourceStat = fileStat(input)
  const outputs = Object.fromEntries(
    Object.entries(destinations)
      .filter(([, value]) => value)
      .map(([key, value]) => [key, outputPath(value)]),
  )
  function checkOutputs(destination) {
    const currentSourceStat = fileStat(input)
    const seen = []
    for (const path of Object.values(outputs)) {
      const info = fileStat(path)
      if (path === input || sameFile(info, sourceStat) || sameFile(info, currentSourceStat))
        throw new Error('Evidence outputs must not overwrite the input PPTX')
      if (seen.some((other) => path === other.path || sameFile(info, other.info)))
        throw new Error('JSON and resave outputs must differ')
      if (info && !info.isFile()) throw new Error(`Evidence output is not a file: ${path}`)
      seen.push({ path, info })
    }
    if (!overwrite)
      for (const { path, info } of seen)
        if (info && (!destination || path === destination))
          throw new Error(`Playback output already exists: ${path}`)
  }
  checkOutputs()
  return {
    input,
    publish(key, bytes) {
      const path = outputs[key]
      if (!path) throw new Error(`Evidence destination was not requested: ${key}`)
      const staging = mkdtempSync(join(dirname(path), '.pptx-evidence-'))
      try {
        const staged = join(staging, 'complete')
        writeFileSync(staged, bytes, { flag: 'wx' })
        checkOutputs(path)
        // Exclusive hard-link creation closes the preflight/write race. Explicit
        // overwrite replaces one directory entry without truncating its aliases.
        if (overwrite) renameSync(staged, path)
        else linkSync(staged, path)
      } finally {
        rmSync(staging, { recursive: true })
      }
      return path
    },
  }
}
